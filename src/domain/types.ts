import type { CurrencyCode } from './currency'
import type { DecimalString } from './decimal'
import type { ProductId } from './instrument'

/** Epoch milliseconds. */
export type Timestamp = number

export interface Instrument {
  id: ProductId
  base: string
  quote: string
  /** Tick size: drives price formatting and order-book grouping. */
  priceIncrement: DecimalString
  /** Smallest tradable size: drives size formatting. */
  sizeIncrement: DecimalString
}

export interface Ticker {
  productId: ProductId
  price: DecimalString
  open24h: DecimalString
  high24h: DecimalString
  low24h: DecimalString
  volume24h: DecimalString
  time: Timestamp
}

export type Side = 'buy' | 'sell'

export interface Trade {
  id: string
  productId: ProductId
  /** The aggressor's side: `buy` means a buyer lifted an ask. */
  side: Side
  price: DecimalString
  size: DecimalString
  time: Timestamp
}

export interface OrderBook {
  productId: ProductId
  /** Price level → total size. A size of zero removes the level. */
  bids: Map<DecimalString, DecimalString>
  asks: Map<DecimalString, DecimalString>
  /** Last applied feed sequence number, used to detect gaps. */
  lastSequence: number
  updatedAt: Timestamp
}

export interface Candle {
  start: Timestamp
  open: DecimalString
  high: DecimalString
  low: DecimalString
  close: DecimalString
  volume: DecimalString
}

export interface FxRates {
  base: CurrencyCode
  /** ISO date (YYYY-MM-DD) of the ECB publication. */
  date: string
  rates: Partial<Record<CurrencyCode, DecimalString>>
}

export interface NewsItem {
  id: string
  headline: string
  source: string
  url: string
  publishedAt: Timestamp
  relatedSymbols: string[]
}
