/** Runs a callback before the next paint. Stores use it to batch notifications. */
export interface FrameScheduler {
  schedule(callback: () => void): void
}

/**
 * Batches into animation frames: at most one render pass per paint, however
 * fast data arrives. Browsers pause frames in background tabs, so hidden
 * pages do no rendering work at all.
 */
export const animationFrameScheduler: FrameScheduler = {
  schedule: (callback) => {
    requestAnimationFrame(() => callback())
  },
}

export interface ManualScheduler extends FrameScheduler {
  /** Runs callbacks scheduled so far (not ones they schedule themselves). */
  flush(): void
  readonly pendingCount: number
}

/** A scheduler driven by hand, so tests control exactly when a "frame" happens. */
export function createManualScheduler(): ManualScheduler {
  let queue: Array<() => void> = []
  return {
    schedule: (callback) => {
      queue.push(callback)
    },
    flush() {
      const callbacks = queue
      queue = []
      for (const callback of callbacks) callback()
    },
    get pendingCount() {
      return queue.length
    },
  }
}
