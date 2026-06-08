import { test, expect, describe } from 'bun:test';
import {
  clusterArticles,
  sortClustersBySize,
  sortArticlesByTime,
  getClusterStats,
} from './clustering';
import type { Article, Cluster } from '../types';

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: overrides.id ?? 'a1',
    url: overrides.url ?? `https://example.com/${overrides.id ?? 'a1'}`,
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

describe('clusterArticles', () => {
  test('groups near-identical titles into one cluster', () => {
    const articles = [
      makeArticle({ id: 'a', title: 'Apple announces new iPhone lineup' }),
      makeArticle({ id: 'b', title: 'Apple announces new iPhone lineup today' }),
    ];
    const { clusters, individualArticles } = clusterArticles(articles);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.articles).toHaveLength(2);
    expect(individualArticles).toHaveLength(0);
  });

  test('leaves dissimilar articles as individuals', () => {
    const articles = [
      makeArticle({ id: 'a', title: 'Stock market hits record high' }),
      makeArticle({ id: 'b', title: 'New species of frog discovered' }),
    ];
    const { clusters, individualArticles } = clusterArticles(articles);
    expect(clusters).toHaveLength(0);
    expect(individualArticles).toHaveLength(2);
  });

  test('picks the highest-authority article as the representative', () => {
    const articles = [
      makeArticle({ id: 'low', title: 'Major breakthrough in fusion energy', sourceAuthority: 40 }),
      makeArticle({ id: 'high', title: 'Major breakthrough in fusion energy reported', sourceAuthority: 95 }),
    ];
    const { clusters } = clusterArticles(articles);
    expect(clusters[0]!.representativeArticle.id).toBe('high');
  });

  test('treats identical URLs as the same story', () => {
    const articles = [
      makeArticle({ id: 'a', url: 'https://news.com/story', title: 'One headline' }),
      makeArticle({ id: 'b', url: 'https://news.com/story', title: 'A completely unrelated headline' }),
    ];
    const { clusters } = clusterArticles(articles);
    expect(clusters).toHaveLength(1);
  });
});

describe('sortClustersBySize', () => {
  test('orders clusters by article count descending', () => {
    const clusters = [
      { id: 'small', articles: [{}, {}] },
      { id: 'big', articles: [{}, {}, {}, {}] },
    ] as unknown as Cluster[];
    expect(sortClustersBySize(clusters).map((c) => c.id)).toEqual(['big', 'small']);
  });
});

describe('sortArticlesByTime', () => {
  test('orders newest first', () => {
    const articles = [
      makeArticle({ id: 'old', publishedAt: '2026-06-01T00:00:00.000Z' }),
      makeArticle({ id: 'new', publishedAt: '2026-06-08T00:00:00.000Z' }),
    ];
    expect(sortArticlesByTime(articles).map((a) => a.id)).toEqual(['new', 'old']);
  });
});

describe('getClusterStats', () => {
  test('summarizes cluster counts', () => {
    const clusters = [
      { articles: [{}, {}], avgSimilarity: 0.8 },
      { articles: [{}, {}, {}], avgSimilarity: 0.9 },
    ] as unknown as Cluster[];
    const stats = getClusterStats(clusters);
    expect(stats.totalClusters).toBe(2);
    expect(stats.totalClusteredArticles).toBe(5);
    expect(stats.avgClusterSize).toBeCloseTo(2.5);
    expect(stats.avgSimilarity).toBeCloseTo(0.85);
  });

  test('handles an empty cluster list', () => {
    const stats = getClusterStats([]);
    expect(stats).toEqual({ totalClusters: 0, totalClusteredArticles: 0, avgClusterSize: 0, avgSimilarity: 0 });
  });
});
