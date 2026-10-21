export interface Random {
  /** Uniform in [0, 1). */
  next(): number
  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number
  /** Approximately standard normal (mean 0, variance 1). */
  normal(): number
  chance(probability: number): boolean
}

/** FNV-1a: turns a readable seed like "demo" into a 32-bit integer. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * A seeded PRNG (mulberry32). Only integer ops, division by a power of two and
 * addition are used, so a seed gives bit-identical output on every JS engine.
 * That rules out Math.random, and also Math.log/cos, whose precision is
 * implementation-defined (so no Box-Muller for normals).
 */
export function createRandom(seed: number | string): Random {
  let state = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    // Irwin-Hall: the sum of 12 uniforms has mean 6 and variance 1.
    normal: () => {
      let sum = 0
      for (let i = 0; i < 12; i++) sum += next()
      return sum - 6
    },
    chance: (probability) => next() < probability,
  }
}
