'use client';

import { useEffect, useState } from 'react';
import type { ArticleCategory, UserPreferences } from '@/lib/types';
import { CATEGORY_META, DEFAULT_PREFERENCES } from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import Card from '@/components/ui/Card';
import { SkeletonPage } from '@/components/ui/Skeleton';

const CATEGORIES = Object.keys(CATEGORY_META) as ArticleCategory[];

export default function SettingsPage() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchPreferences();
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

  async function handleSave() {
    if (!preferences) return;

    setSaving(true);
    setSaved(false);

    try {
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interests: preferences.interests }),
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

  function handleReset() {
    setPreferences({
      ...DEFAULT_PREFERENCES,
      updatedAt: new Date().toISOString(),
    });
    setSaved(false);
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

  return (
    <DashboardLayout>
      {loading ? (
        <SkeletonPage />
      ) : (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Settings</h1>
            <p className="text-sm text-text-secondary mt-1">
              Adjust weights to personalize your briefing order. Higher values surface those topics first.
            </p>
          </div>

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

          <p className="text-xs text-text-muted text-center">
            Preferences reorder your content — they never hide it. Lower-weight topics still appear, just further down.
          </p>
        </div>
      )}
    </DashboardLayout>
  );
}
