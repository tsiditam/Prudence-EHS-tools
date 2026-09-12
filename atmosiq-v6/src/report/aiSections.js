/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AI-authored sections of the AtmosFlow DOCX — generation, freshness, lock,
 * and how they fold into the render model.
 *
 * The AtmosFlow DOCX (`assembleRenderModel` → `sections-atmosflow.js`) is the
 * one client deliverable. `evidencePackage.js` and `narrativeAudit.js` make an
 * AI writer safe to use; this module is what makes it safe to PERSIST into
 * that deliverable.
 *
 * The constraint that shapes everything here: `render-determinism.test.ts`
 * requires the same stored assessment to render an identical report body
 * whenever it is exported. `assembleRenderModel` is a pure function of the
 * stored record — nothing on the render path calls out to a model. So
 * AI-authored text cannot be generated fresh inside the DOCX builder; it has
 * to be generated once, stored on the record like `zoneScores` or `comp`
 * already are, and read back by `assembleRenderModel` exactly as those are.
 *
 * The lifecycle:
 *   generate  → assessor-triggered, while drafting. Overwrites the record.
 *   fingerprint → a hash of the evidence the text was written from
 *     (`fingerprintPackage`). Compared against the CURRENT package on every
 *     render; a mismatch means the assessment moved since generation — a
 *     zone added, a reading changed — and the text is ignored rather than
 *     rendered stale into a client document. Never surfaced in the DOCX
 *     itself: a stale section falls back to the deterministic prose that was
 *     already there, exactly the "never worse than today" pattern the IndexedDB
 *     fallback and the banned-language fallback both use.
 *   lock      → set once, at finalize (`lockAiSections`), mirroring how
 *     `runScoring` already early-returns for a finalized report. A locked
 *     record does not regenerate; a report that has been issued should not
 *     read differently on a later export because someone asked the model
 *     the same question again and got a different answer.
 *
 * Per-section, not all-or-nothing. A blocking audit finding on ONE section
 * (a figure that doesn't check out, a criterion that never applied) falls
 * that ONE section back to deterministic prose; the other four still use
 * their AI text. This is a DELIBERATE divergence from the standalone
 * narrative, where the audit is advisory and never suppresses: that document
 * is one page an assessor reads before sending. These five sections go
 * straight into the signed client deliverable, several to a report, and a
 * wrong number in one is not something "advisory" should risk on the other
 * four's behalf.
 */

import { assembleRenderModel } from './reportModel'
import { buildEvidencePackage, fingerprintPackage, WRITABLE_SECTIONS } from './evidencePackage'
import { auditNarrative, summarizeAudit } from './narrativeAudit'

export const AI_SECTIONS_VERSION = 1

/**
 * Split AI-authored prose on blank lines into paragraph strings.
 *
 * `docx.TextRun` does not render an embedded `\n` as a line break, so a
 * multi-paragraph response stored as one string would print as one run —
 * exactly the gap `execSummary.paragraphs` already avoids by being an array.
 * This gives every writable section the same array shape.
 */
export function splitParagraphs(text) {
  return String(text || '').split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean)
}

/**
 * Parameter-background entries are keyed like `results.parameters[i].key`
 * (reportModel.js) — `co2`, `co`, `thermal`, `pm25`, `tvoc` — not by the raw
 * engine parameter id, because temperature and relative humidity are written
 * together as one entry both there and here. One grouping, read from the
 * model that already computed it, never re-declared.
 */
const auditKey = (section, paramKey) => (paramKey ? `parameter_background.${paramKey}` : section)

/**
 * Audit one generated section's text against the package.
 *
 * `requireUnconditional: false` — see `narrativeAudit.js`. These five
 * sections are embedded in a report whose own Limitations section already
 * carries the statutory floor unconditionally; this only requires the
 * TOPIC-scoped limitations (TVOC, averaging period, ventilation-inferred)
 * that actually apply to what a given section discusses.
 */
function auditSection(text, pkg) {
  const issues = auditNarrative(text, pkg, { requireUnconditional: false })
  return { issues, summary: summarizeAudit(issues) }
}

/**
 * Audit a freshly generated set of sections and assemble the stored record.
 *
 * @param {object} raw   `{ executive_summary, discussion, conceptual_site_model,
 *   recommendations_prose, parameter_background: {[key]: string} }` — the
 *   model's structured response, already validated to have this shape.
 * @param {object} pkg    the package it was written from
 * @param {object} [meta]  `{ model, generatedAt }`
 * @returns {object} the record to persist as `data.aiSections`
 */
