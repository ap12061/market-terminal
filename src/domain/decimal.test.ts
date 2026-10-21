import { describe, expect, it } from 'vitest'
import { InvalidValueError } from './brand'
import {
  addDecimals,
  compareDecimals,
  countIncrements,
  decimalPlaces,
  isZero,
  multiplyDecimals,
  parseDecimal,
  relativeChange,
  roundToDecimalPlaces,
  roundToIncrement,
  scaleIncrement,
  subtractDecimals,
} from './decimal'

const d = parseDecimal

describe('parseDecimal', () => {
  it.each(['0', '-1.5', '84489.56', '0.00000001', '12345678901234567890.123'])(
    'accepts %j',
    (value) => {
      expect(parseDecimal(value)).toBe(value)
    },
  )

  it.each(['', ' 1', '1e5', '1,000', '1.', '.5', '+1', 'NaN', 'Infinity', '0x10'])(
    'rejects %j',
    (value) => {
      expect(() => parseDecimal(value)).toThrow(InvalidValueError)
    },
  )
})

describe('decimalPlaces', () => {
  it.each([
    ['0.01', 2],
    ['1', 0],
    ['100', 0],
    ['0.010', 2],
    ['0.00000001', 8],
  ])('%s has %i decimal places', (value, expected) => {
    expect(decimalPlaces(d(value))).toBe(expected)
  })
})

describe('arithmetic', () => {
  it('is exact where floating point is not', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(addDecimals(d('0.1'), d('0.2'))).toBe('0.3')
  })

  it('subtracts and multiplies exactly', () => {
    expect(subtractDecimals(d('84489.56'), d('84489.55'))).toBe('0.01')
    expect(multiplyDecimals(d('84489.56'), d('0.0001'))).toBe('8.448956')
  })

  it('compares numerically, not lexically', () => {
    const values = ['10', '9.5', '-1', '10.00', '0'].map(d)
    expect(values.toSorted(compareDecimals)).toEqual(['-1', '0', '9.5', '10', '10.00'])
  })

  it('treats any representation of zero as zero', () => {
    expect(isZero(d('0.000'))).toBe(true)
    expect(isZero(d('-0'))).toBe(true)
    expect(isZero(d('0.001'))).toBe(false)
  })
})

describe('roundToDecimalPlaces', () => {
  it("uses banker's rounding by default", () => {
    expect(roundToDecimalPlaces(d('0.125'), 2)).toBe('0.12')
    expect(roundToDecimalPlaces(d('0.135'), 2)).toBe('0.14')
  })

  it('never produces negative zero', () => {
    expect(roundToDecimalPlaces(d('-0.001'), 2)).toBe('0.00')
  })
})

describe('roundToIncrement', () => {
  it('rounds to a multiple of the tick size', () => {
    expect(roundToIncrement(d('84489.567'), d('0.05'))).toBe('84489.55')
    expect(roundToIncrement(d('84489'), d('10'))).toBe('84490')
  })

  it("keeps the increment's precision, including trailing zeros", () => {
    expect(roundToIncrement(d('84489'), d('0.01'))).toBe('84489.00')
    expect(roundToIncrement(d('84489.57'), d('0.5'), 'up')).toBe('84490.0')
  })

  it.each([
    ['halfEven', '0.12'],
    ['halfUp', '0.13'],
    ['down', '0.12'],
    ['up', '0.13'],
  ] as const)('supports %s rounding on ties', (mode, expected) => {
    expect(roundToIncrement(d('0.125'), d('0.01'), mode)).toBe(expected)
  })

  it('groups bids down and asks up for order-book levels', () => {
    expect(roundToIncrement(d('84489.57'), d('0.5'), 'down')).toBe('84489.5')
    expect(roundToIncrement(d('84489.57'), d('0.5'), 'up')).toBe('84490.0')
  })

  it('stays exact beyond floating-point precision', () => {
    expect(roundToIncrement(d('12345678901234567.125'), d('0.01'))).toBe('12345678901234567.12')
  })

  it.each(['0', '-0.01'])('rejects a non-positive increment (%s)', (increment) => {
    expect(() => roundToIncrement(d('1'), d(increment))).toThrow(InvalidValueError)
  })
})

describe('relativeChange', () => {
  it.each([
    ['100', '101.5', '0.015'],
    ['100', '99', '-0.01'],
    ['100', '100', '0'],
    ['3', '1', '-0.6666666667'],
  ])('from %s to %s is %s', (from, to, expected) => {
    expect(relativeChange(d(from), d(to))).toBe(expected)
  })

  it('measures change against the magnitude of a negative base', () => {
    expect(relativeChange(d('-100'), d('-50'))).toBe('0.5')
  })

  it('is undefined (null) from zero', () => {
    expect(relativeChange(d('0'), d('5'))).toBeNull()
  })
})

describe('countIncrements and scaleIncrement', () => {
  it.each([
    ['84489.56', '0.01', 8448956],
    ['0.18000', '0.00001', 18000],
    ['84490', '10', 8449],
    ['0', '0.01', 0],
    ['-1.5', '0.5', -3],
  ])('%s is %i increments of %s', (value, increment, count) => {
    expect(countIncrements(d(value), d(increment))).toBe(count)
  })

  it('rejects values that are not exact multiples', () => {
    expect(() => countIncrements(d('84489.565'), d('0.01'))).toThrow(InvalidValueError)
  })

  it('rejects counts beyond safe integer range', () => {
    expect(() => countIncrements(d('1'), d('0.00000000000000001'))).toThrow(InvalidValueError)
    expect(() => scaleIncrement(2 ** 53, d('1'))).toThrow(InvalidValueError)
    expect(() => scaleIncrement(1.5, d('1'))).toThrow(InvalidValueError)
  })

  it("scales back with the increment's precision", () => {
    expect(scaleIncrement(8448956, d('0.01'))).toBe('84489.56')
    expect(scaleIncrement(18000, d('0.00001'))).toBe('0.18000')
    expect(scaleIncrement(0, d('0.01'))).toBe('0.00')
  })
})
