import { useState } from 'react'
import { compareDecimals, type DecimalString } from '@/domain'

export type TickDirection = 'up' | 'down'

/**
 * The direction of the most recent price change. Unchanged prices keep the
 * previous direction. Derived during render rather than in an effect, so the
 * flash appears in the same frame as the new price.
 */
export function useTickDirection(price: DecimalString | undefined): TickDirection | undefined {
  const [previous, setPrevious] = useState(price)
  const [direction, setDirection] = useState<TickDirection>()

  if (price !== previous) {
    setPrevious(price)
    if (price !== undefined && previous !== undefined) {
      const comparison = compareDecimals(price, previous)
      if (comparison !== 0) setDirection(comparison > 0 ? 'up' : 'down')
    }
  }
  return direction
}
