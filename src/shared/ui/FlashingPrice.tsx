import { formatPrice, type DecimalString } from '@/domain'
import { cx } from '@/shared/cx'
import { useTickDirection } from './useTickDirection'
import './FlashingPrice.css'

interface FlashingPriceProps {
  price: DecimalString
  increment: DecimalString
  className?: string
}

/** A price that briefly flashes green or red when it changes. */
export function FlashingPrice({ price, increment, className }: FlashingPriceProps) {
  const direction = useTickDirection(price)

  return (
    // Keyed by price, so the element remounts and the flash restarts on every change.
    <span
      key={price}
      className={cx(
        'numeric',
        'flashing-price',
        direction && `flashing-price--${direction}`,
        className,
      )}
    >
      {formatPrice(price, increment)}
    </span>
  )
}