export function buildAiSectionsRecord(raw, pkg, meta = {}) {
  const sections = {}
  const audit = {}
  const auditSummary = {}

  for (const key of WRITABLE_SECTIONS) {
    if (key === 'parameter_background') continue
    const text = raw && typeof raw[key] === 'string' ? raw[key].trim() : ''
    if (!text) continue
    sections[key] = text
    const { issues, summary } = auditSection(text, pkg)
    audit[key] = issues
    auditSummary[key] = summary
  }

  const pbgRaw = (raw && raw.parameter_background) || {}
  const pbg = {}
  for (const [paramKey, text] of Object.entries(pbgRaw)) {
    const trimmed = typeof text === 'string' ? text.trim() : ''
    if (!trimmed) continue
    pbg[paramKey] = trimmed
    const { issues, summary } = auditSection(trimmed, pkg)
    const k = auditKey('parameter_background', paramKey)
    audit[k] = issues
    auditSummary[k] = summary
  }
  if (Object.keys(pbg).length) sections.parameter_background = pbg

  return {
    version: AI_SECTIONS_VERSION,
    generatedAt: (meta.generatedAt || new Date()).toISOString(),
    model: meta.model || null,
    fingerprint: fingerprintPackage(pkg),
    sections,
    audit,
    auditSummary,
    locked: false,
  }
}

/** Whether a stored record was written from the assessment as it stands now. */
export function isAiSectionsFresh(aiSections, pkg) {
  if (!aiSections || !pkg) return false
  return aiSections.fingerprint === fingerprintPackage(pkg)
}

/**
 * Freeze a record at finalize. Mirrors `runScoring`'s early return for a
 * finalized report: the text a client was shown does not change because the
 * record was regenerated later.
 */
export function lockAiSections(aiSections) {
  if (!aiSections) return aiSections
  return { ...aiSections, locked: true }
}

/** The shortest justification an override is allowed to carry. */
export const MIN_OVERRIDE_JUSTIFICATION = 20

/** Whether a section carries a valid assessor override. */
export function isOverridden(aiSections, key) {
  const o = aiSections && aiSections.overrides && aiSections.overrides[key]
  return !!(o && typeof o.justification === 'string' && o.justification.trim().length >= MIN_OVERRIDE_JUSTIFICATION)
}

/**
 * Record an assessor's decision to use a section its own audit could not
 * support.
 *
 * Modeled on the calibration acknowledgement
 * (src/utils/calibrationAcknowledgement.js): proceeding is allowed, because a
 * credentialed assessor owns defensibility, but it COSTS a written reason and
 * it ADDS an audit artifact rather than removing one. The audit findings are
 * frozen onto the override at the moment it is made, so the report prints
 * what was actually overridden rather than whatever a later pass happens to
 * say.
 *
 * A section the server's banned-language gate rejected can never reach this:
 * `generateReportSections` drops those before `buildAiSectionsRecord` runs, so
 * they are absent from `sections` and an override has nothing to apply to.
 * That is the liability floor (api/_banned-language.js) and it is not
 * assessor-waivable. Pinned by tests/engine/ai-sections-override.test.ts.
 *
 * @returns {object} a new record; the input is never mutated
 */
export function applyOverride(aiSections, key, { justification, by, at } = {}) {
  const text = typeof justification === 'string' ? justification.trim() : ''
  if (!aiSections || !key) return aiSections
  if (text.length < MIN_OVERRIDE_JUSTIFICATION) return aiSections
  // Only a section that EXISTS and is actually blocked can be overridden.
  // Overriding a passing section would record a decision that was never made.
  const present = !!(aiSections.sections && readSection(aiSections.sections, key))
  const summary = aiSections.auditSummary && aiSections.auditSummary[key]
  if (!present || !summary || summary.supported !== false) return aiSections
  return {
    ...aiSections,
    overrides: {
      ...(aiSections.overrides || {}),
      [key]: {
        justification: text,
        by: by || null,
        at: (at || new Date()).toISOString ? (at || new Date()).toISOString() : String(at),
        issues: (aiSections.audit && aiSections.audit[key]) || [],
      },
    },
  }
}

/** Withdraw an override. The section falls back to deterministic prose again. */
export function removeOverride(aiSections, key) {
  if (!aiSections || !aiSections.overrides || !(key in aiSections.overrides)) return aiSections
  const { [key]: _dropped, ...rest } = aiSections.overrides
  return { ...aiSections, overrides: rest }
}

/** Read a section's text by audit key, including the dotted parameter-background form. */
function readSection(sections, key) {
  if (!sections) return null
  const dot = key.indexOf('.')
  if (dot === -1) return sections[key] || null
  const [group, sub] = [key.slice(0, dot), key.slice(dot + 1)]
  return (sections[group] && sections[group][sub]) || null
}

/**
 * Every override on a record, as rows ready to print.
 * `label` is left to the caller — the reader-facing names live in the UI and
 * the DOCX builder, not here.
 */
export function overriddenSections(aiSections) {
  const overrides = (aiSections && aiSections.overrides) || {}
  return Object.keys(overrides)
    .filter(key => isOverridden(aiSections, key))
    .sort()
    .map(key => ({ key, ...overrides[key] }))
}

/**
 * Whether one section's stored text may be used: present, and either
 * supported by its own audit or carrying a recorded assessor override.
 */
function sectionUsable(aiSections, key) {
  const summary = aiSections.auditSummary && aiSections.auditSummary[key]
  if (!summary) return false
  if (summary.supported !== false) return true
  return isOverridden(aiSections, key)
}

