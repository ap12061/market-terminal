import { describe, expect, it, vi } from 'vitest'
import { BTC, ETH, createFakeSource, makeTicker, makeTrade } from '@/test/fakeMarketDataSource'
import { createMarketData, MAX_RECENT_TRADES } from './marketData'
import { createManualScheduler } from './stores/frameScheduler'
import type { FeedErrorEvent } from './types'

function setup() {
  const fake = createFakeSource()
  const scheduler = createManualScheduler()
  const onFeedError = vi.fn<(event: FeedErrorEvent) => void>()
  const marketData = createMarketData({ source: fake.source, scheduler, onFeedError })
  marketData.connection.start()
  fake.open()
  return { fake, scheduler, marketData, onFeedError }
}

describe('createMarketData', () => {
  it('stores the latest ticker per product', () => {
    const { fake, scheduler, marketData } = setup()
    fake.emit({ type: 'ticker', ticker: makeTicker(BTC, '101.00') })
    fake.emit({ type: 'ticker', ticker: makeTicker(BTC, '102.00') })
    fake.emit({ type: 'ticker', ticker: makeTicker(ETH, '50.00') })
    scheduler.flush()

    expect(marketData.tickers.get(BTC)?.price).toBe('102.00')
    expect(marketData.tickers.get(ETH)?.price).toBe('50.00')
  })

  it('keeps recent trades newest first, bounded per product', () => {
    const { fake, scheduler, marketData } = setup()
    for (let id = 1; id <= MAX_RECENT_TRADES + 10; id++) {
      fake.emit({ type: 'trade', trade: makeTrade(BTC, id) })
    }
    scheduler.flush()

    const trades = marketData.trades.get(BTC) ?? []
    expect(trades).toHaveLength(MAX_RECENT_TRADES)
    expect(trades[0]?.id).toBe(`${BTC}-${MAX_RECENT_TRADES + 10}`)
    expect(trades.at(-1)?.id).toBe(`${BTC}-11`)
  })

  it('reports feed errors', () => {
    const { fake, onFeedError } = setup()
    fake.emit({ type: 'error', message: 'Unknown product' })

    expect(onFeedError).toHaveBeenCalledWith({ type: 'error', message: 'Unknown product' })
  })

  it('exposes the source instruments', async () => {
    const { marketData } = setup()

    await expect(marketData.getInstruments()).resolves.toEqual([])
  })
})
