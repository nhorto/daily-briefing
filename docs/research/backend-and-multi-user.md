# Backend & Multi-User Architecture — Research & Migration Plan

> **Status:** Research + recommendation. Nothing built yet — this is the document we
> would build from, the same way `recommendation-engine-and-ux.md` preceded the engine.
> **Date:** 2026-06-09.
>
> **Decisions locked with the owner (the brief for this research):**
> - **Target:** invite-only multi-user, **~dozens of users** (not public signup, not thousands).
> - **Content model:** **per-user sources & briefings** — each user defines their own
>   sources and gets their own aggregated briefing.
> - **Infrastructure:** **open to managed services** (hosted DB / auth / jobs) to cut ops work.
> - **Deliverable:** this document + a **phased migration plan**.

---

## Part 0 — TL;DR

Today the app is **single-user with no concept of a user at all**: every piece of state is a
global singleton behind the `lib/kv.ts` key/value seam (local JSON file by default). Going
multi-user is, at heart, **three additions** — *identity* (who is this), *tenancy* (scope every
read/write to that user), and *per-user scheduled work* (run the daily aggregation once per
user) — plus moving the store from a JSON file to a real database.

**Recommended stack (managed, lowest-ops — matches "open to managed services"):**

| Concern | Pick | Why |
|---|---|---|
| **Database + vectors** | **Supabase** (Postgres + `pgvector` + Row-Level Security) | One platform gives the DB, DB-enforced tenant isolation, and vector storage you need anyway. |
| **Auth (invite-only)** | **Supabase Auth** (`inviteUserByEmail`, public sign-up off) | Integrates with RLS via `auth.uid()`, so per-user scoping is enforced in the database, not just hoped for in app code. |
| **App hosting** | **Vercel** (Node-runtime route handlers) | Best Next.js 16 DX; jobs live off-platform so its function time limits never bite. |
| **Per-user aggregation jobs** | **Trigger.dev** (or **Inngest**) | The daily job is long-running + per-user + multi-LLM — the textbook case serverless timeouts break. Durable, step-based, per-step retries. |
| **AI** | Keep OpenAI; **add a cost lever** (mini summary model + global embedding dedup) | At dozens of users, OpenAI is ~95% of the bill; the runner is rounding error. |

**The one real fork** is bundled-vs-portable (Part D): the stack above is the *least to build*;
a **Neon + Better Auth + Railway** stack is *lower lock-in and cheaper* but more wiring. Both
run the **identical data model** in Part E, so this choice can be deferred to Phase 1.

**Cost at ~30 users, daily:** infra ~**$25–55/mo**; **OpenAI ~$110–160/mo at gpt-4o**, which
drops to **~$15–25/mo** by switching summaries to a mini-class model and deduping embeddings
globally. So the whole thing is **~$40–80/mo all-in** with the cost levers applied.

---

## Part A — Where we are today

Single-user by construction. All state lives behind one seam — `lib/kv.ts` — over a local JSON
file (`data/local.json`, gitignored) or Vercel KV (Redis). **There is no `userId` anywhere.**
Every key is a global singleton:

| KV key (today) | Holds | Multi-user home (Part E) |
|---|---|---|
| `user:preferences` | category/source weights, muted keywords, onboarding baseline, diversity dial | `preferences` (1 row/user) |
| `user:profile` | semantic profile: running liked/disliked vector sums + retained liked exemplars | `profile_vectors` (1 row/user) |
| `sources:config` | the user's RSS/web sources | `sources` (rows/user) |
| `briefing:today`, `briefing:<date>`, `briefing:dates` | the daily briefing (clusters + individual articles) | `briefings` + `briefing_clusters` + `briefing_items` (per user) |
| `intelligence:today` | the AI daily digest | `briefings.intelligence` (per user) |
| `read:articles`, `feedback:articles`, `bookmarks` | per-article read / 👍👎hide / saves | `article_signals` (per user×article) |
| `engagement:seen`, `impressions`, `engagement:click-ranks` | behavioral signals | `article_signals` (per user×article) |
| `emb:<articleId>` | a 512-dim embedding per article | `embeddings` (**shared**, deduped by URL) |
| `content:<url>` | cached extracted full text | `article_content` (**shared**, deduped by URL) |

