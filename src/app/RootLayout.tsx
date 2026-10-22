import { Link, Outlet } from 'react-router'
import { ConnectionIndicator } from '@/features/connection-status'
import { useMarketData } from '@/market-data'
import { FeedSwitch } from './FeedSwitch'

const ATTRIBUTION: Record<string, string> = {
  coinbase: 'Market data: Coinbase Advanced Trade public feed. Not investment advice.',
  simulated: 'Market data: simulated by a seeded random model. Prices are not real.',
}

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
        </Link>
        <div className="layout__controls">
          <FeedSwitch />
          <ConnectionIndicator />
        </div>
      </header>
      <main id="main" className="layout__main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="layout__footer">{ATTRIBUTION[sourceId]}</footer>
    </div>
  )
}
