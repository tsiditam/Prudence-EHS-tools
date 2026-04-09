/**
 * TXT Document Parser
 * Processes plain text files with section chunking.
 *
 * Copyright (c) 2024 Prudence EHS Intelligence Engine
 * Contact: tsidi@prudenceehs.com
 */

import type { ParsedDocument } from './pdf-parser';

export async function parseTXT(
  buffer: Buffer,
  fileName: string
): Promise<ParsedDocument> {
  const fullText = buffer.toString('utf-8');

  // Chunk by sections (double newlines or headings)
  const sections = fullText.split(/\n{3,}|\n(?=[A-Z][A-Z\s]{4,}\n)/);
  const pages = sections
    .filter((s) => s.trim().length > 0)
    .map((text, i) => ({
      pageNumber: i + 1,
      text: text.trim(),
    }));

  return {
    fileName,
    fileType: 'txt',
    totalPages: pages.length,
    pages: pages.length > 0 ? pages : [{ pageNumber: 1, text: fullText }],
    fullText,
    metadata: {},
  };
}
