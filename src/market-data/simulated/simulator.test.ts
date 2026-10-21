import { describe, expect, it } from 'vitest'
import {
  compareDecimals,
  countIncrements,
  isZero,
  parseProductId,
  roundToIncrement,
  type DecimalString,
  type Instrument,
  type ProductId,
} from '@/domain'
import type { BookSnapshotEvent, BookUpdateEvent, MarketEvent } from '../types'
import { BOOK_DEPTH, createMarketSimulator, type MarketSimulator } from './simulator'

const START = Date.UTC(2026, 0, 1)
const BTC = parseProductId('BTC-USD')

function run(seed: number | string, steps: number, stepMs = 100) {
  const simulator = createMarketSimulator({ seed, startTime: START })
  const events: MarketEvent[] = []
  for (let i = 0; i < steps; i++) events.push(...simulator.advance(stepMs))
  return { simulator, events }
}

function instrumentOf(simulator: MarketSimulator, productId: string): Instrument {
  const instrument = simulator.instruments.find((i) => i.id === productId)
  if (!instrument) throw new Error(`No instrument ${productId}`)
  return instrument
}

const descending = (a: DecimalString, b: DecimalString) => compareDecimals(b, a)

function isOnSizeGrid(size: DecimalString, increment: DecimalString) {
  try {
    countIncrements(size, increment)
    return true
  } catch {
    return false
  }
}

interface Quote {
  productId: ProductId
  price: DecimalString
  size: DecimalString
}

/** A minimal reference implementation of book maintenance, to check the feed against. */
function createReplayBook(snapshot: BookSnapshotEvent) {
  const bids = new Map(snapshot.bids.map((level) => [level.price, level.size]))
  const asks = new Map(snapshot.asks.map((level) => [level.price, level.size]))

  return {
    apply(update: BookUpdateEvent) {
      for (const { side, price, size } of update.changes) {
        const levels = side === 'bid' ? bids : asks
        if (isZero(size)) levels.delete(price)
        else levels.set(price, size)
      }
    },
    bestBid: () => [...bids.keys()].toSorted(descending)[0],
    bestAsk: () => [...asks.keys()].toSorted(compareDecimals)[0],
    depth: () => ({ bids: bids.size, asks: asks.size }),
    toSnapshotLevels: () => ({
      bids: [...bids.keys()]
        .toSorted(descending)
        .map((price) => ({ price, size: bids.get(price) })),
      asks: [...asks.keys()]
        .toSorted(compareDecimals)
        .map((price) => ({ price, size: asks.get(price) })),
    }),
  }
}

