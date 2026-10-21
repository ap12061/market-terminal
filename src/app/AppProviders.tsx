import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState, type ReactNode } from 'react'
import { MarketDataProvider, type MarketData } from '@/market-data'
import { createAppMarketData } from './marketData'
import { createQueryClient } from './queryClient'

interface AppProvidersProps {
  children: ReactNode
  /** Injected in tests so each test gets an isolated cache. */
  queryClient?: QueryClient
  /** Injected in tests to control the feed. */
  marketData?: MarketData
}

export function AppProviders({ children, queryClient, marketData }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient())
  const [market] = useState(() => marketData ?? createAppMarketData())

  return (
    <QueryClientProvider client={client}>
      <MarketDataProvider marketData={market}>{children}</MarketDataProvider>
      {/* Tree-shaken out of production builds by the package itself. */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
