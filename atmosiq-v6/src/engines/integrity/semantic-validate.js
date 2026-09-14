/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * The trust boundary: an untrusted candidate becomes a finding, or it does
 * not.
 *
 * Everything before this module produces a proposal. Nothing after it
 * receives one. The question this file answers is the only one that matters
 * for the whole semantic layer:
 *
 *     Can a candidate response be turned into a trusted finding without
 *     trusting any of its references?
 *
 * The answer is yes exactly when every reference it makes is resolved against
 * the closed package rather than believed. A quote must be found in the
 * report's own prose. An identifier must be one the package handed out. A
 * standards judgment must rest on an approved statement AtmosFlow supplied.
 * Anything unresolved is discarded, and a discarded candidate is a diagnostic
 * rather than a report defect — the assessor is never shown a criticism the
 * platform could not check.
 *
 * ── Resolution is exact, and refusing to guess is the feature ──────────
 * No fuzzy matching, no normalization beyond what the collector already did,
 * no embedding, no "find what the model probably meant". A quote resolves
 * when it is a substring of the section's canonical text and does not resolve
 * otherwise. Punctuation is not repaired, wording is not corrected, and a
 * near miss is a miss.
 *
 * This costs recall and that is the correct trade. A model that paraphrased
 * instead of quoting has told us something useful — it was not reading
 * closely — and admitting the paraphrase would put a quotation mark around
 * words the report does not contain, in front of an assessor who will
 * reasonably believe them.
 *
 * ── An ambiguous quote is refused, not located ─────────────────────────
 * A quote appearing twice in its section cannot be pinned to one place
 * without a choice, and this layer does not make choices about where a
 * criticism lands. It is refused. The cost is a lost finding on a repeated
 * sentence; the alternative is a finding that points at the wrong paragraph
 * and reads exactly like one that points at the right one.
 *
 * ── The reviewer's own prose is scanned ────────────────────────────────
 * A layer that checks a document for over-claiming may not over-claim in the
 * checking. Explanations go through the report's own banned-language scanner
 * and a failing candidate is DISCARDED, never sanitized: rewriting a model's
 * assertion into something acceptable would publish a criticism nobody made.
 *
 * ── It never suppresses the deterministic layer ────────────────────────
 * Deduplication runs one way. A semantic candidate covering ground a
 * deterministic finding already holds is dropped; the deterministic finding
 * always stays. And the dedup is structural — issue type, section, resolved
 * evidence — because asking the model whether it duplicated the layer it
 * cannot see would be trusting it about the one thing it has no way to know.
 */

import {
  integrityFinding, INTEGRITY_SEVERITIES,
} from './finding.js'
import { checkCandidates, RULE_SPEC, SEMANTIC_SCHEMA_VERSION } from './semantic-schema.js'
import { packageEvidenceIndex, packageSectionIndex } from './semantic-package.js'
import { scanProseForBannedLanguage } from '../../engine/report/cih-validation'
import { fnv1aHex } from '../../utils/forensicEvents.js'

/** Bumped when a resolution rule changes. Recorded on every finding. */
export const SEMANTIC_VALIDATOR_VERSION = 1

/** Stable detector name. Part of every id this module mints. */
export const DETECTOR = 'semantic_report_review'

/** The layer these speak for, shared with the deterministic report rules. */
export const SOURCE_LAYER = 'report_package'

/**
 * Why a candidate did not become a finding.
 *
 * Every one of these is a DIAGNOSTIC. None of them may reach the assessor as
 * a defect in the report: "the reviewer quoted something that is not in your
 * report" is a fact about the reviewer.
 */
export const REJECTIONS = Object.freeze([
  // Shape, from `semantic-schema.js`. Carried through unchanged.
  'schema',
  // The section named is not one the package offered.
  'unknown_section',
  // The quote is not in that section's text, character for character.
  'quote_not_found',
  // The quote is in the section more than once and cannot be pinned.
  'quote_ambiguous',
  // The quote is in the report, but not in the section the reviewer named.
  'quote_in_wrong_section',
  // An identifier the package never handed out.
  'unknown_evidence_id',
  // An identifier of the wrong kind for the rule that cited it.
  'wrong_evidence_kind',
  // A standards judgment with no approved reference context behind it.
  'reference_context_unavailable',
  // The reviewer's own explanation would not pass the report's language gate.
  'banned_language',
  // The deterministic layer already holds this ground.
  'duplicate_of_deterministic',
  // Two candidates resolved to the same finding.
  'duplicate_candidate',
])

