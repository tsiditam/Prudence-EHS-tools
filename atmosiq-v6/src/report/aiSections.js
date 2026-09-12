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
  const present = !!sectionText(aiSections, key)
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

/** The shortest a revised section may be and still be a section. */
export const MIN_SECTION_TEXT = 40

/**
 * The text a section renders from — the assessor's revision where one exists,
 * the model's own text otherwise.
 *
 * Every consumer reads through this rather than `sections[key]`, so an edit
 * cannot reach one surface and miss another.
 */
export function sectionText(aiSections, key) {
  const edit = aiSections && aiSections.edits && aiSections.edits[key]
  const revised = edit && typeof edit.text === 'string' ? edit.text.trim() : ''
  if (revised) return revised
  const original = readSection(aiSections && aiSections.sections, key)
  return original ? String(original).trim() : null
}

/** Whether a section carries an assessor revision. */
export function isEdited(aiSections, key) {
  const edit = aiSections && aiSections.edits && aiSections.edits[key]
  return !!(edit && typeof edit.text === 'string' && edit.text.trim())
}

/**
 * Replace one section's prose with the assessor's own, and RE-AUDIT it.
 *
 * The third remedy for a blocked section, and the only one that answers the
 * check rather than routing around it. Falling back is silent and costs the
 * reader a paragraph; an override keeps the text by waiving the finding; an
 * edit changes the text so the finding no longer holds. Where the blocker is
 * `limitation-missing` the audit message names the exact sentence that is
 * absent, so the repair is usually to paste it in — after which the section
 * passes honestly and needs no waiver at all.
 *
 * Three properties this must hold, each load-bearing:
 *
 *  1. **Re-audited, never trusted.** The revision goes through the same
 *     `auditSection` the generated text did, against the same package, and the
 *     record stores the new verdict. An edit that introduces a bad figure is
 *     caught exactly like a generated one; an edit that fixes the blocker
 *     flips the section to supported with no override anywhere. Without a
 *     package there is nothing to check against, so the edit is refused —
 *     fail closed, the same as `reserveGeneration`.
 *  2. **It clears any override on that section.** A justification was written
 *     about the text as it stood. Carrying it onto revised prose would
 *     disclose an approval of words nobody approved — the same reasoning that
 *     drops an override on regeneration or a fingerprint change.
 *  3. **The FIRST original is kept, not the previous revision.** "Revert to
 *     the AI text" must reach what the model actually wrote, however many
 *     passes the assessor made, along with the verdict it carried.
 *
 * Only a section the model actually wrote can be revised: this edits AI prose,
 * it is not a general report editor, and a section the banned-language gate
 * dropped never reaches the record to be edited into existence.
 *
 * @returns {object} a new record; the input is never mutated
 */
export function applyEdit(aiSections, key, { text, by, at } = {}, pkg) {
  const next = typeof text === 'string' ? text.trim() : ''
  if (!aiSections || !key || !pkg) return aiSections
  if (next.length < MIN_SECTION_TEXT) return aiSections
  const original = readSection(aiSections.sections, key)
  if (!original) return aiSections
  if (next === sectionText(aiSections, key)) return aiSections
  const { issues, summary } = auditSection(next, pkg)
  const prior = (aiSections.edits && aiSections.edits[key]) || null
  const { [key]: _waived, ...overrides } = (aiSections.overrides || {})
  return {
    ...aiSections,
    edits: {
      ...(aiSections.edits || {}),
      [key]: {
        text: next,
        by: by || null,
        at: isoStamp(at),
        original: prior ? prior.original : String(original).trim(),
        originalAudit: prior ? prior.originalAudit : ((aiSections.audit && aiSections.audit[key]) || []),
        originalSummary: prior ? prior.originalSummary : ((aiSections.auditSummary && aiSections.auditSummary[key]) || null),
      },
    },
    audit: { ...(aiSections.audit || {}), [key]: issues },
    auditSummary: { ...(aiSections.auditSummary || {}), [key]: summary },
    overrides,
  }
}

/**
 * Drop a revision and restore the model's own text, with the verdict it
 * carried. Stored rather than recomputed, so a revert cannot land on a
 * different answer than the one the assessor was originally shown.
 */
export function removeEdit(aiSections, key) {
  const edit = aiSections && aiSections.edits && aiSections.edits[key]
  if (!edit) return aiSections
  const { [key]: _dropped, ...edits } = aiSections.edits
  // The override went when the edit was made; anything recorded since was
  // about the revision, so it goes with it too.
  const { [key]: _waived, ...overrides } = (aiSections.overrides || {})
  return {
    ...aiSections,
    edits,
    audit: { ...(aiSections.audit || {}), [key]: edit.originalAudit || [] },
    auditSummary: { ...(aiSections.auditSummary || {}), [key]: edit.originalSummary || null },
    overrides,
  }
}

