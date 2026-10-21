import type { Instrument, ProductId, Ticker, Trade } from '@/domain'
import {
  createConnectionManager,
  type ConnectionManager,
  type ConnectionManagerOptions,
} from './connection/connectionManager'
import { animationFrameScheduler, type FrameScheduler } from './stores/frameScheduler'
import { createKeyedStore, type KeyedStore } from './stores/keyedStore'
import type { FeedErrorEvent, MarketDataSource, MarketEvent } from './types'

export const MAX_RECENT_TRADES = 50

/** Everything the UI needs from the market data layer. */
export interface MarketData {
  readonly connection: ConnectionManager
  readonly tickers: KeyedStore<ProductId, Ticker>
  /** Most recent first, bounded to MAX_RECENT_TRADES per product. */
  readonly trades: KeyedStore<ProductId, readonly Trade[]>
  getInstruments(): Promise<readonly Instrument[]>
}

export interface MarketDataOptions extends Omit<ConnectionManagerOptions, 'source'> {
  source: MarketDataSource
  scheduler?: FrameScheduler
  onFeedError?: (event: FeedErrorEvent) => void
}

export function createMarketData({
  source,
  scheduler = animationFrameScheduler,
  onFeedError = (event) => console.warn(`Market data feed error: ${event.message}`),
  ...connectionOptions
}: MarketDataOptions): MarketData {
  const connection = createConnectionManager({ source, ...connectionOptions })
  const tickers = createKeyedStore<ProductId, Ticker>(scheduler)
  const trades = createKeyedStore<ProductId, readonly Trade[]>(scheduler)

  connection.onEvent((event: MarketEvent) => {
    switch (event.type) {
      case 'ticker':
        tickers.set(event.ticker.productId, event.ticker)
        break
      case 'trade':
        trades.update(event.trade.productId, (recent = []) =>
          [event.trade, ...recent].slice(0, MAX_RECENT_TRADES),
        )
        break
      case 'error':
        onFeedError(event)
        break
      // Book events are handled by the order-book store (M6); heartbeats
      // only matter to the connection manager.
      default:
        break
    }
  })

  return {
    connection,
    tickers,
    trades,
    getInstruments: () => source.getInstruments(),
  }
}
