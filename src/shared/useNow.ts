import { useEffect, useState } from 'react'

/**
 * The current time, refreshed every `intervalMs`. Starts from the time of
 * mount, so mount it (e.g. with a `key`) when the countdown begins.
 */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
