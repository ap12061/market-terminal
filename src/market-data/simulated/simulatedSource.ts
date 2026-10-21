import type { ProductId } from '@/domain'
import { createEmitter } from '@/shared/emitter'
import type { Channel, MarketDataSource, MarketEvent, SourceStatus } from '../types'
import { DEFAULT_SIMULATED_INSTRUMENTS, type SimulatedInstrument } from './instruments'
import { createMarketSimulator } from './simulator'

const HEARTBEAT_INTERVAL_MS = 1_000
/** Beyond this much lag (e.g. a backgrounded tab), the market jumps in one step. */
const MAX_CATCH_UP_MS = 5_000

export type SimulatedFault =
  /** The connection drops, as if the network failed. */
  | { type: 'disconnect' }
  /** The next book update is lost, so the sequence skips a number. */
  | { type: 'sequenceGap'; productId?: ProductId }
  /** The connection stays open but nothing arrives; buffered events then arrive in a burst. */
  | { type: 'stall'; durationMs: number }

export interface SimulatedMarketDataSource extends MarketDataSource {
  injectFault(fault: SimulatedFault): void
}

export interface SimulatedSourceOptions {
  seed?: number | string
  /** How often the market moves and events are delivered. */
  tickIntervalMs?: number
  connectLatencyMs?: number
  instruments?: readonly SimulatedInstrument[]
}

function channelOf(event: MarketEvent): Channel | undefined {
  switch (event.type) {
    case 'ticker':
      return 'ticker'
    case 'trade':
      return 'trades'
    case 'bookSnapshot':
    case 'bookUpdate':
      return 'book'
    default:
      return undefined
  }
}

function productOf(event: MarketEvent): ProductId | undefined {
  switch (event.type) {
    case 'ticker':
      return event.ticker.productId
    case 'trade':
      return event.trade.productId
    case 'bookSnapshot':
    case 'bookUpdate':
      return event.productId
    default:
      return undefined
  }
}

/**
 * A `MarketDataSource` backed by the deterministic market simulator. It
 * behaves like a real WebSocket feed (connection latency, subscriptions that
 * are lost on disconnect, snapshots on subscribe, heartbeats) and can inject
 * failures, so resilience code can be tested and demoed without a network.
 */
