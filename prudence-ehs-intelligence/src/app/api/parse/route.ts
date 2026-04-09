/**
 * Document Parse API Route
 * Accepts file uploads and returns parsed text with page tracking.
 *
 * POST /api/parse
 * Body: FormData with 'file' field
 * Returns: { fileName, fileType, totalPages, pages[], fullText, metadata }
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseDocument, getFileExtension } from '@/lib/parsers';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    const ext = getFileExtension(file.name);
    if (!['pdf', 'docx', 'txt'].includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type: .${ext}. Accepted: PDF, DOCX, TXT.` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseDocument(buffer, file.name, ext);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Document parse error:', error);
    return NextResponse.json(
      { error: 'Failed to parse document. Please try a different file.' },
      { status: 500 }
    );
  }
}
