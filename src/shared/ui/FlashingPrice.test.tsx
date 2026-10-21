import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { parseDecimal } from '@/domain'
import { FlashingPrice } from './FlashingPrice'

const increment = parseDecimal('0.01')
const renderPrice = (price: string) => (
  <FlashingPrice price={parseDecimal(price)} increment={increment} />
)

describe('FlashingPrice', () => {
  it('does not flash on first render', () => {
    render(renderPrice('100'))

    expect(screen.getByText('100.00')).not.toHaveClass('flashing-price--up', 'flashing-price--down')
  })

  it('flashes in the direction of each change, and keeps it for unchanged prices', () => {
    const { rerender } = render(renderPrice('100'))

    rerender(renderPrice('101'))
    expect(screen.getByText('101.00')).toHaveClass('flashing-price--up')

    rerender(renderPrice('100.5'))
    expect(screen.getByText('100.50')).toHaveClass('flashing-price--down')

    rerender(renderPrice('100.50'))
    expect(screen.getByText('100.50')).toHaveClass('flashing-price--down')
  })

  it('compares prices numerically, not as text', () => {
    const { rerender } = render(renderPrice('9.99'))
    rerender(renderPrice('10.00'))

    expect(screen.getByText('10.00')).toHaveClass('flashing-price--up')
  })
})
