import { test, expect, describe } from 'bun:test';
import {
  getPersonalizationScore,
  sortByPreference,
  applyFeedback,
  mapIntelligenceCategoryToSlug,
} from './personalization';
import { DEFAULT_PREFERENCES } from '../types';
import type { Article, UserPreferences } from '../types';

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
    'other': 20,
  },
  sources: {},
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

describe('mapIntelligenceCategoryToSlug', () => {
  test('maps known keywords to slugs', () => {
    expect(mapIntelligenceCategoryToSlug('AI and Machine Learning')).toBe('ai-ml');
    expect(mapIntelligenceCategoryToSlug('Security & Privacy')).toBe('security');
    expect(mapIntelligenceCategoryToSlug('Startup funding news')).toBe('business');
  });

  test('falls back to "other" for unknown names', () => {
    expect(mapIntelligenceCategoryToSlug('Weather report')).toBe('other');
  });
});
