/**
 * AtmosFlow Engine v2.1 — Verbatim Report Templates
 * These paragraphs render exactly as-is in every client report.
 */

/**
 * v2.1 verbatim transmittal paragraph. v2.2 moves this content to a new
 * MethodologyDisclosure section between cover and Executive Summary;
 * the public ClientReport.transmittal field is preserved for backward
 * compatibility but populated with this text.
 */
export const TRANSMITTAL_PARAGRAPH =
  'This evaluation was conducted using a combination of visual inspection, screening-level measurements, and HVAC system review. Where direct measurement or laboratory analysis was not performed, findings are considered preliminary and intended to guide further investigation.'

/**
 * v2.2 §3 — Methodology Disclosure section content (between cover page
 * and Executive Summary). Same content as the v2.1 transmittal
 * paragraph, repositioned now that the transmittal slot carries a
 * letter-format object instead of a single screening-level disclosure.
 */
export const METHODOLOGY_DISCLOSURE_PARAGRAPH = TRANSMITTAL_PARAGRAPH

export const SCOPE_PARAGRAPH =
  'This evaluation utilized screening-level instruments and observational methods. These methods are appropriate for identifying potential IAQ concerns but are not a substitute for comprehensive industrial hygiene sampling where required.'

export const LIMITATIONS_PARAGRAPH =
  'This report is based on conditions observed during a single site visit and may not reflect temporal, seasonal, or operational variability. Screening-level measurements are not a substitute for full industrial hygiene exposure assessment. Where conclusions are based on observation or limited data, they are presented as professional judgment rather than definitive determinations.'

export const DATA_CENTER_CONTEXT_PARAGRAPH =
  'Data center environments may operate outside typical office comfort ranges due to equipment cooling and reliability requirements. Observations should be interpreted within this operational context per ASHRAE TC 9.9 Thermal Guidelines.'

export const ASSESSMENT_INDEX_DISCLAIMER =
  'This index is a proprietary prioritization tool used to guide evaluation and recommendations. It is not a measure of exposure risk, health risk, or regulatory compliance.'

export const CIH_REQUIRED_LIMITATION =
  'This report does not constitute a comprehensive industrial hygiene exposure assessment. Findings are based on screening-level evaluation and professional judgment within the stated limitations.'

export const PRE_ASSESSMENT_MEMO_NOTICE =
  'This memo does not constitute an indoor air quality evaluation. The data collected during this visit is insufficient to support professional findings under generally accepted industrial hygiene practice.'

export const DRAFT_WATERMARK = 'DRAFT — NOT FOR DISTRIBUTION'

export const DRAFT_COVER_NOTICE =
  'This draft has not been finalized and should not be distributed as a professional opinion.'

export const COVER_METHODOLOGY_LINE =
  'Prepared in accordance with generally accepted industrial hygiene practices.'

// v2.2 §3 — letter-format transmittal body paragraph generators. Each
// takes the assessment context and produces the corresponding paragraph
// in the CTSI letter format.

import type { AssessmentMeta, Recipient } from '../types/domain'

export interface TransmittalBodyContext {
  readonly meta: AssessmentMeta
}

export const TRANSMITTAL_OPENING = (ctx: TransmittalBodyContext): string =>
  `On ${ctx.meta.assessmentDate} at the request of ${ctx.meta.transmittalRecipient.organization}, ${ctx.meta.issuingFirm.name} (${shortFirmName(ctx.meta.issuingFirm.name)}) performed an indoor air quality evaluation at the above-referenced premises.`

export const TRANSMITTAL_ENCLOSED = (ctx: TransmittalBodyContext): string =>
  `Enclosed is ${shortFirmName(ctx.meta.issuingFirm.name)}'s report for these services.`

export const TRANSMITTAL_CLOSING_COURTESY = (_: TransmittalBodyContext): string =>
  'We thank you for the opportunity to assist you with this project. Should you have any questions, comments, or need for further services, please do not hesitate to contact our office.'

/**
 * Builds the standard 3-paragraph transmittal body in CTSI format.
 * Callers can extend with additional paragraphs by appending to the
 * returned array.
 */
export function buildTransmittalBody(ctx: TransmittalBodyContext): ReadonlyArray<string> {
  return [
    TRANSMITTAL_OPENING(ctx),
    TRANSMITTAL_ENCLOSED(ctx),
    TRANSMITTAL_CLOSING_COURTESY(ctx),
  ]
}

/**
 * Builds the subject line in CTSI all-caps format.
 */
export function buildTransmittalSubject(meta: AssessmentMeta): string {
  return `INDOOR AIR QUALITY EVALUATION PERFORMED AT: ${meta.siteName.toUpperCase()}, ${meta.siteAddress.toUpperCase()}`
}

/**
 * Builds the salutation. Uses recipient.title if provided ("Dear Mr.
 * Smith,"), otherwise falls back to the full name ("Dear J. Smith,").
 * Returns "To whom it may concern," when no recipient name is on
 * file — happens when the user has not yet captured recipient data
 * via the presurvey questionnaire.
 */
export function buildTransmittalSalutation(recipient: Recipient): string {
  const name = (recipient.fullName || '').trim()
  if (!name) return 'To whom it may concern,'
  if (recipient.title) {
    const honorific = pickHonorific(recipient.title)
    const surname = lastWordOf(name)
    if (honorific && surname) return `Dear ${honorific} ${surname},`
  }
  return `Dear ${name},`
}

/**
 * Reduce a long firm name to its short acronym. Heuristic: if the firm
 * name is short (<=8 words) just return it; otherwise extract initials
 * from the first capitalized words.
 */
function shortFirmName(fullName: string): string {
  // Specific known shortening for the canonical Prudence firm name.
  if (fullName.startsWith('Prudence Safety')) return 'PSEC'
  return fullName
}

function pickHonorific(title: string): string | null {
  const t = title.toLowerCase()
  if (t.includes('mr.') || t.includes('mister')) return 'Mr.'
  if (t.includes('ms.') || t.includes('miss')) return 'Ms.'
  if (t.includes('mrs.')) return 'Mrs.'
  if (t.includes('dr.') || t.includes('doctor')) return 'Dr.'
  return null
}

function lastWordOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1] || ''
}
