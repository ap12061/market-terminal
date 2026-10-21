import { describe, expect, it, vi } from 'vitest'
import { createEmitter } from './emitter'

describe('createEmitter', () => {
  it('delivers values to every listener until it unsubscribes', () => {
    const emitter = createEmitter<number>()
    const a = vi.fn<(value: number) => void>()
    const b = vi.fn<(value: number) => void>()
    const unsubscribeA = emitter.subscribe(a)
    emitter.subscribe(b)

    emitter.emit(1)
    unsubscribeA()
    emitter.emit(2)

    expect(a.mock.calls).toEqual([[1]])
    expect(b.mock.calls).toEqual([[1], [2]])
  })

  it('keeps calling other listeners when one throws, then rethrows asynchronously', async () => {
    const emitter = createEmitter<number>()
    const error = new Error('listener failed')
    const after = vi.fn<(value: number) => void>()
    emitter.subscribe(() => {
      throw error
    })
    emitter.subscribe(after)

    const rethrown = new Promise((resolve) => {
      const original = globalThis.queueMicrotask
      vi.spyOn(globalThis, 'queueMicrotask').mockImplementationOnce((callback) => {
        original(() => {
          try {
            callback()
          } catch (caught) {
            resolve(caught)
          }
        })
      })
    })

    emitter.emit(1)

    expect(after).toHaveBeenCalledWith(1)
    await expect(rethrown).resolves.toBe(error)
  })

  it("doesn't call listeners added during an emit until the next one", () => {
    const emitter = createEmitter<number>()
    const late = vi.fn<(value: number) => void>()
    emitter.subscribe(() => {
      emitter.subscribe(late)
    })

    emitter.emit(1)
    expect(late).not.toHaveBeenCalled()

    emitter.emit(2)
    expect(late).toHaveBeenCalledWith(2)
  })

  it('lets a listener unsubscribe itself during emit', () => {
    const emitter = createEmitter<number>()
    const calls: number[] = []
    const unsubscribe = emitter.subscribe((value) => {
      calls.push(value)
      unsubscribe()
    })

    emitter.emit(1)
    emitter.emit(2)

    expect(calls).toEqual([1])
  })
})
