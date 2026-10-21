# Market Terminal: project plan

A real-time market data dashboard in the style of a trading-desk front end: live prices, an order book, candlestick charts, FX rates and news.

The goal is to show the engineering problems that front-office teams at banks deal with every day: high-frequency streaming data, exact money arithmetic, resilience when feeds fail, and UIs that stay fast under load.

## Goals and non-goals

**Goals**

- Live, ticking data that stays smooth at hundreds of updates per second.
- Correct financial numbers: no floating-point money, correct rounding and locale-aware formatting.
- Resilient connectivity: automatic reconnect, stale-data detection and clear status everywhere.
- Fully testable and demoable without a network, using a deterministic simulated feed.
- Accessible: keyboard-first navigation, and screen-reader announcements that are useful rather than noisy.

**Non-goals**

- Placing orders, user accounts or anything involving real money.
- Investment advice or analytics claims.
- Building a backend beyond one small serverless proxy.

## Data sources

| Source                            | Used for                                                 | Access                                                                            | Verified (2026-10-21)                                                                    |
| --------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Coinbase Advanced Trade WebSocket | Live tickers, level-2 order book, trades, heartbeats     | `wss://advanced-trade-ws.coinbase.com`; no key needed for market data channels    | ✅ Unauthenticated subscription works; messages carry `sequence_num`; prices are strings |
| Coinbase public REST (candles)    | Historical candles for charts                            | `api.coinbase.com/api/v3/brokerage/market/products/{id}/candles`                  | ⚠️ Works, but sends **no CORS header**, so it must go through the proxy                  |
| Frankfurter                       | ECB foreign-exchange reference rates (daily) and history | `api.frankfurter.dev`; no key                                                     | ✅ Works from the browser (`Access-Control-Allow-Origin: *`)                             |
| Finnhub                           | Company news (and optionally US stock quotes)            | Free API key, roughly 60 calls/min per third-party sources; must stay server-side | ❓ Not verified yet. Confirm limits on finnhub.io after signing up                       |

Crypto pairs stand in for listed instruments in the live demo. The architecture is source-agnostic, so an equities feed plugs in behind the same interface.

## Architecture

```
          ┌──────────────────────── Browser ────────────────────────┐
          │                                                         │
Coinbase ─┼─ws─▶ MarketDataSource ──▶ Connection manager            │
WebSocket │      (Coinbase | Simulated)  (state machine, backoff,   │
          │            │                  heartbeats, staleness)    │
          │            ▼                                            │
          │      Message validation (zod) ──▶ Streaming stores      │
          │                                   (batched per frame)   │
          │                                        │                │
          │                       useSyncExternalStore + selectors  │
          │                                        ▼                │
          │   TanStack Query ──────────────▶  React UI panels       │
          └──────┬──────────────────────────────────────────────────┘
                 │ REST
     ┌───────────┴────────────┐
     │ Serverless proxy        │──▶ Coinbase candles, Finnhub news
     │ (allowlisted routes,    │    (API key held here only)
     │  caching, rate limiting)│
     └────────────────────────┘
Frankfurter ◀── called directly from the browser (CORS allowed)
```

**Key decisions** (each one gets a short decision record, an ADR, in `docs/adr/`):

1. **Two kinds of state, two tools.** Streaming data lives in small purpose-built stores outside React. Request/response data (candles, FX, news) uses TanStack Query. Putting ticks into React state or a query cache would re-render far too often.
2. **Updates are batched per animation frame.** Incoming messages are applied to a buffer, and subscribers are notified once per frame. Components read through selectors, so a BTC tick never re-renders the ETH row.
3. **A source interface (`MarketDataSource`)** with Coinbase and simulated implementations. The UI never knows which one it's using. This enables offline demos, deterministic tests and a future equities feed.
4. **Exact decimals for money.** Prices arrive as strings and stay strings until they reach a decimal library (`big.js`). Floats are only used for chart pixel positions.
5. **Validate at the boundary.** Every WebSocket and REST payload is parsed with `zod` before it enters the app. Malformed messages are counted and logged, never allowed to crash a panel.
6. **Order book integrity.** `sequence_num` gaps are detected; the book is dropped and re-snapshotted rather than silently drifting out of date.
7. **A single serverless proxy** (Vercel or Cloudflare) handles CORS-blocked or key-protected endpoints. It only forwards an allowlist of routes, so it can't be used as an open proxy.
8. **Every panel fails on its own.** Each panel has its own error boundary and connection or staleness indicator, so one failing feed never blanks the whole screen.

## Data model

