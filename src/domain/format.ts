import { currencyMinorUnits, type CurrencyCode } from './currency'
import {
  decimalPlaces,
  roundToDecimalPlaces,
  roundToIncrement,
  type DecimalString,
} from './decimal'

// Rounding happens in our own decimal code; Intl only formats. Passing it a
// string (not a number) keeps digits exact even beyond float precision.
const asNumericLiteral = (value: DecimalString) => value as Intl.StringNumericLiteral

// Constructing an Intl.NumberFormat is far more expensive than calling it, and
// prices re-format on every tick, so instances are cached by their settings.
const formatters = new Map<string, Intl.NumberFormat>()

function getFormatter(locale: string | undefined, options: Intl.NumberFormatOptions) {
  const key = `${locale ?? ''}|${JSON.stringify(options)}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options)
    formatters.set(key, formatter)
  }
  return formatter
}

function fixedDigits(digits: number): Intl.NumberFormatOptions {
  return { minimumFractionDigits: digits, maximumFractionDigits: digits }
}

/** Formats a price at the instrument's tick size: ("84489.5", "0.01") → "84,489.50". */
export function formatPrice(
  price: DecimalString,
  increment: DecimalString,
  locale?: string,
): string {
  const rounded = roundToIncrement(price, increment)
  return getFormatter(locale, fixedDigits(decimalPlaces(increment))).format(
    asNumericLiteral(rounded),
  )
}

/** Formats an amount in a currency, rounded to its minor units (JPY has none). */
export function formatMoney(
  amount: DecimalString,
  currency: CurrencyCode,
  locale?: string,
): string {
  const digits = currencyMinorUnits(currency)
  const rounded = roundToDecimalPlaces(amount, digits)
  return getFormatter(locale, { style: 'currency', currency, ...fixedDigits(digits) }).format(
    asNumericLiteral(rounded),
  )
}

/** Formats a fraction as a signed percentage: "0.01234" → "+1.23%". */
export function formatPercentChange(fraction: DecimalString, locale?: string, digits = 2): string {
  // Round the percentage, not the fraction, so `digits` means digits after the % point.
  const rounded = roundToDecimalPlaces(fraction, digits + 2)
  return getFormatter(locale, {
    style: 'percent',
    signDisplay: 'exceptZero',
    ...fixedDigits(digits),
  }).format(asNumericLiteral(rounded))
}

/** Approximate, human-scale formatting for volumes: "7417.71" → "7.42K". */
export function formatCompact(value: DecimalString, locale?: string): string {
  return getFormatter(locale, { notation: 'compact', maximumFractionDigits: 2 }).format(
    asNumericLiteral(value),
  )
}
