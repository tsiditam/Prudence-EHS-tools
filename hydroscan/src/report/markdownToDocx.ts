/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Tiny markdown → docx converter for the AI narrative prose (trimmed from
 * AtmosFlow's markdownToDocx). Handles paragraphs, `-`/`*` bullets, and inline
 * **bold** — enough for the short narrative sections woven into the report.
 * Client-side only (bundled with DocxReport); never reachable from api/**.
 */

import { Paragraph, TextRun } from 'docx'

function inlineRuns(text: string, base: { color?: string; size?: number }): TextRun[] {
  const runs: TextRun[] = []
  // Split on **bold** spans, keeping the delimited parts.
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true, color: base.color, size: base.size }))
    } else {
      runs.push(new TextRun({ text: part, color: base.color, size: base.size }))
    }
  }
  return runs.length ? runs : [new TextRun({ text: '', color: base.color, size: base.size })]
}

/** Convert light markdown to an array of docx Paragraphs. */
export function markdownToParagraphs(md: string, opts: { color?: string; size?: number } = {}): Paragraph[] {
  const base = { color: opts.color, size: opts.size }
  const out: Paragraph[] = []
  const lines = String(md || '').split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (/^#{1,6}\s+/.test(line)) continue // headings handled by the report itself
    const bulletMatch = line.match(/^[-*]\s+(.*)$/)
    if (bulletMatch) {
      out.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: inlineRuns(bulletMatch[1], base) }))
    } else {
      out.push(new Paragraph({ spacing: { after: 80 }, children: inlineRuns(line, base) }))
    }
  }
  return out
}
