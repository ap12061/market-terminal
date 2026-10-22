import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMarketDataForFeed, readStoredFeed, storeFeed } from './marketData'

afterEach(() => {
  localStorage.clear()
})

describe('feed preference', () => {
  it('defaults to live, and remembers a choice', () => {
    expect(readStoredFeed()).toBe('live')

    storeFeed('demo')
    expect(readStoredFeed()).toBe('demo')
  })

  it('treats unexpected stored values as live', () => {
    localStorage.setItem('market-terminal:feed', 'banana')

    expect(readStoredFeed()).toBe('live')
  })

  it('works when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })

    expect(readStoredFeed()).toBe('live')
    expect(() => storeFeed('demo')).not.toThrow()
  })
})

describe('createMarketDataForFeed', () => {
  it('uses Coinbase for live and the simulator for demo', () => {
    expect(createMarketDataForFeed('live').sourceId).toBe('coinbase')
    expect(createMarketDataForFeed('demo').sourceId).toBe('simulated')
  })
})
