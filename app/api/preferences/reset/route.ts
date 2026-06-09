import { NextResponse } from 'next/server';
import {
  clearBehavioralSignals,
  clearProfile,
  getPreferences,
  storePreferences,
} from '@/lib/kv';
import { resetLearnedPreferences } from '@/lib/utils/personalization';

/**
 * Reset everything the engine learned, keeping what the user stated.
 *
 * A 👎 (and many implicit signals) move both the learned weights and the
 * semantic profile, and the profile fold isn't cleanly reversible — so this is
 * the escape hatch. It clears:
 *  - the learned category/source weights → back to the onboarding baseline,
 *  - the semantic interest profile (running sums + retained exemplars),
 *  - behavioral signals (impressions, engagement dedupe, click ranks) and the
 *    per-article feedback map.
 * It keeps muted keywords, the onboarding baseline, and onboardedAt — those are
 * deliberate settings, not learned signal.
 */
export async function POST() {
  try {
    const existing = await getPreferences();
    const reset = resetLearnedPreferences(existing);
    await storePreferences(reset);
    await Promise.all([clearProfile(), clearBehavioralSignals()]);
    return NextResponse.json({ success: true, preferences: reset });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
