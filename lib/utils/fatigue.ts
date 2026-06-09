/**
 * Topic-fatigue & impression discounting (Phase 5) — pure, framework-free,
 * unit-tested.
 *
 * Pure exploitation narrows a feed to a monoculture, and re-showing the same
 * unengaged item is the fastest way to feel stale. Two day-level guards, both
 * derived from impression counts at scoring time — neither poisons the long-term
 * learned weights:
 *
 *  - **Impression discounting** — click-through on a news item peaks around the
 *    3rd showing and is under half that by the 8th, so an item shown repeatedly
 *    without engagement is softly demoted (3→8 showings) and then dropped from
 *    the curated surface entirely (≥8) until the next briefing. Engaged items are
 *    exempt — you clearly don't mind seeing those again.
 *  - **Category fatigue** — if the day's items in one category pile up unengaged
 *    impressions, that category is gently damped for the rest of the day so it
 *    stops crowding out everything else.
 *
 * Like the editorial smell test, this only trims the curated "Today" surface;
 * Browse keeps the full firehose.
 *
 * See docs/research/recommendation-engine-and-ux.md → Part A6 (filter-bubble
 * guards) and the impression-discounting reference.
 */

import type { ArticleCategory } from '../types';

/** Showings below this carry no discount (CTR is still climbing). */
export const FATIGUE_IMPRESSION_START = 3;
/** At/above this many unengaged showings, stop re-showing on the curated surface. */
export const FATIGUE_IMPRESSION_FULL = 8;
/** The softest an item's score gets multiplied to over the 3→8 ramp. */
export const FATIGUE_IMPRESSION_FLOOR = 0.3;

/** Unengaged impressions in a category below this don't damp it. */
export const CATEGORY_SKIP_START = 4;
/** Skips at/above which a category hits its damping floor for the day. */
export const CATEGORY_SKIP_FULL = 10;
/** The most a fatigued category's items get damped (gentler than per-item). */
export const CATEGORY_FATIGUE_FLOOR = 0.6;

/** The signals fatigue is derived from (read once per request, then passed in). */
export interface FatigueInput {
  /** articleId → times shown in the feed. */
  impressions: Record<string, number>;
  /** articleIds the user has actually engaged with (any non-impression signal). */
  engaged: Set<string>;
}

/** A feed item reduced to what fatigue needs: its lead id + category. */
export interface FatigueItem {
  id: string;
  category: ArticleCategory;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Linear ramp from 1 (at `start`) down to `floor` (at `full`), flat outside. */
function ramp(value: number, start: number, full: number, floor: number): number {
  if (value <= start) return 1;
  if (value >= full) return floor;
  const t = (value - start) / (full - start);
  return 1 - t * (1 - floor);
}

/**
 * Per-item score multiplier (≤1) from how many times it's been shown unengaged.
 * Engaged items are never discounted. Ramps 1→floor across START→FULL showings.
 */
export function impressionDiscount(impressions: number, engaged: boolean): number {
  if (engaged) return 1;
  return ramp(Math.max(0, impressions), FATIGUE_IMPRESSION_START, FATIGUE_IMPRESSION_FULL, FATIGUE_IMPRESSION_FLOOR);
}

/**
 * Whether an item has been shown so many times unengaged it should drop off the
 * curated surface entirely ("stop re-showing"). Engaged items never exhaust.
 */
export function isImpressionExhausted(impressions: number, engaged: boolean): boolean {
  return !engaged && impressions >= FATIGUE_IMPRESSION_FULL;
}

/** Per-category score multiplier (≤1) from the day's unengaged impressions in it. */
export function categoryDiscount(skips: number): number {
  return ramp(Math.max(0, skips), CATEGORY_SKIP_START, CATEGORY_SKIP_FULL, CATEGORY_FATIGUE_FLOOR);
}

/**
 * Count unengaged impressions per category across the day's items. A "skip" is an
 * item that was shown (≥1 impression) but never engaged with.
 */
export function categorySkipCounts(
  items: FatigueItem[],
  input: FatigueInput
): Record<string, number> {
  const skips: Record<string, number> = {};
  for (const it of items) {
    const shown = input.impressions[it.id] ?? 0;
    if (shown > 0 && !input.engaged.has(it.id)) {
      skips[it.category] = (skips[it.category] ?? 0) + shown;
    }
  }
  return skips;
}

/**
 * Build a per-item fatigue multiplier (≤1) for a list of feed items, combining
 * impression discounting with category damping. Returns multipliers aligned to
 * `items`, ready to scale blended ranking scores. Pure.
 */
export function fatigueMultipliers(items: FatigueItem[], input: FatigueInput): number[] {
  const skips = categorySkipCounts(items, input);
  return items.map((it) => {
    const shown = input.impressions[it.id] ?? 0;
    const engaged = input.engaged.has(it.id);
    return clamp01(impressionDiscount(shown, engaged) * categoryDiscount(skips[it.category] ?? 0));
  });
}
