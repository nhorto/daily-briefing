# Phase 6: Personalization Foundation — Detailed Implementation Plan

## Overview

Add per-article content categorization during aggregation, a user preferences system for weighting interest areas, and preference-aware ordering on the home dashboard and briefing feed.

**Key principle:** Preferences reorder content — they never hide it. Users always see everything; their interests just float higher.

---

## Part 1: Article Categorization

### 1.1 Define the Category Taxonomy

Use a fixed set of categories. Each article gets exactly one primary category assigned by AI.

```typescript
// lib/types.ts — add to file

export type ArticleCategory =
  | 'ai-ml'           // AI, machine learning, LLMs
  | 'business'        // Startups, funding, acquisitions, corporate
  | 'science'         // Research, papers, academic
  | 'security'        // Security, privacy, vulnerabilities
  | 'programming'     // Languages, frameworks, developer tools
  | 'devops'          // Infrastructure, cloud, deployment
  | 'design'          // UX, design systems, frontend
  | 'other';          // Everything else

export const CATEGORY_META: Record<ArticleCategory, { label: string; icon: string }> = {
  'ai-ml':        { label: 'AI & ML',            icon: '🤖' },
  'business':     { label: 'Business & Startups', icon: '🏢' },
  'science':      { label: 'Science & Research',  icon: '🔬' },
  'security':     { label: 'Security & Privacy',  icon: '🔒' },
  'programming':  { label: 'Programming',         icon: '💻' },
  'devops':       { label: 'DevOps & Infra',      icon: '☁️' },
  'design':       { label: 'Design & UX',         icon: '🎨' },
  'other':        { label: 'Other',               icon: '📄' },
};
```

### 1.2 Add `category` Field to the Article Type

```typescript
// lib/types.ts — update Article interface

export interface Article {
  // ... existing fields ...
  summary?: string;
  category?: ArticleCategory;  // <-- new field
}
```

This is an optional field so existing stored briefings don't break.

### 1.3 Create Categorization Function

**File:** `lib/services/categorizer.ts` (new file)

Use GPT-4o-mini (not GPT-4o) to categorize articles in bulk. This is cheap — one API call handles a batch of ~20 articles at once via JSON output.

```typescript
import OpenAI from 'openai';
import type { Article, ArticleCategory } from '../types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Categorize a batch of articles using GPT-4o-mini.
 * Sends titles + excerpts and gets back a JSON mapping of article ID → category.
 * Processes up to 30 articles per API call.
 */
export async function categorizeArticles(
  articles: Article[]
): Promise<Map<string, ArticleCategory>> {
  // Build compact input: just ID, title, first 100 chars of excerpt
  // Send as single prompt, get back JSON { "id": "category", ... }
  // Use GPT-4o-mini with response_format: { type: "json_object" }
  // Batch into groups of 30 if > 30 articles
}
```

**Prompt design:** The prompt should list the valid category slugs and ask the model to return `{ "article_id": "category_slug" }` for each article. Titles + short excerpts are sufficient — no need to send full content.

**Estimated cost:** ~$0.001 per batch of 30 articles (GPT-4o-mini is $0.15/1M input tokens). Negligible.

### 1.4 Integrate Categorization into the Cron Pipeline

**File:** `app/api/cron/aggregate/route.ts`

Add a new step between steps 6 (article summaries) and 7 (sorting). This runs after both cluster and individual article summaries are generated.

```
Current pipeline:
  1. Get sources
  2. Fetch articles
  3. Cluster articles
  4. Summarize clusters (GPT-4o)
  5. Summarize individual articles (GPT-4o)
  6. Sort
  7. Build briefing
  8. Store briefing
  9. Generate intelligence summary (GPT-4o)
  10. Update timestamps

New step (insert between 5 and 6):
  5.5. Categorize ALL articles (GPT-4o-mini)
       - Collect all articles: cluster articles + individual articles
       - Call categorizeArticles() in batches
       - Apply categories to each article object in-place
```

The categorization runs on ALL articles (both clustered and individual), so every article in the briefing has a category tag. This happens before the briefing object is built and stored, so categories are persisted.

