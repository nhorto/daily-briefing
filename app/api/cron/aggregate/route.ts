/**
 * Daily Content Aggregation Cron Job
 * Triggered by a scheduler (Vercel Cron, or a system cron when self-hosted).
 * Protected by CRON_SECRET. The in-app "Regenerate" button uses a server action
 * instead (see app/briefing/actions.ts) so it never needs the secret.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAggregation, NoActiveSourcesError } from '@/lib/services/aggregation';

export const maxDuration = 300; // 5 minutes max execution time

export async function POST(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cron] Starting daily content aggregation...');

  try {
    const result = await runAggregation();
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof NoActiveSourcesError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[Cron] Error during aggregation:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// Allow manual triggering via GET (for testing with the secret)
export async function GET(request: NextRequest) {
  console.log('[Cron] Manual trigger via GET request');
  return POST(request);
}
