import { createMarketData, createSimulatedSource, type MarketData } from '@/market-data'

/** The app's market data runtime. The simulated feed until the live adapter lands (M5). */
export function createAppMarketData(): MarketData {
  return createMarketData({ source: createSimulatedSource() })
}
