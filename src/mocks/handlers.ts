import type { AnyHandler } from 'msw'

// Default API handlers shared by tests. Override per test with `server.use(...)`.
export const handlers: AnyHandler[] = []
