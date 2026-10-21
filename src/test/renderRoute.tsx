import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { AppProviders } from '@/app/AppProviders'
import { routes } from '@/app/routes'

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
}

/** Renders the real route tree at `path` with fresh, test-friendly providers. */
export function renderRoute(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const user = userEvent.setup()
  const utils = render(
    <AppProviders queryClient={createTestQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { ...utils, user, router }
}
