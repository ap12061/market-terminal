import type { RouteObject } from 'react-router'
import { RootLayout } from './RootLayout'
import { ErrorPage } from '@/routes/ErrorPage'
import { NotFoundPage } from '@/routes/NotFoundPage'
import { TerminalPage } from '@/routes/TerminalPage'

// Exported separately from the router instance so tests can mount
// the same tree in a memory router.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <TerminalPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
