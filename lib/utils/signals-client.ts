/**
 * Client-side helper to report an implicit engagement signal (Phase 4).
 * Fire-and-forget: failures are swallowed and never block the UI. `keepalive`
 * lets the request survive a navigation/unload (e.g. the dwell flush when the
 * user leaves an article).
 */

import type { ArticleCategory, EngagementType } from '../types';

export interface SignalPayload {
  articleId: string;
  type: EngagementType;
  category?: ArticleCategory;
  sourceName?: string;
  rank?: number;
  activeSeconds?: number;
  contentChars?: number;
}

export function recordSignal(payload: SignalPayload): void {
  try {
    void fetch('/api/signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // best-effort
  }
}
