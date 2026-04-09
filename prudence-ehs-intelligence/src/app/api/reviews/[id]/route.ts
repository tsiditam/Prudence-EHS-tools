/**
 * Single Review API Route
 * GET /api/reviews/[id] — Get review details
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  // In production, fetch from database by params.id
  // For MVP, return a 404 as reviews are returned directly from POST
  return NextResponse.json(
    { error: `Review ${params.id} not found. In MVP mode, review results are returned directly from the review creation endpoint.` },
    { status: 404 }
  );
}
