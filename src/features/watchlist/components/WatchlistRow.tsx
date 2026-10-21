import { memo } from 'react'
import { formatPercentChange, isZero, type Instrument, type ProductId } from '@/domain'
import { useTicker } from '@/market-data'
import { cx } from '@/shared/cx'
import { FlashingPrice } from '@/shared/ui/FlashingPrice'
import { changeOf, formatQuoteVolume, quoteVolumeOf } from '@/shared/ui/marketValues'

interface WatchlistRowProps {
  instrument: Instrument
  selected: boolean
  onSelect: (productId: ProductId) => void
}

/**
 * Memoized and subscribed to its own ticker: re-sorting or selecting
 * re-renders only the rows whose props change, and a tick re-renders only
 * its own row.
 */
export const WatchlistRow = memo(function WatchlistRow({
  instrument,
  selected,
  onSelect,
}: WatchlistRowProps) {
  const ticker = useTicker(instrument.id)
  const change = changeOf(ticker)
  const volume = quoteVolumeOf(ticker)
  const trend = change && !isZero(change) && (change.startsWith('-') ? 'down' : 'up')

  return (
    <tr className={cx('watchlist__row', selected && 'watchlist__row--selected')}>
      <th scope="row">
        <button
          type="button"
          className="watchlist__select"
          aria-current={selected ? 'true' : undefined}
          onClick={() => onSelect(instrument.id)}
        >
          <span className="watchlist__base">{instrument.base}</span>
          <span className="watchlist__quote">/{instrument.quote}</span>
        </button>
      </th>
      <td className="watchlist__numeric">
        {ticker ? (
          <FlashingPrice price={ticker.price} increment={instrument.priceIncrement} />
        ) : (
          '—'
        )}
      </td>
      <td className={cx('watchlist__numeric', 'numeric', trend && `watchlist__change--${trend}`)}>
        {change ? formatPercentChange(change) : '—'}
      </td>
      <td className="watchlist__numeric watchlist__optional numeric">
        {volume ? formatQuoteVolume(volume, instrument) : '—'}
      </td>
    </tr>
  )
})