const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const str = (v) => (typeof v === 'string' ? v.trim() : '')

/** How a quote is fingerprinted for identity. Content, never position. */
export const quoteFingerprint = (text) => fnv1aHex(String(text))

/** Which evidence kinds each rule's comparison may name. */
export const RULE_EVIDENCE_KINDS = Object.freeze({
  evidence_overstatement: Object.freeze(['finding', 'zone', 'instrument', 'limitation']),
  finding_recommendation_conflict: Object.freeze(['recommendation', 'finding']),
  unsupported_interpretation: Object.freeze(['finding', 'zone', 'limitation', 'reference']),
  reference_claim_mismatch: Object.freeze(['reference_context']),
})

/**
 * Resolve one quote against the package's own prose.
 *
 * Four ways to fail, each named, because the diagnostic is what tells a
 * fabricated quote apart from a mis-sectioned one — and those say different
 * things about what went wrong upstream.
 */
export function resolveQuote(locator, sections) {
  const section_id = str(obj(locator).section_id)
  const quote = str(obj(locator).quote)
  const section = sections.get(section_id)
  if (!section) return { ok: false, reason: 'unknown_section', detail: section_id }

  const text = str(section.text)
  const first = text.indexOf(quote)
  if (first < 0) {
    // Is it anywhere in the report at all? A quote in the wrong section is a
    // reviewer that lost track of where it was reading; a quote in no section
    // is a reviewer that made it up. Worth telling apart.
    for (const [otherId, other] of sections) {
      if (otherId !== section_id && str(other.text).includes(quote)) {
        return { ok: false, reason: 'quote_in_wrong_section', detail: `${quote.slice(0, 40)} is in ${otherId}` }
      }
    }
    return { ok: false, reason: 'quote_not_found', detail: quote.slice(0, 60) }
  }
  // Ambiguity is refused rather than resolved to the first occurrence.
  if (text.indexOf(quote, first + 1) >= 0) {
    return { ok: false, reason: 'quote_ambiguous', detail: quote.slice(0, 60) }
  }
  return { ok: true, section_id, quote, offset: first }
}

/** Resolve one identifier against the ids the package actually handed out. */
export function resolveEvidence(evidenceId, rule, index) {
  const id = str(evidenceId)
  const hit = index.get(id)
  if (!hit) return { ok: false, reason: 'unknown_evidence_id', detail: id }
  const allowed = RULE_EVIDENCE_KINDS[rule] || []
  if (!allowed.includes(hit.kind)) {
    return { ok: false, reason: 'wrong_evidence_kind', detail: `${id} is a ${hit.kind}` }
  }
  return { ok: true, id, kind: hit.kind, item: hit.item }
}

/**
 * The section a deterministic finding is about, for deduplication.
 *
 * The deterministic layer anchors to a section NAME ("Executive summary");
 * semantic review anchors to a section ID. They are matched through the
 * package's own section list rather than through a lookup table, so a
 * renamed section cannot silently stop two layers recognizing each other.
 */
function deterministicSectionIds(finding, sections) {
  const section = str(obj(obj(finding).anchor).section)
  if (!section) return []
  const out = []
  for (const [id, s] of sections) {
    const name = str(obj(s).section_name)
    if (name && (name === section || name.toLowerCase().includes(section.toLowerCase()) || section.toLowerCase().includes(name.toLowerCase()))) {
      out.push(id)
    }
  }
  return out
}

/**
 * Does the deterministic layer already hold this ground?
 *
 * Structural and one-directional. Two issues match when they are the same
 * KIND of problem in the same PLACE — which is deliberately a little loose,
 * because the cost of dropping a semantic duplicate is a finding the reader
 * already has, and the cost of keeping one is the same defect stated twice
 * in the same list by two authorities.
 *
 * When it cannot tell, it keeps the semantic candidate. The deterministic
 * finding is never the one dropped, under any circumstance.
 */
