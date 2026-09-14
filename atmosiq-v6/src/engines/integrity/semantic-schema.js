/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * What a semantic reviewer is allowed to return, stated as a shape.
 *
 * The model is an ISSUE PROPOSER, not a detector. Nothing it returns becomes
 * an AtmosFlow finding, and this module is the first of the gates that makes
 * that true: before any quote is resolved or any identifier looked up, a
 * candidate has to be the right shape, drawn from the right vocabulary, and
 * carrying nothing else.
 *
 * ── Why the shape is closed rather than merely checked ─────────────────
 * The orphaned endpoint this replaces accepted `{ severity, category, title,
 * detail, anchor }` where `category` was any snake_case string the model
 * chose and `anchor` was a free object. That is a schema in the sense that it
 * has field names, and it admits anything: a model could invent a category,
 * anchor it to a zone that does not exist, and write a paragraph of prose
 * asserting a cause, and every field would be "valid".
 *
 * So the vocabulary is enumerated, the rule decides the issue type rather
 * than the model, and UNKNOWN KEYS ARE A REJECTION rather than something to
 * ignore. Ignoring an extra field is how a field nobody designed ends up
 * being read by somebody downstream — and a reviewer that has started
 * returning fields the schema never asked for is a reviewer answering a
 * different question than the one that was put.
 *
 * ── The rule decides the issue type, not the model ─────────────────────
 * Each semantic rule maps to exactly one issue type in the shared contract,
 * declared here. The model still states it, and a mismatch is a rejection
 * rather than a correction: a candidate whose rule and type disagree was
 * produced by something that has lost track of what it was asked, and
 * quietly repairing it would hide that.
 *
 * ── No severity above warning exists to be returned ────────────────────
 * Report QA is advisory permanently. `blocking` is absent from the
 * vocabulary, so it cannot be returned, cannot be mapped, and cannot be
 * reached by a future prompt change or a provider swap. The rejection is the
 * mechanism; there is no clamp to be forgotten.
 */

/** Bumped when the candidate shape or the vocabularies change. */
export const SEMANTIC_SCHEMA_VERSION = 1

/**
 * The questions a semantic reviewer may be asked, narrowly.
 *
 * Deliberately not a general "find anything wrong with this report" surface.
 * A named rule can be evaluated, prompted for, tested and switched off; an
 * open-ended reviewer can only be judged by whether its output looks
 * plausible, which is the property least worth trusting here.
 */
export const SEMANTIC_RULES = Object.freeze([
  // Two report statements that materially disagree about the same subject.
  'cross_section_contradiction',
  // A statement expressing more certainty than the supplied evidence carries.
  'evidence_overstatement',
  // A recommendation that conflicts with the finding it claims to address.
  'finding_recommendation_conflict',
  // Narrative interpretation introducing a claim the record does not carry.
  'unsupported_interpretation',
  // A claim exceeding what the APPROVED reference context supports.
  'reference_claim_mismatch',
])

/** The contract issue types semantic review may project into, and no others. */
export const SEMANTIC_ISSUE_TYPES = Object.freeze([
  'contradiction', 'unsupported_conclusion', 'coverage_mismatch', 'missing_context',
])

/**
 * The severities semantic review may carry.
 *
 * `blocking` is not here and must never be. Report QA never blocks report
 * generation, finalization, export or issuance, and that is a permanent
 * product rule rather than a property of this phase.
 */
export const SEMANTIC_SEVERITIES = Object.freeze(['advisory', 'warning'])

/**
 * What each rule concludes and what it must produce to be believed.
 *
 * `comparison` says what the second half of the issue has to be:
 *   quote      a second passage of report text, which must also resolve
 *   evidence   an identifier from the package's own evidence index
 *   reference  an identifier from `reference_context`, which exists only when
 *              the assessment applied a criterion the corpus documents
 *
 * A rule is never allowed a bare one-sided claim. Something must be pointed
 * at, or there is nothing to check the claim against and nothing for a reader
 * to go and look at.
 */
