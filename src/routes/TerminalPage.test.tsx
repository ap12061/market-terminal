import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '@/test/renderRoute'

const rowNames = () =>
  within(screen.getByRole('table'))
    .getAllByRole('rowheader')
    .map((cell) => cell.textContent)

describe('TerminalPage', () => {
  it('lists every instrument and selects the first by default', async () => {
    renderRoute('/')

    expect(await screen.findByRole('heading', { level: 2, name: 'BTC / USD' })).toBeInTheDocument()
    expect(rowNames()).toEqual(['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'DOGE/USD'])
  })

  it('shows prices once they arrive', async () => {
    const { connect, sendPrices } = renderRoute('/')
    await screen.findByRole('table')
    connect()
    sendPrices({ 'ETH-USD': '3210.5' })

    const ethRow = screen.getByRole('row', { name: /ETH\/USD/ })
    expect(within(ethRow).getByText('3,210.50')).toBeInTheDocument()
  })

  it('selects the instrument from the URL', async () => {
    renderRoute('/?symbol=SOL-USD')

    expect(await screen.findByRole('heading', { level: 2, name: 'SOL / USD' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'SOL/USD' })).toHaveAttribute('aria-current', 'true')
  })

  it('falls back to the first instrument for an unknown symbol', async () => {
    renderRoute('/?symbol=NOPE-USD')

    expect(await screen.findByRole('heading', { level: 2, name: 'BTC / USD' })).toBeInTheDocument()
  })

  it('puts the selected instrument in the URL, as a new history entry', async () => {
    const { user, router } = renderRoute('/')
    await user.click(await screen.findByRole('button', { name: 'XRP/USD' }))

    expect(router.state.location.search).toBe('?symbol=XRP-USD')
    expect(router.state.historyAction).toBe('PUSH')
    expect(screen.getByRole('heading', { level: 2, name: 'XRP / USD' })).toBeInTheDocument()
  })

  it('sorts from the URL, and keeps sorting as prices move', async () => {
    const { connect, sendPrices } = renderRoute('/?sort=price:desc')
    await screen.findByRole('table')
    connect()
    sendPrices({ 'BTC-USD': '84000', 'ETH-USD': '3200', 'SOL-USD': '180' })

    // Instruments without data sort last, in feed order.
    expect(rowNames()).toEqual(['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'DOGE/USD'])
    expect(screen.getByRole('columnheader', { name: /Price/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )

    sendPrices({ 'SOL-USD': '90000' })
    expect(rowNames()[0]).toBe('SOL/USD')
  })

  it('cycles a column through descending, ascending and unsorted, replacing history', async () => {
    const { user, router } = renderRoute('/')
    const header = await screen.findByRole('columnheader', { name: /24h/ })
    const button = within(header).getByRole('button')

    await user.click(button)
    expect(router.state.location.search).toBe('?sort=change%3Adesc')
    expect(router.state.historyAction).toBe('REPLACE')

    await user.click(button)
    expect(header).toHaveAttribute('aria-sort', 'ascending')

    await user.click(button)
    expect(header).not.toHaveAttribute('aria-sort')
    expect(router.state.location.search).toBe('')
  })

  it('pauses re-sorting while the pointer is over the list', async () => {
    const { user, connect, sendPrices } = renderRoute('/?sort=price:desc')
    await screen.findByRole('table')
    connect()
    sendPrices({ 'BTC-USD': '84000', 'ETH-USD': '3200' })

    await user.hover(screen.getByRole('button', { name: 'ETH/USD' }))
    sendPrices({ 'ETH-USD': '99000' })
    expect(rowNames().slice(0, 2)).toEqual(['BTC/USD', 'ETH/USD'])
    expect(screen.getByText('Sorting paused')).toBeInTheDocument()

    await user.unhover(screen.getByRole('table'))
    expect(rowNames().slice(0, 2)).toEqual(['ETH/USD', 'BTC/USD'])
  })
})
