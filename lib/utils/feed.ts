/**
 * Feed assembly — shared by the "Today" landing and the full Briefing feed so
 * both rank with the same engine. A FeedItem is one row: a multi-source topic
 * cluster or a single article.
 */

import type { Article, Briefing, Cluster, UserPreferences } from '../types';
import { decayPreferences, getPersonalizationScore } from './personalization';
import { rankIndices, type RankSignal } from './ranking';
import { calculateTokenSimilarity } from './similarity';

/** A row in the feed: either a multi-source topic cluster or a single article. */
export type FeedItem = { kind: 'cluster'; cluster: Cluster } | { kind: 'article'; article: Article };

/** Stable React key for a feed item. */
export function feedItemKey(it: FeedItem): string {
  return it.kind === 'cluster' ? it.cluster.id : it.article.id;
}

/** The articles backing a feed item (all of a cluster, or the single article). */
export function feedItemArticles(it: FeedItem): Article[] {
  return it.kind === 'cluster' ? it.cluster.articles : [it.article];
}

/** The lead article for a feed item (a cluster's representative, or the article). */
export function feedItemLead(it: FeedItem): Article {
  return it.kind === 'cluster' ? it.cluster.representativeArticle : it.article;
}

/** A feed item's title, for topic-similarity (MMR) comparison. */
export function feedItemTitle(it: FeedItem): string {
  return it.kind === 'cluster' ? it.cluster.title : it.article.title;
}

/** The most-recent publish time across a feed item's articles (ms). */
export function feedItemTime(it: FeedItem): number {
  return Math.max(...feedItemArticles(it).map((a) => new Date(a.publishedAt).getTime()));
}

/**
 * Build the ranking signal for a feed item from its articles + preferences.
 * `fitById` maps article id → semantic fit (cosine to the profile); empty until
 * the profile exists, leaving fit undefined (cold start).
 */
export function feedItemSignal(
  it: FeedItem,
  prefs: UserPreferences,
  fitById: Record<string, number>
): RankSignal {
  const articles = feedItemArticles(it);
  const newest = Math.max(...articles.map((a) => new Date(a.publishedAt).getTime()));
  const fits = articles
    .map((a) => fitById[a.id])
    .filter((x): x is number => typeof x === 'number');
  return {
    clusterSize: articles.length,
    sourceQuality: Math.max(...articles.map((a) => a.sourceAuthority ?? 50)),
    ageHours: (Date.now() - newest) / 3_600_000,
    affinity: Math.max(...articles.map((a) => getPersonalizationScore(a, prefs))),
    fit: fits.length > 0 ? Math.max(...fits) : undefined,
  };
}

/** All feed items for a briefing (clusters first, then individual articles), unranked. */
export function buildFeedItems(briefing: Briefing): FeedItem[] {
  return [
    ...briefing.clusters.map((cluster): FeedItem => ({ kind: 'cluster', cluster })),
    ...briefing.individualArticles.map((article): FeedItem => ({ kind: 'article', article })),
  ];
}

/**
 * Rank feed items with the engine: importance (cluster size × source quality ×
 * freshness) blended with learned affinity and semantic fit, then MMR-diversified
 * with a small exploration budget. Title keyword overlap is the MMR similarity.
 */
export function rankFeedItems(
  items: FeedItem[],
  prefs: UserPreferences,
  fitById: Record<string, number>
): FeedItem[] {
  if (items.length === 0) return items;
  // Age the learned model toward its baselines before scoring (Phase 4) so a
  // stale interest burst doesn't keep dominating weeks later.
  const decayed = decayPreferences(prefs);
  const signals = items.map((it) => feedItemSignal(it, decayed, fitById));
  const similarity = (i: number, j: number) =>
    calculateTokenSimilarity(feedItemTitle(items[i]!), feedItemTitle(items[j]!));
  return rankIndices(signals, similarity).map((i) => items[i]!);
}
