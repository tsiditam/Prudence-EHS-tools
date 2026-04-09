/**
 * DOCX Document Parser
 * Extracts text content from Word documents.
 *
 * Copyright (c) 2024 Prudence EHS Intelligence Engine
 * Contact: tsidi@prudenceehs.com
 */

import type { ParsedDocument } from './pdf-parser';

export async function parseDOCX(
  buffer: Buffer,
  fileName: string
): Promise<ParsedDocument> {
  const mammoth = await import('mammoth');

  const result = await mammoth.extractRawText({ buffer });
  const fullText = result.value;

  // DOCX doesn't have reliable page breaks, so we chunk by paragraphs
  const paragraphs = fullText.split(/\n\n+/).filter(Boolean);
  const CHUNK_SIZE = 2000;
  const pages: { pageNumber: number; text: string }[] = [];
  let currentChunk = '';
  let pageNum = 1;

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > CHUNK_SIZE && currentChunk) {
      pages.push({ pageNumber: pageNum, text: currentChunk.trim() });
      pageNum++;
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }
  if (currentChunk.trim()) {
    pages.push({ pageNumber: pageNum, text: currentChunk.trim() });
  }

  return {
    fileName,
    fileType: 'docx',
    totalPages: pages.length,
    pages,
    fullText,
    metadata: {},
  };
}
