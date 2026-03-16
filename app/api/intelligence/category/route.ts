/**
 * On-demand category detail summary
 * POST /api/intelligence/category
 * Generates a detailed summary for a specific intelligence category when clicked
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getTodaysBriefing } from '@/lib/kv';
import type { Article } from '@/lib/types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { categoryName, articleIds } = body;

    if (!categoryName || !Array.isArray(articleIds) || articleIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing categoryName or articleIds' },
        { status: 400 }
      );
    }

    // Fetch today's briefing to get article content
    const briefing = await getTodaysBriefing();
    if (!briefing) {
      return NextResponse.json(
        { success: false, error: 'No briefing available' },
        { status: 404 }
      );
    }

    // Find matching articles
    const allArticles: Article[] = [
      ...briefing.clusters.flatMap((c) => c.articles),
      ...briefing.individualArticles,
    ];

    const categoryArticles = allArticles.filter((a) => articleIds.includes(a.id));

    if (categoryArticles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No matching articles found' },
        { status: 404 }
      );
    }

    // Build context
    const articlesContext = categoryArticles
      .map(
        (article, i) =>
          `[${i + 1}] "${article.title}" (${article.sourceName})
Summary: ${article.summary || article.excerpt.slice(0, 200)}
URL: ${article.url}`
      )
      .join('\n\n');

    const prompt = `You are an intelligence briefing analyst. Write a detailed 3-5 paragraph summary for the "${categoryName}" category based on these articles:

${articlesContext}

Write an in-depth analysis that:
1. Explains each key development and why it matters
2. Draws connections between the stories where relevant
3. Provides context on how these developments fit into broader trends
4. Highlights implications and what to watch for next

Write in a direct, analytical tone. Do not use bullet points — write in flowing paragraphs.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a concise intelligence analyst who writes clear, insightful summaries.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1500,
      temperature: 0.3,
    });

    const detail = completion.choices[0]?.message?.content?.trim() || '';

    return NextResponse.json({
      success: true,
      detail,
      articleCount: categoryArticles.length,
    });
  } catch (error) {
    console.error('[API] Error generating category detail:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
