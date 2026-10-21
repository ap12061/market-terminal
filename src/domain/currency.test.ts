import { describe, expect, it } from 'vitest'
import { InvalidValueError } from './brand'
import { currencyMinorUnits, parseCurrencyCode } from './currency'

describe('parseCurrencyCode', () => {
  it.each(['USD', 'EUR', 'GBP', 'JPY'])('accepts %s', (code) => {
    expect(parseCurrencyCode(code)).toBe(code)
  })

  it.each(['usd', 'US', 'USDT', 'BTC', ''])('rejects %j', (code) => {
    expect(() => parseCurrencyCode(code)).toThrow(InvalidValueError)
  })
})

describe('currencyMinorUnits', () => {
  it.each([
    ['USD', 2],
    ['JPY', 0],
    ['BHD', 3],
  ])('%s has %i minor-unit digits', (code, expected) => {
    expect(currencyMinorUnits(parseCurrencyCode(code))).toBe(expected)
  })
})
