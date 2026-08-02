/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * reportLifecycle — the single source of truth for what state a report is
 * in, what it may become, and how it presents itself.
 *
 * ── Why this exists ────────────────────────────────────────────────────
 *
 * Every AtmosFlow report used to render as "Draft — IH Review Required"
 * with a DRAFT watermark, because the chrome had exactly three branches
 * (sample / final / everything-else) and nothing ever selected `final`
 * for a screening deliverable. A routine logger upload — a report that is
 * complete and correct — therefore read to a client as unfinished work.
 *
 * That is a positioning problem, not a defensibility one. A screening
 * assessment IS finished; it simply is not a professional opinion. So the
 * two ideas are separated here: a report has a PROFILE (what kind of work
 * it represents) and a STATUS (where it is in its life). Screening reports
 * reach Final without a reviewer; professional and compliance work carries
 * a named reviewer to get there.
 *
 * ── One thing this module is careful about ─────────────────────────────
 *
 * "IH Review Required" also appears on AI-generated narrative, where it
 * means something completely different: that a specific PARAGRAPH was
 * written by a model. That label is about provenance, not completeness,
 * and it is NOT replaced by this lifecycle — see the AI provenance banner
 * in src/components/docx/sections-core.js. Conflating the two would let a
 * model-written client-facing paragraph become indistinguishable from one
 * the assessor wrote.
 *
 * ── Backward compatibility is load-bearing ─────────────────────────────
 *
 * The app has always stored `status` as 'draft' | 'complete', and the
 * drafts-vs-reports split across the dashboard, history and full-sync
 * index reads it (src/utils/supabaseStorage.js). That vocabulary keeps
 * working: `toLegacyStatus` / `fromLegacyStatus` map between it and the
 * four-state lifecycle, and the legacy column keeps receiving legacy
 * values. Nothing that reads `status === 'complete'` has to change.
 *
 * Pure data + pure functions: no React, no network, no storage.
 */

/**
 * What kind of work the report represents.
 *
 * The profile is chosen when the report is created and drives BOTH the
 * chrome and the transition rules. It is not a display preference.
 */
export const REPORT_PROFILES = {
  /** Default. IAQ screening, logger uploads, routine monitoring. */
  SCREENING: 'screening',
  /** Consultant deliverable that carries a named professional reviewer. */
  PROFESSIONAL: 'professional',
  /** Formal occupational exposure evaluation. Approval-gated. */
  COMPLIANCE: 'compliance',
}

/** Every report is always in exactly one of these. */
export const REPORT_STATUS = {
  DRAFT: 'draft',
  IN_REVIEW: 'in_review',
  REVIEWED: 'reviewed',
  FINAL: 'final',
}

export const REPORT_PROFILE_VALUES = Object.freeze(Object.values(REPORT_PROFILES))
export const REPORT_STATUS_VALUES = Object.freeze(Object.values(REPORT_STATUS))

/** Default profile for a report created without one stated. */
export const DEFAULT_PROFILE = REPORT_PROFILES.SCREENING
export const DEFAULT_STATUS = REPORT_STATUS.DRAFT

/**
 * Legal moves.
 *
 * Reverting to Draft from review states is deliberate: a reviewer asking
 * for changes has to be able to send the report back, and modelling that
 * as a new report would orphan the review history.
 */
export const TRANSITIONS = Object.freeze({
  [REPORT_STATUS.DRAFT]: [REPORT_STATUS.IN_REVIEW, REPORT_STATUS.FINAL],
  [REPORT_STATUS.IN_REVIEW]: [REPORT_STATUS.REVIEWED, REPORT_STATUS.DRAFT],
  [REPORT_STATUS.REVIEWED]: [REPORT_STATUS.FINAL, REPORT_STATUS.DRAFT],
  [REPORT_STATUS.FINAL]: [],
})

/**
 * Whether a profile requires a recorded reviewer approval before Final.
 *
 * TRUE for Compliance only. This is the one hard gate in the system, and
 * it is deliberately narrow: AtmosFlow's standing rule is that a
 * credentialed assessor owns defensibility and the platform surfaces gaps
 * rather than blocking issuance. A formal occupational exposure
 * evaluation is the stated exception (product sign-off recorded in
 * CLAUDE.md) — screening and professional reports can always be issued.
 */
export function requiresApproval(profile) {
  return profile === REPORT_PROFILES.COMPLIANCE
}

