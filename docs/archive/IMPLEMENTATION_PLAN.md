# Daily Briefing - Implementation Plan

## Vision

Transform the current basic RSS aggregator into a polished, dashboard-forward personal intelligence system with two core experiences:

1. **Home Dashboard (`/`)** - AI-synthesized "what matters today" with embedded chat
2. **Full Briefing (`/briefing`)** - Chronological, filterable article feed with per-article summaries and embedded chat
3. **Article Detail (`/article/[id]`)** - Deep-dive view with full summary, key points, and article-specific chat

---

## Current State Assessment

### What Exists
- **3 pages**: splash home (`/`), briefing dashboard (`/briefing`), source management (`/sources`)
- **4 API routes**: `/api/briefing` (GET), `/api/chat` (POST streaming), `/api/cron/aggregate` (POST/GET), `/api/sources` (CRUD)
- **3 services**: aggregator (RSS + HTML via Readability), clustering (Levenshtein similarity), summarizer (OpenAI GPT-4o)
- **Storage**: Vercel KV with in-memory fallback for local dev
- **Chat**: Modal slide-over using `@ai-sdk/react` useChat hook, streams via OpenAI
- **Styling**: Vanilla Tailwind with no design system, light/dark via prefers-color-scheme

### What's Wrong
- Home page is a useless splash screen with two buttons
- Briefing page is a flat vertical dump of clusters then articles
- No source filtering on briefing page
- No individual article pages
- Chat is a modal popup, not embedded
- HTML scraping only extracts a single "article" from a page (no link discovery on blog index pages)
- Time window is midnight-to-midnight, not 6am-previous-day as desired
- No read/unread tracking
- UI is generic default Tailwind with no design identity
- Chat API uses deprecated `OpenAIStream`/`StreamingTextResponse` from old `ai` SDK version

---

## Phase 1: Design System & Layout Shell

**Goal**: Establish the visual foundation and shared layout that all pages will use.

### 1.1 Color Palette & CSS Variables

Define a dark-first design system in `globals.css`:

```
Background layers:
  --bg-primary:    #0B0F1A    (deepest background)
  --bg-surface:    #111827    (card/panel surfaces)
  --bg-elevated:   #1F2937    (hover states, elevated cards)
  --bg-overlay:    #374151    (overlays, modals)

Text:
  --text-primary:  #F9FAFB    (headings, primary content)
  --text-secondary:#9CA3AF    (metadata, labels)
  --text-muted:    #6B7280    (disabled, hints)

Accent (electric blue/teal):
  --accent:        #06B6D4    (primary actions, links)
  --accent-hover:  #22D3EE    (hover states)
  --accent-muted:  #164E63    (subtle backgrounds)

Status:
  --status-breaking: #EF4444  (red - breaking news)
  --status-new:      #10B981  (green - new/fresh)
  --status-warning:  #F59E0B  (amber - alerts)

Source colors (auto-assigned per source):
  A rotating palette of 8 distinct colors for source dots/pills
```

### 1.2 Typography

- Font stack: `Inter, system-ui, -apple-system, sans-serif` (add Inter via next/font)
- Headings: Bold, tight letter-spacing
- Body: Regular weight, relaxed line-height
- Metadata: Small, secondary color
- Monospace for stats/numbers: `JetBrains Mono` or system monospace

### 1.3 Shared Layout Component

Create `components/DashboardLayout.tsx` - a shared layout used by all pages:

```
┌──────────────────────────────────────────────┐
│  Top Nav Bar                                  │
│  [Logo]  Home | Briefing | Sources  [date]   │
├──────────────────────────────────────────────┤
│                                              │
│  Page Content (children)                     │
│                                              │
└──────────────────────────────────────────────┘
```

- Persistent top navigation bar with page links
- Active page indicator (underline or highlight)
- Today's date displayed in nav
- Dark background by default

### 1.4 Core UI Components

Create reusable primitives in `components/ui/`:

| Component | Purpose |
|-----------|---------|
| `Card.tsx` | Base card with surface bg, border, hover elevation |
| `Badge.tsx` | Small pill badges for sources, status, categories |
| `SourcePill.tsx` | Source name + colored dot, clickable for filtering |
| `StatCard.tsx` | Number + label for dashboard stats |
| `Skeleton.tsx` | Loading skeleton animations (replace spinners) |
| `ChatPanel.tsx` | Rewritten embedded chat (not modal) |

### 1.5 Files to Create/Modify

