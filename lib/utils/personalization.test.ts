import { test, expect, describe } from 'bun:test';
import {
  getPersonalizationScore,
  sortByPreference,
  applyFeedback,
  applyAffinityNudge,
  decayPreferences,
  mapIntelligenceCategoryToSlug,
  isMuted,
} from './personalization';
import { DEFAULT_PREFERENCES, SIGNAL_HALF_LIFE_DAYS } from '../types';
import type { Article, ArticleCategory, UserPreferences } from '../types';

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: overrides.id ?? 'a1',
    url: overrides.url ?? 'https://example.com/a1',
    title: overrides.title ?? 'Some title',
    excerpt: overrides.excerpt ?? 'Some excerpt',
    publishedAt: overrides.publishedAt ?? '2026-06-08T08:00:00.000Z',
    sourceId: overrides.sourceId ?? 's1',
    sourceName: overrides.sourceName ?? 'Source',
    sourceAuthority: overrides.sourceAuthority ?? 50,
    fetchedAt: overrides.fetchedAt ?? '2026-06-08T08:00:00.000Z',
    ...overrides,
  };
}

const prefs: UserPreferences = {
  interests: {
    'ai-ml': 90,
    'business': 30,
    'science': 50,
    'security': 50,
    'programming': 50,
    'devops': 50,
    'design': 50,
    'hardware': 50,
    'other': 20,
  },
  sources: {},
  mutedKeywords: [],
  updatedAt: '2026-06-08T00:00:00.000Z',
};

describe('getPersonalizationScore', () => {
  test('blends category weight (0.6) with source weight (0.4)', () => {
    // ai-ml=90, unseen source defaults to 50 → 90*0.6 + 50*0.4 = 74
    expect(getPersonalizationScore(makeArticle({ category: 'ai-ml' }), prefs)).toBe(74);
  });

  test('factors in a learned source weight', () => {
    const withSource: UserPreferences = { ...prefs, sources: { Source: 100 } };
    // ai-ml=90, source=100 → 90*0.6 + 100*0.4 = 94
    expect(getPersonalizationScore(makeArticle({ category: 'ai-ml' }), withSource)).toBe(94);
  });

  test('articles without a category use the "other" weight', () => {
    // other=20, source=50 → 20*0.6 + 50*0.4 = 32
    expect(getPersonalizationScore(makeArticle({ category: undefined }), prefs)).toBe(32);
  });

  test('scores 50 against default preferences', () => {
    expect(getPersonalizationScore(makeArticle({ category: 'science' }), DEFAULT_PREFERENCES)).toBe(50);
  });
});

describe('sortByPreference', () => {
  test('higher-scoring articles come first', () => {
    const ai = makeArticle({ id: 'ai', category: 'ai-ml' });
    const biz = makeArticle({ id: 'biz', category: 'business' });
    const sorted = sortByPreference([biz, ai], prefs);
    expect(sorted.map((a) => a.id)).toEqual(['ai', 'biz']);
  });

  test('within the same score tier, newer articles come first', () => {
    const older = makeArticle({ id: 'older', category: 'science', publishedAt: '2026-06-01T00:00:00.000Z' });
    const newer = makeArticle({ id: 'newer', category: 'science', publishedAt: '2026-06-08T00:00:00.000Z' });
    const sorted = sortByPreference([older, newer], prefs);
    expect(sorted.map((a) => a.id)).toEqual(['newer', 'older']);
  });

  test('does not mutate the input array', () => {
    const input = [makeArticle({ id: 'a', category: 'business' }), makeArticle({ id: 'b', category: 'ai-ml' })];
    const snapshot = input.map((a) => a.id);
    sortByPreference(input, prefs);
    expect(input.map((a) => a.id)).toEqual(snapshot);
  });
});

describe('applyFeedback', () => {
  const article = makeArticle({ category: 'science', sourceName: 'Source' });

  test('"up" raises the category and source weights', () => {
    const next = applyFeedback(prefs, article, 'up');
    expect(next.interests.science).toBe(58); // 50 + 8
    expect(next.sources.Source).toBe(58); // 50 + 8
  });

  test('"down" lowers the weights', () => {
    const next = applyFeedback(prefs, article, 'down');
    expect(next.interests.science).toBe(42); // 50 - 8
    expect(next.sources.Source).toBe(42);
  });

  test('"hide" lowers more aggressively', () => {
    const next = applyFeedback(prefs, article, 'hide');
    expect(next.interests.science).toBe(35); // 50 - 15
    expect(next.sources.Source).toBe(35);
  });

  test('clamps to 0-100', () => {
    const high: UserPreferences = { ...prefs, interests: { ...prefs.interests, science: 98 }, sources: { Source: 2 } };
    const up = applyFeedback(high, article, 'up');
    expect(up.interests.science).toBe(100); // clamped
    const down = applyFeedback(high, article, 'down');
    expect(down.sources.Source).toBe(0); // clamped
  });

  test('does not mutate the input preferences', () => {
    const before = JSON.stringify(prefs);
    applyFeedback(prefs, article, 'up');
    expect(JSON.stringify(prefs)).toBe(before);
  });
});

