import {
  formatCompact,
  isCurrencyCode,
  multiplyDecimals,
  relativeChange,
  type DecimalString,
  type Instrument,
  type Ticker,
} from '@/domain'

/** 24h change as a fraction of the 24h open, or undefined without data. */
export function changeOf(ticker: Ticker | undefined): DecimalString | undefined {
  return (ticker && relativeChange(ticker.open24h, ticker.price)) ?? undefined
}

/**
 * 24h volume in the quote currency (volume × price). Unlike base-unit volume,
 * this is comparable across instruments.
 */
export function quoteVolumeOf(ticker: Ticker | undefined): DecimalString | undefined {
  return ticker && multiplyDecimals(ticker.volume24h, ticker.price)
}

export function formatQuoteVolume(volume: DecimalString, instrument: Instrument): string {
  return isCurrencyCode(instrument.quote)
    ? formatCompact(volume, undefined, instrument.quote)
    : `${formatCompact(volume)} ${instrument.quote}`
}
