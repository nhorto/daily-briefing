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

/**
 * Determine if two articles are duplicates/similar enough to cluster
 * Uses title similarity as primary signal, excerpt as secondary
 */
export function areArticlesDuplicates(
  article1: Article,
  article2: Article,
  titleThreshold = 0.7,
  excerptThreshold = 0.6
): boolean {
  // Same URL = definite duplicate
  if (article1.url === article2.url) return true;

  const titleSim = calculateTitleSimilarity(article1.title, article2.title);

  // High title similarity = likely duplicate
  if (titleSim > titleThreshold) return true;

  // Medium title similarity + high excerpt similarity = duplicate
  if (titleSim > 0.5) {
    const excerptSim = calculateExcerptSimilarity(article1.excerpt, article2.excerpt);
    return excerptSim > excerptThreshold;
  }

  return false;
}

/**
 * Calculate overall similarity score between two articles
 * Returns weighted average of title (70%) and excerpt (30%) similarity
 */
export function calculateArticleSimilarity(article1: Article, article2: Article): number {
  const titleSim = calculateTitleSimilarity(article1.title, article2.title);
  const excerptSim = calculateExcerptSimilarity(article1.excerpt, article2.excerpt);

  // Weighted average: title matters more than excerpt
  return titleSim * 0.7 + excerptSim * 0.3;
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
