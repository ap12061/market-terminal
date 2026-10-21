import { describe, expect, it, vi } from 'vitest'
import { createManualScheduler } from './frameScheduler'
import { createKeyedStore } from './keyedStore'

function setup() {
  const scheduler = createManualScheduler()
  const store = createKeyedStore<string, { value: number }>(scheduler)
  return { scheduler, store }
}

describe('createKeyedStore', () => {
  it('exposes writes only after the frame commits', () => {
    const { scheduler, store } = setup()
    const value = { value: 1 }
    store.set('a', value)

    expect(store.get('a')).toBeUndefined()
    scheduler.flush()
    expect(store.get('a')).toBe(value)
  })

  it('coalesces writes within a frame: one schedule, one notification, last write wins', () => {
    const { scheduler, store } = setup()
    const listener = vi.fn<() => void>()
    store.subscribe('a', listener)

    for (let i = 1; i <= 10; i++) store.set('a', { value: i })

    expect(scheduler.pendingCount).toBe(1)
    scheduler.flush()
    expect(listener).toHaveBeenCalledOnce()
    expect(store.get('a')).toEqual({ value: 10 })
  })

  it('only notifies listeners of the keys that changed', () => {
    const { scheduler, store } = setup()
    const a = vi.fn<() => void>()
    const b = vi.fn<() => void>()
    store.subscribe('a', a)
    store.subscribe('b', b)

    store.set('a', { value: 1 })
    scheduler.flush()

    expect(a).toHaveBeenCalledOnce()
    expect(b).not.toHaveBeenCalled()
  })

  it('applies updates on top of writes still pending in the frame', () => {
    const { scheduler, store } = setup()
    store.set('a', { value: 1 })
    store.update('a', (current) => ({ value: (current?.value ?? 0) + 1 }))
    store.update('a', (current) => ({ value: (current?.value ?? 0) * 10 }))
    scheduler.flush()

    expect(store.get('a')).toEqual({ value: 20 })
  })

  it('skips notifications and the version bump when nothing actually changed', () => {
    const { scheduler, store } = setup()
    const value = { value: 1 }
    store.set('a', value)
    scheduler.flush()
    const listener = vi.fn<() => void>()
    store.subscribe('a', listener)
    const version = store.getVersion()

    store.set('a', value)
    scheduler.flush()

    expect(listener).not.toHaveBeenCalled()
    expect(store.getVersion()).toBe(version)
  })

  it('notifies subscribeAll listeners once per changed frame, and bumps the version', () => {
    const { scheduler, store } = setup()
    const all = vi.fn<() => void>()
    store.subscribeAll(all)

    store.set('a', { value: 1 })
    store.set('b', { value: 2 })
    scheduler.flush()

    expect(all).toHaveBeenCalledOnce()
    expect(store.getVersion()).toBe(1)
    expect(store.keys()).toEqual(['a', 'b'])
  })

  it('schedules a new frame for writes made while notifying', () => {
    const { scheduler, store } = setup()
    store.subscribe('a', () => store.set('b', { value: 2 }))

    store.set('a', { value: 1 })
    scheduler.flush()
    expect(store.get('b')).toBeUndefined()
    expect(scheduler.pendingCount).toBe(1)

    scheduler.flush()
    expect(store.get('b')).toEqual({ value: 2 })
  })

  it('stops notifying after unsubscribing', () => {
    const { scheduler, store } = setup()
    const listener = vi.fn<() => void>()
    const unsubscribe = store.subscribe('a', listener)
    unsubscribe()

    store.set('a', { value: 1 })
    scheduler.flush()

    expect(listener).not.toHaveBeenCalled()
  })
})