| Action | File | Details |
|--------|------|---------|
| Modify | `app/globals.css` | Replace with new design system CSS variables, dark-first |
| Modify | `app/layout.tsx` | Add Inter font via next/font, apply dark class |
| Modify | `tailwind.config.ts` | Extend with custom colors referencing CSS vars |
| Create | `components/DashboardLayout.tsx` | Shared nav + layout wrapper |
| Create | `components/ui/Card.tsx` | Reusable card component |
| Create | `components/ui/Badge.tsx` | Status/source badges |
| Create | `components/ui/SourcePill.tsx` | Clickable source filter pills |
| Create | `components/ui/StatCard.tsx` | Dashboard stat display |
| Create | `components/ui/Skeleton.tsx` | Loading skeletons |

### 1.6 Definition of Done
- All pages render with the new dark theme
- Navigation works between all pages
- Loading states use skeletons instead of spinners
- No visual regressions on existing functionality

---

## Phase 2: Home Dashboard (AI Summary + Chat)

**Goal**: Transform `/` from a splash page into an AI-synthesized intelligence dashboard.

### 2.1 Dashboard Layout

```
┌──────────────────────────────────────────────────────┐
│  Nav Bar                                              │
├───────────────────────────────────┬──────────────────┤
│                                   │                  │
│  Intelligence Summary (65%)       │  Chat (35%)      │
│                                   │                  │
│  ┌─────────────────────────────┐ │  Embedded chat   │
│  │ Stats Row                   │ │  panel, always   │
│  │ [47 articles] [12 sources]  │ │  visible.        │
│  │ [5 clusters] [Generated 8am]│ │                  │
│  └─────────────────────────────┘ │  Context: all    │
│                                   │  today's content │
│  ┌─────────────────────────────┐ │                  │
│  │ Breaking / Top Stories      │ │                  │
│  │ AI-synthesized paragraph    │ │                  │
│  │ with key developments       │ │                  │
│  └─────────────────────────────┘ │                  │
│                                   │                  │
│  ┌──────────┐  ┌──────────────┐  │                  │
│  │ Research  │  │ Industry     │  │                  │
│  │ & Papers  │  │ Moves        │  │                  │
│  └──────────┘  └──────────────┘  │                  │
│                                   │                  │
│  ┌──────────┐  ┌──────────────┐  │                  │
│  │ Worth    │  │ Other        │  │                  │
│  │ Reading  │  │ Highlights   │  │                  │
│  └──────────┘  └──────────────┘  │                  │
│                                   │                  │
│  [View Full Briefing ->]          │                  │
├───────────────────────────────────┴──────────────────┤
└──────────────────────────────────────────────────────┘
```

### 2.2 AI Summary Generation

Add a new summarization step to the cron aggregation pipeline that generates a structured "daily intelligence" summary. This runs after clusters and article summaries are generated.

**New type** - `DailyIntelligence`:
```typescript
interface DailyIntelligence {
  topStories: string;        // 2-3 paragraph synthesis of the biggest stories
  categories: Array<{
    name: string;            // e.g., "Breaking", "Research & Papers", "Industry Moves", "Worth Reading"
    icon: string;            // emoji
    summary: string;         // 2-3 sentence category summary
    articleIds: string[];    // references to relevant articles
    priority: number;        // for ordering
  }>;
  generatedAt: string;
}
```

**How it works**: After the cron job generates clusters and article summaries, make one additional GPT-4o call that takes ALL clusters + individual articles and generates the structured intelligence summary. The prompt instructs the model to categorize content into buckets (Breaking, Research, Industry, Worth Reading, etc.) and write synthesis paragraphs for each.

### 2.3 Embedded Chat Component

Rewrite `ChatPanel.tsx` to support two modes:
1. **Embedded mode** (home + briefing pages): Rendered inline as a right-side panel, always visible
2. **Article mode** (article page): Rendered inline, pre-loaded with single article context

Props:
```typescript
interface ChatPanelProps {
  mode: 'global' | 'briefing' | 'article';
  articles: Article[];           // context articles
  articleId?: string;            // for article-specific mode
  className?: string;
}
```

Chat should maintain separate conversation state per mode/context so switching pages doesn't lose your chat history within a session.

### 2.4 Store Intelligence Summary

Add to KV storage:
- New key `intelligence:today` storing the `DailyIntelligence` object
- New API route `GET /api/intelligence` to fetch it
- Generated as part of the cron aggregation pipeline

### 2.5 Files to Create/Modify

