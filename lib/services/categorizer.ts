/**
 * Article Categorization Service
 * Uses GPT-4o-mini to categorize articles in bulk for minimal cost
 */

import OpenAI from 'openai';
import type { Article, ArticleCategory } from '../types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = 'gpt-4o-mini';
const BATCH_SIZE = 30;

const VALID_CATEGORIES: ArticleCategory[] = [
  'ai-ml', 'business', 'science', 'security',
  'programming', 'devops', 'design', 'other',
];

/**
 * Categorize a batch of articles using GPT-4o-mini.
 * Sends titles + excerpts and gets back a JSON mapping of article ID → category.
 * Processes up to 30 articles per API call.
 */
export async function categorizeArticles(
  articles: Article[]
): Promise<Map<string, ArticleCategory>> {
  const result = new Map<string, ArticleCategory>();

  if (articles.length === 0) return result;

  // Process in batches
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const batchResults = await categorizeBatch(batch);

    for (const [id, category] of batchResults) {
      result.set(id, category);
    }
  }

  console.log(`[Categorizer] Categorized ${result.size}/${articles.length} articles`);
  return result;
}

async function categorizeBatch(
  articles: Article[]
): Promise<Map<string, ArticleCategory>> {
  const result = new Map<string, ArticleCategory>();

  const articleList = articles
    .map((a) => `- ID: ${a.id} | Title: ${a.title} | Excerpt: ${a.excerpt.slice(0, 100)}`)
    .join('\n');

  const prompt = `Categorize each article into exactly one category. Return a JSON object mapping article ID to category slug.

Valid categories:
- ai-ml: AI, machine learning, LLMs, neural networks
- business: Startups, funding, acquisitions, corporate news
- science: Research papers, academic findings, scientific discoveries
- security: Cybersecurity, privacy, vulnerabilities, data breaches
- programming: Languages, frameworks, developer tools, coding
- devops: Infrastructure, cloud, deployment, CI/CD, containers
- design: UX, design systems, frontend design, accessibility
- other: Everything that doesn't fit above

Articles:
${articleList}

Return ONLY valid JSON like: {"article_id": "category_slug", ...}`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an article categorizer. Return only valid JSON with no extra text.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
      temperature: 0.1,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      console.error('[Categorizer] Empty response from GPT-4o-mini');
      return result;
    }

    const parsed = JSON.parse(content) as Record<string, string>;

    for (const [id, category] of Object.entries(parsed)) {
      if (VALID_CATEGORIES.includes(category as ArticleCategory)) {
        result.set(id, category as ArticleCategory);
      } else {
        result.set(id, 'other');
      }
    }
  } catch (error) {
    console.error('[Categorizer] Error categorizing batch:', error);
    // Fallback: assign 'other' to all articles in this batch
    for (const article of articles) {
      result.set(article.id, 'other');
    }
  }

  return result;
}
