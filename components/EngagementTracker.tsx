'use client';

import { useEffect, useRef } from 'react';
import type { ArticleCategory } from '@/lib/types';
import { recordSignal } from '@/lib/utils/signals-client';

interface EngagementTrackerProps {
  /** The lead article id for this feed row (cluster → its representative). */
  articleId: string;
  /** 1-based position in the feed, logged with clicks for position-bias analysis. */
  rank: number;
  category?: ArticleCategory;
  sourceName?: string;
  children: React.ReactNode;
}

/**
 * Wraps a feed row to capture two implicit signals (Phase 4) without changing the
 * card components:
 *  - impression: logged once when the row first scrolls ≥50% into view.
 *  - click: a click on an in-card link fires `open-original` if it points off-site
 *    (the source URL) or `feed-open` (with rank) for an in-app navigation.
 */
export default function EngagementTracker({
  articleId,
  rank,
  category,
  sourceName,
  children,
}: EngagementTrackerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const impressed = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    impressed.current = false;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !impressed.current) {
            impressed.current = true;
            recordSignal({ articleId, type: 'impression' });
            obs.disconnect();
          }
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [articleId]);

  const onClickCapture = (e: React.MouseEvent) => {
    const link = (e.target as HTMLElement).closest('a');
    if (!link) return;
    const href = link.getAttribute('href') ?? '';
    const isExternal = /^https?:\/\//i.test(href);
    recordSignal({
      articleId,
      type: isExternal ? 'open-original' : 'feed-open',
      category,
      sourceName,
      ...(isExternal ? {} : { rank }),
    });
  };

  return (
    <div ref={ref} onClickCapture={onClickCapture}>
      {children}
    </div>
  );
}
