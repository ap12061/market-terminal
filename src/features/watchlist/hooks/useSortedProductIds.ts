import { useCallback } from 'react'
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector'
import type { Instrument, ProductId } from '@/domain'
import { useMarketData } from '@/market-data'
import { sortInstruments, type SortDirection, type SortKey } from '../sorting'

const sameOrder = (a: readonly ProductId[], b: readonly ProductId[]) =>
  a.length === b.length && a.every((id, i) => id === b[i])

/**
 * The display order of the watchlist. Re-evaluated every frame with new
 * data, but only re-renders the table when the order actually changes;
 * price updates within rows are handled by the rows themselves.
 */
export function useSortedProductIds(
  instruments: readonly Instrument[],
  sortKey: SortKey | undefined,
  direction: SortDirection | undefined,
): readonly ProductId[] {
  const { tickers } = useMarketData()
  const select = useCallback(
    () =>
      sortInstruments(
        instruments,
        sortKey && direction ? { key: sortKey, direction } : undefined,
        tickers.get,
      ),
    [instruments, sortKey, direction, tickers],
  )
  return useSyncExternalStoreWithSelector(
    tickers.subscribeAll,
    tickers.getVersion,
    tickers.getVersion,
    select,
    sameOrder,
  )
}
