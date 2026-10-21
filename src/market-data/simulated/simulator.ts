import {
  countIncrements,
  scaleIncrement,
  type Instrument,
  type ProductId,
  type Ticker,
  type Timestamp,
} from '@/domain'
import type { BookChange, BookLevel, BookSide, BookSnapshotEvent, MarketEvent } from '../types'
import { DEFAULT_SIMULATED_INSTRUMENTS, type SimulatedInstrument } from './instruments'
import { createRandom, type Random } from './random'

export const BOOK_DEPTH = 40
const CHURN_PER_STEP = 3
/** Longer advances are split up, so the book is replenished between bursts of trades. */
const MAX_STEP_MS = 1_000

/**
 * All simulated quantities are integers: prices in price increments ("ticks"),
 * sizes in size increments. That keeps the model exact and deterministic, and
 * conversion to decimal strings happens only when events are emitted.
 */
interface ProductState {
  readonly config: SimulatedInstrument
  midTicks: number
  readonly bids: Map<number, number>
  readonly asks: Map<number, number>
  sequence: number
  tradeCount: number
  readonly openTicks: number
  lastTicks: number
  highTicks: number
  lowTicks: number
  volumeUnits: number
}

type PendingChanges = Map<string, { side: BookSide; ticks: number; units: number }>

export interface MarketSimulator {
  readonly instruments: readonly Instrument[]
  readonly time: Timestamp
  hasProduct(productId: ProductId): boolean
  /** Moves the market forward and returns everything that happened, for every product. */
  advance(durationMs: number): MarketEvent[]
  ticker(productId: ProductId): Ticker | undefined
  bookSnapshot(productId: ProductId): BookSnapshotEvent | undefined
}

export interface MarketSimulatorOptions {
  seed: number | string
  startTime: Timestamp
  instruments?: readonly SimulatedInstrument[]
}

/**
 * A deterministic market model: a random-walk mid price, an order book that
 * follows it, and trades that consume liquidity at the touch. The same seed,
 * start time and sequence of `advance` calls always produce the same events.
 */
export function createMarketSimulator({
  seed,
  startTime,
  instruments = DEFAULT_SIMULATED_INSTRUMENTS,
}: MarketSimulatorOptions): MarketSimulator {
  const random = createRandom(seed)
  const products = new Map<ProductId, ProductState>()
  let time = startTime

  for (const config of instruments) {
    const { priceIncrement, id } = config.instrument
    const initialTicks = countIncrements(config.initialPrice, priceIncrement)
    const openTicks = Math.round(initialTicks * (1 + (random.next() - 0.5) * 0.06))
    const state: ProductState = {
      config,
      midTicks: initialTicks,
      bids: new Map(),
      asks: new Map(),
      sequence: 0,
      tradeCount: 0,
      openTicks,
      lastTicks: initialTicks,
      highTicks: Math.max(openTicks, initialTicks),
      lowTicks: Math.min(openTicks, initialTicks),
      volumeUnits: config.typicalSizeUnits * random.int(1_000, 5_000),
    }
    moveTouch(state, random, new Map())
    fillDepth(state, random, new Map())
    products.set(id, state)
  }

  return {
    instruments: instruments.map((config) => config.instrument),
    get time() {
      return time
    },
    hasProduct: (productId) => products.has(productId),
    advance(durationMs) {
      const events: MarketEvent[] = []
      let remaining = durationMs
      while (remaining > 0) {
        const stepMs = Math.min(remaining, MAX_STEP_MS)
        remaining -= stepMs
        time += stepMs
        for (const state of products.values()) {
          step(state, random, stepMs / 1000, time, events)
        }
      }
      return events
    },
    ticker(productId) {
      const state = products.get(productId)
      return state && toTicker(state, time)
    },
    bookSnapshot(productId) {
      const state = products.get(productId)
      if (!state) return undefined
      return {
        type: 'bookSnapshot',
        productId,
        sequence: state.sequence,
        time,
        bids: toLevels(state, state.bids, descending),
        asks: toLevels(state, state.asks, ascending),
      }
    },
  }
}

function step(
  state: ProductState,
  random: Random,
  seconds: number,
  time: Timestamp,
  events: MarketEvent[],
) {
  const { config } = state
  const changes: PendingChanges = new Map()

  // Keep the price far enough above zero that a full book always fits below it.
  const floor = config.levelSpacingTicks * BOOK_DEPTH * 2
  const drift = state.midTicks * config.volatility * Math.sqrt(seconds) * random.normal()
  state.midTicks = Math.max(floor, state.midTicks + Math.round(drift))
  moveTouch(state, random, changes)
  fillDepth(state, random, changes)
  churn(state, random, changes)

  const expectedTrades = config.tradesPerSecond * seconds
  const tradeCount = Math.floor(expectedTrades) + (random.chance(expectedTrades % 1) ? 1 : 0)
  for (let i = 0; i < tradeCount; i++) {
    trade(state, random, time, changes, events)
  }
  // New orders replace the liquidity the trades took.
  fillDepth(state, random, changes)

  if (changes.size > 0) {
    state.sequence += 1
    events.push({
      type: 'bookUpdate',
      productId: config.instrument.id,
      sequence: state.sequence,
      time,
      changes: [...changes.values()].map(({ side, ticks, units }): BookChange => ({
        side,
        price: scaleIncrement(ticks, config.instrument.priceIncrement),
        size: scaleIncrement(units, config.instrument.sizeIncrement),
      })),
    })
  }
}

