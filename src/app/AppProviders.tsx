import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useMemo, useState, type ReactNode } from 'react'
import { MarketDataProvider, type MarketData } from '@/market-data'
import { FeedContext, type FeedControl } from './feedContext'
import { createMarketDataForFeed, readStoredFeed, storeFeed, type Feed } from './marketData'
import { createQueryClient } from './queryClient'

interface AppProvidersProps {
  children: ReactNode
  /** Injected in tests so each test gets an isolated cache. */
  queryClient?: QueryClient
  /** Injected in tests to control the feed; disables the live/demo switch. */
  marketData?: MarketData
}

export function AppProviders({ children, queryClient, marketData }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient())
  const [feed, setFeed] = useState<Feed>(readStoredFeed)

  // A new runtime per feed: the provider stops the old connection and starts
  // the new one, and components resubscribe through the new context value.
  const market = useMemo(() => marketData ?? createMarketDataForFeed(feed), [marketData, feed])
  const feedControl = useMemo<FeedControl | null>(
    () =>
      marketData
        ? null
        : {
            feed,
            setFeed: (next) => {
              storeFeed(next)
              setFeed(next)
            },
          },
    [marketData, feed],
  )

  return (
    <QueryClientProvider client={client}>
      <FeedContext value={feedControl}>
        <MarketDataProvider marketData={market}>{children}</MarketDataProvider>
      </FeedContext>
      {/* Tree-shaken out of production builds by the package itself. */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
