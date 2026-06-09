import type { Article, ArticleCategory, FeedbackSignal, UserPreferences } from '../types';
import {
  DEFAULT_PREFERENCES,
  FEEDBACK_DELTAS,
  ONBOARDING_HALF_LIFE_DAYS,
  SCORE_WEIGHTS,
  SIGNAL_HALF_LIFE_DAYS,
} from '../types';

const clamp = (n: number) => Math.max(0, Math.min(100, n));

const MS_PER_DAY = 86_400_000;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether an article should be hidden based on the user's muted keywords.
 * Matches against the title + excerpt, case-insensitively. A single-word keyword
 * matches on word boundaries (so "ai" won't match "rain"); a multi-word phrase
 * matches as a substring. Empty/blank keywords are ignored.
 */
export function isMuted(
  article: Pick<Article, 'title' | 'excerpt'>,
  mutedKeywords: string[] | undefined
): boolean {
  if (!mutedKeywords || mutedKeywords.length === 0) return false;

  const text = `${article.title} ${article.excerpt}`.toLowerCase();

  return mutedKeywords.some((raw) => {
    const keyword = raw.trim().toLowerCase();
    if (!keyword) return false;
    if (keyword.includes(' ')) return text.includes(keyword);
    return new RegExp(`\\b${escapeRegExp(keyword)}\\b`).test(text);
  });
}

/**
 * Calculate a personalization score (0-100) for an article, blending the user's
 * category weight with the learned weight for the article's source.
 * Unknown categories use the 'other' weight; unseen sources default to 50.
 */
export function getPersonalizationScore(
  article: Article,
  preferences: UserPreferences
): number {
  const category = article.category || 'other';
  const categoryWeight = preferences.interests[category] ?? 50;
  const sourceWeight = preferences.sources?.[article.sourceName] ?? 50;
  return categoryWeight * SCORE_WEIGHTS.category + sourceWeight * SCORE_WEIGHTS.source;
}

/**
 * Nudge the article's category weight and source weight by an arbitrary delta
 * (clamped 0-100), returning new UserPreferences. Pure — does not mutate input.
 * Used by both explicit feedback (large deltas) and implicit engagement signals
 * (small fractional deltas, see signals.ts / Phase 4).
 */
export function applyAffinityNudge(
  preferences: UserPreferences,
  article: Pick<Article, 'category' | 'sourceName'>,
  delta: number
): UserPreferences {
  const category = article.category || 'other';
  const currentCategory = preferences.interests[category] ?? 50;
  const currentSource = preferences.sources?.[article.sourceName] ?? 50;

  return {
    ...preferences,
    interests: {
      ...preferences.interests,
      [category]: clamp(currentCategory + delta),
    },
    sources: {
      ...preferences.sources,
      [article.sourceName]: clamp(currentSource + delta),
    },
    updatedAt: preferences.updatedAt,
  };
}

/**
 * Apply an explicit training signal (👍/👎/hide) from one article to the
 * preference model. Thin wrapper over {@link applyAffinityNudge} with the
 * signal's fixed delta. Pure — does not mutate input.
 */
export function applyFeedback(
  preferences: UserPreferences,
  article: Pick<Article, 'category' | 'sourceName'>,
  signal: FeedbackSignal
): UserPreferences {
  return applyAffinityNudge(preferences, article, FEEDBACK_DELTAS[signal]);
}

/**
 * Age the learned preference model toward its baselines (Phase 4 time-decay).
 * Returns a new UserPreferences with weights relaxed by how long it's been since
 * the model was last touched (`updatedAt`):
 *  - Source weights relax toward neutral (50) with a ~30-day half-life.
 *  - Category interest relaxes toward its stated baseline (onboarding prior, or
 *    50 if none) with the same ~30-day half-life, while the baseline itself
 *    relaxes toward 50 far slower (~180-day half-life) — so the deliberate
 *    onboarding prior outlives transient behavioral drift.
 *
 * Decay is computed at scoring time and never persisted (storage keeps the raw,
 * un-decayed values). Any new feedback refreshes `updatedAt`, resetting the
 * clock — which is why a recent explicit signal dominates a stale stated prior.
 * Pure — does not mutate input.
 */
export function decayPreferences(
  preferences: UserPreferences,
  now: number = Date.now()
): UserPreferences {
  const updated = Date.parse(preferences.updatedAt);
  if (Number.isNaN(updated)) return preferences;
  const days = Math.max(0, (now - updated) / MS_PER_DAY);
  if (days === 0) return preferences;

  const signalFactor = 0.5 ** (days / SIGNAL_HALF_LIFE_DAYS);
  const baselineFactor = 0.5 ** (days / ONBOARDING_HALF_LIFE_DAYS);

  const decayedInterests = {} as Record<ArticleCategory, number>;
  for (const key of Object.keys(preferences.interests) as ArticleCategory[]) {
    const value = preferences.interests[key] ?? 50;
    const baseline = preferences.interestBaseline?.[key] ?? 50;
    const decayedBaseline = 50 + (baseline - 50) * baselineFactor;
    decayedInterests[key] = clamp(decayedBaseline + (value - baseline) * signalFactor);
  }

  const decayedSources: Record<string, number> = {};
  for (const [name, value] of Object.entries(preferences.sources ?? {})) {
    decayedSources[name] = clamp(50 + (value - 50) * signalFactor);
  }

  return { ...preferences, interests: decayedInterests, sources: decayedSources };
}

/**
 * Reset everything the engine *learned* while keeping what the user *stated*.
 * Returns new preferences with learned signal cleared: category interests fall
 * back to the onboarding baseline (or neutral 50s if none) and learned source
 * weights are wiped. The deliberate settings — muted keywords, the onboarding
 * baseline, and the onboardedAt flag — are preserved. Pure.
 *
 * The matching clears of the *semantic* profile and behavioral signals
 * (impressions, engagement, feedback) live in the storage layer; this only
 * handles the preference model.
 */
export function resetLearnedPreferences(
  preferences: UserPreferences,
  now: string = new Date().toISOString()
): UserPreferences {
  const baseline = preferences.interestBaseline ?? DEFAULT_PREFERENCES.interests;
  return {
    interests: { ...DEFAULT_PREFERENCES.interests, ...baseline },
    sources: {},
    mutedKeywords: preferences.mutedKeywords,
    ...(preferences.interestBaseline ? { interestBaseline: preferences.interestBaseline } : {}),
    ...(preferences.onboardedAt ? { onboardedAt: preferences.onboardedAt } : {}),
    updatedAt: now,
  };
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

    const tierA = Math.floor(scoreA / 10);
    const tierB = Math.floor(scoreB / 10);

    if (tierA !== tierB) return tierB - tierA;

    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

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
  if (lower.includes('programming') || lower.includes('language') || lower.includes('developer') || lower.includes('coding')) return 'programming';
  if (lower.includes('devops') || lower.includes('infrastructure') || lower.includes('cloud') || lower.includes('deploy')) return 'devops';
  if (lower.includes('design') || lower.includes('ux') || lower.includes('frontend')) return 'design';
  if (lower.includes('hardware') || lower.includes('device') || lower.includes('gadget') || lower.includes('chip') || lower.includes('phone')) return 'hardware';
  return 'other';
}
