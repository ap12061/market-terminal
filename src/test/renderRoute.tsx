import { QueryClient } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { AppProviders } from '@/app/AppProviders'
import { routes } from '@/app/routes'
import type { ProductId } from '@/domain'
import {
  createManualScheduler,
  createMarketData,
  DEFAULT_SIMULATED_INSTRUMENTS,
} from '@/market-data'
import { createFakeSource, makeTicker } from './fakeMarketDataSource'

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
}

export const TEST_INSTRUMENTS = DEFAULT_SIMULATED_INSTRUMENTS.map((config) => config.instrument)

/**
 * Renders the real route tree at `path` with fresh, test-friendly providers.
 * Market data comes from a fake feed the test controls, committed to the
 * UI only when the test calls `flushFrame`.
 */
export function renderRoute(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const user = userEvent.setup()
  const feed = createFakeSource(TEST_INSTRUMENTS)
  const scheduler = createManualScheduler()
  const marketData = createMarketData({ source: feed.source, scheduler })

  const utils = render(
    <AppProviders queryClient={createTestQueryClient()} marketData={marketData}>
      <RouterProvider router={router} />
    </AppProviders>,
  )

  return {
    ...utils,
    user,
    router,
    feed,
    marketData,
    /** Opens the fake feed's connection. */
    connect: () => act(() => feed.open()),
    /** Sends tickers ({ "BTC-USD": "84000.00" }) and commits them to the UI. */
    sendPrices: (prices: Record<string, string>) =>
      act(() => {
        for (const [productId, price] of Object.entries(prices)) {
          feed.emit({ type: 'ticker', ticker: makeTicker(productId as ProductId, price) })
        }
        scheduler.flush()
      }),
  }
}
