import { test, expect, describe } from 'bun:test';
import {
  calculateStringSimilarity,
  areArticlesDuplicates,
  calculateArticleSimilarity,
  normalizeText,
} from './similarity';
import type { Article } from '../types';

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: overrides.id ?? 'a1',
    url: overrides.url ?? 'https://example.com/a1',
    title: overrides.title ?? 'Some title',
    excerpt: overrides.excerpt ?? 'Some excerpt text here',
    publishedAt: overrides.publishedAt ?? '2026-06-08T08:00:00.000Z',
    sourceId: overrides.sourceId ?? 's1',
    sourceName: overrides.sourceName ?? 'Source',
    sourceAuthority: overrides.sourceAuthority ?? 50,
    fetchedAt: overrides.fetchedAt ?? '2026-06-08T08:00:00.000Z',
    ...overrides,
  };
}

describe('calculateStringSimilarity', () => {
  test('identical strings return 1', () => {
    expect(calculateStringSimilarity('hello world', 'hello world')).toBe(1);
  });

  test('is case-insensitive', () => {
    expect(calculateStringSimilarity('Hello World', 'hello world')).toBe(1);
  });

  test('empty input returns 0', () => {
    expect(calculateStringSimilarity('', 'anything')).toBe(0);
    expect(calculateStringSimilarity('anything', '')).toBe(0);
  });

  test('completely different strings score low', () => {
    expect(calculateStringSimilarity('abcdef', 'zyxwvu')).toBeLessThan(0.3);
  });

  test('near-identical strings score high', () => {
    expect(
      calculateStringSimilarity('OpenAI launches GPT-5', 'OpenAI launches GPT-5 today'),
    ).toBeGreaterThan(0.7);
  });
});

describe('areArticlesDuplicates', () => {
  test('same URL is always a duplicate', () => {
    const a = makeArticle({ id: 'a', url: 'https://x.com/1', title: 'Totally different one' });
    const b = makeArticle({ id: 'b', url: 'https://x.com/1', title: 'Nothing alike at all' });
    expect(areArticlesDuplicates(a, b)).toBe(true);
  });

  test('high title similarity marks duplicates', () => {
    const a = makeArticle({ id: 'a', url: 'https://x.com/1', title: 'Apple announces new iPhone lineup' });
    const b = makeArticle({ id: 'b', url: 'https://y.com/2', title: 'Apple announces new iPhone lineup today' });
    expect(areArticlesDuplicates(a, b)).toBe(true);
  });

  test('unrelated articles are not duplicates', () => {
    const a = makeArticle({ id: 'a', url: 'https://x.com/1', title: 'Stock market hits record high' });
    const b = makeArticle({ id: 'b', url: 'https://y.com/2', title: 'New species of frog discovered' });
    expect(areArticlesDuplicates(a, b)).toBe(false);
  });
});

describe('calculateArticleSimilarity', () => {
  test('weights title more heavily than excerpt', () => {
    // Pair that agrees on the title but not the excerpt.
    const titleMatch = calculateArticleSimilarity(
      makeArticle({ title: 'Same headline', excerpt: 'aaaaaaaaaa' }),
      makeArticle({ title: 'Same headline', excerpt: 'zzzzzzzzzz' }),
    );
    // Pair that agrees on the excerpt but not the title.
    const excerptMatch = calculateArticleSimilarity(
      makeArticle({ title: 'aaaaaaaaaa', excerpt: 'Same excerpt body' }),
      makeArticle({ title: 'zzzzzzzzzz', excerpt: 'Same excerpt body' }),
    );
    // Title agreement (weight 0.7) should outweigh excerpt agreement (weight 0.3).
    expect(titleMatch).toBeGreaterThan(excerptMatch);
  });
});

describe('normalizeText', () => {
  test('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeText('  Hello,   WORLD!!! ')).toBe('hello world');
  });
});
