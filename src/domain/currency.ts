import { InvalidValueError, type Brand } from './brand'

/** An ISO 4217 currency code supported by the runtime's `Intl`, e.g. "USD". */
export type CurrencyCode = Brand<string, 'CurrencyCode'>

let supportedCurrencies: ReadonlySet<string> | undefined

export function parseCurrencyCode(value: string): CurrencyCode {
  supportedCurrencies ??= new Set(Intl.supportedValuesOf('currency'))
  if (!supportedCurrencies.has(value)) throw new InvalidValueError('currency code', value)
  return value as CurrencyCode
}

/** Digits in the currency's minor unit: USD → 2, JPY → 0, BHD → 3. */
export function currencyMinorUnits(currency: CurrencyCode): number {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  )
}
