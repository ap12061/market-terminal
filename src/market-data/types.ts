import type { DecimalString, Instrument, ProductId, Ticker, Timestamp, Trade } from '@/domain'

export type Channel = 'ticker' | 'trades' | 'book'

export type BookSide = 'bid' | 'ask'

export interface BookLevel {
  price: DecimalString
  size: DecimalString
}

export interface BookChange extends BookLevel {
  side: BookSide
}

export interface TickerEvent {
  type: 'ticker'
  ticker: Ticker
}

export interface TradeEvent {
  type: 'trade'
  trade: Trade
}

/** The full book. Replaces any book state held for the product. */
export interface BookSnapshotEvent {
  type: 'bookSnapshot'
  productId: ProductId
  /** Updates continue from `sequence + 1`. */
  sequence: number
  time: Timestamp
  /** Best (highest) bid first. */
  bids: BookLevel[]
  /** Best (lowest) ask first. */
  asks: BookLevel[]
}

/**
 * Level changes since the previous book event. A size of "0" removes the level.
 * `sequence` increases by exactly 1 per product: any gap means updates were
 * missed and the book must be re-snapshotted.
 */
export interface BookUpdateEvent {
  type: 'bookUpdate'
  productId: ProductId
  sequence: number
  time: Timestamp
  changes: BookChange[]
}

export interface HeartbeatEvent {
  type: 'heartbeat'
  time: Timestamp
}

export interface FeedErrorEvent {
  type: 'error'
  message: string
}

export type MarketEvent =
  TickerEvent | TradeEvent | BookSnapshotEvent | BookUpdateEvent | HeartbeatEvent | FeedErrorEvent

/** The transport's state. Reconnecting is the caller's job (see the connection manager). */
export type SourceStatus =
  | { state: 'connecting' }
  | { state: 'open' }
  | {
      state: 'closed'
      reason: string
      /** `false` when the connection dropped rather than being closed on request. */
      expected: boolean
    }

export type Unsubscribe = () => void

/**
 * A streaming market data feed. Implementations translate a specific
 * provider's protocol into `MarketEvent`s; the UI never knows which one it's using.
 *
 * Subscriptions only exist while the connection is open: after a drop, the
 * caller must subscribe again.
 */
export interface MarketDataSource {
  readonly id: string
  getStatus(): SourceStatus
  getInstruments(): Promise<readonly Instrument[]>
  connect(): void
  disconnect(): void
  /** Throws if the connection isn't open. */
  subscribe(productIds: readonly ProductId[], channels: readonly Channel[]): void
  unsubscribe(productIds: readonly ProductId[], channels: readonly Channel[]): void
  onEvent(listener: (event: MarketEvent) => void): Unsubscribe
  onStatusChange(listener: (status: SourceStatus) => void): Unsubscribe
}
