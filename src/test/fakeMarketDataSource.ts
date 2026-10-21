import {
  parseDecimal,
  parseProductId,
  type Instrument,
  type ProductId,
  type Ticker,
  type Trade,
} from '@/domain'
import type { Channel, MarketDataSource, MarketEvent, SourceStatus } from '@/market-data'
import { createEmitter } from '@/shared/emitter'

export interface SourceCall {
  action: 'subscribe' | 'unsubscribe'
  productIds: readonly ProductId[]
  channels: readonly Channel[]
}

/**
 * A `MarketDataSource` driven entirely by the test: nothing happens until the
 * test opens it, drops it or emits an event.
 */
export function createFakeSource(instruments: readonly Instrument[] = []) {
  const events = createEmitter<MarketEvent>()
  const statuses = createEmitter<SourceStatus>()
  let status: SourceStatus = { state: 'closed', reason: 'Not connected', expected: true }
  const calls: SourceCall[] = []
  let connectCount = 0

  const setStatus = (next: SourceStatus) => {
    status = next
    statuses.emit(next)
  }

  const record =
    (action: SourceCall['action']) =>
    (productIds: readonly ProductId[], channels: readonly Channel[]) => {
      if (status.state !== 'open') throw new Error(`Cannot ${action} while ${status.state}`)
      calls.push({ action, productIds: [...productIds], channels: [...channels] })
    }

  const source: MarketDataSource = {
    id: 'fake',
    getStatus: () => status,
    getInstruments: () => Promise.resolve(instruments),
    connect() {
      if (status.state !== 'closed') return
      connectCount += 1
      setStatus({ state: 'connecting' })
    },
    disconnect() {
      if (status.state === 'closed') return
      setStatus({ state: 'closed', reason: 'Disconnected by client', expected: true })
    },
    subscribe: record('subscribe'),
    unsubscribe: record('unsubscribe'),
    onEvent: events.subscribe,
    onStatusChange: statuses.subscribe,
  }

  return {
    source,
    calls,
    get connectCount() {
      return connectCount
    },
    /** Completes a pending connection attempt. */
    open() {
      if (status.state !== 'connecting') throw new Error(`Cannot open while ${status.state}`)
      setStatus({ state: 'open' })
    },
    /** Simulates the connection dropping. */
    drop(reason = 'Network error') {
      setStatus({ state: 'closed', reason, expected: false })
    },
    emit(event: MarketEvent) {
      events.emit(event)
    },
  }
}

export const BTC = parseProductId('BTC-USD')
export const ETH = parseProductId('ETH-USD')

export function makeTicker(productId: ProductId, price: string, time = 0): Ticker {
  const value = parseDecimal(price)
  return {
    productId,
    price: value,
    open24h: parseDecimal('100.00'),
    high24h: value,
    low24h: value,
    volume24h: parseDecimal('1000'),
    time,
  }
}

export function makeTrade(productId: ProductId, id: number, price = '100.00'): Trade {
  return {
    id: `${productId}-${id}`,
    productId,
    side: id % 2 === 0 ? 'buy' : 'sell',
    price: parseDecimal(price),
    size: parseDecimal('0.5'),
    time: id,
  }
}
