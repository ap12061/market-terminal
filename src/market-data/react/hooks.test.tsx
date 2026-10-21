import { act, render, renderHook, screen } from '@testing-library/react'
import { Profiler, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { compareDecimals, type ProductId, type Ticker } from '@/domain'
import { BTC, ETH, createFakeSource, makeTicker, makeTrade } from '@/test/fakeMarketDataSource'
import { createMarketData } from '../marketData'
import { createManualScheduler } from '../stores/frameScheduler'
import {
  useConnectionState,
  useMarketData,
  useRecentTrades,
  useTicker,
  useTickerSelector,
} from './hooks'
import { MarketDataProvider } from './MarketDataProvider'

function setup() {
  const fake = createFakeSource()
  const scheduler = createManualScheduler()
  const marketData = createMarketData({ source: fake.source, scheduler })
  const commits = new Map<string, number>()
  const countCommit = (id: string) => commits.set(id, (commits.get(id) ?? 0) + 1)

  const Tracked = ({ id, children }: { id: string; children: ReactNode }) => (
    <Profiler id={id} onRender={countCommit}>
      {children}
    </Profiler>
  )
  const wrap = (children: ReactNode) => (
    <MarketDataProvider marketData={marketData}>{children}</MarketDataProvider>
  )

  const emitTicker = (productId: ProductId, price: string) =>
    fake.emit({ type: 'ticker', ticker: makeTicker(productId, price) })
  const flushFrame = () => act(() => scheduler.flush())

  return { fake, scheduler, marketData, commits, Tracked, wrap, emitTicker, flushFrame }
}

function PriceRow({ productId }: { productId: ProductId }) {
  const ticker = useTicker(productId)
  return <li data-testid={productId}>{ticker?.price ?? '—'}</li>
}

const direction = (ticker: Ticker | undefined) =>
  ticker && (compareDecimals(ticker.price, ticker.open24h) >= 0 ? 'up' : 'down')

function DirectionBadge({ productId }: { productId: ProductId }) {
  return <span data-testid="direction">{useTickerSelector(productId, direction) ?? '—'}</span>
}

function ConnectionStatus() {
  return <span data-testid="status">{useConnectionState().status}</span>
}

describe('market data hooks', () => {
  it('re-renders a row once per frame, however many ticks arrive, and never other rows', () => {
    const { fake, commits, Tracked, wrap, emitTicker, flushFrame } = setup()
    render(
      wrap(
        <ul>
          <Tracked id="BTC">
            <PriceRow productId={BTC} />
          </Tracked>
          <Tracked id="ETH">
            <PriceRow productId={ETH} />
          </Tracked>
        </ul>,
      ),
    )
    act(() => fake.open())
    commits.clear()

    act(() => {
      for (let cents = 1; cents <= 10; cents++)
        emitTicker(BTC, `100.${String(cents).padStart(2, '0')}`)
    })
    expect(commits.get('BTC')).toBeUndefined()
    expect(screen.getByTestId(BTC)).toHaveTextContent('—')

    flushFrame()
    expect(commits.get('BTC')).toBe(1)
    expect(commits.get('ETH')).toBeUndefined()
    expect(screen.getByTestId(BTC)).toHaveTextContent('100.10')
  })

  it('re-renders a selector consumer only when the selected value changes', () => {
    const { fake, commits, Tracked, wrap, emitTicker, flushFrame } = setup()
    render(
      wrap(
        <Tracked id="badge">
          <DirectionBadge productId={BTC} />
        </Tracked>,
      ),
    )
    act(() => fake.open())
    commits.clear()

    emitTicker(BTC, '101.00')
    flushFrame()
    expect(screen.getByTestId('direction')).toHaveTextContent('up')
    expect(commits.get('badge')).toBe(1)

    for (const price of ['102.00', '150.00', '100.00']) {
      emitTicker(BTC, price)
      flushFrame()
    }
    expect(commits.get('badge')).toBe(1)

    emitTicker(BTC, '99.99')
    flushFrame()
    expect(screen.getByTestId('direction')).toHaveTextContent('down')
    expect(commits.get('badge')).toBe(2)
  })

  it('subscribes while mounted and unsubscribes on unmount', async () => {
    const { fake, wrap } = setup()
    const view = render(wrap(<PriceRow productId={BTC} />))
    act(() => fake.open())
    expect(fake.calls).toEqual([{ action: 'subscribe', productIds: [BTC], channels: ['ticker'] }])

    view.rerender(wrap(null))
    await act(() => Promise.resolve())

    expect(fake.calls.at(-1)).toEqual({
      action: 'unsubscribe',
      productIds: [BTC],
      channels: ['ticker'],
    })
  })

  it('keeps the connection up while the provider is mounted', () => {
    const { fake, wrap } = setup()
    const view = render(wrap(<ConnectionStatus />))
    expect(screen.getByTestId('status')).toHaveTextContent('connecting')

    act(() => fake.open())
    expect(screen.getByTestId('status')).toHaveTextContent('open')

    act(() => fake.drop())
    expect(screen.getByTestId('status')).toHaveTextContent('reconnecting')

    view.unmount()
    expect(fake.source.getStatus().state).toBe('closed')
  })

  it('returns recent trades newest first, with a stable empty list before any arrive', () => {
    const { fake, wrap, flushFrame } = setup()
    const { result } = renderHook(() => useRecentTrades(BTC), {
      wrapper: ({ children }) => wrap(children),
    })
    const empty = result.current
    act(() => fake.open())
    expect(result.current).toBe(empty)

    act(() => {
      for (let id = 1; id <= 3; id++) fake.emit({ type: 'trade', trade: makeTrade(BTC, id) })
    })
    flushFrame()

    expect(result.current.map((trade) => trade.id)).toEqual([`${BTC}-3`, `${BTC}-2`, `${BTC}-1`])
  })

  it('explains the problem when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useMarketData())).toThrow(
      'useMarketData must be used inside a <MarketDataProvider>',
    )
  })
})
