import { describe, it, expect } from 'bun:test';
import {
  cosineSimilarity,
  meanVector,
  addVectors,
  scaleVector,
  subtractVectors,
  normalizeVector,
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
