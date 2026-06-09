'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import type { Briefing, DailyIntelligence, Article, UserPreferences } from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import ArticleCard from '@/components/ArticleCard';
import ClusterCard from '@/components/ClusterCard';
import ChatPanel from '@/components/ChatPanel';
import Card from '@/components/ui/Card';
import { SkeletonPage } from '@/components/ui/Skeleton';
import { isMuted } from '@/lib/utils/personalization';
import {
  type FeedItem,
  buildFeedItems,
  feedItemArticles,
  feedItemKey,
  rankFeedItems,
} from '@/lib/utils/feed';

/** How many ranked picks the finite "Today" surface shows before "all caught up". */
const TOP_PICKS = 15;

export default function Home() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [intelligence, setIntelligence] = useState<DailyIntelligence | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [fitScores, setFitScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [briefingRes, intelligenceRes, prefsRes, profileRes] = await Promise.all([
          fetch('/api/briefing'),
          fetch('/api/intelligence'),
          fetch('/api/preferences'),
          fetch('/api/profile'),
        ]);

        const briefingData = await briefingRes.json();
        if (briefingRes.ok && briefingData.success) setBriefing(briefingData.briefing);

        const intelligenceData = await intelligenceRes.json();
        if (intelligenceRes.ok && intelligenceData.success) setIntelligence(intelligenceData.intelligence);

        const prefsData = await prefsRes.json();
        if (prefsRes.ok && prefsData.success) setPreferences(prefsData.preferences);

        const profileData = await profileRes.json();
        if (profileRes.ok && profileData.success && profileData.ready) {
          setFitScores(profileData.fit || {});
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const allArticles: Article[] = useMemo(
    () =>
      briefing
        ? [...briefing.clusters.flatMap((c) => c.articles), ...briefing.individualArticles]
        : [],
    [briefing]
  );

  // The finite, ranked "Top picks for today": engine-ranked, muted items removed,
  // capped at TOP_PICKS so the page ends with "you're all caught up".
  const topPicks: FeedItem[] = useMemo(() => {
    if (!briefing) return [];
    const items = buildFeedItems(briefing);
    const muted = preferences?.mutedKeywords ?? [];
    const visible =
      muted.length > 0
        ? items.filter((it) => feedItemArticles(it).some((a) => !isMuted(a, muted)))
        : items;
    const ranked = preferences ? rankFeedItems(visible, preferences, fitScores) : visible;
    return ranked.slice(0, TOP_PICKS);
  }, [briefing, preferences, fitScores]);

  // "Today in 5" — the day's biggest themes as bullets (most-covered first).
  const todayInFive = useMemo(() => {
    if (!intelligence?.categories?.length) return [];
    return [...intelligence.categories]
      .sort((a, b) => b.articleIds.length - a.articleIds.length)
      .slice(0, 5);
  }, [intelligence]);

  return (
    <DashboardLayout>
      {loading ? (
        <SkeletonPage />
      ) : !briefing ? (
        <EmptyState />
      ) : (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Today</h1>
            <p className="text-sm text-text-muted mt-1">
              {briefing.totalArticles} stories scanned across {briefing.totalSources} sources ·
              top {topPicks.length} for you
            </p>
          </div>

          {/* "Today in 5" — the day's themes as bullets, on top */}
          {(todayInFive.length > 0 || intelligence?.topStories) && (
            <Card className="p-6">
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                Today in {todayInFive.length > 0 ? todayInFive.length : 5}
              </h2>
              {todayInFive.length > 0 ? (
                <ul className="space-y-2.5">
                  {todayInFive.map((theme) => (
                    <li key={theme.name} className="flex gap-2.5 text-sm leading-relaxed">
                      <span className="flex-shrink-0">{theme.icon}</span>
                      <span className="text-text-secondary">
                        <span className="font-semibold text-text-primary">{theme.name}.</span>{' '}
                        {theme.summary}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
                  {intelligence?.topStories}
                </div>
              )}
            </Card>
          )}

          {/* Top picks — finite, numbered, ranked */}
          <div>
            <h2 className="text-sm font-semibold text-text-primary mb-3">Top picks</h2>
            <ol className="space-y-3">
              {topPicks.map((item, i) => (
                <li key={feedItemKey(item)} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 mt-1 rounded-full bg-bg-elevated text-text-muted text-xs font-mono font-semibold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    {item.kind === 'cluster' ? (
                      <ClusterCard cluster={item.cluster} />
                    ) : (
                      <ArticleCard article={item.article} />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* You're all caught up */}
          <div className="text-center py-6 border-t border-border">
            <div className="text-2xl mb-1">✓</div>
            <p className="text-sm text-text-secondary font-medium">That's the brief — you're all caught up.</p>
            <Link
              href="/briefing"
              className="inline-block mt-3 text-accent hover:text-accent-hover transition-colors text-sm font-medium"
            >
              Browse all {briefing.totalArticles} stories →
            </Link>
          </div>

          {/* Ask about today */}
          <ChatPanel mode="global" articles={allArticles} className="h-[500px]" />
        </div>
      )}
    </DashboardLayout>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-24">
      <div className="max-w-md text-center space-y-6">
        <div className="text-6xl">📭</div>
        <h2 className="text-2xl font-bold text-text-primary">No Briefing Yet</h2>
        <p className="text-text-secondary">
          Generate your first briefing to see today's top picks.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/briefing"
            className="px-6 py-3 bg-accent text-bg-primary rounded-lg hover:bg-accent-hover transition-colors font-medium"
          >
            Go to Briefing
          </Link>
          <Link
            href="/sources"
            className="px-6 py-3 bg-bg-elevated text-text-secondary rounded-lg hover:bg-bg-overlay hover:text-text-primary transition-colors font-medium"
          >
            Manage Sources
          </Link>
        </div>
      </div>
    </div>
  );
}
