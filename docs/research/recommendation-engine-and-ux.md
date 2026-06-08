# Recommendation Engine & UX — Research

> **Status:** Research / proposal (not yet built). Drafted 2026-06-08.
> **Purpose:** Decide how Daily Briefing should (1) surface the ~15–20 pieces of
> content per day the owner genuinely wants to read, and (2) organize and present
> that content. This is the reference we come back to when building. It lays out
> the options and recommends an approach for both halves.

---

## 0. The problem (in plain terms)

Daily Briefing today fetches ~80–100 articles/day, dedupes/clusters them, summarizes
with AI, and shows a feed. Personalization is a blunt 👍/👎/not-interested signal that
nudges an 8-category weight + a per-source weight (blended 60/40) to sort a "For You"
feed.

The goal it doesn't yet hit: **put the day's ~15–20 must-reads in front of the owner
so they don't have to sift.** On any given day the owner could scan everything and
pick ~15–20 things worth their time — the product should do that picking for them.
The current thumbs-up/down loop is too coarse to do it, and the home/briefing layout
"has the idea but isn't there yet."

So two research questions:

1. **The engine** — what algorithm / recommendation approach surfaces the right
   content for *one* person, the right way?
2. **The UX / information architecture** — what should the Home, Briefing, and Saved
   surfaces *be*, and how should content be organized and displayed? (Not colors or
   buttons — the owner is happy with the visual style. This is about structure.)

## 1. Decisions already locked (with the owner)

| Question | Decision | Consequence for this doc |
|---|---|---|
| Who is it for? | **Personal-first**, multi-user a *maybe* later | Core design is content-based (works for n=1). Collaborative filtering is a future appendix, not the core. |
| How should it learn? | **All three** signal types: implicit ("watch what I do") + explicit reactions + an upfront interest profile | The signal model uses behavior, reactions, *and* onboarding. |
| Cost / complexity appetite? | **Embeddings are fine** (cents/day for real semantic understanding) | Semantic embeddings are the default; not pure heuristics, not LLM-rank-everything. |
| What's the deliverable? | **This document** — lay out all options, then recommend | No building yet. This is the plan to react to. |

---

## 2. TL;DR — the recommendation

**Engine — rank on two forces, then diversify:**

1. **Importance** (is this a big deal today?) = `cluster size × source weight × time-decay`.
   This is the Techmeme/Hacker-News insight, and the app *already clusters*, so the
   strongest signal is nearly free: how many independent good sources covered a story.
2. **Personal fit** (do *I* care?) = cosine similarity of each story's **embedding** to a
   **profile vector** built from what the owner reads / saves / 👍s, minus what they
   skip / 👎. Embeddings via OpenAI `text-embedding-3-small` (already have the client),
   stored as a plain float array, brute-force cosine in TypeScript — **~$0.03/month, zero
   new native dependencies** (this matters; see the Windows-ARM64 caveat in §A4).
3. **Blend, then MMR-rerank** the top ~40 down to ~15–20 to kill near-duplicate topics,
   reserve ~10–15% of slots for **exploration** (high-quality but off-profile) so it
   never collapses into a bubble, and run a cheap **LLM-as-editor "smell test"** pass to
   drop clickbait/soft news.

Feed it three signal families — implicit (read/skip/dwell/save/open-original/chat),
explicit (👍/👎, more/less-like-this, mute), and an **onboarding interest profile** —
with explicit signals weighted heaviest, implicit debiased (length-normalized dwell,
position-aware clicks), and all signals **time-decayed** (~30-day half-life) so taste
can drift.

**UX — one finite, finishable "Today":**

- **Merge Home into Briefing.** Two "today" surfaces is the redundant Apple/Google
  pattern and the app doesn't have the volume to justify it. Make **one landing surface**.
- Lead with a short **AI synthesis** ("Today in ~5" — cross-story *themes*, the thing AI
  does better than a human at 90 articles), then a **numbered Top ~15–20** ranked list of
  story-clusters, ending in an explicit **"That's the brief — you're all caught up."**
  **Finite + synthesized beats infinite + ranked** for building a daily habit.
