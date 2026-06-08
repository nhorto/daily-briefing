# Setup Guide

This walks through running Daily Briefing locally (self-hosted), then optionally
deploying to the cloud. The default path needs **no cloud account** — just Bun and
an OpenAI API key.

## Prerequisites

- [Bun](https://bun.sh) v1.1+ (`curl -fsSL https://bun.sh/install | bash`)
- An OpenAI API key — <https://platform.openai.com/api-keys>
- Git

## 1. Install dependencies

```bash
bun install
```

## 2. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
OPENAI_API_KEY=sk-your-key-here
CRON_SECRET=your-random-string          # e.g. `openssl rand -hex 32`
```

Leave `KV_REST_API_URL` / `KV_REST_API_TOKEN` unset — the app will use a local
JSON file store at `data/local.json` automatically. Bun loads `.env.local` for you.

## 3. Run the dev server

```bash
bun run dev
```

Open <http://localhost:3000>. On first boot the app:

- creates `data/local.json`, and
- seeds the starter sources from `config/sources.json`.

## 4. Generate your first briefing

With the dev server running, trigger aggregation manually:

```bash
curl -X POST http://localhost:3000/api/cron/aggregate \
  -H "Authorization: Bearer $CRON_SECRET"
```

The response reports how many articles were fetched and clustered. Then:

- `/briefing` — read the day's briefing
- `/sources` — add/edit/remove feeds
- `/settings` — set per-category interest weights for "For You" ordering

## 5. Schedule it (self-hosted)

Add a system cron entry so the briefing rebuilds each morning:

```cron
0 8 * * * curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://localhost:3000/api/cron/aggregate
```

(Run `bun run build && bun run start` for a production server first.)

## Optional: deploy to the cloud

The app also runs on Vercel with Vercel KV instead of the local file store, and other
platforms work too. See [hosting.md](hosting.md) for the full comparison and steps. In short:

1. Push to GitHub and import the repo at <https://vercel.com/new>.
2. Add `OPENAI_API_KEY` and `CRON_SECRET` as environment variables.
3. Create a Vercel KV database — its `KV_REST_API_URL` / `KV_REST_API_TOKEN` are
   set automatically, which switches storage from the local file store to KV.
4. `vercel.json` already schedules the daily cron (08:00 UTC).

## Suggested sources

The seed file includes TechCrunch, The Verge, Hacker News, and Ars Technica. A few
more to consider:

| Category   | Feed                                                        |
| ---------- | ----------------------------------------------------------- |
| Tech news  | `https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml` |
| Tech news  | `http://feeds.bbci.co.uk/news/technology/rss.xml`           |
| Developer  | `https://dev.to/feed` · `https://css-tricks.com/feed/`      |

## Troubleshooting

| Symptom | Likely cause / fix |
| ------- | ------------------ |
| "No active sources configured" | Add sources at `/sources`, or check `config/sources.json`. |
| Aggregation returns 401 | The `Authorization: Bearer` value must match `CRON_SECRET`. |
| Empty briefing | Cron hasn't run, or every source failed to fetch — check the response/logs. |
| OpenAI errors | Invalid key, no billing, or rate limited — check `.env.local` and your OpenAI usage. |
| Data resets unexpectedly | `data/` is gitignored and local-only; deleting it clears briefings. |

## Cost

Self-hosting itself is free; the only cost is OpenAI usage — roughly **$5–10/month**
for ~20–30 articles/day. Monitor it at <https://platform.openai.com/usage>.
