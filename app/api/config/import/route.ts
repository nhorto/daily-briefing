import { NextRequest, NextResponse } from 'next/server';
import { storeSources, storePreferences } from '@/lib/kv';
import type { Source, UserPreferences } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sources, preferences } = body.config || body;

    const results: string[] = [];

    if (sources && Array.isArray(sources) && sources.length > 0) {
      await storeSources(sources as Source[]);
      results.push(`Imported ${sources.length} sources`);
    }

    if (preferences && preferences.interests) {
      await storePreferences(preferences as UserPreferences);
      results.push('Imported preferences');
    }

    if (results.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid config data found in request body' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: results.join(', '),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
