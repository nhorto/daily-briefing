import { NextResponse } from 'next/server';
import { getTodaysIntelligence } from '@/lib/kv';

export async function GET() {
  try {
    const intelligence = await getTodaysIntelligence();

    if (!intelligence) {
      return NextResponse.json(
        { success: false, error: 'No intelligence summary available' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, intelligence });
  } catch (error) {
    console.error('[Intelligence API] Error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
