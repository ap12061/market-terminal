import { cx } from '@/shared/cx'
import type { SortKey, WatchlistSort } from '../sorting'

interface SortableHeaderProps {
  sortKey: SortKey
  label: string
  sort: WatchlistSort | undefined
  onSort: (key: SortKey) => void
  numeric?: boolean
  /** Hidden on narrow screens. */
  optional?: boolean
}

export function SortableHeader({
  sortKey,
  label,
  sort,
  onSort,
  numeric,
  optional,
}: SortableHeaderProps) {
  const direction = sort?.key === sortKey ? sort.direction : undefined
  const ariaSort =
    direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : undefined

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cx(numeric && 'watchlist__numeric', optional && 'watchlist__optional')}
    >
      <button type="button" className="watchlist__sort" onClick={() => onSort(sortKey)}>
        {label}
        <span className="watchlist__sort-icon" aria-hidden="true">
          {direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '↕'}
        </span>
      </button>
    </th>
  )
}
