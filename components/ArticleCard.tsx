'use client';

import type { Article } from '@/lib/types';
import { formatRelativeTime, getFreshnessCategory } from '@/lib/utils/date';
import Card from '@/components/ui/Card';
import { getSourceColor } from '@/components/ui/SourcePill';

interface ArticleCardProps {
  article: Article;
}

export default function ArticleCard({ article }: ArticleCardProps) {
  const freshness = getFreshnessCategory(article.publishedAt);
  const sourceColor = getSourceColor(article.sourceName);

  return (
    <Card hover className="p-5">
      {/* Title */}
      <h3 className="text-base font-semibold text-text-primary mb-2">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-accent transition-colors"
        >
          {article.title}
        </a>
      </h3>

      {/* Metadata */}
      <div className="flex items-center gap-2 mb-3 text-sm">
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
        {freshness === 'fresh' && (
          <span className="w-1.5 h-1.5 rounded-full bg-status-new" title="Fresh" />
        )}
        {article.author && (
          <>
            <span className="text-text-muted">·</span>
            <span className="text-text-muted text-xs">{article.author}</span>
          </>
        )}
      </div>

      {/* Summary or Excerpt */}
      <p className="text-text-secondary text-sm leading-relaxed mb-4 line-clamp-3">
        {article.summary || article.excerpt}
      </p>

      {/* Actions */}
      <div className="flex gap-2">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-1.5 bg-accent text-bg-primary rounded-md hover:bg-accent-hover transition-colors text-sm font-medium"
        >
          Read Original
        </a>
      </div>
    </Card>
  );
}