### 1.5 Files to Create/Modify

| Action | File | Change |
|--------|------|--------|
| Modify | `lib/types.ts` | Add `ArticleCategory` type, `CATEGORY_META` constant, `category?` field to `Article` |
| Create | `lib/services/categorizer.ts` | Bulk categorization function using GPT-4o-mini |
| Modify | `app/api/cron/aggregate/route.ts` | Add categorization step after summaries, before sorting |

---

## Part 2: User Preferences Storage

### 2.1 Define the Preferences Type

```typescript
// lib/types.ts — add to file

export interface UserPreferences {
  interests: Record<ArticleCategory, number>;  // category → weight (0-100)
  updatedAt: string;                           // ISO timestamp
}

// Default preferences: everything at 50 (neutral)
export const DEFAULT_PREFERENCES: UserPreferences = {
  interests: {
    'ai-ml': 50,
    'business': 50,
    'science': 50,
    'security': 50,
    'programming': 50,
    'devops': 50,
    'design': 50,
    'other': 50,
  },
  updatedAt: new Date().toISOString(),
};
```

Weight scale:
- **0** = Not interested (articles sort to bottom, but are still shown)
- **50** = Neutral (default, no boost or penalty)
- **100** = Very interested (articles sort to top)

### 2.2 Add KV Storage Functions

**File:** `lib/kv.ts`

```typescript
// Add to KEYS constant:
PREFERENCES: 'user:preferences',

// Add functions:
export async function getPreferences(): Promise<UserPreferences> {
  // Returns stored preferences or DEFAULT_PREFERENCES if none exist
}

export async function storePreferences(prefs: UserPreferences): Promise<void> {
  // Store preferences (no TTL — persistent)
}
```

No TTL on preferences — they persist until the user changes them.

### 2.3 Create Preferences API Route

**File:** `app/api/preferences/route.ts` (new file)

```
GET  /api/preferences     → Returns current preferences (or defaults)
PUT  /api/preferences     → Updates preferences
     Body: { interests: { "ai-ml": 80, "security": 20, ... } }
     Validates all categories are present and weights are 0-100
```

### 2.4 Files to Create/Modify

| Action | File | Change |
|--------|------|--------|
| Modify | `lib/types.ts` | Add `UserPreferences`, `DEFAULT_PREFERENCES` |
| Modify | `lib/kv.ts` | Add `PREFERENCES` key, `getPreferences()`, `storePreferences()` |
| Create | `app/api/preferences/route.ts` | GET/PUT endpoint for preferences |

---

## Part 3: Settings Page UI

### 3.1 Create the Settings Page

**File:** `app/settings/page.tsx` (new file)

A simple page with a slider (range input) for each interest category. The layout:

```
┌──────────────────────────────────────────┐
│  Nav Bar                                  │
├──────────────────────────────────────────┤
│                                          │
│  Interest Preferences                    │
│  Adjust weights to personalize your      │
│  briefing order. Higher = more prominent │
│                                          │
│  🤖 AI & ML              [====●=====] 50 │
│  🏢 Business & Startups  [========●=] 80 │
│  🔬 Science & Research   [====●=====] 50 │
│  🔒 Security & Privacy   [==●=======] 20 │
│  💻 Programming          [=======●==] 70 │
│  ☁️ DevOps & Infra       [====●=====] 50 │
│  🎨 Design & UX          [====●=====] 50 │
│  📄 Other                [====●=====] 50 │
│                                          │
│  [Reset to Defaults]     [Save]          │
│                                          │
└──────────────────────────────────────────┘
```

**Behavior:**
- Page loads current preferences from `GET /api/preferences`
- Sliders are range inputs (0-100, step 5)
- Each slider shows the category icon, label, and current numeric value
- "Save" button PUTs to `/api/preferences` and shows a brief success indicator
- "Reset to Defaults" sets all sliders back to 50
- Changes are NOT auto-saved (explicit save button prevents accidental changes)

### 3.2 Add Settings Link to Navigation

