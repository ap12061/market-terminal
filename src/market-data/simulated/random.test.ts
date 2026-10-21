import { describe, expect, it } from 'vitest'
import { createRandom, hashSeed } from './random'

const take = (count: number, fn: () => number) => Array.from({ length: count }, fn)

describe('createRandom', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRandom(42)
    const b = createRandom(42)
    expect(take(100, a.next)).toEqual(take(100, b.next))
  })

  it('produces different sequences for different seeds', () => {
    expect(take(10, createRandom(1).next)).not.toEqual(take(10, createRandom(2).next))
  })

  it('accepts readable string seeds', () => {
    expect(take(10, createRandom('demo').next)).toEqual(
      take(10, createRandom(hashSeed('demo')).next),
    )
  })

  it('pins the exact output, so any change to the algorithm is deliberate', () => {
    expect(take(3, createRandom(42).next)).toMatchInlineSnapshot(`
      [
        0.6011037519201636,
        0.44829055899754167,
        0.8524657934904099,
      ]
    `)
  })

  it('keeps next() in [0, 1) and int() within inclusive bounds', () => {
    const random = createRandom(7)
    const ints = new Set<number>()
    for (let i = 0; i < 10_000; i++) {
      const value = random.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      ints.add(random.int(-2, 2))
    }
    expect([...ints].toSorted((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2])
  })

  it('produces roughly standard normal values', () => {
    const samples = take(20_000, createRandom(3).normal)
    const mean = samples.reduce((sum, x) => sum + x, 0) / samples.length
    const variance = samples.reduce((sum, x) => sum + (x - mean) ** 2, 0) / samples.length

    expect(mean).toBeCloseTo(0, 1)
    expect(variance).toBeCloseTo(1, 1)
  })
})
