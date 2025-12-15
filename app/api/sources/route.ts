/**
 * Sources Management API
 * GET /api/sources - List all sources
 * POST /api/sources - Add new source
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import type { Source } from '@/lib/types';
import { getSources, addSource, updateSource, deleteSource } from '@/lib/kv';
import { detectFeedType } from '@/lib/services/aggregator';

export async function GET() {
  try {
    const sources = await getSources();

    return NextResponse.json({
      success: true,
      sources,
    });
  } catch (error) {
    console.error('[API] Error fetching sources:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.url) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: name and url',
        },
        { status: 400 }
      );
    }

    // Auto-detect feed type if not provided
    const type = body.type || (await detectFeedType(body.url));

    // Create new source
    const newSource: Source = {
      id: nanoid(),
      name: body.name,
      url: body.url,
      type,
      authority: body.authority || 50, // Default authority
      isActive: body.isActive !== undefined ? body.isActive : true,
      createdAt: new Date().toISOString(),
    };

    await addSource(newSource);

    return NextResponse.json({
      success: true,
      source: newSource,
      message: `Source "${newSource.name}" added successfully`,
    });
  } catch (error) {
    console.error('[API] Error adding source:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: id',
        },
        { status: 400 }
      );
    }

    await updateSource(body.id, body);

    return NextResponse.json({
      success: true,
      message: 'Source updated successfully',
    });
  } catch (error) {
    console.error('[API] Error updating source:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameter: id',
        },
        { status: 400 }
      );
    }

    await deleteSource(id);

    return NextResponse.json({
      success: true,
      message: 'Source deleted successfully',
    });
  } catch (error) {
    console.error('[API] Error deleting source:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