API surface that becomes per-user (each must read the caller's identity and scope its query):
`/api/briefing`, `/api/briefing/dates`, `/api/intelligence`, `/api/intelligence/category`,
`/api/sources`, `/api/preferences`, `/api/preferences/reset`, `/api/profile`, `/api/feedback`,
`/api/signals`, `/api/bookmarks`, `/api/articles/read`, `/api/articles/[id]`,
`/api/articles/[id]/content`, `/api/chat`, `/api/onboarding`, `/api/config/{import,export}`,
`/api/cron/aggregate`.

**Durability gap (relevant to "is this stored safely"):** the code is safe on GitHub, but
`data/local.json`, `.env.local`, and the project memory live **only on one disk**. A real
backend with a managed database fixes this — the user's data becomes durable and portable, not
tied to one machine.

---

## Part B — The target, in one picture

```
                       ┌─────────────────────────────────────────┐
   Browser  ──────►    │  Next.js 16 app (Vercel)                 │
   (user signs in)     │   • route handlers, scoped to auth user  │
                       │   • the recommendation engine (unchanged)│
                       └───────────────┬─────────────────────────┘
                                       │  every query scoped by user_id
                                       ▼
                       ┌─────────────────────────────────────────┐
                       │  Postgres + pgvector  (Supabase)         │
                       │   • SHARED corpus: articles, embeddings, │
                       │     extracted content (deduped by URL)   │
                       │   • PER-USER: sources, preferences,      │
                       │     profile, briefings, signals (RLS)    │
                       └───────────────▲─────────────────────────┘
                                       │  writes briefings per user
                       ┌───────────────┴─────────────────────────┐
   Scheduler (daily) ─►│  Job runner (Trigger.dev / Inngest)      │
                       │   fan-out: 1 durable job per user →       │
                       │   fetch sources · cluster · summarize ·   │
                       │   embed · write briefing                  │
                       └───────────────┬─────────────────────────┘
                                       ▼   OpenAI (gpt-4o / -mini + embeddings)
```

**The load-bearing design decision: per-user *briefings*, globally-*deduped* corpus.** The owner
chose "per-user sources & briefings." Naively that means re-fetching, re-extracting, and
re-embedding the same article once per user — wasteful, since dozens of people following
overlapping AI/tech feeds will pull the same URLs. So:

- **Article-intrinsic data is shared, deduped by URL hash** — the embedding, the extracted full
  text, and a base article summary are computed **once per unique URL** and reused by everyone.
- **Contextual data stays per-user** — which sources you follow, your clusters (they depend on
  *your* source mix), your daily digest, your ranking, and all your signals.

This keeps the "per-user" model affordable: personalization is preserved (your profile × the
shared embeddings = your ranking), but the expensive work (embeddings, extraction) happens once
regardless of how many users see an article.

---

## Part C — Component research

Condensed from three parallel research passes (full source links in the Appendix).

### C1 — Authentication (invite-only)

> **Ecosystem shift to know:** in Sept 2025 the **Auth.js / NextAuth** team merged into
> **Better Auth**; Auth.js is now maintenance-only and Better Auth is the recommended default
> for new projects. So "just use NextAuth" is no longer the reflex answer.

| Option | Invite-only | App Router fit | Sessions | Hosted vs self | ~30 users/mo | Lock-in |
|---|---|---|---|---|---|---|
| **Supabase Auth** | `auth.admin.inviteUserByEmail()`, public sign-up off | Good (`@supabase/ssr`) | JWT + refresh, in Supabase | Managed | **$0** (with the DB) | Medium |
| **Better Auth** | built-in org/invite plugin, or a pre-seeded allowlist | Excellent (code-first, owns schema) | **Your DB** | Self-host | **$0** + DB | **Lowest** |
| **Clerk** | dashboard invites, restricted mode | Best-in-class prebuilt UI | Managed | Managed only | **$0** (free to 50k MAU) | **Highest** |
| **WorkOS AuthKit** | first-class invite-only toggle | Good | Managed | Managed | **$0** (free to 1M MAU) | Medium |

**Pick:** **Supabase Auth** *if* the DB is Supabase (RLS integrates with `auth.uid()` — tenant
isolation enforced in the database). **Better Auth** if you want to own the user table and keep
lock-in lowest. Clerk is the fastest to ship if developer-hours are the scarce resource, at the
cost of your users living on Clerk's infra.

### C2 — Database, data model, embeddings

| | **Supabase (PG)** | **Neon (PG)** | **Turso (SQLite)** |
|---|---|---|---|
| Multi-tenant isolation | **RLS + Auth integrated** | RLS (wire your own auth) | **No RLS** — DB-per-tenant |
| Vectors | `pgvector` | `pgvector` | native DiskANN |
| Branching/dev | good | **best** | per-DB |
| ~scale price | ~$25/mo Pro (avoids free-tier pause) | pay-as-you-go, scale-to-zero | $0–5/mo |
| Lock-in | medium (Auth/RLS specific) | **low** (plain PG) | higher |

**Pick: Supabase Postgres + `pgvector`.** For a *shared* recommendation corpus with per-user
overlays, the deciding factor is the multi-tenant story, not raw speed. Turso's DB-per-tenant is
the wrong shape (it fights global article dedup and cross-user queries). Neon is the best
*pure-Postgres* option and the natural choice if minimizing lock-in wins (the schema is
identical). Supabase wins the default because invite-only multi-user needs **Auth + DB-enforced
isolation anyway**, and it delivers both in one place.

**Embeddings:** the vectors are **512-dim, normalized** `text-embedding-3-small`. At dozens of
users × low-thousands of articles, **no vector index is needed** — `pgvector` does exact
brute-force cosine, which is the documented recommendation below ~tens of thousands of vectors
and is what you *want* for a ranking engine (perfect recall). The single change worth making:
**move the cosine into Postgres** (`ORDER BY embedding <=> $profile`) instead of shipping every
512-float vector to the app and looping in TypeScript. Add an **HNSW index only if** a single
searchable set ever crosses **~50k–100k vectors** (this app won't soon).

### C3 — Per-user background jobs (and the serverless timeout reality)

The daily aggregation is **long-running** (N source fetches + clustering + multiple gpt-4o calls
+ per-article embeddings — can run minutes), **per-user**, and **best-effort per step**. That is
exactly what a single serverless function cannot hold.

**Hard timeout numbers (2026):** Vercel functions cap at **300s (Hobby) / 800s (Pro)** even with
Fluid compute; Supabase Edge Functions cap at **150s–400s**; **Trigger.dev has no timeout**
(runs on its own compute); a **VPS/worker** has none. A single cron handler looping all users
will 504.

| Runner | Fan-out | Long jobs | Retries/observability | ~30 users/day | Lock-in |
|---|---|---|---|---|---|
| **Trigger.dev** | `batchTrigger` per user | **no timeout** | strong, **self-hostable** | ~$10/mo Hobby (pennies of compute) | medium, low if self-host |
| **Inngest** | event fan-out | durable steps survive timeouts | best-in-class | free tier covers it | medium |
| **Vercel Cron + routes** | loop/`fetch` per user | must fit ≤800s/user, hand-rolled | DIY | ~$0 (Pro for sub-daily) | low |
| **QStash** | 1 msg/user | drives a queue; your route still capped | good delivery, lighter | free at this scale | low |
| **VPS/worker + cron** | loop in code | **none** | all DIY | ~$5/mo | **lowest** |

**Pick:** **Trigger.dev** (or **Inngest** if you want it inside your Next deploy). Per-user
fan-out, automatic per-step retries (a failed embed step retries without redoing summaries —
matches the existing "non-fatal per step" design), and real observability, without
re-architecting around the 800s cap. A plain **Railway/VPS worker** is the lowest-lock-in
alternative if you prefer to just run the existing TS services in a loop.

---

## Part D — Recommended stack & the one real fork

**Primary recommendation (managed, least to build):**

> **Vercel** (app) · **Supabase** (Postgres + `pgvector` + Auth + RLS) · **Trigger.dev** (per-user
> aggregation) · **OpenAI** (with the cost lever in Part F).

This is the lowest-ops path and matches "open to managed services": identity, tenancy
(DB-enforced via RLS), vectors, and durable jobs are all handled by managed platforms with
generous free/cheap tiers.

**The fork — bundled vs portable:**

| | **Bundled (recommended)** | **Portable (alternative)** |
|---|---|---|
| DB | Supabase | **Neon** (plain Postgres) |
| Auth | Supabase Auth | **Better Auth** (your `users` table) |
| App + jobs | Vercel + Trigger.dev | **Railway** (app + always-on worker) |
| Tenant isolation | DB-enforced (RLS) | app-layer (the repository always scopes by `user_id`) |
| Infra cost | ~$25–55/mo | ~$5–20/mo |
| Trade | a little lock-in, **much less to build** | you own everything, **more wiring** |

Both run the **identical schema** (Part E), so you don't have to settle this now — Phase 1 picks
a Postgres and the rest follows. Given the owner explicitly chose "open to managed services" to
cut ops, the bundled stack is the default; the portable stack is documented for when/if lock-in
becomes a concern.

---

## Part E — Data model (multi-tenant Postgres)

**Principle:** split **shared global content** (deduped by URL) from **per-user signals**
(scoped by `user_id`, protected by RLS). `articles` / `article_content` / `embeddings` are a
read-only shared corpus; everything else is per-user.

```sql
-- ===== Identity (Supabase Auth provides auth.users; or Better Auth's users table) =====
create table profiles (
  id          uuid primary key references auth.users(id),
  email       text,
  is_invited  boolean default true,          -- invite-only gate
  created_at  timestamptz default now()
);

-- ===== SHARED CORPUS (deduped by URL; no RLS / read-only to all signed-in users) =====
create table articles (
  id           uuid primary key default gen_random_uuid(),
  url_hash     text unique not null,          -- sha256(normalized url) — global dedup key
  url          text not null,
  title        text, base_summary text, category text,  -- base_summary shared per article
  published_at timestamptz, fetched_at timestamptz default now()
);
create table article_content (                 -- was content:<url>
  article_id   uuid primary key references articles(id),
  full_text    text, extracted_at timestamptz default now()
);
create table embeddings (                      -- was emb:<articleId>
  article_id   uuid primary key references articles(id),
  embedding    vector(512) not null            -- pgvector; NO index at this scale
);

-- ===== PER-USER CONFIG (RLS: user_id = auth.uid()) =====
create table sources (                         -- was sources:config (now per-user)
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  url text not null, name text, type text, weight real default 1.0,
  unique (user_id, url)
);
create table preferences (                     -- was user:preferences (1 row/user)
  user_id uuid primary key references profiles(id),
  category_weights jsonb default '{}', source_weights jsonb default '{}',
  muted_keywords text[] default '{}', onboarding_baseline jsonb,
  diversity_dial int default 40, onboarded_at timestamptz
);
create table profile_vectors (                 -- was user:profile
  user_id uuid primary key references profiles(id),
  liked_sum vector(512), disliked_sum vector(512),
  liked_count int default 0, disliked_count int default 0,
  exemplars jsonb                              -- retained liked vectors for k-means
);

-- ===== PER-USER BRIEFINGS (the aggregation output) =====
create table briefings (                       -- was briefing:<date> / :dates / intelligence:today
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  briefing_date date not null, intelligence jsonb,
  unique (user_id, briefing_date)
);
create table briefing_clusters (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references briefings(id) on delete cascade,
  user_id uuid not null, theme text, rank int
);
create table briefing_items (                  -- clusters[].articles + individualArticles[]
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references briefings(id) on delete cascade,
  cluster_id uuid references briefing_clusters(id) on delete cascade,  -- null = individual
  article_id uuid not null references articles(id),                    -- points at SHARED article
  user_id uuid not null, rank int
);

-- ===== PER-USER SIGNALS (one row per user×article) =====
create table article_signals (                 -- read:/feedback:/bookmarks/engagement:* collapse here
  user_id uuid not null references profiles(id),
  article_id uuid not null references articles(id),
  is_read boolean default false, feedback smallint, is_hidden boolean default false,
  is_bookmarked boolean default false, seen_count int default 0, click_rank int,
  updated_at timestamptz default now(),
  primary key (user_id, article_id)
);
```

**RLS pattern** for every `user_id` table: `enable` + `force` row-level security, connect as a
non-owner role without `BYPASSRLS`, policy `using (user_id = auth.uid())`. The shared corpus
tables keep RLS off (or allow-all-reads) — there is no per-user secret in a public article's
vector.

**Dedup nuance (cost):** `embedding`, `full_text`, and a `base_summary` are **article-intrinsic
→ shared, computed once per URL**. Clusters, the daily digest, and ranking are **contextual →
per-user**. So a new user following popular feeds mostly *reuses* existing embeddings/extractions
and only pays for their own clustering + digest.

---

## Part F — Cost model (~30 users, daily)

**OpenAI dominates; the job runner is rounding error.** Rough monthly estimate:

| Line | At gpt-4o | With levers |
|---|---|---|
| Embeddings (~80 articles/user/day, deduped globally) | ~$1 | ~$0.10 (dedup + batch) |
| Summaries + daily digest (~14 LLM calls/user/day) | **~$110–150** | **~$7–15** (mini model) |
| DB (Supabase Pro) | ~$25 | ~$25 (or ~$0–10 Neon) |
| Job runner (Trigger.dev / Inngest) | ~$0–10 | ~$0–10 |
| App host (Vercel) | ~$0–20 | ~$0–20 |
| **Total** | **~$135–215/mo** | **~$40–80/mo** |

**Levers, in impact order:** (1) **summaries on a mini-class model** — the single biggest win,
a one-line change to the `MODEL` constant per `lib/services/*` file (~17× cheaper);
(2) **global embedding + extraction dedup** (already in the schema); (3) **OpenAI Batch API**
(50% off) for non-urgent work; (4) **truncate** the text fed to the summarizer.

> **Decision to revisit:** memory records that for your *single-user* instance you deliberately
> kept gpt-4o over mini for summary quality. At dozens of users that choice is the dominant cost.
> Options: keep gpt-4o for your own account and default *other* users to mini; or move everyone
> to a current mini-class model (quality is much closer now than when that decision was made).
> This is a knob, not a fork — set it per-user if you like.

---

## Part G — Phased migration plan

Designed to **minimize rewrite** by evolving the existing `lib/kv.ts` seam into a `userId`-scoped
repository, and to **never have a big-bang cutover** — each phase ships and is verifiable.

### Phase 0 — Introduce `userId` at the seam (no infra change)
*Goal: make the code multi-user-shaped while still running on the local JSON store as a single
"user 0 (you)".*
- Refactor `lib/kv.ts` into a repository interface where every function takes a `userId`
  (today: a hardcoded `DEFAULT_USER_ID`). Keys become namespaced (`u:<id>:user:preferences`, …).
- Thread a `userId` resolver through API routes (returns `DEFAULT_USER_ID` for now).
- **Done when:** typecheck/test/lint green, app behaves identically, but every read/write is
  user-scoped internally. *No behavior change, pure seam.*

### Phase 1 — Stand up Postgres + the repository implementation
*Goal: swap the JSON store for a managed Postgres behind the same interface.*
- Pick the stack fork (Part D). Provision Supabase (or Neon). Apply the Part E schema + RLS.
- Implement the repository against Postgres (pure-JS `postgres`/`pg` driver — **no native deps**;
  keep the `bun:sqlite` / Windows-ARM64 lesson in mind). Keep the local-JSON impl behind a flag
  for dev.
- Write a one-shot migration that loads today's `data/local.json` in as user 0 (your data).
- **Done when:** the app runs entirely on Postgres for the single user, data intact.

### Phase 2 — Auth + invite-only + tenancy
*Goal: real logins; the resolver returns the authenticated user.*
- Add Supabase Auth (or Better Auth). Public sign-up **off**; an admin invite flow
  (`inviteUserByEmail` / allowlist). Add a session → `userId` helper; protect routes in the
  handlers (Next 16 deprecates heavy Edge middleware — gate in route handlers / server
  components).
- Turn on RLS policies; the app connects as a non-owner role. Verify a second test user cannot
  read user 0's rows.
- **Done when:** you sign in; an invited second account sees an empty, isolated workspace.

### Phase 3 — Per-user sources + per-user aggregation
*Goal: the daily job runs once per user.*
- `sources` becomes per-user rows (onboarding already collects sources). The existing
  aggregation pipeline (`lib/services/aggregation.ts`) is parameterized by `userId`.
- Move aggregation off the request path to **Trigger.dev/Inngest** (or a Railway worker):
  a daily scheduler **fans out one durable job per user**; steps = fetch → cluster → summarize →
  embed → write briefing, each retryable. Implement **global dedup** (skip fetch/extract/embed
  for a URL already in the shared corpus).
- **Done when:** all users get a fresh briefing on schedule without timeouts; a failed step
  retries in isolation.

### Phase 4 — Embeddings/profile in Postgres (`pgvector`)
*Goal: vectors live in the DB; cosine runs in SQL.*
- Store article vectors in `embeddings.embedding (vector(512))`; per-user profile in
  `profile_vectors`. Replace the TS brute-force cosine in `/api/profile` with a `pgvector`
  query (still exact, no index). Keep the multi-cluster k-means (it reads the exemplars).
- **Done when:** ranking fit is computed in-DB; `/api/profile` returns the same scores with far
  less data over the wire.

### Phase 5 — Hardening & cost
*Goal: production-ready for invited users.*
- Apply the cost lever (mini summary model and/or per-user model choice), Batch API where it
  fits, input truncation. Add backups (managed Postgres = automatic), basic rate limiting on
  auth/invite, and per-user job observability/alerts. Document the deploy.
- **Done when:** a handful of real invited users are running daily within the target budget.

---

## Part H — Risks & open decisions

- **Per-user cost scaling.** "Per-user briefings" means per-user clustering + digest LLM calls;
  the mini-model lever (Part F) is what keeps it cheap. **Decide the summary model per-user vs
  global** before Phase 3.
- **Aggregation time × users.** Dozens of multi-minute jobs daily is fine on a durable runner;
  fan-out + per-step retries (Phase 3) are what make it robust. Don't put it on a single Vercel
  cron handler.
- **Lock-in vs ops (Part D fork).** Defer to Phase 1; the schema is identical either way.
- **RLS correctness.** Tenant isolation must be tested adversarially (a second user proving they
  can't read another's rows) before inviting anyone real — this is the one bug class that
  actually matters for multi-user.
- **Bun in production.** Build runs under Node on managed hosts; keep API routes on the Node
  runtime; avoid native deps (use pure-JS drivers / `bcryptjs`, not `bcrypt`).
- **Not yet decided (out of scope here):** billing (only if it ever goes paid/public), GDPR/data
  export & delete (the existing `config/export` is a start), and an admin surface for managing
  invites.

---

## Appendix — Sources

**Auth / hosting:** Auth.js→Better Auth merger
(better-auth.com/blog/authjs-joins-better-auth); Clerk pricing (clerk.com/pricing); WorkOS
AuthKit invite-only (workos.com/docs/authkit/invite-only-signup, workos.com/pricing); Supabase
admin invite (supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail); Vercel cron
limits + Bun runtime (vercel.com/docs/cron-jobs/usage-and-pricing,
vercel.com/blog/bun-runtime-on-vercel-functions); Railway cron/workers
(docs.railway.com/guides/cron-workers-queues); Fly pricing (fly.io/docs/about/pricing); Bun +
Next.js (bun.com/docs/guides/ecosystem/nextjs); Next.js 16 middleware deprecation
(nextjs.org/blog/next-16).

**DB / embeddings:** Supabase / Neon / Turso pricing + vector docs (supabase.com/pricing,
neon.com/pricing, turso.tech/pricing, supabase.com/docs/guides/ai/vector-columns);
`pgvector` (github.com/pgvector/pgvector); "you probably don't need a vector database"
(encore.dev/blog/you-probably-dont-need-a-vector-database); Neon HNSW guide
(neon.com/blog/understanding-vector-search-and-hnsw-index-with-pgvector); Matryoshka embeddings
(weaviate.io/blog/openais-matryoshka-embeddings-in-weaviate); Postgres RLS multi-tenant
(aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security).

**Jobs / cost:** Vercel function limits (vercel.com/docs/functions/limitations); Inngest
(inngest.com/pricing); Trigger.dev (trigger.dev/pricing); Upstash QStash (upstash.com/pricing/qstash);
Supabase Functions limits + cron (supabase.com/docs/guides/functions/limits,
supabase.com/docs/guides/cron); OpenAI pricing (developers.openai.com/api/docs/pricing,
pricepertoken.com).
