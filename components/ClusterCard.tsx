'use client';

import { useState } from 'react';
import type { Cluster, FeedbackSignal } from '@/lib/types';
import { CATEGORY_META } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils/date';
import Card from '@/components/ui/Card';
import SourcePill from '@/components/ui/SourcePill';
import FeedbackControls from '@/components/ui/FeedbackControls';

interface ClusterCardProps {
  cluster: Cluster;
  isRead?: boolean;
  onAskAboutTopic?: (clusterId: string) => void;
  /** Current training signal for this cluster, if any. */
  feedback?: FeedbackSignal;
  /** Train the model from this cluster (applied to its representative article). */
  onFeedback?: (cluster: Cluster, signal: FeedbackSignal) => void;
  /** Mark every article in the cluster as read. */
  onMarkRead?: (cluster: Cluster) => void;
}

export default function ClusterCard({
  cluster,
  isRead,
  onAskAboutTopic,
  feedback,
  onFeedback,
  onMarkRead,
}: ClusterCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const sourceCount = new Set(cluster.articles.map((a) => a.sourceName)).size;
  const categoryMeta = cluster.representativeArticle.category
    ? CATEGORY_META[cluster.representativeArticle.category]
    : null;

  // Collapsed "not interested" state — keeps the action reversible in-session.
  if (feedback === 'hide') {
    return (
      <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-bg-surface border border-border text-xs text-text-muted">
        <span className="truncate">Not interested · {cluster.title}</span>
        {onFeedback && (
          <button
            type="button"
            onClick={() => onFeedback(cluster, 'hide')}
            className="text-accent hover:text-accent-hover transition-colors font-medium flex-shrink-0 ml-3"
          >
            Undo
          </button>
        )}
      </div>
    );
  }

  return (
    <Card className={`p-5 ${isRead ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          {/* Meta: category tag + "covered by N sources" badge */}
          <div className="flex items-center gap-2 mb-2 text-xs">
            {categoryMeta && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-bg-elevated text-text-secondary font-medium">
                <span aria-hidden="true">{categoryMeta.icon}</span>
                <span>{categoryMeta.label}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-muted text-accent font-medium">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M9 7a3 3 0 116 0v3a3 3 0 11-6 0V7z" />
              </svg>
              {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
            </span>
          </div>
          <h3 className="text-base font-semibold text-text-primary">
            {cluster.title}
          </h3>
        </div>
        {cluster.representativeArticle.imageUrl && (
          <img
            src={cluster.representativeArticle.imageUrl}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
            className="w-20 h-20 object-cover rounded-lg ring-1 ring-border flex-shrink-0 hidden sm:block bg-bg-elevated"
          />
        )}
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-4 py-2 bg-accent text-bg-primary rounded-md hover:bg-accent-hover transition-colors text-sm font-medium"
          >
            {isExpanded ? 'Hide' : 'View All'} {cluster.articles.length} Articles
          </button>
          {onAskAboutTopic && (
            <button
              type="button"
              onClick={() => onAskAboutTopic(cluster.id)}
              className="px-4 py-2 bg-bg-elevated text-text-secondary rounded-md hover:bg-bg-overlay hover:text-text-primary transition-colors text-sm font-medium"
            >
              Ask About This Topic
            </button>
          )}
        </div>
        {onFeedback && (
          <FeedbackControls value={feedback} onChange={(s) => onFeedback(cluster, s)} />
        )}
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
                  onClick={() => onMarkRead?.(cluster)}
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
                onClick={() => onMarkRead?.(cluster)}
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
