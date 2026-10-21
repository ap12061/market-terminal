import { RouterProvider, createBrowserRouter } from 'react-router'
import { AppProviders } from './AppProviders'
import { routes } from './routes'

const router = createBrowserRouter(routes)

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  )
}
