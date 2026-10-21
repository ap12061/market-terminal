import { Link, Outlet } from 'react-router'

export function RootLayout() {
  return (
    <div className="layout">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="layout__header">
        <Link to="/" className="layout__brand">
          Portfolio Dashboard
        </Link>
      </header>
      <main id="main" className="layout__main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
