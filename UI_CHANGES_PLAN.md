# UI Changes Plan

## Change 1: Longer, More In-Depth Intelligence Summary

**Problem:** The "Today's Intelligence" text on the home page is too short and surface-level. It needs to be longer and provide more depth to capture what's actually happening in the world.

**What to change:**

**File:** `lib/services/intelligence.ts`

Update the prompt for `generateDailyIntelligence()`. Currently the `topStories` instruction says:

> "A 2-3 paragraph synthesis of the most important developments today."

Change this to request a longer, more analytical summary:

- Request 4-6 paragraphs instead of 2-3
- Ask the model to explain *why* each development matters, not just what happened
- Ask it to draw connections between stories where relevant
- Ask for context on how developments fit into broader trends
- Increase `max_tokens` from 2000 to 3500 to accommodate the longer output

**Example prompt change:**
```
"topStories": "A 4-6 paragraph in-depth analysis of today's most important developments.
For each major story, explain what happened, why it matters, and how it connects to broader
trends. Provide enough context that a reader gets a real understanding of the day's events,
not just headlines. Write in a direct, analytical tone."
```

---

## Change 2: Clickable Category Cards with On-Demand Summaries

**Problem:** The category cards (Breaking News, Industry Moves, etc.) show a brief summary but you can't drill into them. Want to click a category and get a detailed AI-generated summary — but only generate it on click, not pre-computed, to save tokens/time/money.

**What to change:**

### 2.1 Create a category detail API endpoint

**File:** `app/api/intelligence/category/route.ts` (new file)

```
POST /api/intelligence/category
Body: { categoryName: string, articleIds: string[] }
```

This endpoint:
1. Takes the category name and its article IDs
2. Fetches today's briefing from KV
3. Finds the matching articles by ID
4. Calls GPT-4o to generate a detailed 3-5 paragraph summary of just that category's articles
5. Returns the summary as streaming text (or a JSON response)

This is only called when the user clicks — no pre-computation.

### 2.2 Update IntelligenceCard to be clickable and expandable

**File:** `components/IntelligenceCard.tsx`

- Make the card clickable (add cursor-pointer, hover state)
- On click, expand the card to show a loading state, then the detailed summary below the existing brief summary
- Store the fetched summary in component state so clicking again doesn't re-fetch
- Add a collapse/expand toggle so the user can close it after reading
- Pass `articleIds` as a prop (already available from `DailyIntelligence.categories[].articleIds`)

### 2.3 Update home page to pass articleIds to IntelligenceCard

**File:** `app/page.tsx`

Currently renders:
```tsx
<IntelligenceCard
  name={category.name}
  icon={category.icon}
  summary={category.summary}
  articleCount={category.articleIds.length}
/>
```

Add `articleIds` prop:
```tsx
<IntelligenceCard
  name={category.name}
  icon={category.icon}
  summary={category.summary}
  articleCount={category.articleIds.length}
  articleIds={category.articleIds}
/>
```

### Files to create/modify

| Action | File | Change |
|--------|------|--------|
| Create | `app/api/intelligence/category/route.ts` | On-demand category summary endpoint |
| Modify | `components/IntelligenceCard.tsx` | Make clickable, expand to show detailed summary on click |
| Modify | `app/page.tsx` | Pass `articleIds` to IntelligenceCard |

---

## Change 3: Home Page Layout — Chat Below Content, Centered

**Problem:** The home page currently has a side-by-side layout (65% content / 35% chat). The chat should be below the intelligence content instead, and everything should be centered on the page.

**What to change:**

**File:** `app/page.tsx`

Replace the current `flex-row` layout:
```
┌─────────────────────────┬──────────────┐
│  Intelligence (65%)      │  Chat (35%)  │
└─────────────────────────┴──────────────┘
```

