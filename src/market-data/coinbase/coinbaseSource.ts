import type { Instrument, ProductId } from '@/domain'
import { createEmitter } from '@/shared/emitter'
import type { Channel, MarketDataSource, MarketEvent, SourceStatus } from '../types'
import { COINBASE_INSTRUMENTS } from './instruments'
import { errorMessage, SCHEMAS_BY_CHANNEL, type CoinbaseMessage } from './schemas'
import { createCoinbaseTranslator } from './translator'

export const COINBASE_WS_URL = 'wss://advanced-trade-ws.coinbase.com'

type CoinbaseChannel = 'ticker' | 'market_trades' | 'level2' | 'heartbeats'

const TO_COINBASE: Record<Channel, CoinbaseChannel> = {
  ticker: 'ticker',
  trades: 'market_trades',
  book: 'level2',
}

/** The subset of the browser WebSocket API we use; injectable for tests. */
export interface WebSocketLike {
  addEventListener(
    type: 'open' | 'message' | 'close',
    listener: (event: Event) => void,
    options?: { signal?: AbortSignal },
  ): void
  send(data: string): void
  close(code?: number, reason?: string): void
}

export interface CoinbaseSourceOptions {
  url?: string
  instruments?: readonly Instrument[]
  createWebSocket?: (url: string) => WebSocketLike
}

interface PendingRequest {
  action: 'subscribe' | 'unsubscribe'
  channel: CoinbaseChannel
  productIds: readonly ProductId[]
}

/**
 * Coinbase Advanced Trade's public market data feed, behind the
 * `MarketDataSource` interface. Market data channels need no API key.
 */
