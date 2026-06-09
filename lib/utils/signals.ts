/**
 * Implicit-signal logic (Phase 4) — pure, framework-free, unit-tested.
 *
 * Dense behavioral signals (dwell, scroll, clicks, impressions) are noisy and
 * biased, so they must be *debiased* before they touch the model:
 *  - Dwell is length-normalized — a long article naturally earns more dwell, and
 *    clickbait earns high dwell-then-bounce. We compare active foreground time to
 *    the article's expected reading time and bucket the *ratio*, so "deep read"
 *    means deep relative to length, not just a big clock.
 *  - Clicks are position-biased; the capture layer logs the rank a click came
 *    from (see /api/signals) so genuinely-good items can later be credited for
 *    earning a click from low in the feed.
 *
 * See docs/research/recommendation-engine-and-ux.md → Part A2.
 */

import type { EngagementType } from '../types';
import { ENGAGEMENT_AFFINITY_DELTA, PROFILE_POSITIVE_ENGAGEMENTS } from '../types';

/** Average characters per word (including the trailing space) for read-time math. */
const CHARS_PER_WORD = 5.5;
/** Adult silent-reading speed (words per minute). */
const WORDS_PER_MINUTE = 238;
/** A read this far below expected time is a skim/bounce, not engagement. */
const SKIM_RATIO = 0.25;
/** At/above this fraction of expected read time, it's a genuine deep read. */
const DEEP_RATIO = 0.75;
/** Absolute floor: under this many active seconds is always a skim, however
 *  short the piece — guards tiny articles from classifying a glance as a read. */
const MIN_READ_SECONDS = 8;

/** How long we'd expect a careful reader to spend on `contentChars` of text. */
export function expectedReadSeconds(contentChars: number): number {
  const words = Math.max(0, contentChars) / CHARS_PER_WORD;
  return (words / WORDS_PER_MINUTE) * 60;
}

export type DwellQuality = 'skim' | 'read' | 'deep';

/**
 * Bucket active (tab-visible) dwell time against expected reading time for the
 * article's length. `contentChars` should be the length of the text actually on
 * the page (full extracted text when available, else summary+excerpt).
 */
export function dwellQuality(activeSeconds: number, contentChars: number): DwellQuality {
  if (activeSeconds < MIN_READ_SECONDS) return 'skim';
  const expected = expectedReadSeconds(contentChars);
  // No length signal (empty content): fall back to absolute time only.
  if (expected <= 0) return activeSeconds >= MIN_READ_SECONDS ? 'read' : 'skim';
  const ratio = activeSeconds / expected;
  if (ratio < SKIM_RATIO) return 'skim';
  if (ratio < DEEP_RATIO) return 'read';
  return 'deep';
}

/** Whether a dwell of this quality should count as a positive signal at all. */
export function dwellCounts(quality: DwellQuality): boolean {
  return quality !== 'skim';
}

/** Whether an implicit signal is strong enough to move the semantic profile vector. */
export function isProfilePositive(type: EngagementType): boolean {
  return PROFILE_POSITIVE_ENGAGEMENTS.includes(type);
}

/** The learned-affinity nudge (category + source, 0-100 scale) for a signal. */
export function engagementAffinityDelta(type: EngagementType): number {
  return ENGAGEMENT_AFFINITY_DELTA[type];
}
