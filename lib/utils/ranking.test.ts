import { describe, it, expect } from 'bun:test';
import {
  type RankSignal,
  timeDecay,
  importanceScore,
  minMaxNormalize,
  blendScores,
  mmrRerank,
  promoteExploration,
  rankIndices,
  lambdaForDiversity,
} from './ranking';

const sig = (s: Partial<RankSignal> = {}): RankSignal => ({
  clusterSize: 1,
  sourceQuality: 50,
  ageHours: 1,
  affinity: 50,
  ...s,
});

describe('timeDecay', () => {
  it('is positive and within (0, 1]', () => {
    expect(timeDecay(0)).toBeGreaterThan(0);
    expect(timeDecay(0)).toBeLessThanOrEqual(1);
  });

  it('decreases monotonically with age', () => {
    expect(timeDecay(0)).toBeGreaterThan(timeDecay(6));
    expect(timeDecay(6)).toBeGreaterThan(timeDecay(24));
    expect(timeDecay(24)).toBeGreaterThan(timeDecay(72));
  });

  it('treats negative ages as zero', () => {
    expect(timeDecay(-5)).toBe(timeDecay(0));
  });
});

describe('importanceScore', () => {
  it('rises with cluster size, all else equal', () => {
    const small = importanceScore(sig({ clusterSize: 1 }));
    const big = importanceScore(sig({ clusterSize: 6 }));
    expect(big).toBeGreaterThan(small);
  });

  it('keeps singletons above zero (log1p, not log)', () => {
    expect(importanceScore(sig({ clusterSize: 1 }))).toBeGreaterThan(0);
  });

  it('rises with source quality', () => {
    const low = importanceScore(sig({ sourceQuality: 20 }));
    const high = importanceScore(sig({ sourceQuality: 90 }));
    expect(high).toBeGreaterThan(low);
  });

  it('falls as the story ages', () => {
    const fresh = importanceScore(sig({ ageHours: 1 }));
    const stale = importanceScore(sig({ ageHours: 48 }));
    expect(fresh).toBeGreaterThan(stale);
  });

  it('does not depend on affinity', () => {
    expect(importanceScore(sig({ affinity: 0 }))).toBe(importanceScore(sig({ affinity: 100 })));
  });
});

describe('minMaxNormalize', () => {
  it('maps to [0, 1] with endpoints', () => {
    expect(minMaxNormalize([1, 2, 3])).toEqual([0, 0.5, 1]);
  });

  it('returns neutral 0.5 when all values are equal', () => {
    expect(minMaxNormalize([7, 7, 7])).toEqual([0.5, 0.5, 0.5]);
  });

  it('handles empty input', () => {
    expect(minMaxNormalize([])).toEqual([]);
  });
});

describe('blendScores', () => {
  it('respects weights — affinity-dominant ordering', () => {
    const signals = [
      sig({ clusterSize: 8, sourceQuality: 90, affinity: 10 }), // important, disliked
      sig({ clusterSize: 1, sourceQuality: 50, affinity: 90 }), // trivial, loved
    ];
    const scores = blendScores(signals, { importance: 0.1, affinity: 0.9 });
    expect(scores[1]).toBeGreaterThan(scores[0]!);
  });

  it('respects weights — importance-dominant ordering', () => {
    const signals = [
      sig({ clusterSize: 8, sourceQuality: 90, affinity: 10 }),
      sig({ clusterSize: 1, sourceQuality: 50, affinity: 90 }),
    ];
    const scores = blendScores(signals, { importance: 0.9, affinity: 0.1 });
    expect(scores[0]).toBeGreaterThan(scores[1]!);
  });

  it('produces one score per signal', () => {
    const signals = [sig(), sig(), sig()];
    expect(blendScores(signals)).toHaveLength(3);
  });

  it('ignores fit entirely when no signal carries it (cold start)', () => {
    const signals = [sig({ affinity: 90 }), sig({ affinity: 10 })];
    // Equivalent to the two-term blend: higher affinity wins.
    const scores = blendScores(signals);
    expect(scores[0]).toBeGreaterThan(scores[1]!);
  });

  it('uses semantic fit when present', () => {
    // Equal importance + affinity; only fit differs → higher fit ranks higher.
    const signals = [
      sig({ clusterSize: 2, sourceQuality: 50, affinity: 50, fit: 0.1 }),
      sig({ clusterSize: 2, sourceQuality: 50, affinity: 50, fit: 0.9 }),
    ];
    const scores = blendScores(signals);
    expect(scores[1]).toBeGreaterThan(scores[0]!);
  });
});

