# Hosting & Data Persistence Guide

## The Data Problem

The app stores two kinds of data:

| Type | Examples | Lifespan | Should sync across machines? |
|------|----------|----------|------------------------------|
| **Config** | Sources, preferences | Permanent | Yes |
| **Ephemeral** | Briefings, intelligence, read status | 24h-30d | No |

### Why NOT push the SQLite database to GitHub

- **Binary files** don't diff — every change replaces the entire file
- **Merge conflicts** are unresolvable (two machines edit the DB independently)
- **Repo bloat** — git stores every version forever, even after deletion
- **Secrets risk** — briefing content could contain sensitive data

### The right approach: Seed files

Instead, export your **permanent config** (sources + preferences) to committed JSON files. These are human-readable, diffable, and sync naturally through git.

```
data/
  local.db          ← gitignored, local only

config/
  sources.json      ← committed, syncs via git
  preferences.json  ← committed, syncs via git
```

**How it works:**
1. Add/edit sources via the UI as normal
2. Run `GET /api/sources` or `GET /api/preferences` to export current config
3. Save to `config/sources.json` and `config/preferences.json`
4. Commit and push — your config travels with the repo
5. On a new machine, the app auto-loads from these seed files on first boot

The API routes `GET /api/config/export` and `POST /api/config/import` handle this (see implementation below).

---

## Hosting Options

### Option 1: Vercel (Recommended)

The app is already configured for Vercel. This is the simplest path to production.

**What you get:**
- Free hosting (Hobby tier)
- Automatic deployments from GitHub
- Built-in cron jobs (daily briefing generation)
- Vercel KV (Redis) for persistent storage
- Edge functions, CDN, HTTPS — all free

**Setup:**
1. Push repo to GitHub
2. Connect repo to Vercel at vercel.com/new
3. Add environment variables in Vercel dashboard:
   - `OPENAI_API_KEY` — your OpenAI API key
   - `CRON_SECRET` — any random string for cron auth
   - `KV_REST_API_URL` — auto-set when you create a KV database
   - `KV_REST_API_TOKEN` — auto-set when you create a KV database
4. Create a Vercel KV database: Project Settings → Storage → Create Database
5. Deploy — Vercel auto-detects Next.js and builds

**Cost:**
- Vercel Hosting: **$0** (free tier)
- Vercel KV: **$0** (free tier, 256MB — more than enough)
- OpenAI API: **~$5-10/month** (20-30 articles/day)
- **Total: ~$5-10/month**

**Cron schedule:** Already configured in `vercel.json` — runs at 8:00 AM UTC daily.

### Option 2: Self-hosted (VPS / Raspberry Pi / Home Server)

Run it yourself on any machine with Node.js or Bun.

**What you get:**
- Full control over data
- No vendor lock-in
- Can use SQLite in production (no Redis needed)
- Works offline on local network

**Setup:**
1. Clone repo to your server
2. `bun install`
3. Copy `.env.local.example` to `.env.local`, fill in `OPENAI_API_KEY` and `CRON_SECRET`
4. `bun run build && bun run start`
5. Set up a cron job: `0 8 * * * curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/aggregate`
6. (Optional) Put behind nginx/caddy for HTTPS

**Cost:**
- Server: $0 (existing hardware) or ~$5/month (DigitalOcean, Hetzner)
- OpenAI API: ~$5-10/month
- **Total: ~$5-15/month**

**Note:** SQLite works fine for self-hosting since there's only one user. No need for Redis/KV.

### Option 3: Cloudflare Pages + D1

An alternative to Vercel with generous free tiers.

**What you get:**
- Free hosting with global CDN
- D1 (SQLite at the edge) — free tier includes 5GB
- Cron Triggers for daily aggregation
- No cold starts

**Trade-offs:**
- Requires adapting from Vercel KV to D1 (moderate effort)
- Next.js support is newer/less mature than Vercel's
- Would need to use `@cloudflare/next-on-pages`

**Cost:**
- Cloudflare: **$0** (free tier)
- OpenAI API: ~$5-10/month
- **Total: ~$5-10/month**

### Option 4: Railway / Fly.io / Render

Platforms that support persistent storage and cron.

**What you get:**
- Simple deploys from GitHub
- Persistent volumes (SQLite works in production)
- Built-in cron support
- More control than Vercel, less work than self-hosting

**Cost:**
- Hosting: $0-7/month depending on platform
- OpenAI API: ~$5-10/month
- **Total: ~$5-17/month**

---

## Recommendation

| Scenario | Best Option | Why |
|----------|-------------|-----|
| Just want it live ASAP | **Vercel** | Already configured, zero setup |
| Privacy-focused / offline use | **Self-hosted** | Full data control, works on LAN |
| Multi-user or scaling later | **Vercel** or **Railway** | Managed infrastructure |
| Cost-sensitive | **Vercel** or **Cloudflare** | Most generous free tiers |

For a personal daily briefing tool, **Vercel is the clear winner** — it's already configured, free, and handles cron/storage/deployment out of the box.

---

## Syncing Data Across Machines (Local Dev)

For local development across multiple machines, the seed file approach works:

### Export current config
```bash
# From your browser or curl:
curl http://localhost:3000/api/config/export > config/export.json

# Or use the export button on the Sources page (if added)
```

### Import on a new machine
```bash
# The app auto-imports from config/ on first boot if KV/SQLite is empty
# Or manually:
curl -X POST http://localhost:3000/api/config/import \
  -H "Content-Type: application/json" \
  -d @config/export.json
```

### What syncs vs what doesn't

| Data | Syncs via git? | Why |
|------|---------------|-----|
| Sources list | Yes (config/sources.json) | Permanent config |
| Preferences | Yes (config/preferences.json) | Permanent config |
| Briefings | No | Regenerated daily, machine-specific |
| Intelligence | No | Regenerated daily |
| Read status | No | Personal to each session |

---

## Environment Variables Reference

| Variable | Required | Where to set | Purpose |
|----------|----------|-------------|---------|
| `OPENAI_API_KEY` | Yes | `.env.local` (local) / Vercel dashboard (prod) | AI summarization and chat |
| `CRON_SECRET` | Yes | `.env.local` (local) / Vercel dashboard (prod) | Secures the aggregation endpoint |
| `KV_REST_API_URL` | Prod only | Vercel dashboard (auto-set with KV) | Vercel KV connection |
| `KV_REST_API_TOKEN` | Prod only | Vercel dashboard (auto-set with KV) | Vercel KV auth |
