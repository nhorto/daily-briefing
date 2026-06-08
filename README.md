# Daily Briefing

A personal content aggregator that turns a pile of RSS feeds and websites into a
single, skimmable daily briefing. It fetches your sources, removes duplicate
coverage by clustering similar stories, writes concise AI summaries and a daily
"intelligence" digest, ranks everything to your interests, and lets you chat with
the day's content.

> Built with Next.js 16 + Bun. Runs self-hosted with a local JSON file store and
> **zero cloud dependencies** (no database, no native deps), or on Vercel with
> Vercel KV if you prefer.

## Features

- **Aggregation** — pulls articles from RSS/Atom feeds and plain web pages
  (HTML readability extraction), in parallel, with per-source error handling.
- **Deduplication & clustering** — groups stories covering the same topic using
  Levenshtein-based text similarity, and picks the highest-authority source as the
  cluster's representative.
- **AI summaries** — one-line article summaries and 2–3 sentence cluster summaries.
- **Daily intelligence digest** — a synthesized "what matters today" overview,
  broken down by category.
- **Categorization** — every article is tagged (AI/ML, business, science, security,
  programming, devops, design, …).
- **Personalization** — set interest weights per category; briefings re-rank to
  surface what you care about ("For You" ordering).
- **Read tracking** — mark articles read; state persists.
- **Interactive chat** — ask high-level or article-specific questions about the
  day's briefing, with streaming responses.
- **Source management UI** — add/edit/remove sources, set authority, toggle active.

## Tech stack

| Layer       | Choice                                            |
| ----------- | ------------------------------------------------- |
| Framework   | Next.js 16 (App Router)                           |
| Runtime     | Bun                                               |
| Storage     | Local JSON file (self-host) · Vercel KV (cloud)   |
| AI          | OpenAI (`gpt-4o` / `gpt-4o-mini`) via the AI SDK  |
| Parsing     | `rss-parser` + `@mozilla/readability`             |
| Similarity  | `fastest-levenshtein`                             |
| Styling     | Tailwind CSS v4                                   |

## Quick start (self-hosted)

The default setup needs no cloud account — just Bun and an OpenAI API key.

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.local.example .env.local
#   then edit .env.local and set OPENAI_API_KEY and CRON_SECRET

# 3. Run the dev server
bun run dev
```

Open <http://localhost:3000>. On first boot the app seeds a starter set of sources
from `config/sources.json` and creates a local store at `data/local.json`.

Generate your first briefing (the dev server must be running):

```bash
curl -X POST http://localhost:3000/api/cron/aggregate \
  -H "Authorization: Bearer $CRON_SECRET"
```

Then visit `/briefing` to read it, `/sources` to manage feeds, and `/settings` to
tune your interests.

### Environment variables

| Variable             | Required    | Purpose                                            |
| -------------------- | ----------- | -------------------------------------------------- |
| `OPENAI_API_KEY`     | Yes         | Summaries, categorization, intelligence, and chat. |
| `CRON_SECRET`        | Yes         | Protects the `/api/cron/aggregate` endpoint.        |
| `KV_REST_API_URL`    | Cloud only  | Set (with the token) to use Vercel KV instead of the local file store. |
| `KV_REST_API_TOKEN`  | Cloud only  | Vercel KV auth token.                               |

If the KV variables are unset, the app automatically uses the local JSON file store.

## Configuration & data

- **Sources and preferences** are permanent config. They live in the store and are
  also committed as JSON seed files under `config/` so they travel with the repo and
  auto-load on a fresh machine.
- **Briefings, the intelligence digest, and read status** are ephemeral — they
  regenerate daily and are never committed. Locally they live in `data/local.json`
  (gitignored).

See [`docs/hosting.md`](docs/hosting.md) for the full data model and sync strategy.

## Scheduling the daily briefing

Self-hosted, use a system cron to hit the aggregation endpoint each morning:

```cron
0 8 * * * curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://localhost:3000/api/cron/aggregate
```

On Vercel, `vercel.json` already configures a daily cron (08:00 UTC).

## Project structure

```
app/            Next.js App Router — pages and API route handlers
components/      React components (cards, chat, layout, ui/ primitives)
lib/
  kv.ts         Storage abstraction (local JSON file / Vercel KV cloud)
  types.ts      Shared TypeScript types
  services/     aggregator · clustering · categorizer · summarizer · intelligence
  utils/        similarity · personalization · date (unit-tested pure functions)
config/         Committed seed files (sources.json)
docs/           Architecture, setup, and hosting guides
```

## Scripts

```bash
bun run dev         # start dev server (Turbopack)
bun run build       # production build
bun run start       # serve the production build
bun run test        # run the test suite (bun test)
bun run typecheck   # tsc --noEmit
bun run lint        # lint with Biome
bun run format      # auto-format with Biome
```

CI (GitHub Actions) runs lint, typecheck, test, and build on every push.

## Documentation

- [Setup guide](docs/setup.md) — detailed local and production setup
- [Architecture](docs/architecture.md) — how the system is put together
- [Hosting & data](docs/hosting.md) — deployment options and the data model
- Historical planning notes live in [`docs/archive/`](docs/archive/)

## License

[MIT](LICENSE)
