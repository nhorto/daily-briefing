import { NextRequest, NextResponse } from 'next/server';
import { getPreferences, storePreferences } from '@/lib/kv';
import type { ArticleCategory, UserPreferences } from '@/lib/types';

const VALID_CATEGORIES: ArticleCategory[] = [
  'ai-ml', 'business', 'science', 'security',
  'programming', 'devops', 'design', 'other',
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
    const { interests } = body;

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

    const preferences: UserPreferences = {
      interests,
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
