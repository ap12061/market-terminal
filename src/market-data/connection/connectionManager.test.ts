import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BTC, ETH, createFakeSource, makeTicker } from '@/test/fakeMarketDataSource'
import { createSimulatedSource } from '../simulated/simulatedSource'
import type { MarketEvent } from '../types'
import {
  createConnectionManager,
  type ConnectionManagerOptions,
  type ConnectionState,
} from './connectionManager'

const START = Date.UTC(2026, 0, 1)
/** Makes every backoff delay its maximum, so timings are exact. */
const MAX_JITTER = () => 0.999_999
const flushMicrotasks = () => Promise.resolve()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

function setup(options: Partial<ConnectionManagerOptions> = {}) {
  const fake = createFakeSource()
  const manager = createConnectionManager({ source: fake.source, random: MAX_JITTER, ...options })
  const states: ConnectionState[] = []
  const events: MarketEvent[] = []
  manager.onStateChange((state) => states.push(state))
  manager.onEvent((event) => events.push(event))
  return { fake, manager, states, events }
}

function setupOpen(options: Partial<ConnectionManagerOptions> = {}) {
  const context = setup(options)
  context.manager.start()
  context.fake.open()
  return context
}

describe('connection lifecycle', () => {
  it('connects on start and reports each state', () => {
    const { fake, manager, states } = setup()
    manager.start()
    manager.start()
    fake.open()

    expect(fake.connectCount).toBe(1)
    expect(states).toEqual([{ status: 'connecting', attempt: 0 }, { status: 'open' }])
  })

  it('disconnects on stop and stays down', () => {
    const { fake, manager } = setupOpen()
    manager.stop()
    vi.advanceTimersByTime(60_000)

    expect(manager.getState()).toEqual({ status: 'idle' })
    expect(fake.source.getStatus().state).toBe('closed')
    expect(fake.connectCount).toBe(1)
  })

  it('can be restarted after stopping', () => {
    const { fake, manager } = setupOpen()
    manager.stop()
    manager.start()
    fake.open()

    expect(manager.getState()).toEqual({ status: 'open' })
  })

  it('only forwards events while connected', () => {
    const { fake, manager, events } = setupOpen()
    const event: MarketEvent = { type: 'heartbeat', time: 1 }
    fake.emit(event)
    manager.stop()
    fake.emit(event)

    expect(events).toEqual([event])
  })
})

describe('subscriptions', () => {
  it('sends subscriptions made before connecting once open, grouped by channel', () => {
    const { fake, manager } = setup()
    manager.subscribe(BTC, 'ticker')
    manager.subscribe(ETH, 'ticker')
    manager.subscribe(BTC, 'book')
    manager.start()
    fake.open()

    expect(fake.calls).toEqual([
      { action: 'subscribe', productIds: [BTC, ETH], channels: ['ticker'] },
      { action: 'subscribe', productIds: [BTC], channels: ['book'] },
    ])
  })

  it('batches subscriptions made in the same tick into one call', async () => {
    const { fake, manager } = setupOpen()
    manager.subscribe(BTC, 'trades')
    manager.subscribe(ETH, 'trades')
    expect(fake.calls).toEqual([])

    await flushMicrotasks()
    expect(fake.calls).toEqual([
      { action: 'subscribe', productIds: [BTC, ETH], channels: ['trades'] },
    ])
  })

  it('reference-counts: the feed subscription lasts until the last subscriber leaves', async () => {
    const { fake, manager } = setupOpen()
    const first = manager.subscribe(BTC, 'ticker')
    const second = manager.subscribe(BTC, 'ticker')
    await flushMicrotasks()

    first()
    first()
    await flushMicrotasks()
    expect(fake.calls).toHaveLength(1)

    second()
    await flushMicrotasks()
    expect(fake.calls).toEqual([
      { action: 'subscribe', productIds: [BTC], channels: ['ticker'] },
      { action: 'unsubscribe', productIds: [BTC], channels: ['ticker'] },
    ])
  })

  it('sends nothing when a subscription is undone in the same tick (React StrictMode)', async () => {
    const { fake, manager } = setupOpen()
    const unsubscribe = manager.subscribe(BTC, 'ticker')
    unsubscribe()
    manager.subscribe(ETH, 'book')()
    await flushMicrotasks()

    expect(fake.calls).toEqual([])
  })

  it('restores current subscriptions after a reconnect', async () => {
    const { fake, manager } = setupOpen()
    manager.subscribe(BTC, 'ticker')
    manager.subscribe(ETH, 'ticker')()
    await flushMicrotasks()
    fake.calls.length = 0

    fake.drop()
    vi.advanceTimersByTime(500)
    fake.open()

    expect(fake.calls).toEqual([{ action: 'subscribe', productIds: [BTC], channels: ['ticker'] }])
  })
})

