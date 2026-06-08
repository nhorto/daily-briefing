/**
 * Chat API Route
 * Streams AI responses about briefing content using OpenAI.
 *
 * The assistant always has every article's title/source/summary/excerpt in
 * context, and a `readArticles` tool to fetch the FULL text of any article(s) it
 * needs — so it can answer detailed questions about specific articles and
 * synthesize across several. In article mode the focused article's full text is
 * also injected up front (no round trip needed for the obvious case).
 *
 * Runs on the Node runtime (not edge): the tool extracts text with Readability,
 * which needs Node APIs.
 */

import { streamText, convertToModelMessages, tool, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import type { Article } from '@/lib/types';
import { getCachedArticleContent, setCachedArticleContent } from '@/lib/kv';
import { fetchArticleFullText } from '@/lib/services/aggregator';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, articles, clusterId, articleContent } = body;

    if (!messages || messages.length === 0) {
      return new Response('No messages provided', { status: 400 });
    }

    if (!articles || articles.length === 0) {
      return new Response('No briefing context provided', { status: 400 });
    }

    const articleList = articles as Article[];

    // Build context from articles (includes IDs so the model can call the tool).
    const context = buildArticleContext(articleList, clusterId);

    // When the user is viewing a single article, inject its full text up front so
    // the obvious "tell me about this article" case needs no extra round trip.
    const fullText =
      typeof articleContent === 'string' && articleContent.trim()
        ? `\n\nFULL TEXT OF THE ARTICLE THE USER IS CURRENTLY VIEWING (authoritative for that article — no need to re-read it with the tool):\n"""\n${articleContent}\n"""`
        : '';

    const systemPrompt = `You are a briefing assistant helping the user understand today's content aggregation.

You have access to ${articleList.length} articles from today's briefing (listed below with their IDs, titles, sources, summaries, and short excerpts). Your role is to:
1. Answer questions about the content, citing sources as [Source Name](URL)
2. When the user refers to specific article(s) — or asks a detailed question that the summaries/excerpts can't fully answer — use the readArticles tool to fetch the FULL text of the relevant article(s) by their IDs, then answer from it. For questions spanning multiple articles, read all the relevant ones and synthesize across them.
3. For broad/high-level questions ("what's happening in AI today?") you can answer from the summaries without reading full text.
4. Be concise, accurate, and conversational. Don't invent information that isn't in the provided context or the articles you read.

${context}${fullText}`;

    const modelMessages = convertToModelMessages(messages);

    const tools = {
      readArticles: tool({
        description:
          "Fetch the full text of one or more of today's briefing articles by their IDs. Use when the user references specific articles or asks a detailed question that the summary/excerpt can't answer. You may read several at once to compare or synthesize across them.",
        inputSchema: z.object({
          articleIds: z
            .array(z.string())
            .min(1)
            .max(5)
            .describe('IDs of the articles to read, taken from the article list in the system prompt.'),
        }),
        execute: async ({ articleIds }) => {
          const out: Array<{
            id: string;
            title?: string;
            source?: string;
            url?: string;
            text: string;
          }> = [];

          for (const id of articleIds.slice(0, 5)) {
            const article = articleList.find((a) => a.id === id);
            if (!article) {
              out.push({ id, text: 'Article not found in this briefing.' });
              continue;
            }

            let text = await getCachedArticleContent(article.url);
            if (!text) {
              text = await fetchArticleFullText(article.url);
              if (text) await setCachedArticleContent(article.url, text);
            }

            out.push({
              id,
              title: article.title,
              source: article.sourceName,
              url: article.url,
              text: text || 'Could not extract full text for this article (paywall or JS-only page).',
            });
          }

          return out;
        },
      }),
    };

    const result = streamText({
      model: openai('gpt-4o'),
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(5),
      temperature: 0.7,
      maxOutputTokens: 1200,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('[Chat API] Error:', error);
    return new Response((error as Error).message, { status: 500 });
  }
}

/**
 * Build article context for the LLM. Each entry includes the article ID so the
 * model can reference it in the readArticles tool call.
 */
function buildArticleContext(articles: Article[], clusterId?: string): string {
  const relevantArticles = clusterId
    ? articles.filter((a) => a.id.startsWith(clusterId.slice(0, 5))) // Simple filtering
    : articles;

  if (relevantArticles.length === 0) {
    return 'No articles available in context.';
  }

  const articlesText = relevantArticles
    .map(
      (article, index) => `
Article #${index + 1} (ID: ${article.id}):
Title: ${article.title}
Source: ${article.sourceName}
Published: ${new Date(article.publishedAt).toLocaleString()}
URL: ${article.url}
Summary: ${article.summary || 'No summary available'}
Excerpt: ${article.excerpt.slice(0, 200)}...

---`
    )
    .join('\n');

  return `Here are the ${relevantArticles.length} articles you can reference (use readArticles with an article's ID to read its full text):

${articlesText}`;
}