/** Every section carrying an assessor revision, for the provenance label. */
export function editedSections(aiSections) {
  const edits = (aiSections && aiSections.edits) || {}
  return Object.keys(edits).filter(key => isEdited(aiSections, key)).sort()
}

const isoStamp = (at) => {
  const d = at || new Date()
  return d && typeof d.toISOString === 'function' ? d.toISOString() : String(d)
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
  if (!aiSections) return { ...model, aiSectionsStatus: 'none', aiAuthoredSections: [], aiEditedSections: [], aiOverrides: [], evidenceFingerprint }
  if (!isAiSectionsFresh(aiSections, pkg)) return { ...model, aiSectionsStatus: 'stale', aiAuthoredSections: [], aiEditedSections: [], aiOverrides: [], evidenceFingerprint }

  const out = { ...model, aiSectionsStatus: 'active', evidenceFingerprint }
  // Assessor overrides, for the QA/QC disclosure the report prints. Only the
  // ones that actually took effect below are kept — see the filter after the
  // section folding, which drops any override whose section is absent.
  const overrides = overriddenSections(aiSections)
  const revised = editedSections(aiSections)
  // Read through `sectionText`, never off `sections` directly: an assessor
  // revision must reach the deliverable by the same path the model's own text
  // does, or the Report tab and the DOCX disagree about what the report says.
  const text = (key) => sectionText(aiSections, key)
  // Every section key this render actually overrode with AI text — the ONLY
  // thing that tells `sections-atmosflow.js` which paragraphs need the
  // AI-provenance caption it renders immediately before them
  // (CLAUDE.md anti-patterns: "AI-generated narrative without an
  // AI-provenance label" — a client-facing paragraph a model wrote must stay
  // distinguishable from one the assessor wrote). Deterministic prose gets
  // no caption; that is the whole reason this list exists rather than the
  // renderer guessing from the text.
  const authored = []

  if (sectionUsable(aiSections, 'executive_summary') && text('executive_summary') && out.execSummary) {
    out.execSummary = { ...out.execSummary, paragraphs: splitParagraphs(text('executive_summary')) }
    authored.push('executive_summary')
  }

  // New field — nothing deterministic renders here today, so there is no
  // fallback content to preserve; absent or ineligible simply means no
  // Discussion synthesis paragraph, which is exactly today's report.
  if (sectionUsable(aiSections, 'discussion') && text('discussion')) {
    out.discussion = { paragraphs: splitParagraphs(text('discussion')) }
    authored.push('discussion')
  }

  if (sectionUsable(aiSections, 'conceptual_site_model') && text('conceptual_site_model') && out.conceptualModel) {
    out.conceptualModel = { ...out.conceptualModel, intro: splitParagraphs(text('conceptual_site_model')) }
    authored.push('conceptual_site_model')
  }

  if (sectionUsable(aiSections, 'recommendations_prose') && text('recommendations_prose') && out.recommendations) {
    out.recommendations = { ...out.recommendations, intro: splitParagraphs(text('recommendations_prose')) }
    authored.push('recommendations_prose')
  }

  if (out.results && Array.isArray(out.results.parameters)) {
    out.results = {
      ...out.results,
      parameters: out.results.parameters.map((p) => {
        if (!p.key) return p
        const key = auditKey('parameter_background', p.key)
        const body = text(key)
        if (!body || !sectionUsable(aiSections, key)) return p
        authored.push(key)
        return { ...p, body: splitParagraphs(body) }
      }),
    }
  }

  out.aiAuthoredSections = authored
  // Sections the assessor revised, of the ones that actually rendered. The
  // provenance label is a statement about WHO WROTE the text (CLAUDE.md), so a
  // paragraph with two authors may not print the caption that names one.
  out.aiEditedSections = revised.filter(key => authored.includes(key))
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
  return applyAiSections(model, data.aiSections, evidencePackageFor(data, opts))
}

/**
 * The evidence package for an assessment, built the way every other caller
 * builds it — off the DETERMINISTIC model, before any AI text is folded in.
 *
 * Exported because `applyEdit` has to re-audit a revision against the same
 * package the generated text was judged by, and the Report tab is holding the
 * assessment data rather than a package. Rebuilding it from the AI-folded
 * model instead would be a real defect and a quiet one: `context_standards` is
 * derived by reading the model's own parameter prose, so a package built after
 * folding would describe the AI's text rather than the report's.
 */
export function evidencePackageFor(data, opts) {
  const model = assembleRenderModel(data, opts)
  return buildEvidencePackage(model, { zoneScores: data.zoneScores || [], causalChains: data.causalChains || [] })
}
