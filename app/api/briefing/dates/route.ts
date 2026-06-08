/**
 * Briefing Dates API
 * GET /api/briefing/dates → list of dates (newest first) with a stored briefing.
 */

import { NextResponse } from 'next/server';
import { getBriefingDates } from '@/lib/kv';

export async function GET() {
  try {
    const dates = await getBriefingDates();
    return NextResponse.json({ success: true, dates });
  } catch (error) {
    console.error('[API] Error getting briefing dates:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
