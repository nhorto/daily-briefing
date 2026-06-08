# Architecture

How Daily Briefing is put together. For setup see [setup.md](setup.md); for
deployment and the data model see [hosting.md](hosting.md).

## Overview

Daily Briefing is a Next.js 16 (App Router) app on the Bun runtime. Once a day (via
cron) it aggregates configured sources, deduplicates overlapping coverage into topic
clusters, summarizes and categorizes the content with OpenAI, synthesizes a daily
"intelligence" digest, and stores the result. The UI then renders a personalized,
skimmable briefing and offers chat over the day's articles.

## Pipeline

The aggregation job (`app/api/cron/aggregate/route.ts`) runs these stages:

1. **Fetch** — `lib/services/aggregator.ts` pulls every active source in parallel.
   RSS/Atom feeds are parsed with `rss-parser`; plain web pages fall back to
   readability extraction (`@mozilla/readability` + `jsdom`). Per-source errors are
   captured, not fatal.
2. **Cluster** — `lib/services/clustering.ts` groups similar articles using
   normalized Levenshtein title/excerpt similarity (`lib/utils/similarity.ts`,
   ~0.7 threshold). The highest-`authority` source becomes the cluster's
   representative.
3. **Categorize** — `lib/services/categorizer.ts` tags each article with an
   `ArticleCategory` (AI/ML, business, science, security, programming, devops,
   design, other) using `gpt-4o-mini`.
4. **Summarize** — `lib/services/summarizer.ts` writes one-line article summaries
   and 2–3 sentence cluster summaries (`gpt-4o`).
5. **Synthesize** — `lib/services/intelligence.ts` produces the daily digest:
   top stories plus per-category overviews (`gpt-4o`).
6. **Store** — the `Briefing` and `DailyIntelligence` are persisted with TTLs.

At read time, `lib/utils/personalization.ts` re-ranks articles by the user's
per-category interest weights for the "For You" ordering.

## Storage

`lib/kv.ts` is a thin key/value abstraction with two backends, chosen at runtime:

- **Local JSON file (default)** — a plain JSON store at `data/local.json` when the
  Vercel KV env vars are absent. Runtime-agnostic (works under the Node runtime Next
  uses, and under Bun), no native deps, persists across restarts, and enforces TTLs.
- **Vercel KV (Redis)** — used when `KV_REST_API_URL` / `KV_REST_API_TOKEN` are set.

Permanent config (sources, preferences) is also committed under `config/` and
auto-seeded into the store on first boot via `seedFromConfigFile`. Ephemeral data
(briefings, intelligence, read status) carries TTLs and is never committed.

| Data | Key | TTL |
| ---- | --- | --- |
| Today's briefing | `briefing:today` | 24h |
| Briefing by date | `briefing:<date>` | 7d |
| Intelligence digest | `intelligence:today` | 24h |
| Read article IDs | `read:articles` | 30d |
| Sources | `sources:config` | none |
| Preferences | `user:preferences` | none |

## Key design decisions

- **Text similarity over embeddings** — Levenshtein on titles/excerpts needs no
  vector DB and no embedding API cost; good enough for clustering same-day news.
- **Context-window chat, not RAG** — a day's articles fit comfortably in the model
  context, so chat passes them inline instead of running a retrieval stack.
- **Hybrid storage** — the same code self-hosts on a local JSON file or runs on
  Vercel KV with no changes; the backend is decided purely by environment variables.
- **Seed files for config** — sources/preferences live as diffable JSON in git, so
  config travels with the repo while the binary DB stays local.

## Tech stack

| Layer | Choice |
| ----- | ------ |
| Framework | Next.js 16 (App Router) |
| Runtime | Bun |
| Storage | local JSON file (self-host) · Vercel KV (cloud) |
| AI | OpenAI `gpt-4o` / `gpt-4o-mini` via the Vercel AI SDK |
| Parsing | `rss-parser`, `@mozilla/readability`, `jsdom` |
| Similarity | `fastest-levenshtein` |
| Styling | Tailwind CSS v4 |

## Code map

```
app/
  api/
    briefing/            GET today's briefing
    chat/                POST streaming chat over the briefing
    sources/             CRUD for sources
    preferences/         GET/PUT interest weights
    intelligence/        GET digest (+ category drill-down)
    articles/            article detail + read tracking
    config/              import/export config seed files
    cron/aggregate/      the daily pipeline (secured by CRON_SECRET)
  briefing/  article/  sources/  settings/   pages
components/              cards, chat panel, layout, ui/ primitives
lib/
  kv.ts                  storage abstraction
  types.ts               shared types (source of truth for data shapes)
  services/              aggregator · clustering · categorizer · summarizer · intelligence
  utils/                 similarity · personalization · date (unit-tested)
config/                  committed seed files (sources.json)
```

## Testing

Pure logic in `lib/utils` and `lib/services` is unit-tested with `bun test`
(co-located `*.test.ts` files). Run `bun run test` and `bun run typecheck`.
