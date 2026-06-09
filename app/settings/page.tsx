'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ArticleCategory, Source, UserPreferences } from '@/lib/types';
import { CATEGORY_META, DEFAULT_PREFERENCES } from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import Card from '@/components/ui/Card';
import { SkeletonPage } from '@/components/ui/Skeleton';

const CATEGORIES = Object.keys(CATEGORY_META) as ArticleCategory[];

export default function SettingsPage() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetchPreferences();
    fetchSources();
  }, []);

  async function fetchPreferences() {
    try {
      const response = await fetch('/api/preferences');
      const data = await response.json();
      if (data.success) {
        setPreferences(data.preferences);
      }
    } catch (error) {
      console.error('Failed to fetch preferences:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSources() {
    try {
      const response = await fetch('/api/sources');
      const data = await response.json();
      if (data.success) {
        setSources((data.sources as Source[]).filter((s) => s.isActive));
      }
    } catch (error) {
      console.error('Failed to fetch sources:', error);
    }
  }

  async function handleSave() {
    if (!preferences) return;

    setSaving(true);
    setSaved(false);

    try {
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interests: preferences.interests,
          sources: preferences.sources,
          mutedKeywords: preferences.mutedKeywords,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setPreferences(data.preferences);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (error) {
      console.error('Failed to save preferences:', error);
    } finally {
      setSaving(false);
    }
  }

  // Muted keywords auto-persist on add/remove (the "mute it now" mental model),
  // independent of the Save button used for the weight sliders.
  async function persistMutedKeywords(next: string[]) {
    if (!preferences) return;
    setPreferences({ ...preferences, mutedKeywords: next }); // optimistic
    try {
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interests: preferences.interests,
          sources: preferences.sources,
          mutedKeywords: next,
        }),
      });
      const data = await response.json();
      if (data.success) setPreferences(data.preferences);
    } catch (error) {
      console.error('Failed to update muted keywords:', error);
    }
  }

  function handleAddKeyword() {
    const keyword = keywordInput.trim().toLowerCase();
    setKeywordInput('');
    if (!keyword || !preferences) return;
    if (preferences.mutedKeywords.includes(keyword)) return;
    persistMutedKeywords([...preferences.mutedKeywords, keyword]);
  }

  function handleRemoveKeyword(keyword: string) {
    if (!preferences) return;
    persistMutedKeywords(preferences.mutedKeywords.filter((k) => k !== keyword));
  }

  async function handleResetLearning() {
    if (!preferences) return;
    setSaving(true);
    setSaved(false);
    try {
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interests: preferences.interests, sources: {} }),
      });
      const data = await response.json();
      if (data.success) {
        setPreferences(data.preferences);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (error) {
      console.error('Failed to reset learning:', error);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setPreferences({
      ...DEFAULT_PREFERENCES,
      updatedAt: new Date().toISOString(),
    });
    setSaved(false);
  }

  // The full escape hatch: forget everything the engine learned (semantic
  // profile, behavioral signals, per-article feedback, learned weights) and fall
  // back to the stated onboarding baseline. Keeps muted keywords + onboarding.
  async function handleResetEverything() {
    if (
      !confirm(
        'Reset everything the briefing has learned about you?\n\nThis clears the semantic interest profile, your 👍/👎 history, reading/engagement signals, and learned source weights — back to your onboarding choices. Muted keywords and onboarding interests are kept. This cannot be undone.'
      )
    )
      return;
    setResetting(true);
    setSaved(false);
    try {
      const response = await fetch('/api/preferences/reset', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        setPreferences(data.preferences);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (error) {
      console.error('Failed to reset personalization:', error);
    } finally {
      setResetting(false);
    }
  }

  function handleSliderChange(category: ArticleCategory, value: number) {
    if (!preferences) return;
    setPreferences({
      ...preferences,
      interests: {
        ...preferences.interests,
        [category]: value,
      },
    });
    setSaved(false);
  }

  function handleSourceSliderChange(sourceName: string, value: number) {
    if (!preferences) return;
    setPreferences({
      ...preferences,
      sources: {
        ...preferences.sources,
        [sourceName]: value,
      },
    });
    setSaved(false);
  }

  return (
    <DashboardLayout>
      {loading ? (
        <SkeletonPage />
      ) : (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Settings</h1>
            <p className="text-sm text-text-secondary mt-1">
              Set category weights here, or train your briefing directly with 👍 / 👎 / Not
              interested on each article. Higher weights surface those topics first.
            </p>
          </div>

          {/* Sources — lives under Settings (configuration, not a daily destination) */}
          <Link
            href="/sources"
            className="flex items-center justify-between w-full px-5 py-4 bg-bg-surface border border-border rounded-lg hover:bg-bg-elevated hover:border-border-hover transition-colors"
          >
            <span>
              <span className="block text-base font-bold text-text-primary">Sources</span>
              <span className="block text-sm text-text-secondary mt-0.5">
                Add, remove, and check the health of your content sources.
              </span>
            </span>
            <span className="text-accent">→</span>
          </Link>

          <Card className="p-6">
            <h2 className="text-base font-bold text-text-primary mb-5">
              Interest Preferences
            </h2>

            <div className="space-y-5">
              {CATEGORIES.map((category) => {
                const meta = CATEGORY_META[category];
                const value = preferences?.interests[category] ?? 50;

                return (
                  <div key={category} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-text-primary flex items-center gap-2">
                        <span>{meta.icon}</span>
                        <span>{meta.label}</span>
                      </label>
                      <span className="text-sm font-mono text-text-muted w-8 text-right">
                        {value}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={value}
                      onChange={(e) => handleSliderChange(category, Number(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-bg-elevated accent-accent"
                    />
                    <div className="flex justify-between text-[10px] text-text-muted">
                      <span>Not interested</span>
                      <span>Neutral</span>
                      <span>Very interested</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-8 pt-5 border-t border-border">
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm font-medium text-text-secondary bg-bg-elevated rounded-lg hover:bg-bg-overlay hover:text-text-primary transition-colors"
              >
                Reset to Defaults
              </button>

              <div className="flex items-center gap-3">
                {saved && (
                  <span className="text-sm text-green-400">Saved</span>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 text-sm font-medium text-bg-primary bg-accent rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </Card>

          {/* Source preferences */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold text-text-primary">
                Source Preferences
              </h2>
              {Object.keys(preferences?.sources ?? {}).length > 0 && (
                <button
                  onClick={handleResetLearning}
                  disabled={saving}
                  className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                >
                  Reset to neutral
                </button>
              )}
            </div>
            <p className="text-sm text-text-secondary mb-5">
              Set how much each source counts. These also tune automatically from your 👍 / 👎
              feedback — adjust them here anytime.
            </p>

            {sources.length === 0 ? (
              <p className="text-sm text-text-muted">
                No active sources. Add sources on the Sources page and they’ll appear here.
              </p>
            ) : (
              <div className="space-y-5">
                {[...sources]
                  .sort(
                    (a, b) =>
                      (preferences?.sources?.[b.name] ?? 50) -
                      (preferences?.sources?.[a.name] ?? 50)
                  )
                  .map((source) => {
                    const value = preferences?.sources?.[source.name] ?? 50;
                    return (
                      <div key={source.id} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label
                            className="text-sm font-medium text-text-primary truncate pr-2"
                            title={source.name}
                          >
                            {source.name}
                          </label>
                          <span className="text-sm font-mono text-text-muted w-8 text-right shrink-0">
                            {value}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={value}
                          onChange={(e) =>
                            handleSourceSliderChange(source.name, Number(e.target.value))
                          }
                          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-bg-elevated accent-accent"
                        />
                        <div className="flex justify-between text-[10px] text-text-muted">
                          <span>Show less</span>
                          <span>Neutral</span>
                          <span>Show more</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </Card>

          {/* Muted keywords */}
          <Card className="p-6">
            <h2 className="text-base font-bold text-text-primary mb-1">Muted Keywords</h2>
            <p className="text-sm text-text-secondary mb-4">
              Hide articles whose title or excerpt matches. A single word matches whole words
              (so “ai” won’t match “rain”); a multi-word phrase matches anywhere. Takes effect
              immediately and on the next briefing.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddKeyword();
              }}
              className="flex gap-2 mb-4"
            >
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                placeholder="e.g. brexit, crypto, stock market"
                className="flex-1 px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={!keywordInput.trim()}
                className="px-4 py-2 text-sm font-medium text-bg-primary bg-accent rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                Mute
              </button>
            </form>

            {preferences?.mutedKeywords && preferences.mutedKeywords.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {preferences.mutedKeywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-bg-elevated text-sm text-text-primary"
                  >
                    {keyword}
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(keyword)}
                      aria-label={`Unmute ${keyword}`}
                      className="text-text-muted hover:text-text-primary transition-colors"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                No muted keywords yet. Add one above to filter out topics you never want to see.
              </p>
            )}
          </Card>

          {/* Reset personalization (full escape hatch) */}
          <Card className="p-6 border-status-breaking/30">
            <h2 className="text-base font-bold text-text-primary mb-1">Reset personalization</h2>
            <p className="text-sm text-text-secondary mb-4">
              Start fresh. Clears everything the briefing has learned — the semantic interest
              profile, your 👍 / 👎 history, reading &amp; engagement signals, and learned source
              weights — back to your onboarding choices. Your muted keywords and onboarding
              interests are kept.
            </p>
            <button
              type="button"
              onClick={handleResetEverything}
              disabled={resetting}
              className="px-4 py-2 text-sm font-medium text-status-breaking border border-status-breaking/40 rounded-lg hover:bg-status-breaking/10 transition-colors disabled:opacity-50"
            >
              {resetting ? 'Resetting…' : 'Reset everything learned'}
            </button>
          </Card>

          <p className="text-xs text-text-muted text-center">
            Category and source weights reorder your content. “Not interested” also hides that
            article from the current briefing — you can undo it inline.
          </p>
        </div>
      )}
    </DashboardLayout>
  );
}