describe('isMuted', () => {
  test('returns false when there are no muted keywords', () => {
    expect(isMuted(makeArticle({ title: 'Anything' }), [])).toBe(false);
    expect(isMuted(makeArticle({ title: 'Anything' }), undefined)).toBe(false);
  });

  test('matches a single word on word boundaries (case-insensitive)', () => {
    const art = makeArticle({ title: 'The latest on Brexit talks', excerpt: 'EU news' });
    expect(isMuted(art, ['brexit'])).toBe(true);
    expect(isMuted(art, ['BREXIT'])).toBe(true);
  });

  test('does not match a keyword inside a larger word', () => {
    // "ai" should not match "rain" / "raining"
    const art = makeArticle({ title: 'Heavy rain expected', excerpt: 'It is raining' });
    expect(isMuted(art, ['ai'])).toBe(false);
  });

  test('matches against the excerpt too', () => {
    const art = makeArticle({ title: 'Markets update', excerpt: 'Bitcoin surged today' });
    expect(isMuted(art, ['bitcoin'])).toBe(true);
  });

  test('matches a multi-word phrase as a substring', () => {
    const art = makeArticle({ title: 'A look at the stock market rally' });
    expect(isMuted(art, ['stock market'])).toBe(true);
  });

  test('ignores blank keywords', () => {
    expect(isMuted(makeArticle({ title: 'Anything' }), ['   ', ''])).toBe(false);
  });
});

describe('mapIntelligenceCategoryToSlug', () => {
  test('maps known keywords to slugs', () => {
    expect(mapIntelligenceCategoryToSlug('AI and Machine Learning')).toBe('ai-ml');
    expect(mapIntelligenceCategoryToSlug('Security & Privacy')).toBe('security');
    expect(mapIntelligenceCategoryToSlug('Startup funding news')).toBe('business');
    expect(mapIntelligenceCategoryToSlug('New Device Reviews')).toBe('hardware');
  });

  test('falls back to "other" for unknown names', () => {
    expect(mapIntelligenceCategoryToSlug('Weather report')).toBe('other');
  });
});

describe('applyAffinityNudge', () => {
  const article = makeArticle({ category: 'science', sourceName: 'Source' });

  test('nudges category and source by a fractional delta', () => {
    const next = applyAffinityNudge(prefs, article, 4);
    expect(next.interests.science).toBe(54);
    expect(next.sources.Source).toBe(54);
  });

  test('a negative delta lowers, clamped to 0', () => {
    const low: UserPreferences = { ...prefs, sources: { Source: 0.2 } };
    expect(applyAffinityNudge(low, article, -0.5).sources.Source).toBe(0);
  });

  test('does not mutate the input preferences', () => {
    const before = JSON.stringify(prefs);
    applyAffinityNudge(prefs, article, 2);
    expect(JSON.stringify(prefs)).toBe(before);
  });
});

describe('decayPreferences', () => {
  const base = '2026-06-08T00:00:00.000Z';
  const day = (n: number) => Date.parse(base) + n * 86_400_000;

  test('no time elapsed → unchanged', () => {
    const p: UserPreferences = { ...prefs, sources: { Source: 90 }, updatedAt: base };
    expect(decayPreferences(p, Date.parse(base))).toEqual(p);
  });

  test('source weights relax halfway to neutral after one half-life', () => {
    const p: UserPreferences = { ...prefs, sources: { Source: 90 }, updatedAt: base };
    const decayed = decayPreferences(p, day(SIGNAL_HALF_LIFE_DAYS));
    // 50 + (90-50)*0.5 = 70
    expect(decayed.sources.Source).toBeCloseTo(70, 5);
  });

  test('category interest relaxes toward its stated baseline, not all the way to 50', () => {
    const interestBaseline = { ...DEFAULT_PREFERENCES.interests, 'ai-ml': 80 } as Record<
      ArticleCategory,
      number
    >;
    const p: UserPreferences = {
      ...prefs,
      interests: { ...prefs.interests, 'ai-ml': 100 },
      interestBaseline,
      updatedAt: base,
    };
    const decayed = decayPreferences(p, day(SIGNAL_HALF_LIFE_DAYS));
    // baseline barely moves (180d half-life); live value relaxes halfway from 100→~80
    expect(decayed.interests['ai-ml']).toBeGreaterThan(85);
    expect(decayed.interests['ai-ml']).toBeLessThan(95);
  });

  test('decays toward 50 when there is no baseline', () => {
    const p: UserPreferences = {
      ...prefs,
      interests: { ...prefs.interests, business: 10 },
      updatedAt: base,
    };
    const decayed = decayPreferences(p, day(SIGNAL_HALF_LIFE_DAYS));
    expect(decayed.interests.business).toBeCloseTo(30, 5); // 50 + (10-50)*0.5
  });

  test('does not mutate the input', () => {
    const p: UserPreferences = { ...prefs, sources: { Source: 90 }, updatedAt: base };
    const before = JSON.stringify(p);
    decayPreferences(p, day(60));
    expect(JSON.stringify(p)).toBe(before);
  });
});
