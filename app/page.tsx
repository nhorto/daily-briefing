'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import Link from 'next/link';
import type { Briefing, DailyIntelligence, Article, UserPreferences } from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import ArticleCard from '@/components/ArticleCard';
import ClusterCard from '@/components/ClusterCard';
import ChatPanel from '@/components/ChatPanel';
import EngagementTracker from '@/components/EngagementTracker';
import Card from '@/components/ui/Card';
import { SkeletonPage } from '@/components/ui/Skeleton';
import { isMuted } from '@/lib/utils/personalization';
import { type FatigueInput, isImpressionExhausted } from '@/lib/utils/fatigue';
import { explainRanking } from '@/lib/utils/explain';
import {
  type FeedItem,
  buildFeedItems,
  feedItemArticles,
  feedItemKey,
  feedItemLead,
  feedItemTime,
  rankFeedItems,
} from '@/lib/utils/feed';
import { getTodayDateString } from '@/lib/utils/date';

/** How many ranked picks the finite "Today" surface shows before "all caught up". */
const TOP_PICKS = 15;

interface DashboardData {
  briefing: Briefing | null;
  intelligence: DailyIntelligence | null;
  preferences: UserPreferences | null;
  fitScores: Record<string, number>;
  fatigue: FatigueInput | null;
}

// Session cache of the Today data, keyed by date. Lives at module scope so it
// survives client-side navigation (the module stays loaded): navigating back to
// Today reuses it instantly — no refetch, no re-rank, no loading skeleton (and
// therefore no skeleton to wedge on). It's refreshed quietly in the background
// once older than the TTL, and cleared by a full page reload.
let dashboardCache: { date: string; at: number; data: DashboardData } | null = null;
const DASHBOARD_CACHE_TTL_MS = 60_000;

