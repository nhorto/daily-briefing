/**
 * Article Categorization Service
 * Uses GPT-4o-mini to categorize articles in bulk for minimal cost
 */

import type { Article, ArticleCategory } from '../types';
import { getOpenAI } from './openai';

const MODEL = 'gpt-4o-mini';
const BATCH_SIZE = 30;

const VALID_CATEGORIES: ArticleCategory[] = [
  'ai-ml', 'business', 'science', 'security',
  'programming', 'devops', 'design', 'hardware', 'other',
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

Categories (choose the single best fit):
- ai-ml: AI, machine learning, LLMs, chatbots, models, AI products/features, AI policy
- business: Startups, funding, M&A, earnings, markets, industry moves, tech policy/regulation, legal/antitrust
- science: Research, academia, space, biology, health/medicine, climate, environment, physics
- security: Cybersecurity, hacking, breaches, vulnerabilities, privacy, surveillance, encryption
- programming: Programming languages, frameworks, libraries, developer tools, software engineering
- devops: Cloud, infrastructure, databases, deployment, CI/CD, containers, networking, SRE
- design: UX/UI, product design, design systems, typography, accessibility, creative tools
- hardware: Consumer devices, phones, laptops, wearables, chips/semiconductors, gadgets, robotics, EVs, hardware reviews
- other: ONLY if it genuinely fits none of the above

Guidance:
- Choose the CLOSEST category; avoid "other" unless nothing fits. Most tech, business, science, and consumer-product stories fit a specific category.
- A device or gadget announcement → hardware (use ai-ml if the story is primarily about an AI feature).
- Government/regulation/legal stories about tech → business; about surveillance/privacy → security.
- Health, medicine, biology, space, climate → science.

Examples:
- "Apple announces new iPhone lineup" → hardware
- "OpenAI launches GPT-5" → ai-ml
- "Startup raises $40M Series B" → business
- "New Rust release improves async" → programming
- "State bans sale of location data" → security
- "Why are cells small?" → science

Articles:
${articleList}

Return ONLY valid JSON like: {"article_id": "category_slug", ...}`;

  try {
    const completion = await getOpenAI().chat.completions.create({
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
