import { Link, Outlet } from 'react-router'
import { ConnectionIndicator } from '@/features/connection-status'
import { useMarketData } from '@/market-data'

export function RootLayout() {
  const { sourceId } = useMarketData()

  return (
    <div className="layout">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="layout__header">
        <Link to="/" className="layout__brand">
          Market Terminal
          {sourceId === 'simulated' && <span className="layout__badge">Simulated data</span>}
        </Link>
        <ConnectionIndicator />
      </header>
      <main id="main" className="layout__main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
