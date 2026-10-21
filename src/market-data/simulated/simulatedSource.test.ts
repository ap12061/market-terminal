import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseProductId } from '@/domain'
import type { BookUpdateEvent, MarketEvent, SourceStatus } from '../types'
import { createSimulatedSource, type SimulatedSourceOptions } from './simulatedSource'

const START = Date.UTC(2026, 0, 1)
const LATENCY = 50
const BTC = parseProductId('BTC-USD')
const ETH = parseProductId('ETH-USD')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

function createConnectedSource(options: SimulatedSourceOptions = {}) {
  const source = createSimulatedSource({ seed: 'test', connectLatencyMs: LATENCY, ...options })
  const events: MarketEvent[] = []
  const statuses: SourceStatus[] = []
  source.onEvent((event) => events.push(event))
  source.onStatusChange((status) => statuses.push(status))
  source.connect()
  vi.advanceTimersByTime(LATENCY)
  return { source, events, statuses }
}

const ofType = <T extends MarketEvent['type']>(events: MarketEvent[], type: T) =>
  events.filter((event): event is Extract<MarketEvent, { type: T }> => event.type === type)

describe('createSimulatedSource', () => {
  it('connects after a short latency', () => {
    const { source, statuses } = createConnectedSource()

    expect(statuses).toEqual([{ state: 'connecting' }, { state: 'open' }])
    expect(source.getStatus()).toEqual({ state: 'open' })
  })

  it('lists its instruments', async () => {
    const instruments = await createSimulatedSource().getInstruments()

    expect(instruments.map((instrument) => instrument.id)).toEqual([
      'BTC-USD',
      'ETH-USD',
      'SOL-USD',
      'XRP-USD',
      'DOGE-USD',
    ])
  })

  it('refuses subscriptions until the connection is open', () => {
    const source = createSimulatedSource()

    expect(() => source.subscribe([BTC], ['ticker'])).toThrow(/closed/)
    source.connect()
    expect(() => source.subscribe([BTC], ['ticker'])).toThrow(/connecting/)
  })

  it('sends a book snapshot, then consecutive updates, for subscribed products only', () => {
    const { source, events } = createConnectedSource()
    source.subscribe([BTC], ['book'])
    vi.advanceTimersByTime(2_000)

    const [snapshot, ...rest] = events.filter((event) => event.type !== 'heartbeat')
    expect(snapshot).toMatchObject({ type: 'bookSnapshot', productId: BTC })
    expect(rest.length).toBeGreaterThan(10)
    expect(rest.every((event) => event.type === 'bookUpdate' && event.productId === BTC)).toBe(true)
    const sequences = [snapshot, ...rest].map((event) => (event as BookUpdateEvent).sequence)
    expect(sequences).toEqual(sequences.map((_, i) => (sequences[0] ?? 0) + i))
  })

  it('sends the current ticker on subscribe, then one per trade', () => {
    const { source, events } = createConnectedSource()
    source.subscribe([ETH], ['ticker'])
    vi.advanceTimersByTime(1)
    expect(ofType(events, 'ticker')).toHaveLength(0)

    vi.advanceTimersByTime(100)
    expect(ofType(events, 'ticker')[0]?.ticker.productId).toBe(ETH)

    vi.advanceTimersByTime(3_000)
    expect(ofType(events, 'ticker').length).toBeGreaterThan(3)
    expect(ofType(events, 'trade')).toHaveLength(0)
  })

  it('sends a heartbeat every second, even without subscriptions', () => {
    const { events } = createConnectedSource()
    vi.advanceTimersByTime(3_000)

    const openedAt = START + LATENCY
    expect(ofType(events, 'heartbeat').map((event) => event.time)).toEqual([
      openedAt + 1_000,
      openedAt + 2_000,
      openedAt + 3_000,
    ])
  })

  it('stops sending events for a channel after unsubscribing', () => {
    const { source, events } = createConnectedSource()
    source.subscribe([BTC, ETH], ['trades', 'ticker'])
    vi.advanceTimersByTime(2_000)
    source.unsubscribe([BTC], ['trades', 'ticker'])
    source.unsubscribe([ETH], ['ticker'])
    events.length = 0
    vi.advanceTimersByTime(3_000)

    const productEvents = events.filter((event) => event.type !== 'heartbeat')
    expect(productEvents.length).toBeGreaterThan(0)
    expect(
      productEvents.every((event) => event.type === 'trade' && event.trade.productId === ETH),
    ).toBe(true)
  })

  it('reports unknown products as an error event', () => {
    const { source, events } = createConnectedSource()
    source.subscribe([parseProductId('ABC-USD')], ['ticker'])
    vi.advanceTimersByTime(100)

    expect(events).toContainEqual({ type: 'error', message: 'Unknown product: ABC-USD' })
  })

  it('distinguishes a requested disconnect from a dropped connection', () => {
    const { source, statuses } = createConnectedSource()
    source.injectFault({ type: 'disconnect' })
    expect(statuses.at(-1)).toEqual({
      state: 'closed',
      reason: 'Simulated connection loss',
      expected: false,
    })

    source.connect()
    vi.advanceTimersByTime(LATENCY)
    source.disconnect()
    expect(statuses.at(-1)).toEqual({
      state: 'closed',
      reason: 'Disconnected by client',
      expected: true,
    })
  })

  it('loses its subscriptions when the connection drops', () => {
    const { source, events } = createConnectedSource()
    source.subscribe([BTC], ['ticker', 'book'])
    vi.advanceTimersByTime(1_000)
    source.injectFault({ type: 'disconnect' })
    events.length = 0

    vi.advanceTimersByTime(1_000)
    expect(events).toEqual([])

    source.connect()
    vi.advanceTimersByTime(LATENCY + 2_000)
    expect(events.every((event) => event.type === 'heartbeat')).toBe(true)
  })

  it('can skip a book update to simulate a sequence gap', () => {
    const { source, events } = createConnectedSource()
    source.subscribe([BTC], ['book'])
    vi.advanceTimersByTime(500)
    source.injectFault({ type: 'sequenceGap' })
    vi.advanceTimersByTime(1_000)

    const sequences = [...ofType(events, 'bookSnapshot'), ...ofType(events, 'bookUpdate')].map(
      (event) => event.sequence,
    )
    const steps = sequences.slice(1).map((sequence, i) => sequence - (sequences[i] ?? 0))
    expect(steps.filter((step) => step === 2)).toHaveLength(1)
    expect(steps.every((step) => step === 1 || step === 2)).toBe(true)
  })

  it('can stall delivery, then deliver everything in order', () => {
    const { source, events } = createConnectedSource()
    source.subscribe([BTC], ['book'])
    vi.advanceTimersByTime(500)
    source.injectFault({ type: 'stall', durationMs: 3_000 })
    const deliveredBeforeStall = events.length

    vi.advanceTimersByTime(2_900)
    expect(events).toHaveLength(deliveredBeforeStall)

    vi.advanceTimersByTime(200)
    expect(ofType(events, 'heartbeat').length).toBeGreaterThanOrEqual(3)
    const sequences = [...ofType(events, 'bookSnapshot'), ...ofType(events, 'bookUpdate')].map(
      (event) => event.sequence,
    )
    expect(sequences).toEqual(sequences.map((_, i) => (sequences[0] ?? 0) + i))
  })

  it('produces the same stream for the same seed and timeline', () => {
    const logs = [0, 1].map(() => {
      const source = createSimulatedSource({ seed: 'replay', connectLatencyMs: LATENCY })
      const events: MarketEvent[] = []
      source.onEvent((event) => events.push(event))
      return { source, events }
    })
    for (const { source } of logs) source.connect()
    vi.advanceTimersByTime(LATENCY)
    for (const { source } of logs) source.subscribe([BTC, ETH], ['ticker', 'trades', 'book'])
    vi.advanceTimersByTime(5_000)

    const [a, b] = logs
    expect(a?.events.length).toBeGreaterThan(50)
    expect(a?.events).toEqual(b?.events)
  })
})