With a single-column centered layout:
```
┌──────────────────────────────────────────┐
│            Intelligence Summary           │
│            Category Cards                 │
│            View Full Briefing →           │
│                                          │
│            ┌──────────────────┐          │
│            │   Chat Panel     │          │
│            └──────────────────┘          │
└──────────────────────────────────────────┘
```

Specific changes:
- Remove the `flex-row` wrapper and the 65%/35% split
- Use a single centered column: `max-w-4xl mx-auto`
- Move the ChatPanel below the "View Full Briefing" link
- Give the ChatPanel a fixed height (e.g., `h-[500px]`) so it doesn't take over the page
- Remove the sticky positioning on the chat

---

## Change 4: Center the Briefing Page

**Problem:** The briefing page content is slightly off-center visually.

**What to change:**

**File:** `app/briefing/page.tsx`

The current 3-column layout (sidebar + feed + chat) fills the full width. The issue is likely that the sidebar (w-48) and chat panel (w-[380px]) are different widths, making the center feed appear off-center.

Fix:
- Make the sidebar and chat panel the same width, OR
- Add a `max-w-7xl mx-auto` wrapper around the 3-column flex container to ensure it's centered in the viewport
- Check that the `DashboardLayout` `max-w-7xl mx-auto` on `<main>` is working correctly with the `h-[calc(100vh-3.5rem)]` flex layout — the `max-w-7xl` may be getting overridden by the full-height flex

**File:** `components/DashboardLayout.tsx`

The `<main>` tag has `max-w-7xl mx-auto` which should center things. But the briefing page's `h-[calc(100vh-3.5rem)]` flex container might be stretching beyond this. Verify and fix.

---

## Change 5: Move Stats Row to Sources Page

**Problem:** The stats bar (49 Articles, 4 Sources, 0 Clusters, 7:50 PM Generated) is on the home page but feels out of place there. It's more of a system/operational detail.

**What to change:**

### 5.1 Remove StatsRow from home page

**File:** `app/page.tsx`

Remove the `<StatsRow>` component and its import from the home page entirely.

### 5.2 Add StatsRow to sources page

**File:** `app/sources/page.tsx`

Add the StatsRow at the top of the sources page, above the sources list. This makes sense because the sources page is the "management" view — seeing article counts, source counts, and last generation time is relevant there.

To do this, the sources page needs to fetch briefing data (just for the stats). Add a lightweight fetch of `/api/briefing` to get the stats, or create a simpler stats-only API endpoint.

### 5.3 Also remove from briefing page (optional)

**File:** `app/briefing/page.tsx`

The stats row is also on the briefing page. Consider whether to keep it there (it arguably makes sense on the briefing page since you're looking at articles). If keeping it, that's fine — just remove from home.

### Files to modify

| Action | File | Change |
|--------|------|--------|
| Modify | `app/page.tsx` | Remove StatsRow component |
| Modify | `app/sources/page.tsx` | Add StatsRow with briefing data |

---

## Change 6: Categories Are Already Dynamic (No Change Needed)

**Confirmed:** The categories on the home page are **dynamically determined by the AI** based on the actual news content each day. The intelligence service (`lib/services/intelligence.ts`) prompts GPT-4o with a suggested list of categories (Breaking News, Research & Papers, Industry Moves, Worth Reading, Tools & Releases, Other Highlights) but instructs the model to "only use categories that have content." So if there's no research content one day, that category won't appear, and if there's a lot of security news, a security category will be created.

No changes needed here.

---

## Implementation Order

These changes are mostly independent and can be done in any order, but a sensible sequence:

```
1. Change 3: Home page layout (chat below, centered)
   — Foundation layout change, do first

2. Change 5: Move stats row to sources page
   — Quick, cleans up the home page

3. Change 4: Center the briefing page
   — Quick layout fix

4. Change 1: Longer intelligence summary
   — Prompt change, simple

5. Change 2: Clickable category cards
   — Most complex change, new API endpoint + component update
```

Changes 1-4 are small. Change 2 is the most involved but still straightforward — one new API route and one component update.