export const RULE_SPEC = Object.freeze({
  cross_section_contradiction: Object.freeze({
    issue_type: 'contradiction', comparison: 'quote', severity: 'warning',
  }),
  evidence_overstatement: Object.freeze({
    issue_type: 'unsupported_conclusion', comparison: 'evidence', severity: 'warning',
  }),
  finding_recommendation_conflict: Object.freeze({
    issue_type: 'coverage_mismatch', comparison: 'evidence', severity: 'warning',
  }),
  unsupported_interpretation: Object.freeze({
    issue_type: 'unsupported_conclusion', comparison: 'evidence', severity: 'warning',
  }),
  reference_claim_mismatch: Object.freeze({
    issue_type: 'unsupported_conclusion', comparison: 'reference', severity: 'warning',
  }),
})

/** Keys a candidate issue may carry. Anything else is a rejection. */
export const CANDIDATE_KEYS = Object.freeze([
  'semantic_rule', 'issue_type', 'severity', 'primary', 'comparison', 'explanation',
])

/** Keys the `primary` locator may carry. */
export const LOCATOR_KEYS = Object.freeze(['section_id', 'quote'])

/** Keys the `comparison` half may carry, depending on the rule. */
export const COMPARISON_KEYS = Object.freeze(['section_id', 'quote', 'evidence_id'])

/** Longest explanation a candidate may carry, so one cannot become an essay. */
export const MAX_EXPLANATION_CHARS = 600
/** Longest quote, so a reviewer cannot return a whole section as its own quote. */
export const MAX_QUOTE_CHARS = 600
/** Most candidates one response may carry, before any of them is evaluated. */
export const MAX_CANDIDATES = 40

/**
 * Why a candidate was refused. Machine-readable, because a diagnostic that
 * says only "invalid" cannot tell a prompt problem from a provider problem
 * from a genuine disagreement about the report.
 */
export const SCHEMA_REJECTIONS = Object.freeze([
  'not_an_object',
  'unknown_key',
  'unknown_semantic_rule',
  'unknown_issue_type',
  'issue_type_not_the_rule_s',
  'unknown_severity',
  'blocking_severity',
  'missing_primary',
  'missing_quote',
  'quote_too_long',
  'missing_comparison',
  'comparison_not_allowed_for_rule',
  'wrong_comparison_kind',
  'missing_explanation',
  'explanation_too_long',
  'too_many_candidates',
])

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v) => (typeof v === 'string' ? v.trim() : '')

/** A locator carrying a section and a quote, or a reason it is not one. */
function checkLocator(value, keys) {
  if (!isObj(value)) return { ok: false, reason: 'missing_primary' }
  for (const k of Object.keys(value)) {
    if (!keys.includes(k)) return { ok: false, reason: 'unknown_key', detail: k }
  }
  const quote = str(value.quote)
  if (!quote) return { ok: false, reason: 'missing_quote' }
  if (quote.length > MAX_QUOTE_CHARS) return { ok: false, reason: 'quote_too_long' }
  return { ok: true, value: { section_id: str(value.section_id), quote } }
}

/**
 * Check one candidate's SHAPE. Resolution is somebody else's job.
 *
 * Nothing here reads the report, looks anything up, or decides whether the
 * criticism is true. It decides whether the thing is well formed enough to be
 * worth resolving — which keeps the two concerns separable, and keeps this
 * testable without a report in hand.
 *
 * @returns {{ok:true, candidate:object}|{ok:false, reason:string, detail?:string}}
 */
