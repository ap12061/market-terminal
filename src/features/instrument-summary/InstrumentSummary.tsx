import {
  formatCompact,
  formatPercentChange,
  formatPrice,
  formatPriceChange,
  formatTime,
  subtractDecimals,
  type Instrument,
} from '@/domain'
import { useTicker } from '@/market-data'
import { cx } from '@/shared/cx'
import { FlashingPrice } from '@/shared/ui/FlashingPrice'
import { changeOf, formatQuoteVolume, quoteVolumeOf } from '@/shared/ui/marketValues'
import './InstrumentSummary.css'

export function InstrumentSummary({ instrument }: { instrument: Instrument }) {
  const ticker = useTicker(instrument.id)
  const titleId = `summary-${instrument.id}`

  return (
    <section className="panel summary" aria-labelledby={titleId}>
      <h2 id={titleId} className="summary__title">
        {/* The space sits outside the span: accessible names trim it inside. */}
        {instrument.base} <span className="summary__quote">/ {instrument.quote}</span>
      </h2>

      {ticker ? (
        <>
          <SummaryPrice instrument={instrument} ticker={ticker} />
          <dl className="summary__stats">
            <Stat label="24h open" value={formatPrice(ticker.open24h, instrument.priceIncrement)} />
            <Stat label="24h high" value={formatPrice(ticker.high24h, instrument.priceIncrement)} />
            <Stat label="24h low" value={formatPrice(ticker.low24h, instrument.priceIncrement)} />
            <Stat
              label={`24h volume (${instrument.base})`}
              value={formatCompact(ticker.volume24h)}
            />
            <Stat
              label={`24h volume (${instrument.quote})`}
              value={formatQuoteVolume(quoteVolumeOf(ticker) ?? ticker.volume24h, instrument)}
            />
            <Stat label="Last trade" value={formatTime(ticker.time)} />
          </dl>
        </>
      ) : (
        <p className="summary__waiting">Waiting for market data…</p>
      )}
    </section>
  )
}

function SummaryPrice({
  instrument,
  ticker,
}: {
  instrument: Instrument
  ticker: NonNullable<ReturnType<typeof useTicker>>
}) {
  const change = changeOf(ticker)
  const trend = change?.startsWith('-') ? 'down' : 'up'

  return (
    <p className="summary__price">
      <FlashingPrice
        price={ticker.price}
        increment={instrument.priceIncrement}
        className="summary__last"
      />
      {change && (
        <span className={cx('summary__change', 'numeric', `summary__change--${trend}`)}>
          {formatPriceChange(
            subtractDecimals(ticker.price, ticker.open24h),
            instrument.priceIncrement,
          )}{' '}
          ({formatPercentChange(change)})
        </span>
      )}
    </p>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary__stat">
      <dt>{label}</dt>
      <dd className="numeric">{value}</dd>
    </div>
  )
}
