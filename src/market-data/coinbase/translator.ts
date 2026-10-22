import {
  addDecimals,
  countIncrements,
  divideDecimals,
  isZero,
  parseDecimal,
  roundToIncrement,
  scaleIncrement,
  type DecimalString,
  type Instrument,
  type ProductId,
  type Trade,
} from '@/domain'
import type { BookChange, BookLevel, MarketEvent } from '../types'
import { parseTimestamp, type CoinbaseMessage } from './schemas'

const HUNDRED = parseDecimal('100')
const ONE = parseDecimal('1')

/**
 * Canonical price text at the instrument's tick size. Coinbase drops
 * trailing zeros ("0.0797" next to "0.07977"), and book levels are keyed
 * by price text, so unnormalized prices would split one level in two.
 */
function normalize(price: DecimalString, instrument: Instrument) {
  return roundToIncrement(price, instrument.priceIncrement)
}

/**
 * Translates validated Coinbase messages into `MarketEvent`s: normalizes
 * prices, derives fields Coinbase doesn't send, and keeps a per-product book
 * sequence (Coinbase only numbers messages per connection).
 */
export function createCoinbaseTranslator(instruments: readonly Instrument[]) {
  const byId = new Map<string, Instrument>(
    instruments.map((instrument) => [instrument.id, instrument]),
  )
  const bookSequences = new Map<ProductId, number>()

  function translate(message: CoinbaseMessage): MarketEvent[] {
    const time = parseTimestamp(message.timestamp)
    switch (message.channel) {
      case 'heartbeats':
        return [{ type: 'heartbeat', time }]
      case 'subscriptions':
        return []
      case 'ticker':
        return message.events.flatMap((event) =>
          event.tickers.flatMap((ticker): MarketEvent[] => {
            const instrument = byId.get(ticker.product_id)
            if (!instrument) return []
            const price = normalize(ticker.price, instrument)
            return [
              {
                type: 'ticker',
                ticker: {
                  productId: instrument.id,
                  price,
                  open24h: deriveOpen(price, ticker.price_percent_chg_24_h, instrument),
                  high24h: normalize(ticker.high_24_h, instrument),
                  low24h: normalize(ticker.low_24_h, instrument),
                  volume24h: ticker.volume_24_h,
                  time,
                },
              },
            ]
          }),
        )
      case 'market_trades': {
        const trades = message.events.flatMap((event) =>
          event.trades.flatMap((trade): Trade[] => {
            const instrument = byId.get(trade.product_id)
            if (!instrument) return []
            return [
              {
                id: trade.trade_id,
                productId: instrument.id,
                // Coinbase reports the maker's side: a BUY trade filled a resting
                // buy order, so the aggressor sold. (Checked against recorded data:
                // BUY trades print at the bid, SELL trades at the ask.)
                side: trade.side === 'BUY' ? 'sell' : 'buy',
                price: normalize(trade.price, instrument),
                size: trade.size,
                time: parseTimestamp(trade.time),
              },
            ]
          }),
        )
        // Snapshots arrive newest first; emit in the order trades happened.
        return trades.toSorted((a, b) => a.time - b.time).map((trade) => ({ type: 'trade', trade }))
      }
      case 'l2_data':
        return message.events.flatMap((event): MarketEvent[] => {
          const instrument = byId.get(event.product_id)
          if (!instrument) return []
          const productId = instrument.id

          if (event.type === 'snapshot') {
            const sequence = (bookSequences.get(productId) ?? 0) + 1
            bookSequences.set(productId, sequence)
            return [
              {
                type: 'bookSnapshot',
                productId,
                sequence,
                time,
                ...toBook(event.updates, instrument),
              },
            ]
          }

          const previous = bookSequences.get(productId)
          // An update without a snapshot can't be applied to anything.
          if (previous === undefined) return []
          bookSequences.set(productId, previous + 1)
          return [
            {
              type: 'bookUpdate',
              productId,
              sequence: previous + 1,
              time,
              changes: event.updates.map((update): BookChange => ({
                side: update.side === 'bid' ? 'bid' : 'ask',
                price: normalize(update.price_level, instrument),
                size: update.new_quantity,
              })),
            },
          ]
        })
    }
  }

  /**
   * After messages were lost, skips a sequence number for every book, so
   * consumers see a gap and discard their books until the next snapshot.
   */
  function invalidateBooks(): ProductId[] {
    for (const [productId, sequence] of bookSequences) bookSequences.set(productId, sequence + 1)
    return [...bookSequences.keys()]
  }

  /** Forgets book state, e.g. after unsubscribing. */
  function forgetBook(productId: ProductId) {
    bookSequences.delete(productId)
  }

  return { translate, invalidateBooks, forgetBook }
}

/**
 * Coinbase sends the 24h change as a percentage instead of the opening
 * price: open = price / (1 + change / 100), rounded to the tick size.
 */
export function deriveOpen(
  price: DecimalString,
  changePercent: DecimalString,
  instrument: Instrument,
) {
  const factor = addDecimals(ONE, divideDecimals(changePercent, HUNDRED))
  if (isZero(factor)) return price
  return roundToIncrement(divideDecimals(price, factor), instrument.priceIncrement)
}

/** Splits a snapshot into best-first sides, dropping empty levels. */
function toBook(
  updates: ReadonlyArray<{
    side: 'bid' | 'offer'
    price_level: DecimalString
    new_quantity: DecimalString
  }>,
  instrument: Instrument,
): { bids: BookLevel[]; asks: BookLevel[] } {
  // Sort by integer ticks: thousands of levels, so avoid decimal comparisons.
  const toLevel = (update: (typeof updates)[number]) => {
    const ticks = countIncrements(
      roundToIncrement(update.price_level, instrument.priceIncrement),
      instrument.priceIncrement,
    )
    return { ticks, size: update.new_quantity }
  }
  const levels = (side: 'bid' | 'offer', order: 1 | -1) =>
    updates
      .filter((update) => update.side === side && !isZero(update.new_quantity))
      .map(toLevel)
      .toSorted((a, b) => order * (a.ticks - b.ticks))
      .map(({ ticks, size }) => ({ price: scaleIncrement(ticks, instrument.priceIncrement), size }))

  return { bids: levels('bid', -1), asks: levels('offer', 1) }
}
