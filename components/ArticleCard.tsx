'use client';

import Link from 'next/link';
import type { Article, FeedbackSignal } from '@/lib/types';
import { formatRelativeTime, getFreshnessCategory } from '@/lib/utils/date';
import Card from '@/components/ui/Card';
import { getSourceColor } from '@/components/ui/SourcePill';

interface ArticleCardProps {
  article: Article;
  compact?: boolean;
  isRead?: boolean;
  onMarkRead?: (articleId: string) => void;
  /** Current training signal for this article, if any. */
  feedback?: FeedbackSignal;
  /** Called when the user trains the model from this article. */
  onFeedback?: (article: Article, signal: FeedbackSignal) => void;
}

export default function ArticleCard({
  article,
  compact = false,
  isRead,
  onMarkRead,
  feedback,
  onFeedback,
}: ArticleCardProps) {
  const freshness = getFreshnessCategory(article.publishedAt);
  const sourceColor = getSourceColor(article.sourceName);

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
      {/* Metadata */}
      <div className="flex items-center gap-2 mb-2 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: sourceColor }}
          />
          <span className="text-text-secondary text-xs font-medium">
            {article.sourceName}
          </span>
        </span>
        <span className="text-text-muted">·</span>
        <span className="text-text-muted text-xs">
          {formatRelativeTime(article.publishedAt)}
        </span>
        {!isRead && freshness === 'fresh' && (
          <span className="w-1.5 h-1.5 rounded-full bg-status-new" title="Fresh" />
        )}
      </div>

      {/* Title */}
      <h3 className={`font-semibold text-text-primary mb-2 flex items-center gap-2 ${compact ? 'text-sm' : 'text-base'}`}>
        {!isRead && isRead !== undefined && (
          <span
            className="w-2 h-2 rounded-full bg-status-new flex-shrink-0"
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
      <p className={`text-text-secondary text-sm leading-relaxed mb-3 ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}>
        {article.summary || article.excerpt}
      </p>

      {/* Actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
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
            className="text-text-muted hover:text-text-secondary transition-colors text-sm"
            onClick={handleLinkClick}
          >
            Read Original →
          </a>
        </div>

        {/* Training controls */}
        {onFeedback && (
          <div className="flex items-center gap-1">
            <FeedbackButton
              active={feedback === 'up'}
              title="More like this"
              onClick={() => onFeedback(article, 'up')}
            >
              👍
            </FeedbackButton>
            <FeedbackButton
              active={feedback === 'down'}
              title="Less like this"
              onClick={() => onFeedback(article, 'down')}
            >
              👎
            </FeedbackButton>
            <FeedbackButton
              active={false}
              title="Not interested — hide and train"
              onClick={() => onFeedback(article, 'hide')}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </FeedbackButton>
          </div>
        )}
      </div>
    </Card>
  );
}

function FeedbackButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center justify-center w-7 h-7 rounded-md text-sm transition-colors ${
        active
          ? 'bg-accent-muted text-text-primary'
          : 'text-text-muted hover:bg-bg-elevated hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}
