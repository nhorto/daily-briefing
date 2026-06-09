import { describe, it, expect } from 'bun:test';
import {
  cosineSimilarity,
  meanVector,
  addVectors,
  scaleVector,
  subtractVectors,
  normalizeVector,
  kMeans,
  maxCosineSimilarity,
} from './vector';

describe('cosineSimilarity', () => {
  it('is 1 for identical direction', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1, 10); // scale-invariant
  });

  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it('is -1 for opposite direction', () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 10);
  });

  it('returns 0 for a zero vector', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('returns 0 for length mismatch or empty', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe('meanVector', () => {
  it('averages element-wise', () => {
    expect(meanVector([[2, 4], [4, 8]])).toEqual([3, 6]);
  });

  it('returns the same vector for a single input', () => {
    expect(meanVector([[1, 2, 3]])).toEqual([1, 2, 3]);
  });

  it('returns null for an empty list', () => {
    expect(meanVector([])).toBeNull();
  });
});

describe('addVectors / scaleVector / subtractVectors', () => {
  it('adds element-wise', () => {
    expect(addVectors([1, 2], [3, 4])).toEqual([4, 6]);
  });

  it('scales by a constant', () => {
    expect(scaleVector([1, -2, 3], 2)).toEqual([2, -4, 6]);
  });

  it('subtracts element-wise', () => {
    expect(subtractVectors([5, 5], [1, 2])).toEqual([4, 3]);
  });
});

describe('normalizeVector', () => {
  it('produces a unit vector', () => {
    const n = normalizeVector([3, 4]);
    expect(n[0]).toBeCloseTo(0.6, 10);
    expect(n[1]).toBeCloseTo(0.8, 10);
    const mag = Math.sqrt(n.reduce((s, x) => s + x * x, 0));
    expect(mag).toBeCloseTo(1, 10);
  });

  it('leaves a zero vector unchanged', () => {
    expect(normalizeVector([0, 0])).toEqual([0, 0]);
  });

  it('a normalized vector is cosine-1 with the original', () => {
    const v = [2, -5, 1, 8];
    expect(cosineSimilarity(v, normalizeVector(v))).toBeCloseTo(1, 10);
  });
});

describe('kMeans', () => {
  // Three clearly-separated directions in 3D (axis-aligned groups).
  const groupX = [
    [10, 0, 0],
    [9, 1, 0],
    [10, 0, 1],
  ];
  const groupY = [
    [0, 10, 0],
    [1, 9, 0],
    [0, 10, 1],
  ];
  const groupZ = [
    [0, 0, 10],
    [0, 1, 9],
    [1, 0, 10],
  ];

  it('returns one centroid for k=1 (the mean)', () => {
    const c = kMeans([[2, 0], [4, 0]], 1);
    expect(c).toHaveLength(1);
    expect(c[0]).toEqual([3, 0]);
  });

  it('returns [] for no input', () => {
    expect(kMeans([], 3)).toEqual([]);
  });

  it('recovers three well-separated clusters', () => {
    const centroids = kMeans([...groupX, ...groupY, ...groupZ], 3);
    expect(centroids).toHaveLength(3);
    // Each original group should map cleanly to one centroid (cosine ~1).
    for (const group of [groupX, groupY, groupZ]) {
      const member = group[0] as number[];
      expect(maxCosineSimilarity(member, centroids)).toBeGreaterThan(0.95);
    }
  });

  it('keeps niche groups separate (the whole point of multi-cluster)', () => {
    // 9 mainstream X-ish vectors + 1 niche Z vector. A single mean would bury Z;
    // k-means should give it (or a near-Z direction) its own centroid.
    const niche = [0, 0, 10];
    const data = [...groupX, ...groupX, ...groupX, niche];
    const centroids = kMeans(data, 3);
    expect(maxCosineSimilarity(niche, centroids)).toBeGreaterThan(0.9);
  });

  it('drops empty clusters when k exceeds the number of distinct groups', () => {
    // Only two distinct directions but k=5 — should not return 5 padded centroids.
    const centroids = kMeans([...groupX, ...groupY], 5);
    expect(centroids.length).toBeLessThanOrEqual(6);
    expect(centroids.length).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic (same input → same centroids)', () => {
    const data = [...groupX, ...groupY, ...groupZ];
    expect(kMeans(data, 3)).toEqual(kMeans(data, 3));
  });
});

describe('maxCosineSimilarity', () => {
  it('returns the best similarity across centroids', () => {
    const v = [1, 0, 0];
    const centroids = [
      [0, 1, 0], // orthogonal → 0
      [1, 0, 0], // identical → 1
    ];
    expect(maxCosineSimilarity(v, centroids)).toBeCloseTo(1, 10);
  });

  it('returns 0 for no centroids', () => {
    expect(maxCosineSimilarity([1, 2, 3], [])).toBe(0);
  });
});
