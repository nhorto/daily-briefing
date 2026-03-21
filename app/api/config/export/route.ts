import { NextResponse } from 'next/server';
import { getSources, getPreferences } from '@/lib/kv';

export async function GET() {
  try {
    const [sources, preferences] = await Promise.all([
      getSources(),
      getPreferences(),
    ]);

    return NextResponse.json({
      success: true,
      config: {
        sources,
        preferences,
        exportedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