| Action | File | Details |
|--------|------|---------|
| Rewrite | `app/page.tsx` | Dashboard layout with intelligence cards + embedded chat |
| Rewrite | `components/ChatPanel.tsx` | Embedded mode, multi-context support |
| Create | `lib/services/intelligence.ts` | AI intelligence summary generation |
| Modify | `lib/types.ts` | Add `DailyIntelligence` type |
| Modify | `lib/kv.ts` | Add intelligence storage/retrieval functions |
| Create | `app/api/intelligence/route.ts` | GET endpoint for intelligence summary |
| Modify | `app/api/cron/aggregate/route.ts` | Add intelligence generation step to pipeline |
| Create | `components/IntelligenceCard.tsx` | Category summary card for dashboard |
| Create | `components/StatsRow.tsx` | Stats bar component |

### 2.6 Definition of Done
- Home page shows AI-synthesized intelligence summary with categorized sections
- Stats row shows article count, source count, cluster count
- Embedded chat panel on the right side, functional with all articles as context
- "View Full Briefing" link navigates to `/briefing`
- Intelligence summary regenerates with each cron run

---

## Phase 3: Briefing Page Rebuild (Filterable Feed + Chat)

**Goal**: Transform `/briefing` into a filterable, chronological article feed with embedded chat.

### 3.1 Briefing Layout

```
┌──────────────────────────────────────────────────────┐
│  Nav Bar                                              │
├────────┬──────────────────────────┬──────────────────┤
│        │                          │                  │
│ Source │  Article Feed (50%)      │  Chat (35%)      │
│ Filter │                          │                  │
│ (15%)  │  ┌────────────────────┐ │  Embedded,       │
│        │  │ Article Card       │ │  context shifts  │
│ [All]  │  │ Title              │ │  to filtered     │
│ [TC]   │  │ Source . 2h ago    │ │  articles        │
│ [HN]   │  │ 2-line summary    │ │                  │
│ [Ars]  │  │ [Read ->]         │ │                  │
│ [...]  │  └────────────────────┘ │                  │
│        │                          │                  │
│ Active │  ┌────────────────────┐ │                  │
│ filter │  │ Article Card       │ │                  │
│ count: │  │ ...                │ │                  │
│ 23     │  └────────────────────┘ │                  │
│        │                          │                  │
└────────┴──────────────────────────┴──────────────────┘
```

### 3.2 Time Window Change

Currently the briefing window is midnight-to-midnight. Change to:
- **Start**: Previous day at 6:00 AM local time
- **End**: Current day at 6:00 AM local time

Modify `lib/utils/date.ts`:
- Update `getBriefingTimeWindow()` to use 6 AM cutoff instead of midnight
- The cron job should be scheduled for ~6:30 AM to give a buffer

### 3.3 Source Filter Sidebar

Left sidebar with:
- "All Sources" option (default, shows everything)
- List of all sources that have articles in today's briefing
- Each source shows: colored dot + name + article count
- Click to filter (toggle, supports multi-select)
- Active filter count displayed
- Sticky positioning so it stays visible while scrolling

### 3.4 Article Cards (Redesigned)

Each article in the feed shows:
- **Source indicator**: Colored dot + source name
- **Time**: Relative time ("2 hours ago")
- **Title**: Bold, clickable (links to `/article/[id]`)
- **Summary**: 1-2 line AI-generated summary
- **Read link**: External link to original article
- Freshness indicator (green dot for < 6h, yellow for < 18h)

### 3.5 Article Detail Page

Create `app/article/[id]/page.tsx`:

```
┌──────────────────────────────────────────────────────┐
│  Nav Bar  [<- Back to Briefing]                       │
├───────────────────────────────────┬──────────────────┤
│                                   │                  │
│  Article Detail (65%)             │  Chat (35%)      │
│                                   │                  │
│  Source Badge . Published time    │  "Ask about      │
│                                   │   this article"  │
│  # Article Title                  │                  │
│                                   │  Pre-seeded      │
│  AI Summary (expanded)            │  with this       │
│  - Key point 1                    │  article's       │
│  - Key point 2                    │  context only    │
│  - Key point 3                    │                  │
│                                   │                  │
│  [Read Original ->]               │                  │
│                                   │                  │
│  --- Related Articles ---         │                  │
│  Cards for same-cluster articles  │                  │
│                                   │                  │
└───────────────────────────────────┴──────────────────┘
```

This page needs:
- A way to look up individual articles by ID
- An expanded summary (more than the 1-sentence version on the feed)
- Key points extraction (new AI generation or expand existing summary prompt)
- Related articles (articles from the same cluster)

### 3.6 Article Storage

Currently articles are stored embedded inside the `Briefing` object. For individual article pages, we need articles to be addressable by ID.

Options:
- **Option A**: Parse the article ID from the briefing data (simplest, use what we have)
- **Option B**: Store articles separately in KV by ID

