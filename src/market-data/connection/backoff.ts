export interface BackoffOptions {
  initialDelayMs: number
  maxDelayMs: number
}

/**
 * Exponential backoff with "full jitter": a random delay between 0 and the
 * exponential cap. The randomness spreads out reconnects, so thousands of
 * clients dropped by the same outage don't all retry at the same instant.
 *
 * @param attempt 1 for the first retry
 * @param random uniform in [0, 1), injectable for tests
 */
export function backoffDelay(
  attempt: number,
  { initialDelayMs, maxDelayMs }: BackoffOptions,
  random: () => number = Math.random,
): number {
  const cap = Math.min(maxDelayMs, initialDelayMs * 2 ** Math.max(0, attempt - 1))
  return Math.round(random() * cap)
}
