import type { Unsubscribe } from '../types'
import type { FrameScheduler } from './frameScheduler'

/**
 * A key → value store for streaming data, readable from React via
 * `useSyncExternalStore`.
 *
 * Writes are buffered and committed once per frame, so ten ticks for one
 * product within a frame cost one render, not ten. Listeners subscribe per
 * key, so a BTC tick never wakes the components showing ETH.
 */
export interface KeyedStore<K, V> {
  /** The committed value: what's rendered, never a pending write. */
  get(key: K): V | undefined
  /** Replaces the value. Within a frame, the last write wins. */
  set(key: K, value: V): void
  /**
   * Derives the next value from the latest one, including writes still
   * pending in this frame. Must return a new object to signal a change.
   */
  update(key: K, updater: (current: V | undefined) => V): void
  subscribe(key: K, listener: () => void): Unsubscribe
  /** Notified once per frame in which any key changed. */
  subscribeAll(listener: () => void): Unsubscribe
  /** Increments with every committed frame that changed something. */
  getVersion(): number
  keys(): K[]
}

export function createKeyedStore<K, V>(scheduler: FrameScheduler): KeyedStore<K, V> {
  const committed = new Map<K, V>()
  let pending = new Map<K, V>()
  const keyListeners = new Map<K, Set<() => void>>()
  const allListeners = new Set<() => void>()
  let version = 0
  let scheduled = false

  function flush() {
    scheduled = false
    // Swap first: listeners may write again, which schedules the next frame.
    const changes = pending
    pending = new Map()

    // A Set, so a listener watching several changed keys runs only once.
    const toNotify = new Set<() => void>()
    let changed = false
    for (const [key, value] of changes) {
      if (committed.get(key) === value) continue
      changed = true
      committed.set(key, value)
      for (const listener of keyListeners.get(key) ?? []) toNotify.add(listener)
    }
    if (!changed) return

    version += 1
    for (const listener of allListeners) toNotify.add(listener)
    for (const listener of toNotify) listener()
  }

  function write(key: K, value: V) {
    pending.set(key, value)
    if (!scheduled) {
      scheduled = true
      scheduler.schedule(flush)
    }
  }

  return {
    get: (key) => committed.get(key),
    set: write,
    update(key, updater) {
      write(key, updater(pending.has(key) ? pending.get(key) : committed.get(key)))
    },
    subscribe(key, listener) {
      const listeners = keyListeners.get(key) ?? new Set()
      keyListeners.set(key, listeners)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) keyListeners.delete(key)
      }
    },
    subscribeAll(listener) {
      allListeners.add(listener)
      return () => {
        allListeners.delete(listener)
      }
    },
    getVersion: () => version,
    keys: () => [...committed.keys()],
  }
}