export function createSimulatedSource({
  seed = 'market-terminal',
  tickIntervalMs = 100,
  connectLatencyMs = 50,
  instruments = DEFAULT_SIMULATED_INSTRUMENTS,
}: SimulatedSourceOptions = {}): SimulatedMarketDataSource {
  const simulator = createMarketSimulator({ seed, instruments, startTime: Date.now() })
  const events = createEmitter<MarketEvent>()
  const statuses = createEmitter<SourceStatus>()

  let status: SourceStatus = { state: 'closed', reason: 'Not connected', expected: true }
  let connectTimer: ReturnType<typeof setTimeout> | undefined
  let tickTimer: ReturnType<typeof setInterval> | undefined
  let nextHeartbeatAt = 0
  const subscriptions = new Map<ProductId, Set<Channel>>()
  /** Responses to subscribe calls, delivered at the start of the next tick. */
  let outbox: MarketEvent[] = []
  let stalledUntil: number | undefined
  let stallBuffer: MarketEvent[] = []
  const dropNextBookUpdate = new Set<ProductId>()

  function setStatus(next: SourceStatus) {
    status = next
    statuses.emit(next)
  }

  function isSubscribed(event: MarketEvent) {
    const productId = productOf(event)
    const channel = channelOf(event)
    if (!productId || !channel) return true
    return subscriptions.get(productId)?.has(channel) ?? false
  }

  function tick() {
    const now = Date.now()
    const batch = outbox
    outbox = []

    const collect = (generated: MarketEvent[]) => {
      for (const event of generated) {
        if (!isSubscribed(event)) continue
        if (event.type === 'bookUpdate' && dropNextBookUpdate.delete(event.productId)) continue
        batch.push(event)
      }
      while (simulator.time >= nextHeartbeatAt) {
        batch.push({ type: 'heartbeat', time: nextHeartbeatAt })
        nextHeartbeatAt += HEARTBEAT_INTERVAL_MS
      }
    }

    // Advance in fixed steps, so the stream depends on the seed and the
    // timeline, not on timer jitter.
    const lag = now - simulator.time
    if (lag > MAX_CATCH_UP_MS) collect(simulator.advance(lag - MAX_CATCH_UP_MS))
    while (now - simulator.time >= tickIntervalMs) collect(simulator.advance(tickIntervalMs))

    if (stalledUntil !== undefined) {
      if (now < stalledUntil) {
        stallBuffer.push(...batch)
        return
      }
      batch.unshift(...stallBuffer)
      stallBuffer = []
      stalledUntil = undefined
    }

    for (const event of batch) {
      events.emit(event)
      // A listener may have disconnected us; stop delivering stale events.
      if (status.state !== 'open') return
    }
  }

  function close(reason: string, expected: boolean) {
    clearTimeout(connectTimer)
    clearInterval(tickTimer)
    connectTimer = tickTimer = undefined
    subscriptions.clear()
    outbox = []
    stallBuffer = []
    stalledUntil = undefined
    dropNextBookUpdate.clear()
    setStatus({ state: 'closed', reason, expected })
  }

  function assertOpen() {
    if (status.state !== 'open') {
      throw new Error(`Cannot change subscriptions while the connection is ${status.state}`)
    }
  }

  return {
    id: 'simulated',
    getStatus: () => status,
    getInstruments: () => Promise.resolve(simulator.instruments),

    connect() {
      if (status.state !== 'closed') return
      setStatus({ state: 'connecting' })
      connectTimer = setTimeout(() => {
        connectTimer = undefined
        // The market kept moving while we were away; nobody saw those events.
        simulator.advance(Date.now() - simulator.time)
        nextHeartbeatAt = simulator.time + HEARTBEAT_INTERVAL_MS
        tickTimer = setInterval(tick, tickIntervalMs)
        setStatus({ state: 'open' })
      }, connectLatencyMs)
    },

    disconnect() {
      if (status.state === 'closed') return
      close('Disconnected by client', true)
    },

    subscribe(productIds, channels) {
      assertOpen()
      for (const productId of productIds) {
        if (!simulator.hasProduct(productId)) {
          outbox.push({ type: 'error', message: `Unknown product: ${productId}` })
          continue
        }
        const subscribed = subscriptions.get(productId) ?? new Set()
        subscriptions.set(productId, subscribed)
        for (const channel of channels) {
          if (subscribed.has(channel)) continue
          subscribed.add(channel)
          // Like real feeds, new subscriptions start with the current state.
          const snapshot = channel === 'book' ? simulator.bookSnapshot(productId) : undefined
          if (snapshot) outbox.push(snapshot)
          const ticker = channel === 'ticker' ? simulator.ticker(productId) : undefined
          if (ticker) outbox.push({ type: 'ticker', ticker })
        }
      }
    },

    unsubscribe(productIds, channels) {
      assertOpen()
      for (const productId of productIds) {
        const subscribed = subscriptions.get(productId)
        if (!subscribed) continue
        for (const channel of channels) subscribed.delete(channel)
        if (subscribed.size === 0) subscriptions.delete(productId)
      }
      // Drop queued responses for what is no longer subscribed.
      outbox = outbox.filter(isSubscribed)
    },

    onEvent: events.subscribe,
    onStatusChange: statuses.subscribe,

    injectFault(fault) {
      if (status.state !== 'open') return
      switch (fault.type) {
        case 'disconnect':
          close('Simulated connection loss', false)
          break
        case 'sequenceGap':
          for (const [productId, channels] of subscriptions) {
            if (channels.has('book') && (fault.productId ?? productId) === productId) {
              dropNextBookUpdate.add(productId)
            }
          }
          break
        case 'stall':
          stalledUntil = Date.now() + fault.durationMs
          break
      }
    },
  }
}
