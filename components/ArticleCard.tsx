'use client';

import Link from 'next/link';
import type { Article } from '@/lib/types';
import { formatRelativeTime, getFreshnessCategory } from '@/lib/utils/date';
import Card from '@/components/ui/Card';
import { getSourceColor } from '@/components/ui/SourcePill';

interface ArticleCardProps {
  article: Article;
  compact?: boolean;
  isRead?: boolean;
  onMarkRead?: (articleId: string) => void;
}

export default function ArticleCard({ article, compact = false, isRead, onMarkRead }: ArticleCardProps) {
  const freshness = getFreshnessCategory(article.publishedAt);
  const sourceColor = getSourceColor(article.sourceName);

  const handleLinkClick = () => {
    if (onMarkRead) {
      onMarkRead(article.id);
    }
  };

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
    </Card>
  );
}
