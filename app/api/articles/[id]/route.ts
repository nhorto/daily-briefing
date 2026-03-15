/**
 * Article API Route
 * GET /api/articles/[id]
 * Returns a single article by ID along with related articles from the same cluster
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTodaysBriefing } from '@/lib/kv';
import type { Article, Cluster } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const briefing = await getTodaysBriefing();

    if (!briefing) {
      return NextResponse.json(
        { success: false, error: 'No briefing available' },
        { status: 404 }
      );
    }

    // Search for article in clusters
    let foundArticle: Article | null = null;
    let relatedArticles: Article[] = [];

    for (const cluster of briefing.clusters) {
      const article = cluster.articles.find((a) => a.id === id);
      if (article) {
        foundArticle = article;
        relatedArticles = cluster.articles.filter((a) => a.id !== id);
        break;
      }
    }

    // Search in individual articles if not found in clusters
    if (!foundArticle) {
      foundArticle = briefing.individualArticles.find((a) => a.id === id) || null;
    }

    if (!foundArticle) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      article: foundArticle,
      relatedArticles,
    });
  } catch (error) {
    console.error('[API] Error fetching article:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
