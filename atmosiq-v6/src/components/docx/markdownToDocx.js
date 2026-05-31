/**
 * AtmosFlow DOCX Report — Markdown → docx converter
 *
 * Converts an AI-generated markdown string into an array of docx
 * Paragraph/Table nodes for the report. Used for the AI narrative in
 * both DOCX paths: the consultant report's Executive Summary
 * (sections-core) and the standalone narrative-share document
 * (DocxReport.getNarrativeDocxBlob).
 *
 * Parsing uses the same CommonMark + GFM grammar as the on-screen
 * react-markdown renderer, so the Word document and the screen stay
 * consistent. The mdast-util-* / micromark-extension-gfm deps are
 * declared explicitly (not relied on transitively through
 * react-markdown) so a future react-markdown bump can't silently shift
 * the grammar under the DOCX path.
 *
 * Self-contained on purpose: it builds its own font-parametric paragraph
 * runs (the two callers use different fonts — Cambria vs Inter) and only
 * reuses buildTable from ./tables. It deliberately does NOT touch the
 * heavily-used p()/bullet() helpers in sections-core (no drive-by
 * refactor of a hot path).
 */

import { Paragraph, TextRun, BorderStyle } from 'docx'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfm } from 'micromark-extension-gfm'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { FONTS, COLORS } from './styles'
import { buildTable } from './tables'

const MONO = 'Consolas'
// Heading sizes in half-points (docx convention: 22 = 11pt body).
const HEADING_SIZE = { 1: 32, 2: 28, 3: 24, 4: 22, 5: 22, 6: 22 }

// Flatten the plain text of inline (phrasing) nodes — used for table
// header cells and link de-duplication.
function textOf(nodes) {
  return (nodes || []).map(n => (n.value != null ? n.value : (n.children ? textOf(n.children) : ''))).join('')
}

// Flatten mdast inline children into docx TextRuns, carrying
// bold/italic/strike down through nesting.
function inlineRuns(nodes, opts, inherited = {}) {
  const runs = []
  for (const n of nodes || []) {
    if (n.type === 'text') {
      // Honor single newlines as line breaks (mirrors remark-breaks on
      // screen): a raw \n inside a TextRun does not break in Word.
      const parts = String(n.value).split('\n')
      parts.forEach((part, i) => {
        if (i > 0) runs.push(new TextRun({ break: 1 }))
        if (part) runs.push(new TextRun({ text: part, font: opts.font, size: opts.size, color: opts.color, bold: inherited.bold, italics: inherited.italics, strike: inherited.strike }))
      })
    } else if (n.type === 'strong') {
      runs.push(...inlineRuns(n.children, opts, { ...inherited, bold: true }))
    } else if (n.type === 'emphasis') {
      runs.push(...inlineRuns(n.children, opts, { ...inherited, italics: true }))
    } else if (n.type === 'delete') {
      runs.push(...inlineRuns(n.children, opts, { ...inherited, strike: true }))
    } else if (n.type === 'inlineCode') {
      runs.push(new TextRun({ text: n.value, font: MONO, size: opts.size, color: opts.color, bold: inherited.bold, italics: inherited.italics }))
    } else if (n.type === 'break') {
      runs.push(new TextRun({ break: 1 }))
    } else if (n.type === 'link') {
      runs.push(...inlineRuns(n.children, opts, inherited))
      // Keep the destination visible in print without wiring up
      // ExternalHyperlink for this rarely-used path.
      if (n.url && n.url !== textOf(n.children)) {
        runs.push(new TextRun({ text: ` (${n.url})`, font: opts.font, size: opts.size, color: COLORS.muted }))
      }
    } else if (n.children) {
      runs.push(...inlineRuns(n.children, opts, inherited))
    } else if (n.value) {
      runs.push(new TextRun({ text: n.value, font: opts.font, size: opts.size, color: opts.color, bold: inherited.bold, italics: inherited.italics }))
    }
  }
  return runs
}

