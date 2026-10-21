import { describe, expect, it } from 'vitest'
import { parseCurrencyCode } from './currency'
import { parseDecimal as d } from './decimal'
import { formatCompact, formatMoney, formatPercentChange, formatPrice } from './format'

// Intl separates currency symbols and amounts with a no-break space in some locales.
const NBSP = ' '

describe('formatPrice', () => {
  it('formats at the tick size, padding trailing zeros', () => {
    expect(formatPrice(d('84489.5'), d('0.01'), 'en-US')).toBe('84,489.50')
  })

  it('rounds to the tick size', () => {
    expect(formatPrice(d('84489.7'), d('0.5'), 'en-US')).toBe('84,489.5')
    expect(formatPrice(d('84489.4'), d('1'), 'en-US')).toBe('84,489')
  })

  it('uses locale-specific separators', () => {
    expect(formatPrice(d('84489.5'), d('0.01'), 'de-DE')).toBe('84.489,50')
  })

  it('stays exact where a float would not', () => {
    const value = '12345678901234567.125'

    expect(formatPrice(d(value), d('0.01'), 'en-US')).toBe('12,345,678,901,234,567.12')
    expect(new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(Number(value))).toBe(
      '12,345,678,901,234,568.00',
    )
  })
})

describe('formatMoney', () => {
  it('rounds to the currency minor units', () => {
    expect(formatMoney(d('1234.5'), parseCurrencyCode('USD'), 'en-US')).toBe('$1,234.50')
    expect(formatMoney(d('1234.5'), parseCurrencyCode('JPY'), 'en-US')).toBe('¥1,234')
    expect(formatMoney(d('1.2345'), parseCurrencyCode('BHD'), 'en-US')).toBe(`BHD${NBSP}1.234`)
  })

  it('formats for the locale', () => {
    expect(formatMoney(d('1234.5'), parseCurrencyCode('EUR'), 'de-DE')).toBe(`1.234,50${NBSP}€`)
  })
})

describe('formatPercentChange', () => {
  it.each([
    ['0.01234', '+1.23%'],
    ['-0.0123', '-1.23%'],
    ['0', '0.00%'],
    ['1.5', '+150.00%'],
  ])('formats %s as %s', (fraction, expected) => {
    expect(formatPercentChange(d(fraction), 'en-US')).toBe(expected)
  })

  it('does not show a sign for changes that round to zero', () => {
    expect(formatPercentChange(d('-0.00001'), 'en-US')).toBe('0.00%')
  })

  it('supports a custom number of digits', () => {
    expect(formatPercentChange(d('0.012345'), 'en-US', 1)).toBe('+1.2%')
  })
})

describe('formatCompact', () => {
  it.each([
    ['7417.71455984', '7.42K'],
    ['1234567890', '1.23B'],
    ['950', '950'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatCompact(d(value), 'en-US')).toBe(expected)
  })
})
