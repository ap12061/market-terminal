import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FeedContext } from './feedContext'
import { FeedSwitch } from './FeedSwitch'
import type { Feed } from './marketData'

function renderSwitch(feed: Feed) {
  const setFeed = vi.fn<(feed: Feed) => void>()
  render(
    <FeedContext value={{ feed, setFeed }}>
      <FeedSwitch />
    </FeedContext>,
  )
  return { setFeed }
}

describe('FeedSwitch', () => {
  it('is a labelled radio group showing the current feed', () => {
    renderSwitch('live')

    expect(screen.getByRole('group', { name: 'Market data source' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Live' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Simulated' })).not.toBeChecked()
  })

  it('switches feed when an option is chosen', async () => {
    const { setFeed } = renderSwitch('live')
    await userEvent.click(screen.getByRole('radio', { name: 'Simulated' }))

    expect(setFeed).toHaveBeenCalledWith('demo')
  })

  it('renders nothing without a feed control (injected market data)', () => {
    const { container } = render(<FeedSwitch />)

    expect(container).toBeEmptyDOMElement()
  })
})