describe('mmrRerank', () => {
  it('promotes a diverse item above a near-duplicate of the top pick', () => {
    // Items 0 and 1 are near-identical and high-scoring; item 2 is distinct.
    const scores = [1.0, 0.95, 0.6];
    const sim = (i: number, j: number) => {
      const pair = new Set([i, j]);
      return pair.has(0) && pair.has(1) ? 0.95 : 0.0; // 0 & 1 are dupes
    };
    const order = mmrRerank(scores, sim, 0.7);
    expect(order[0]).toBe(0); // highest score picked first
    expect(order[1]).toBe(2); // distinct item beats the duplicate of 0
    expect(order[2]).toBe(1);
  });

  it('returns a permutation of all indices', () => {
    const scores = [0.2, 0.8, 0.5, 0.1];
    const order = mmrRerank(scores, () => 0, 0.7);
    expect([...order].sort()).toEqual([0, 1, 2, 3]);
  });

  it('with no similarity, falls back to score order', () => {
    const scores = [0.2, 0.8, 0.5];
    expect(mmrRerank(scores, () => 0, 0.7)).toEqual([1, 2, 0]);
  });
});

describe('promoteExploration', () => {
  it('moves an off-profile, high-importance tail item into the top region', () => {
    // 14 items. Index 13 is off-profile (low affinity) but very important.
    const signals: RankSignal[] = [];
    for (let i = 0; i < 13; i++) signals.push(sig({ affinity: 80, clusterSize: 1 }));
    signals.push(sig({ affinity: 5, clusterSize: 10, sourceQuality: 95, ageHours: 0 }));
    const order = Array.from({ length: 14 }, (_, i) => i); // 13 is last
    const out = promoteExploration(order, signals, { slots: 1, topRegion: 12 });
    const posOf13 = out.indexOf(13);
    expect(posOf13).toBeLessThan(12); // promoted into the top region
  });

  it('is a no-op when there is no tail beyond the top region', () => {
    const signals = Array.from({ length: 5 }, () => sig());
    const order = [0, 1, 2, 3, 4];
    expect(promoteExploration(order, signals, { slots: 2, topRegion: 12 })).toEqual(order);
  });

  it('preserves the full set of indices', () => {
    const signals = Array.from({ length: 20 }, (_, i) => sig({ affinity: i < 10 ? 80 : 10 }));
    const order = Array.from({ length: 20 }, (_, i) => i);
    const out = promoteExploration(order, signals, { slots: 2, topRegion: 12 });
    expect([...out].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('lambdaForDiversity', () => {
  it('maps 0 (focused) to the high-λ end and 100 (diverse) to the low end', () => {
    expect(lambdaForDiversity(0)).toBeCloseTo(0.9, 10);
    expect(lambdaForDiversity(100)).toBeCloseTo(0.4, 10);
  });

  it('maps the default dial (40) back to the original λ 0.7', () => {
    expect(lambdaForDiversity(40)).toBeCloseTo(0.7, 10);
  });

  it('is monotonically decreasing (more diverse → lower λ)', () => {
    expect(lambdaForDiversity(20)).toBeGreaterThan(lambdaForDiversity(80));
  });

  it('clamps out-of-range input', () => {
    expect(lambdaForDiversity(-50)).toBeCloseTo(0.9, 10);
    expect(lambdaForDiversity(999)).toBeCloseTo(0.4, 10);
  });
});

describe('rankIndices', () => {
  it('returns a permutation of all items', () => {
    const signals = Array.from({ length: 8 }, (_, i) =>
      sig({ clusterSize: (i % 3) + 1, affinity: (i * 13) % 100, ageHours: i })
    );
    const order = rankIndices(signals, () => 0);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('handles an empty feed', () => {
    expect(rankIndices([], () => 0)).toEqual([]);
  });

  it('ranks a loved, important, fresh story near the top', () => {
    const signals = [
      sig({ clusterSize: 1, sourceQuality: 40, affinity: 30, ageHours: 50 }),
      sig({ clusterSize: 6, sourceQuality: 95, affinity: 95, ageHours: 1 }), // the winner
      sig({ clusterSize: 1, sourceQuality: 50, affinity: 50, ageHours: 10 }),
    ];
    const order = rankIndices(signals, () => 0);
    expect(order[0]).toBe(1);
  });

  it('demotes an item via a fatigue multiplier (Phase 5)', () => {
    const signals = [
      sig({ clusterSize: 6, sourceQuality: 95, affinity: 95, ageHours: 1 }), // would win
      sig({ clusterSize: 3, sourceQuality: 80, affinity: 80, ageHours: 2 }), // strong runner-up
      sig({ clusterSize: 1, sourceQuality: 40, affinity: 30, ageHours: 50 }),
    ];
    // Without fatigue, item 0 leads.
    expect(rankIndices(signals, () => 0)[0]).toBe(0);
    // Crush item 0's score — the runner-up should overtake it.
    const order = rankIndices(signals, () => 0, { multipliers: [0.01, 1, 1] });
    expect(order[0]).toBe(1);
  });
});
