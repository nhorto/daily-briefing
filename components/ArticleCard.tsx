'use client';

import type { Article } from '@/lib/types';
import { formatRelativeTime, getFreshnessCategory } from '@/lib/utils/date';

interface ArticleCardProps {
  article: Article;
}

export default function ArticleCard({ article }: ArticleCardProps) {
  const freshness = getFreshnessCategory(article.publishedAt);

  const freshnessColors = {
    fresh: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    recent: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    old: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow">
      {/* Title */}
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          {article.title}
        </a>
      </h3>

      {/* Metadata */}
      <div className="flex items-center gap-2 mb-3 text-sm">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${freshnessColors[freshness]}`}>
          {article.sourceName}
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          {formatRelativeTime(article.publishedAt)}
        </span>
        {article.author && (
          <>
            <span className="text-gray-400">•</span>
            <span className="text-gray-600 dark:text-gray-400">{article.author}</span>
          </>
        )}
      </div>

      {/* Summary or Excerpt */}
      <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed mb-4">
        {article.summary || article.excerpt}
      </p>

      {/* Actions */}
      <div className="flex gap-2">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Read Original
        </a>
      </div>
    </div>
  );
}