export function duplicatesDeterministic(candidate, resolvedPrimary, deterministic, sections) {
  for (const d of arr(deterministic)) {
    if (str(obj(d).issue_type) !== candidate.issue_type) continue
    const ids = deterministicSectionIds(d, sections)
    if (ids.includes(resolvedPrimary.section_id)) return true
  }
  return false
}

/** Every string a candidate would put in front of an assessor. */
function reviewerProse(candidate) {
  return [candidate.explanation].filter(Boolean)
}

/** A short, neutral headline. The reviewer never supplies one. */
const TITLES = Object.freeze({
  cross_section_contradiction: 'Two sections may not agree',
  evidence_overstatement: 'A statement may go beyond the evidence',
  finding_recommendation_conflict: 'An action may not match its finding',
  unsupported_interpretation: 'An interpretation the record may not carry',
  reference_claim_mismatch: 'A claim may exceed the reference it cites',
})

/** Why each rule's class of problem is worth a reviewer's attention. */
const WHY = Object.freeze({
  cross_section_contradiction: 'Two parts of the report appear to state different things about the same subject. A reader who notices cannot tell which to rely on.',
  evidence_overstatement: 'A sentence appears to express more certainty than the record behind it carries. What the report states and what it can support should be the same.',
  finding_recommendation_conflict: 'An action and the finding it answers appear to describe different conditions, so the report may name something without saying what to do about it.',
  unsupported_interpretation: 'An interpretation appears to introduce a claim the assessment record does not carry.',
  reference_claim_mismatch: 'A claim appears to go beyond what the cited reference supports, on this platform’s own approved statement of that reference.',
})

/**
 * Build one finding from a fully resolved candidate.
 *
 * Identity is the RULE plus WHAT IT POINTS AT, and nothing about the run. The
 * same unchanged report reviewed twice produces the same ids, whichever model
 * answered, in whatever order, at whatever time — the property that lets a
 * consumer follow one issue rather than watch rows appear and vanish.
 *
 * The report fingerprint is deliberately NOT in identity. It rides in
 * provenance, where it answers "is this still current"; putting it in the id
 * would mint a new id for an untouched contradiction every time an unrelated
 * paragraph elsewhere changed.
 */
function buildFinding(candidate, resolved, pkg, opts) {
  const rule = candidate.semantic_rule
  const primary = resolved.primary
  const comparison = resolved.comparison
  const subjectParts = [
    rule,
    primary.section_id,
    quoteFingerprint(primary.quote),
    comparison.kind === 'quote' ? comparison.section_id : comparison.kind,
    comparison.kind === 'quote' ? quoteFingerprint(comparison.quote) : comparison.id,
  ]
  return integrityFinding({
    detector: DETECTOR,
    issue_type: candidate.issue_type,
    severity: candidate.severity,
    source_layer: SOURCE_LAYER,
    actionability: 'before_signoff',
    anchor: {
      section: obj(pkg.sectionName)[primary.section_id] || primary.section_id,
      rule,
      kind: 'section',
      ref: primary.section_id,
    },
    title: TITLES[rule] || 'Semantic review',
    // The reviewer's explanation, verbatim and already scanned. It is the one
    // place its words reach a reader, and it reaches them unedited or not at
    // all.
    description: candidate.explanation,
    why_it_matters: WHY[rule] || '',
    identity: {
      issue_type: candidate.issue_type,
      zone_ids: [],
      subject: subjectParts.join('::'),
    },
    review: {
      package_version: pkg.package_version ?? null,
      report_fingerprint: pkg.report_fingerprint ?? null,
      prompt_version: str(opts.promptVersion) || null,
      validator_version: SEMANTIC_VALIDATOR_VERSION,
      provider: str(opts.provider) || null,
      model: str(opts.model) || null,
    },
    generated_at: str(opts.generatedAt) || null,
  })
}

/**
 * Turn a candidate response into findings, trusting none of its references.
 *
 * Pure and synchronous. Never throws: a malformed response is an empty result
 * with reasons, because the report workflow continues whatever the reviewer
 * did.
 *
 * @param {object} input
 * @param {*} input.response the parsed provider response, or anything at all
 * @param {object} input.pkg `buildSemanticPackage` output — the SAME package
 *   the reviewer was given, or resolution is meaningless
 * @param {Array} [input.deterministic] `detectReportConsistency` output, for
 *   one-directional deduplication
 * @param {object} [input.meta] `{ provider, model, promptVersion, generatedAt }`
 * @returns {{findings: object[], rejected: Array<{reason:string, detail?:string}>}}
 */
