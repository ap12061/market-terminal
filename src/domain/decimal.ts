import BigJs, { type Big } from 'big.js'
import { InvalidValueError, type Brand } from './brand'

/**
 * An exact decimal value kept as a plain string, e.g. "84489.56".
 *
 * Market data arrives as strings, and stays a string through the app: it's
 * cheap to store, compare for equality and pass to `Intl.NumberFormat`, which
 * formats numeric strings exactly. Arithmetic goes through big.js.
 */
export type DecimalString = Brand<string, 'DecimalString'>

/**
 * - `down`: toward zero (truncate)
 * - `up`: away from zero
 * - `halfUp`: nearest, ties away from zero
 * - `halfEven`: nearest, ties to even ("banker's rounding"), which avoids
 *   systematic upward bias when many values are rounded and summed
 */
export type RoundingMode = 'down' | 'up' | 'halfUp' | 'halfEven'

// A private constructor so our settings never leak to or from other big.js users.
const Decimal = BigJs()
Decimal.DP = 20
Decimal.RM = Decimal.roundHalfEven
// Never switch to exponential notation when converting to a string.
Decimal.NE = -1e6
Decimal.PE = 1e6

const ROUNDING: Record<RoundingMode, BigJs.RoundingMode> = {
  down: Decimal.roundDown,
  up: Decimal.roundUp,
  halfUp: Decimal.roundHalfUp,
  halfEven: Decimal.roundHalfEven,
}

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/

export function isDecimalString(value: unknown): value is DecimalString {
  return typeof value === 'string' && DECIMAL_PATTERN.test(value)
}

/** Validates a plain decimal string (no exponents, separators or whitespace). */
export function parseDecimal(value: string): DecimalString {
  if (!isDecimalString(value)) throw new InvalidValueError('decimal', value)
  return value
}

function toBig(value: DecimalString): Big {
  return new Decimal(value)
}

function fromBig(value: Big, places?: number): DecimalString {
  const fixed = places === undefined ? value.toFixed() : value.toFixed(places)
  // big.js keeps the sign of negative zero ("-0.00"), which would display oddly.
  return (/^-0(\.0+)?$/.test(fixed) ? fixed.slice(1) : fixed) as DecimalString
}

/** Number of digits after the decimal point, ignoring trailing zeros: "0.010" → 2. */
export function decimalPlaces(value: DecimalString): number {
  const big = toBig(value)
  return Math.max(0, big.c.length - big.e - 1)
}

export function compareDecimals(a: DecimalString, b: DecimalString): -1 | 0 | 1 {
  return toBig(a).cmp(toBig(b))
}

export function isZero(value: DecimalString): boolean {
  return toBig(value).eq(0)
}

export function addDecimals(a: DecimalString, b: DecimalString): DecimalString {
  return fromBig(toBig(a).plus(b))
}

export function subtractDecimals(a: DecimalString, b: DecimalString): DecimalString {
  return fromBig(toBig(a).minus(b))
}

export function multiplyDecimals(a: DecimalString, b: DecimalString): DecimalString {
  return fromBig(toBig(a).times(b))
}

/**
 * Divides to 20 decimal places (banker's rounding); round the result to the
 * precision you need. Throws on division by zero.
 */
export function divideDecimals(a: DecimalString, b: DecimalString): DecimalString {
  const divisor = toBig(b)
  if (divisor.eq(0)) throw new InvalidValueError('divisor (must be non-zero)', b)
  return fromBig(toBig(a).div(divisor))
}

export function roundToDecimalPlaces(
  value: DecimalString,
  places: number,
  mode: RoundingMode = 'halfEven',
): DecimalString {
  return fromBig(toBig(value).round(places, ROUNDING[mode]), places)
}

/**
 * Rounds to a multiple of `increment` (an instrument's tick size), keeping
 * the increment's precision: 84489.567 at "0.05" → "84489.55".
 *
 * Order-book grouping uses `down` for bids and `up` for asks, so grouped
 * levels never show a better price than is actually available.
 */
export function roundToIncrement(
  value: DecimalString,
  increment: DecimalString,
  mode: RoundingMode = 'halfEven',
): DecimalString {
  const step = toBig(increment)
  if (step.lte(0)) throw new InvalidValueError('increment (must be positive)', increment)

  const rounded = toBig(value).div(step).round(0, ROUNDING[mode]).times(step)
  return fromBig(rounded, decimalPlaces(increment))
}

/**
 * Relative change from `from` to `to` as a fraction (0.0123 = +1.23%),
 * or `null` when `from` is zero and the change is undefined.
 */
export function relativeChange(from: DecimalString, to: DecimalString): DecimalString | null {
  const base = toBig(from)
  if (base.eq(0)) return null
  return fromBig(toBig(to).minus(base).div(base.abs()).round(10))
}

/**
 * How many whole increments make up `value`: ("84489.56", "0.01") → 8448956.
 * Throws unless `value` is an exact multiple that fits in a safe integer.
 */
export function countIncrements(value: DecimalString, increment: DecimalString): number {
  const quotient = toBig(value).div(increment)
  const count = quotient.toNumber()
  if (!quotient.eq(quotient.round(0, Decimal.roundDown)) || !Number.isSafeInteger(count)) {
    throw new InvalidValueError(`multiple of ${increment}`, value)
  }
  return count
}

/** The inverse of `countIncrements`: (8448956, "0.01") → "84489.56". */
export function scaleIncrement(count: number, increment: DecimalString): DecimalString {
  if (!Number.isSafeInteger(count)) throw new InvalidValueError('increment count', count)
  return fromBig(toBig(increment).times(count), decimalPlaces(increment))
}
