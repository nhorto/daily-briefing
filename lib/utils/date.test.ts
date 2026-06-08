import { test, expect, describe } from 'bun:test';
import {
  getTodayDateString,
  formatRelativeTime,
  getFreshnessCategory,
  getBriefingTimeWindow,
  isWithinBriefingWindow,
} from './date';

const HOUR = 1000 * 60 * 60;

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * HOUR).toISOString();
}

describe('getTodayDateString', () => {
  test('returns a YYYY-MM-DD string', () => {
    expect(getTodayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('formatRelativeTime', () => {
  test('renders minutes for sub-hour ages', () => {
    expect(formatRelativeTime(new Date(Date.now() - 90 * 1000).toISOString())).toMatch(/minute/);
  });

  test('renders hours for same-day ages', () => {
    expect(formatRelativeTime(hoursAgo(3))).toMatch(/hour/);
  });

  test('renders "Yesterday" between 24 and 48 hours', () => {
    expect(formatRelativeTime(hoursAgo(30))).toBe('Yesterday');
  });
});

describe('getFreshnessCategory', () => {
  test('classifies by age', () => {
    expect(getFreshnessCategory(hoursAgo(1))).toBe('fresh');
    expect(getFreshnessCategory(hoursAgo(10))).toBe('recent');
    expect(getFreshnessCategory(hoursAgo(30))).toBe('old');
  });
});

describe('getBriefingTimeWindow', () => {
  test('spans exactly 24 hours ending at 6am', () => {
    const { start, end } = getBriefingTimeWindow('2026-06-08');
    const span = new Date(end).getTime() - new Date(start).getTime();
    expect(span).toBe(24 * HOUR);
    expect(new Date(end).getHours()).toBe(6);
  });
});

describe('isWithinBriefingWindow', () => {
  const start = '2026-06-07T06:00:00.000Z';
  const end = '2026-06-08T06:00:00.000Z';

  test('returns true inside the window', () => {
    expect(isWithinBriefingWindow('2026-06-07T20:00:00.000Z', start, end)).toBe(true);
  });

  test('returns false outside the window', () => {
    expect(isWithinBriefingWindow('2026-06-08T12:00:00.000Z', start, end)).toBe(false);
  });
});
