import { test, expect, describe } from 'bun:test';
import {
  getPersonalizationScore,
  sortByPreference,
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
  updatedAt: '2026-06-08T00:00:00.000Z',
};

describe('getPersonalizationScore', () => {
  test('returns the weight for the article category', () => {
    expect(getPersonalizationScore(makeArticle({ category: 'ai-ml' }), prefs)).toBe(90);
  });

  test('articles without a category use the "other" weight', () => {
    expect(getPersonalizationScore(makeArticle({ category: undefined }), prefs)).toBe(20);
  });

  test('defaults to 50 against default preferences', () => {
    expect(getPersonalizationScore(makeArticle({ category: 'science' }), DEFAULT_PREFERENCES)).toBe(50);
  });
});

describe('sortByPreference', () => {
  test('higher-weighted categories come first', () => {
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