const isValidProfile = (p) => REPORT_PROFILE_VALUES.includes(p)
const isValidStatus = (s) => REPORT_STATUS_VALUES.includes(s)

/**
 * May this report move from `from` to `to`?
 *
 * @param {string} profile
 * @param {string} from
 * @param {string} to
 * @param {object} [ctx]
 * @param {boolean} [ctx.hasApproval] a recorded reviewer approval exists
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function canTransition(profile, from, to, ctx = {}) {
  if (!isValidProfile(profile)) return { ok: false, reason: `Unknown report profile "${profile}".` }
  if (!isValidStatus(from)) return { ok: false, reason: `Unknown current status "${from}".` }
  if (!isValidStatus(to)) return { ok: false, reason: `Unknown target status "${to}".` }
  if (from === to) return { ok: false, reason: 'Report is already in that state.' }

  const allowed = TRANSITIONS[from] || []
  if (!allowed.includes(to)) {
    return { ok: false, reason: `A ${statusLabel(profile, from)} report cannot move directly to ${statusLabel(profile, to)}.` }
  }

  // The compliance gate. Note it blocks the SHORTCUT (draft → final),
  // not the reviewed → final path: a compliance report reaches Final
  // through a reviewer, which is the entire point of the profile.
  if (to === REPORT_STATUS.FINAL && requiresApproval(profile) && !ctx.hasApproval) {
    return {
      ok: false,
      reason: 'A compliance assessment requires a recorded reviewer approval before it can be marked Final.',
    }
  }
  return { ok: true }
}

/** Human label for a status, in the context of its profile. */
export function statusLabel(profile, status) {
  switch (status) {
    case REPORT_STATUS.DRAFT:
      // A screening draft is simply in progress — nothing is pending a
      // reviewer, because a screening report never had one.
      return profile === REPORT_PROFILES.SCREENING ? 'Draft' : 'Draft — Pending Professional Review'
    case REPORT_STATUS.IN_REVIEW:
      return 'In Review'
    case REPORT_STATUS.REVIEWED:
      return 'Professionally Reviewed'
    case REPORT_STATUS.FINAL:
      return 'Final'
    default:
      return 'Draft'
  }
}

/** Human label for a profile. */
export function profileLabel(profile) {
  switch (profile) {
    case REPORT_PROFILES.PROFESSIONAL: return 'Professional Assessment'
    case REPORT_PROFILES.COMPLIANCE: return 'Compliance Assessment'
    default: return 'Screening Assessment'
  }
}

/**
 * The limitation statement carried by screening deliverables.
 *
 * This is what replaces the draft banner. It states the scope honestly —
 * measured conditions against selected criteria — without implying the
 * document is unfinished, and without claiming a compliance
 * determination. The screening-only positioning the MSA recitals rest on
 * is preserved by this sentence, not by the watermark.
 */
export const SCREENING_LIMITATION =
  'This report summarizes measured environmental conditions and compares them against ' +
  'the selected evaluation criteria. Conclusions are limited to the scope of the assessment ' +
  'and should not be interpreted as a regulatory compliance determination unless explicitly stated.'

/** Badge tone, mapped by the UI to its own palette. */
export function statusTone(status) {
  switch (status) {
    case REPORT_STATUS.FINAL: return 'ok'
    case REPORT_STATUS.REVIEWED: return 'accent'
    case REPORT_STATUS.IN_REVIEW: return 'notice'
    default: return 'muted'
  }
}

/**
 * How the document presents itself: header, watermark, cover chip,
 * footer, and the disclaimer paragraph.
 *
 * Returns the same shape the renderer has always consumed
 * (src/report/reportModel.js `modeChrome`), so the call site becomes a
 * thin adapter rather than a rewrite.
 *
 * The rule that matters: a SCREENING report at any status other than
 * Draft carries NO watermark and NO pending language. That is the whole
 * objective of this refactor.
 *
 * @param {string} profile
 * @param {string} status
 * @param {object} [ctx]
 * @param {string} [ctx.reportId]
 * @param {string} [ctx.client]
 * @param {object} [ctx.reviewer] {name, credentials, organization, reviewDate, approvalId}
 */
