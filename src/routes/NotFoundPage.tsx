import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-title">
      <h1 id="not-found-title">Page not found</h1>
      <p>
        The page you're looking for doesn't exist. <Link to="/">Go back home</Link>.
      </p>
    </section>
  )
}
