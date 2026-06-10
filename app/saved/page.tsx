'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SavedArticle } from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import Card from '@/components/ui/Card';
import { getSourceColor } from '@/components/ui/SourcePill';
import { formatRelativeTime } from '@/lib/utils/date';
import { SkeletonPage } from '@/components/ui/Skeleton';
import { readClientCache, writeClientCache } from '@/lib/utils/clientCache';

const SAVED_CACHE_KEY = 'saved:bookmarks';
const SAVED_CACHE_TTL_MS = 60_000;

export default function SavedPage() {
  // Seed from the session cache so a return visit paints instantly instead of
  // showing a skeleton (and refetching).
  const seed = readClientCache<SavedArticle[]>(SAVED_CACHE_KEY, SAVED_CACHE_TTL_MS);
  const [bookmarks, setBookmarks] = useState<SavedArticle[]>(seed.data ?? []);
  const [loading, setLoading] = useState(!seed.hit);

  useEffect(() => {
    // Fresh cache → nothing to do. Otherwise refetch (quietly if we already have
    // a cached list to show).
    if (readClientCache<SavedArticle[]>(SAVED_CACHE_KEY, SAVED_CACHE_TTL_MS).fresh) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/bookmarks');
        const data = await response.json();
        if (!cancelled && data.success) {
          const list = (data.bookmarks || []) as SavedArticle[];
          setBookmarks(list);
          writeClientCache(SAVED_CACHE_KEY, list);
        }
      } catch (error) {
        if (!cancelled) console.error('Failed to fetch bookmarks:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRemove(url: string) {
    const next = bookmarks.filter((b) => b.url !== url);
    setBookmarks(next); // optimistic
    writeClientCache(SAVED_CACHE_KEY, next); // keep the cache in sync
    try {
      await fetch(`/api/bookmarks?url=${encodeURIComponent(url)}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Failed to remove bookmark:', error);
    }
  }

  return (
    <DashboardLayout>
      {loading ? (
        <SkeletonPage />
      ) : (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Saved</h1>
            <p className="text-sm text-text-secondary mt-1">
              {bookmarks.length === 0
                ? 'Articles you save for later will appear here.'
                : `${bookmarks.length} saved article${bookmarks.length === 1 ? '' : 's'}.`}
            </p>
          </div>

          {bookmarks.length === 0 ? (
            <Card className="p-10 text-center">
              <div className="text-5xl mb-3">🔖</div>
              <p className="text-text-secondary mb-4">
                Nothing saved yet. Tap the bookmark icon on any article to keep it here —
                saved articles stick around even after the daily briefing rolls over.
              </p>
              <Link
                href="/briefing"
                className="text-accent hover:text-accent-hover transition-colors text-sm font-medium"
              >
                Go to today’s briefing →
              </Link>
            </Card>
          ) : (
            <div className="space-y-3">
              {bookmarks.map((article) => (
                <Card key={article.url} hover className="p-5">
                  <div className="flex gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: getSourceColor(article.sourceName) }}
                          />
                          <span className="text-text-secondary font-medium">{article.sourceName}</span>
                        </span>
                        <span className="text-text-muted">·</span>
                        <span className="text-text-muted">saved {formatRelativeTime(article.savedAt)}</span>
                      </div>

                      <h3 className="font-semibold text-text-primary mb-2 text-base">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-accent transition-colors"
                        >
                          {article.title}
                        </a>
                      </h3>

                      <p className="text-text-secondary text-sm leading-relaxed mb-3 line-clamp-3">
                        {article.summary || article.excerpt}
                      </p>

                      <div className="flex items-center gap-3">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:text-accent-hover transition-colors text-sm font-medium"
                        >
                          Read Original →
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemove(article.url)}
                          className="text-text-muted hover:text-text-secondary transition-colors text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {article.imageUrl && (
                      <div className="flex-shrink-0 hidden sm:block">
                        <img
                          src={article.imageUrl}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                          className="w-24 h-24 object-cover rounded-md bg-bg-elevated"
                        />
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
