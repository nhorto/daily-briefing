import { describe, it, expect } from 'bun:test';
import {
  CATEGORY_FATIGUE_FLOOR,
  CATEGORY_SKIP_FULL,
  FATIGUE_IMPRESSION_FLOOR,
  FATIGUE_IMPRESSION_FULL,
  FATIGUE_IMPRESSION_START,
  type FatigueInput,
  type FatigueItem,
  categoryDiscount,
  categorySkipCounts,
  fatigueMultipliers,
  impressionDiscount,
  isImpressionExhausted,
} from './fatigue';

describe('impressionDiscount', () => {
  it('does not discount below the start threshold', () => {
    expect(impressionDiscount(0, false)).toBe(1);
    expect(impressionDiscount(FATIGUE_IMPRESSION_START, false)).toBe(1);
  });

  it('ramps down between start and full, reaching the floor at full', () => {
    const mid = impressionDiscount((FATIGUE_IMPRESSION_START + FATIGUE_IMPRESSION_FULL) / 2, false);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(FATIGUE_IMPRESSION_FLOOR);
    expect(impressionDiscount(FATIGUE_IMPRESSION_FULL, false)).toBeCloseTo(FATIGUE_IMPRESSION_FLOOR, 10);
    expect(impressionDiscount(FATIGUE_IMPRESSION_FULL + 5, false)).toBeCloseTo(FATIGUE_IMPRESSION_FLOOR, 10);
  });

  it('never discounts an engaged item, however many times shown', () => {
    expect(impressionDiscount(20, true)).toBe(1);
  });

  it('is monotonically non-increasing in impressions', () => {
    let prev = Infinity;
    for (let n = 0; n <= 12; n++) {
      const d = impressionDiscount(n, false);
      expect(d).toBeLessThanOrEqual(prev);
      prev = d;
    }
  });
});

describe('isImpressionExhausted', () => {
  it('is true only at/above full showings and only when unengaged', () => {
    expect(isImpressionExhausted(FATIGUE_IMPRESSION_FULL - 1, false)).toBe(false);
    expect(isImpressionExhausted(FATIGUE_IMPRESSION_FULL, false)).toBe(true);
    expect(isImpressionExhausted(FATIGUE_IMPRESSION_FULL + 3, false)).toBe(true);
    expect(isImpressionExhausted(FATIGUE_IMPRESSION_FULL + 3, true)).toBe(false);
  });
});

describe('categoryDiscount', () => {
  it('does not damp below the skip start', () => {
    expect(categoryDiscount(0)).toBe(1);
    expect(categoryDiscount(3)).toBe(1);
  });

  it('ramps to the category floor by the full-skip count', () => {
    expect(categoryDiscount(CATEGORY_SKIP_FULL)).toBeCloseTo(CATEGORY_FATIGUE_FLOOR, 10);
    expect(categoryDiscount(CATEGORY_SKIP_FULL + 10)).toBeCloseTo(CATEGORY_FATIGUE_FLOOR, 10);
  });
});

describe('categorySkipCounts', () => {
  const items: FatigueItem[] = [
    { id: 'a', category: 'ai-ml' },
    { id: 'b', category: 'ai-ml' },
    { id: 'c', category: 'design' },
  ];

  it('sums unengaged impressions per category, ignoring engaged + unshown', () => {
    const input: FatigueInput = {
      impressions: { a: 3, b: 4, c: 5 },
      engaged: new Set(['b']), // b engaged → excluded
    };
    const skips = categorySkipCounts(items, input);
    expect(skips['ai-ml']).toBe(3); // only a counts
    expect(skips['design']).toBe(5);
  });

  it('ignores items never shown', () => {
    const input: FatigueInput = { impressions: {}, engaged: new Set() };
    expect(categorySkipCounts(items, input)).toEqual({});
  });
});

describe('fatigueMultipliers', () => {
  it('combines impression + category discounting, aligned to items', () => {
    const items: FatigueItem[] = [
      { id: 'fresh', category: 'ai-ml' },
      { id: 'stale', category: 'ai-ml' },
    ];
    const input: FatigueInput = {
      impressions: { fresh: 1, stale: FATIGUE_IMPRESSION_FULL - 1 },
      engaged: new Set(),
    };
    const [m0, m1] = fatigueMultipliers(items, input);
    expect(m0).toBeLessThanOrEqual(1);
    expect(m1).toBeLessThan(m0 as number); // stale item demoted harder
    expect(m1).toBeGreaterThanOrEqual(0);
  });

  it('leaves fresh, low-impression items at full score', () => {
    const items: FatigueItem[] = [{ id: 'x', category: 'science' }];
    const input: FatigueInput = { impressions: { x: 1 }, engaged: new Set() };
    expect(fatigueMultipliers(items, input)).toEqual([1]);
  });

  it('exempts engaged items even when shown a lot', () => {
    const items: FatigueItem[] = [{ id: 'x', category: 'science' }];
    const input: FatigueInput = { impressions: { x: 20 }, engaged: new Set(['x']) };
    // x is engaged so impressionDiscount=1; it's also excluded from skips, so
    // categoryDiscount=1 → multiplier 1.
    expect(fatigueMultipliers(items, input)).toEqual([1]);
  });
});
