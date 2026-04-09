/**
 * Document Parsing Pipeline
 * Routes documents to the appropriate parser based on file type.
 *
 * Copyright (c) 2024 Prudence EHS Intelligence Engine
 * Contact: tsidi@prudenceehs.com
 */

import type { ParsedDocument } from './pdf-parser';
import { parsePDF } from './pdf-parser';
import { parseDOCX } from './docx-parser';
import { parseTXT } from './txt-parser';

export type { ParsedDocument, ParsedPage } from './pdf-parser';

const SUPPORTED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

export function getSupportedFileType(mimeType: string): string | null {
  return SUPPORTED_TYPES[mimeType] || null;
}

export async function parseDocument(
  buffer: Buffer,
  fileName: string,
  fileType: string
): Promise<ParsedDocument> {
  const ext = fileType.toLowerCase();

  switch (ext) {
    case 'pdf':
      return parsePDF(buffer, fileName);
    case 'docx':
      return parseDOCX(buffer, fileName);
    case 'txt':
      return parseTXT(buffer, fileName);
    default:
      throw new Error(
        `Unsupported file type: ${ext}. Supported types: PDF, DOCX, TXT.`
      );
  }
}

/**
 * Extract file extension from filename.
 */
export function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}