describe('reconnecting', () => {
  it('retries with exponential backoff while the connection keeps failing', () => {
    const { fake, manager, states } = setupOpen()
    const delays: number[] = []

    for (let i = 0; i < 4; i++) {
      fake.drop('Network error')
      const state = manager.getState()
      if (state.status !== 'reconnecting') throw new Error(`Unexpected state ${state.status}`)
      delays.push(state.retryAt - Date.now())
      vi.advanceTimersByTime(state.retryAt - Date.now())
      fake.open()
    }

    expect(delays).toEqual([500, 1_000, 2_000, 4_000])
    expect(fake.connectCount).toBe(5)
    expect(states).toContainEqual({
      status: 'reconnecting',
      attempt: 1,
      retryAt: START + 500,
      reason: 'Network error',
    })
  })

  it('resets the backoff once a connection has stayed up', () => {
    const { fake, manager } = setupOpen()
    fake.drop()
    vi.advanceTimersByTime(500)
    fake.open()
    vi.advanceTimersByTime(10_000)
    // Keep the connection from being considered silent meanwhile.
    fake.drop()

    expect(manager.getState()).toMatchObject({ status: 'reconnecting', attempt: 1 })
  })

  it('abandons a connection attempt that takes too long', () => {
    const { fake, manager } = setup({ connectTimeoutMs: 5_000 })
    manager.start()
    vi.advanceTimersByTime(5_000)

    expect(manager.getState()).toMatchObject({
      status: 'reconnecting',
      attempt: 1,
      reason: 'Connection timed out after 5s',
    })
    vi.advanceTimersByTime(500)
    expect(fake.connectCount).toBe(2)
  })

  it('ignores a repeated close while a retry is already scheduled', () => {
    const { fake, manager } = setupOpen()
    fake.drop()
    fake.drop()

    expect(manager.getState()).toMatchObject({ status: 'reconnecting', attempt: 1 })
  })

  it('cancels a scheduled retry when stopped', () => {
    const { fake, manager } = setupOpen()
    fake.drop()
    manager.stop()
    vi.advanceTimersByTime(60_000)

    expect(fake.connectCount).toBe(1)
    expect(manager.getState()).toEqual({ status: 'idle' })
  })
})

describe('silence detection', () => {
  it('reports a silent connection as stale, and recovers when data arrives', () => {
    const { fake, manager } = setupOpen()
    vi.advanceTimersByTime(2_500)
    expect(manager.getState()).toEqual({ status: 'open' })

    vi.advanceTimersByTime(500)
    expect(manager.getState()).toEqual({ status: 'stale', lastMessageAt: START })

    fake.emit({ type: 'ticker', ticker: makeTicker(BTC, '101.00') })
    expect(manager.getState()).toEqual({ status: 'open' })
  })

  it('stays open while heartbeats keep arriving', () => {
    const { fake, manager } = setupOpen()
    for (let i = 1; i <= 30; i++) {
      vi.advanceTimersByTime(1_000)
      fake.emit({ type: 'heartbeat', time: Date.now() })
    }

    expect(manager.getState()).toEqual({ status: 'open' })
  })

  it('replaces a connection that stays silent for too long', () => {
    const { fake, manager } = setupOpen()
    vi.advanceTimersByTime(10_000)

    expect(manager.getState()).toMatchObject({
      status: 'reconnecting',
      reason: 'No data received for 10s',
    })
    vi.advanceTimersByTime(500)
    expect(fake.connectCount).toBe(2)
  })
})

const isBtcTicker = (event: MarketEvent) =>
  event.type === 'ticker' && event.ticker.productId === BTC

function setupSimulated() {
  const source = createSimulatedSource({ seed: 'manager' })
  const manager = createConnectionManager({ source, random: MAX_JITTER })
  const events: MarketEvent[] = []
  manager.onEvent((event) => events.push(event))
  manager.subscribe(BTC, 'ticker')
  manager.start()
  vi.advanceTimersByTime(1_000)
  return { source, manager, events }
}

function tickersDuring(events: MarketEvent[], run: () => void) {
  events.length = 0
  run()
  return events.filter(isBtcTicker).length
}

describe('with the simulated source', () => {
  it('recovers from a dropped connection and resubscribes', () => {
    const { source, manager, events } = setupSimulated()
    source.injectFault({ type: 'disconnect' })
    expect(manager.getState().status).toBe('reconnecting')

    const tickers = tickersDuring(events, () => vi.advanceTimersByTime(5_000))
    expect(manager.getState()).toEqual({ status: 'open' })
    expect(tickers).toBeGreaterThan(0)
  })

  it('rides out a short stall without reconnecting', () => {
    const { source, manager, events } = setupSimulated()
    source.injectFault({ type: 'stall', durationMs: 5_000 })
    vi.advanceTimersByTime(4_000)
    expect(manager.getState().status).toBe('stale')

    const tickers = tickersDuring(events, () => vi.advanceTimersByTime(2_000))
    expect(manager.getState()).toEqual({ status: 'open' })
    expect(tickers).toBeGreaterThan(0)
  })

  it('replaces a connection that stalls for too long, then resumes', () => {
    const { source, manager, events } = setupSimulated()
    source.injectFault({ type: 'stall', durationMs: 60_000 })
    // The watchdog runs every 500ms, so it notices up to one interval late.
    vi.advanceTimersByTime(10_000 + 500)
    expect(manager.getState()).toMatchObject({ status: 'reconnecting' })

    const tickers = tickersDuring(events, () => vi.advanceTimersByTime(5_000))
    expect(manager.getState()).toEqual({ status: 'open' })
    expect(tickers).toBeGreaterThan(0)
  })
})
