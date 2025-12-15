/**
 * Briefing API Route
 * GET /api/briefing?date=YYYY-MM-DD
 * Returns briefing data for specified date (defaults to today)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTodaysBriefing, getBriefingByDate } from '@/lib/kv';
import { getTodayDateString } from '@/lib/utils/date';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const dateParam = searchParams.get('date');

  try {
    // If no date specified, get today's briefing
    const date = dateParam || getTodayDateString();

    // Fetch briefing
    const briefing = dateParam
      ? await getBriefingByDate(date)
      : await getTodaysBriefing();

    if (!briefing) {
      return NextResponse.json(
        {
          success: false,
          error: 'No briefing available for this date',
          message: `Try generating a briefing by triggering the cron job`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      briefing,
    });
  } catch (error) {
    console.error('[API] Error fetching briefing:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
