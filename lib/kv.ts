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
import type {
  Article,
  Briefing,
  DailyIntelligence,
  EngagementType,
  FeedbackSignal,
  ProfileState,
  SavedArticle,
  Source,
  UserPreferences,
} from './types';
import {
  DEFAULT_PREFERENCES,
  MULTI_CLUSTER_MIN_LIKES,
  PROFILE_DISLIKE_WEIGHT,
  PROFILE_MAX_CENTROIDS,
  PROFILE_MIN_CENTROIDS,
  PROFILE_VECTORS_CAP,
} from './types';
import {
  addVectors,
  kMeans,
  normalizeVector,
  scaleVector,
  subtractVectors,
} from './utils/vector';

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
  BOOKMARKS: 'bookmarks',
  PROFILE: 'user:profile',
  ENGAGEMENT_SEEN: 'engagement:seen',
  IMPRESSIONS: 'impressions',
  CLICK_RANKS: 'engagement:click-ranks',
  briefingByDate: (date: string) => `briefing:${date}`,
  articleContent: (url: string) => `content:${url}`,
  embeddingById: (id: string) => `emb:${id}`,
};

/** Max number of seen article URLs to retain (most-recent-first). */
const SEEN_URLS_CAP = 5000;

/** Max click-rank samples retained for position-bias analysis (most-recent-first). */
const CLICK_RANKS_CAP = 1000;

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
    ...(prefs.interestBaseline ? { interestBaseline: prefs.interestBaseline } : {}),
    ...(prefs.onboardedAt ? { onboardedAt: prefs.onboardedAt } : {}),
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
 * Get saved/bookmarked articles, newest first. Persistent (no TTL).
 */
export async function getBookmarks(): Promise<SavedArticle[]> {
  try {
    const data = await store.get<string>(KEYS.BOOKMARKS);
    if (!data) return [];
    return (typeof data === 'string' ? JSON.parse(data) : data) as SavedArticle[];
  } catch (error) {
    console.error('[KV] Error getting bookmarks:', error);
    return [];
  }
}

/**
 * Bookmark an article (stores a full snapshot). Idempotent by URL — saving an
 * already-saved article is a no-op. Returns the updated list.
 */
export async function addBookmark(article: Article): Promise<SavedArticle[]> {
  const list = await getBookmarks();
  if (list.some((b) => b.url === article.url)) return list;
  const updated = [{ ...article, savedAt: new Date().toISOString() }, ...list];
  await store.set(KEYS.BOOKMARKS, JSON.stringify(updated));
  return updated;
}

/** Remove a bookmark by article URL. Returns the updated list. */
export async function removeBookmark(url: string): Promise<SavedArticle[]> {
  const list = await getBookmarks();
  const updated = list.filter((b) => b.url !== url);
  await store.set(KEYS.BOOKMARKS, JSON.stringify(updated));
  return updated;
}

/**
 * Get a cached article embedding by article id (30-day TTL). Embeddings are
 * deterministic per (text, model, dimensions), so a retained article is only
 * embedded once; this cache is also how feedback/profile code looks up the
 * vector for an article after the briefing it came from has rolled over.
 */
export async function getCachedEmbedding(articleId: string): Promise<number[] | null> {
  try {
    const data = await store.get<string>(KEYS.embeddingById(articleId));
    if (!data) return null;
    return (typeof data === 'string' ? JSON.parse(data) : data) as number[];
  } catch (error) {
    console.error('[KV] Error getting cached embedding:', error);
    return null;
  }
}

/** Cache an article's embedding by id (30-day TTL). */
export async function setCachedEmbedding(articleId: string, embedding: number[]): Promise<void> {
  try {
    await store.set(KEYS.embeddingById(articleId), JSON.stringify(embedding), { ex: TTL.MONTH });
  } catch (error) {
    console.error('[KV] Error caching embedding:', error);
  }
}

/** Cache many embeddings at once (best-effort). */
export async function setCachedEmbeddings(entries: Array<[string, number[]]>): Promise<void> {
  await Promise.all(entries.map(([id, vec]) => setCachedEmbedding(id, vec)));
}

