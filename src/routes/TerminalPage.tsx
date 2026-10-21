import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import type { ProductId } from '@/domain'
import { InstrumentSummary } from '@/features/instrument-summary'
import { parseSort, serializeSort, Watchlist, type WatchlistSort } from '@/features/watchlist'
import { useInstruments } from '@/market-data'
import './TerminalPage.css'

/**
 * The URL is the source of truth for the view (selected instrument and sort
 * order), so any view can be bookmarked or shared.
 */
export function TerminalPage() {
  const { data: instruments, isPending, isError, refetch } = useInstruments()
  const [searchParams, setSearchParams] = useSearchParams()

  const sort = parseSort(searchParams.get('sort'))
  const selected =
    instruments?.find((instrument) => instrument.id === searchParams.get('symbol')) ??
    instruments?.[0]

  const select = useCallback(
    (productId: ProductId) =>
      setSearchParams((params) => {
        params.set('symbol', productId)
        return params
      }),
    [setSearchParams],
  )

  const changeSort = useCallback(
    (next: WatchlistSort | undefined) =>
      setSearchParams(
        (params) => {
          if (next) params.set('sort', serializeSort(next))
          else params.delete('sort')
          return params
        },
        // Re-sorting isn't navigation; don't fill the back button with it.
        { replace: true },
      ),
    [setSearchParams],
  )

  return (
    <div className="terminal">
      <h1 className="visually-hidden">Markets</h1>
      {isPending && <p>Loading instruments…</p>}
      {isError && (
        <div role="alert">
          <p>Couldn't load the list of instruments.</p>
          <button type="button" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      )}
      {instruments && (
        <>
          <Watchlist
            instruments={instruments}
            selectedId={selected?.id}
            onSelect={select}
            sort={sort}
            onSortChange={changeSort}
          />
          {selected && <InstrumentSummary instrument={selected} />}
        </>
      )}
    </div>
  )
}
