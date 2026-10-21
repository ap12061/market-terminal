import { useCallback, useState, type FocusEvent } from 'react'
import type { Instrument, ProductId } from '@/domain'
import { useSortedProductIds } from '../hooks/useSortedProductIds'
import { nextSort, serializeSort, type SortKey, type WatchlistSort } from '../sorting'
import { SortableHeader } from './SortableHeader'
import { WatchlistRow } from './WatchlistRow'
import './Watchlist.css'

interface WatchlistProps {
  instruments: readonly Instrument[]
  selectedId: ProductId | undefined
  onSelect: (productId: ProductId) => void
  sort: WatchlistSort | undefined
  onSortChange: (sort: WatchlistSort | undefined) => void
}

export function Watchlist({
  instruments,
  selectedId,
  onSelect,
  sort,
  onSortChange,
}: WatchlistProps) {
  const liveOrder = useSortedProductIds(instruments, sort?.key, sort?.direction)

  // Rows jumping under the cursor cause mis-clicks, so the order is frozen
  // while the pointer or keyboard focus is in the list. A new sort always applies.
  const sortId = sort ? serializeSort(sort) : 'none'
  const [frozen, setFrozen] = useState<{ sortId: string; order: typeof liveOrder }>()
  const isFrozen = frozen?.sortId === sortId
  const order = isFrozen ? frozen.order : liveOrder
  const freeze = () => {
    if (!isFrozen) setFrozen({ sortId, order: liveOrder })
  }
  const unfreeze = () => setFrozen(undefined)
  const unfreezeOnFocusLeave = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) unfreeze()
  }

  const byId = new Map(instruments.map((instrument) => [instrument.id, instrument]))
  const handleSort = useCallback(
    (key: SortKey) => onSortChange(nextSort(sort, key)),
    [sort, onSortChange],
  )

  return (
    <section className="panel watchlist" aria-labelledby="watchlist-title">
      <div className="watchlist__header">
        <h2 id="watchlist-title" className="watchlist__title">
          Watchlist
        </h2>
        {sort && isFrozen && <span className="watchlist__paused">Sorting paused</span>}
      </div>
      <div className="watchlist__scroller">
        <table className="watchlist__table">
          <thead>
            <tr>
              <SortableHeader sortKey="symbol" label="Instrument" sort={sort} onSort={handleSort} />
              <SortableHeader
                sortKey="price"
                label="Price"
                sort={sort}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                sortKey="change"
                label="24h"
                sort={sort}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                sortKey="volume"
                label="Volume"
                sort={sort}
                onSort={handleSort}
                numeric
                optional
              />
            </tr>
          </thead>
          {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- these
              handlers only observe pointer and focus position; the rows' buttons are the controls. */}
          <tbody
            onPointerEnter={freeze}
            onPointerLeave={unfreeze}
            onFocus={freeze}
            onBlur={unfreezeOnFocusLeave}
          >
            {order.map((productId) => {
              const instrument = byId.get(productId)
              return (
                instrument && (
                  <WatchlistRow
                    key={productId}
                    instrument={instrument}
                    selected={productId === selectedId}
                    onSelect={onSelect}
                  />
                )
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
