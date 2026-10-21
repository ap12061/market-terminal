import type { RouteObject } from 'react-router'
import { RootLayout } from './RootLayout'
import { ErrorPage } from '@/routes/ErrorPage'
import { HomePage } from '@/routes/HomePage'
import { NotFoundPage } from '@/routes/NotFoundPage'

// Exported separately from the router instance so tests can mount
// the same tree in a memory router.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
