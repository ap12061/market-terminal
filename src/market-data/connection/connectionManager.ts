import type { ProductId, Timestamp } from '@/domain'
import { createEmitter } from '@/shared/emitter'
import type { Channel, MarketDataSource, MarketEvent, SourceStatus, Unsubscribe } from '../types'
import { backoffDelay, type BackoffOptions } from './backoff'

export type ConnectionState =
  | { status: 'idle' }
  /** `attempt` is 0 for the first connection, then counts retries. */
  | { status: 'connecting'; attempt: number }
  | { status: 'open' }
  /** Connected, but nothing (not even a heartbeat) has arrived for a while. */
  | { status: 'stale'; lastMessageAt: Timestamp }
  | { status: 'reconnecting'; attempt: number; retryAt: Timestamp; reason: string }

export interface ConnectionManagerOptions {
  source: MarketDataSource
  backoff?: BackoffOptions
  /** Silence after which the connection is reported as stale. */
  staleAfterMs?: number
  /** Silence after which the connection is assumed dead and replaced. */
  restartAfterMs?: number
  /** How long a connection must stay up before the backoff resets. */
  stableAfterMs?: number
  /** How long a connection attempt may take before it's abandoned. */
  connectTimeoutMs?: number
  /** How often to check for silence. */
  watchdogIntervalMs?: number
  random?: () => number
}

export interface ConnectionManager {
  getState(): ConnectionState
  onStateChange(listener: (state: ConnectionState) => void): Unsubscribe
  onEvent(listener: (event: MarketEvent) => void): Unsubscribe
  /** Connects, and keeps reconnecting until `stop` is called. */
  start(): void
  stop(): void
  /**
   * Declares interest in a product's channel. Interest is reference-counted
   * and survives reconnects; the feed subscription is dropped once every
   * caller has unsubscribed.
   */
  subscribe(productId: ProductId, channel: Channel): Unsubscribe
}

const CHANNELS: readonly Channel[] = ['ticker', 'trades', 'book']

type SubscriptionKey = `${ProductId}|${Channel}`

function toKey(productId: ProductId, channel: Channel): SubscriptionKey {
  return `${productId}|${channel}`
}

function fromKey(key: SubscriptionKey): [ProductId, Channel] {
  const separator = key.lastIndexOf('|')
  return [key.slice(0, separator) as ProductId, key.slice(separator + 1) as Channel]
}

/**
 * Keeps a `MarketDataSource` connected: reconnects with backoff when it
 * drops, detects silent (half-open) connections, and restores subscriptions
 * after every reconnect. Consumers only declare what they want to receive.
 */
