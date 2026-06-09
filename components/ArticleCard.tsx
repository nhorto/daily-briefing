'use client';

import Link from 'next/link';
import type { Article, FeedbackSignal } from '@/lib/types';
import { CATEGORY_META } from '@/lib/types';
import { formatRelativeTime, getFreshnessCategory } from '@/lib/utils/date';
import Card from '@/components/ui/Card';
import { getSourceColor } from '@/components/ui/SourcePill';
import FeedbackControls from '@/components/ui/FeedbackControls';
import BookmarkButton from '@/components/ui/BookmarkButton';

interface ArticleCardProps {
  article: Article;
  compact?: boolean;
  isRead?: boolean;
  onMarkRead?: (articleId: string) => void;
  /** Current training signal for this article, if any. */
  feedback?: FeedbackSignal;
  /** Called when the user trains the model from this article. */
  onFeedback?: (article: Article, signal: FeedbackSignal) => void;
  /** Whether this article is bookmarked. */
  isBookmarked?: boolean;
  /** Called when the user toggles the bookmark. */
  onToggleBookmark?: (article: Article) => void;
}

export default function ArticleCard({
  article,
  compact = false,
  isRead,
  onMarkRead,
  feedback,
  onFeedback,
  isBookmarked,
  onToggleBookmark,
}: ArticleCardProps) {
  const freshness = getFreshnessCategory(article.publishedAt);
  const sourceColor = getSourceColor(article.sourceName);
  const categoryMeta = article.category ? CATEGORY_META[article.category] : null;

  const handleLinkClick = () => {
    onMarkRead?.(article.id);
  };

  // Collapsed "not interested" state — keeps the action reversible in-session.
  if (feedback === 'hide') {
    return (
      <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-bg-surface border border-border text-xs text-text-muted">
        <span>Not interested · {article.sourceName}</span>
        {onFeedback && (
          <button
            type="button"
            onClick={() => onFeedback(article, 'hide')}
            className="text-accent hover:text-accent-hover transition-colors font-medium"
          >
            Undo
          </button>
        )}
      </div>
    );
  }

  return (
    <Card hover className={`${compact ? 'p-4' : 'p-5'} ${isRead ? 'opacity-60' : ''}`}>
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          {/* Metadata: category tag + source + time */}
          <div className="flex items-center gap-2 mb-2 text-xs">
            {categoryMeta && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-bg-elevated text-text-secondary font-medium">
                <span aria-hidden="true">{categoryMeta.icon}</span>
                <span>{categoryMeta.label}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: sourceColor }}
              />
              <span className="text-text-secondary font-medium truncate">{article.sourceName}</span>
            </span>
            <span className="text-text-muted">·</span>
            <span className="text-text-muted whitespace-nowrap">
              {formatRelativeTime(article.publishedAt)}
            </span>
            {!isRead && freshness === 'fresh' && (
              <span className="w-1.5 h-1.5 rounded-full bg-status-new flex-shrink-0" title="Fresh" />
            )}
          </div>

          {/* Title */}
          <h3 className={`font-semibold text-text-primary mb-2 flex items-start gap-2 ${compact ? 'text-sm' : 'text-base'}`}>
            {!isRead && isRead !== undefined && (
              <span
                className="w-2 h-2 mt-1.5 rounded-full bg-status-new flex-shrink-0"
                title="Unread"
              />
            )}
            <Link
              href={`/article/${article.id}`}
              className="hover:text-accent transition-colors"
              onClick={handleLinkClick}
            >
              {article.title}
            </Link>
          </h3>

          {/* Summary or Excerpt */}
          <p className={`text-text-secondary text-sm leading-relaxed mb-4 ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}>
            {article.summary || article.excerpt}
          </p>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <Link
                href={`/article/${article.id}`}
                className="text-accent hover:text-accent-hover transition-colors text-sm font-medium"
                onClick={handleLinkClick}
              >
                Details
              </Link>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-text-muted hover:text-text-secondary transition-colors text-sm"
                onClick={handleLinkClick}
              >
                Read original
                <span aria-hidden="true">↗</span>
              </a>
            </div>

            {/* Save + training controls */}
            <div className="flex items-center gap-1">
              {onToggleBookmark && (
                <BookmarkButton saved={!!isBookmarked} onClick={() => onToggleBookmark(article)} />
              )}
              {onFeedback && (
                <FeedbackControls value={feedback} onChange={(s) => onFeedback(article, s)} />
              )}
            </div>
          </div>
        </div>

        {/* Thumbnail */}
        {article.imageUrl && (
          <div className="flex-shrink-0 hidden sm:block">
            <img
              src={article.imageUrl}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
              className={`${compact ? 'w-16 h-16' : 'w-24 h-24'} object-cover rounded-lg ring-1 ring-border bg-bg-elevated`}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
