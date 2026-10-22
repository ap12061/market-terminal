# Market Terminal

[![CI](https://github.com/ap12061/market-terminal/actions/workflows/ci.yml/badge.svg)](https://github.com/ap12061/market-terminal/actions/workflows/ci.yml)

A real-time market data terminal built with React and TypeScript, in the style of a trading-desk front end: live prices, an order book, candlestick charts, FX rates and news.

The focus is production-grade engineering: high-frequency streaming data, exact decimal arithmetic for money, resilient connectivity, accessibility, and a CI pipeline that enforces it all.

> 🚧 Work in progress. See [the project plan](docs/PLAN.md) for the architecture and milestones.

## Tech stack

| Concern         | Choice                                                                       |
| --------------- | ---------------------------------------------------------------------------- |
| Build           | [Vite](https://vite.dev)                                                     |
| UI              | React 19, TypeScript (strict)                                                |
| Routing         | [React Router](https://reactrouter.com)                                      |
| Server state    | [TanStack Query](https://tanstack.com/query)                                 |
| Decimal maths   | [big.js](https://mikemcl.github.io/big.js/)                                  |
| Validation      | [Zod](https://zod.dev)                                                       |
| Unit / UI tests | [Vitest](https://vitest.dev), [Testing Library](https://testing-library.com) |
| API mocking     | [MSW](https://mswjs.io)                                                      |
| E2E tests       | [Playwright](https://playwright.dev)                                         |
| Lint / format   | [Oxlint](https://oxc.rs), [Prettier](https://prettier.io)                    |
| CI              | GitHub Actions                                                               |

## Getting started

Requires Node 24 (see `.nvmrc`).

```bash
npm install
npm run dev
```

## Scripts

| Script                  | What it does                                       |
| ----------------------- | -------------------------------------------------- |
| `npm run dev`           | Start the dev server                               |
| `npm run build`         | Typecheck and build for production                 |
| `npm run preview`       | Serve the production build locally                 |
| `npm run typecheck`     | Run the TypeScript compiler                        |
| `npm run lint`          | Lint with Oxlint (warnings fail)                   |
| `npm run format`        | Format with Prettier                               |
| `npm test`              | Run unit tests in watch mode                       |
| `npm run test:coverage` | Run unit tests once with coverage                  |
| `npm run e2e`           | Build, serve and run Playwright against the result |
| `npm run validate`      | Typecheck, lint, format check and unit tests       |

A pre-commit hook (Husky + lint-staged) lints and formats staged files.

## Project structure

```
src/
  app/          # App shell: providers, routes, layout
  domain/       # Market types, exact decimal maths and formatting (no React)
  market-data/  # The MarketDataSource interface and its implementations
    simulated/  #   Deterministic, seeded market simulator with fault injection
    connection/ #   Reconnects, backoff, silence detection, ref-counted subscriptions
    stores/     #   Frame-batched stores for streaming data
    react/      #   Provider and hooks (useSyncExternalStore)
  features/     # Self-contained feature modules (see features/README.md)
  shared/       # Small framework-agnostic utilities
  routes/       # Route-level pages
  styles/       # Global styles and design tokens
  mocks/        # MSW handlers shared by tests
  test/         # Test setup and helpers
e2e/            # Playwright specs
```

## Engineering decisions

- **No floating-point money.** Prices stay exact decimal strings, arithmetic uses big.js with banker's rounding, and `Intl.NumberFormat` is given strings, so formatting is exact even beyond float precision.
- **Streaming data lives outside React.** Updates are buffered and committed once per animation frame, and components subscribe per product through `useSyncExternalStore`. Ten ticks in a frame cost one render, and a BTC tick never re-renders the ETH row; render-count tests enforce this.
- **The connection heals itself.** Reconnects use exponential backoff with full jitter, silent (half-open) connections are detected via heartbeats and replaced, and subscriptions are reference-counted and restored after every reconnect.
- **Feed data is validated at the boundary.** Every Coinbase message is checked with zod before it enters the app; malformed messages are reported once per kind, never allowed to crash a panel. The adapter was built against recorded real messages, which surfaced quirks the docs don't mention: prices without trailing zeros (which would split one order-book level into two), unknown products silently ignored, a 24h change sent instead of an opening price, and a trade `side` that names the maker rather than the aggressor.
- **A deterministic market simulator** implements the same interface as the live feed, so the app, tests and demos run offline, and failures (drops, sequence gaps, stalls) can be injected on demand.
- **Strict TypeScript**, including `noUncheckedIndexedAccess`, so index access is never assumed safe.
- **Tests exercise the real route tree.** `renderRoute()` mounts the app's actual routes in a memory router with an isolated query cache, so tests check behaviour rather than implementation details.
- **Unmocked network requests fail tests.** MSW runs with `onUnhandledFrame: 'error'`.
- **E2E runs against the production build**, not the dev server, so it tests what actually ships.
- **Accessibility from the start:** a skip link, a focusable `<main>`, visible focus styles, reduced-motion support and `jsx-a11y` lint rules.
