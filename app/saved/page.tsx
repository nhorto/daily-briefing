'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SavedArticle } from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import Card from '@/components/ui/Card';
import { getSourceColor } from '@/components/ui/SourcePill';
import { formatRelativeTime } from '@/lib/utils/date';
import { SkeletonPage } from '@/components/ui/Skeleton';

export default function SavedPage() {
  const [bookmarks, setBookmarks] = useState<SavedArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookmarks();
  }, []);

  async function fetchBookmarks() {
    try {
      const response = await fetch('/api/bookmarks');
      const data = await response.json();
      if (data.success) setBookmarks(data.bookmarks || []);
    } catch (error) {
      console.error('Failed to fetch bookmarks:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(url: string) {
    setBookmarks((prev) => prev.filter((b) => b.url !== url)); // optimistic
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
