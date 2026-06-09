import { type NextRequest, NextResponse } from 'next/server';
import { getPreferences, storePreferences, updateProfile } from '@/lib/kv';
import { embedTexts } from '@/lib/services/embeddings';
import { DEFAULT_PREFERENCES } from '@/lib/types';
import type { ArticleCategory } from '@/lib/types';

const ALL_CATEGORIES = Object.keys(DEFAULT_PREFERENCES.interests) as ArticleCategory[];

/** Interest weight for a category the user picked vs. left unpicked (neutral). */
const PICKED_INTEREST = 75;
const NEUTRAL_INTEREST = 50;
/** Starting weight for a source the user picked as a favorite. */
const PICKED_SOURCE = 70;

interface OnboardingBody {
  interests?: ArticleCategory[]; // category slugs the user cares about
  sources?: string[]; // source names to emphasize
  examples?: string[]; // pasted snippets of content they'd want more of
}

/**
 * Complete onboarding (Phase 4 cold-start). Seeds:
 *  - category interest + a slow-decay `interestBaseline` from the picked topics,
 *  - a starting weight for favorite sources,
 *  - the semantic profile vector from any pasted example snippets (embedded and
 *    folded in as positives) — a decaying prior, not ground truth, that behavior
 *    corrects over time.
 * Marks `onboardedAt` so the first-run nudge stops showing.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as OnboardingBody;
    const picked = new Set(
      (Array.isArray(body.interests) ? body.interests : []).filter((c) =>
        ALL_CATEGORIES.includes(c)
      )
    );
    const sources = (Array.isArray(body.sources) ? body.sources : []).filter(
      (s) => typeof s === 'string' && s.trim().length > 0
    );
    const examples = (Array.isArray(body.examples) ? body.examples : [])
      .filter((t) => typeof t === 'string' && t.trim().length > 0)
      .slice(0, 5);

    const interests = {} as Record<ArticleCategory, number>;
    for (const cat of ALL_CATEGORIES) {
      interests[cat] = picked.has(cat) ? PICKED_INTEREST : NEUTRAL_INTEREST;
    }

    const prefs = await getPreferences();
    const now = new Date().toISOString();
    prefs.interests = interests;
    prefs.interestBaseline = { ...interests }; // the stated, slow-decay prior
    prefs.sources = { ...prefs.sources };
    for (const name of sources) prefs.sources[name] = PICKED_SOURCE;
    prefs.onboardedAt = now;
    prefs.updatedAt = now;
    await storePreferences(prefs);

    // Seed the semantic profile from pasted examples (best-effort).
    let seeded = 0;
    if (examples.length > 0) {
      try {
        const vectors = await embedTexts(examples);
        for (const v of vectors) {
          if (v) {
            await updateProfile(v, 1);
            seeded += 1;
          }
        }
      } catch (error) {
        console.error('[Onboarding] Example embedding failed (continuing):', error);
      }
    }

    return NextResponse.json({ success: true, preferences: prefs, seeded });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