**File:** `components/DashboardLayout.tsx`

Add a settings link to the nav bar. Rather than adding it to the main nav links (which would clutter it), add a gear icon button on the right side next to the date:

```typescript
const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/briefing', label: 'Briefing' },
  { href: '/sources', label: 'Sources' },
];

// In the nav bar, after the date div:
<Link href="/settings" className="..." title="Settings">
  <svg>⚙️ gear icon</svg>
</Link>
```

### 3.3 Files to Create/Modify

| Action | File | Change |
|--------|------|--------|
| Create | `app/settings/page.tsx` | Settings page with interest sliders |
| Modify | `components/DashboardLayout.tsx` | Add settings gear icon link to nav bar |

---

## Part 4: Preference-Aware Ordering

### 4.1 Create a Scoring/Sorting Utility

**File:** `lib/utils/personalization.ts` (new file)

```typescript
import type { Article, UserPreferences } from '../types';

/**
 * Calculate a personalization score for an article based on user preferences.
 * Score = preference weight for the article's category (0-100).
 * Articles without a category get the 'other' weight.
 */
export function getPersonalizationScore(
  article: Article,
  preferences: UserPreferences
): number {
  const category = article.category || 'other';
  return preferences.interests[category] ?? 50;
}

/**
 * Sort articles by personalization score (descending), then by time (descending)
 * within the same score tier.
 *
 * Uses 10-point tiers so articles with similar scores stay time-ordered.
 * E.g., scores 80-89 are one tier, 70-79 are another.
 */
export function sortByPreference(
  articles: Article[],
  preferences: UserPreferences
): Article[] {
  return [...articles].sort((a, b) => {
    const scoreA = getPersonalizationScore(a, preferences);
    const scoreB = getPersonalizationScore(b, preferences);

    // Tier by 10-point bands so similar preferences stay time-sorted
    const tierA = Math.floor(scoreA / 10);
    const tierB = Math.floor(scoreB / 10);

    if (tierA !== tierB) return tierB - tierA; // Higher tier first

    // Within same tier, sort by time (newest first)
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}
```

The 10-point tier approach prevents micro-differences in weights from scrambling the feed. If AI & ML is set to 75 and Programming is set to 70, they're in the same tier (7) and stay time-sorted relative to each other. But Security at 20 (tier 2) will clearly sort below them.

### 4.2 Apply to Home Dashboard

**File:** `app/page.tsx`

The home dashboard shows intelligence categories (from `DailyIntelligence`). With preferences, sort these categories by the user's interest weights instead of the AI-assigned priority.

```typescript
// Fetch preferences alongside briefing and intelligence:
const [briefingRes, intelligenceRes, prefsRes] = await Promise.all([
  fetch('/api/briefing'),
  fetch('/api/intelligence'),
  fetch('/api/preferences'),
]);

// When rendering intelligence categories, sort by preference:
const sortedCategories = intelligence.categories.sort((a, b) => {
  // Map intelligence category names to ArticleCategory slugs
  // Then compare preference weights
});
```

**Mapping intelligence categories to preference categories:**
The intelligence service generates category names like "Breaking News", "Research & Papers", etc. These need to be mapped to the `ArticleCategory` slugs. Add a mapping function:

```typescript
// lib/utils/personalization.ts

/**
 * Map an intelligence category name (free-text from AI) to the closest
 * ArticleCategory slug for preference lookup.
 */
export function mapIntelligenceCategoryToSlug(name: string): ArticleCategory {
  const lower = name.toLowerCase();
  if (lower.includes('ai') || lower.includes('machine learning') || lower.includes('llm')) return 'ai-ml';
  if (lower.includes('business') || lower.includes('startup') || lower.includes('funding') || lower.includes('industry')) return 'business';
  if (lower.includes('research') || lower.includes('science') || lower.includes('paper')) return 'science';
  if (lower.includes('security') || lower.includes('privacy') || lower.includes('vulnerability')) return 'security';
  if (lower.includes('programming') || lower.includes('language') || lower.includes('developer')) return 'programming';
  if (lower.includes('devops') || lower.includes('infrastructure') || lower.includes('cloud') || lower.includes('deploy')) return 'devops';
  if (lower.includes('design') || lower.includes('ux') || lower.includes('frontend')) return 'design';
  return 'other';
}
```

