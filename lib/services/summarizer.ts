/**
 * AI Summarization Service
 * Uses OpenAI GPT-4o to generate summaries for clusters and individual articles
 */

import OpenAI from 'openai';
import type { Article, Cluster } from '../types';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = 'gpt-4o';
const TEMPERATURE = 0.3; // Low temperature for factual consistency

/**
 * Generate a synthesized summary for a topic cluster
 * Combines multiple articles into a coherent 2-3 sentence summary
 */
export async function generateClusterSummary(articles: Article[]): Promise<string> {
  if (articles.length === 0) {
    throw new Error('Cannot generate summary for empty cluster');
  }

  if (articles.length === 1) {
    // For single-article clusters, just generate article summary
    return generateArticleSummary(articles[0]);
  }

  // Construct prompt with all articles in the cluster
  const articlesContext = articles
    .map(
      (article, index) => `
[Article ${index + 1} - ${article.sourceName}]
Title: ${article.title}
Excerpt: ${article.excerpt}
Published: ${new Date(article.publishedAt).toLocaleString()}
URL: ${article.url}
`
    )
    .join('\n');

  const prompt = `You are a briefing assistant synthesizing news from multiple sources.

Below are ${articles.length} articles about the same topic from different sources:

${articlesContext}

Synthesize these articles into a 2-3 sentence summary that:
1. Captures the core information shared across sources
2. Notes any significant differences in perspective or emphasis
3. Avoids redundancy while preserving key details
4. Is factually accurate and doesn't add information not present in the articles

Summary:`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a concise news synthesizer. Your summaries are factual, clear, and informative.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 200,
      temperature: TEMPERATURE,
    });

    const summary = completion.choices[0]?.message?.content?.trim() || '';

    if (!summary) {
      throw new Error('No summary generated');
    }

    console.log(`[Summarizer] Generated cluster summary (${articles.length} articles)`);
    return summary;
  } catch (error) {
    console.error('[Summarizer] Error generating cluster summary:', error);
    throw new Error(`Failed to generate cluster summary: ${(error as Error).message}`);
  }
}

/**
 * Generate a one-sentence summary for an individual article
 */
export async function generateArticleSummary(article: Article): Promise<string> {
  const prompt = `Summarize this article in exactly one sentence:

Title: ${article.title}
Content: ${article.excerpt}

One-sentence summary:`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a concise article summarizer. Your summaries are one sentence long, factual, and informative.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 100,
      temperature: TEMPERATURE,
    });

    const summary = completion.choices[0]?.message?.content?.trim() || '';

    if (!summary) {
      throw new Error('No summary generated');
    }

    return summary;
  } catch (error) {
    console.error('[Summarizer] Error generating article summary:', error);
    throw new Error(`Failed to generate article summary: ${(error as Error).message}`);
  }
}

/**
 * Batch generate summaries for multiple individual articles
 * Processes in parallel for efficiency
 */
export async function generateArticleSummaries(articles: Article[]): Promise<Map<string, string>> {
  console.log(`[Summarizer] Generating summaries for ${articles.length} articles...`);

  const summaries = new Map<string, string>();

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async (article) => {
        const summary = await generateArticleSummary(article);
        return { id: article.id, summary };
      })
    );

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        summaries.set(result.value.id, result.value.summary);
      }
    });
  }

  console.log(`[Summarizer] Generated ${summaries.size}/${articles.length} article summaries`);
  return summaries;
}

/**
 * Generate summaries for all clusters
 * Updates the cluster objects in place with summaries
 */
export async function summarizeClusters(clusters: Cluster[]): Promise<void> {
  console.log(`[Summarizer] Generating summaries for ${clusters.length} clusters...`);

  // Process in batches to avoid overwhelming the API
  const batchSize = 3;
  for (let i = 0; i < clusters.length; i += batchSize) {
    const batch = clusters.slice(i, i + batchSize);

    await Promise.allSettled(
      batch.map(async (cluster) => {
        try {
          cluster.summary = await generateClusterSummary(cluster.articles);
        } catch (error) {
          console.error(`[Summarizer] Failed to summarize cluster ${cluster.id}:`, error);
          // Fallback: use representative article title as summary
          cluster.summary = `Multiple articles covering: ${cluster.title}`;
        }
      })
    );
  }

  console.log(`[Summarizer] Completed cluster summarization`);
}

/**
 * Estimate cost of summarization
 * Based on OpenAI pricing for GPT-4o
 */
export function estimateSummarizationCost(articleCount: number, clusterCount: number): {
  estimatedTokens: number;
  estimatedCostUSD: number;
} {
  // Rough estimates:
  // - Article summary: ~300 input tokens + ~50 output tokens
  // - Cluster summary: ~1000 input tokens + ~100 output tokens per cluster

  const articleTokens = articleCount * 350;
  const clusterTokens = clusterCount * 1100;
  const totalTokens = articleTokens + clusterTokens;

  // GPT-4o pricing (as of 2024):
  // Input: $2.50 per 1M tokens
  // Output: $10.00 per 1M tokens
  // Approximate with average of $5 per 1M tokens
  const costPerMillion = 5.0;
  const estimatedCostUSD = (totalTokens / 1_000_000) * costPerMillion;

  return {
    estimatedTokens: totalTokens,
    estimatedCostUSD: Number(estimatedCostUSD.toFixed(4)),
  };
}