- Keep the **AI layer on top of visible, attributed sources** (never an all-prose page —
  see the hallucination guardrail in §B6).
- **Demote nav to 2 primary destinations** (Today, Saved); fold Sources into Settings.

The rest of this doc lays out the options behind each of those calls.

---

# Part A — The Recommendation Engine

## A1. The core insight: two forces, not one

Good news rankers separate **importance** (objectively, how much does this matter today?)
from **personal fit** (subjectively, do *I* care?). Techmeme and Apple News lead with
importance; Artifact and Google Discover lead with fit. The best result for a personal
briefing is a **blend** — and Daily Briefing is unusually well-positioned because it
**already clusters multi-source stories**, which is the cheapest, most robust importance
signal there is.

A critical lesson from Artifact (the Instagram founders' news app, shut down 2024): *"if
you let your algorithm focus on clicks, it serves clickbait."* Optimize for **value**, not
engagement. For a single-user app there's no growth/engagement pressure at all — which is
exactly why a personal briefing can succeed where a venture-backed consumer feed couldn't.

## A2. Signals — what to capture and how much to trust it

The owner agreed to all three families. Suggested model: explicit signals dominate (they're
deliberate but sparse); implicit signals are dense but noisy and must be debiased; the
onboarding profile is a decaying *prior*, not ground truth.

| Signal | Type | Suggested strength | Reliability caveat | Capture |
|---|---|---|---|---|
| 👍 / "more like this" | explicit | **+1.0** | Trust fully; should override conflicting implicit | button |
| 👎 / "less like this" | explicit | **−1.0** | Trust fully | button |
| Mute keyword/source/topic | explicit | **hard filter** | Absolute — bypasses scoring | settings (already exists) |
| Save / bookmark | implicit (high-intent) | **+0.7** | Save ≠ read, but strong intent | bookmark button (exists) |
| Share / chat about it | implicit (high-intent) | **+0.6 / +0.5** | Rare, very high value | track share / chat reference |
| Open original link | implicit | **+0.5** | Deliberate jump off-platform | outbound-link handler |
| Read-to-end / scroll ≥90% | implicit | **+0.4** | Good once length-normalized | IntersectionObserver sentinel |
| Dwell time (length-normalized) | implicit | **+0.1 → +0.3** | **Biased** — see pitfalls | visibility timer |
| Open / click from feed | implicit | **+0.15** | Noisy; clickbait + position bias | card-open handler |
| Skip / scrolled past (seen, not opened) | implicit (neg) | **−0.05 to −0.1** | Weak "seen but ignored" | impression logging |
| Shown N×, never engaged | implicit (neg) | **escalating −** | Impression discounting | per-item impression counter |
| Onboarding topics / sources / example articles | stated | seed only, **slow-decay** | A prior behavior corrects over weeks | onboarding screen |

**Debiasing the implicit signals (where naive systems fail):**

- **Dwell time is a trap if used raw** — a long article naturally gets more dwell, and
  clickbait gets high dwell-then-bounce. Fix: bucket by article length and reward
  *relative* dwell (top quartile *for that length*), require the tab to be visible (Page
  Visibility API), and pair with scroll depth (high dwell + low scroll = distraction, not
  interest).
- **Position bias** — top-of-feed items get clicked regardless of relevance. At minimum,
  **log the rank an item was clicked from**; optionally lightly shuffle the very top so a
  genuinely good item earns its click from any position.
- **Clickbait** — weight by *quality* signals (read-to-end, save) over raw clicks.

**Time-decay:** interests drift, fast in tech/AI. Age every behavioral signal with an
exponential **~30-day half-life**; keep onboarding "core interests" in a slower-decay
bucket. When explicit feedback conflicts with the stated profile, **explicit behavior
wins** (it's the more recent deliberate signal).

## A3. The scoring model

Combine three normalized terms per story-cluster, then diversify:

```
score(s) =  w_imp     · Importance(s)        // is this a big deal today?
          + w_fit     · PersonalFit(s)       // do I care? (embedding cosine to profile)
          + w_engage  · LearnedAffinity(s)   // category/source/keyword weights (today's model)
          − Penalty(s)                       // muted / impression-discounted / fatigued
```

- **Importance(s)** = normalized `f(clusterSize) × sourceWeight × timeDecay`. Use
  log-scaled cluster size (so one wire story syndicated 8× doesn't dominate — penalize
  manufactured consensus), and a Hacker-News-style decay `1 / (ageHours + 2)^G` with a
  *softened* gravity `G ≈ 1.0–1.4` (a once-daily briefing should still let yesterday's
  great piece appear; HN's default G≈1.8 buries 24h-old items).
- **PersonalFit(s)** = cosine(storyEmbedding, profileVector) — see §A4.
- **LearnedAffinity(s)** = today's category + source + keyword weights, decayed (§A2). Keep
  this — it's a great cold-start prior and a cheap secondary signal.
- **Normalize** each term (min-max or z-score across the day's batch) *before* summing, or
  one term silently dominates. Starting weights to tune by eye: `w_imp ≈ 0.35`,
  `w_fit ≈ 0.45`, `w_engage ≈ 0.20`.

Then **select** the final list:

1. Take the top ~40 by score.
2. **MMR rerank** (maximal marginal relevance, λ≈0.7) down to ~15–20 so the list spreads
   across topics instead of stacking five articles on the same launch. (MMR works on
   embeddings; it's complementary to the existing same-story dedup — dedup removes the
   *same* story, MMR spreads *topics*.)
3. Reserve **~2–3 exploration slots** (ε-greedy ≈ 10–15%) for high-quality items *outside*
   the profile clusters — permanent filter-bubble insurance.
4. **LLM-as-editor pass:** a cheap prompt over the shortlist that applies a "smell test" —
   drop clickbait/soft news/near-dupes, enforce source diversity. This is the documented
   edge human editors (Apple News) had over trending algorithms, and the app already has
   an LLM in the loop.

## A4. The semantic layer — embeddings (how it's actually built)

This is what lets the engine understand *what an article is about* rather than just which
category/source it came from. Recommended implementation, tuned to this exact stack:

- **Model:** OpenAI **`text-embedding-3-small`** at **`dimensions: 512`** (Matryoshka-
  trained, so the shortened vector keeps its meaning). The OpenAI client + AI SDK v5 are
  already wired in → **zero new dependencies**.
- **What to embed:** the **cluster** (title + AI summary, a few hundred tokens), once, in
  the existing aggregation pipeline (`lib/services/aggregator.ts`), right after
  clustering/summarization. Batch the whole day into 1–2 array calls (the endpoint takes
  `input: string[]`) to dodge rate limits.
- **Storage:** stash the float array on the record in `lib/kv.ts` as plain JSON
  (`embedding: number[]`). **No vector DB, no SQLite extension.** At hundreds-to-few-
  thousand vectors, brute-force cosine in TypeScript is sub-millisecond — an index is
  premature optimization until ~100k+ vectors. Add `embedding?: number[]` to the type in
  `lib/types.ts`.
- **No re-embedding:** key by a content hash; skip anything already embedded. Steady-state
  cost is only *new* articles. (Re-embed everything only if the model or `dimensions`
  changes — treat dims as part of the cache key.)
- **Profile vector:** `normalize(mean(liked/read/saved) − λ·mean(disliked/skipped))`,
  λ≈0.3–0.5. Persist it in KV; recompute incrementally (an O(N) mean) when feedback
  changes. Cold start (empty profile) → fall back to importance + learned-affinity ordering.

**Cost:** ~100 items/day × ~400 tokens ≈ 1.2M tokens/month × $0.02/1M = **≈ $0.03/month.**
Negligible. (`-3-large` would be ~$0.16/month for a marginal quality bump — not worth 2×
storage; stay on `-3-small`.)

> ⚠️ **Why the OpenAI-API path, not a local model or a vector DB:** the two "fancier"
> options — Transformers.js (`onnxruntime-node`) and `sqlite-vec`/`sqlite-vss` — both pull
> **native binaries**, and `onnxruntime-node` has **no prebuilt Windows ARM64 binary**.
> That's the same class of breakage already recorded in project memory (emulated-x64 Bun
> breaking `bun:sqlite` / `lightningcss` in `next build`). The OpenAI API + JSON-array +
> JS-cosine path is pure `fetch` and sidesteps all of it.

## A5. Algorithm options, laid out

| Technique | What it does | Fit | Notes |
|---|---|---|---|
| **Single-centroid profile** (mean of liked) | one vector, one cosine/item | **v1 (good)** | Simplest; blurs distinct interests but fine to start |
| **Multi-cluster profile** (k-means, k≈3–6, score by *max* similarity) | captures multiple interests | **v1.5 (good)** | A niche interest won't get averaged away; recompute nightly; needs ~20–30 liked items first |
| **kNN to liked exemplars** | similarity to nearest liked items | OK | Adapts instantly to a new like; cost grows with history |
| **Importance = cluster size × source × decay** | "how much does this matter today" | **core (good)** | Nearly free — app already clusters; the Techmeme/HN lesson |
| **MMR rerank** | diversifies the final list | **core (good)** | ~10 lines; removes topic redundancy |
| **ε-greedy exploration** | reserves slots for off-profile items | **core (good)** | Dead-simple bubble insurance |
| **Impression discounting** | stop re-showing unengaged items | **good** | Click-through peaks ~3rd showing, <50% by 8th — then stop |
| **LLM-as-editor smell test** | drop clickbait/soft/dupes | **good** | Cheap; you have the LLM already |
| **Contextual bandits (LinUCB/Thompson)** | principled online explore/exploit | overkill | Needs volume to converge; ε-greedy is enough for n=1 |
| **Collaborative filtering / matrix factorization** | "people like you also liked…" | future / multi-user | Needs a crowd + dense overlapping histories; useless at n=1 |

## A6. Keeping it out of the filter bubble

Pure exploitation narrows any feed to a monoculture over weeks (this, plus feature sprawl,
is part of what sank Artifact's perceived quality). Four cheap, permanent guards:

- **Exploration budget** — ~2–3 of the daily slots always go to off-profile, high-quality
  items (ε-greedy).
- **MMR diversity** — the final list spreads across topics, not five takes on one story.
- **Topic fatigue / impression discounting** — damp a category for the day if the owner
  has skipped its last few items; stop re-showing an unengaged article after ~8 impressions.
  (Treat fatigue at the *day* level — don't poison the long-term category weight.)
- **Interest decay** — the ~30-day half-life keeps a months-old interest burst from
  permanently skewing the feed.

## A7. Recommended engine approach — phased

- **v1 (ship first, cheap):** Add embeddings to the pipeline + a single-centroid profile
  vector. New score = `importance (cluster size × source × softened decay)` blended with
  `cosine fit` and the existing `learned affinity`, normalized. MMR rerank to the top ~20 +
  2 exploration slots. This alone is a large jump over today's category/source blend.
- **v1.5:** Add richer signal capture — length-normalized dwell, scroll-depth/read-to-end,
  open-original, impression logging — and the time-decay on all signals. Add the LLM smell-
  test pass. Add an onboarding interest screen to seed cold-start.
- **v2:** Multi-cluster profile (k-means), topic-fatigue damping, "why you're seeing this"
  transparency surfaced in the UI, and a feedback-tuning affordance per card.
- **Future:** collaborative filtering *iff* the app goes meaningfully multi-user (§E).

---

# Part B — Information Architecture & UX

## B1. The core insight: finite + synthesized > infinite + ranked

Across every product studied, the daily entry points that build a **return habit** do one
thing: they **end.** Economist *Espresso* = 5 stories then the literal words "That's it";
FT Edit = 8 stories with read-times; NYT *The Morning* = one lead that connects the day;
Readwise *Shortlist* = a small committed "read today" set separate from the firehose.
Finishability turns reading into a *completable ritual* — "peace of mind that they've
completed their news for the day." Infinite scroll deliberately *removes* the stopping cue
(Instagram even deleted "You're all caught up" to chase engagement). The owner asked for
"the ~15–20 things I'd genuinely read" — **that is an Espresso/Shortlist-shaped brief, not
an Artifact-shaped feed.**

## B2. Current surfaces and the friction

Today: **Home**, **Briefing** (the real feed — cards + clusters, search, category pills,
source sidebar, sort), **Saved**, **Sources**, **Settings**.

- **Home + Briefing are two "today" surfaces** with an unclear division of labor — the
  redundant Apple/Google pattern, but without their content volume or two distinct
  audiences to justify it.
- **Saved is a legitimately distinct surface** (the Readwise "Feed vs Library" split: the
  auto-pushed firehose vs the things you deliberately kept). Keep it.
- **Sources and Settings are *configuration*, not daily destinations** — they shouldn't sit
  in primary nav competing with content.

## B3. Home / "Today" concept options

| Concept | Sketch | Pros | Cons |
|---|---|---|---|
| **A. Synthesis-on-top + ranked must-reads** (recommended) | Dated header ("92 scanned · ~12 min") → 3–5-bullet AI **theme** synthesis ("Today in 5") → numbered **Top 15–20** cluster cards → "you're caught up" | Gives the gestalt before the list; themes are what AI does best at scale; finite | Synthesis is the hallucination-risk surface (mitigated, §B6) |
| **B. Numbered must-read list** (Espresso/Techmeme) | No hero, no digest — clean numbered 1→20 of clusters, each headline + "why it matters" + source count + read-time | Max scannability/density; lowest AI-trust risk | No cross-story big picture; less AI-native feel |
| **C. Hero + sectioned briefing** (Apple News) | Big hero cluster (image + 2-sentence summary), then themed sections (Models, Funding, Tools, Policy), 3–5 each | Editorial feel; themes aid orientation | Sections feel padded on light days; lower density above the fold |
| **D. Narrative digest** (Axios/all-prose) | One scrollable Smart-Brevity doc, a tight paragraph per cluster, inline links — no cards | Fastest *reading*; coherent voice | Hard to scan/skip/triage; loses the "pick what I'll read" affordance; most exposed to hallucination |

## B4. Recommended Today design — **A, with B's discipline**

It directly serves "put the 15–20 things I'd read in front of me," and adds the one thing
AI does better than a human across ~90 articles: **spotting cross-story themes.** Keep it
strictly finite, borrow Axios "Smart Brevity" anchors for scannability, and keep per-item
summaries *on the card* so the top synthesis stays a short 5 bullets (navigation — "here's
the shape of today" — not a replacement for sources; every theme bullet links to its
cluster).

**Card anatomy** (list-style for density, not heavy magazine tiles):

- **Headline** — AI-cleaned/de-clickbaited (Artifact's signature move), one line, the anchor.
- **One-line "why it matters"** — written *for the card*, max 2 lines, never a mid-sentence
  auto-truncation. The full AI summary lives on click.
- **Source attribution + count** — "Reuters + 6 others" signals corroboration (Techmeme's
  authority cue) and builds trust.
- **Read-time estimate** — supports finishability.
- **Small right-aligned thumbnail** — present but subordinate; reserve the large 16:9 image
  for the #1/hero item only.
- **Quiet "why you're seeing this" tag** — the topic/weight that surfaced it, tappable to
  tune (Google Discover / Artifact both expose this for trust + control).
- **Read-state dimming** — so the finite list visibly shrinks as it's worked through,
  reinforcing the "caught up" payoff.

Aim for **6–8 scannable items above the fold**, numbered, with the digest bullets at the
very top. Group the *lower* portion by theme only on heavy days; on light days a flat
ranked list reads better than half-empty sections.

## B5. Recommended information architecture

| Surface | Action | Reasoning |
|---|---|---|
| **Today** (was Home + Briefing) | **Merge → one finite landing** | Kills the two-"today"-surfaces redundancy. Becomes: AI synthesis → ranked Top 15–20 clusters → "all caught up." Search / category pills / sort / source filter live here as a lightweight top bar, shown on demand. |
| **Saved** | **Keep** as a flat library | The legitimate Feed-vs-Library split. Resist Inbox→Later→Archive triage and tags until volume actually hurts; a personal bookmark list rarely needs it. |
| **Sources** | **Fold into Settings** | Configuration, not a daily destination. |
| **Settings** | **Keep** (now incl. Sources, mute list, learned weights, onboarding) | Tuck behind the gear/avatar menu. |

**Result:** two primary, always-visible destinations (**Today**, **Saved**) — comfortably
inside the "3–5 destinations" nav rule — plus one config area, and one finishable daily
surface with clusters as the organizing unit.

## B6. The AI guardrail (don't skip this)

A BBC study found **45% of AI news answers had a significant issue** (20% major accuracy
problems), and Apple Intelligence had to retract false, source-attributed summaries over
defamation risk. Therefore: **keep AI as a layer over visible, attributed sources** —
Particle's model, where partner links sit prominently *under* the summary. Concretely:
the "Today in 5" synthesis and every card summary must link to their source cluster;
never ship an all-prose home (Concept D) where AI *is* the only surface. Use the LLM as an
*editor and synthesizer over sources*, not as the source of record.

---

# Part C — How real products do it (reference)

The distilled case studies behind the recommendations above.

| Product | Approach | Lesson for us |
|---|---|---|
| **Artifact** (shut 2024) | Transformer embeddings, dwell/read-time/shares signals, ε-greedy exploration (~10–20%), AI-rewrote clickbait headlines, quality-source whitelist | Optimize for **value not clicks**; explore to avoid bubbles; but a standalone *consumer* feed had no market — a *personal* tool has none of that pressure |
| **Techmeme** | Importance = inbound-link count × recency × source diversity; anti-gaming (discounts bursty/few-source links); human-in-loop | **Cluster size = importance.** Penalize manufactured consensus (one story syndicated many times) |
| **Apple News "Today"** | ~30 editors pick ~5 leads over an algorithmic feed; "smell test"; more source diversity than the trending algo | An **LLM can play the editorial judgment layer** over an algorithmic shortlist |
| **Particle.news** | Cluster → GPT-4o headline/sub/bullets/quotes; sources prominent *under* the summary; "just the facts" + chat | The **closest architectural twin.** Summarize the *cluster*; keep sources visible; chat over the day |
| **Readwise Reader** | **Feed** (auto-pushed, Unseen/Seen) vs **Library** (Inbox→Later→**Shortlist**→Archive) | Separate the **firehose** from the **"read today" set** — validates Today-vs-Saved |
| **Feedly + Leo** | Prioritize matched topics, dedupe, mute "noise," one-tap "less like this," RL from saves | A **dedupe + mute + more/less** loop is high-ROI, low-complexity — mostly already present |
| **Economist Espresso / FT Edit / NYT Morning** | 5–8 finite stories/day, read-times, ends explicitly | **Finishability** drives the daily-return habit |
| **Refind** | Exactly 10 links/day; relevance + *timelessness*; more/less feedback | A near-fixed daily **quota forces selectivity** and sets expectations |
| **Hacker News / Reddit** | `score=(P−1)/(T+2)^G` gravity; Reddit log-scales votes + additive time | **Time-decay** is the cheapest freshness mechanism; tune gravity to control how fast yesterday dies |
| **Axios "Smart Brevity"** | "What's new / Why it matters" first, bold anchors, bullets, opt-in "go deeper," ~40% shorter | **Presentation is part of selection** — front-load why-it-matters, make depth opt-in |

---

# Part D — Proposed build roadmap

Each phase is independently shippable and maps to the existing codebase. (Build only after
the owner reacts to this doc — nothing here is started.)

- **Phase 1 — Importance ranking (no AI cost).** Replace the category/source sort with
  `importance = log(clusterSize) × sourceWeight × softened-decay`, blended with the
  existing learned affinity. Add MMR rerank + 2 exploration slots. Touches
  `lib/services/clustering.ts`, `lib/utils/personalization.ts`, `app/briefing/page.tsx`.
- **Phase 2 — Embeddings + personal fit.** Add `embedding?: number[]` to `lib/types.ts`;
  embed clusters in `lib/services/aggregator.ts`; store via `lib/kv.ts`; build the profile
  vector; add cosine fit to the blend. (~$0.03/mo, zero native deps.)
- **Phase 3 — The "Today" surface.** Merge Home into Briefing as a finite, numbered
  Top-15–20 with an AI "Today in 5" synthesis on top and an "all caught up" end marker.
  New card anatomy. Touches `app/` (home/briefing), `components/` cards,
  `components/DashboardLayout.tsx` (nav → Today + Saved; fold Sources into Settings).
- **Phase 4 — Richer signals + smell test.** Length-normalized dwell, scroll-depth/read-to-
  end, open-original, impression logging; time-decay on all signals; the LLM-as-editor
  pass; an onboarding interest screen for cold-start.
- **Phase 5 — Polish the loop.** Multi-cluster profile, topic-fatigue damping, "why you're
  seeing this" + per-card tuning, transparency.

---

# Part E — Future / multi-user notes

The owner said "me now, others later," so the design stays content-based (works at n=1) but
shouldn't paint multi-user into a corner:

- **Storage namespacing is the only real change.** Embeddings are **user-independent** —
  store one `embedding` per cluster and share it. Only the **profile vector** and the
  **liked/disliked/feedback sets** are per-user. Namespace those keys (`user:{id}:profile`)
  — which maps cleanly to Redis/Vercel-KV key prefixes if it moves to cloud.
- **Collaborative filtering becomes worth it** only with a crowd *and* dense overlapping
  read histories — it surfaces "people like you also liked…" items that content-based
  filtering can't. Even then it suffers item cold-start (brand-new articles have no
  ratings). The practical path is a **hybrid**: CF as a *re-ranker* over content-based
  candidates, added late.

---

# Appendix — Sources

**Recommendation algorithms & ranking**
- How Hacker News ranking works — https://medium.com/hacking-and-gonzo/how-hacker-news-ranking-algorithm-works-1d9b0cf2c08d
- How HN ranking really works (penalties, gravity) — http://www.righto.com/2013/11/how-hacker-news-ranking-really-works.html
- How Reddit ranking works (log votes + time) — https://medium.com/hacking-and-gonzo/how-reddit-ranking-algorithms-work-ef111e33d0d9
- Content-based filtering explained (profile = centroid of liked) — https://www.shaped.ai/blog/content-based-filtering-explained-recommending-based-on-what-you-like
- Recommenders with OpenAI embeddings — https://medium.com/@chenycy/build-recommendation-systems-openais-embeddings-matrix-factorization-and-deep-learning-0cac62008f0c
- Clustering user-interest embeddings (multi-interest) — https://arxiv.org/pdf/2401.09693
- Maximal Marginal Relevance (diversity rerank) — https://aayushmnit.com/posts/2025-12-25-DiversityMMRPart1/DiversityMMRPart1.html
- Multi-armed bandits for RecSys (ε-greedy) — https://aman.ai/recsys/multi-armed-bandit/
- Collaborative vs content-based (why CF needs scale) — https://arxiv.org/pdf/1912.08932
- News recommender review (time-decay/freshness) — https://arxiv.org/pdf/2009.04964
- Cold-start problem & onboarding — https://www.freecodecamp.org/news/cold-start-problem-in-recommender-systems/

**Signals, debiasing & feedback**
- Reweighting clicks with dwell time — https://arxiv.org/pdf/2209.09000
- Robust dwell-time injection for news rec — https://arxiv.org/pdf/2405.12486
- RecSys bias fixes (position bias, dwell bucketing, clickbait) — https://aman.ai/recsys/bias/
- News impression discounting (peak 3rd, <50% by 8th) — https://www.froomle.ai/resource/news-impression-discounting-stop-showing-the-same-article-over-and-over-again
- Half-life decay for recommenders — https://ceur-ws.org/Vol-2038/paper1.pdf
- Implicit vs explicit feedback — https://milvus.io/ai-quick-reference/how-does-implicit-feedback-differ-from-explicit-feedback-in-recommendations
- Combining explicit + implicit beats either alone — https://arxiv.org/abs/1810.12770
- Bursting the filter bubble with serendipity — https://arxiv.org/html/2502.13539v1

**Product case studies**
- The tech behind Artifact — https://techcrunch.com/2023/03/07/the-tech-behind-artifact-the-newly-launched-news-aggregator-from-instagrams-co-founders/
- Why Artifact failed — https://newsletter.failory.com/p/why-artifact-failed
- Artifact rewrites clickbait with AI — https://gizmodo.com/artifact-clickbait-news-ai-1850499448
- Techmeme (algorithm + human editors) — https://en.wikipedia.org/wiki/Techmeme · https://contently.com/2012/11/29/the-art-and-science-of-how-techmeme-curates-news/
- Editors vs algorithms in Apple News (source diversity) — https://medium.com/macoclock/what-we-learned-about-editors-vs-algorithms-from-4-000-stories-in-apple-news-771a429df9f7
- Inside the Apple News curation team — https://appleinsider.com/articles/18/10/25/rare-peek-into-apple-news-reveals-large-curation-team-fighting-against-algorithms
- Feedly AI + mute filters (Leo) — https://feedly.com/new-features/posts/feedly-ai-and-mute-filters
- Readwise Reader Library vs Feed — https://docs.readwise.io/reader/docs/faqs/adding-new-content · https://blog.readwise.io/readwise-reading-app/
- Refind (10 links/day) — https://medium.com/@refind/you-deserve-a-smarter-reading-list-we-are-building-it-17182dc8c239
- Particle launches AI news app — https://techcrunch.com/2024/11/12/particle-launches-an-ai-news-app-to-help-publishers-instead-of-just-stealing-their-work/
- Pocket revamp / Pocket Hits — https://techcrunch.com/2023/01/24/mozilla-revamps-its-read-it-later-app-pocket-with-new-tabs-and-curated-recommendations/

**Information architecture & UX**
- Finishable news (Guardian Daily) — https://www.niemanlab.org/2019/10/finishable-news-worked-for-the-guardian-on-ipad-for-8-years-will-it-draw-new-subscribers-on-phones/
- Psychology of infinite scroll — https://medium.com/@marketing_96787/the-psychology-of-scrolling-how-infinite-feeds-are-rewiring-consumer-behavior-6252d6383892
- Pagination vs infinite scroll (control) — https://blog.logrocket.com/ux-design/pagination-vs-infinite-scroll-ux/
- NN/g — mobile navigation patterns (3–5 destinations) — https://www.nngroup.com/articles/mobile-navigation-patterns/
- NN/g — IA vs navigation — https://www.nngroup.com/articles/ia-vs-navigation/
- Google News redesign (For You / clustering) — https://www.blog.google/topics/journalism-news/redesigning-google-news-everyone/
- Instapaper vs Pocket (tags vs folders) — https://zapier.com/blog/instapaper-vs-pocket/

**Home / "Today" surface & AI guardrail**
- 5 drivers of finite formats — https://www.twipemobile.com/5-key-drivers-of-successful-finite-formats/
- NYT "The Morning" success — https://www.campaignmonitor.com/blog/email-marketing/what-makes-nyts-the-morning-newsletter-so-successful/
- Economist Espresso teardown — https://www.storybench.org/economists-espresso-app-goes-beyond-headlines-provide-daily-shot-news-analysis/
- Axios Smart Brevity — https://www.axioshq.com/smart-brevity
- Google Discover ranking/cards — https://searchengineland.com/google-discover-qualifies-ranks-filters-content-research-470190
- AI summaries turn news to nonsense — BBC study — https://news.slashdot.org/story/25/02/12/2139233/ai-summaries-turn-real-news-into-nonsense-bbc-finds
- Apple AI false summaries — https://www.cnbc.com/2025/01/08/apple-ai-fake-news-alerts-highlight-the-techs-misinformation-problem.html
- UI card design best practices — https://uxdesign.cc/8-best-practices-for-ui-card-design-898f45bb60cc

**Embeddings implementation**
- OpenAI embeddings guide (dims param, MTEB) — https://developers.openai.com/api/docs/guides/embeddings
- OpenAI embeddings pricing — https://costgoat.com/pricing/openai-embeddings
- sqlite-vec in Node/Deno/Bun (native loadable) — https://alexgarcia.xyz/sqlite-vec/js.html
- onnxruntime-node (no prebuilt Win ARM64) — https://www.npmjs.com/package/onnxruntime-node
- bun:sqlite reference — https://bun.com/reference/bun/sqlite
