'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Briefing, DailyIntelligence, Article } from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import StatsRow from '@/components/StatsRow';
import IntelligenceCard from '@/components/IntelligenceCard';
import ChatPanel from '@/components/ChatPanel';
import Card from '@/components/ui/Card';
import { SkeletonPage } from '@/components/ui/Skeleton';

export default function Home() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [intelligence, setIntelligence] = useState<DailyIntelligence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [briefingRes, intelligenceRes] = await Promise.all([
          fetch('/api/briefing'),
          fetch('/api/intelligence'),
        ]);

        const briefingData = await briefingRes.json();
        if (briefingRes.ok && briefingData.success) {
          setBriefing(briefingData.briefing);
        }

        const intelligenceData = await intelligenceRes.json();
        if (intelligenceRes.ok && intelligenceData.success) {
          setIntelligence(intelligenceData.intelligence);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const allArticles: Article[] = briefing
    ? [
        ...briefing.clusters.flatMap((c) => c.articles),
        ...briefing.individualArticles,
      ]
    : [];

  return (
    <DashboardLayout>
      {loading ? (
        <SkeletonPage />
      ) : !briefing ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 px-4 sm:px-6 py-6">
          {/* Left: Intelligence Summary (65%) */}
          <div className="flex-1 lg:w-[65%] min-w-0 space-y-6">
            {/* Stats Row */}
            <StatsRow
              totalArticles={briefing.totalArticles}
              totalSources={briefing.totalSources}
              totalClusters={briefing.totalClusters}
              generatedAt={briefing.generatedAt}
            />

            {/* Top Stories */}
            {intelligence?.topStories && (
              <Card className="p-5">
                <h2 className="text-base font-bold text-text-primary mb-3">
                  Today's Intelligence
                </h2>
                <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
                  {intelligence.topStories}
                </div>
              </Card>
            )}

            {/* Category Cards */}
            {intelligence?.categories && intelligence.categories.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {intelligence.categories.map((category) => (
                  <IntelligenceCard
                    key={category.name}
                    name={category.name}
                    icon={category.icon}
                    summary={category.summary}
                    articleCount={category.articleIds.length}
                  />
                ))}
              </div>
            )}

            {/* Fallback: if no intelligence but we have a briefing */}
            {!intelligence && briefing && (
              <Card className="p-5">
                <h2 className="text-base font-bold text-text-primary mb-3">
                  Today's Briefing
                </h2>
                <p className="text-sm text-text-secondary">
                  {briefing.totalArticles} articles from {briefing.totalSources} sources
                  across {briefing.totalClusters} topic clusters.
                </p>
              </Card>
            )}

            {/* View Full Briefing Link */}
            <Link
              href="/briefing"
              className="flex items-center justify-between w-full px-5 py-3 bg-bg-surface border border-border rounded-lg text-accent hover:bg-bg-elevated hover:border-border-hover transition-colors text-sm font-medium"
            >
              View Full Briefing
              <span>→</span>
            </Link>
          </div>

          {/* Right: Embedded Chat (35%) */}
          <div className="lg:w-[35%] lg:min-w-[320px] lg:max-w-[420px]">
            <div className="lg:sticky lg:top-20">
              <ChatPanel
                mode="global"
                articles={allArticles}
                className="h-[500px] lg:h-[calc(100vh-7rem)]"
              />
            </div>
          </div>
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
        <h2 className="text-2xl font-bold text-text-primary">
          No Briefing Yet
        </h2>
        <p className="text-text-secondary">
          Generate your first briefing to see the intelligence dashboard.
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
