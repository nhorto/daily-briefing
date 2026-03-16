'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';

interface IntelligenceCardProps {
  name: string;
  icon: string;
  summary: string;
  articleCount: number;
  articleIds: string[];
}

export default function IntelligenceCard({ name, icon, summary, articleCount, articleIds }: IntelligenceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);

    // Only fetch if we haven't already
    if (detail) return;

    setLoading(true);
    try {
      const response = await fetch('/api/intelligence/category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryName: name, articleIds }),
      });
      const data = await response.json();
      if (data.success) {
        setDetail(data.detail);
      } else {
        setDetail('Failed to load detailed summary.');
      }
    } catch {
      setDetail('Failed to load detailed summary.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card hover className="p-5 cursor-pointer" onClick={handleClick}>
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-text-primary">{name}</h3>
            <span className="text-xs text-text-muted font-mono">{articleCount}</span>
            <svg
              className={`w-4 h-4 text-text-muted ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">{summary}</p>

          {/* Expanded detail */}
          {expanded && (
            <div className="mt-4 pt-4 border-t border-border">
              {loading ? (
                <div className="space-y-2">
                  <div className="h-3 bg-bg-elevated rounded skeleton w-full" />
                  <div className="h-3 bg-bg-elevated rounded skeleton w-5/6" />
                  <div className="h-3 bg-bg-elevated rounded skeleton w-4/6" />
                  <div className="h-3 bg-bg-elevated rounded skeleton w-full" />
                  <div className="h-3 bg-bg-elevated rounded skeleton w-3/4" />
                </div>
              ) : detail ? (
                <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
                  {detail}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
