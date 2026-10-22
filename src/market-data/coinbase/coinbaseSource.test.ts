import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseProductId } from '@/domain'
import type { MarketEvent, SourceStatus } from '../types'
import { createCoinbaseSource, type WebSocketLike } from './coinbaseSource'
import fixtures from './fixtures/messages.json'

const BTC = parseProductId('BTC-USD')
const DOGE = parseProductId('DOGE-USD')

class FakeWebSocket extends EventTarget implements WebSocketLike {
  readonly sent: unknown[] = []
  closedWith: { code?: number; reason?: string } | undefined
  private sequence = 0

  readonly url: string

  constructor(url: string) {
    super()
    this.url = url
  }

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }

  close(code?: number, reason?: string) {
    this.closedWith = { code, reason }
  }

  // Test controls: what the server would do.
  serverOpen() {
    this.dispatchEvent(new Event('open'))
  }

  serverSend(message: object, { sequence = this.sequence++ } = {}) {
    this.sequence = sequence + 1
    const data = JSON.stringify({ ...message, sequence_num: sequence })
    this.dispatchEvent(new MessageEvent('message', { data }))
  }

  serverSendRaw(data: string) {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }

  serverClose(code: number, reason = '') {
    this.dispatchEvent(Object.assign(new Event('close'), { code, reason }))
  }
}

