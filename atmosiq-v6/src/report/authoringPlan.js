/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * The authoring plan: the writer organizes the investigation before it
 * drafts a word of it.
 *
 * ── What this is for ───────────────────────────────────────────────────
 * The hypothesis being tested, stated plainly so a later reader can judge
 * whether it held: a writer made to decide what the investigation FOUND —
 * which findings lead, which support, what stayed unresolved, what order
 * the actions belong in — writes a more coherent report than one that goes
 * straight to prose section by section. The plan is the artifact of that
 * decision.
 *
 * ── What it is NOT ─────────────────────────────────────────────────────
 * It is internal scaffolding. It never renders, it is never persisted with
 * the assessment, and no reader ever sees it. It creates nothing: every
 * finding, recommendation and parameter it names must already exist in the
 * package, and it may not introduce a conclusion the record does not carry.
 * It organizes what the engine decided; it decides nothing.
 *
 * ── Resolved against the WIRE package, never the richer one ────────────
 * Validation takes `packageForWriter` output — the exact object the model
 * was given — and not `buildEvidencePackage`'s fuller version. The
 * difference matters: the wire form sheds observations under budget
 * pressure and rebuilds findings with a narrower field set. Checking a
 * reference against something the writer never saw would accept a name it
 * had no way to know and, worse, would call a genuinely unknowable
 * reference valid.
 *
 * ── An unresolved reference invalidates its FIELD, never the sections ───
 * A plan is an improvement to reach for, not a gate to fail. If the model
 * names a finding that does not exist, that list is dropped with a
 * diagnostic and the rest of the plan stands; if the whole plan is
 * unusable, the sections are still judged on their own merits by the
 * narrative audit and the banned-language floor, exactly as they are
 * today. Report QA never blocks the deliverable, and a planning pass is
 * not an exception to that — the worst outcome here is the report we would
 * have written anyway.
 *
 * Nothing is repaired or guessed. An id that does not resolve is dropped,
 * never mapped to the nearest match: a plan that silently points at a
 * different finding is worse than one that points at nothing.
 */

const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const str = (v) => (typeof v === 'string' ? v.trim() : '')

/** Bumped when the plan's shape changes. Recorded with the run. */
export const PLAN_VERSION = 1

/**
 * What the assessment concluded about a source, as a closed vocabulary.
 *
 * Deliberately not free text. "Was a source identified?" is the single
 * question that most changes how a report reads — it decides whether the
 * recommendations verify or remediate — and a phrase the model invents for
 * it cannot be checked against anything.
 */
export const SOURCE_STATUSES = Object.freeze([
  'identified', 'partially_identified', 'not_identified', 'not_applicable',
])

/** Every key a plan may carry. Anything else is a rejection. */
export const PLAN_KEYS = Object.freeze([
  'overall_conclusion',
  'primary_findings',
  'supporting_findings',
  'important_negative_findings',
  'unresolved_questions',
  'source_status',
  'recommendation_sequence',
  'throughline',
])

/** Prose fields, and the ceiling that keeps a plan from becoming a draft. */
export const MAX_PROSE_CHARS = 400
/** Free-text list entries, and how many of them. */
export const MAX_QUESTION_CHARS = 240
export const MAX_LIST_ENTRIES = 20

/**
 * Why part of a plan was not accepted.
 *
 * Every one is a diagnostic about the PLAN. None is a defect in the report,
 * and none may ever be shown to an assessor as one.
 */
export const PLAN_REJECTIONS = Object.freeze([
  'not_an_object',        // the response carried no plan object at all
  'unknown_key',          // a key the schema does not define
  'wrong_type',           // a field of the wrong shape
  'too_long',             // prose past its ceiling
  'too_many',             // a list past its ceiling
  'unknown_finding',      // a finding id the wire package never carried
  'unknown_recommendation',
  'unknown_subject',      // neither a finding nor a measured parameter
  'unknown_source_status',
  'duplicate_reference',  // the same id twice in one list
  'cross_list_conflict',  // a finding named both primary and supporting
])

/**
 * Every identifier the wire package actually handed out, by kind.
 *
 * Built from the wire object so the set a plan may name and the set it is
 * checked against are the same object — a second construction of this is
 * how the two start disagreeing.
 */
export function planReferenceIndex(wire) {
  const w = obj(wire)
  const findings = new Set(arr(w.findings).map((f) => str(obj(f).id)).filter(Boolean))
  const recommendations = new Set(arr(w.recommendation_options).map((r) => str(obj(r).id)).filter(Boolean))
  // A "negative finding" is often about a parameter that was measured and
  // produced nothing — which is exactly what the report should say and has
  // no finding id by definition. Both parameter groups (as the background
  // section keys them) and raw parameter keys resolve.
  const parameters = new Set([
    ...arr(w.parameter_context).map((p) => str(obj(p).parameter_group)),
    ...Object.keys(obj(w.parameters)),
  ].filter(Boolean))
  return { findings, recommendations, parameters }
}