### 4.3 Apply to Briefing Feed

**File:** `app/briefing/page.tsx`

The briefing page currently sorts articles chronologically. With preferences, use the `sortByPreference` utility as a secondary sort option.

Add a sort toggle to the briefing header:

```
[Newest First] [For You]
```

- **Newest First** (default): Pure chronological sort (current behavior)
- **For You**: Uses `sortByPreference()` — articles sorted by interest tier, then by time within tiers

This is a client-side toggle — both use the same `filteredArticles` array, just sorted differently. The briefing page already fetches all articles; we just need to also fetch preferences and apply the sort.

```typescript
const [sortMode, setSortMode] = useState<'time' | 'personalized'>('time');

// In the useMemo for filteredArticles:
const sortedArticles = useMemo(() => {
  if (sortMode === 'personalized' && preferences) {
    return sortByPreference(filteredArticles, preferences);
  }
  return filteredArticles; // already time-sorted
}, [filteredArticles, sortMode, preferences]);
```

### 4.4 Optional: Category Filter on Briefing Page

In addition to the existing source filter sidebar, add category filter pills above the article feed (or below the stats row). These are quick-filter buttons that show/hide by category:

```
[All] [🤖 AI & ML (12)] [🏢 Business (8)] [🔬 Science (3)] ...
```

This reuses the same filtering pattern as source filtering — toggle categories in a Set, filter the articles. This is a nice complement to source filtering since you can cross-filter (e.g., "show me only AI articles from TechCrunch").

### 4.5 Files to Create/Modify

| Action | File | Change |
|--------|------|--------|
| Create | `lib/utils/personalization.ts` | Scoring, sorting, and category mapping utilities |
| Modify | `app/page.tsx` | Fetch preferences, sort intelligence categories by preference |
| Modify | `app/briefing/page.tsx` | Add sort toggle (Newest/For You), fetch preferences, optional category filter pills |

---

## Implementation Order

Steps should be done sequentially in this order since each builds on the previous:

```
Step 1: Types & categorization (Part 1)
  └─ Add ArticleCategory type
  └─ Create categorizer.ts
  └─ Integrate into cron pipeline
  └─ Verify: run aggregation, check articles have categories

Step 2: Preferences storage (Part 2)
  └─ Add UserPreferences type
  └─ Add KV functions
  └─ Create API route
  └─ Verify: GET/PUT preferences via curl

Step 3: Settings UI (Part 3)
  └─ Create settings page
  └─ Add nav link
  └─ Verify: can view and save preferences

Step 4: Preference-aware ordering (Part 4)
  └─ Create personalization utility
  └─ Apply to home dashboard
  └─ Apply to briefing feed
  └─ Add category filter pills (optional)
  └─ Verify: changing preferences changes article order
```

---

## API Cost Impact

- **Article categorization:** One GPT-4o-mini call per ~30 articles → ~$0.001 per aggregation run
- **No additional GPT-4o calls** — preferences are applied client-side using the category tags
- Total additional cost per daily run: effectively zero

## Data Migration

No migration needed. The `category` field on `Article` is optional (`category?: ArticleCategory`), so existing stored briefings will continue to work. Articles without categories will be treated as `'other'` for preference sorting. The next time the cron job runs, all new articles will get categories.

## Testing Checklist

- [ ] Cron aggregation completes with categorization step
- [ ] All articles in a new briefing have a `category` field
- [ ] GET /api/preferences returns defaults when no preferences are stored
- [ ] PUT /api/preferences stores and returns updated preferences
- [ ] Settings page loads, displays sliders, saves correctly
- [ ] Home dashboard intelligence cards reorder when preferences change
- [ ] Briefing "For You" sort mode reflects preference weights
- [ ] Articles with no category (from old briefings) sort as "other"
- [ ] Category filter pills on briefing page work alongside source filters
