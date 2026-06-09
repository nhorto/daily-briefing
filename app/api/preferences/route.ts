import { type NextRequest, NextResponse } from 'next/server';
import { getPreferences, storePreferences } from '@/lib/kv';
import type { ArticleCategory, UserPreferences } from '@/lib/types';

const VALID_CATEGORIES: ArticleCategory[] = [
  'ai-ml', 'business', 'science', 'security',
  'programming', 'devops', 'design', 'hardware', 'other',
];

export async function GET() {
  try {
    const preferences = await getPreferences();
    return NextResponse.json({ success: true, preferences });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { interests, sources, mutedKeywords } = body;

    if (!interests || typeof interests !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid interests object' },
        { status: 400 }
      );
    }

    // Validate all categories are present with valid weights
    for (const category of VALID_CATEGORIES) {
      const weight = interests[category];
      if (typeof weight !== 'number' || weight < 0 || weight > 100) {
        return NextResponse.json(
          { success: false, error: `Invalid weight for category "${category}": must be 0-100` },
          { status: 400 }
        );
      }
    }

    // `sources` is optional. Validate when present; otherwise keep what's stored
    // so saving the sliders never wipes the learned source weights.
    if (sources !== undefined) {
      if (typeof sources !== 'object' || sources === null) {
        return NextResponse.json(
          { success: false, error: 'sources must be an object when provided' },
          { status: 400 }
        );
      }
      for (const [name, weight] of Object.entries(sources)) {
        if (typeof weight !== 'number' || weight < 0 || weight > 100) {
          return NextResponse.json(
            { success: false, error: `Invalid weight for source "${name}": must be 0-100` },
            { status: 400 }
          );
        }
      }
    }

    // `mutedKeywords` is optional. Validate when present; otherwise keep stored.
    let cleanedMuted: string[] | undefined;
    if (mutedKeywords !== undefined) {
      if (!Array.isArray(mutedKeywords) || mutedKeywords.some((k) => typeof k !== 'string')) {
        return NextResponse.json(
          { success: false, error: 'mutedKeywords must be an array of strings when provided' },
          { status: 400 }
        );
      }
      // Normalize: trim, drop blanks, lowercase, dedupe.
      cleanedMuted = [
        ...new Set(
          (mutedKeywords as string[]).map((k) => k.trim().toLowerCase()).filter(Boolean)
        ),
      ];
    }

    const existing = await getPreferences();
    const preferences: UserPreferences = {
      interests,
      sources: sources ?? existing.sources,
      mutedKeywords: cleanedMuted ?? existing.mutedKeywords,
      // Carry the deliberate onboarding prior + flag — they aren't part of the
      // settings form, so omitting them here would silently wipe the stated
      // baseline (and re-trigger the first-run nudge) on every Save.
      ...(existing.interestBaseline ? { interestBaseline: existing.interestBaseline } : {}),
      ...(existing.onboardedAt ? { onboardedAt: existing.onboardedAt } : {}),
      updatedAt: new Date().toISOString(),
    };

    await storePreferences(preferences);

    return NextResponse.json({ success: true, preferences });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