/** One id list, resolved against a known set. Unknown entries are dropped. */
function resolveList(values, known, reason, field, rejected) {
  const out = []
  const seen = new Set()
  for (const raw of arr(values)) {
    const id = str(raw)
    if (!id) { rejected.push({ reason: 'wrong_type', field, detail: 'non-string entry' }); continue }
    if (!known.has(id)) { rejected.push({ reason, field, detail: id }); continue }
    if (seen.has(id)) { rejected.push({ reason: 'duplicate_reference', field, detail: id }); continue }
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Prose, trimmed and bounded. Over the ceiling is dropped, never truncated. */
function resolveProse(value, field, limit, rejected) {
  const s = str(value)
  if (!s) return ''
  if (s.length > limit) {
    // Truncating would publish half a sentence the model did not write.
    rejected.push({ reason: 'too_long', field, detail: `${s.length} chars` })
    return ''
  }
  return s
}

/**
 * Turn a candidate plan into one that references only what exists.
 *
 * Pure and synchronous. Never throws: a malformed plan is an empty plan
 * with reasons, because the sections are written and judged regardless.
 *
 * @param {*} plan the `authoring_plan` the model returned, or anything
 * @param {object} wire `packageForWriter` output — the EXACT object the
 *   model was given, never the richer internal package
 * @returns {{plan: object, rejected: Array<{reason: string, field?: string, detail?: string}>, usable: boolean}}
 */
export function validateAuthoringPlan(plan, wire) {
  const rejected = []
  const raw = plan && typeof plan === 'object' && !Array.isArray(plan) ? plan : null
  if (!raw) {
    return { plan: emptyPlan(), rejected: [{ reason: 'not_an_object' }], usable: false }
  }

  for (const key of Object.keys(raw)) {
    if (!PLAN_KEYS.includes(key)) rejected.push({ reason: 'unknown_key', detail: key })
  }

  const index = planReferenceIndex(wire)

  const primary = resolveList(raw.primary_findings, index.findings, 'unknown_finding', 'primary_findings', rejected)
  let supporting = resolveList(raw.supporting_findings, index.findings, 'unknown_finding', 'supporting_findings', rejected)

  // A finding cannot lead and support at once. The primary list wins,
  // because that is the editorial decision the plan exists to make.
  const inPrimary = new Set(primary)
  supporting = supporting.filter((id) => {
    if (!inPrimary.has(id)) return true
    rejected.push({ reason: 'cross_list_conflict', field: 'supporting_findings', detail: id })
    return false
  })

  // A negative finding may be a finding OR a parameter that was measured
  // and produced nothing — the second has no finding id by definition.
  const negatives = []
  const seenNeg = new Set()
  for (const rawId of arr(raw.important_negative_findings)) {
    const id = str(rawId)
    if (!id) { rejected.push({ reason: 'wrong_type', field: 'important_negative_findings', detail: 'non-string entry' }); continue }
    if (!index.findings.has(id) && !index.parameters.has(id)) {
      rejected.push({ reason: 'unknown_subject', field: 'important_negative_findings', detail: id })
      continue
    }
    if (seenNeg.has(id)) { rejected.push({ reason: 'duplicate_reference', field: 'important_negative_findings', detail: id }); continue }
    seenNeg.add(id)
    negatives.push(id)
  }

  const sequence = resolveList(
    raw.recommendation_sequence, index.recommendations, 'unknown_recommendation', 'recommendation_sequence', rejected,
  )

  const questions = []
  for (const q of arr(raw.unresolved_questions)) {
    const s = resolveProse(q, 'unresolved_questions', MAX_QUESTION_CHARS, rejected)
    if (s) questions.push(s)
  }

  let sourceStatus = str(raw.source_status)
  if (sourceStatus && !SOURCE_STATUSES.includes(sourceStatus)) {
    rejected.push({ reason: 'unknown_source_status', field: 'source_status', detail: sourceStatus })
    sourceStatus = ''
  }

  const out = {
    overall_conclusion: resolveProse(raw.overall_conclusion, 'overall_conclusion', MAX_PROSE_CHARS, rejected),
    primary_findings: capped(primary, 'primary_findings', rejected),
    supporting_findings: capped(supporting, 'supporting_findings', rejected),
    important_negative_findings: capped(negatives, 'important_negative_findings', rejected),
    unresolved_questions: capped(questions, 'unresolved_questions', rejected),
    source_status: sourceStatus,
    recommendation_sequence: capped(sequence, 'recommendation_sequence', rejected),
    throughline: resolveProse(raw.throughline, 'throughline', MAX_PROSE_CHARS, rejected),
  }

  // "Usable" is a low bar on purpose: a plan that organized ANYTHING is
  // better scaffolding than none, and the sections do not depend on it.
  const usable = Boolean(
    out.overall_conclusion || out.throughline || out.source_status
    || out.primary_findings.length || out.recommendation_sequence.length,
  )
  return { plan: out, rejected, usable }
}

function capped(list, field, rejected) {
  if (list.length <= MAX_LIST_ENTRIES) return list
  rejected.push({ reason: 'too_many', field, detail: `${list.length} entries` })
  return list.slice(0, MAX_LIST_ENTRIES)
}

/** The shape of a plan that organized nothing. Always this shape, never null. */
export function emptyPlan() {
  return {
    overall_conclusion: '',
    primary_findings: [],
    supporting_findings: [],
    important_negative_findings: [],
    unresolved_questions: [],
    source_status: '',
    recommendation_sequence: [],
    throughline: '',
  }
}
