import { test, expect, describe } from 'bun:test';
import {
  dwellCounts,
  dwellQuality,
  engagementAffinityDelta,
  expectedReadSeconds,
  isProfilePositive,
} from './signals';

describe('expectedReadSeconds', () => {
  test('scales with length and is zero for empty content', () => {
    expect(expectedReadSeconds(0)).toBe(0);
    const short = expectedReadSeconds(1000);
    const long = expectedReadSeconds(5000);
    expect(long).toBeGreaterThan(short);
  });

  test('a typical 5k-char article expects a few minutes', () => {
    const secs = expectedReadSeconds(5000);
    expect(secs).toBeGreaterThan(120);
    expect(secs).toBeLessThan(360);
  });
});

describe('dwellQuality', () => {
  test('under the absolute floor is always a skim', () => {
    expect(dwellQuality(3, 5000)).toBe('skim');
    expect(dwellQuality(7.9, 50)).toBe('skim');
  });

  test('length-normalizes: same dwell skims a long piece, reads a short one', () => {
    // 30s active time...
    expect(dwellQuality(30, 20000)).toBe('skim'); // ...is a skim for a long article
    expect(dwellQuality(30, 800)).toBe('deep'); // ...is a deep read for a short one
  });

  test('mid-range relative dwell counts as a read', () => {
    const expected = expectedReadSeconds(4000); // ~3 min
    expect(dwellQuality(expected * 0.5, 4000)).toBe('read');
  });

  test('empty content falls back to absolute time', () => {
    expect(dwellQuality(20, 0)).toBe('read');
    expect(dwellQuality(2, 0)).toBe('skim');
  });
});

describe('dwellCounts', () => {
  test('only read/deep count as a signal', () => {
    expect(dwellCounts('skim')).toBe(false);
    expect(dwellCounts('read')).toBe(true);
    expect(dwellCounts('deep')).toBe(true);
  });
});

describe('signal strength mapping', () => {
  test('quality signals move the profile; clicks and impressions do not', () => {
    expect(isProfilePositive('read-to-end')).toBe(true);
    expect(isProfilePositive('open-original')).toBe(true);
    expect(isProfilePositive('dwell')).toBe(true);
    expect(isProfilePositive('feed-open')).toBe(false);
    expect(isProfilePositive('impression')).toBe(false);
  });

  test('affinity deltas: quality > click > 0 > impression', () => {
    expect(engagementAffinityDelta('read-to-end')).toBeGreaterThan(
      engagementAffinityDelta('feed-open')
    );
    expect(engagementAffinityDelta('feed-open')).toBeGreaterThan(0);
    expect(engagementAffinityDelta('impression')).toBeLessThan(0);
  });
});
