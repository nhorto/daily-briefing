'use client';

import { useState } from 'react';
import type { Cluster } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils/date';
import Card from '@/components/ui/Card';
import SourcePill from '@/components/ui/SourcePill';

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
    <Card className="p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <h3 className="text-base font-semibold text-text-primary mb-1">
            {cluster.title}
          </h3>
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <span className="font-mono">{cluster.articles.length}</span>
            <span>articles</span>
            <span>·</span>
            <span className="font-mono">{Math.round(cluster.avgSimilarity * 100)}%</span>
            <span>similarity</span>
          </div>
        </div>
      </div>

      {/* Sources */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {cluster.articles.slice(0, 5).map((article) => (
          <SourcePill key={article.id} name={article.sourceName} />
        ))}
        {cluster.articles.length > 5 && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-bg-elevated text-text-muted">
            +{cluster.articles.length - 5} more
          </span>
        )}
      </div>

      {/* Summary */}
      <p className="text-text-secondary text-sm leading-relaxed mb-4">
        {cluster.summary}
      </p>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="px-4 py-2 bg-accent text-bg-primary rounded-md hover:bg-accent-hover transition-colors text-sm font-medium"
        >
          {isExpanded ? 'Hide' : 'View All'} {cluster.articles.length} Articles
        </button>
        <button
          onClick={handleAskAboutTopic}
          className="px-4 py-2 bg-bg-elevated text-text-secondary rounded-md hover:bg-bg-overlay hover:text-text-primary transition-colors text-sm font-medium"
        >
          Ask About This Topic
        </button>
      </div>

      {/* Expanded Articles List */}
      {isExpanded && (
        <div className="mt-5 space-y-2 pt-5 border-t border-border">
          {cluster.articles.map((article) => (
            <div key={article.id} className="flex items-start gap-3 py-1.5">
              <div className="flex-1 min-w-0">
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent hover:text-accent-hover transition-colors font-medium"
                >
                  {article.title}
                </a>
                <div className="text-xs text-text-muted mt-0.5">
                  {article.sourceName} · {formatRelativeTime(article.publishedAt)}
                </div>
              </div>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:text-accent-hover transition-colors whitespace-nowrap"
              >
                Read →
              </a>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
