import { NextResponse } from 'next/server';
import { markArticleRead, markAllArticlesRead, getReadArticleIds } from '@/lib/kv';

export async function GET() {
  try {
    const readIds = await getReadArticleIds();
    return NextResponse.json({ success: true, readIds });
  } catch (error) {
    console.error('[API] Error getting read articles:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get read articles' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.articleIds && Array.isArray(body.articleIds)) {
      await markAllArticlesRead(body.articleIds);
      return NextResponse.json({ success: true, marked: body.articleIds.length });
    }

    if (body.articleId && typeof body.articleId === 'string') {
      await markArticleRead(body.articleId);
      return NextResponse.json({ success: true, marked: 1 });
    }

    return NextResponse.json(
      { success: false, error: 'Request body must include articleId (string) or articleIds (string[])' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API] Error marking articles as read:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to mark articles as read' },
      { status: 500 }
    );
  }
}
