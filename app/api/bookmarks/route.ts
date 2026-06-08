/**
 * Bookmarks API
 * GET    /api/bookmarks            — list saved articles (newest first)
 * POST   /api/bookmarks            — save an article (body: { article })
 * DELETE /api/bookmarks?url=...     — remove a saved article by URL
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getBookmarks, addBookmark, removeBookmark } from '@/lib/kv';
import type { Article } from '@/lib/types';

export async function GET() {
  try {
    const bookmarks = await getBookmarks();
    return NextResponse.json({ success: true, bookmarks });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { article?: Article };
    const article = body.article;

    if (!article || typeof article.url !== 'string' || typeof article.title !== 'string') {
      return NextResponse.json(
        { success: false, error: 'A valid article (with url and title) is required' },
        { status: 400 }
      );
    }

    const bookmarks = await addBookmark(article);
    return NextResponse.json({ success: true, bookmarks });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: url' },
        { status: 400 }
      );
    }

    const bookmarks = await removeBookmark(url);
    return NextResponse.json({ success: true, bookmarks });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
