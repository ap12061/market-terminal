import { describe, expect, it } from 'vitest'
import { backoffDelay } from './backoff'

const options = { initialDelayMs: 500, maxDelayMs: 30_000 }

describe('backoffDelay', () => {
  it('doubles the cap with each attempt, up to the maximum', () => {
    const caps = [1, 2, 3, 4, 5, 6, 7, 8, 10].map((attempt) =>
      backoffDelay(attempt, options, () => 0.999_999),
    )

    expect(caps).toEqual([500, 1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000])
  })

  it('applies full jitter: anywhere from zero up to the cap', () => {
    expect(backoffDelay(3, options, () => 0)).toBe(0)
    expect(backoffDelay(3, options, () => 0.5)).toBe(1_000)
  })

  it('stays within bounds with real randomness', () => {
    for (let i = 0; i < 1_000; i++) {
      const delay = backoffDelay(4, options)
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThanOrEqual(4_000)
    }
  })
})
