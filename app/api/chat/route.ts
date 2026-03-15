/**
 * Chat API Route
 * Streams AI responses about briefing content using OpenAI
 * Supports both high-level questions and article-specific queries
 */

import { streamText, convertToModelMessages } from 'ai';
import { openai } from '@ai-sdk/openai';
import { NextRequest } from 'next/server';
import type { Article } from '@/lib/types';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, articles, clusterId } = body;

    if (!messages || messages.length === 0) {
      return new Response('No messages provided', { status: 400 });
    }

    if (!articles || articles.length === 0) {
      return new Response('No briefing context provided', { status: 400 });
    }

    // Build context from articles
    const context = buildArticleContext(articles as Article[], clusterId);

    // System prompt for the chat
    const systemPrompt = `You are a briefing assistant helping the user understand today's content aggregation.

You have access to ${articles.length} articles from today's briefing. Your role is to:
1. Answer questions about the content using ONLY the information provided
2. Cite sources when making claims (use [Source Name](URL) format)
3. Be concise and informative
4. If asked about something not in the articles, politely say you don't have that information
5. Support both high-level questions (e.g., "What's happening in AI?") and specific article questions

${context}

Remember:
- Always cite sources when referencing specific information
- Don't make up information not present in the articles
- Be helpful and conversational
- If multiple sources cover the same topic, synthesize their perspectives`;

    // Convert UI messages to model messages (handles both old {content} and new {parts} formats)
    const modelMessages = convertToModelMessages(messages);

    const result = streamText({
      model: openai('gpt-4o'),
      system: systemPrompt,
      messages: modelMessages,
      temperature: 0.7,
      maxOutputTokens: 1000,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('[Chat API] Error:', error);
    return new Response((error as Error).message, { status: 500 });
  }
}

/**
 * Build article context for the LLM
 * Formats all articles in a structured way for the system prompt
 */
function buildArticleContext(articles: Article[], clusterId?: string): string {
  // If clusterId provided, filter to that cluster only
  const relevantArticles = clusterId
    ? articles.filter((a) => a.id.startsWith(clusterId.slice(0, 5))) // Simple filtering
    : articles;

  if (relevantArticles.length === 0) {
    return 'No articles available in context.';
  }

  const articlesText = relevantArticles
    .map(
      (article, index) => `
Article #${index + 1}:
Title: ${article.title}
Source: ${article.sourceName}
Published: ${new Date(article.publishedAt).toLocaleString()}
URL: ${article.url}
Summary: ${article.summary || 'No summary available'}
Excerpt: ${article.excerpt.slice(0, 200)}...

---`
    )
    .join('\n');

  return `Here are the ${relevantArticles.length} articles you can reference:

${articlesText}`;
}
