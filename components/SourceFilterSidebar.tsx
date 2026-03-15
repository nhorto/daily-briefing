'use client';

import { useMemo } from 'react';
import type { Article } from '@/lib/types';
import { getSourceColor } from '@/components/ui/SourcePill';

interface SourceFilterSidebarProps {
  articles: Article[];
  selectedSources: Set<string>;
  onToggleSource: (sourceName: string) => void;
  onClearFilters: () => void;
}

export default function SourceFilterSidebar({
  articles,
  selectedSources,
  onToggleSource,
  onClearFilters,
}: SourceFilterSidebarProps) {
  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const article of articles) {
      counts.set(article.sourceName, (counts.get(article.sourceName) || 0) + 1);
    }
    // Sort by count descending
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [articles]);

  const filteredCount = selectedSources.size > 0
    ? articles.filter((a) => selectedSources.has(a.sourceName)).length
    : articles.length;

  return (
    <div className="sticky top-[3.5rem] h-[calc(100vh-3.5rem)] overflow-y-auto py-4 px-3">
      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 px-1">
        Sources
      </h3>

      {/* All Sources */}
      <button
        onClick={onClearFilters}
        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors mb-1 ${
          selectedSources.size === 0
            ? 'bg-accent-muted text-text-primary font-medium'
            : 'text-text-secondary hover:bg-bg-elevated'
        }`}
      >
        <span>All Sources</span>
        <span className="text-xs text-text-muted font-mono">{articles.length}</span>
      </button>

      <div className="h-px bg-border my-2" />

      {/* Individual Sources */}
      <div className="space-y-0.5">
        {sourceCounts.map(([name, count]) => {
          const isActive = selectedSources.has(name);
          const color = getSourceColor(name);
          return (
            <button
              key={name}
              onClick={() => onToggleSource(name)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-accent-muted text-text-primary font-medium'
                  : 'text-text-secondary hover:bg-bg-elevated'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="flex-1 text-left truncate">{name}</span>
              <span className="text-xs text-text-muted font-mono">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Active filter count */}
      {selectedSources.size > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-text-muted px-1">
            Showing <span className="font-mono text-text-secondary">{filteredCount}</span> of{' '}
            <span className="font-mono text-text-secondary">{articles.length}</span> articles
          </p>
        </div>
      )}
    </div>
  );
}
