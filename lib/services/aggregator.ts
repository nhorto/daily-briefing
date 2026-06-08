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
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
    ],
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
      } catch (_rssError) {
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

  // rss-parser's Item typing is awkward once customFields are added; treat items
  // loosely so we can read standard and custom fields uniformly.
  for (const item of feed.items as any[]) {
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
      imageUrl: extractImageFromRssItem(item, source.url),
    });
  }

  console.log(`[Aggregator] Fetched ${articles.length} articles from ${source.name} (RSS)`);
  return articles;
}

/**
 * Fetch and parse HTML webpage using Readability
 */
async function fetchHTMLPage(source: Source, _sinceTimestamp?: string): Promise<Article[]> {
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
      imageUrl: extractOgImage(dom.window.document, source.url),
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
  const blogPathPattern = /\/(blog|posts?|articles?|news|stories|updates?|engineering|research)\//i;

  const containers = document.querySelectorAll('article, main, [class*="post"], [class*="article"], [class*="blog"], [class*="entry"], [class*="story"], [class*="feed"], [class*="list"]');

  const candidateAnchors: Element[] = [];

  if (containers.length > 0) {
    containers.forEach((container) => {
      const anchors = container.querySelectorAll('a[href]');
      anchors.forEach((a) => {
        candidateAnchors.push(a);
      });
    });
  } else {
    const body = document.querySelector('body');
    if (body) {
      const allAnchors = body.querySelectorAll('a[href]');
      allAnchors.forEach((a) => {
        candidateAnchors.push(a);
      });
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

    if (absoluteUrl === baseUrl || absoluteUrl === `${baseUrl}/`) continue;

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
      imageUrl: extractOgImage(dom.window.document, url),
    };
  } catch (error) {
    console.warn(`[Aggregator] Error fetching article ${url}:`, (error as Error).message);
    return null;
  }
}

/** Does this URL look like a direct image link? */
function looksLikeImage(url: string): boolean {
  return /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url);
}

/** Resolve a possibly-relative image URL against the page/feed URL. */
function absolutizeUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

/**
 * Pull a thumbnail URL out of an RSS item: enclosure, media:thumbnail,
 * media:content, or the first <img> in the content HTML.
 */
export function extractImageFromRssItem(item: any, baseUrl: string): string | undefined {
  // RSS <enclosure>
  const enclosure = item.enclosure;
  if (enclosure?.url && (enclosure.type?.startsWith('image') || looksLikeImage(enclosure.url))) {
    return absolutizeUrl(enclosure.url, baseUrl);
  }

  // <media:thumbnail>
  const thumb = item.mediaThumbnail?.$?.url || item.mediaThumbnail?.url;
  if (thumb) return absolutizeUrl(thumb, baseUrl);

  // <media:content> (may be a single object or an array)
  const media = item.mediaContent;
  const mediaItems = Array.isArray(media) ? media : media ? [media] : [];
  for (const m of mediaItems) {
    const url = m?.$?.url;
    if (!url) continue;
    const medium = m?.$?.medium;
    const type = m?.$?.type;
    if (medium === 'image' || type?.startsWith('image') || looksLikeImage(url)) {
      return absolutizeUrl(url, baseUrl);
    }
  }

  // First <img> in the content HTML
  const html: string = item['content:encoded'] || item.content || '';
  const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  if (match?.[1]) return absolutizeUrl(decodeEntities(match[1]), baseUrl);

  return undefined;
}

/**
 * Extract an og:image / twitter:image from an HTML document (absolute URL).
 */
export function extractOgImage(document: Document, baseUrl: string): string | undefined {
  const selectors = [
    'meta[property="og:image"]',
    'meta[property="og:image:url"]',
    'meta[name="og:image"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
    'meta[property="twitter:image"]',
  ];
  for (const selector of selectors) {
    const content = document.querySelector(selector)?.getAttribute('content');
    if (content) return absolutizeUrl(content, baseUrl);
  }
  return undefined;
}

/**
 * Extract an og:image / twitter:image from raw HTML using regex (no DOM), so we
 * can cheaply enrich many articles whose feeds carry no image without spinning
 * up JSDOM per page. Handles either attribute order (property before/after content).
 */
export function extractOgImageFromHtml(html: string, baseUrl: string): string | undefined {
  const metaTags = html.match(/<meta[^>]+>/gi);
  if (!metaTags) return undefined;

  // Priority order — prefer og:image, fall back to twitter:image.
  const keys = ['og:image:url', 'og:image', 'twitter:image:src', 'twitter:image'];
  for (const key of keys) {
    const keyPattern = new RegExp(`(?:property|name)\\s*=\\s*["']${key}["']`, 'i');
    for (const tag of metaTags) {
      if (keyPattern.test(tag)) {
        const content = /content\s*=\s*["']([^"']+)["']/i.exec(tag);
        if (content?.[1]) return absolutizeUrl(decodeEntities(content[1]), baseUrl);
      }
    }
  }
  return undefined;
}

/**
 * Best-effort image enrichment: for any article lacking an image, fetch its page
 * and pull the og:image. Many feeds (TechCrunch, OpenAI, Hacker News) carry no
 * image, so this is what gives those sources thumbnails.
 *
 * Bounded concurrency + a short per-request timeout keep it from dominating
 * aggregation time; failures are swallowed (the article simply stays imageless).
 * Mutates the passed articles in place; returns how many images were filled in.
 */
export async function enrichArticleImages(
  articles: Article[],
  concurrency = 6
): Promise<number> {
  const targets = articles.filter((a) => !a.imageUrl);
  if (targets.length === 0) return 0;

  let cursor = 0;
  let filled = 0;

  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      const article = targets[cursor++]!;
      try {
        const response = await fetch(article.url, {
          headers: { 'User-Agent': 'DailyBriefing/1.0' },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) continue;
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('html')) continue;

        const html = await response.text();
        const image = extractOgImageFromHtml(html, article.url);
        if (image) {
          article.imageUrl = image;
          filled++;
        }
      } catch {
        // Best-effort: leave the article without an image.
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, () => worker())
  );

  console.log(`[Aggregator] Image enrichment filled ${filled}/${targets.length} missing images`);
  return filled;
}

/**
 * Fetch an article page and extract its full readable text via Readability,
 * cleaned and capped. Used by the chat so it can answer detailed questions about
 * an article (and summarize it) instead of relying on just the title + short
 * excerpt. Returns null if the page can't be fetched or no text is extractable.
 */
export async function fetchArticleFullText(
  url: string,
  maxChars = 12000
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'DailyBriefing/1.0' },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('html')) return null;

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();

    const text = article?.textContent ? cleanText(article.textContent) : '';
    if (!text) return null;

    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
  } catch {
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
          if (!Number.isNaN(date.getTime())) {
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
    paramsToRemove.forEach((param) => {
      parsed.searchParams.delete(param);
    });
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Extract clean excerpt from content (max 300 chars)
 */
function extractExcerpt(content: string): string {
  const text = decodeEntities(content.replace(/<[^>]*>/g, ''));
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

  return `${truncated}...`;
}

/**
 * Decode HTML entities (numeric + common named) so titles/excerpts read cleanly
 * instead of showing raw entities like &#8217; or &amp;.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(parseInt(n, 10));
      } catch {
        return _;
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch {
        return _;
      }
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&'); // decode last so it can't double-decode
}

/**
 * Clean text (remove extra whitespace, decode HTML entities)
 */
function cleanText(text: string): string {
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
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
