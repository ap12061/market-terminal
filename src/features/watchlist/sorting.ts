import {
  compareDecimals,
  type DecimalString,
  type Instrument,
  type ProductId,
  type Ticker,
} from '@/domain'
import { changeOf, quoteVolumeOf } from '@/shared/ui/marketValues'

export const SORT_KEYS = ['symbol', 'price', 'change', 'volume'] as const
export type SortKey = (typeof SORT_KEYS)[number]
export type SortDirection = 'asc' | 'desc'

export interface WatchlistSort {
  key: SortKey
  direction: SortDirection
}

/** Text sorts A→Z first; numbers biggest first, which is what traders look for. */
export function defaultDirection(key: SortKey): SortDirection {
  return key === 'symbol' ? 'asc' : 'desc'
}

/** Clicking a header cycles: default direction → reversed → unsorted. */
export function nextSort(
  current: WatchlistSort | undefined,
  key: SortKey,
): WatchlistSort | undefined {
  if (current?.key !== key) return { key, direction: defaultDirection(key) }
  if (current.direction === defaultDirection(key)) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  }
  return undefined
}

/** Parses "change:desc" from the URL; anything invalid means unsorted. */
export function parseSort(value: string | null): WatchlistSort | undefined {
  const parts = value?.split(':') ?? []
  if (parts.length !== 2) return undefined
  const [key, direction] = parts
  const isKey = (SORT_KEYS as readonly string[]).includes(key ?? '')
  const isDirection = direction === 'asc' || direction === 'desc'
  return isKey && isDirection ? { key: key as SortKey, direction } : undefined
}

export function serializeSort(sort: WatchlistSort): string {
  return `${sort.key}:${sort.direction}`
}

function valueFor(key: Exclude<SortKey, 'symbol'>, ticker: Ticker | undefined) {
  switch (key) {
    case 'price':
      return ticker?.price
    case 'change':
      return changeOf(ticker)
    case 'volume':
      return quoteVolumeOf(ticker)
  }
}

/**
 * Orders instruments for display. Instruments without data always sort
 * last, whichever the direction; ties keep feed order.
 */
export function sortInstruments(
  instruments: readonly Instrument[],
  sort: WatchlistSort | undefined,
  getTicker: (productId: ProductId) => Ticker | undefined,
): ProductId[] {
  const ids = instruments.map((instrument) => instrument.id)
  if (!sort) return ids

  const sign = sort.direction === 'asc' ? 1 : -1
  if (sort.key === 'symbol') return ids.toSorted((a, b) => sign * a.localeCompare(b))

  const key = sort.key
  const values = new Map<ProductId, DecimalString | undefined>(
    ids.map((id) => [id, valueFor(key, getTicker(id))]),
  )
  return ids.toSorted((a, b) => {
    const left = values.get(a)
    const right = values.get(b)
    if (left === undefined || right === undefined) {
      return Number(left === undefined) - Number(right === undefined)
    }
    return sign * compareDecimals(left, right)
  })
}
