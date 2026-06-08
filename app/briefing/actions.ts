'use server';

/**
 * Server action for the in-app "Regenerate" / "Generate Briefing Now" buttons.
 * Runs the aggregation pipeline server-side (same-origin, no public endpoint),
 * so it doesn't need CRON_SECRET the way the scheduled cron route does.
 */

import { runAggregation, NoActiveSourcesError } from '@/lib/services/aggregation';

export async function regenerateBriefingAction(): Promise<{ success: boolean; error?: string }> {
  try {
    await runAggregation();
    return { success: true };
  } catch (error) {
    if (error instanceof NoActiveSourcesError) {
      return { success: false, error: error.message };
    }
    console.error('[Action] Briefing regeneration failed:', error);
    return { success: false, error: (error as Error).message };
  }
}