/**
 * Fold a stored AI-sections record into the render model, section by
 * section, falling back to the model's existing deterministic content for
 * anything absent, stale, or individually blocked by its own audit.
 *
 * Called once, at the end of `assembleRenderModel`. `model` already IS the
 * fallback for every section — this only OVERWRITES the fields an eligible
 * section owns; nothing here computes deterministic text of its own.
 *
 * @param {object} model       output of the deterministic assembly
 * @param {object|null|undefined} aiSections   `data.aiSections`, as stored
 * @param {object} pkg         the CURRENT evidence package, for the freshness check
 * @returns {object} model, with `aiSectionsStatus: 'none'|'stale'|'active'`,
 *   `aiAuthoredSections` and `evidenceFingerprint` (the CURRENT package's
 *   fingerprint, so a caller holding any stored AI output — these sections
 *   or the standalone narrative — can judge its freshness without
 *   rebuilding the package) added
 */
export function applyAiSections(model, aiSections, pkg) {
  const evidenceFingerprint = fingerprintPackage(pkg)
  if (!aiSections) return { ...model, aiSectionsStatus: 'none', aiAuthoredSections: [], aiOverrides: [], evidenceFingerprint }
  if (!isAiSectionsFresh(aiSections, pkg)) return { ...model, aiSectionsStatus: 'stale', aiAuthoredSections: [], aiOverrides: [], evidenceFingerprint }

  const out = { ...model, aiSectionsStatus: 'active', evidenceFingerprint }
  // Assessor overrides, for the QA/QC disclosure the report prints. Only the
  // ones that actually took effect below are kept — see the filter after the
  // section folding, which drops any override whose section is absent.
  const overrides = overriddenSections(aiSections)
  const sections = aiSections.sections || {}
  // Every section key this render actually overrode with AI text — the ONLY
  // thing that tells `sections-atmosflow.js` which paragraphs need the
  // AI-provenance caption it renders immediately before them
  // (CLAUDE.md anti-patterns: "AI-generated narrative without an
  // AI-provenance label" — a client-facing paragraph a model wrote must stay
  // distinguishable from one the assessor wrote). Deterministic prose gets
  // no caption; that is the whole reason this list exists rather than the
  // renderer guessing from the text.
  const authored = []

  if (sectionUsable(aiSections, 'executive_summary') && sections.executive_summary && out.execSummary) {
    out.execSummary = { ...out.execSummary, paragraphs: splitParagraphs(sections.executive_summary) }
    authored.push('executive_summary')
  }

  // New field — nothing deterministic renders here today, so there is no
  // fallback content to preserve; absent or ineligible simply means no
  // Discussion synthesis paragraph, which is exactly today's report.
  if (sectionUsable(aiSections, 'discussion') && sections.discussion) {
    out.discussion = { paragraphs: splitParagraphs(sections.discussion) }
    authored.push('discussion')
  }

  if (sectionUsable(aiSections, 'conceptual_site_model') && sections.conceptual_site_model && out.conceptualModel) {
    out.conceptualModel = { ...out.conceptualModel, intro: splitParagraphs(sections.conceptual_site_model) }
    authored.push('conceptual_site_model')
  }

  if (sectionUsable(aiSections, 'recommendations_prose') && sections.recommendations_prose && out.recommendations) {
    out.recommendations = { ...out.recommendations, intro: splitParagraphs(sections.recommendations_prose) }
    authored.push('recommendations_prose')
  }

  const pbg = sections.parameter_background
  if (pbg && out.results && Array.isArray(out.results.parameters)) {
    out.results = {
      ...out.results,
      parameters: out.results.parameters.map((p) => {
        if (!p.key || !pbg[p.key]) return p
        const key = auditKey('parameter_background', p.key)
        if (!sectionUsable(aiSections, key)) return p
        authored.push(key)
        return { ...p, body: splitParagraphs(pbg[p.key]) }
      }),
    }
  }

  out.aiAuthoredSections = authored
  // An override only counts once its section actually rendered. One recorded
  // against a section that has since been dropped would disclose a decision
  // the document does not contain.
  out.aiOverrides = overrides.filter(o => authored.includes(o.key))
  return out
}

/**
 * The call-site convenience: assemble the render model AND fold in whatever
 * AI-authored sections the record still supports.
 *
 * `assembleRenderModel` itself stays untouched by this module and by
 * `evidencePackage.js` — deliberately: it is the pure, deterministic core
 * every render-determinism guarantee rests on, and it should not need to
 * know this module exists. Every production export site
 * (`DocxReport.buildAtmosFlowDocument`, `downloadReportPdf`, the Report tab's
 * consistency preview) calls THIS instead of `assembleRenderModel` directly.
 *
 * @param {object} data   the same object `assembleRenderModel` takes —
 *   `data.aiSections` is read; `data.zoneScores` / `data.causalChains` are
 *   the engine outputs the evidence package needs
 * @param {object} [opts]  passed through to `assembleRenderModel`
 */
export function withAiSections(data, opts) {
  const model = assembleRenderModel(data, opts)
  const pkg = buildEvidencePackage(model, { zoneScores: data.zoneScores || [], causalChains: data.causalChains || [] })
  return applyAiSections(model, data.aiSections, pkg)
}
