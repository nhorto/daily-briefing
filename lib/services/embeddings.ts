/**
 * Embeddings service — the semantic layer.
 *
 * Turns an article's title + summary into a vector with OpenAI's
 * text-embedding-3-small at 512 dimensions (Matryoshka-shortened from 1536, so
 * it keeps its meaning at a third of the storage). These vectors power "personal
 * fit": how close an article is to the user's profile vector.
 *
 * Cost is ~$0.02/1M tokens → a few cents/month at ~100 articles/day. We embed
 * once per article and cache by id, so retained items never re-embed.
 *
 * See docs/research/recommendation-engine-and-ux.md → Part A4.
 */

import type { Article } from '../types';
import { getOpenAI } from './openai';

/** Embedding model + dimension. Treat the dimension as part of any cache key —
 *  changing it invalidates stored vectors. */
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 512;

/** Max inputs per embeddings request (the API accepts arrays; we chunk to be safe). */
const BATCH_SIZE = 100;
/** Cap per-item text so one long article can't blow the token budget. */
const MAX_CHARS = 1500;

/** The text we embed for an article: its title plus summary (or excerpt). */
export function articleEmbeddingText(article: Pick<Article, 'title' | 'summary' | 'excerpt'>): string {
  const body = article.summary || article.excerpt || '';
  return `${article.title}. ${body}`.slice(0, MAX_CHARS).trim();
}

/**
 * Embed a batch of texts, returning one vector per input (aligned by index).
 * A failed batch yields nulls for those inputs rather than throwing, so the
 * caller (aggregation) can treat embeddings as best-effort like summaries.
 */
export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const out: (number[] | null)[] = new Array(texts.length).fill(null);

  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    try {
      const res = await getOpenAI().embeddings.create({
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        input: batch,
      });
      for (const item of res.data) {
        out[start + item.index] = item.embedding;
      }
    } catch (error) {
      console.error(
        `[Embeddings] Batch ${start}-${start + batch.length} failed (continuing):`,
        (error as Error).message
      );
    }
  }

  return out;
}
