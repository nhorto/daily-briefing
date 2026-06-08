import { type NextRequest, NextResponse } from 'next/server';
import {
  getArticleFeedback,
  setArticleFeedback,
  getPreferences,
  storePreferences,
  getCachedEmbedding,
  updateProfile,
} from '@/lib/kv';
import { applyFeedback } from '@/lib/utils/personalization';
import type { ArticleCategory, FeedbackSignal } from '@/lib/types';

const VALID_SIGNALS: FeedbackSignal[] = ['up', 'down', 'hide'];

export async function GET() {
  try {
    const feedback = await getArticleFeedback();
    return NextResponse.json({ success: true, feedback });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      articleId?: string;
      signal?: FeedbackSignal;
      category?: ArticleCategory;
      sourceName?: string;
    };
    const { articleId, signal, category, sourceName } = body;

    if (!articleId || typeof articleId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'articleId (string) is required' },
        { status: 400 }
      );
    }
    if (!signal || !VALID_SIGNALS.includes(signal)) {
      return NextResponse.json(
        { success: false, error: `signal must be one of: ${VALID_SIGNALS.join(', ')}` },
        { status: 400 }
      );
    }
    if (!sourceName || typeof sourceName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'sourceName (string) is required' },
        { status: 400 }
      );
    }

    // Clicking the already-active signal clears it (we don't rewind past learning).
    const current = await getArticleFeedback();
    const isToggleOff = current[articleId] === signal;

    let preferences = await getPreferences();
    if (!isToggleOff) {
      preferences = applyFeedback(preferences, { category, sourceName }, signal);
      preferences.updatedAt = new Date().toISOString();
      await storePreferences(preferences);

      // Fold this article's embedding into the semantic profile: 👍 pulls the
      // profile toward it, 👎/hide pushes away. Best-effort — needs the article
      // to have been embedded during aggregation.
      const embedding = await getCachedEmbedding(articleId);
      if (embedding) await updateProfile(embedding, signal === 'up' ? 1 : -1);
    }

    const feedback = await setArticleFeedback(articleId, isToggleOff ? null : signal);

    return NextResponse.json({ success: true, feedback, preferences });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
