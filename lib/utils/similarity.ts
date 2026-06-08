/**
 * Text similarity utilities using Levenshtein distance
 * For article deduplication and clustering
 */

import { distance as levenshtein } from 'fastest-levenshtein';
import type { Article } from '../types';

/**
 * Calculate similarity between two strings (0-1 scale, 1 = identical)
 * Uses normalized Levenshtein distance
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;

  const dist = levenshtein(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);

  return 1 - dist / maxLen;
}

/**
 * Calculate title similarity between two articles
 */
export function calculateTitleSimilarity(title1: string, title2: string): number {
  return calculateStringSimilarity(title1, title2);
}

/**
 * Calculate excerpt similarity between two articles
 */
export function calculateExcerptSimilarity(excerpt1: string, excerpt2: string): number {
  // Compare first 100 chars for efficiency
  const e1 = excerpt1.slice(0, 100);
  const e2 = excerpt2.slice(0, 100);
  return calculateStringSimilarity(e1, e2);
}

// Common words that carry no topic signal — excluded from token overlap so
// shared filler ("the", "says", "new") doesn't inflate similarity.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'at', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'this', 'that', 'these', 'those', 'it', 'its', 'their', 'our', 'your', 'you',
  'we', 'they', 'he', 'she', 'how', 'what', 'why', 'when', 'where', 'who',
  'which', 'will', 'would', 'can', 'could', 'should', 'has', 'have', 'had',
  'do', 'does', 'did', 'not', 'no', 'new', 'says', 'say', 'said', 'after',
  'before', 'over', 'into', 'about', 'more', 'most', 'than', 'then', 'out',
  'off', 'get', 'gets', 'now', 'amid', 'via', 'amp',
]);

/**
 * Break text into a set of significant lowercase words (stopwords and very short
 * words removed). Used for token-overlap similarity.
 */
export function tokenize(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(' ')
      .filter((word) => word.length > 2 && !STOPWORDS.has(word))
  );
}

/**
 * Jaccard similarity (0-1) of the significant words in two strings. Unlike edit
 * distance, this captures "same story, different headline" — two outlets that
 * cover one event share entities/keywords even when the wording differs.
 */
export function calculateTokenSimilarity(text1: string, text2: string): number {
  const a = tokenize(text1);
  const b = tokenize(text2);
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Overall similarity (0-1) between two articles, used for clustering. Title is
 * the primary signal: we take the stronger of edit-distance similarity (catches
 * near-identical/syndicated headlines) and token overlap (catches same-story,
 * differently-worded headlines), then blend in excerpt token overlap.
 */
export function calculateArticleSimilarity(article1: Article, article2: Article): number {
  const titleLev = calculateTitleSimilarity(article1.title, article2.title);
  const titleTok = calculateTokenSimilarity(article1.title, article2.title);

  // Token (keyword) overlap is the meaningful "same story" signal. Edit distance
  // only counts when it's high enough to mean a near-identical/syndicated headline
  // (≥0.8) — mid-range edit distance between two unrelated titles of similar
  // length is just noise and was creating bogus clusters.
  //
  // We deliberately do NOT use the excerpt: several feeds (notably Hacker News)
  // ship boilerplate descriptions that are near-identical across unrelated posts.
  const levSignal = titleLev >= 0.8 ? titleLev : 0;
  return Math.max(titleTok, levSignal);
}

/**
 * Determine if two articles are similar enough to cluster together.
 * Same URL is always a duplicate; otherwise compare the combined similarity.
 */
export function areArticlesDuplicates(
  article1: Article,
  article2: Article,
  threshold = 0.35
): boolean {
  if (article1.url === article2.url) return true;
  return calculateArticleSimilarity(article1, article2) >= threshold;
}

/**
 * Normalize text for better comparison
 * Removes special characters, extra whitespace, etc.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace special chars with space
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}
