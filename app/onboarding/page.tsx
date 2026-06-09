'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ArticleCategory, Source } from '@/lib/types';
import { CATEGORY_META } from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import Card from '@/components/ui/Card';

const CATEGORIES = Object.keys(CATEGORY_META) as ArticleCategory[];
const EXAMPLE_SLOTS = ['ex-1', 'ex-2', 'ex-3'] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [sources, setSources] = useState<Source[]>([]);
  const [pickedCategories, setPickedCategories] = useState<Set<ArticleCategory>>(new Set());
  const [pickedSources, setPickedSources] = useState<Set<string>>(new Set());
  const [examples, setExamples] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/sources');
        const data = await res.json();
        if (data.success) setSources((data.sources as Source[]).filter((s) => s.isActive));
      } catch {
        // sources step is optional
      }
    })();
  }, []);

  function toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  async function finish() {
    setSaving(true);
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interests: [...pickedCategories],
          sources: [...pickedSources],
          examples: Object.values(examples)
            .map((e) => e.trim())
            .filter(Boolean),
        }),
      });
      router.push('/');
    } catch {
      setSaving(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Set up your briefing</h1>
          <p className="text-sm text-text-secondary mt-1">
            A 30-second head start so Today surfaces the right things from day one. Everything
            here keeps learning from what you read — and you can change it any time in Settings.
          </p>
        </div>

        {/* Interests */}
        <Card className="p-6">
          <h2 className="text-base font-bold text-text-primary mb-1">What are you into?</h2>
          <p className="text-sm text-text-secondary mb-4">
            Pick the topics you want to see more of.
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.filter((c) => c !== 'other').map((cat) => {
              const meta = CATEGORY_META[cat];
              const on = pickedCategories.has(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setPickedCategories((s) => toggle(s, cat))}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    on
                      ? 'bg-accent text-bg-primary border-accent'
                      : 'bg-bg-elevated text-text-secondary border-border hover:text-text-primary hover:border-border-hover'
                  }`}
                >
                  <span>{meta.icon}</span>
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Sources */}
        <Card className="p-6">
          <h2 className="text-base font-bold text-text-primary mb-1">Favorite sources</h2>
          <p className="text-sm text-text-secondary mb-4">
            Star the ones you trust most — they’ll get a head start in your ranking.
          </p>
          {sources.length === 0 ? (
            <p className="text-sm text-text-muted">
              No active sources yet.{' '}
              <Link href="/sources" className="text-accent hover:text-accent-hover">
                Add some →
              </Link>
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sources.map((source) => {
                const on = pickedSources.has(source.name);
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => setPickedSources((s) => toggle(s, source.name))}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      on
                        ? 'bg-accent text-bg-primary border-accent'
                        : 'bg-bg-elevated text-text-secondary border-border hover:text-text-primary hover:border-border-hover'
                    }`}
                  >
                    {source.name}
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Example articles */}
        <Card className="p-6">
          <h2 className="text-base font-bold text-text-primary mb-1">
            Show me more like this <span className="text-text-muted font-normal">(optional)</span>
          </h2>
          <p className="text-sm text-text-secondary mb-4">
            Paste a headline or a sentence or two from something you’d love more of. This seeds
            the semantic match — it’s a starting hint, not a rule.
          </p>
          <div className="space-y-2">
            {EXAMPLE_SLOTS.map((slot) => (
              <textarea
                key={slot}
                value={examples[slot] ?? ''}
                onChange={(e) => setExamples((prev) => ({ ...prev, [slot]: e.target.value }))}
                rows={2}
                placeholder="e.g. A deep dive on how a new model architecture actually works…"
                className="w-full resize-none px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent leading-relaxed"
              />
            ))}
          </div>
        </Card>

        <div className="flex items-center justify-between pt-2">
          <Link
            href="/"
            className="text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
          >
            Skip for now
          </Link>
          <button
            type="button"
            onClick={finish}
            disabled={saving}
            className="px-6 py-2.5 bg-accent text-bg-primary rounded-lg hover:bg-accent-hover transition-colors font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Finish setup'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