function ack(subscriptions: Record<string, string[]>) {
  return { ...fixtures.subscriptions, events: [{ subscriptions }] }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function setup() {
  const sockets: FakeWebSocket[] = []
  const source = createCoinbaseSource({
    createWebSocket: (url) => {
      const socket = new FakeWebSocket(url)
      sockets.push(socket)
      return socket
    },
  })
  const events: MarketEvent[] = []
  const statuses: SourceStatus[] = []
  source.onEvent((event) => events.push(event))
  source.onStatusChange((status) => statuses.push(status))

  const connect = () => {
    source.connect()
    vi.advanceTimersByTime(0)
    const socket = sockets.at(-1)
    if (!socket) throw new Error('no socket created')
    socket.serverOpen()
    socket.serverSend(ack({ heartbeats: ['heartbeats'] }))
    socket.sent.length = 0
    return socket
  }
  return { source, sockets, events, statuses, connect }
}

const errors = (events: MarketEvent[]) =>
  events.flatMap((event) => (event.type === 'error' ? [event.message] : []))

describe('createCoinbaseSource', () => {
  it('connects to the Coinbase feed and subscribes to heartbeats', () => {
    const { source, sockets, statuses } = setup()
    source.connect()
    expect(statuses).toEqual([{ state: 'connecting' }])
    expect(sockets).toHaveLength(0)

    vi.advanceTimersByTime(0)
    sockets[0]?.serverOpen()

    expect(sockets[0]?.url).toBe('wss://advanced-trade-ws.coinbase.com')
    expect(statuses.at(-1)).toEqual({ state: 'open' })
    expect(sockets[0]?.sent).toEqual([{ type: 'subscribe', channel: 'heartbeats' }])
  })

  it('never opens a socket for a connect cancelled in the same tick (React StrictMode)', () => {
    const { source, sockets } = setup()
    source.connect()
    source.disconnect()
    source.connect()
    vi.advanceTimersByTime(0)

    expect(sockets).toHaveLength(1)
  })

  it('maps channels to Coinbase names and only sends what changed', () => {
    const { source, connect } = setup()
    const socket = connect()
    source.subscribe([BTC, DOGE], ['ticker', 'trades', 'book'])
    source.subscribe([BTC], ['ticker'])
    source.unsubscribe([DOGE], ['trades'])

    expect(socket.sent).toEqual([
      { type: 'subscribe', channel: 'ticker', product_ids: [BTC, DOGE] },
      { type: 'subscribe', channel: 'market_trades', product_ids: [BTC, DOGE] },
      { type: 'subscribe', channel: 'level2', product_ids: [BTC, DOGE] },
      { type: 'unsubscribe', channel: 'market_trades', product_ids: [DOGE] },
    ])
  })

  it('refuses subscriptions until open, and reports products it does not list', async () => {
    const { source, events, connect } = setup()
    expect(() => source.subscribe([BTC], ['ticker'])).toThrow(/closed/)

    const socket = connect()
    source.subscribe([parseProductId('PEPE-USD')], ['ticker'])
    await Promise.resolve()

    expect(socket.sent).toEqual([])
    expect(errors(events)).toEqual(['Unknown product: PEPE-USD'])
  })

  it('reports products Coinbase silently left out of its subscription ack', () => {
    const { source, events, connect } = setup()
    const socket = connect()
    source.subscribe([BTC, DOGE], ['ticker'])
    socket.serverSend(ack({ heartbeats: ['heartbeats'], ticker: [BTC] }))

    expect(errors(events)).toEqual(['Coinbase rejected the ticker subscription for DOGE-USD'])
  })

  it('translates feed messages into market events', () => {
    const { source, events, connect } = setup()
    const socket = connect()
    source.subscribe([DOGE], ['ticker', 'book'])
    socket.serverSend(fixtures.tickerUpdate)
    socket.serverSend(fixtures.level2Snapshot)
    socket.serverSend(fixtures.level2Update)
    socket.serverSend(fixtures.heartbeat)

    expect(events.map((event) => event.type)).toEqual([
      'ticker',
      'bookSnapshot',
      'bookUpdate',
      'heartbeat',
    ])
  })

  it('drops book messages that arrive after unsubscribing', () => {
    const { source, events, connect } = setup()
    const socket = connect()
    source.subscribe([DOGE], ['book'])
    socket.serverSend(fixtures.level2Snapshot)
    source.unsubscribe([DOGE], ['book'])
    events.length = 0
    socket.serverSend(fixtures.level2Update)

    expect(events).toEqual([])
  })

  it('recovers from a sequence gap by invalidating books and resubscribing', () => {
    const { source, events, connect } = setup()
    const socket = connect()
    source.subscribe([DOGE], ['book'])
    socket.serverSend(fixtures.level2Snapshot, { sequence: 10 })
    socket.sent.length = 0

    socket.serverSend(fixtures.level2Update, { sequence: 12 })

    expect(socket.sent).toEqual([
      { type: 'unsubscribe', channel: 'level2', product_ids: [DOGE] },
      { type: 'subscribe', channel: 'level2', product_ids: [DOGE] },
    ])
    // The book was forgotten, so the update arriving after the gap is not applied.
    expect(events.filter((event) => event.type === 'bookUpdate')).toEqual([])

    socket.serverSend(fixtures.level2Snapshot)
    expect(events.at(-1)).toMatchObject({ type: 'bookSnapshot', productId: DOGE })
  })

  it('reports malformed messages once per kind, not once per message', () => {
    const { events, connect } = setup()
    const socket = connect()
    const broken = { ...fixtures.heartbeat, timestamp: 42 }
    socket.serverSend(broken)
    socket.serverSend(broken)
    socket.serverSendRaw('not json')
    socket.serverSendRaw('not json')

    expect(errors(events)).toEqual([
      'Ignored a malformed heartbeats message from Coinbase',
      'Ignored a malformed unparseable message from Coinbase',
    ])
  })

  it('passes on Coinbase error messages', () => {
    const { events, connect } = setup()
    connect().serverSendRaw(JSON.stringify({ type: 'error', message: 'rate limit exceeded' }))

    expect(errors(events)).toEqual(['Coinbase: rate limit exceeded'])
  })

  it('reports a dropped connection, and forgets the socket', () => {
    const { source, events, statuses, connect } = setup()
    const socket = connect()
    source.subscribe([DOGE], ['ticker'])
    socket.serverClose(1006)
    events.length = 0
    socket.serverSend(fixtures.tickerUpdate)

    expect(statuses.at(-1)).toEqual({
      state: 'closed',
      reason: 'Connection closed (1006)',
      expected: false,
    })
    expect(events).toEqual([])
    expect(() => source.subscribe([DOGE], ['ticker'])).toThrow(/closed/)
  })

  it('closes the socket cleanly when disconnected', () => {
    const { source, statuses, connect } = setup()
    const socket = connect()
    source.disconnect()

    expect(socket.closedWith).toEqual({ code: 1000, reason: 'Client disconnect' })
    expect(statuses.at(-1)).toEqual({
      state: 'closed',
      reason: 'Disconnected by client',
      expected: true,
    })
  })
})
