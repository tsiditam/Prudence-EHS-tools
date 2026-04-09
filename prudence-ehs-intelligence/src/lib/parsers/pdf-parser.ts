/**
 * PDF Document Parser
 * Extracts text content from PDF files with page tracking.
 *
 * Copyright (c) 2024 Prudence EHS Intelligence Engine
 * Contact: tsidi@prudenceehs.com
 */

export interface ParsedPage {
  pageNumber: number;
  text: string;
}

export interface ParsedDocument {
  fileName: string;
  fileType: string;
  totalPages: number;
  pages: ParsedPage[];
  fullText: string;
  metadata: Record<string, string>;
}

export async function parsePDF(
  buffer: Buffer,
  fileName: string
): Promise<ParsedDocument> {
  // Dynamic import to avoid bundling issues
  const pdfParse = (await import('pdf-parse')).default;

  const data = await pdfParse(buffer, {
    // Preserve page breaks for page-level fact extraction
    pagerender: async function (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) {
      const textContent = await pageData.getTextContent();
      return textContent.items.map((item: { str: string }) => item.str).join(' ');
    },
  });

  // Split by form feed or approximate page boundaries
  const rawPages = data.text.split(/\f/);
  const pages: ParsedPage[] = rawPages.map((text, i) => ({
    pageNumber: i + 1,
    text: text.trim(),
  }));

  return {
    fileName,
    fileType: 'pdf',
    totalPages: data.numpages || pages.length,
    pages,
    fullText: data.text,
    metadata: {
      title: data.info?.Title || '',
      author: data.info?.Author || '',
      creator: data.info?.Creator || '',
    },
  };
}