/**
 * The user's interest profile, accumulated incrementally from feedback so it
 * survives briefing regenerations (article ids change each run, so we fold a
 * vector in at feedback time rather than re-deriving from ids later). Stores
 * running sums of liked ("pos") and disliked ("neg") embeddings.
 */
export async function getProfileState(): Promise<ProfileState | null> {
  try {
    const data = await store.get<string>(KEYS.PROFILE);
    if (!data) return null;
    return (typeof data === 'string' ? JSON.parse(data) : data) as ProfileState;
  } catch (error) {
    console.error('[KV] Error getting profile state:', error);
    return null;
  }
}

/**
 * Fold one embedding into the profile. `polarity` > 0 for liked/saved, < 0 for
 * disliked/hidden. If the embedding dimension changes (model/dims swap), the
 * profile resets rather than mixing incompatible vectors.
 */
export async function updateProfile(embedding: number[], polarity: number): Promise<void> {
  if (embedding.length === 0) return;
  try {
    let state = await getProfileState();
    const dim = embedding.length;
    if (!state || state.dim !== dim) {
      state = {
        posSum: new Array<number>(dim).fill(0),
        posCount: 0,
        negSum: new Array<number>(dim).fill(0),
        negCount: 0,
        dim,
        updatedAt: new Date().toISOString(),
      };
    }
    if (polarity >= 0) {
      state.posSum = addVectors(state.posSum, embedding);
      state.posCount += 1;
      // Retain the exemplar (newest-first, capped) so the profile can be split
      // into k interest centroids once enough likes accumulate (Phase 5).
      state.posVectors = [embedding, ...(state.posVectors ?? [])].slice(0, PROFILE_VECTORS_CAP);
    } else {
      state.negSum = addVectors(state.negSum, embedding);
      state.negCount += 1;
    }
    state.updatedAt = new Date().toISOString();
    await store.set(KEYS.PROFILE, JSON.stringify(state));
  } catch (error) {
    console.error('[KV] Error updating profile:', error);
  }
}

/**
 * The current profile vector = normalize(mean(liked) − λ·mean(disliked)).
 * Returns null until there's at least one positive signal (cold start), so the
 * ranker can fall back to importance + affinity.
 */
export async function getProfileVector(): Promise<number[] | null> {
  const state = await getProfileState();
  if (!state || state.posCount === 0) return null;
  const meanPos = scaleVector(state.posSum, 1 / state.posCount);
  if (state.negCount === 0) return normalizeVector(meanPos);
  const meanNeg = scaleVector(state.negSum, 1 / state.negCount);
  return normalizeVector(subtractVectors(meanPos, scaleVector(meanNeg, PROFILE_DISLIKE_WEIGHT)));
}

/** k for the multi-cluster profile, scaled to the number of liked exemplars. */
function centroidCount(n: number): number {
  return Math.min(PROFILE_MAX_CENTROIDS, Math.max(PROFILE_MIN_CENTROIDS, Math.round(Math.sqrt(n / 2))));
}

/**
 * The user's interest profile as one *or more* centroids (Phase 5). Personal fit
 * is then the *max* cosine to any centroid, so a niche interest gets its own
 * cluster instead of being averaged into the dominant one (§A5).
 *
 * Below {@link MULTI_CLUSTER_MIN_LIKES} retained liked exemplars (or for older
 * profiles that predate exemplar retention), this returns the single centroid —
 * identical to {@link getProfileVector} — so multi-cluster activates gracefully
 * as likes accumulate. Each centroid is pushed away from disliked content
 * (− λ·mean(neg)) and L2-normalized. Returns null at cold start (no likes yet).
 */
