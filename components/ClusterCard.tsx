'use client';

import { useState } from 'react';
import type { Cluster } from '@/lib/types';
import { formatRelativeTime, getFreshnessCategory } from '@/lib/utils/date';

interface ClusterCardProps {
  cluster: Cluster;
  onAskAboutTopic?: (clusterId: string) => void;
}

export default function ClusterCard({ cluster, onAskAboutTopic }: ClusterCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAskAboutTopic = () => {
    if (onAskAboutTopic) {
      onAskAboutTopic(cluster.id);
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🔥</span>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {cluster.title}
            </h3>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">{cluster.articles.length} articles</span>
            <span>•</span>
            <span>{Math.round(cluster.avgSimilarity * 100)}% similarity</span>
          </div>
        </div>
      </div>

      {/* Sources */}
      <div className="mb-4">
        <div className="flex flex-wrap gap-2">
          {cluster.articles.slice(0, 5).map((article, index) => {
            const freshness = getFreshnessCategory(article.publishedAt);
            const badgeColor =
              freshness === 'fresh'
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : freshness === 'recent'
                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';

            return (
              <span
                key={article.id}
                className={`px-2 py-1 rounded text-xs font-medium ${badgeColor}`}
              >
                {article.sourceName}
              </span>
            );
          })}
          {cluster.articles.length > 5 && (
            <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
              +{cluster.articles.length - 5} more
            </span>
          )}
        </div>
      </div>

      {/* Summary */}
      <p className="text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
        {cluster.summary}
      </p>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          {isExpanded ? 'Hide' : 'View All'} {cluster.articles.length} Articles
        </button>
        <button
          onClick={handleAskAboutTopic}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
        >
          Ask About This Topic
        </button>
      </div>

      {/* Expanded Articles List */}
      {isExpanded && (
        <div className="mt-6 space-y-3 pt-6 border-t border-gray-200 dark:border-gray-700">
          {cluster.articles.map((article) => (
            <div key={article.id} className="flex items-start gap-3">
              <div className="flex-1">
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  {article.title}
                </a>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {article.sourceName} • {formatRelativeTime(article.publishedAt)}
                </div>
              </div>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
              >
                Read →
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
