import { type NextRequest, NextResponse } from 'next/server';
import {
  getCachedEmbedding,
  getPreferences,
  incrementImpression,
  logClickRank,
  recordEngagementOnce,
  storePreferences,
  updateProfile,
} from '@/lib/kv';
import { applyAffinityNudge } from '@/lib/utils/personalization';
import {
  dwellCounts,
  dwellQuality,
  engagementAffinityDelta,
  isProfilePositive,
} from '@/lib/utils/signals';
import type { ArticleCategory, EngagementType } from '@/lib/types';

const VALID_TYPES: EngagementType[] = [
  'feed-open',
  'open-original',
  'read-to-end',
  'dwell',
  'impression',
];

interface SignalBody {
  articleId?: string;
  type?: EngagementType;
  category?: ArticleCategory;
  sourceName?: string;
  rank?: number; // feed position the click came from (position-bias logging)
  activeSeconds?: number; // dwell: tab-visible foreground seconds
  contentChars?: number; // dwell: length of text on the page (for normalization)
}

/**
 * Capture an implicit engagement signal (Phase 4). These are debiased and folded
 * gently into the model: quality reads (open-original / read-to-end / genuine
 * dwell) nudge learned affinity *and* the semantic profile; a bare feed click
 * barely nudges affinity and logs its rank for position-bias analysis;
 * impressions are merely counted (Phase 5 turns counts into discounting).
 *
 * Each (article, type) effect is applied at most once so re-renders/re-scrolls
 * don't multiply it. Everything is best-effort — failures never block the UI.
 */
export async function POST(request: NextRequest) {
  try {
    const { articleId, type, category, sourceName, rank, activeSeconds, contentChars } =
      (await request.json()) as SignalBody;

    if (!articleId || typeof articleId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'articleId (string) is required' },
        { status: 400 }
      );
    }
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { success: false, error: `type must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Impressions: just count (for Phase 5 discounting). No model nudge — merely
    // being shown isn't evidence of disinterest yet.
    if (type === 'impression') {
      await incrementImpression(articleId);
      return NextResponse.json({ success: true, counted: true });
    }

    // A feed click is position-biased; log the rank it came from regardless.
    if (type === 'feed-open' && typeof rank === 'number') {
      await logClickRank(rank);
    }

    // Length-normalize dwell: a skim/bounce carries no signal.
    if (type === 'dwell') {
      const quality = dwellQuality(activeSeconds ?? 0, contentChars ?? 0);
      if (!dwellCounts(quality)) {
        return NextResponse.json({ success: true, counted: false, quality });
      }
    }

    // Apply each signal's effect at most once per article.
    const isNew = await recordEngagementOnce(articleId, type);
    if (isNew) {
      if (sourceName && typeof sourceName === 'string') {
        let prefs = await getPreferences();
        prefs = applyAffinityNudge(prefs, { category, sourceName }, engagementAffinityDelta(type));
        prefs.updatedAt = new Date().toISOString();
        await storePreferences(prefs);
      }
      // Fold high-intent signals into the semantic profile (best-effort: needs
      // the article to have been embedded during aggregation).
      if (isProfilePositive(type)) {
        const embedding = await getCachedEmbedding(articleId);
        if (embedding) await updateProfile(embedding, 1);
      }
    }

    return NextResponse.json({ success: true, counted: isNew });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
