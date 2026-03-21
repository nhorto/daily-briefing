/**
 * Vercel KV Storage Layer
 * Handles all interactions with Vercel KV (Redis)
 * Falls back to SQLite for local development (persists across restarts)
 */

import { kv } from '@vercel/kv';
import { Database } from 'bun:sqlite';
import { join } from 'path';
import type { Briefing, DailyIntelligence, Source, UserPreferences } from './types';
import { DEFAULT_PREFERENCES } from './types';

// Check if KV is configured
const hasKV = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

// SQLite fallback for local development — persists to data/local.db
let db: Database | null = null;

function getLocalDb(): Database {
  if (!db) {
    const dbPath = join(process.cwd(), 'data', 'local.db');
    // Ensure directory exists
    const { mkdirSync } = require('fs');
    mkdirSync(join(process.cwd(), 'data'), { recursive: true });

    db = new Database(dbPath);
    db.run(`CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER
    )`);
  }
  return db;
}

// Storage abstraction layer
const store = {
  async get<T>(key: string): Promise<T | null> {
    if (hasKV) {
      return await kv.get<T>(key);
    }
    const localDb = getLocalDb();
    const row = localDb.query('SELECT value, expires_at FROM kv WHERE key = ?').get(key) as { value: string; expires_at: number | null } | null;
    if (!row) return null;

    // Check TTL expiration
    if (row.expires_at && Date.now() > row.expires_at) {
      localDb.query('DELETE FROM kv WHERE key = ?').run(key);
      return null;
    }

    return row.value as T;
  },

  async set(key: string, value: any, options?: { ex?: number }): Promise<void> {
    if (hasKV) {
      await kv.set(key, value, options as any);
    } else {
      const localDb = getLocalDb();
      const expiresAt = options?.ex ? Date.now() + options.ex * 1000 : null;
      localDb.query(
        'INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, ?)'
      ).run(key, value, expiresAt);
    }
  },

  async del(key: string): Promise<void> {
    if (hasKV) {
      await kv.del(key);
    } else {
      const localDb = getLocalDb();
      localDb.query('DELETE FROM kv WHERE key = ?').run(key);
    }
  },
};

console.log(`[KV] Using ${hasKV ? 'Vercel KV' : 'local SQLite'} storage`);

/**
 * Auto-seed from a config JSON file when the DB is empty.
 * Looks for config/{filename} in the project root.
 */
async function seedFromConfigFile<T>(filename: string, key: string): Promise<T | null> {
  try {
    const configPath = join(process.cwd(), 'config', filename);
    const file = Bun.file(configPath);
    if (await file.exists()) {
      const data = await file.json();
      await store.set(key, JSON.stringify(data));
      console.log(`[KV] Auto-seeded from config/${filename}`);
      return data as T;
    }
  } catch (error) {
    // Config file doesn't exist or is invalid — that's fine
  }
  return null;
}

// KV Key Constants
const KEYS = {
  BRIEFING_TODAY: 'briefing:today',
  INTELLIGENCE_TODAY: 'intelligence:today',
  SOURCES_CONFIG: 'sources:config',
  READ_ARTICLES: 'read:articles',
  PREFERENCES: 'user:preferences',
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
 * Retrieve all configured sources.
 * On first boot, auto-seeds from config/sources.json if the DB is empty.
 */
export async function getSources(): Promise<Source[]> {
  try {
    const data = await store.get<string>(KEYS.SOURCES_CONFIG);
    if (data) {
      const sources = typeof data === 'string' ? JSON.parse(data) : data;
      return sources as Source[];
    }

    // Auto-seed from config file if DB is empty
    return await seedFromConfigFile<Source[]>('sources.json', KEYS.SOURCES_CONFIG) ?? [];
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
 * Get user preferences (returns defaults if none stored).
 * On first boot, auto-seeds from config/preferences.json if available.
 */
export async function getPreferences(): Promise<UserPreferences> {
  try {
    const data = await store.get<string>(KEYS.PREFERENCES);
    if (data) {
      const prefs = typeof data === 'string' ? JSON.parse(data) : data;
      return prefs as UserPreferences;
    }

    // Try auto-seeding from config file
    const seeded = await seedFromConfigFile<UserPreferences>('preferences.json', KEYS.PREFERENCES);
    if (seeded) return seeded;

    return { ...DEFAULT_PREFERENCES, updatedAt: new Date().toISOString() };
  } catch (error) {
    console.error('[KV] Error getting preferences:', error);
    return { ...DEFAULT_PREFERENCES, updatedAt: new Date().toISOString() };
  }
}

/**
 * Store user preferences (no TTL — persistent)
 */
export async function storePreferences(prefs: UserPreferences): Promise<void> {
  try {
    await store.set(KEYS.PREFERENCES, JSON.stringify(prefs));
    console.log('[KV] Stored user preferences');
  } catch (error) {
    console.error('[KV] Error storing preferences:', error);
    throw new Error('Failed to store preferences');
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
