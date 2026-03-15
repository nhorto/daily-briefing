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
    } else if (source.type === 'blog') {
      return await fetchBlogIndex(source, sinceTimestamp);
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

  const articles: Article[] = [
    {
      id: nanoid(),
      url: source.url,
      title: cleanText(article.title ?? ''),
      excerpt: extractExcerpt(article.textContent || ''),
      author: article.byline || undefined,
      publishedAt: new Date().toISOString(),
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
 * Fetch and parse a blog index/listing page
 * Discovers article links from the page and fetches each one with Readability
 */
async function fetchBlogIndex(source: Source, sinceTimestamp?: string): Promise<Article[]> {
  const response = await fetch(source.url, {
    headers: {
      'User-Agent': 'DailyBriefing/1.0',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url: source.url });
  const document = dom.window.document;

  const articleLinks = discoverArticleLinks(document, source.url);

  if (articleLinks.length === 0) {
    console.log(`[Aggregator] No article links found on blog index for ${source.name}, falling back to HTML`);
    return await fetchHTMLPage(source, sinceTimestamp);
  }

  const linksToFetch = articleLinks.slice(0, 20);
  console.log(`[Aggregator] Discovered ${articleLinks.length} article links on ${source.name}, fetching ${linksToFetch.length}`);

  const sinceDate = sinceTimestamp ? new Date(sinceTimestamp) : null;
  const articles: Article[] = [];

  const fetchResults = await Promise.allSettled(
    linksToFetch.map((link) => fetchSingleArticle(link, source))
  );

  for (const result of fetchResults) {
    if (result.status === 'fulfilled' && result.value) {
      const article = result.value;
      if (sinceDate) {
        const pubDate = new Date(article.publishedAt);
        if (pubDate <= sinceDate) continue;
      }
      articles.push(article);
    }
  }

  console.log(`[Aggregator] Fetched ${articles.length} articles from ${source.name} (Blog Index)`);
  return articles;
}

/**
 * Discover article links from a blog index page
 */
function discoverArticleLinks(document: Document, baseUrl: string): string[] {
  const seen = new Set<string>();
  const links: string[] = [];

  const datePathPattern = /\/\d{4}\/\d{1,2}\//;
  const blogPathPattern = /\/(blog|posts?|articles?|news|stories|updates?)\//i;

  const containers = document.querySelectorAll('article, main, [class*="post"], [class*="article"], [class*="blog"], [class*="entry"], [class*="story"], [class*="feed"], [class*="list"]');

  let candidateAnchors: Element[] = [];

  if (containers.length > 0) {
    containers.forEach((container) => {
      const anchors = container.querySelectorAll('a[href]');
      anchors.forEach((a) => candidateAnchors.push(a));
    });
  } else {
    const body = document.querySelector('body');
    if (body) {
      const allAnchors = body.querySelectorAll('a[href]');
      allAnchors.forEach((a) => candidateAnchors.push(a));
    }
  }

  for (const anchor of candidateAnchors) {
    const href = anchor.getAttribute('href');
    if (!href) continue;

    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) continue;

    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }

    try {
      const baseHost = new URL(baseUrl).hostname;
      const linkHost = new URL(absoluteUrl).hostname;
      if (linkHost !== baseHost) continue;
    } catch {
      continue;
    }

    if (absoluteUrl === baseUrl || absoluteUrl === baseUrl + '/') continue;

    const path = new URL(absoluteUrl).pathname;
    if (isNavigationLink(path)) continue;

    const isArticleLink =
      datePathPattern.test(path) ||
      blogPathPattern.test(path) ||
      anchor.closest('article') !== null ||
      (anchor.textContent && anchor.textContent.trim().length > 20);

    if (isArticleLink && !seen.has(absoluteUrl)) {
      seen.add(absoluteUrl);
      links.push(absoluteUrl);
    }
  }

  return links;
}

/**
 * Check if a path looks like a navigation/utility link rather than an article
 */
function isNavigationLink(path: string): boolean {
  const navPatterns = [
    /^\/?$/,
    /^\/(about|contact|privacy|terms|login|signup|register|search|tag|tags|category|categories|author|page|feed|rss|sitemap|archive)\/?$/i,
    /^\/(about|contact|privacy|terms|login|signup|register|search)\//i,
    /\.(xml|json|rss|atom)$/i,
    /^\/?(#|mailto:|javascript:)/,
  ];

  return navPatterns.some((pattern) => pattern.test(path));
}

/**
 * Fetch a single article page and extract content with Readability
 */
async function fetchSingleArticle(url: string, source: Source): Promise<Article | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DailyBriefing/1.0',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`[Aggregator] Failed to fetch article ${url}: HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      console.warn(`[Aggregator] Readability failed to parse ${url}`);
      return null;
    }

    const publishedAt = extractPublishedDate(dom.window.document) || new Date().toISOString();

    return {
      id: nanoid(),
      url,
      title: cleanText(article.title ?? ''),
      excerpt: extractExcerpt(article.textContent || ''),
      author: article.byline || undefined,
      publishedAt,
      sourceId: source.id,
      sourceName: source.name,
      sourceAuthority: source.authority,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.warn(`[Aggregator] Error fetching article ${url}:`, (error as Error).message);
    return null;
  }
}

/**
 * Try to extract the published date from HTML meta tags
 */
function extractPublishedDate(document: Document): string | null {
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[name="date"]',
    'meta[name="pubdate"]',
    'meta[name="publish-date"]',
    'meta[property="og:article:published_time"]',
    'meta[name="DC.date.issued"]',
    'time[datetime]',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const value = el.getAttribute('content') || el.getAttribute('datetime');
      if (value) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return date.toISOString();
          }
        } catch {
          // Continue to next selector
        }
      }
    }
  }

  return null;
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
    const source = sources[index]!;

    if (result.status === 'fulfilled') {
      articles.push(...result.value);
    } else {
      console.error(`[Aggregator] Failed to fetch from ${source.name}:`, result.reason);
      errors.push({
        sourceId: source.id,
        sourceName: source.name,
        error: result.reason?.message || 'Unknown error',
      });
    }
  });

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
    const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'];
    paramsToRemove.forEach((param) => parsed.searchParams.delete(param));
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Extract clean excerpt from content (max 300 chars)
 */
