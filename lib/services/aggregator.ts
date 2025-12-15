/**
 * Content Aggregation Service
 * Fetches and parses content from RSS feeds and HTML websites
 */

import Parser from 'rss-parser';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { nanoid } from 'nanoid';
import type { Article, Source } from '../types';

const rssParser = new Parser({
  timeout: 10000, // 10 second timeout
  headers: {
    'User-Agent': 'DailyBriefing/1.0',
  },
});

/**
 * Fetch articles from a single source
 * Auto-detects RSS vs HTML and handles accordingly
 */
export async function fetchFromSource(
  source: Source,
  sinceTimestamp?: string
): Promise<Article[]> {
  console.log(`[Aggregator] Fetching from ${source.name} (${source.type})`);

  try {
    if (source.type === 'rss' || source.type === 'atom') {
      return await fetchRSSFeed(source, sinceTimestamp);
    } else if (source.type === 'html') {
      return await fetchHTMLPage(source, sinceTimestamp);
    } else {
      // Auto-detect: try RSS first, fallback to HTML
      try {
        return await fetchRSSFeed(source, sinceTimestamp);
      } catch (rssError) {
        console.log(`[Aggregator] RSS failed for ${source.name}, trying HTML...`);
        return await fetchHTMLPage(source, sinceTimestamp);
      }
    }
  } catch (error) {
    console.error(`[Aggregator] Error fetching from ${source.name}:`, error);
    throw new Error(`Failed to fetch from ${source.name}: ${(error as Error).message}`);
  }
}

/**
 * Fetch and parse RSS/Atom feed
 */
async function fetchRSSFeed(source: Source, sinceTimestamp?: string): Promise<Article[]> {
  const feed = await rssParser.parseURL(source.url);
  const articles: Article[] = [];

  const sinceDate = sinceTimestamp ? new Date(sinceTimestamp) : null;

  for (const item of feed.items) {
    // Skip if no URL or title
    if (!item.link || !item.title) continue;

    // Parse publish date
    const publishedAt = item.pubDate || item.isoDate || new Date().toISOString();
    const pubDate = new Date(publishedAt);

    // Filter by timestamp if provided
    if (sinceDate && pubDate <= sinceDate) continue;

    // Extract excerpt (use description or content snippet)
    const excerpt = extractExcerpt(item.content || item.contentSnippet || item.description || '');

    articles.push({
      id: nanoid(),
      url: item.link,
      title: cleanText(item.title),
      excerpt,
      author: item.creator || item['dc:creator'] || undefined,
      publishedAt: pubDate.toISOString(),
      sourceId: source.id,
      sourceName: source.name,
      sourceAuthority: source.authority,
      fetchedAt: new Date().toISOString(),
    });
  }

  console.log(`[Aggregator] Fetched ${articles.length} articles from ${source.name} (RSS)`);
  return articles;
}

/**
 * Fetch and parse HTML webpage using Readability
 */
async function fetchHTMLPage(source: Source, sinceTimestamp?: string): Promise<Article[]> {
  const response = await fetch(source.url, {
    headers: {
      'User-Agent': 'DailyBriefing/1.0',
    },
    signal: AbortSignal.timeout(10000), // 10 second timeout
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url: source.url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    throw new Error('Failed to extract article content from HTML');
  }

  // For HTML pages, we get a single "article" representing the page
  // In a more sophisticated version, we'd extract multiple article links
  const articles: Article[] = [
    {
      id: nanoid(),
      url: source.url,
      title: cleanText(article.title),
      excerpt: extractExcerpt(article.textContent || ''),
      author: article.byline || undefined,
      publishedAt: new Date().toISOString(), // HTML pages don't have pubDate
      sourceId: source.id,
      sourceName: source.name,
      sourceAuthority: source.authority,
      fetchedAt: new Date().toISOString(),
    },
  ];

  console.log(`[Aggregator] Fetched ${articles.length} articles from ${source.name} (HTML)`);
  return articles;
}

/**
 * Fetch from multiple sources in parallel with error handling
 */
export async function fetchFromMultipleSources(
  sources: Source[],
  sinceTimestamp?: string
): Promise<{
  articles: Article[];
  errors: Array<{ sourceId: string; sourceName: string; error: string }>;
}> {
  console.log(`[Aggregator] Fetching from ${sources.length} sources...`);

  const results = await Promise.allSettled(
    sources.map((source) => fetchFromSource(source, sinceTimestamp))
  );

  const articles: Article[] = [];
  const errors: Array<{ sourceId: string; sourceName: string; error: string }> = [];

  results.forEach((result, index) => {
    const source = sources[index];

    if (result.status === 'fulfilled') {
      articles.push(...result.value);
    } else {
      console.error(`[Aggregator] Failed to fetch from ${source.name}:`, result.reason);
      errors.push({
        sourceId: source.id,
        sourceName: source.name,
        error: result.reason.message || 'Unknown error',
      });
    }
  });

  // Remove duplicate articles (same URL)
  const uniqueArticles = deduplicateByURL(articles);

  console.log(
    `[Aggregator] Fetched ${uniqueArticles.length} unique articles from ${sources.length} sources (${errors.length} errors)`
  );

  return { articles: uniqueArticles, errors };
}

/**
 * Remove duplicate articles by URL
 */
function deduplicateByURL(articles: Article[]): Article[] {
  const seen = new Set<string>();
  const unique: Article[] = [];

  for (const article of articles) {
    const normalizedURL = normalizeURL(article.url);
    if (!seen.has(normalizedURL)) {
      seen.add(normalizedURL);
      unique.push(article);
    }
  }

  return unique;
}

/**
 * Normalize URL for deduplication (remove tracking params, etc.)
 */
function normalizeURL(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove common tracking parameters
    const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'];
    paramsToRemove.forEach((param) => parsed.searchParams.delete(param));
    return parsed.toString();
  } catch {
    return url; // Return original if parsing fails
  }
}

/**
 * Extract clean excerpt from content (max 300 chars)
 */
function extractExcerpt(content: string): string {
  // Remove HTML tags
  const text = content.replace(/<[^>]*>/g, '');

  // Remove excessive whitespace
  const cleaned = text.replace(/\s+/g, ' ').trim();

  // Truncate to 300 chars
  if (cleaned.length <= 300) return cleaned;

  // Find last sentence boundary before 300 chars
  const truncated = cleaned.slice(0, 300);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastExclamation = truncated.lastIndexOf('!');

  const lastSentence = Math.max(lastPeriod, lastQuestion, lastExclamation);

  if (lastSentence > 200) {
    return truncated.slice(0, lastSentence + 1);
  }

  return truncated + '...';
}

/**
 * Clean text (remove extra whitespace, decode HTML entities)
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

/**
 * Auto-detect feed type from URL
 * Returns 'rss', 'atom', or 'html'
 */
export async function detectFeedType(url: string): Promise<'rss' | 'atom' | 'html'> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'DailyBriefing/1.0' },
      signal: AbortSignal.timeout(5000),
    });

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('rss') || contentType.includes('xml')) {
      // Try parsing to determine if RSS or Atom
      try {
        const feed = await rssParser.parseURL(url);
        return feed.feedUrl?.includes('atom') ? 'atom' : 'rss';
      } catch {
        return 'rss'; // Default to RSS if parsing fails
      }
    }

    return 'html';
  } catch {
    return 'html'; // Default to HTML if detection fails
  }
}
