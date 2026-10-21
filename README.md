# Portfolio Dashboard

A data dashboard built with React and TypeScript, with an emphasis on production-grade engineering: strict typing, tested behaviour, accessibility and a CI pipeline that enforces all of it.

> 🚧 Work in progress. The foundation is in place; features are being added.

## Tech stack

| Concern         | Choice                                                                       |
| --------------- | ---------------------------------------------------------------------------- |
| Build           | [Vite](https://vite.dev)                                                     |
| UI              | React 19, TypeScript (strict)                                                |
| Routing         | [React Router](https://reactrouter.com)                                      |
| Server state    | [TanStack Query](https://tanstack.com/query)                                 |
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
  app/        # App shell: providers, routes, layout
  features/   # Self-contained feature modules (see features/README.md)
  routes/     # Route-level pages
  styles/     # Global styles and design tokens
  mocks/      # MSW handlers shared by tests
  test/       # Test setup and helpers
e2e/          # Playwright specs
```

## Engineering decisions

- **Strict TypeScript**, including `noUncheckedIndexedAccess`, so index access is never assumed safe.
- **Tests exercise the real route tree.** `renderRoute()` mounts the app's actual routes in a memory router with an isolated query cache, so tests check behaviour rather than implementation details.
- **Unmocked network requests fail tests.** MSW runs with `onUnhandledFrame: 'error'`.
- **E2E runs against the production build**, not the dev server, so it tests what actually ships.
- **Accessibility from the start:** a skip link, a focusable `<main>`, visible focus styles, reduced-motion support and `jsx-a11y` lint rules.
