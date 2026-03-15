'use client';

import { useEffect, useState } from 'react';
import type { Briefing, Article } from '@/lib/types';
import ClusterCard from '@/components/ClusterCard';
import ArticleCard from '@/components/ArticleCard';
import ChatPanel from '@/components/ChatPanel';
import DashboardLayout from '@/components/DashboardLayout';
import StatCard from '@/components/ui/StatCard';
import { SkeletonPage } from '@/components/ui/Skeleton';

export default function BriefingPage() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatClusterId, setChatClusterId] = useState<string | undefined>();

  useEffect(() => {
    fetchBriefing();
  }, []);

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

  async function regenerateBriefing() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/cron/aggregate', {
        method: 'POST',
      });

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

  function handleAskAboutTopic(clusterId: string) {
    setChatClusterId(clusterId);
    setChatOpen(true);
  }

  function handleOpenGlobalChat() {
    setChatClusterId(undefined);
    setChatOpen(true);
  }

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
        <div className="px-4 sm:px-6 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">
                Today's Briefing
              </h1>
              <p className="text-text-muted text-sm mt-1">
                {new Date(briefing.date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
            <button
              onClick={regenerateBriefing}
              className="px-4 py-2 bg-bg-elevated text-text-secondary rounded-lg hover:bg-bg-overlay hover:text-text-primary transition-colors text-sm font-medium"
            >
              Regenerate
            </button>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard value={briefing.totalArticles} label="Articles" />
            <StatCard value={briefing.totalSources} label="Sources" />
            <StatCard value={briefing.totalClusters} label="Clusters" />
            <StatCard
              value={new Date(briefing.generatedAt).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })}
              label="Generated"
            />
          </div>

          {/* Global Chat Bar */}
          <button
            onClick={handleOpenGlobalChat}
            className="w-full px-4 py-3 bg-bg-surface border border-border rounded-lg text-left text-text-muted hover:bg-bg-elevated hover:border-border-hover transition-colors mb-8"
          >
            Ask about today's content...
          </button>

          {/* Topic Clusters */}
          {briefing.clusters.length > 0 && (
            <section className="mb-10">
              <h2 className="text-lg font-bold text-text-primary mb-4">
                Topic Clusters ({briefing.clusters.length})
              </h2>
              <div className="space-y-4">
                {briefing.clusters.map((cluster) => (
                  <ClusterCard
                    key={cluster.id}
                    cluster={cluster}
                    onAskAboutTopic={handleAskAboutTopic}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Individual Articles */}
          {briefing.individualArticles.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-text-primary mb-4">
                Individual Articles ({briefing.individualArticles.length})
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                {briefing.individualArticles.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>
            </section>
          )}

          {/* Empty State */}
          {briefing.clusters.length === 0 && briefing.individualArticles.length === 0 && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📭</div>
              <p className="text-text-secondary">
                No content found for today. Check back later!
              </p>
            </div>
          )}
        </div>
      )}

      {/* Chat Panel */}
      <ChatPanel
        mode="briefing"
        articles={allArticles}
        clusterId={chatClusterId}
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
      />

      {/* Floating Chat Button */}
      {!loading && briefing && (
        <button
          onClick={handleOpenGlobalChat}
          className="fixed bottom-6 right-6 w-14 h-14 bg-accent text-bg-primary rounded-full shadow-lg hover:bg-accent-hover transition-colors flex items-center justify-center text-xl"
          title="Open chat"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      )}
    </DashboardLayout>
  );
}
