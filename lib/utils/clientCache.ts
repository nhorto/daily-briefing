/**
 * Tiny in-memory cache for client page data.
 *
 * Lives at module scope in the browser bundle, so it survives client-side
 * navigation (the module stays loaded): a page can seed its initial state from
 * here and paint instantly on a return visit instead of re-fetching and showing
 * a loading skeleton. Because values are kept in memory (not JSON), Sets/Maps
 * round-trip fine. Cleared by a full page reload.
 *
 * Each page picks a key and a TTL; `fresh` tells the caller whether it can skip
 * the network entirely, while `hit` (cached at all, fresh or stale) lets it at
 * least avoid the skeleton and refresh quietly in the background.
 */
const store = new Map<string, { at: number; data: unknown }>();

export interface CacheLookup<T> {
  /** True if anything is cached for this key (fresh or stale). */
  hit: boolean;
  /** True if the cached value is within the TTL. */
  fresh: boolean;
  /** The cached value, or null when there's no hit. */
  data: T | null;
}

export function readClientCache<T>(key: string, ttlMs: number): CacheLookup<T> {
  const entry = store.get(key);
  if (!entry) return { hit: false, fresh: false, data: null };
  return { hit: true, fresh: Date.now() - entry.at < ttlMs, data: entry.data as T };
}

export function writeClientCache<T>(key: string, data: T): void {
  store.set(key, { at: Date.now(), data });
}