```ts
type ProductId = string & { readonly __brand: 'ProductId' } // e.g. "BTC-USD"
type DecimalString = string // exact value as received, e.g. "84489.56"

interface Instrument {
  id: ProductId
  base: string // "BTC"
  quote: string // "USD"
  priceIncrement: DecimalString // tick size, drives formatting and book grouping
}

interface Ticker {
  productId: ProductId
  price: DecimalString
  open24h: DecimalString
  high24h: DecimalString
  low24h: DecimalString
  volume24h: DecimalString
  time: number // epoch ms
}

interface OrderBook {
  productId: ProductId
  bids: Map<DecimalString, DecimalString> // price level → size
  asks: Map<DecimalString, DecimalString>
  lastSequence: number
  updatedAt: number
}
// Derived (memoized): top N levels per side, spread, mid price, cumulative depth, grouped levels

interface Trade {
  id: string
  productId: ProductId
  side: 'buy' | 'sell'
  price: DecimalString
  size: DecimalString
  time: number
}

interface Candle {
  start: number
  open: DecimalString
  high: DecimalString
  low: DecimalString
  close: DecimalString
  volume: DecimalString
}

interface FxRates {
  base: CurrencyCode
  date: string // ISO date of the ECB publication
  rates: Record<CurrencyCode, DecimalString>
}

interface NewsItem {
  id: string
  headline: string
  source: string
  url: string
  publishedAt: number
  relatedSymbols: string[]
}

type ConnectionState =
  | { status: 'idle' }
  | { status: 'connecting'; attempt: number }
  | { status: 'open' }
  | { status: 'stale'; lastMessageAt: number } // open, but no heartbeat within the threshold
  | { status: 'reconnecting'; attempt: number; retryAt: number; reason: string }
// No terminal "closed" state: the manager retries indefinitely with capped backoff.
```

## Features

| #   | Feature               | What it shows off                                                                                                                                       |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | App shell             | Panel layout, a global connection-status indicator, a live/demo toggle, keyboard shortcuts                                                              |
| F2  | Watchlist             | Ticking rows with price-change flashes (disabled under reduced motion), 24h change %, sorting, add/remove saved locally, selected instrument in the URL |
| F3  | Price chart           | Candlesticks (TradingView Lightweight Charts) from REST history, updated live from trades; timeframe selector                                           |
| F4  | Order book            | Level-2 depth with spread and mid price, grouping by tick size, depth bars, sequence-gap recovery                                                       |
| F5  | Trade tape            | A bounded, virtualized list of recent trades with buy/sell colouring                                                                                    |
| F6  | FX panel              | ECB rates, a historical sparkline, a converter with exact decimal maths and correct rounding                                                            |
| F7  | News                  | Finnhub headlines for watched symbols, through the proxy, cached and rate-limited                                                                       |
| F8  | Simulated feed        | A seeded, deterministic market simulator implementing `MarketDataSource`; used by tests, e2e and demo mode                                              |
| F9  | Diagnostics (stretch) | Messages per second, render counts, dropped-message and gap counters; makes the performance work visible                                                |
| F10 | Web Worker (stretch)  | Move parsing and order-book maintenance off the main thread, measured before and after                                                                  |

## Build order

Each milestone is a PR with tests, so the git history itself tells the story.

| Milestone                          | Scope                                                                                                                                                 | Done when                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| M0. Rename and dependencies        | Rename to `market-terminal`; add `zod` and `big.js`                                                                                                   | CI green                                                                   |
| M1. Domain core                    | Types, decimal helpers, `Intl` price/percent/currency formatting, tick-size rounding                                                                  | Thorough unit tests for edge cases (rounding, negatives, huge/tiny values) |
| M2. Simulated source               | Seeded random-walk tickers, order-book snapshots and updates, trades                                                                                  | Same seed produces the same stream; app runs fully offline                 |
| M3. Streaming core                 | Connection state machine, exponential backoff with jitter, heartbeat/staleness detection, frame-batched stores, `useSyncExternalStore` selector hooks | Fake-timer tests for reconnect/stale paths; render-count tests             |
| M4. Watchlist (F1, F2)             | Shell and watchlist on the simulated source                                                                                                           | Usable end to end in demo mode; e2e smoke test                             |
| M5. Coinbase adapter               | Coinbase `MarketDataSource`, zod schemas, subscription management, live/demo switch                                                                   | Live data in the watchlist; schema tests with recorded messages            |
| M6. Order book and trades (F4, F5) | Book maintenance, grouping, gap detection and re-snapshot, virtualized tape                                                                           | Gap-recovery tests; stays at 60 fps under the simulated firehose           |
| M7. Proxy and charts (F3)          | Serverless proxy (allowlist, caching), candle history, live candle updates                                                                            | Chart works live and in demo mode                                          |
| M8. FX panel (F6)                  | Frankfurter rates, history, converter                                                                                                                 | Converter rounding tests                                                   |
| M9. News (F7)                      | Finnhub via the proxy                                                                                                                                 | Works with a key, degrades gracefully without one                          |
| M10. Ship                          | Deploy, CSP and security headers, Lighthouse/a11y audit, README with architecture diagram, ADRs and a demo GIF                                        | Public URL in the README                                                   |
| Stretch                            | F9 diagnostics, F10 Web Worker                                                                                                                        | Before/after numbers in the README                                         |

M1 to M4 need no network or keys, so the core stays fully testable from the start.

## Testing strategy

- **Unit (Vitest):** decimal and formatting helpers, order-book reducer, connection state machine with fake timers, zod schemas against recorded real messages.
- **Component (Testing Library + simulated source):** panels driven by deterministic streams; render-count assertions guard the batching guarantees.
- **API mocking (MSW):** REST endpoints (proxy, Frankfurter), including error and rate-limit responses.
- **E2E (Playwright):** run in demo mode against the production build, so tests never depend on live markets.

## Open decisions

- **Hosting for the site and proxy:** Vercel or Cloudflare Pages/Workers. Both have free tiers and support a proxy function.
- **Finnhub sign-up:** you'll need to create the account and API key yourself before M9. Until then, news runs on mocked data.
