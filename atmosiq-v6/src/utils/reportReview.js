/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Report-review helpers for the AtmosFlow AI "Review for discrepancies"
 * feature. Two content sources feed the assistant:
 *   1. the current in-app assessment (structured data — strongest, can
 *      cross-check narrative vs the underlying numbers), and
 *   2. an uploaded .docx (rendered text only, for external/older reports).
 *
 * The detailed review directive lives here (REVIEW_INSTRUCTIONS) and is
 * passed to the assistant via the request context, so the visible chat
 * message stays a short prompt and no server change is required.
 */

import JSZip from 'jszip'

// Extract plain text from a .docx (Office Open XML) File/Blob. A .docx is
// a zip whose body text lives in word/document.xml as <w:t> runs split by
// <w:p> paragraphs. We turn structural tags into line breaks, strip the
// rest, and decode the handful of entities Word emits — formatting is
// irrelevant to a discrepancy scan, only the text matters.
export async function extractDocxText(file) {
  const zip = await JSZip.loadAsync(file)
  const docXml = zip.file('word/document.xml')
  if (!docXml) throw new Error('That file is not a valid .docx (missing word/document.xml).')
  const xml = await docXml.async('string')
  const withBreaks = xml
    .replace(/<w:p[ >]/g, '\n<w:p ')
    .replace(/<w:br\s*\/?>/g, '\n')
    .replace(/<w:tab\s*\/?>/g, '\t')
  const stripped = withBreaks.replace(/<[^>]+>/g, '')
  const decoded = stripped
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
  return decoded.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Directive the assistant follows when context.report_review is present.
// Screening-only / advisory framing is non-negotiable (no compliance,
// causation, or final determinations) — this is a QA aid, not sign-off.
export const REVIEW_INSTRUCTIONS = [
  'You are reviewing an indoor air quality (IAQ) assessment report for INTERNAL DISCREPANCIES and consistency, as a screening-level QA aid for the consultant. This is advisory only: you do not certify the report and you do not make compliance, causation, or final IAQ determinations — a qualified professional confirms everything.',
  '',
  'Review the report content in context.report_review.content and flag any:',
  '1. Contradictions between the narrative/prose and the underlying data (e.g. a finding described as "moderate" while the score/severity says critical; occupant counts, zone counts, or measurements that disagree across sections).',
  '2. Internal inconsistencies (a zone or system referenced but not assessed; a recommendation with no location/zone; totals that do not add up; severity labels used inconsistently).',
  '3. Missing defensibility items that weaken the report (instrument make/serial/calibration; client name; site contact name + role; occupant denominator for symptomatic zones; photos for Critical/High findings; assessor identification).',
  '4. Unfilled placeholders or template artifacts (TBD, TODO, "[ ]", "lorem", obviously unreplaced fields) — especially in uploaded documents.',
  '5. Standards/citation issues visible in the text (a standard cited in prose but absent from the references, or an exposure limit stated inconsistently). Do not invent citations.',
  '',
  'Output format:',
  '- If you find issues, group them by severity (High / Medium / Low). For each: state the specific discrepancy, where it appears, and a short suggested fix — quote the conflicting values.',
  '- If you find none, say so plainly and note what you checked.',
  '- Keep it scannable. Do not rewrite the report; only flag issues.',
  '- End with a one-line reminder that this is a screening QA aid requiring professional review (IH Review Required).',
].join('\n')

export const REVIEW_CREDIT_COST = 3
