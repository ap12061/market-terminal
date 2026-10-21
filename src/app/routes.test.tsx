import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '@/test/renderRoute'

describe('routing', () => {
  it('renders the terminal at /', async () => {
    renderRoute('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Markets' })).toBeInTheDocument()
  })

  it('renders a 404 page for unknown routes and links back home', async () => {
    const { user, router } = renderRoute('/does-not-exist')

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Go back home' }))

    expect(router.state.location.pathname).toBe('/')
    expect(await screen.findByRole('heading', { name: 'Markets' })).toBeInTheDocument()
  })

  it('provides a skip link to the main content', async () => {
    renderRoute('/')

    expect(await screen.findByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#main',
    )
  })
})
