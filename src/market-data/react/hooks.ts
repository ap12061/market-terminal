import { useQuery } from '@tanstack/react-query'
import { use, useEffect, useSyncExternalStore } from 'react'
import type { ProductId, Ticker, Trade } from '@/domain'
import type { ConnectionState } from '../connection/connectionManager'
import type { MarketData } from '../marketData'
import type { Channel } from '../types'
import { MarketDataContext } from './context'
import { useStoreSelector, useStoreValue } from './storeHooks'

export function useMarketData(): MarketData {
  const marketData = use(MarketDataContext)
  if (!marketData) throw new Error('useMarketData must be used inside a <MarketDataProvider>')
  return marketData
}

export function useConnectionState(): ConnectionState {
  const { connection } = useMarketData()
  return useSyncExternalStore(connection.onStateChange, connection.getState, connection.getState)
}

/** Keeps the feed subscribed to a product's channel while the component is mounted. */
export function useMarketSubscription(productId: ProductId, channel: Channel): void {
  const { connection } = useMarketData()
  useEffect(() => connection.subscribe(productId, channel), [connection, productId, channel])
}

export function useTicker(productId: ProductId): Ticker | undefined {
  const { tickers } = useMarketData()
  useMarketSubscription(productId, 'ticker')
  return useStoreValue(tickers, productId)
}

/** Like `useTicker`, but re-renders only when the selected value changes. */
export function useTickerSelector<S>(
  productId: ProductId,
  selector: (ticker: Ticker | undefined) => S,
  isEqual?: (a: S, b: S) => boolean,
): S {
  const { tickers } = useMarketData()
  useMarketSubscription(productId, 'ticker')
  return useStoreSelector(tickers, productId, selector, isEqual)
}

const NO_TRADES: readonly Trade[] = []

/** Most recent first. */
export function useRecentTrades(productId: ProductId): readonly Trade[] {
  const { trades } = useMarketData()
  useMarketSubscription(productId, 'trades')
  return useStoreValue(trades, productId) ?? NO_TRADES
}

/** The feed's tradable instruments. Rarely changes, so it's cached for the session. */
export function useInstruments() {
  const marketData = useMarketData()
  return useQuery({
    queryKey: ['instruments', marketData.sourceId],
    queryFn: () => marketData.getInstruments(),
    staleTime: Infinity,
  })
}
