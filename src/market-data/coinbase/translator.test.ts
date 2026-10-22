import { describe, expect, it } from 'vitest'
import { parseDecimal, relativeChange } from '@/domain'
import fixtures from './fixtures/messages.json'
import { COINBASE_INSTRUMENTS } from './instruments'
import { parseTimestamp, SCHEMAS_BY_CHANNEL, type CoinbaseMessage } from './schemas'
import { createCoinbaseTranslator, deriveOpen } from './translator'

const DOGE = COINBASE_INSTRUMENTS.find((instrument) => instrument.id === 'DOGE-USD')!

function parse(message: unknown): CoinbaseMessage {
  const channel = (message as { channel: keyof typeof SCHEMAS_BY_CHANNEL }).channel
  return SCHEMAS_BY_CHANNEL[channel].parse(message)
}

describe('schemas', () => {
  it.each(Object.entries(fixtures))('accept the recorded %s message', (_, message) => {
    expect(() => parse(message)).not.toThrow()
  })

  it('reject a message missing a field we rely on', () => {
    const broken = structuredClone(fixtures.tickerUpdate)
    delete (broken.events[0]!.tickers[0] as { price?: string }).price

    expect(() => parse(broken)).toThrow(/price/)
  })

  it('reject numbers in a format we do not handle', () => {
    const broken = structuredClone(fixtures.tickerUpdate)
    broken.events[0]!.tickers[0]!.price = '7.978e-2'

    expect(() => parse(broken)).toThrow('Expected a plain decimal string')
  })
})

describe('parseTimestamp', () => {
  it('handles nanosecond precision', () => {
    expect(parseTimestamp('2026-10-22T06:12:05.349853029Z')).toBe(
      Date.UTC(2026, 9, 22, 6, 12, 5, 349),
    )
    expect(parseTimestamp('2026-10-22T06:12:05Z')).toBe(Date.UTC(2026, 9, 22, 6, 12, 5))
  })

  it('rejects invalid timestamps', () => {
    expect(() => parseTimestamp('yesterday')).toThrow('Invalid timestamp: yesterday')
  })
})

/** Translates one message with a fresh translator. */
const translate = (message: unknown) =>
  createCoinbaseTranslator(COINBASE_INSTRUMENTS).translate(parse(message))

describe('createCoinbaseTranslator', () => {
  it('translates tickers, deriving the 24h open from the percentage change', () => {
    const [event] = translate(fixtures.tickerUpdate)
    if (event?.type !== 'ticker') throw new Error('expected a ticker')
    const { ticker } = event
    const reported = fixtures.tickerUpdate.events[0]!.tickers[0]!

    expect(ticker).toMatchObject({
      productId: 'DOGE-USD',
      price: reported.price,
      high24h: reported.high_24_h,
      low24h: reported.low_24_h,
      volume24h: reported.volume_24_h,
      time: parseTimestamp(fixtures.tickerUpdate.timestamp),
    })
    // The derived open reproduces Coinbase's percentage to within rounding to one tick.
    const change = Number(relativeChange(ticker.open24h, ticker.price)) * 100
    expect(change).toBeCloseTo(Number(reported.price_percent_chg_24_h), 1)
  })

  it('keeps the open equal to the price when the change is -100%', () => {
    const price = parseDecimal('0.08000')
    expect(deriveOpen(price, parseDecimal('-100'), DOGE)).toBe(price)
  })

  it('emits trades oldest first, with the aggressor side', () => {
    const events = translate(fixtures.tradesSnapshot)
    const recorded = fixtures.tradesSnapshot.events[0]!.trades

    const trades = events.flatMap((event) => (event.type === 'trade' ? [event.trade] : []))
    expect(trades.map((trade) => trade.id)).toEqual(
      recorded.map((trade) => trade.trade_id).toReversed(),
    )
    // Coinbase reports the maker's side; a maker BUY means the aggressor sold.
    expect(trades.map((trade) => trade.side)).toEqual(
      recorded.map((trade) => (trade.side === 'BUY' ? 'sell' : 'buy')).toReversed(),
    )
  })

  it('builds book snapshots best-first, with prices normalized to the tick size', () => {
    const [snapshot] = translate(fixtures.level2Snapshot)
    if (snapshot?.type !== 'bookSnapshot') throw new Error('expected a snapshot')

    expect(snapshot.bids.map((level) => level.price)).toEqual(['0.07977', '0.07976', '0.07970'])
    expect(snapshot.asks.map((level) => level.price)).toEqual(['0.07980', '0.07981'])
    expect(snapshot.sequence).toBe(1)
  })

  it('numbers book updates per product, and ignores updates before a snapshot', () => {
    const translator = createCoinbaseTranslator(COINBASE_INSTRUMENTS)
    expect(translator.translate(parse(fixtures.level2Update))).toEqual([])

    translator.translate(parse(fixtures.level2Snapshot))
    const [update] = translator.translate(parse(fixtures.level2Update))
    if (update?.type !== 'bookUpdate') throw new Error('expected an update')

    expect(update.sequence).toBe(2)
    expect(update.changes[0]).toEqual({
      side: 'bid',
      price: '0.07976',
      size: fixtures.level2Update.events[0]!.updates[0]!.new_quantity,
    })
    expect(update.changes.every((change) => change.price.length === '0.07976'.length)).toBe(true)
  })

  it('skips a book sequence number when books are invalidated, so consumers detect the gap', () => {
    const translator = createCoinbaseTranslator(COINBASE_INSTRUMENTS)
    translator.translate(parse(fixtures.level2Snapshot))

    expect(translator.invalidateBooks()).toEqual(['DOGE-USD'])
    const [update] = translator.translate(parse(fixtures.level2Update))
    expect(update).toMatchObject({ type: 'bookUpdate', sequence: 3 })
  })

  it('translates heartbeats and ignores subscription acks', () => {
    expect(translate(fixtures.heartbeat)).toEqual([
      { type: 'heartbeat', time: parseTimestamp(fixtures.heartbeat.timestamp) },
    ])
    expect(translate(fixtures.subscriptions)).toEqual([])
  })

  it('ignores products it does not know', () => {
    const unknown = structuredClone(fixtures.tickerUpdate)
    unknown.events[0]!.tickers[0]!.product_id = 'PEPE-USD'

    expect(translate(unknown)).toEqual([])
  })
})