export function createCoinbaseSource({
  url = COINBASE_WS_URL,
  instruments = COINBASE_INSTRUMENTS,
  createWebSocket = (target) => new WebSocket(target),
}: CoinbaseSourceOptions = {}): MarketDataSource {
  const events = createEmitter<MarketEvent>()
  const statuses = createEmitter<SourceStatus>()
  const known = new Set<string>(instruments.map((instrument) => instrument.id))

  let status: SourceStatus = { state: 'closed', reason: 'Not connected', expected: true }
  let socket: WebSocketLike | undefined
  /** Detaches every listener of the current socket at once. */
  let listeners: AbortController | undefined
  let openTimer: ReturnType<typeof setTimeout> | undefined
  let translator = createCoinbaseTranslator(instruments)
  let lastSequence: number | undefined
  const subscriptions = new Map<ProductId, Set<Channel>>()
  /** Sent requests awaiting acknowledgement, in order: Coinbase acks each one. */
  let pending: PendingRequest[] = []
  /** Channels whose malformed messages were already reported on this connection. */
  const reportedMalformed = new Set<string>()

  function setStatus(next: SourceStatus) {
    status = next
    statuses.emit(next)
  }

  function emitError(message: string) {
    events.emit({ type: 'error', message })
  }

  function send(request: PendingRequest) {
    if (!socket) return
    pending.push(request)
    socket.send(
      JSON.stringify(
        request.channel === 'heartbeats'
          ? { type: request.action, channel: request.channel }
          : { type: request.action, channel: request.channel, product_ids: request.productIds },
      ),
    )
  }

  function teardown() {
    clearTimeout(openTimer)
    openTimer = undefined
    listeners?.abort()
    listeners = undefined
    socket = undefined
    subscriptions.clear()
    pending = []
    lastSequence = undefined
    reportedMalformed.clear()
    translator = createCoinbaseTranslator(instruments)
  }

  /**
   * Coinbase silently ignores unknown or delisted products, but its ack
   * lists everything actually subscribed, so compare it with the request.
   */
  function handleAck(acknowledged: Record<string, string[]>) {
    const request = pending.shift()
    if (request?.action !== 'subscribe') return
    const accepted = new Set(acknowledged[request.channel] ?? [])
    for (const productId of request.productIds) {
      if (accepted.has(productId)) continue
      emitError(`Coinbase rejected the ${request.channel} subscription for ${productId}`)
      for (const [channel, coinbaseChannel] of Object.entries(TO_COINBASE)) {
        if (coinbaseChannel === request.channel)
          subscriptions.get(productId)?.delete(channel as Channel)
      }
    }
  }

  /** Messages were lost: invalidate books, and resubscribe to get fresh snapshots. */
  function recoverFromGap() {
    const books = translator.invalidateBooks().filter((id) => subscriptions.get(id)?.has('book'))
    if (books.length === 0) return
    for (const id of books) translator.forgetBook(id)
    send({ action: 'unsubscribe', channel: 'level2', productIds: books })
    send({ action: 'subscribe', channel: 'level2', productIds: books })
  }

  function parse(raw: unknown): CoinbaseMessage | 'error' | undefined {
    let data: unknown
    try {
      data = JSON.parse(String(raw))
    } catch {
      return reportMalformed('unparseable')
    }
    const error = errorMessage.safeParse(data)
    if (error.success) {
      emitError(`Coinbase: ${error.data.message}`)
      return 'error'
    }
    const channel = (data as { channel?: unknown } | null)?.channel
    const schema =
      typeof channel === 'string' && Object.hasOwn(SCHEMAS_BY_CHANNEL, channel)
        ? SCHEMAS_BY_CHANNEL[channel as keyof typeof SCHEMAS_BY_CHANNEL]
        : undefined
    // Channels we don't use are ignored, not errors.
    if (!schema) return undefined
    const result = schema.safeParse(data)
    return result.success ? result.data : reportMalformed(String(channel))
  }

  function reportMalformed(kind: string): undefined {
    // Once per kind per connection: a format change upstream would otherwise
    // produce an error for every message.
    if (!reportedMalformed.has(kind)) {
      reportedMalformed.add(kind)
      emitError(`Ignored a malformed ${kind} message from Coinbase`)
    }
    return undefined
  }

  function handleMessage(raw: unknown) {
    const message = parse(raw)
    if (!message || message === 'error') return

    if (lastSequence !== undefined && message.sequence_num !== lastSequence + 1) recoverFromGap()
    lastSequence = message.sequence_num

    if (message.channel === 'subscriptions') {
      handleAck(message.events.at(-1)?.subscriptions ?? {})
      return
    }
    for (const event of translator.translate(message)) {
      // Drop late messages for channels we've already unsubscribed from.
      if (event.type === 'bookSnapshot' || event.type === 'bookUpdate') {
        if (!subscriptions.get(event.productId)?.has('book')) continue
      }
      events.emit(event)
    }
  }

  function assertOpen() {
    if (status.state !== 'open') {
      throw new Error(`Cannot change subscriptions while the connection is ${status.state}`)
    }
  }

  function changeSubscriptions(
    action: 'subscribe' | 'unsubscribe',
    productIds: readonly ProductId[],
    channels: readonly Channel[],
  ) {
    assertOpen()
    for (const channel of channels) {
      const changed = productIds.filter((productId) => {
        if (!known.has(productId)) {
          if (action === 'subscribe')
            queueMicrotask(() => emitError(`Unknown product: ${productId}`))
          return false
        }
        const current = subscriptions.get(productId) ?? new Set<Channel>()
        if ((action === 'subscribe') === current.has(channel)) return false
        if (action === 'subscribe') current.add(channel)
        else current.delete(channel)
        subscriptions.set(productId, current)
        if (action === 'unsubscribe' && channel === 'book') translator.forgetBook(productId)
        return true
      })
      if (changed.length > 0) send({ action, channel: TO_COINBASE[channel], productIds: changed })
    }
  }

  function openSocket() {
    openTimer = undefined
    const ws = createWebSocket(url)
    const controller = new AbortController()
    const options = { signal: controller.signal }
    socket = ws
    listeners = controller

    ws.addEventListener(
      'open',
      () => {
        setStatus({ state: 'open' })
        // Heartbeats keep quiet channels alive and feed silence detection.
        send({ action: 'subscribe', channel: 'heartbeats', productIds: [] })
      },
      options,
    )
    ws.addEventListener('message', (event) => handleMessage((event as MessageEvent).data), options)
    // A failed connection or an error is always followed by a close event.
    ws.addEventListener(
      'close',
      (event) => {
        const { code, reason } = event as CloseEvent
        teardown()
        const detail = reason ? `: ${reason}` : ''
        setStatus({
          state: 'closed',
          reason: `Connection closed (${code}${detail})`,
          expected: false,
        })
      },
      options,
    )
  }

  return {
    id: 'coinbase',
    getStatus: () => status,
    getInstruments: () => Promise.resolve(instruments),

    connect() {
      if (status.state !== 'closed') return
      setStatus({ state: 'connecting' })
      // Opening the socket one tick later means a connect that's cancelled
      // straight away (React StrictMode mounts, unmounts and remounts) never
      // opens one, avoiding a wasted handshake and a console warning.
      openTimer = setTimeout(openSocket, 0)
    },

    disconnect() {
      if (status.state === 'closed') return
      const ws = socket
      teardown()
      ws?.close(1000, 'Client disconnect')
      setStatus({ state: 'closed', reason: 'Disconnected by client', expected: true })
    },

    subscribe: (productIds, channels) => changeSubscriptions('subscribe', productIds, channels),
    unsubscribe: (productIds, channels) => changeSubscriptions('unsubscribe', productIds, channels),
    onEvent: events.subscribe,
    onStatusChange: statuses.subscribe,
  }
}
