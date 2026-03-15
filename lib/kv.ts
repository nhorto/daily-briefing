/**
 * Vercel KV Storage Layer
 * Handles all interactions with Vercel KV (Redis)
 * Falls back to in-memory storage for local development
 */

import { kv } from '@vercel/kv';
import type { Briefing, DailyIntelligence, Source } from './types';

// Check if KV is configured
const hasKV = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

// In-memory storage fallback for local development
const localStore = new Map<string, any>();

// Storage abstraction layer
const store = {
  async get<T>(key: string): Promise<T | null> {
    if (hasKV) {
      return await kv.get<T>(key);
    }
    return localStore.get(key) ?? null;
  },

  async set(key: string, value: any, options?: { ex?: number }): Promise<void> {
    if (hasKV) {
      await kv.set(key, value, options as any);
    } else {
      localStore.set(key, value);
      // For local storage, we ignore TTL options
    }
  },

  async del(key: string): Promise<void> {
    if (hasKV) {
      await kv.del(key);
    } else {
      localStore.delete(key);
    }
  },
};

console.log(`[KV] Using ${hasKV ? 'Vercel KV' : 'local in-memory'} storage`);

// KV Key Constants
const KEYS = {
  BRIEFING_TODAY: 'briefing:today',
  INTELLIGENCE_TODAY: 'intelligence:today',
  SOURCES_CONFIG: 'sources:config',
  READ_ARTICLES: 'read:articles',
  briefingByDate: (date: string) => `briefing:${date}`,
};

// TTL Constants (in seconds)
const TTL = {
  DAY: 86400, // 24 hours
  WEEK: 604800, // 7 days
  MONTH: 2592000, // 30 days
};

/**
 * Store today's briefing with 24-hour auto-expiration
 */
export async function storeBriefing(briefing: Briefing): Promise<void> {
  try {
    // Store as "today's briefing" with 24h expiration
    await store.set(KEYS.BRIEFING_TODAY, JSON.stringify(briefing), {
      ex: TTL.DAY,
    });

    // Also store by specific date with 7-day expiration (for short-term history)
    const dateKey = KEYS.briefingByDate(briefing.date);
    await store.set(dateKey, JSON.stringify(briefing), {
      ex: TTL.WEEK,
    });

    console.log(`[KV] Stored briefing for ${briefing.date}`);
  } catch (error) {
    console.error('[KV] Error storing briefing:', error);
    throw new Error('Failed to store briefing in KV');
  }
}

/**
 * Retrieve today's briefing
 */
export async function getTodaysBriefing(): Promise<Briefing | null> {
  try {
    const data = await store.get<string>(KEYS.BRIEFING_TODAY);
    if (!data) return null;

    const briefing = typeof data === 'string' ? JSON.parse(data) : data;
    return briefing as Briefing;
  } catch (error) {
    console.error("[KV] Error getting today's briefing:", error);
    return null;
  }
}

/**
 * Retrieve briefing by specific date
 */
export async function getBriefingByDate(date: string): Promise<Briefing | null> {
  try {
    const data = await store.get<string>(KEYS.briefingByDate(date));
    if (!data) return null;

    const briefing = typeof data === 'string' ? JSON.parse(data) : data;
    return briefing as Briefing;
  } catch (error) {
    console.error(`[KV] Error getting briefing for ${date}:`, error);
    return null;
  }
}

/**
 * Store source configuration (no expiration)
 */
export async function storeSources(sources: Source[]): Promise<void> {
  try {
    await store.set(KEYS.SOURCES_CONFIG, JSON.stringify(sources));
    console.log(`[KV] Stored ${sources.length} sources`);
  } catch (error) {
    console.error('[KV] Error storing sources:', error);
    throw new Error('Failed to store sources in KV');
  }
}

/**
 * Retrieve all configured sources
 */
export async function getSources(): Promise<Source[]> {
  try {
    const data = await store.get<string>(KEYS.SOURCES_CONFIG);
    if (!data) return [];

    const sources = typeof data === 'string' ? JSON.parse(data) : data;
    return sources as Source[];
  } catch (error) {
    console.error('[KV] Error getting sources:', error);
    return [];
  }
}

/**
 * Get active sources only
 */
