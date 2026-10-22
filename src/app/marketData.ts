import {
  createCoinbaseSource,
  createMarketData,
  createSimulatedSource,
  type MarketData,
} from '@/market-data'

export type Feed = 'live' | 'demo'

const STORAGE_KEY = 'market-terminal:feed'

/** The viewer's last choice. Storage can be unavailable (private mode, blocked cookies). */
export function readStoredFeed(): Feed {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'demo' ? 'demo' : 'live'
  } catch {
    return 'live'
  }
}

export function storeFeed(feed: Feed): void {
  try {
    localStorage.setItem(STORAGE_KEY, feed)
  } catch {
    // Not remembering the choice is fine.
  }
}

export function createMarketDataForFeed(feed: Feed): MarketData {
  return createMarketData({
    source: feed === 'live' ? createCoinbaseSource() : createSimulatedSource(),
  })
}
