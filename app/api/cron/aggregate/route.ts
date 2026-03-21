/**
 * Daily Content Aggregation Cron Job
 * Triggered by Vercel Cron at 8:00 AM daily
 * Fetches content, clusters, summarizes, and stores briefing
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import type { Briefing } from '@/lib/types';
import { getActiveSources, storeBriefing, storeIntelligence, updateSourceLastFetched } from '@/lib/kv';
import { fetchFromMultipleSources } from '@/lib/services/aggregator';
import {
  clusterArticles,
  sortClustersBySize,
  sortArticlesByTime,
} from '@/lib/services/clustering';
import { summarizeClusters, generateArticleSummaries } from '@/lib/services/summarizer';
import { categorizeArticles } from '@/lib/services/categorizer';
import { generateDailyIntelligence } from '@/lib/services/intelligence';
import { getTodayDateString, getBriefingTimeWindow } from '@/lib/utils/date';

export const maxDuration = 300; // 5 minutes max execution time

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cron] Starting daily content aggregation...');

  try {
    // 1. Get active sources
    const sources = await getActiveSources();
    if (sources.length === 0) {
      return NextResponse.json(
        { error: 'No active sources configured' },
        { status: 400 }
      );
    }

    console.log(`[Cron] Found ${sources.length} active sources`);

    // 2. Determine time window for fetching (last 24 hours)
    const today = getTodayDateString();
    const { start, end } = getBriefingTimeWindow(today);

    // 3. Fetch articles from all sources (parallel)
    const { articles: rawArticles, errors: fetchErrors } = await fetchFromMultipleSources(
      sources,
      start
    );

    if (rawArticles.length === 0) {
      console.log('[Cron] No new articles found');
      return NextResponse.json({
        success: true,
        message: 'No new content to aggregate',
        statistics: {
          articlesProcessed: 0,
          articlesClustered: 0,
          clustersCreated: 0,
          individualArticles: 0,
          processingTimeMs: Date.now() - startTime,
        },
      });
    }

    console.log(`[Cron] Fetched ${rawArticles.length} articles`);

    // 4. Cluster similar articles
    const { clusters: rawClusters, individualArticles } = clusterArticles(rawArticles);

    console.log(
      `[Cron] Created ${rawClusters.length} clusters, ${individualArticles.length} individual articles`
    );

    // 5. Generate AI summaries for clusters
    await summarizeClusters(rawClusters);

    // 6. Generate AI summaries for individual articles
    const articleSummaries = await generateArticleSummaries(individualArticles);

    // Apply summaries to articles
    individualArticles.forEach((article) => {
      article.summary = articleSummaries.get(article.id);
    });

    // 7. Categorize ALL articles (GPT-4o-mini — cheap)
    try {
      console.log('[Cron] Categorizing articles...');
      const allArticlesForCategorization = [
        ...rawClusters.flatMap((c) => c.articles),
        ...individualArticles,
      ];
      const categories = await categorizeArticles(allArticlesForCategorization);

      // Apply categories to all articles in-place
      for (const cluster of rawClusters) {
        for (const article of cluster.articles) {
          article.category = categories.get(article.id);
        }
      }
      for (const article of individualArticles) {
        article.category = categories.get(article.id);
      }
      console.log(`[Cron] Categorized ${categories.size} articles`);
    } catch (error) {
      console.error('[Cron] Failed to categorize articles:', error);
      // Non-fatal: articles will just lack categories
    }

    // 8. Sort clusters and articles
    const clusters = sortClustersBySize(rawClusters);
    const sortedIndividualArticles = sortArticlesByTime(individualArticles);

    // 8. Build briefing object
    const uniqueSources = new Set(rawArticles.map((a) => a.sourceId));

    const briefing: Briefing = {
      date: today,
      startTime: start,
      endTime: end,
      clusters,
      individualArticles: sortedIndividualArticles,
      totalArticles: rawArticles.length,
      totalClusters: clusters.length,
      totalSources: uniqueSources.size,
      status: 'ready',
      generatedAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
      errors: fetchErrors.length > 0 ? fetchErrors : undefined,
    };

    // 9. Store briefing in KV
    await storeBriefing(briefing);

    // 10. Generate AI intelligence summary
    try {
      console.log('[Cron] Generating daily intelligence summary...');
      const intelligence = await generateDailyIntelligence(clusters, sortedIndividualArticles);
      await storeIntelligence(intelligence);
      console.log('[Cron] Intelligence summary generated and stored');
    } catch (error) {
      console.error('[Cron] Failed to generate intelligence summary:', error);
      // Non-fatal: briefing still works without intelligence
    }

    // 11. Update last fetched timestamps for sources
    const now = new Date().toISOString();
    await Promise.all(
      sources.map((source) => updateSourceLastFetched(source.id, now))
    );

    console.log(`[Cron] Briefing generated successfully in ${briefing.processingTimeMs}ms`);

    // 11. Return success response
    return NextResponse.json({
      success: true,
      briefingDate: today,
      statistics: {
        articlesProcessed: rawArticles.length,
        articlesClustered: rawClusters.reduce((sum, c) => sum + c.articles.length, 0),
        clustersCreated: clusters.length,
        individualArticles: sortedIndividualArticles.length,
        processingTimeMs: briefing.processingTimeMs,
      },
      errors: fetchErrors.length > 0 ? fetchErrors : undefined,
    });
  } catch (error) {
    console.error('[Cron] Error during aggregation:', error);

    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
        processingTimeMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

// Allow manual triggering via GET (for testing)
export async function GET(request: NextRequest) {
  console.log('[Cron] Manual trigger via GET request');
  return POST(request);
}