export function createConnectionManager({
  source,
  backoff = { initialDelayMs: 500, maxDelayMs: 30_000 },
  staleAfterMs = 3_000,
  restartAfterMs = 10_000,
  stableAfterMs = 10_000,
  connectTimeoutMs = 10_000,
  watchdogIntervalMs = 500,
  random = Math.random,
}: ConnectionManagerOptions): ConnectionManager {
  const states = createEmitter<ConnectionState>()
  const events = createEmitter<MarketEvent>()

  let state: ConnectionState = { status: 'idle' }
  let attempt = 0
  let lastMessageAt = 0
  /** Why we're closing the source ourselves, so its close event is interpreted correctly. */
  let closeIntent: { type: 'stop' } | { type: 'restart'; reason: string } | undefined

  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let connectTimer: ReturnType<typeof setTimeout> | undefined
  let stableTimer: ReturnType<typeof setTimeout> | undefined
  let watchdogTimer: ReturnType<typeof setInterval> | undefined

  const refCounts = new Map<SubscriptionKey, number>()
  /** Net subscription changes since the last flush; +1 subscribe, -1 unsubscribe. */
  const pendingChanges = new Map<SubscriptionKey, 1 | -1>()
  let flushQueued = false

  const isConnected = () => state.status === 'open' || state.status === 'stale'

  function setState(next: ConnectionState) {
    state = next
    states.emit(next)
  }

  function clearTimers() {
    clearTimeout(retryTimer)
    clearTimeout(connectTimer)
    clearTimeout(stableTimer)
    clearInterval(watchdogTimer)
    retryTimer = connectTimer = stableTimer = watchdogTimer = undefined
  }

  /** Closes the source and reconnects once it reports closed. */
  function restart(reason: string) {
    clearTimers()
    closeIntent = { type: 'restart', reason }
    source.disconnect()
  }

  function connect() {
    setState({ status: 'connecting', attempt })
    connectTimer = setTimeout(
      () => restart(`Connection timed out after ${connectTimeoutMs / 1000}s`),
      connectTimeoutMs,
    )
    source.connect()
  }

  function scheduleReconnect(reason: string) {
    clearTimers()
    attempt += 1
    const delay = backoffDelay(attempt, backoff, random)
    setState({ status: 'reconnecting', attempt, retryAt: Date.now() + delay, reason })
    retryTimer = setTimeout(connect, delay)
  }

  /** Sends subscriptions grouped by channel, one call per channel. */
  function sendToSource(keys: Iterable<SubscriptionKey>, action: 'subscribe' | 'unsubscribe') {
    const byChannel = new Map<Channel, ProductId[]>()
    for (const key of keys) {
      const [productId, channel] = fromKey(key)
      byChannel.set(channel, [...(byChannel.get(channel) ?? []), productId])
    }
    for (const channel of CHANNELS) {
      const productIds = byChannel.get(channel)
      if (productIds) source[action](productIds, [channel])
    }
  }

  function flushSubscriptions() {
    flushQueued = false
    if (!isConnected()) {
      // Nothing to send now; everything still wanted is restored on open.
      pendingChanges.clear()
      return
    }
    const added = [...pendingChanges].filter(([, change]) => change === 1).map(([key]) => key)
    const removed = [...pendingChanges].filter(([, change]) => change === -1).map(([key]) => key)
    pendingChanges.clear()
    sendToSource(added, 'subscribe')
    sendToSource(removed, 'unsubscribe')
  }

  function queueChange(key: SubscriptionKey, change: 1 | -1) {
    // Subscribing then unsubscribing in the same tick (React StrictMode's
    // mount → unmount → mount, or a quick re-render) cancels out entirely.
    if (pendingChanges.get(key) === -change) pendingChanges.delete(key)
    else pendingChanges.set(key, change)
    if (!flushQueued) {
      flushQueued = true
      queueMicrotask(flushSubscriptions)
    }
  }

  function handleOpen() {
    clearTimeout(connectTimer)
    lastMessageAt = Date.now()
    setState({ status: 'open' })
    pendingChanges.clear()
    sendToSource(refCounts.keys(), 'subscribe')

    // Only a connection that stays up earns a reset of the backoff; one that
    // drops straight after opening keeps backing off.
    stableTimer = setTimeout(() => {
      attempt = 0
    }, stableAfterMs)

    watchdogTimer = setInterval(() => {
      const silentFor = Date.now() - lastMessageAt
      if (silentFor >= restartAfterMs) {
        restart(`No data received for ${restartAfterMs / 1000}s`)
      } else if (silentFor >= staleAfterMs && state.status === 'open') {
        setState({ status: 'stale', lastMessageAt })
      }
    }, watchdogIntervalMs)
  }

  function handleClose(status: Extract<SourceStatus, { state: 'closed' }>) {
    const intent = closeIntent
    closeIntent = undefined
    // Already handled: we stopped on purpose, or a retry is already scheduled.
    if (intent?.type === 'stop' || state.status === 'idle' || state.status === 'reconnecting') {
      return
    }
    scheduleReconnect(intent?.type === 'restart' ? intent.reason : status.reason)
  }

  source.onStatusChange((status) => {
    if (status.state === 'open') handleOpen()
    else if (status.state === 'closed') handleClose(status)
  })

  source.onEvent((event) => {
    if (!isConnected()) return
    lastMessageAt = Date.now()
    if (state.status === 'stale') setState({ status: 'open' })
    events.emit(event)
  })

  return {
    getState: () => state,
    onStateChange: states.subscribe,
    onEvent: events.subscribe,

    start() {
      if (state.status !== 'idle') return
      attempt = 0
      connect()
    },

    stop() {
      if (state.status === 'idle') return
      clearTimers()
      pendingChanges.clear()
      setState({ status: 'idle' })
      closeIntent = { type: 'stop' }
      source.disconnect()
      // The source may already have been closed and never report it.
      closeIntent = undefined
    },

    subscribe(productId, channel) {
      const key = toKey(productId, channel)
      const count = refCounts.get(key) ?? 0
      refCounts.set(key, count + 1)
      if (count === 0) queueChange(key, 1)

      let active = true
      return () => {
        if (!active) return
        active = false
        const remaining = (refCounts.get(key) ?? 1) - 1
        if (remaining > 0) {
          refCounts.set(key, remaining)
        } else {
          refCounts.delete(key)
          queueChange(key, -1)
        }
      }
    },
  }
}
