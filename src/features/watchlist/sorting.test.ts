import { describe, expect, it } from 'vitest'
import type { ProductId, Ticker } from '@/domain'
import { BTC, ETH, makeTicker } from '@/test/fakeMarketDataSource'
import { TEST_INSTRUMENTS } from '@/test/renderRoute'
import { nextSort, parseSort, serializeSort, sortInstruments } from './sorting'

describe('nextSort', () => {
  it('cycles numbers: descending → ascending → unsorted', () => {
    const first = nextSort(undefined, 'price')
    const second = nextSort(first, 'price')

    expect(first).toEqual({ key: 'price', direction: 'desc' })
    expect(second).toEqual({ key: 'price', direction: 'asc' })
    expect(nextSort(second, 'price')).toBeUndefined()
  })

  it('starts text columns ascending, and switching column restarts the cycle', () => {
    expect(nextSort(undefined, 'symbol')).toEqual({ key: 'symbol', direction: 'asc' })
    expect(nextSort({ key: 'price', direction: 'asc' }, 'symbol')).toEqual({
      key: 'symbol',
      direction: 'asc',
    })
  })
})

describe('parseSort and serializeSort', () => {
  it('round-trips', () => {
    expect(parseSort(serializeSort({ key: 'volume', direction: 'asc' }))).toEqual({
      key: 'volume',
      direction: 'asc',
    })
  })

  it.each([null, '', 'price', 'price:up', 'colour:desc', 'price:desc:extra'])(
    'treats %j as unsorted',
    (value) => {
      expect(parseSort(value)).toBeUndefined()
    },
  )
})

describe('sortInstruments', () => {
  const tickers = new Map<ProductId, Ticker>([
    [BTC, { ...makeTicker(BTC, '84000.00'), open24h: '80000.00' as Ticker['open24h'] }],
    [ETH, { ...makeTicker(ETH, '3000.00'), open24h: '3300.00' as Ticker['open24h'] }],
  ])
  const sort = (key: 'symbol' | 'price' | 'change' | 'volume', direction: 'asc' | 'desc') =>
    sortInstruments(TEST_INSTRUMENTS, { key, direction }, (id) => tickers.get(id))

  it('keeps feed order when unsorted', () => {
    expect(sortInstruments(TEST_INSTRUMENTS, undefined, () => undefined)).toEqual(
      TEST_INSTRUMENTS.map((instrument) => instrument.id),
    )
  })

  it('sorts symbols alphabetically', () => {
    expect(sort('symbol', 'asc')).toEqual(['BTC-USD', 'DOGE-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD'])
  })

  it('sorts numerically, keeping instruments without data last in either direction', () => {
    expect(sort('price', 'desc').slice(0, 2)).toEqual([BTC, ETH])
    expect(sort('price', 'asc').slice(0, 2)).toEqual([ETH, BTC])
    expect(sort('price', 'asc').slice(2)).toEqual(['SOL-USD', 'XRP-USD', 'DOGE-USD'])
  })

  it('sorts by 24h change and by quote volume', () => {
    // BTC +5%, ETH -9.09%.
    expect(sort('change', 'desc').slice(0, 2)).toEqual([BTC, ETH])
    // Same base volume, so the higher price has the higher quote volume.
    expect(sort('volume', 'asc').slice(0, 2)).toEqual([ETH, BTC])
  })
})
