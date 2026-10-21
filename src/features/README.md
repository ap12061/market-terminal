# Features

Each feature is a self-contained folder that owns its components, hooks, API calls and tests:

```
features/
  example/
    api/          # fetchers + TanStack Query hooks
    components/
    index.ts      # the feature's public API: import from here, never from internals
```

Features may depend on `@/shared` code but never on each other's internals.