function extractExcerpt(content: string): string {
  const text = content.replace(/<[^>]*>/g, '');
  const cleaned = text.replace(/\s+/g, ' ').trim();

  if (cleaned.length <= 300) return cleaned;

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
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

/**
 * Auto-detect feed type from URL
 * Returns 'rss', 'atom', 'html', or 'blog'
 */
export async function detectFeedType(url: string): Promise<'rss' | 'atom' | 'html' | 'blog'> {
  try {
    const urlPath = new URL(url).pathname;
    const isBlogPath = /\/(blog|posts|articles)\/?$/i.test(urlPath);

    const response = await fetch(url, {
      headers: { 'User-Agent': 'DailyBriefing/1.0' },
      signal: AbortSignal.timeout(5000),
    });

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('rss') || contentType.includes('xml')) {
      try {
        const feed = await rssParser.parseURL(url);
        return feed.feedUrl?.includes('atom') ? 'atom' : 'rss';
      } catch {
        return 'rss';
      }
    }

    if (contentType.includes('html') || !contentType) {
      const html = await response.text();
      const dom = new JSDOM(html, { url });
      const document = dom.window.document;

      const articleTags = document.querySelectorAll('article');
      if (articleTags.length >= 3 || (isBlogPath && articleTags.length >= 1)) {
        return 'blog';
      }

      if (isBlogPath) {
        return 'blog';
      }
    }

    return 'html';
  } catch {
    return 'html';
  }
}
