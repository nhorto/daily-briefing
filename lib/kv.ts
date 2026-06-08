/**
 * Storage Layer
 * Uses Vercel KV (Redis) when configured, otherwise falls back to a local
 * JSON file store for self-hosting / development.
 *
 * The local store is deliberately runtime-agnostic (plain `node:fs` + JSON) so it
 * works identically under both the Node runtime that Next.js uses for `dev`,
 * `build`, and `start`, and under Bun — with no native dependencies.
 */

import { kv } from '@vercel/kv';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import type { Briefing, DailyIntelligence, FeedbackSignal, Source, UserPreferences } from './types';
import { DEFAULT_PREFERENCES } from './types';

// Check if KV is configured
const hasKV = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

// --- Local JSON file store (used when Vercel KV is not configured) ---
// Persists to data/local.json. Values are stored as strings (callers serialize
// with JSON.stringify), alongside an optional expiry timestamp for TTL support.
type LocalEntry = { value: string; expiresAt: number | null };
const LOCAL_DIR = join(process.cwd(), 'data');
const LOCAL_PATH = join(LOCAL_DIR, 'local.json');
let localCache: Record<string, LocalEntry> | null = null;
let localCacheMtime = 0;

// The in-memory cache is keyed to the file's mtime so writes made by another
// module instance (Next dev isolates route bundles) or process are picked up —
// otherwise a reader could serve a stale snapshot indefinitely after a write.
function loadLocal(): Record<string, LocalEntry> {
  try {
    if (!existsSync(LOCAL_PATH)) {
      localCache ??= {};
      return localCache;
    }
    const mtime = statSync(LOCAL_PATH).mtimeMs;
    if (localCache && mtime === localCacheMtime) return localCache;
    localCache = JSON.parse(readFileSync(LOCAL_PATH, 'utf8')) as Record<string, LocalEntry>;
    localCacheMtime = mtime;
  } catch {
    localCache ??= {};
  }
  return localCache;
}

function persistLocal(data: Record<string, LocalEntry>): void {
  mkdirSync(LOCAL_DIR, { recursive: true });
  writeFileSync(LOCAL_PATH, JSON.stringify(data));
  localCache = data;
  try {
    localCacheMtime = statSync(LOCAL_PATH).mtimeMs;
  } catch {
    localCacheMtime = 0;
  }
}

// Storage abstraction layer
const store = {
  async get<T>(key: string): Promise<T | null> {
    if (hasKV) {
      return await kv.get<T>(key);
    }
    const data = loadLocal();
    const entry = data[key];
    if (!entry) return null;

    // Check TTL expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      delete data[key];
      persistLocal(data);
      return null;
    }

    return entry.value as T;
  },

  async set(key: string, value: string, options?: { ex?: number }): Promise<void> {
    if (hasKV) {
      await kv.set(key, value, options as any);
    } else {
      const data = loadLocal();
      data[key] = {
        value,
        expiresAt: options?.ex ? Date.now() + options.ex * 1000 : null,
      };
      persistLocal(data);
    }
  },

  async del(key: string): Promise<void> {
    if (hasKV) {
      await kv.del(key);
    } else {
      const data = loadLocal();
      delete data[key];
      persistLocal(data);
    }
  },
};

console.log(`[KV] Using ${hasKV ? 'Vercel KV' : 'local JSON'} storage`);

/**
 * Auto-seed from a config JSON file when the DB is empty.
 * Looks for config/{filename} in the project root.
 */
async function seedFromConfigFile<T>(filename: string, key: string): Promise<T | null> {
  try {
    const configPath = join(process.cwd(), 'config', filename);
    if (existsSync(configPath)) {
      const data = JSON.parse(readFileSync(configPath, 'utf8'));
      await store.set(key, JSON.stringify(data));
      console.log(`[KV] Auto-seeded from config/${filename}`);
      return data as T;
    }
  } catch (_error) {
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
  ARTICLE_FEEDBACK: 'feedback:articles',
  PREFERENCES: 'user:preferences',
  BRIEFING_DATES: 'briefing:dates',
  SEEN_URLS: 'seen:urls',
  briefingByDate: (date: string) => `briefing:${date}`,
  articleContent: (url: string) => `content:${url}`,
};

/** Max number of seen article URLs to retain (most-recent-first). */
const SEEN_URLS_CAP = 5000;

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

    // Maintain a recent-dates index so the UI can offer history browsing.
    const dates = await getBriefingDates();
    if (!dates.includes(briefing.date)) {
      const updated = [briefing.date, ...dates]
        .sort((a, b) => b.localeCompare(a))
        .slice(0, 30);
      await store.set(KEYS.BRIEFING_DATES, JSON.stringify(updated), { ex: TTL.MONTH });
    }

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
 * List the dates (YYYY-MM-DD) for which a briefing is available, newest first.
 */
export async function getBriefingDates(): Promise<string[]> {
  try {
    const data = await store.get<string>(KEYS.BRIEFING_DATES);
    if (!data) return [];
    return (typeof data === 'string' ? JSON.parse(data) : data) as string[];
  } catch (error) {
    console.error('[KV] Error getting briefing dates:', error);
    return [];
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
      return normalizePreferences(prefs);
    }

    // Try auto-seeding from config file
    const seeded = await seedFromConfigFile<UserPreferences>('preferences.json', KEYS.PREFERENCES);
    if (seeded) return normalizePreferences(seeded);

    return { ...DEFAULT_PREFERENCES, updatedAt: new Date().toISOString() };
  } catch (error) {
    console.error('[KV] Error getting preferences:', error);
    return { ...DEFAULT_PREFERENCES, updatedAt: new Date().toISOString() };
  }
}

