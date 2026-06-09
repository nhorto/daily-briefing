/**
 * "Why you're seeing this" (Phase 5) — pure, framework-free, unit-tested.
 *
 * The recommender blends several forces (semantic fit, learned topic/source
 * affinity, how big a story is today, freshness). This picks the single force
 * that most explains why an item ranked, so the UI can surface a short, honest
 * reason — transparency that builds trust and gives a fast tuning path.
 *
 * It mirrors the engine's emphasis (fit-led, then affinity, then importance) but
 * is deliberately a *heuristic label*, not a re-derivation of the exact score —
 * its only job is to name the dominant reason truthfully.
 *
 * See docs/research/recommendation-engine-and-ux.md → Part B (the quiet
 * "why you're seeing this" tag).
 */

import type { ArticleCategory, UserPreferences } from '../types';
import { CATEGORY_META } from '../types';

export type ReasonKind = 'fit' | 'topic' | 'source' | 'popular' | 'fresh';

export interface RankReason {
  kind: ReasonKind;
  /** Short, human label for the card. */
  label: string;
}

export interface ExplainInput {
  category: ArticleCategory;
  sourceName: string;
  /** How many distinct sources cover this story (1 for a single article). */
  sourceCount: number;
  /** Hours since the item's most-recent article. */
  ageHours: number;
  /** Max cosine of the item to the interest profile, if a profile exists. */
  fit?: number;
  preferences: UserPreferences;
}

const NEUTRAL = 50;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Name the dominant reason an item ranked. Each candidate force gets a strength
 * scaled to roughly match the engine's weighting; the strongest wins, with a
 * freshness fallback when nothing else stands out.
 */
export function explainRanking(input: ExplainInput): RankReason {
  const { category, sourceName, sourceCount, ageHours, fit, preferences } = input;

  const catWeight = preferences.interests[category] ?? NEUTRAL;
  const srcWeight = preferences.sources?.[sourceName] ?? NEUTRAL;

  // Strengths in a shared scale. Fit (cosine, negatives meaningless) leads, as in
  // the ranker; topic/source track how far above neutral the learned weight is;
  // popularity scales with how many sources cover the story; freshness is a weak
  // last resort so a brand-new-but-otherwise-unremarkable item still gets a tag.
  const fitStrength = fit !== undefined ? clamp01(fit) * 1.0 : 0;
  const topicStrength = clamp01((catWeight - NEUTRAL) / NEUTRAL) * 0.6;
  const sourceStrength = clamp01((srcWeight - NEUTRAL) / NEUTRAL) * 0.5;
  const popularStrength =
    sourceCount >= 2 ? clamp01(Math.log1p(sourceCount) / Math.log1p(6)) * 0.7 : 0;
  const freshStrength = ageHours <= 12 ? clamp01(1 - ageHours / 12) * 0.25 : 0;

  const candidates: Array<{ kind: ReasonKind; strength: number; label: string }> = [
    { kind: 'fit', strength: fitStrength, label: 'Similar to what you read' },
    {
      kind: 'topic',
      strength: topicStrength,
      label: `More ${CATEGORY_META[category].label}, a topic you follow`,
    },
    {
      kind: 'source',
      strength: sourceStrength,
      label: `From ${sourceName}, a source you favor`,
    },
    {
      kind: 'popular',
      strength: popularStrength,
      label: `Big story — covered by ${sourceCount} sources`,
    },
  ];

  let best = candidates[0]!;
  for (const c of candidates) if (c.strength > best.strength) best = c;

  // Nothing crossed a meaningful bar → fall back to a freshness/neutral tag.
  if (best.strength < 0.05) {
    return {
      kind: 'fresh',
      label: freshStrength > 0 ? 'Fresh in today’s briefing' : 'In today’s briefing',
    };
  }
  return { kind: best.kind, label: best.label };
}
