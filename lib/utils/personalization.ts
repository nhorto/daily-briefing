import type { Article, ArticleCategory, UserPreferences } from '../types';

/**
 * Calculate a personalization score for an article based on user preferences.
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
