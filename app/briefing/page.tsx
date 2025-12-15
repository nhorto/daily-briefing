'use client';

import { useEffect, useState } from 'react';
import type { Briefing, Article } from '@/lib/types';
import ClusterCard from '@/components/ClusterCard';
import ArticleCard from '@/components/ArticleCard';
import ChatPanel from '@/components/ChatPanel';
import { getTodayDateString } from '@/lib/utils/date';

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

      // Fetch the newly generated briefing
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

  // Get all articles for chat context
  const allArticles: Article[] = briefing
    ? [
        ...briefing.clusters.flatMap((c) => c.articles),
        ...briefing.individualArticles,
      ]
    : [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading briefing...</p>
        </div>
      </div>
    );
  }

  if (error || !briefing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <div className="text-6xl mb-4">📭</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            No Briefing Available
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {error || 'No briefing has been generated for today yet.'}
          </p>
          <button
            onClick={regenerateBriefing}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Generate Briefing Now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                Daily Briefing
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
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
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
            >
              Regenerate
            </button>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">
              {briefing.totalArticles} new items from {briefing.totalSources} sources
            </span>
            {briefing.totalClusters > 0 && (
              <>
                <span>•</span>
                <span>{briefing.totalClusters} topic clusters</span>
              </>
            )}
          </div>

          {/* Global Chat Bar */}
          <div className="mt-4">
            <button
              onClick={handleOpenGlobalChat}
              className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-left text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              🔍 Ask about today's content...
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Topic Clusters */}
        {briefing.clusters.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              📊 Topic Clusters ({briefing.clusters.length})
            </h2>
            <div className="space-y-6">
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
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              📄 Individual Articles ({briefing.individualArticles.length})
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
            <p className="text-gray-600 dark:text-gray-400">
              No content found for today. Check back later!
            </p>
          </div>
        )}
      </main>

      {/* Chat Panel */}
      <ChatPanel
        articles={allArticles}
        clusterId={chatClusterId}
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
      />

      {/* Floating Chat Button */}
      <button
        onClick={handleOpenGlobalChat}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors flex items-center justify-center text-2xl"
        title="Open chat"
      >
        💬
      </button>
    </div>
  );
}