export async function getProfileCentroids(): Promise<number[][] | null> {
  const state = await getProfileState();
  if (!state || state.posCount === 0) return null;

  const meanNeg = state.negCount > 0 ? scaleVector(state.negSum, 1 / state.negCount) : null;
  const applyNeg = (v: number[]) =>
    normalizeVector(meanNeg ? subtractVectors(v, scaleVector(meanNeg, PROFILE_DISLIKE_WEIGHT)) : v);

  const exemplars = state.posVectors ?? [];
  if (exemplars.length >= MULTI_CLUSTER_MIN_LIKES) {
    const centroids = kMeans(exemplars, centroidCount(exemplars.length));
    if (centroids.length > 0) return centroids.map(applyNeg);
  }

  // Single-centroid fallback (cold-ish start or pre-Phase-5 profile).
  return [applyNeg(scaleVector(state.posSum, 1 / state.posCount))];
}

/**
 * Record that an implicit engagement signal of a given type has been applied for
 * an article, so repeated fires (re-renders, re-scrolls) don't multiply its
 * effect. Returns true if this is the FIRST time for this (article, type) — the
 * caller should only apply the model update when true. Ephemeral (30-day TTL).
 */
export async function recordEngagementOnce(
  articleId: string,
  type: EngagementType
): Promise<boolean> {
  try {
    const data = await store.get<string>(KEYS.ENGAGEMENT_SEEN);
    const map = (data ? (typeof data === 'string' ? JSON.parse(data) : data) : {}) as Record<
      string,
      EngagementType[]
    >;
    const seen = map[articleId] ?? [];
    if (seen.includes(type)) return false;
    map[articleId] = [...seen, type];
    await store.set(KEYS.ENGAGEMENT_SEEN, JSON.stringify(map), { ex: TTL.MONTH });
    return true;
  } catch (error) {
    console.error('[KV] Error recording engagement:', error);
    return false;
  }
}

/**
 * Increment the impression counter for an article (how many times it's been
 * shown in the feed). Feeds Phase 5 impression-discounting. Ephemeral (30-day TTL).
 */
export async function incrementImpression(articleId: string): Promise<void> {
  try {
    const data = await store.get<string>(KEYS.IMPRESSIONS);
    const map = (data ? (typeof data === 'string' ? JSON.parse(data) : data) : {}) as Record<
      string,
      number
    >;
    map[articleId] = (map[articleId] ?? 0) + 1;
    await store.set(KEYS.IMPRESSIONS, JSON.stringify(map), { ex: TTL.MONTH });
  } catch (error) {
    console.error('[KV] Error incrementing impression:', error);
  }
}

/** Get the impression counts (articleId → times shown). */
export async function getImpressions(): Promise<Record<string, number>> {
  try {
    const data = await store.get<string>(KEYS.IMPRESSIONS);
    if (!data) return {};
    return (typeof data === 'string' ? JSON.parse(data) : data) as Record<string, number>;
  } catch (error) {
    console.error('[KV] Error getting impressions:', error);
    return {};
  }
}

/**
 * Article ids the user has actually engaged with (any recorded non-impression
 * signal — feed-open, open-original, read-to-end, genuine dwell). Impressions are
 * counted separately and never land in the engagement-seen map, so its keys are
 * exactly the engaged set — used by Phase 5 fatigue to exempt engaged items from
 * impression discounting.
 */
export async function getEngagedArticleIds(): Promise<string[]> {
  try {
    const data = await store.get<string>(KEYS.ENGAGEMENT_SEEN);
    if (!data) return [];
    const map = (typeof data === 'string' ? JSON.parse(data) : data) as Record<string, unknown>;
    return Object.keys(map);
  } catch (error) {
    console.error('[KV] Error getting engaged article ids:', error);
    return [];
  }
}

/**
 * Log the feed rank a click came from, so position bias can be measured later
 * (top-of-feed items get clicked regardless of relevance). Capped, newest-first.
 */
export async function logClickRank(rank: number): Promise<void> {
  if (!Number.isFinite(rank) || rank < 0) return;
  try {
    const data = await store.get<string>(KEYS.CLICK_RANKS);
    const list = (data ? (typeof data === 'string' ? JSON.parse(data) : data) : []) as number[];
    const updated = [rank, ...list].slice(0, CLICK_RANKS_CAP);
    await store.set(KEYS.CLICK_RANKS, JSON.stringify(updated), { ex: TTL.MONTH });
  } catch (error) {
    console.error('[KV] Error logging click rank:', error);
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