function listItemToDocx(item, ordered, idx, opts, out, depth) {
  let leadEmitted = false
  for (const b of (item.children || [])) {
    if (b.type === 'list') {
      blockToDocx(b, opts, out, depth + 1)
    } else if (b.type === 'paragraph' && !leadEmitted) {
      const runs = inlineRuns(b.children, { ...opts, size: 20 })
      out.push(new Paragraph({
        children: ordered
          ? [new TextRun({ text: `${idx + 1}. `, font: opts.font, size: 20, color: opts.color }), ...runs]
          : runs,
        // Real docx numbering needs a Document-level numbering config;
        // the existing report convention prepends "N. " manually, so we
        // match it. Bullets use native bullet levels for nesting.
        ...(ordered ? { indent: { left: 360 * (depth + 1) } } : { bullet: { level: depth } }),
        spacing: { after: 60 },
      }))
      leadEmitted = true
    } else {
      blockToDocx(b, opts, out, depth)
    }
  }
}

function blockToDocx(node, opts, out, depth = 0) {
  switch (node.type) {
    case 'heading': {
      const size = HEADING_SIZE[node.depth] || 22
      out.push(new Paragraph({
        children: inlineRuns(node.children, { ...opts, size, color: opts.headingColor }, { bold: true }),
        spacing: { before: node.depth <= 2 ? 200 : 120, after: 80 },
      }))
      break
    }
    case 'paragraph': {
      out.push(new Paragraph({ children: inlineRuns(node.children, opts), spacing: { after: 120 } }))
      break
    }
    case 'list': {
      let idx = 0
      for (const item of (node.children || [])) {
        listItemToDocx(item, !!node.ordered, idx, opts, out, depth)
        idx++
      }
      break
    }
    case 'table': {
      const rows = node.children || []
      if (!rows.length) break
      const headerCells = (rows[0].children || []).map(c => ({ text: textOf(c.children) }))
      const bodyRows = rows.slice(1).map(r => (r.children || []).map(c => ({
        text: inlineRuns(c.children, { font: opts.font, size: 20, color: COLORS.body }),
      })))
      out.push(buildTable(headerCells, bodyRows))
      out.push(new Paragraph({ spacing: { after: 80 } }))
      break
    }
    case 'code': {
      out.push(new Paragraph({
        children: [new TextRun({ text: node.value || '', font: MONO, size: 18, color: COLORS.body })],
        spacing: { after: 120 },
      }))
      break
    }
    case 'blockquote': {
      for (const c of (node.children || [])) blockToDocx(c, { ...opts, color: COLORS.sub }, out, depth)
      break
    }
    case 'thematicBreak': {
      out.push(new Paragraph({
        spacing: { after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.border } },
      }))
      break
    }
    default: {
      if (node.children) {
        for (const c of node.children) blockToDocx(c, opts, out, depth)
      } else if (node.value) {
        out.push(new Paragraph({ children: [new TextRun({ text: node.value, font: opts.font, size: opts.size, color: opts.color })], spacing: { after: 120 } }))
      }
    }
  }
}

/**
 * markdownToDocx(md, opts) → Array<Paragraph|Table>
 *
 * opts.font         — run font (default FONTS.body / Cambria)
 * opts.size         — base body size in half-points (default 22)
 * opts.color        — base body color (default COLORS.body)
 * opts.headingColor — heading color (default COLORS.text)
 */
export function markdownToDocx(md, opts = {}) {
  const o = {
    font: opts.font || FONTS.body,
    size: opts.size || 22,
    color: opts.color || COLORS.body,
    headingColor: opts.headingColor || COLORS.text,
  }
  const tree = fromMarkdown(String(md || ''), { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
  const out = []
  for (const node of (tree.children || [])) blockToDocx(node, o, out, 0)
  // Never emit an empty block set — fall back to the raw string so the
  // narrative can't silently vanish from the report.
  if (!out.length && String(md || '').trim()) {
    out.push(new Paragraph({ children: [new TextRun({ text: String(md), font: o.font, size: o.size, color: o.color })] }))
  }
  return out
}
