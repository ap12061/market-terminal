import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMarketData, MarketDataProvider } from '@/market-data'
import { createManualScheduler } from '@/market-data/stores/frameScheduler'
import { createFakeSource } from '@/test/fakeMarketDataSource'
import { ConnectionIndicator } from './ConnectionIndicator'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function setup() {
  const fake = createFakeSource()
  const marketData = createMarketData({
    source: fake.source,
    scheduler: createManualScheduler(),
    random: () => 0.999_999,
  })
  render(
    <MarketDataProvider marketData={marketData}>
      <ConnectionIndicator />
    </MarketDataProvider>,
  )
  return { fake }
}

describe('ConnectionIndicator', () => {
  it('reports connecting, then live', () => {
    const { fake } = setup()
    expect(screen.getByRole('status')).toHaveTextContent('Market data: Connecting…')

    act(() => fake.open())
    expect(screen.getByRole('status')).toHaveTextContent('Market data: Live')
  })

  it('counts down to the next retry, outside the live region', () => {
    const { fake } = setup()
    act(() => fake.open())
    act(() => fake.drop('Network error'))

    expect(screen.getByRole('status')).toHaveTextContent('Market data: Disconnected')
    expect(screen.getByText('retrying in 1s')).toHaveAttribute('title', 'Network error')
    expect(screen.getByRole('status')).not.toHaveTextContent('retrying')
  })

  it('shows how long the feed has been silent', () => {
    const { fake } = setup()
    act(() => fake.open())
    act(() => vi.advanceTimersByTime(3_000))
    expect(screen.getByRole('status')).toHaveTextContent('Delayed')
    expect(screen.getByText('no data for 3s')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(2_000))
    expect(screen.getByText('no data for 5s')).toBeInTheDocument()
  })
})
