/**
 * Article Full-Text API
 * GET /api/articles/[id]/content
 * Fetches and extracts the full readable text of an article (Readability),
 * cached by URL. Powers the article chat's ability to read the whole piece.
 *
 * Runs on the Node runtime (not edge): Readability + jsdom need Node APIs.
 */

import { type NextRequest, NextResponse } from 'next/server';
import {
  getTodaysBriefing,
  getCachedArticleContent,
  setCachedArticleContent,
} from '@/lib/kv';
import { fetchArticleFullText } from '@/lib/services/aggregator';
import type { Article } from '@/lib/types';

export const maxDuration = 30;

export async function GET(
  _request: NextRequest,
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

    let found: Article | null = null;
    for (const cluster of briefing.clusters) {
      const match = cluster.articles.find((a) => a.id === id);
      if (match) {
        found = match;
        break;
      }
    }
    if (!found) {
      found = briefing.individualArticles.find((a) => a.id === id) || null;
    }
    if (!found) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }

    // Serve cached full text if we already extracted it.
    const cached = await getCachedArticleContent(found.url);
    if (cached) {
      return NextResponse.json({ success: true, content: cached, cached: true });
    }

    const content = await fetchArticleFullText(found.url);
    if (!content) {
      // Not an error — some pages (paywalls, JS-only) yield no extractable text.
      return NextResponse.json({
        success: true,
        content: null,
        message: 'Could not extract full text for this article',
      });
    }

    await setCachedArticleContent(found.url, content);
    return NextResponse.json({ success: true, content, cached: false });
  } catch (error) {
    console.error('[API] Error fetching article content:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
