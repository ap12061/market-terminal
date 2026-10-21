import { createContext } from 'react'
import type { MarketData } from '../marketData'

export const MarketDataContext = createContext<MarketData | null>(null)