export async function getActiveSources(): Promise<Source[]> {
  const sources = await getSources();
  return sources.filter((s) => s.isActive);
}

/**
 * Add a new source
 */
export async function addSource(source: Source): Promise<void> {
  const sources = await getSources();
  sources.push(source);
  await storeSources(sources);
}

/**
 * Update an existing source
 */
export async function updateSource(sourceId: string, updates: Partial<Source>): Promise<void> {
  const sources = await getSources();
  const index = sources.findIndex((s) => s.id === sourceId);

  if (index === -1) {
    throw new Error(`Source with id ${sourceId} not found`);
  }

  sources[index] = { ...sources[index]!, ...updates };
  await storeSources(sources);
}

/**
 * Delete a source
 */
export async function deleteSource(sourceId: string): Promise<void> {
  const sources = await getSources();
  const filtered = sources.filter((s) => s.id !== sourceId);

  if (filtered.length === sources.length) {
    throw new Error(`Source with id ${sourceId} not found`);
  }

  await storeSources(filtered);
}

/**
 * Update last fetched timestamp for a source
 */
export async function updateSourceLastFetched(sourceId: string, timestamp: string): Promise<void> {
  await updateSource(sourceId, { lastFetchedAt: timestamp });
}

/**
 * Store today's intelligence summary
 */
export async function storeIntelligence(intelligence: DailyIntelligence): Promise<void> {
  try {
    await store.set(KEYS.INTELLIGENCE_TODAY, JSON.stringify(intelligence), {
      ex: TTL.DAY,
    });
    console.log('[KV] Stored intelligence summary');
  } catch (error) {
    console.error('[KV] Error storing intelligence:', error);
    throw new Error('Failed to store intelligence in KV');
  }
}

/**
 * Retrieve today's intelligence summary
 */
export async function getTodaysIntelligence(): Promise<DailyIntelligence | null> {
  try {
    const data = await store.get<string>(KEYS.INTELLIGENCE_TODAY);
    if (!data) return null;

    const intelligence = typeof data === 'string' ? JSON.parse(data) : data;
    return intelligence as DailyIntelligence;
  } catch (error) {
    console.error("[KV] Error getting today's intelligence:", error);
    return null;
  }
}

/**
 * Mark a single article as read
 */
export async function markArticleRead(articleId: string): Promise<void> {
  try {
    const readIds = await getReadArticleIds();
    if (!readIds.includes(articleId)) {
      readIds.push(articleId);
      await store.set(KEYS.READ_ARTICLES, JSON.stringify(readIds), { ex: TTL.MONTH });
    }
  } catch (error) {
    console.error('[KV] Error marking article as read:', error);
    throw new Error('Failed to mark article as read');
  }
}

/**
 * Get all read article IDs
 */
export async function getReadArticleIds(): Promise<string[]> {
  try {
    const data = await store.get<string>(KEYS.READ_ARTICLES);
    if (!data) return [];
    const ids = typeof data === 'string' ? JSON.parse(data) : data;
    return ids as string[];
  } catch (error) {
    console.error('[KV] Error getting read article IDs:', error);
    return [];
  }
}

/**
 * Mark multiple articles as read
 */
export async function markAllArticlesRead(articleIds: string[]): Promise<void> {
  try {
    const readIds = await getReadArticleIds();
    const readSet = new Set(readIds);
    for (const id of articleIds) {
      readSet.add(id);
    }
    await store.set(KEYS.READ_ARTICLES, JSON.stringify([...readSet]), { ex: TTL.MONTH });
  } catch (error) {
    console.error('[KV] Error marking all articles as read:', error);
    throw new Error('Failed to mark articles as read');
  }
}

/**
 * Clear all briefings (for testing/development)
 */
export async function clearAllBriefings(): Promise<void> {
  try {
    await store.del(KEYS.BRIEFING_TODAY);
    console.log('[KV] Cleared all briefings');
  } catch (error) {
    console.error('[KV] Error clearing briefings:', error);
  }
}

/**
 * Health check - verify KV connection
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const testKey = 'health:check';
    const testValue = Date.now().toString();

    await store.set(testKey, testValue, { ex: 10 });
    const retrieved = await store.get(testKey);

    return retrieved === testValue;
  } catch (error) {
    console.error('[KV] Health check failed:', error);
    return false;
  }
}