export function checkCandidateShape(raw) {
  if (!isObj(raw)) return { ok: false, reason: 'not_an_object' }

  for (const key of Object.keys(raw)) {
    // An unknown key is refused rather than dropped. See the module note:
    // a reviewer returning fields nobody designed has drifted from the
    // question, and silently accepting the rest hides that it did.
    if (!CANDIDATE_KEYS.includes(key)) return { ok: false, reason: 'unknown_key', detail: key }
  }

  const rule = str(raw.semantic_rule)
  if (!SEMANTIC_RULES.includes(rule)) return { ok: false, reason: 'unknown_semantic_rule', detail: rule }
  const spec = RULE_SPEC[rule]

  const severity = str(raw.severity)
  // Named separately from the general unknown-severity case, because this one
  // is the product rule rather than a typo, and a diagnostic that says so is
  // worth more than one that says "invalid enum".
  if (severity === 'blocking') return { ok: false, reason: 'blocking_severity' }
  if (!SEMANTIC_SEVERITIES.includes(severity)) return { ok: false, reason: 'unknown_severity', detail: severity }

  const issueType = str(raw.issue_type)
  if (!SEMANTIC_ISSUE_TYPES.includes(issueType)) return { ok: false, reason: 'unknown_issue_type', detail: issueType }
  // The RULE decides the type. A disagreement is a rejection, never a repair.
  if (issueType !== spec.issue_type) return { ok: false, reason: 'issue_type_not_the_rule_s', detail: `${rule}/${issueType}` }

  const primary = checkLocator(raw.primary, LOCATOR_KEYS)
  if (!primary.ok) return primary

  const explanation = str(raw.explanation)
  if (!explanation) return { ok: false, reason: 'missing_explanation' }
  if (explanation.length > MAX_EXPLANATION_CHARS) return { ok: false, reason: 'explanation_too_long' }

  const rawComparison = raw.comparison
  if (rawComparison == null) return { ok: false, reason: 'missing_comparison' }
  if (!isObj(rawComparison)) return { ok: false, reason: 'missing_comparison' }
  for (const k of Object.keys(rawComparison)) {
    if (!COMPARISON_KEYS.includes(k)) return { ok: false, reason: 'unknown_key', detail: k }
  }

  let comparison
  if (spec.comparison === 'quote') {
    // A contradiction has two sides and both are the report's own words.
    if (str(rawComparison.evidence_id)) return { ok: false, reason: 'wrong_comparison_kind', detail: 'evidence_id' }
    const second = checkLocator(rawComparison, LOCATOR_KEYS)
    if (!second.ok) return { ok: false, reason: second.reason === 'missing_primary' ? 'missing_comparison' : second.reason, detail: second.detail }
    comparison = { kind: 'quote', section_id: second.value.section_id, quote: second.value.quote }
  } else {
    // The other rules compare prose against something structured, which the
    // reviewer must name by an id the package gave it.
    if (str(rawComparison.quote)) return { ok: false, reason: 'wrong_comparison_kind', detail: 'quote' }
    const evidenceId = str(rawComparison.evidence_id)
    if (!evidenceId) return { ok: false, reason: 'missing_comparison' }
    comparison = { kind: spec.comparison, evidence_id: evidenceId }
  }

  return {
    ok: true,
    candidate: {
      semantic_rule: rule,
      issue_type: issueType,
      severity,
      primary: primary.value,
      comparison,
      explanation,
    },
  }
}

/**
 * Shape-check a whole response.
 *
 * Accepts the parsed `{ issues: [...] }` envelope, or a bare array, because a
 * provider that returns the array alone has still answered the question. It
 * does NOT accept a string: parsing the provider's output is the caller's
 * problem, and doing it here would hide a malformed response as an empty one.
 *
 * @returns {{candidates: object[], rejected: Array<{reason:string, detail?:string, index:number}>}}
 */
export function checkCandidates(raw) {
  const list = Array.isArray(raw) ? raw : (isObj(raw) ? raw.issues : null)
  if (!Array.isArray(list)) return { candidates: [], rejected: [{ reason: 'not_an_object', index: -1 }] }
  if (list.length > MAX_CANDIDATES) return { candidates: [], rejected: [{ reason: 'too_many_candidates', index: -1 }] }

  const candidates = []
  const rejected = []
  list.forEach((raw2, index) => {
    const checked = checkCandidateShape(raw2)
    if (checked.ok) candidates.push(checked.candidate)
    else rejected.push({ reason: checked.reason, detail: checked.detail, index })
  })
  return { candidates, rejected }
}