export function validateSemanticResponse(input = {}) {
  const pkg = obj(input.pkg)
  const meta = obj(input.meta)
  const rejected = []
  if (!arr(pkg.sections).length) {
    return { findings: [], rejected: [{ reason: 'unknown_section', detail: 'no package' }] }
  }

  const sections = packageSectionIndex(pkg)
  const evidence = packageEvidenceIndex(pkg)
  const sectionName = {}
  for (const [id, s] of sections) sectionName[id] = str(obj(s).section_name) || id

  const { candidates, rejected: shapeRejects } = checkCandidates(input.response)
  shapeRejects.forEach((r) => rejected.push({ reason: 'schema', detail: r.detail ? `${r.reason}:${r.detail}` : r.reason }))

  const findings = []
  const seen = new Set()

  for (const candidate of candidates) {
    const spec = RULE_SPEC[candidate.semantic_rule]

    // 1. The report's own words, or nothing.
    const primary = resolveQuote(candidate.primary, sections)
    if (!primary.ok) { rejected.push({ reason: primary.reason, detail: primary.detail }); continue }

    // 2. The other half, resolved the way the rule requires.
    let comparison
    if (spec.comparison === 'quote') {
      const second = resolveQuote(candidate.comparison, sections)
      if (!second.ok) { rejected.push({ reason: second.reason, detail: second.detail }); continue }
      comparison = { kind: 'quote', section_id: second.section_id, quote: second.quote }
    } else if (spec.comparison === 'reference') {
      // A standards judgment with no approved statement behind it is refused
      // outright, BEFORE the id is even looked up. Absence of reference
      // context proves nothing about a citation, so the honest answer to a
      // question AtmosFlow cannot ground is no finding at all.
      if (!arr(pkg.reference_context).length) {
        rejected.push({ reason: 'reference_context_unavailable', detail: candidate.comparison.evidence_id })
        continue
      }
      const ref = resolveEvidence(candidate.comparison.evidence_id, candidate.semantic_rule, evidence)
      if (!ref.ok) { rejected.push({ reason: ref.reason, detail: ref.detail }); continue }
      comparison = { kind: 'reference_context', id: ref.id, item: ref.item }
    } else {
      const hit = resolveEvidence(candidate.comparison.evidence_id, candidate.semantic_rule, evidence)
      if (!hit.ok) { rejected.push({ reason: hit.reason, detail: hit.detail }); continue }
      comparison = { kind: hit.kind, id: hit.id, item: hit.item }
    }

    // 3. The reviewer's own prose, held to the report's standard. Discarded
    //    rather than sanitized — see the module note.
    const hits = reviewerProse(candidate).flatMap((s) => {
      try { return scanProseForBannedLanguage(s) } catch { return [] }
    })
    if (hits.length) {
      rejected.push({ reason: 'banned_language', detail: str(obj(hits[0]).term) || str(obj(hits[0]).category) || 'flagged' })
      continue
    }

    // 4. The deterministic layer keeps its ground.
    if (duplicatesDeterministic(candidate, primary, pkg.deterministic_findings, sections)) {
      rejected.push({ reason: 'duplicate_of_deterministic', detail: primary.section_id })
      continue
    }

    const finding = buildFinding(candidate, { primary, comparison }, { ...pkg, sectionName }, meta)
    if (seen.has(finding.id)) { rejected.push({ reason: 'duplicate_candidate', detail: finding.id }); continue }
    seen.add(finding.id)
    findings.push(finding)
  }

  // No blocking severity can exist by here, but the layer asserts it rather
  // than assuming the schema held: this is the last point before an assessor
  // sees anything, and the product rule is permanent.
  const safe = findings.filter((f) => INTEGRITY_SEVERITIES.includes(f.severity) && f.severity !== 'blocking')
  return { findings: safe, rejected }
}

export const __test = {
  SEMANTIC_SCHEMA_VERSION, deterministicSectionIds, reviewerProse, TITLES, WHY,
}
