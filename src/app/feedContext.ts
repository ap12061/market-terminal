import { createContext } from 'react'
import type { Feed } from './marketData'

export interface FeedControl {
  feed: Feed
  setFeed: (feed: Feed) => void
}

/** Absent when market data is injected (tests), which hides the switch. */
export const FeedContext = createContext<FeedControl | null>(null)