/**
 * Ensure stored preferences have every field current code expects, so older
 * saved data (e.g. without the `sources` map) keeps working.
 */
function normalizePreferences(prefs: Partial<UserPreferences>): UserPreferences {
  return {
    interests: { ...DEFAULT_PREFERENCES.interests, ...(prefs.interests ?? {}) },
    sources: prefs.sources ?? {},
    mutedKeywords: prefs.mutedKeywords ?? [],
    updatedAt: prefs.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Get the per-article feedback map (articleId → signal). Ephemeral (30-day TTL).
 */
export async function getArticleFeedback(): Promise<Record<string, FeedbackSignal>> {
  try {
    const data = await store.get<string>(KEYS.ARTICLE_FEEDBACK);
    if (!data) return {};
    return (typeof data === 'string' ? JSON.parse(data) : data) as Record<string, FeedbackSignal>;
  } catch (error) {
    console.error('[KV] Error getting article feedback:', error);
    return {};
  }
}

/**
 * Record (or clear) the feedback signal for a single article.
 * Passing `null` removes any existing signal for that article.
 */
export async function setArticleFeedback(
  articleId: string,
  signal: FeedbackSignal | null
): Promise<Record<string, FeedbackSignal>> {
  const map = await getArticleFeedback();
  if (signal === null) {
    delete map[articleId];
  } else {
    map[articleId] = signal;
  }
  await store.set(KEYS.ARTICLE_FEEDBACK, JSON.stringify(map), { ex: TTL.MONTH });
  return map;
}

/**
 * Get the full extracted text of an article (keyed by URL so it survives
 * briefing regenerations). Used by the chat to read the whole article on demand.
 */
export async function getCachedArticleContent(url: string): Promise<string | null> {
  try {
    return await store.get<string>(KEYS.articleContent(url));
  } catch (error) {
    console.error('[KV] Error getting cached article content:', error);
    return null;
  }
}

/** Cache an article's extracted full text (7-day TTL). */
export async function setCachedArticleContent(url: string, content: string): Promise<void> {
  try {
    await store.set(KEYS.articleContent(url), content, { ex: TTL.WEEK });
  } catch (error) {
    console.error('[KV] Error caching article content:', error);
  }
}

/**
 * Get the set of article URLs we've already surfaced in a briefing. Used to gate
 * date-unreliable sources (scraped blogs like Anthropic Engineering, whose pages
 * expose no machine-readable publish date) so their back-catalog isn't re-shown
 * every run — only genuinely new posts appear.
 */
export async function getSeenUrls(): Promise<Set<string>> {
  try {
    const data = await store.get<string>(KEYS.SEEN_URLS);
    if (!data) return new Set();
    const urls = (typeof data === 'string' ? JSON.parse(data) : data) as string[];
    return new Set(urls);
  } catch (error) {
    console.error('[KV] Error getting seen URLs:', error);
    return new Set();
  }
}

/**
 * Record article URLs as seen. Newest entries go first and the list is capped,
 * so the oldest URLs eventually age out (a long-gone post could resurface, which
 * is fine for rare sources). Persistent (no TTL).
 */
export async function markUrlsSeen(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  try {
    const existing = await getSeenUrls();
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const url of [...urls, ...existing]) {
      if (seen.has(url)) continue;
      seen.add(url);
      merged.push(url);
      if (merged.length >= SEEN_URLS_CAP) break;
    }
    await store.set(KEYS.SEEN_URLS, JSON.stringify(merged));
  } catch (error) {
    console.error('[KV] Error marking URLs seen:', error);
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
