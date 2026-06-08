/**
 * Aggregation pipeline
 * Shared by the cron route (scheduled, secret-protected) and the in-app
 * "Regenerate" server action. Fetches sources, clusters, summarizes,
 * categorizes, and stores the day's briefing + intelligence digest.
 *
 * The AI steps (summaries, categories, intelligence) are non-fatal: if OpenAI
 * is unavailable or rate-limited, a briefing is still produced from the fetched
 * articles (cards fall back to excerpts, articles simply lack categories).
 */

import type { Briefing } from '../types';
import {
  getActiveSources,
  getPreferences,
  getSeenUrls,
  markUrlsSeen,
  storeBriefing,
  storeIntelligence,
  updateSourceLastFetched,
} from '../kv';
import { enrichArticleImages, fetchFromMultipleSources } from './aggregator';
import { isMuted } from '../utils/personalization';
import { clusterArticles, sortClustersBySize, sortArticlesByTime } from './clustering';
import { summarizeClusters, generateArticleSummaries } from './summarizer';
import { categorizeArticles } from './categorizer';
import { generateDailyIntelligence } from './intelligence';
import { getTodayDateString, getBriefingTimeWindow } from '../utils/date';

export interface AggregationResult {
  success: true;
  briefingDate: string;
  statistics: {
    articlesProcessed: number;
    articlesClustered: number;
    clustersCreated: number;
    individualArticles: number;
    processingTimeMs: number;
  };
  errors?: Array<{ sourceId: string; sourceName: string; error: string }>;
  message?: string;
}

/** Thrown when there are no active sources to aggregate from. */
export class NoActiveSourcesError extends Error {
  constructor() {
    super('No active sources configured');
    this.name = 'NoActiveSourcesError';
  }
}

export async function runAggregation(): Promise<AggregationResult> {
  const startTime = Date.now();

  const sources = await getActiveSources();
  if (sources.length === 0) throw new NoActiveSourcesError();

  console.log(`[Aggregation] ${sources.length} active sources`);

  const today = getTodayDateString();
  const { start, end } = getBriefingTimeWindow(today);

  // Fetch from all sources in parallel
  const { articles: fetchedArticles, errors: fetchErrors } = await fetchFromMultipleSources(
    sources,
    start
  );

  // Scraped sources (blog/html) have unreliable publish dates, so the time
  // window can't tell new posts from the back-catalog. Instead, gate them by
  // "have we shown this URL before?" — only genuinely new posts get through.
  const seenTrackedSourceIds = new Set(
    sources.filter((s) => s.type === 'blog' || s.type === 'html').map((s) => s.id)
  );
  const seenUrls = seenTrackedSourceIds.size > 0 ? await getSeenUrls() : new Set<string>();
  const seenFiltered =
    seenTrackedSourceIds.size > 0
      ? fetchedArticles.filter(
          (a) => !seenTrackedSourceIds.has(a.sourceId) || !seenUrls.has(a.url)
        )
      : fetchedArticles;

  // Drop muted articles before any AI work — they never appear and never cost
  // summary/categorization tokens.
  const mutedKeywords = (await getPreferences()).mutedKeywords ?? [];
  const rawArticles =
    mutedKeywords.length > 0
      ? seenFiltered.filter((a) => !isMuted(a, mutedKeywords))
      : seenFiltered;
  if (mutedKeywords.length > 0) {
    console.log(
      `[Aggregation] Muted ${seenFiltered.length - rawArticles.length} of ${seenFiltered.length} articles via keywords`
    );
  }

  if (rawArticles.length === 0) {
    return {
      success: true,
      briefingDate: today,
      statistics: {
        articlesProcessed: 0,
        articlesClustered: 0,
        clustersCreated: 0,
        individualArticles: 0,
        processingTimeMs: Date.now() - startTime,
      },
      message: 'No new content to aggregate',
    };
  }

  // Fill in missing thumbnails (non-fatal): feeds like TechCrunch/OpenAI/Hacker
  // News carry no image, so we fetch each article's og:image best-effort.
  try {
    await enrichArticleImages(rawArticles);
  } catch (error) {
    console.error('[Aggregation] Image enrichment failed (continuing):', error);
  }

  // Cluster
  const { clusters: rawClusters, individualArticles } = clusterArticles(rawArticles);

  // Summaries (non-fatal)
  try {
    await summarizeClusters(rawClusters);
    const summaries = await generateArticleSummaries(individualArticles);
    individualArticles.forEach((a) => {
      a.summary = summaries.get(a.id);
    });
  } catch (error) {
    console.error('[Aggregation] Summarization failed (continuing):', error);
  }

  // Categorize (non-fatal)
  try {
    const all = [...rawClusters.flatMap((c) => c.articles), ...individualArticles];
    const categories = await categorizeArticles(all);
    for (const cluster of rawClusters) {
      for (const article of cluster.articles) article.category = categories.get(article.id);
    }
    for (const article of individualArticles) article.category = categories.get(article.id);
  } catch (error) {
    console.error('[Aggregation] Categorization failed (continuing):', error);
  }

  const clusters = sortClustersBySize(rawClusters);
  const sortedIndividual = sortArticlesByTime(individualArticles);
  const uniqueSources = new Set(rawArticles.map((a) => a.sourceId));

  const briefing: Briefing = {
    date: today,
    startTime: start,
    endTime: end,
    clusters,
    individualArticles: sortedIndividual,
    totalArticles: rawArticles.length,
    totalClusters: clusters.length,
    totalSources: uniqueSources.size,
    status: 'ready',
    generatedAt: new Date().toISOString(),
    processingTimeMs: Date.now() - startTime,
    errors: fetchErrors.length > 0 ? fetchErrors : undefined,
  };

  await storeBriefing(briefing);

  // Remember the URLs from scraped sources we just surfaced, so next run only
  // shows their genuinely new posts.
  if (seenTrackedSourceIds.size > 0) {
    const toMark = rawArticles
      .filter((a) => seenTrackedSourceIds.has(a.sourceId))
      .map((a) => a.url);
    await markUrlsSeen(toMark);
  }

  // Intelligence digest (non-fatal)
  try {
    const intelligence = await generateDailyIntelligence(clusters, sortedIndividual);
    await storeIntelligence(intelligence);
  } catch (error) {
    console.error('[Aggregation] Intelligence generation failed (continuing):', error);
  }

  const now = new Date().toISOString();
  await Promise.all(sources.map((s) => updateSourceLastFetched(s.id, now)));

  console.log(`[Aggregation] Done in ${briefing.processingTimeMs}ms`);

  return {
    success: true,
    briefingDate: today,
    statistics: {
      articlesProcessed: rawArticles.length,
      articlesClustered: rawClusters.reduce((sum, c) => sum + c.articles.length, 0),
      clustersCreated: clusters.length,
      individualArticles: sortedIndividual.length,
      processingTimeMs: briefing.processingTimeMs,
    },
    errors: fetchErrors.length > 0 ? fetchErrors : undefined,
  };
}