export default function Home() {
  const today = getTodayDateString();
  // Seed initial state from the session cache when we have today's data already,
  // so a return visit paints content immediately instead of a loading skeleton.
  const seed = dashboardCache?.date === today ? dashboardCache.data : null;

  const [briefing, setBriefing] = useState<Briefing | null>(seed?.briefing ?? null);
  const [intelligence, setIntelligence] = useState<DailyIntelligence | null>(seed?.intelligence ?? null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(seed?.preferences ?? null);
  const [fitScores, setFitScores] = useState<Record<string, number>>(seed?.fitScores ?? {});
  const [fatigue, setFatigue] = useState<FatigueInput | null>(seed?.fatigue ?? null);
  const [loading, setLoading] = useState(!seed);
  const [nudgeDismissed, setNudgeDismissed] = useState(true);
  // Mirror `loading` into a ref so a plain timer (outside React's commit cycle)
  // can read the latest value — see the recovery watchdog below.
  const loadingRef = useRef(!seed);
  loadingRef.current = loading;
  // Which "Today in 5" theme is expanded to show the stories behind it (#18).
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);
  // Articles the user tapped "Less like this" on this session — flips the
  // why-chip to a confirmation without yanking the list out from under them.
  const [tunedDown, setTunedDown] = useState<Set<string>>(new Set());

  // "Less like this" from a Top pick's why-chip — a fast, transparent tuning
  // path (Phase 5 #29). Fires a 'down' signal on the lead article (lowering its
  // topic + source and pushing the semantic profile away); takes effect on the
  // next load so the current list stays put.
  async function tuneLess(article: Article) {
    setTunedDown((prev) => new Set(prev).add(article.id));
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId: article.id,
          signal: 'down',
          category: article.category,
          sourceName: article.sourceName,
        }),
      });
    } catch {
      // best-effort — the confirmation already showed; revert on failure.
      setTunedDown((prev) => {
        const next = new Set(prev);
        next.delete(article.id);
        return next;
      });
    }
  }

  // First-run nudge: show the onboarding banner only until it's completed or
  // dismissed (persisted, so it doesn't nag across visits).
  useEffect(() => {
    try {
      setNudgeDismissed(localStorage.getItem('onboarding-nudge-dismissed') === '1');
    } catch {
      setNudgeDismissed(false);
    }
  }, []);

  function dismissNudge() {
    setNudgeDismissed(true);
    try {
      localStorage.setItem('onboarding-nudge-dismissed', '1');
    } catch {
      // best-effort
    }
  }

  useEffect(() => {
    // Already have today's data cached and still fresh → reuse it, no refetch.
    // (When stale we still refetch below, but quietly — the content is already
    // on screen from the cache, so there's no skeleton and nothing to wedge on.)
    if (dashboardCache?.date === today && Date.now() - dashboardCache.at < DASHBOARD_CACHE_TTL_MS) {
      return;
    }

    // Guard against applying results to a render React has discarded mid
    // client-side navigation — without it a stale resolution can race the live
    // mount and the page can wedge on its loading skeleton.
    let cancelled = false;

    async function fetchData() {
      try {
        const [briefingRes, intelligenceRes, prefsRes, profileRes, signalsRes] = await Promise.all([
          fetch('/api/briefing'),
          fetch('/api/intelligence'),
          fetch('/api/preferences'),
          fetch('/api/profile'),
          fetch('/api/signals'),
        ]);
        if (cancelled) return;

        const briefingData = await briefingRes.json();
        const intelligenceData = await intelligenceRes.json();
        const prefsData = await prefsRes.json();
        const profileData = await profileRes.json();
        const signalsData = await signalsRes.json();
        if (cancelled) return;

        const nextBriefing = briefingRes.ok && briefingData.success ? (briefingData.briefing as Briefing) : null;
        const nextIntelligence = intelligenceRes.ok && intelligenceData.success ? (intelligenceData.intelligence as DailyIntelligence) : null;
        const nextPreferences = prefsRes.ok && prefsData.success ? (prefsData.preferences as UserPreferences) : null;
        const nextFit = profileRes.ok && profileData.success && profileData.ready ? (profileData.fit || {}) : null;
        const nextFatigue: FatigueInput | null = signalsRes.ok && signalsData.success
          ? { impressions: signalsData.impressions ?? {}, engaged: new Set<string>(signalsData.engaged ?? []) }
          : null;

        // Only overwrite where we actually got data, so a transient failure
        // doesn't blank a good value (or a good cached one).
        if (nextBriefing) setBriefing(nextBriefing);
        if (nextIntelligence) setIntelligence(nextIntelligence);
        if (nextPreferences) setPreferences(nextPreferences);
        if (nextFit) setFitScores(nextFit);
        if (nextFatigue) setFatigue(nextFatigue);

        // Refresh the session cache, falling back to the previous cache for any
        // field that didn't come back this round.
        const prev = dashboardCache?.date === today ? dashboardCache.data : null;
        dashboardCache = {
          date: today,
          at: Date.now(),
          data: {
            briefing: nextBriefing ?? prev?.briefing ?? null,
            intelligence: nextIntelligence ?? prev?.intelligence ?? null,
            preferences: nextPreferences ?? prev?.preferences ?? null,
            fitScores: nextFit ?? prev?.fitScores ?? {},
            fatigue: nextFatigue ?? prev?.fatigue ?? null,
          },
        };
      } catch (error) {
        if (!cancelled) console.error('Failed to fetch dashboard data:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [today]);

  // Recovery watchdog. A client-side navigation back to this page can land on
  // the loading skeleton and stay wedged: React stops committing updates to this
  // tree for several seconds, so the fetch's `setLoading(false)` never takes —
  // and a state-based retry can't help because its update is dropped the same
  // way. The reliable escape is a mechanism outside React's commit cycle: a
  // plain timer that reads `loadingRef` and, if still stuck, does a one-time
  // full reload (a fresh document always loads cleanly). sessionStorage-guarded
  // so it can never loop.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loadingRef.current) return; // loaded fine — nothing to do
      try {
        if (sessionStorage.getItem('today-recovery-reload') === '1') return;
        sessionStorage.setItem('today-recovery-reload', '1');
      } catch {
        return; // no sessionStorage — skip rather than risk a reload loop
      }
      window.location.reload();
    }, 7000);
    return () => clearTimeout(timer);
  }, []);

  // Clear the one-time reload guard once we've successfully loaded, so a future
  // wedged navigation can recover again.
  useEffect(() => {
    if (loading) return;
    try {
      sessionStorage.removeItem('today-recovery-reload');
    } catch {
      // best-effort
    }
  }, [loading]);

  const allArticles: Article[] = useMemo(
    () =>
      briefing
        ? [...briefing.clusters.flatMap((c) => c.articles), ...briefing.individualArticles]
        : [],
    [briefing]
  );

  // article id → article, so a "Today in 5" theme can resolve the stories behind it.
  const articlesById = useMemo(() => {
    const map = new Map<string, Article>();
    for (const a of allArticles) map.set(a.id, a);
    return map;
  }, [allArticles]);

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
    // Drop items the LLM-as-editor smell test flagged (Phase 4) and items shown
    // so many times unengaged they're exhausted (Phase 5). Both stay in Browse —
    // Today is the curated surface, so we only trim it here.
    const curated = visible.filter((it) => {
      const lead = feedItemLead(it);
      if (lead.editorial?.drop) return false;
      if (fatigue && isImpressionExhausted(fatigue.impressions[lead.id] ?? 0, fatigue.engaged.has(lead.id)))
        return false;
      return true;
    });
    const ranked = preferences
      ? rankFeedItems(curated, preferences, fitScores, { fatigue: fatigue ?? undefined })
      : curated;
    return ranked.slice(0, TOP_PICKS);
  }, [briefing, preferences, fitScores, fatigue]);

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

          {/* First-run onboarding nudge */}
          {preferences && !preferences.onboardedAt && !nudgeDismissed && (
            <Card className="p-4 flex items-center justify-between gap-3 border-accent/40">
              <div className="text-sm text-text-secondary">
                <span className="font-semibold text-text-primary">Tune your briefing.</span>{' '}
                Tell it what you care about so Today gets sharper.
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <Link
                  href="/onboarding"
                  className="text-sm font-medium text-accent hover:text-accent-hover transition-colors"
                >
                  Set up →
                </Link>
                <button
                  type="button"
                  onClick={dismissNudge}
                  aria-label="Dismiss"
                  className="text-text-muted hover:text-text-primary transition-colors text-sm"
                >
                  ✕
                </button>
              </div>
            </Card>
          )}

          {/* "Today in 5" — the day's themes as bullets, on top */}
          {(todayInFive.length > 0 || intelligence?.topStories) && (
            <Card className="p-6">
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                Today in {todayInFive.length > 0 ? todayInFive.length : 5}
              </h2>
              {todayInFive.length > 0 ? (
                <ul className="space-y-1">
                  {todayInFive.map((theme) => {
                    const stories = theme.articleIds
                      .map((id) => articlesById.get(id))
                      .filter((a): a is Article => Boolean(a));
                    const open = expandedTheme === theme.name;
                    return (
                      <li key={theme.name}>
                        <button
                          type="button"
                          onClick={() => setExpandedTheme(open ? null : theme.name)}
                          aria-expanded={open}
                          className="w-full flex gap-2.5 text-sm leading-relaxed text-left py-1.5 group"
                        >
                          <span className="flex-shrink-0">{theme.icon}</span>
                          <span className="text-text-secondary flex-1">
                            <span className="font-semibold text-text-primary">{theme.name}.</span>{' '}
                            {theme.summary}
                            {stories.length > 0 && (
                              <span className="text-text-muted whitespace-nowrap">
                                {' '}
                                <span className="text-accent group-hover:text-accent-hover transition-colors font-medium">
                                  {open ? 'Hide' : `${stories.length} ${stories.length === 1 ? 'story' : 'stories'}`}
                                </span>{' '}
                                <span className="inline-block transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
                              </span>
                            )}
                          </span>
                        </button>
                        {open && stories.length > 0 && (
                          <ul className="mt-1 mb-2 ml-7 space-y-1.5 border-l border-border pl-3">
                            {stories.map((a) => (
                              <li key={a.id} className="text-sm">
                                <Link
                                  href={`/article/${a.id}`}
                                  className="text-text-secondary hover:text-accent transition-colors line-clamp-1"
                                >
                                  {a.title}
                                </Link>
                                <span className="text-xs text-text-muted">{a.sourceName}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
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
              {topPicks.map((item, i) => {
                const lead = feedItemLead(item);
                const articles = feedItemArticles(item);
                const fits = articles
                  .map((a) => fitScores[a.id])
                  .filter((x): x is number => typeof x === 'number');
                const reason = preferences
                  ? explainRanking({
                      category: lead.category ?? 'other',
                      sourceName: lead.sourceName,
                      sourceCount: new Set(articles.map((a) => a.sourceName)).size,
                      ageHours: (Date.now() - feedItemTime(item)) / 3_600_000,
                      fit: fits.length > 0 ? Math.max(...fits) : undefined,
                      preferences,
                    })
                  : null;
                const tuned = tunedDown.has(lead.id);
                return (
                  <li key={feedItemKey(item)} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 mt-1 rounded-full bg-bg-elevated text-text-muted text-xs font-mono font-semibold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <EngagementTracker
                        articleId={lead.id}
                        rank={i + 1}
                        category={lead.category}
                        sourceName={lead.sourceName}
                      >
                        {item.kind === 'cluster' ? (
                          <ClusterCard cluster={item.cluster} />
                        ) : (
                          <ArticleCard article={item.article} />
                        )}
                      </EngagementTracker>
                      {/* Why you're seeing this + a fast tuning path (Phase 5) */}
                      {reason && (
                        <div className="flex items-center gap-2 mt-1.5 px-1 text-xs text-text-muted">
                          {tuned ? (
                            <span className="text-status-new">Got it — we'll show less like this</span>
                          ) : (
                            <>
                              <span className="truncate">{reason.label}</span>
                              <span className="text-text-muted/50">·</span>
                              <button
                                type="button"
                                onClick={() => tuneLess(lead)}
                                className="flex-shrink-0 text-text-muted hover:text-text-secondary transition-colors font-medium"
                              >
                                Less like this
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
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