Go with **Option A** first - fetch the briefing, find the article by ID within it. Add a dedicated articles API route:

`GET /api/articles/[id]` - Finds article by ID in today's briefing and returns it along with related articles (same cluster).

### 3.7 Files to Create/Modify

| Action | File | Details |
|--------|------|---------|
| Rewrite | `app/briefing/page.tsx` | Three-column layout: sidebar + feed + chat |
| Rewrite | `components/ArticleCard.tsx` | New design with summary, source dot, freshness |
| Create | `components/SourceFilterSidebar.tsx` | Source filter sidebar component |
| Create | `app/article/[id]/page.tsx` | Individual article detail page |
| Create | `app/api/articles/[id]/route.ts` | Article lookup API |
| Modify | `lib/utils/date.ts` | Change briefing window to 6 AM cutoff |
| Modify | `app/api/cron/aggregate/route.ts` | Use new time window |
| Delete | `components/ClusterCard.tsx` | No longer needed (clusters are behind the scenes now) |

### 3.8 Definition of Done
- Briefing page shows all articles since 6 AM yesterday in chronological order
- Source filter sidebar works (multi-select, shows counts)
- Each article has AI-generated summary visible inline
- Clicking article title goes to `/article/[id]`
- Article detail page shows expanded summary, key points, related articles
- Embedded chat on both briefing and article pages
- Chat context updates based on source filter / current article

---

## Phase 4: Improved Source Handling

**Goal**: Better support for non-RSS sources (blogs without feeds).

### 4.1 Blog Index Page Scraping

Current problem: `fetchHTMLPage()` uses Readability on the page URL directly, which treats the whole page as one article. For blog index/listing pages, we need to:

1. Fetch the index page HTML
2. Extract all article links from the page
3. Fetch each article link individually with Readability
4. Return multiple articles

**Implementation**:

Create a new function `fetchBlogIndex()` in `aggregator.ts`:
```typescript
async function fetchBlogIndex(source: Source, sinceTimestamp?: string): Promise<Article[]> {
  // 1. Fetch index page
  // 2. Parse with JSDOM
  // 3. Extract article links using heuristics:
  //    - <a> tags within <article>, <main>, or common blog list containers
  //    - Links matching patterns like /blog/, /posts/, /articles/, /YYYY/MM/
  //    - Filter out nav links, footer links, etc.
  // 4. For each discovered link, fetch with Readability
  // 5. Extract title, excerpt, published date
  // 6. Filter by sinceTimestamp
  // 7. Return articles array
}
```

### 4.2 Source Type Extension

Add new source type: `'blog'` (in addition to `'rss'`, `'atom'`, `'html'`).

- `'rss'` / `'atom'` - Feed-based sources (current behavior)
- `'html'` - Single page extraction (current behavior)
- `'blog'` - Blog index page scraping (new)

Update `detectFeedType()` to detect blog-like pages.

### 4.3 Source Management UI Update

Update the sources page to:
- Show the new source type options
- Allow manual override of detected type
- Add a "Test Fetch" button that shows what articles would be fetched from a source

### 4.4 Files to Create/Modify

| Action | File | Details |
|--------|------|---------|
| Modify | `lib/services/aggregator.ts` | Add `fetchBlogIndex()`, update type handling |
| Modify | `lib/types.ts` | Add `'blog'` to `SourceType` |
| Modify | `app/sources/page.tsx` | Update UI for new source types |

### 4.5 Definition of Done
- Blog-type sources correctly discover and fetch multiple articles from an index page
- Source type auto-detection works for common blog patterns
- Existing RSS/HTML sources continue working unchanged
- Sources page shows the new type option

---

## Phase 5: Read Tracking

**Goal**: Track which articles the user has seen/clicked so the briefing highlights what's new.

### 5.1 Read State Storage

Store read article IDs in KV:
- Key: `read:articles` (Set of article IDs)
- No expiration (or 30-day TTL to auto-clean)

New KV functions:
```typescript
markArticleRead(articleId: string): Promise<void>
getReadArticleIds(): Promise<Set<string>>
isArticleRead(articleId: string): Promise<boolean>
```

### 5.2 API Endpoint

`POST /api/articles/read` - Mark an article as read
- Body: `{ articleId: string }`
- Called when user clicks "Read Original" or visits article detail page

`GET /api/articles/read` - Get all read article IDs
- Returns: `{ readIds: string[] }`

### 5.3 UI Integration