/** Re-centres the best bid and ask around the mid price. */
function moveTouch(state: ProductState, random: Random, changes: PendingChanges) {
  const spread = random.int(1, state.config.levelSpacingTicks)
  const bestBid = state.midTicks - Math.floor(spread / 2)
  const bestAsk = bestBid + spread

  // Remove levels the new touch has crossed.
  for (const ticks of state.bids.keys()) {
    if (ticks > bestBid) setLevel(state, 'bid', ticks, 0, changes)
  }
  for (const ticks of state.asks.keys()) {
    if (ticks < bestAsk) setLevel(state, 'ask', ticks, 0, changes)
  }

  if (!state.bids.has(bestBid)) setLevel(state, 'bid', bestBid, levelSize(state, random), changes)
  if (!state.asks.has(bestAsk)) setLevel(state, 'ask', bestAsk, levelSize(state, random), changes)
}

/** Trims or extends the far end of each side to exactly BOOK_DEPTH levels. */
function fillDepth(state: ProductState, random: Random, changes: PendingChanges) {
  const { levelSpacingTicks: spacing } = state.config
  while (state.bids.size > BOOK_DEPTH) setLevel(state, 'bid', min(state.bids), 0, changes)
  while (state.asks.size > BOOK_DEPTH) setLevel(state, 'ask', max(state.asks), 0, changes)

  // Bids sit at or below the mid and asks above it, so an empty side restarts from the mid.
  let farBid = state.bids.size > 0 ? min(state.bids) : state.midTicks
  while (state.bids.size < BOOK_DEPTH) {
    farBid -= random.int(1, spacing)
    setLevel(state, 'bid', farBid, levelSize(state, random), changes)
  }
  let farAsk = state.asks.size > 0 ? max(state.asks) : state.midTicks
  while (state.asks.size < BOOK_DEPTH) {
    farAsk += random.int(1, spacing)
    setLevel(state, 'ask', farAsk, levelSize(state, random), changes)
  }
}

/** Other participants adding and cancelling orders. */
function churn(state: ProductState, random: Random, changes: PendingChanges) {
  for (let i = 0; i < CHURN_PER_STEP; i++) {
    const side: BookSide = random.chance(0.5) ? 'bid' : 'ask'
    const levels = [...(side === 'bid' ? state.bids : state.asks).keys()]
    const ticks = levels[random.int(0, levels.length - 1)]
    if (ticks !== undefined) setLevel(state, side, ticks, levelSize(state, random), changes)
  }
}

/** A market order that takes liquidity from the best level on the opposite side. */
function trade(
  state: ProductState,
  random: Random,
  time: Timestamp,
  changes: PendingChanges,
  events: MarketEvent[],
) {
  const { instrument, typicalSizeUnits } = state.config
  const side = random.chance(0.5) ? 'buy' : 'sell'
  const bookSide: BookSide = side === 'buy' ? 'ask' : 'bid'
  const levels = side === 'buy' ? state.asks : state.bids
  if (levels.size === 0) return

  const ticks = side === 'buy' ? min(levels) : max(levels)
  const available = levels.get(ticks) ?? 0
  const wanted = Math.max(1, Math.round(typicalSizeUnits * (0.05 + random.next() ** 3 * 2)))
  const units = Math.min(wanted, available)
  setLevel(state, bookSide, ticks, available - units, changes)

  state.tradeCount += 1
  state.lastTicks = ticks
  state.highTicks = Math.max(state.highTicks, ticks)
  state.lowTicks = Math.min(state.lowTicks, ticks)
  state.volumeUnits += units

  events.push({
    type: 'trade',
    trade: {
      id: `${instrument.id}-${state.tradeCount}`,
      productId: instrument.id,
      side,
      price: scaleIncrement(ticks, instrument.priceIncrement),
      size: scaleIncrement(units, instrument.sizeIncrement),
      time,
    },
  })
  events.push({ type: 'ticker', ticker: toTicker(state, time) })
}

function setLevel(
  state: ProductState,
  side: BookSide,
  ticks: number,
  units: number,
  changes: PendingChanges,
) {
  const levels = side === 'bid' ? state.bids : state.asks
  if (units > 0) levels.set(ticks, units)
  else if (levels.has(ticks)) levels.delete(ticks)
  else return
  // Several changes to one level within a step collapse into its final size.
  changes.set(`${side}:${ticks}`, { side, ticks, units })
}

function levelSize(state: ProductState, random: Random) {
  return Math.max(1, Math.round(state.config.typicalSizeUnits * (0.2 + random.next() ** 2 * 4)))
}

function toTicker(state: ProductState, time: Timestamp): Ticker {
  const { id, priceIncrement, sizeIncrement } = state.config.instrument
  const price = (ticks: number) => scaleIncrement(ticks, priceIncrement)
  return {
    productId: id,
    price: price(state.lastTicks),
    open24h: price(state.openTicks),
    high24h: price(state.highTicks),
    low24h: price(state.lowTicks),
    volume24h: scaleIncrement(state.volumeUnits, sizeIncrement),
    time,
  }
}

function toLevels(
  state: ProductState,
  levels: Map<number, number>,
  order: (a: number, b: number) => number,
): BookLevel[] {
  const { priceIncrement, sizeIncrement } = state.config.instrument
  return [...levels.keys()].toSorted(order).map((ticks) => ({
    price: scaleIncrement(ticks, priceIncrement),
    size: scaleIncrement(levels.get(ticks) ?? 0, sizeIncrement),
  }))
}

const ascending = (a: number, b: number) => a - b
const descending = (a: number, b: number) => b - a
const min = (levels: Map<number, number>) => Math.min(...levels.keys())
const max = (levels: Map<number, number>) => Math.max(...levels.keys())
