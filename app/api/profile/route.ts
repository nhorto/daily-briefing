/**
 * Profile API
 * GET /api/profile — returns the user's semantic interest readiness plus a
 * per-article "fit" score (cosine of each of today's articles to the profile
 * vector). The briefing feed blends these fit scores into its ranking.
 *
 * Embeddings stay server-side (the cache, keyed by article id); only the small
 * articleId → fit map crosses the wire, so the briefing payload stays lean.
 */

import { NextResponse } from 'next/server';
import { getProfileCentroids, getTodaysBriefing, getCachedEmbedding } from '@/lib/kv';
import { maxCosineSimilarity } from '@/lib/utils/vector';

export async function GET() {
  try {
    // Multi-centroid interest profile (Phase 5): one centroid until ~20 likes,
    // then k≈3–6. Fit is the max cosine to any centroid so niche tastes count.
    const centroids = await getProfileCentroids();
    if (!centroids) {
      // Cold start: no positive signals yet — feed falls back to importance + affinity.
      return NextResponse.json({ success: true, ready: false, fit: {} });
    }

    const briefing = await getTodaysBriefing();
    if (!briefing) {
      return NextResponse.json({ success: true, ready: true, fit: {} });
    }

    const articles = [
      ...briefing.clusters.flatMap((c) => c.articles),
      ...briefing.individualArticles,
    ];
    const embeddings = await Promise.all(articles.map((a) => getCachedEmbedding(a.id)));

    const fit: Record<string, number> = {};
    articles.forEach((a, i) => {
      const emb = embeddings[i];
      if (emb) fit[a.id] = maxCosineSimilarity(emb, centroids);
    });

    return NextResponse.json({ success: true, ready: true, fit, centroids: centroids.length });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
