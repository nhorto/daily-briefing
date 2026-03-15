/**
 * AI Intelligence Summary Service
 * Generates a structured daily intelligence summary from all articles and clusters
 */

import OpenAI from 'openai';
import type { Article, Cluster, DailyIntelligence } from '../types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = 'gpt-4o';

/**
 * Generate a structured daily intelligence summary from clusters and articles
 */
export async function generateDailyIntelligence(
  clusters: Cluster[],
  individualArticles: Article[]
): Promise<DailyIntelligence> {
  const allArticles = [
    ...clusters.flatMap((c) => c.articles),
    ...individualArticles,
  ];

  // Build context from all content
  const clusterContext = clusters
    .map(
      (cluster, i) =>
        `Cluster ${i + 1}: "${cluster.title}" (${cluster.articles.length} articles)
Summary: ${cluster.summary}
Sources: ${cluster.articles.map((a) => a.sourceName).join(', ')}
Article IDs: ${cluster.articles.map((a) => a.id).join(', ')}`
    )
    .join('\n\n');

  const individualContext = individualArticles
    .map(
      (article) =>
        `Article: "${article.title}" [${article.sourceName}]
Summary: ${article.summary || article.excerpt.slice(0, 150)}
ID: ${article.id}`
    )
    .join('\n\n');

  const prompt = `You are a daily intelligence briefing assistant. Analyze the following content from today's aggregation and produce a structured intelligence summary.

## Topic Clusters (${clusters.length})
${clusterContext || 'None'}

## Individual Articles (${individualArticles.length})
${individualContext || 'None'}

## Instructions
Produce a JSON response with this exact structure:
{
  "topStories": "A 2-3 paragraph synthesis of the most important developments today. Write in a direct, analytical tone. Highlight what matters and why.",
  "categories": [
    {
      "name": "Category Name",
      "icon": "emoji",
      "summary": "2-3 sentence summary of this category's content",
      "articleIds": ["id1", "id2"],
      "priority": 1
    }
  ]
}

Categorize ALL content into 3-6 categories from this list (only use categories that have content):
- "Breaking News" (icon: "🔴") - Major developments, priority 1
- "Research & Papers" (icon: "🔬") - Academic research, new studies, priority 2
- "Industry Moves" (icon: "🏢") - Company news, funding, launches, priority 3
- "Worth Reading" (icon: "📖") - Notable analysis, opinion, deep dives, priority 4
- "Tools & Releases" (icon: "🛠️") - New tools, software releases, updates, priority 5
- "Other Highlights" (icon: "✨") - Anything else noteworthy, priority 6

Every article ID must appear in exactly one category. Priority determines display order (lower = higher priority).

Respond with ONLY valid JSON, no markdown code fences.`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a precise intelligence analyst. You produce structured JSON output. Always respond with valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content?.trim() || '';

    // Parse the JSON response, stripping any markdown fences if present
    const jsonStr = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const result = JSON.parse(jsonStr);

    const intelligence: DailyIntelligence = {
      topStories: result.topStories || 'No summary available.',
      categories: (result.categories || []).map((cat: any) => ({
        name: cat.name || 'Other',
        icon: cat.icon || '📄',
        summary: cat.summary || '',
        articleIds: Array.isArray(cat.articleIds) ? cat.articleIds : [],
        priority: typeof cat.priority === 'number' ? cat.priority : 99,
      })),
      generatedAt: new Date().toISOString(),
    };

    // Sort categories by priority
    intelligence.categories.sort((a, b) => a.priority - b.priority);

    console.log(
      `[Intelligence] Generated summary with ${intelligence.categories.length} categories`
    );
    return intelligence;
  } catch (error) {
    console.error('[Intelligence] Error generating daily intelligence:', error);

    // Return a fallback intelligence summary
    return {
      topStories: `Today's briefing contains ${allArticles.length} articles across ${clusters.length} topic clusters. Check the full briefing for details.`,
      categories: [],
      generatedAt: new Date().toISOString(),
    };
  }
}