describe('createMarketSimulator', () => {
  it('produces identical events for the same seed', () => {
    expect(run('same', 300).events).toEqual(run('same', 300).events)
  })

  it('produces different events for different seeds', () => {
    expect(run('one', 50).events).not.toEqual(run('two', 50).events)
  })

  it('advances its clock and stamps events with it', () => {
    const { simulator, events } = run(1, 10)

    expect(simulator.time).toBe(START + 1_000)
    expect(simulator.advance(0)).toEqual([])
    const times = events.flatMap((event) =>
      event.type === 'trade' ? [event.trade.time] : event.type === 'bookUpdate' ? [event.time] : [],
    )
    expect(times.every((time) => time > START && time <= START + 1_000 && time % 100 === 0)).toBe(
      true,
    )
  })

  it('only emits prices on the tick grid and sizes on the size grid', () => {
    const { simulator, events } = run(2, 600)
    const quotes = events.flatMap((event): Quote[] => {
      if (event.type === 'trade') return [event.trade]
      if (event.type === 'bookUpdate') {
        return event.changes.map((change) => ({ ...change, productId: event.productId }))
      }
      return []
    })

    const offGrid = quotes.filter(({ productId, price, size }) => {
      const { priceIncrement, sizeIncrement } = instrumentOf(simulator, productId)
      return roundToIncrement(price, priceIncrement) !== price || !isOnSizeGrid(size, sizeIncrement)
    })
    const emptyTrades = events.filter((event) => event.type === 'trade' && isZero(event.trade.size))

    expect(quotes.length).toBeGreaterThan(1_000)
    expect(offGrid).toEqual([])
    expect(emptyTrades).toEqual([])
  })

  it('keeps every book uncrossed, at full depth, and replayable from a snapshot', () => {
    const simulator = createMarketSimulator({ seed: 3, startTime: START })
    const books = new Map(
      simulator.instruments.map((instrument) => {
        const snapshot = simulator.bookSnapshot(instrument.id)
        if (!snapshot) throw new Error('missing snapshot')
        return [instrument.id, { book: createReplayBook(snapshot), sequence: snapshot.sequence }]
      }),
    )

    const violations: string[] = []
    let updateCount = 0
    for (let i = 0; i < 600; i++) {
      for (const event of simulator.advance(100)) {
        if (event.type !== 'bookUpdate') continue
        const entry = books.get(event.productId)
        if (!entry) throw new Error('unexpected product')
        const where = `${event.productId} #${event.sequence}`
        updateCount += 1

        if (event.sequence !== entry.sequence + 1) violations.push(`${where}: sequence gap`)
        entry.sequence = event.sequence
        entry.book.apply(event)

        const bestBid = entry.book.bestBid() ?? 'none'
        const bestAsk = entry.book.bestAsk() ?? 'none'
        if (!(compareDecimals(bestBid as DecimalString, bestAsk as DecimalString) < 0)) {
          violations.push(`${where}: crossed or empty (${bestBid} / ${bestAsk})`)
        }
        const { bids, asks } = entry.book.depth()
        if (bids !== BOOK_DEPTH || asks !== BOOK_DEPTH) {
          violations.push(`${where}: depth ${bids}/${asks}`)
        }
      }
    }

    expect(updateCount).toBeGreaterThan(1_000)
    expect(violations).toEqual([])

    for (const [productId, { book, sequence }] of books) {
      const snapshot = simulator.bookSnapshot(productId)
      expect(snapshot?.sequence).toBe(sequence)
      expect(book.toSnapshotLevels()).toEqual({ bids: snapshot?.bids, asks: snapshot?.asks })
    }
  })

  it('reports each trade in a consistent ticker', () => {
    const { events } = run(4, 600)
    const pairs = events.flatMap((event, index) => {
      const previous = events[index - 1]
      return event.type === 'ticker' && event.ticker.productId === BTC
        ? [{ ticker: event.ticker, trade: previous?.type === 'trade' ? previous.trade : undefined }]
        : []
    })
    const volumes = pairs.map(({ ticker }) => ticker.volume24h)

    expect(pairs.length).toBeGreaterThan(100)
    expect(pairs.filter(({ ticker, trade }) => trade?.price !== ticker.price)).toEqual([])
    expect(
      pairs.filter(
        ({ ticker }) =>
          compareDecimals(ticker.low24h, ticker.price) > 0 ||
          compareDecimals(ticker.high24h, ticker.price) < 0,
      ),
    ).toEqual([])
    expect(
      volumes.slice(1).every((volume, i) => compareDecimals(volume, volumes[i] ?? volume) > 0),
    ).toBe(true)
  })

  it('moves prices realistically and keeps them positive over a long run', () => {
    const simulator = createMarketSimulator({ seed: 5, startTime: START })
    const initial = simulator.ticker(BTC)?.price
    // Ten simulated minutes in one-second steps.
    for (let i = 0; i < 600; i++) simulator.advance(1_000)

    for (const instrument of simulator.instruments) {
      const snapshot = simulator.bookSnapshot(instrument.id)
      expect(snapshot?.bids).toHaveLength(BOOK_DEPTH)
      expect(snapshot?.asks).toHaveLength(BOOK_DEPTH)
      expect(
        snapshot?.bids.every((level) => compareDecimals(level.price, '0' as DecimalString) === 1),
      ).toBe(true)
    }
    const price = simulator.ticker(BTC)?.price
    expect(price).not.toBe(initial)
    // Ten minutes at this volatility should stay well within ±10%.
    expect(Number(price)).toBeGreaterThan(84_000 * 0.9)
    expect(Number(price)).toBeLessThan(84_000 * 1.1)
  })

  it('splits a large time jump into steps, so trades are spread over time', () => {
    const simulator = createMarketSimulator({ seed: 6, startTime: START })
    const events = simulator.advance(60_000)
    const trades = events.filter((event) => event.type === 'trade')

    expect(simulator.time).toBe(START + 60_000)
    expect(trades.length).toBeGreaterThan(100)
    expect(new Set(trades.map((event) => event.trade.time)).size).toBeGreaterThan(50)
    expect(simulator.bookSnapshot(BTC)?.bids).toHaveLength(BOOK_DEPTH)
    expect(simulator.bookSnapshot(BTC)?.asks).toHaveLength(BOOK_DEPTH)
  })
})
