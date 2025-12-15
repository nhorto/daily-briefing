/**
 * Date utility functions for briefing system
 */

import { format, parseISO, subDays, startOfDay } from 'date-fns';

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayDateString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Get yesterday's date in YYYY-MM-DD format
 */
export function getYesterdayDateString(): string {
  return format(subDays(new Date(), 1), 'yyyy-MM-dd');
}

/**
 * Format ISO timestamp to readable time (e.g., "2 hours ago", "Dec 14, 8:30 AM")
 */
export function formatRelativeTime(isoTimestamp: string): string {
  const date = parseISO(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  }

  if (diffHours < 24) {
    const hours = Math.floor(diffHours);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  if (diffHours < 48) {
    return 'Yesterday';
  }

  return format(date, 'MMM d, h:mm a');
}

/**
 * Get freshness category for color-coded badges
 */
export function getFreshnessCategory(isoTimestamp: string): 'fresh' | 'recent' | 'old' {
  const date = parseISO(isoTimestamp);
  const now = new Date();
  const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  if (diffHours < 6) return 'fresh';
  if (diffHours < 18) return 'recent';
  return 'old';
}

/**
 * Get time window for daily briefing
 * Returns { start, end } timestamps for the briefing period
 */
export function getBriefingTimeWindow(dateString: string): { start: string; end: string } {
  const date = parseISO(dateString);
  const start = startOfDay(date);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/**
 * Check if a timestamp is within the briefing window
 */
export function isWithinBriefingWindow(timestamp: string, windowStart: string, windowEnd: string): boolean {
  const ts = parseISO(timestamp);
  const start = parseISO(windowStart);
  const end = parseISO(windowEnd);

  return ts >= start && ts <= end;
}
