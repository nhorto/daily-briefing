import type { Article, ArticleCategory, FeedbackSignal, UserPreferences } from '../types';
import { FEEDBACK_DELTAS, SCORE_WEIGHTS } from '../types';

const clamp = (n: number) => Math.max(0, Math.min(100, n));

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
 * Apply a training signal from one article to the preference model, returning a
 * new UserPreferences. The article's category weight and source weight are both
 * nudged by the signal's delta (clamped to 0-100). Pure — does not mutate input.
 */
export function applyFeedback(
  preferences: UserPreferences,
  article: Pick<Article, 'category' | 'sourceName'>,
  signal: FeedbackSignal
): UserPreferences {
  const delta = FEEDBACK_DELTAS[signal];
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
  return 'other';
}
