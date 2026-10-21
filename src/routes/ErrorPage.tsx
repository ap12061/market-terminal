import { isRouteErrorResponse, useRouteError } from 'react-router'

function getErrorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`
  if (error instanceof Error) return error.message
  return 'Unknown error'
}

export function ErrorPage() {
  const error = useRouteError()

  return (
    <main className="layout__main" role="alert">
      <h1>Something went wrong</h1>
      <p>{getErrorMessage(error)}</p>
      <button type="button" onClick={() => window.location.reload()}>
        Reload the page
      </button>
    </main>
  )
}
