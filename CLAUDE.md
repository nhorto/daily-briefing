# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this project is

**Daily Briefing** is a personal content aggregator built with **Next.js 16 (App Router)**
running on the **Bun** runtime. It fetches RSS/web sources, deduplicates similar
articles into topic clusters, generates AI summaries and a daily "intelligence"
digest, and offers an interactive chat over the day's content.

This is a Next.js app — **not** a `Bun.serve()` app. Use the Next.js App Router
(`app/`), API route handlers (`app/api/**/route.ts`), and React Server/Client
Components. Do not introduce `Bun.serve()`, Express, or Vite here.

## Toolchain

Use **Bun** as the package manager and script runner:

- `bun install` — install dependencies (not npm/yarn/pnpm)
- `bun run dev` — start the dev server (`next dev --turbopack`)
- `bun run build` / `bun run start` — production build / serve
- `bun run test` — run the test suite (`bun test`)
- `bun run typecheck` — type-check with `tsc --noEmit`
- `bun run lint` — lint with Biome (`bun run format` to auto-format)
- `bunx <pkg>` — run a package binary (not npx)

Bun loads `.env.local` automatically — **do not** add `dotenv`.

## Architecture

```
app/            Next.js App Router (pages + API route handlers)
  api/          Route handlers: briefing, chat, sources, preferences,
                intelligence, articles, config import/export, cron/aggregate
components/     React components (cards, chat, layout, ui/ primitives)
lib/
  kv.ts         Storage layer (Vercel KV in prod, local JSON file locally)
  types.ts      Shared TypeScript types — the source of truth for data shapes
  services/     aggregator, clustering, categorizer, summarizer, intelligence
  utils/        similarity, personalization, date (pure functions, unit-tested)
config/         Committed seed files (sources.json) auto-loaded on first boot
data/           Local JSON store (gitignored, created at runtime)
docs/           Architecture, setup, and hosting guides
```

## Storage model

`lib/kv.ts` is a thin abstraction over a key/value store:

- **Self-hosted / local (default):** falls back to a **local JSON file store** at
  `data/local.json` when `KV_REST_API_URL` / `KV_REST_API_TOKEN` are unset. Works
  under both the Node and Bun runtimes (Next runs route handlers under Node), with
  no native dependencies; persists across restarts and honors TTLs.
- **Cloud (optional):** uses **Vercel KV (Redis)** when those env vars are set.

Permanent config (sources, preferences) is **also** committed as JSON under
`config/` and auto-seeded into the store on first boot. Ephemeral data
(briefings, intelligence, read status) is never committed — it regenerates.

## Conventions

- TypeScript is `strict` with `noUncheckedIndexedAccess` — handle `undefined`
  from indexed access and array lookups explicitly.
- Keep pure logic in `lib/utils` and `lib/services` so it stays unit-testable;
  co-locate tests as `*.test.ts` next to the code.
- AI model IDs live at the top of each service file in `lib/services/` as a
  `MODEL` constant — change them there, not inline.
- Add new data shapes to `lib/types.ts` rather than redefining inline.

## Before you finish

Run `bun run typecheck`, `bun run test`, and `bun run lint`. All should pass
clean (lint may emit a11y warnings — those are tracked separately). CI runs the
same checks plus `bun run build` on every push.