export function reportChrome(profile, status, ctx = {}) {
  const reportId = ctx.reportId || ''
  const client = ctx.client || 'the client'
  const id = reportId ? `${reportId}  ·  ` : ''

  if (status === REPORT_STATUS.DRAFT) {
    // Screening drafts still say Draft — they genuinely are one — but
    // without the "pending professional review" framing, which was never
    // true of a screening deliverable.
    const screening = profile === REPORT_PROFILES.SCREENING
    return {
      headerLabel: screening ? 'Draft' : 'Draft — Pending Professional Review',
      watermark: 'DRAFT',
      coverStatusChip: statusLabel(profile, status),
      footerNote: `${id}${screening ? 'Draft — not yet issued' : 'Draft — pending professional review'}`,
      coverDisclaimer: screening
        ? 'This draft has not been issued. Content may change before the report is finalized.'
        : 'This draft has not been finalized and should not be distributed as a professional opinion.',
    }
  }

  if (status === REPORT_STATUS.IN_REVIEW) {
    return {
      headerLabel: 'In Review',
      watermark: 'IN REVIEW',
      coverStatusChip: 'In Review',
      footerNote: `${id}In review — not for distribution`,
      coverDisclaimer: 'This report is undergoing professional review and should not be distributed in its current form.',
    }
  }

  if (status === REPORT_STATUS.REVIEWED) {
    const r = ctx.reviewer || {}
    const who = [r.name, r.credentials].filter(Boolean).join(', ')
    return {
      headerLabel: 'Professionally Reviewed',
      watermark: null,
      coverStatusChip: 'Professionally Reviewed',
      footerNote: `${id}Professionally reviewed${who ? ` — ${who}` : ''}`,
      coverDisclaimer: null,
    }
  }

  // FINAL
  return {
    headerLabel: 'Confidential — Final',
    watermark: null,
    coverStatusChip: 'Final',
    footerNote: `${id}Confidential — prepared for ${client}`,
    coverDisclaimer: null,
  }
}

/**
 * The limitation paragraph a report carries, by profile.
 *
 * Screening gets the scope statement; professional and compliance work
 * carries the reviewer's own limitations, which the renderer supplies.
 */
export function limitationStatement(profile) {
  return profile === REPORT_PROFILES.SCREENING ? SCREENING_LIMITATION : null
}

// ── Legacy status compatibility ────────────────────────────────────────
//
// `assessments.status` has always been 'draft' | 'complete', and six call
// sites in supabaseStorage.js split drafts from reports on it. Both
// directions are kept total (every input maps to something valid) so a
// row written by an older client, or read by one, is never stranded.

/** Four-state lifecycle → the legacy two-state column. */
export function toLegacyStatus(status) {
  return status === REPORT_STATUS.REVIEWED || status === REPORT_STATUS.FINAL
    ? 'complete'
    : 'draft'
}

/**
 * Legacy two-state column → lifecycle.
 *
 * 'complete' becomes Final rather than Reviewed: an existing report was
 * issued without a recorded reviewer, so claiming it was professionally
 * reviewed would be inventing an approval that never happened.
 */
export function fromLegacyStatus(legacy) {
  return legacy === 'complete' ? REPORT_STATUS.FINAL : REPORT_STATUS.DRAFT
}

/**
 * Normalize whatever a stored record carries into a valid pair.
 *
 * Records predating this lifecycle have only `status`; records written
 * since carry `report_profile` / `report_status`. Both shapes, and the
 * camelCase app-shape variants, resolve here so no consumer has to guess.
 */
export function resolveLifecycle(record = {}) {
  const rawProfile = record.report_profile || record.reportProfile
  const rawStatus = record.report_status || record.reportStatus
  const profile = isValidProfile(rawProfile) ? rawProfile : DEFAULT_PROFILE
  const status = isValidStatus(rawStatus) ? rawStatus : fromLegacyStatus(record.status)
  return { profile, status }
}

/**
 * The version snapshot frozen into an approval record.
 *
 * Captured at approval time rather than derived at read time: a report
 * approved under engine 2.8 must still show 2.8 after the engine moves
 * on, or the audit trail rewrites itself.
 */
export function buildApprovedVersion({ engineVersion, appVersion, standardsManifestDate, rulesetVersion } = {}) {
  return {
    engine_version: engineVersion || null,
    app_version: appVersion || null,
    standards_manifest_date: standardsManifestDate || null,
    ruleset_version: rulesetVersion || null,
    calculation_version: engineVersion || null,
  }
}