- **Briefing page**: Read articles get a muted/dimmed style, unread articles are prominent
- **Article card**: Show a small "new" dot/badge for unread articles
- **Stats**: Show "X new / Y total" in the stats bar
- **Optional**: "Mark all as read" button

### 5.4 Files to Create/Modify

| Action | File | Details |
|--------|------|---------|
| Modify | `lib/kv.ts` | Add read tracking functions |
| Create | `app/api/articles/read/route.ts` | Read tracking API |
| Modify | `components/ArticleCard.tsx` | Read/unread visual states |
| Modify | `app/briefing/page.tsx` | Fetch and pass read state |

### 5.5 Definition of Done
- Clicking an article marks it as read
- Read articles appear visually dimmed on the briefing page
- Unread articles have a "new" indicator
- Read state persists across page refreshes

---

## Phase 6: Personalization Foundation

**Goal**: Lay the groundwork for content personalization (to be expanded later).

### 6.1 Interest Categories

Define a set of interest categories that content can be tagged with:
- Technology / AI & ML
- Business / Startups
- Science / Research
- Security / Privacy
- Design / UX
- DevOps / Infrastructure
- Programming / Languages
- Other

### 6.2 User Preferences Storage

Store user preferences in KV:
```typescript
interface UserPreferences {
  interests: Array<{
    category: string;
    weight: number;    // 0-100, higher = more interested
  }>;
  updatedAt: string;
}
```

### 6.3 Simple Preference UI

Add a `/settings` page (or section within sources page):
- Slider or toggle for each interest category
- Weights affect ordering on the home dashboard (higher interest = shown first)
- Does NOT hide content, only reorders it

### 6.4 AI Categorization

During aggregation, add a lightweight categorization step:
- Use GPT-4o-mini (cheap/fast) to assign 1-2 categories to each article based on title + excerpt
- Store category as a new field on the `Article` type
- Categories feed into home dashboard bucketing and personalization ordering

### 6.5 Files to Create/Modify

| Action | File | Details |
|--------|------|---------|
| Modify | `lib/types.ts` | Add `UserPreferences`, add `categories` to `Article` |
| Modify | `lib/kv.ts` | Add preferences storage |
| Create | `app/settings/page.tsx` | Preferences UI |
| Create | `app/api/preferences/route.ts` | Preferences API |
| Modify | `lib/services/summarizer.ts` | Add categorization function |
| Modify | `app/api/cron/aggregate/route.ts` | Add categorization step |
| Modify | `app/page.tsx` | Use preferences to order dashboard sections |

### 6.6 Definition of Done
- Articles are auto-categorized during aggregation
- User can set interest weights in settings
- Home dashboard sections are ordered by user interest
- Briefing page can optionally filter by category

---

## Implementation Order & Dependencies

```
Phase 1: Design System ──────────────┐
                                      ├──> Phase 2: Home Dashboard
Phase 3: Briefing Rebuild ───────────┘         │
         (can start after Phase 1)              │
                                                v
Phase 4: Source Handling ──── (independent, can parallel with Phase 3)
                                                │
Phase 5: Read Tracking ─────────────────────────┘
         (needs Phase 3 article cards)          │
                                                v
Phase 6: Personalization ───────────────────────┘
         (needs Phase 2 dashboard + Phase 5 read data)
```

**Critical path**: Phase 1 -> Phase 2 + Phase 3 (parallel) -> Phase 5 -> Phase 6

Phase 4 (source handling) is independent and can be done alongside Phase 3.

---

## Technical Notes

### Chat API Migration
The current chat route uses deprecated `OpenAIStream` and `StreamingTextResponse` from the `ai` package. These need to be migrated to the current `ai` SDK v5 streaming API (`streamText` from `ai` package) as part of Phase 2 when we rewrite the chat component.

### Vercel KV Limitations
- Free tier: 30K requests/day, 256MB storage
- Articles are stored inside the Briefing object (nested), not individually addressable
- For article detail pages (Phase 3), we'll parse from the briefing object rather than adding individual article storage to avoid KV bloat

### OpenAI API Cost
Adding intelligence summary (Phase 2) and categorization (Phase 6) adds ~2 extra API calls per aggregation run. With GPT-4o for intelligence and GPT-4o-mini for categorization, this adds roughly $0.01-0.05 per run. Negligible for daily personal use.

### Mobile Responsiveness
The three-column layout (sidebar + content + chat) needs responsive breakpoints:
- **Desktop (>1280px)**: Full three-column layout
- **Tablet (768-1280px)**: Two columns (content + chat), sidebar becomes top filter bar
- **Mobile (<768px)**: Single column, chat accessible via floating button (falls back to slide-over)
