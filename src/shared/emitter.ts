export interface Emitter<T> {
  emit(value: T): void
  /** Returns a function that removes the listener. */
  subscribe(listener: (value: T) => void): () => void
}

/**
 * A minimal typed event emitter. A throwing listener doesn't stop the others:
 * its error is rethrown asynchronously, so it still surfaces in the console and tests.
 */
export function createEmitter<T>(): Emitter<T> {
  const listeners = new Set<(value: T) => void>()

  return {
    emit(value) {
      // Iterate over a copy, so listeners added during this emit aren't called by it.
      for (const listener of Array.from(listeners)) {
        try {
          listener(value)
        } catch (error) {
          queueMicrotask(() => {
            throw error
          })
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
