'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Article, FeedbackSignal } from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import ChatPanel from '@/components/ChatPanel';
import ArticleCard from '@/components/ArticleCard';
import FeedbackControls from '@/components/ui/FeedbackControls';
import BookmarkButton from '@/components/ui/BookmarkButton';
import { getSourceColor } from '@/components/ui/SourcePill';
import { formatRelativeTime, getFreshnessCategory } from '@/lib/utils/date';
import { SkeletonPage } from '@/components/ui/Skeleton';
import { useArticleEngagement } from '@/lib/hooks/useArticleEngagement';

export default function ArticleDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [article, setArticle] = useState<Article | null>(null);
  const [relatedArticles, setRelatedArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackSignal, setFeedbackSignal] = useState<FeedbackSignal | undefined>(undefined);
  const [articleContent, setArticleContent] = useState<string | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);

  useEffect(() => {
    async function fetchArticle() {
      try {
        setLoading(true);
        const response = await fetch(`/api/articles/${id}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Article not found');
        }

        setArticle(data.article);
        setRelatedArticles(data.relatedArticles || []);
        setError(null);

        // Load any existing training signal for this article
        try {
          const fbRes = await fetch('/api/feedback');
          const fbData = await fbRes.json();
          if (fbData.success) setFeedbackSignal(fbData.feedback?.[id]);
        } catch {
          // non-critical
        }

        // Is this article already bookmarked?
        try {
          const bmRes = await fetch('/api/bookmarks');
          const bmData = await bmRes.json();
          if (bmData.success) {
            setIsBookmarked(
              (bmData.bookmarks as { url: string }[]).some((b) => b.url === data.article.url)
            );
          }
        } catch {
          // non-critical
        }

        // Auto-mark as read
        await fetch('/api/articles/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId: id }),
        });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchArticle();
  }, [id]);

  // Fetch the full article text (best-effort) so the chat can read the whole
  // piece and answer detailed questions. Non-blocking — the page renders without it.
  useEffect(() => {
    let cancelled = false;
    setArticleContent(null);
    (async () => {
      try {
        const res = await fetch(`/api/articles/${id}/content`);
        const data = await res.json();
        if (!cancelled && data.success) setArticleContent(data.content ?? null);
      } catch {
        // non-critical: chat falls back to summary + excerpt
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Implicit engagement capture (Phase 4): length-normalize dwell against the
  // text actually on the page (full extracted text when loaded, else summary +
  // excerpt). Hook must run before any early return.
  const contentChars = (
    articleContent ?? `${article?.summary ?? ''} ${article?.excerpt ?? ''}`
  ).length;
  const { readToEndRef, onOpenOriginal } = useArticleEngagement(article, contentChars);

  async function handleFeedback(signal: FeedbackSignal) {
    if (!article) return;
    const isToggleOff = feedbackSignal === signal;
    setFeedbackSignal(isToggleOff ? undefined : signal);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId: article.id,
          signal,
          category: article.category,
          sourceName: article.sourceName,
        }),
      });
    } catch (err) {
      console.error('Failed to record feedback:', err);
    }
  }

  async function handleToggleBookmark() {
    if (!article) return;
    const wasSaved = isBookmarked;
    setIsBookmarked(!wasSaved); // optimistic
    try {
      if (wasSaved) {
        await fetch(`/api/bookmarks?url=${encodeURIComponent(article.url)}`, { method: 'DELETE' });
      } else {
        await fetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ article }),
        });
      }
    } catch (err) {
      console.error('Failed to toggle bookmark:', err);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <SkeletonPage />
      </DashboardLayout>
    );
  }

  if (error || !article) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center px-4 py-24">
          <div className="max-w-md text-center">
            <div className="text-6xl mb-4">404</div>
            <h2 className="text-2xl font-bold text-text-primary mb-2">
              Article Not Found
            </h2>
            <p className="text-text-secondary mb-6">
              {error || 'This article could not be found in today\'s briefing.'}
            </p>
            <Link
              href="/briefing"
              className="px-6 py-3 bg-accent text-bg-primary rounded-lg hover:bg-accent-hover transition-colors font-medium inline-block"
            >
              Back to Briefing
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const sourceColor = getSourceColor(article.sourceName);
  const freshness = getFreshnessCategory(article.publishedAt);

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Article Detail - Left side */}
        <div className="flex-1 overflow-y-auto px-6 py-6 min-w-0">
          {/* Back link */}
          <Link
            href="/briefing"
            className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors mb-6"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Briefing
          </Link>

          {/* Source + Time */}
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: sourceColor }}
              />
              <span className="text-text-secondary text-sm font-medium">
                {article.sourceName}
              </span>
            </span>
            <span className="text-text-muted">·</span>
            <span className="text-text-muted text-sm">
              {formatRelativeTime(article.publishedAt)}
            </span>
            {freshness === 'fresh' && (
              <span className="w-2 h-2 rounded-full bg-status-new" title="Fresh" />
            )}
            {article.author && (
              <>
                <span className="text-text-muted">·</span>
                <span className="text-text-muted text-sm">{article.author}</span>
              </>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-text-primary mb-6 leading-tight">
            {article.title}
          </h1>

          {/* Hero image */}
          {article.imageUrl && (
            <img
              src={article.imageUrl}
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
              className="w-full max-h-80 object-cover rounded-lg mb-6 bg-bg-elevated"
            />
          )}

          {/* AI Summary */}
          {article.summary && (
            <div className="bg-bg-surface border border-border rounded-lg p-5 mb-6">
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-2">
                AI Summary
              </h2>
              <p className="text-text-primary leading-relaxed">
                {article.summary}
              </p>
            </div>
          )}

          {/* Excerpt */}
          {article.excerpt && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-2">
                Excerpt
              </h2>
              <p className="text-text-secondary leading-relaxed">
                {article.excerpt}
              </p>
            </div>
          )}

          {/* Read Original + training */}
          <div className="flex flex-wrap items-center gap-4">
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onOpenOriginal}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-bg-primary rounded-lg hover:bg-accent-hover transition-colors font-medium"
            >
              Read Original
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Save for later:</span>
              <BookmarkButton saved={isBookmarked} onClick={handleToggleBookmark} size="md" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Train your briefing:</span>
              <FeedbackControls value={feedbackSignal} onChange={handleFeedback} />
            </div>
          </div>

          {/* Related Articles */}
          {relatedArticles.length > 0 && (
            <div className="mt-10 pt-6 border-t border-border">
              <h2 className="text-lg font-bold text-text-primary mb-4">
                Related Articles ({relatedArticles.length})
              </h2>
              <div className="grid gap-3">
                {relatedArticles.map((related) => (
                  <ArticleCard key={related.id} article={related} compact />
                ))}
              </div>
            </div>
          )}

          {/* Read-to-end sentinel (Phase 4 engagement signal). */}
          <div ref={readToEndRef} aria-hidden="true" className="h-px" />
        </div>

        {/* Chat Panel - Right side */}
        <div className="w-[380px] flex-shrink-0 border-l border-border hidden lg:block">
          <ChatPanel
            mode="article"
            articles={[article, ...relatedArticles]}
            articleId={article.id}
            articleContent={articleContent}
            className="h-full rounded-none border-0"
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
