'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Article } from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import ChatPanel from '@/components/ChatPanel';
import ArticleCard from '@/components/ArticleCard';
import { getSourceColor } from '@/components/ui/SourcePill';
import { formatRelativeTime, getFreshnessCategory } from '@/lib/utils/date';
import { SkeletonPage } from '@/components/ui/Skeleton';

export default function ArticleDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [article, setArticle] = useState<Article | null>(null);
  const [relatedArticles, setRelatedArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

          {/* Read Original */}
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-bg-primary rounded-lg hover:bg-accent-hover transition-colors font-medium"
          >
            Read Original
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

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
        </div>

        {/* Chat Panel - Right side */}
        <div className="w-[380px] flex-shrink-0 border-l border-border hidden lg:block">
          <ChatPanel
            mode="article"
            articles={[article, ...relatedArticles]}
            articleId={article.id}
            className="h-full rounded-none border-0"
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
