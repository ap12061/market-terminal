import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState, type ReactNode } from 'react'
import { createQueryClient } from './queryClient'

interface AppProvidersProps {
  children: ReactNode
  /** Injected in tests so each test gets an isolated cache. */
  queryClient?: QueryClient
}

export function AppProviders({ children, queryClient }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient())

  return (
    <QueryClientProvider client={client}>
      {children}
      {/* Tree-shaken out of production builds by the package itself. */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
