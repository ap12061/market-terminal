import { describe, expect, it } from 'vitest'
import { InvalidValueError } from './brand'
import { parseProductId, splitProductId } from './instrument'

describe('parseProductId', () => {
  it.each(['BTC-USD', 'ETH-EUR', 'USDC-USD'])('accepts %s', (id) => {
    expect(parseProductId(id)).toBe(id)
  })

  it.each(['btc-usd', 'BTCUSD', 'BTC-', '-USD', 'BTC-USD-PERP', 'BTC/USD'])('rejects %j', (id) => {
    expect(() => parseProductId(id)).toThrow(InvalidValueError)
  })
})

describe('splitProductId', () => {
  it('splits into base and quote', () => {
    expect(splitProductId(parseProductId('USDC-EUR'))).toEqual({ base: 'USDC', quote: 'EUR' })
  })
})
