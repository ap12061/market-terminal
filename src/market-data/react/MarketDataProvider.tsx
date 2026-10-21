import { useEffect, type ReactNode } from 'react'
import type { MarketData } from '../marketData'
import { MarketDataContext } from './context'

interface MarketDataProviderProps {
  marketData: MarketData
  children: ReactNode
}

/** Provides market data to the tree, and keeps the feed connected while mounted. */
export function MarketDataProvider({ marketData, children }: MarketDataProviderProps) {
  useEffect(() => {
    marketData.connection.start()
    return () => marketData.connection.stop()
  }, [marketData])

  return <MarketDataContext value={marketData}>{children}</MarketDataContext>
}
