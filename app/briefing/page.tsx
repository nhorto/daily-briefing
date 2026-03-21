'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import type { Briefing, Article, UserPreferences, ArticleCategory } from '@/lib/types';
import { CATEGORY_META } from '@/lib/types';
import ArticleCard from '@/components/ArticleCard';
import ChatPanel from '@/components/ChatPanel';
import DashboardLayout from '@/components/DashboardLayout';
import SourceFilterSidebar from '@/components/SourceFilterSidebar';
import { SkeletonPage } from '@/components/ui/Skeleton';
import { sortByPreference } from '@/lib/utils/personalization';

export default function BriefingPage() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<ArticleCategory>>(new Set());
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [sortMode, setSortMode] = useState<'time' | 'personalized'>('time');

  useEffect(() => {
    fetchBriefing();
    fetchReadIds();
    fetchPreferences();
  }, []);

  async function fetchPreferences() {
    try {
      const response = await fetch('/api/preferences');
      const data = await response.json();
      if (data.success) {
        setPreferences(data.preferences);
      }
    } catch (err) {
      console.error('Failed to fetch preferences:', err);
    }
  }

  async function fetchBriefing() {
    try {
      setLoading(true);
      const response = await fetch('/api/briefing');
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch briefing');
      }

      setBriefing(data.briefing);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchReadIds() {
    try {
      const response = await fetch('/api/articles/read');
      const data = await response.json();
      if (data.success && data.readIds) {
        setReadIds(new Set(data.readIds));
      }
    } catch (err) {
      console.error('Failed to fetch read IDs:', err);
    }
  }

  async function regenerateBriefing() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/cron/aggregate', { method: 'POST' });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate briefing');
      }

      await fetchBriefing();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  // Flatten all articles from clusters + individual, sorted by time descending
  const allArticles: Article[] = useMemo(() => {
    if (!briefing) return [];
    const articles = [
      ...briefing.clusters.flatMap((c) => c.articles),
      ...briefing.individualArticles,
    ];
    return articles.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }, [briefing]);

  // Filtered articles based on selected sources and categories
  const filteredArticles = useMemo(() => {
    let articles = allArticles;

    if (selectedSources.size > 0) {
      articles = articles.filter((a) => selectedSources.has(a.sourceName));
    }

    if (selectedCategories.size > 0) {
      articles = articles.filter((a) => selectedCategories.has(a.category || 'other'));
    }

    // Apply sort mode
    if (sortMode === 'personalized' && preferences) {
      return sortByPreference(articles, preferences);
    }

    return articles;
  }, [allArticles, selectedSources, selectedCategories, sortMode, preferences]);

  // Get unique categories with counts for filter pills
  const categoryCounts = useMemo(() => {
    const counts = new Map<ArticleCategory, number>();
    for (const article of allArticles) {
      const cat = article.category || 'other';
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return counts;
  }, [allArticles]);

  const handleToggleSource = useCallback((sourceName: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(sourceName)) {
        next.delete(sourceName);
      } else {
        next.add(sourceName);
      }
      return next;
    });
  }, []);

  const handleClearFilters = useCallback(() => {
    setSelectedSources(new Set());
    setSelectedCategories(new Set());
  }, []);

  const handleToggleCategory = useCallback((category: ArticleCategory) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const handleMarkRead = useCallback(async (articleId: string) => {
    if (readIds.has(articleId)) return;

    // Optimistic update
    setReadIds((prev) => new Set([...prev, articleId]));

    try {
      await fetch('/api/articles/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId }),
      });
    } catch (err) {
      console.error('Failed to mark article as read:', err);
    }
  }, [readIds]);

  const handleMarkAllRead = useCallback(async () => {
    if (!briefing) return;

    const allArticleIds = allArticles.map((a) => a.id);

    // Optimistic update
    setReadIds(new Set(allArticleIds));

    try {
      await fetch('/api/articles/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleIds: allArticleIds }),
      });
    } catch (err) {
      console.error('Failed to mark all articles as read:', err);
    }
  }, [briefing, allArticles]);

  const unreadCount = allArticles.filter((a) => !readIds.has(a.id)).length;

  return (
    <DashboardLayout>
      {loading ? (
        <SkeletonPage />
      ) : error || !briefing ? (
        <div className="flex items-center justify-center px-4 py-24">
          <div className="max-w-md text-center">
            <div className="text-6xl mb-4">📭</div>
            <h2 className="text-2xl font-bold text-text-primary mb-2">
              No Briefing Available
            </h2>
            <p className="text-text-secondary mb-6">
              {error || 'No briefing has been generated for today yet.'}
            </p>
            <button
              onClick={regenerateBriefing}
              className="px-6 py-3 bg-accent text-bg-primary rounded-lg hover:bg-accent-hover transition-colors font-medium"
            >
              Generate Briefing Now
            </button>
          </div>
        </div>
      ) : (
        <div className="flex h-[calc(100vh-3.5rem)] max-w-7xl mx-auto">
          {/* Source Filter Sidebar */}
          <div className="w-48 flex-shrink-0 border-r border-border hidden md:block">
            <SourceFilterSidebar
              articles={allArticles}
              selectedSources={selectedSources}
              onToggleSource={handleToggleSource}
              onClearFilters={handleClearFilters}
            />
          </div>

          {/* Article Feed */}
          <div className="flex-1 overflow-y-auto min-w-0">
            <div className="px-4 sm:px-6 py-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-xl font-bold text-text-primary">
                    Today's Briefing
                  </h1>
                  <p className="text-text-muted text-sm mt-0.5">
                    {new Date(briefing.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                    {unreadCount > 0 && (
                      <span className="ml-2 text-status-new">{unreadCount} new</span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="px-3 py-1.5 bg-bg-elevated text-text-secondary rounded-lg hover:bg-bg-overlay hover:text-text-primary transition-colors text-sm font-medium"
                    >
                      Mark All Read
                    </button>
                  )}
                  <button
                    onClick={regenerateBriefing}
                    className="px-3 py-1.5 bg-bg-elevated text-text-secondary rounded-lg hover:bg-bg-overlay hover:text-text-primary transition-colors text-sm font-medium"
                  >
                    Regenerate
                  </button>
                </div>
              </div>

              {/* Sort toggle + Category filter pills */}
              <div className="mb-4 flex flex-wrap items-center gap-1.5">
                <div className="flex items-center gap-1 mr-3 border-r border-border pr-3">
                  <button
                    onClick={() => setSortMode('time')}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      sortMode === 'time'
                        ? 'bg-accent-muted text-text-primary'
                        : 'bg-bg-elevated text-text-secondary'
                    }`}
                  >
                    Newest First
                  </button>
                  <button
                    onClick={() => setSortMode('personalized')}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      sortMode === 'personalized'
                        ? 'bg-accent-muted text-text-primary'
                        : 'bg-bg-elevated text-text-secondary'
                    }`}
                  >
                    For You
                  </button>
                </div>
                {Array.from(categoryCounts.entries())
                  .sort(([, a], [, b]) => b - a)
                  .map(([category, count]) => (
                    <button
                      key={category}
                      onClick={() => handleToggleCategory(category)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        selectedCategories.has(category)
                          ? 'bg-accent-muted text-text-primary'
                          : 'bg-bg-elevated text-text-secondary'
                      }`}
                    >
                      {CATEGORY_META[category]?.icon} {CATEGORY_META[category]?.label} ({count})
                    </button>
                  ))}
              </div>

              {/* Mobile source filter */}
              <div className="md:hidden mb-4 flex flex-wrap gap-1.5">
                <button
                  onClick={handleClearFilters}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedSources.size === 0
                      ? 'bg-accent-muted text-text-primary'
                      : 'bg-bg-elevated text-text-secondary'
                  }`}
                >
                  All
                </button>
                {Array.from(new Set(allArticles.map((a) => a.sourceName))).map((name) => (
                  <button
                    key={name}
                    onClick={() => handleToggleSource(name)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      selectedSources.has(name)
                        ? 'bg-accent-muted text-text-primary'
                        : 'bg-bg-elevated text-text-secondary'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>

              {/* Article Feed */}
              {filteredArticles.length > 0 ? (
                <div className="space-y-3">
                  {filteredArticles.map((article) => (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      isRead={readIds.has(article.id)}
                      onMarkRead={handleMarkRead}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-text-secondary">
                    {selectedSources.size > 0
                      ? 'No articles match the selected sources.'
                      : 'No content found for today. Check back later!'}
                  </p>
                  {selectedSources.size > 0 && (
                    <button
                      onClick={handleClearFilters}
                      className="mt-3 text-accent hover:text-accent-hover transition-colors text-sm font-medium"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Chat Panel */}
          <div className="w-[380px] flex-shrink-0 border-l border-border hidden lg:block">
            <ChatPanel
              mode="briefing"
              articles={filteredArticles}
              className="h-full rounded-none border-0"
            />
          </div>
        </div>
      )}

      {/* Floating Chat Button - mobile/tablet */}
      {!loading && briefing && (
        <MobileChatButton articles={filteredArticles} />
      )}
    </DashboardLayout>
  );
}

function MobileChatButton({ articles }: { articles: Article[] }) {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-accent text-bg-primary rounded-full shadow-lg hover:bg-accent-hover transition-colors flex items-center justify-center text-xl lg:hidden"
        title="Open chat"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>

      {chatOpen && (
        <ChatPanel
          mode="briefing"
          articles={articles}
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
        />
      )}
    </>
  );
}
