'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Article } from '@/lib/types';
import { recordSignal } from '@/lib/utils/signals-client';

/**
 * Capture the article-detail engagement signals (Phase 4):
 *  - dwell: active (tab-visible) foreground seconds, flushed on leave; the server
 *    length-normalizes it against `contentChars` so a skim doesn't count.
 *  - read-to-end: attach the returned `readToEndRef` to a sentinel at the bottom
 *    of the article; intersecting it once fires the signal.
 *  - open-original: call the returned `onOpenOriginal` from the source link.
 *
 * Dwell uses the Page Visibility API so time spent on a backgrounded tab doesn't
 * count. All sends are best-effort (keepalive) so they survive the route change.
 */
export function useArticleEngagement(article: Article | null, contentChars: number) {
  const readToEndRef = useRef<HTMLDivElement | null>(null);
  // Latest values, read inside listeners without re-subscribing.
  const articleRef = useRef(article);
  articleRef.current = article;
  const charsRef = useRef(contentChars);
  charsRef.current = contentChars;

  // Dwell timer — accumulate only while the tab is visible.
  useEffect(() => {
    if (!article) return;
    const id = article.id;
    let activeMs = 0;
    let lastTick: number | null =
      typeof document !== 'undefined' && document.visibilityState === 'visible' ? Date.now() : null;
    let sent = false;

    const accumulate = () => {
      if (lastTick != null) {
        activeMs += Date.now() - lastTick;
        lastTick = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') lastTick = Date.now();
      else accumulate();
    };
    const flush = () => {
      accumulate();
      if (sent) return;
      sent = true;
      const a = articleRef.current;
      recordSignal({
        articleId: id,
        type: 'dwell',
        category: a?.category,
        sourceName: a?.sourceName,
        activeSeconds: activeMs / 1000,
        contentChars: charsRef.current,
      });
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush(); // route change / unmount
    };
  }, [article]);

  // Read-to-end sentinel.
  useEffect(() => {
    const el = readToEndRef.current;
    if (!el || !article) return;
    const id = article.id;
    let fired = false;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !fired) {
            fired = true;
            const a = articleRef.current;
            recordSignal({
              articleId: id,
              type: 'read-to-end',
              category: a?.category,
              sourceName: a?.sourceName,
            });
            obs.disconnect();
          }
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [article]);

  const onOpenOriginal = useCallback(() => {
    const a = articleRef.current;
    if (!a) return;
    recordSignal({
      articleId: a.id,
      type: 'open-original',
      category: a.category,
      sourceName: a.sourceName,
    });
  }, []);

  return { readToEndRef, onOpenOriginal };
}
