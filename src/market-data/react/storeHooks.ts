import { useCallback, useSyncExternalStore } from 'react'
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector'
import type { KeyedStore } from '../stores/keyedStore'

/** Reads one key of a store, re-rendering only when that key's committed value changes. */
export function useStoreValue<K, V>(store: KeyedStore<K, V>, key: K): V | undefined {
  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(key, onChange),
    [store, key],
  )
  const getSnapshot = useCallback(() => store.get(key), [store, key])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Reads a value derived from one key, re-rendering only when the derived
 * value changes (by `isEqual`), e.g. a price's direction rather than every tick.
 *
 * Memoization lasts as long as `selector` and `isEqual` keep their identity:
 * define them outside the component or with `useCallback`. Inline functions
 * still work, but recompute on every render.
 */
export function useStoreSelector<K, V, S>(
  store: KeyedStore<K, V>,
  key: K,
  selector: (value: V | undefined) => S,
  isEqual?: (a: S, b: S) => boolean,
): S {
  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(key, onChange),
    [store, key],
  )
  const getSnapshot = useCallback(() => store.get(key), [store, key])
  // React's own implementation of selector memoization for external stores.
  return useSyncExternalStoreWithSelector(subscribe, getSnapshot, getSnapshot, selector, isEqual)
}

/** Re-renders once per frame in which any key changed; for views that span keys. */
export function useStoreVersion<K, V>(store: KeyedStore<K, V>): number {
  const subscribe = useCallback((onChange: () => void) => store.subscribeAll(onChange), [store])
  const getSnapshot = useCallback(() => store.getVersion(), [store])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
