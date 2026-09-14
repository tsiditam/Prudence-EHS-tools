/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Report consistency — does the assembled report faithfully represent the
 * investigation record?
 *
 * One list, in the shared integrity contract, for a question three modules
 * already answered separately and in three vocabularies. It is the
 * `report_package` source layer the contract declared in Phase 1 and left
 * unbuilt.
 *
 * ── It composes; it does not re-decide ─────────────────────────────────
 * `checkRenderModel` still owns every one of its twenty rules and is run by
 * the CALLER, not here: this module receives its output and projects it.
 * That is deliberate and it is the same relationship `zone-gaps.js` has with
 * `sufficiency.js`. A module that re-ran those rules would be a second
 * opinion about the report, and the Report tab and the test suite would
 * eventually disagree about one document.
 *
 * What this module adds on its own is three rules the render model can
 * answer and nothing asked it: whether a severe finding has an action in its
 * room, whether stored content the assessor worked on will reach the export,
 * and whether a photograph belongs to a zone that still exists.
 *
 * ── Nothing here blocks, and nothing here is stored ────────────────────
 * Severity is clamped to advisory or warning. `blocking` is what
 * `validation.js` means by a finalization blocker, and a second source of
 * that word would change what "Ready" means. `resolution_status` stays
 * derived: fix the record and the finding stops deriving. There is no
 * waiver, no acceptance and no persisted disposition in this phase —
 * persisting one would make the fingerprint and staleness semantics
 * load-bearing before the detector has settled.
 *
 * ── The wording rule this layer inherits ───────────────────────────────
 * Every sentence emitted here is read by an assessor about a DOCUMENT, and
 * it may not itself do what it is checking the document for. No finding
 * states a cause, a compliance position, a health outcome or a risk level.
 * `report-consistency.test.ts` runs the report's own banned-language scanner
 * over every string this module can produce.
 */

import {
  integrityFinding, integrityIdentity, INTEGRITY_SEVERITIES,
} from './finding.js'
import { fnv1aHex } from '../../utils/forensicEvents.js'
import { parsePhotoKey } from '../../utils/photoIndex.js'

/** Stable detector name. Part of every id this module mints. */
export const DETECTOR = 'report_consistency'

/** The layer this finding speaks for, from the contract's own vocabulary. */
export const SOURCE_LAYER = 'report_package'

/**
 * Severity, clamped.
 *
 * The contract's ladder carries `blocking` so the `preReviewValidator`
 * projection stays lossless, and the legacy validator really did mark a
 * missing photograph reference blocking. It is clamped here rather than
 * dropped from the ladder: the projection stays honest about what the old
 * vocabulary said, and this phase still emits nothing that could gate
 * finalization. Pinned by test.
 */
export const clampSeverity = (sev) => (sev === 'blocking' ? 'warning' : (INTEGRITY_SEVERITIES.includes(sev) ? sev : 'advisory'))

/**
 * Why each class of problem matters, once per issue type rather than once
 * per rule.
 *
 * Twenty projected rules would otherwise need twenty sentences saying the
 * same four things, and a rule added to `modelConsistency.js` tomorrow would
 * arrive with none. The rule's own message says WHAT disagrees; this says
 * why a reader should care that anything does.
 */
export const WHY_IT_MATTERS = Object.freeze({
  contradiction: 'Two parts of the report state different things about the same subject. A reader who notices cannot tell which part to rely on, and a reviewer has to resolve it before the report can be relied on at all.',
  unsupported_conclusion: 'The report states something the rest of the record does not carry. A reviewer checking the statement would not find what it rests on.',
  missing_context: 'Something the surrounding material depends on is absent from the report, so a reader cannot tell how to read what is there.',
  coverage_mismatch: 'A finding and the actions proposed for it do not line up, so the report names something without saying what to do about it.',
  stale_content: 'Content stored for this report was written against an earlier version of the record. What is stored and what will be issued are not the same text.',
  orphaned_evidence: 'The report points at evidence that resolves to nothing, or carries evidence nothing points at. Either way a reader following the reference arrives nowhere.',
  redundancy: 'The report states the same thing more than once in the same place, which reads as two separate observations.',
  check_failed: 'A consistency check could not be completed, so this part of the report has not been checked. Absence of a finding here is not evidence of agreement.',
})

/**
 * Every `modelConsistency` rule, in this contract's vocabulary.
 *
 * `report-consistency.test.ts` asserts this table covers `RULE_IDS` exactly,
 * so a rule added there without an entry here fails the build rather than
 * arriving with a default nobody chose.
 *
 * `section` is omitted where the rule's own `where` is already the section
 * heading; it is read off the issue at projection time. It appears here only
 * for `rule-error`, whose `where` is a function name rather than a place in
 * the document.
 */
export const RENDER_RULE_MAP = Object.freeze({
  'site-mean-rank': { issue_type: 'contradiction', severity: 'warning', kind: 'section' },
  'summary-scope': { issue_type: 'contradiction', severity: 'warning', kind: 'section' },
  'summary-finding-orphan': { issue_type: 'contradiction', severity: 'warning', kind: 'finding' },
  'citation-missing': { issue_type: 'unsupported_conclusion', severity: 'warning', kind: 'finding' },
  'citation-number': { issue_type: 'unsupported_conclusion', severity: 'warning', kind: 'finding' },
  'reference-orphan': { issue_type: 'orphaned_evidence', severity: 'advisory', kind: 'reference' },
  'register-location': { issue_type: 'coverage_mismatch', severity: 'advisory', kind: 'recommendation' },
  'register-owner': { issue_type: 'coverage_mismatch', severity: 'advisory', kind: 'recommendation' },
  'register-evidence': { issue_type: 'coverage_mismatch', severity: 'advisory', kind: 'recommendation' },
  'register-action': { issue_type: 'coverage_mismatch', severity: 'warning', kind: 'recommendation' },
  'register-timeframe': { issue_type: 'contradiction', severity: 'warning', kind: 'recommendation' },
  'qa-tvoc': { issue_type: 'missing_context', severity: 'warning', kind: 'section' },
  'qa-tvoc-limitation': { issue_type: 'missing_context', severity: 'warning', kind: 'section' },
  'qa-hcho-limitation': { issue_type: 'missing_context', severity: 'warning', kind: 'section' },
  'observation-verdict': { issue_type: 'unsupported_conclusion', severity: 'warning', kind: 'section' },
  'limitation-photos': { issue_type: 'contradiction', severity: 'warning', kind: 'section' },
  'limitation-logger': { issue_type: 'contradiction', severity: 'warning', kind: 'section' },
  'gap-undisclosed': { issue_type: 'missing_context', severity: 'warning', kind: 'section' },
  'floorplan-pin': { issue_type: 'orphaned_evidence', severity: 'warning', kind: 'zone' },
  'conclusion-vs-site-model': { issue_type: 'contradiction', severity: 'warning', kind: 'section' },
})

/**
 * The one rule `modelConsistency` can emit that is not in its own `RULE_IDS`:
 * a rule that threw. Mapped separately because it is not a statement about
 * the report at all, it is the absence of one.
 */
export const RULE_ERROR_MAP = Object.freeze({
  issue_type: 'check_failed', severity: 'advisory', kind: 'check', section: 'Consistency checks',
})

/** A short headline per issue type, for a surface that shows one. */
const TITLES = Object.freeze({
  contradiction: 'Two sections of the report disagree',
  unsupported_conclusion: 'A statement the record does not carry',
  missing_context: 'Context the report does not state',
  coverage_mismatch: 'A finding and its actions do not line up',
  stale_content: 'Stored content written for an earlier version',
  orphaned_evidence: 'A reference that resolves to nothing',
  redundancy: 'The same statement appears twice',
  check_failed: 'A consistency check did not complete',
})

const isNum = (v) => v != null && Number.isFinite(v)
const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const str = (v) => (typeof v === 'string' ? v.trim() : '')

/**
 * The discriminator that separates two findings from one rule.
 *
 * `modelConsistency` issues carry `{ id, where, message }` and nothing
 * structural, so the message is the only thing distinguishing "Action 1 has
 * no owner" from "Action 2 has no owner". It is hashed rather than carried
 * whole, the way `patternId` hashes its member set, so an id stays a short
 * token. Two identical messages from one rule ARE the same statement and
 * collapse to one finding, which is the behavior worth having.
 *
 * Re-wording a rule's message therefore mints a new id. That is acceptable
 * only while resolution is derived and nothing is stored against an id, which
 * is exactly this phase's constraint; a phase that persists a disposition
 * needs a structural reference on the issue first.
 */
const discriminator = (text) => fnv1aHex(str(text))

/** Build one report-package finding. */
function reportFinding({
  rule, issue_type, severity, section, kind, ref, subject,
  description, zoneIds = [], title, generatedAt, fingerprint = null,
}) {
  return integrityFinding({
    detector: DETECTOR,
    issue_type,
    severity: clampSeverity(severity),
    source_layer: SOURCE_LAYER,
    // Every one of these is resolvable at review, before the report is
    // issued, and none of them is resolvable in the building: the subject is
    // an assembled document that does not exist during the walkthrough.
    actionability: 'before_signoff',
    zone_ids: zoneIds,
    anchor: { section, rule, kind, ref },
    title: title || TITLES[issue_type] || 'Report consistency',
    description,
    why_it_matters: WHY_IT_MATTERS[issue_type] || '',
    // The rule and what it said, never the run. `evidence_ids` stays empty
    // for this layer: the report package mints no evidence identifiers to
    // resolve against, and the anchor is what makes the finding checkable.
    identity: { issue_type, zone_ids: zoneIds, subject: subject || `${rule}::${discriminator(description)}` },
    inputs_fingerprint: fingerprint,
    generated_at: generatedAt || null,
  })
}

// ── 1. The twenty existing rules, projected ───────────────────────────────

/**
 * Project `checkRenderModel` output into the shared contract.
 *
 * Shape only. Every rule keeps its own logic, its own message and its own
 * `where`; this decides what KIND of problem each one is and how loudly to
 * say it. An unmapped rule id is projected as a contradiction rather than
 * dropped, for the reason `gapLabel` shows an unmapped kind: a new rule
 * should appear looking unfinished, not vanish.
 */
export function projectRenderConsistency(issues, opts = {}) {
  return arr(issues).map((raw) => {
    const i = obj(raw)
    const rule = str(i.id)
    const isError = rule === 'rule-error'
    const map = isError ? RULE_ERROR_MAP : RENDER_RULE_MAP[rule]
    const spec = map || { issue_type: 'contradiction', severity: 'warning', kind: 'section' }
    return reportFinding({
      rule: rule || 'unknown',
      issue_type: spec.issue_type,
      severity: spec.severity,
      // The rule's own `where` IS the section, except for a crashed rule
      // whose `where` is the function that threw.
      section: isError ? RULE_ERROR_MAP.section : (str(i.where) || null),
      kind: spec.kind,
      ref: isError ? (str(i.where) || null) : null,
      description: str(i.message),
      generatedAt: opts.generatedAt,
    })
  })
}

// ── 2. The surviving preReviewValidator checks, ported ────────────────────
//
// Reimplemented rather than imported, because the point of the port is to
// have a replacement whose behavior can be compared against the original.
// The thresholds and the patterns are carried across unchanged so the
// comparison is about wiring rather than about tuning.

/** Stop words that inflate a Jaccard union without carrying content. */
const JACCARD_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by',
  'for', 'from', 'has', 'have', 'in', 'is', 'it', 'its',
  'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was',
  'were', 'will', 'with',
])

/** Content-word set overlap over union. Carried from `preReviewValidator`. */
export function jaccardSimilarity(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return 0
  const tokenize = (s) => new Set(
    s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/)
      .filter((w) => w && !JACCARD_STOP_WORDS.has(w)),
  )
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (!ta.size || !tb.size) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  const union = new Set([...ta, ...tb]).size
  return union ? inter / union : 0
}

export const DUPLICATE_FINDING_THRESHOLD = 0.7
/** Beyond this, a sample that reached the lab is worth a second look. */
export const LAB_HOLDING_DAYS = 60

/**
 * Framings that misuse a citation. Carried from `preReviewValidator`, whose
 * `checkCitationAntiPatterns` remains the home of the same three patterns
 * until the parity commit retires it.
 *
 * The guidance is reworded. The original detail text explained the second
 * rule using the phrase these reports may not print, which is harmless as
 * advice and wrong as a sentence this layer emits — a module that checks a
 * document for over-claiming must not over-claim in the checking.
 */
export const ANTI_PATTERNS = Object.freeze([
  {
    id: 'ashrae-62-1-as-co2-limit',
    pattern: /ashrae\s*62\.?1[^.]*?(?:co\s*2|co₂)\s*(?:contaminant|limit|exposure)/i,
    why: 'ASHRAE 62.1 prescribes a ventilation rate and sets no indoor carbon dioxide limit. Reframe the citation around ventilation rate, or around carbon dioxide as an indicator of it.',
  },
  {
    id: 'spore-count-as-health-proof',
    pattern: /(?:spore\s*count|spore\s*level)[^.]*?(?:proves|shows|demonstrates|indicates)[^.]*?(?:health|harm|illness|disease|exposure\s*risk)/i,
    why: 'A spore count is not a direct measure of what a person experiences, per IOM 2004 and ACMT 2025. State the measured indicator and the follow-up it warrants.',
  },
  {
    id: 'tvoc-cited-against-a-threshold',
    pattern: /\b(?:tvocs?|total\s+vocs?|total\s+volatile\s+organic\s+compounds?)\b[^.]{0,120}\b(?:exceed(?:s|ed|ing)?|above|below|within|meets?|complies?|limit|threshold|guideline|standard)\b/i,
    why: 'Total VOCs is a non-specific sum and this platform applies no criterion to it. Report the measured value and what it does not establish. Speciation by EPA Method TO-17 identifies the compounds that do carry criteria.',
  },
])

/** Reader-facing prose bodies the legacy checks scan: the narrative and the actions. */
function proseBodies(ctx) {
  const out = []
  const c = obj(ctx)
  if (typeof c.narrative === 'string' && c.narrative) out.push({ source: 'narrative', text: c.narrative, kind: 'narrative', section: 'Findings narrative' })
  for (const tier of ['imm', 'eng', 'adm', 'mon']) {
    arr(obj(c.recs)[tier]).forEach((r, idx) => {
      const t = typeof r === 'string' ? r : str(obj(r).text)
      if (t) out.push({ source: `recs.${tier}[${idx}]`, text: t, kind: 'recommendation', section: 'Recommended actions' })
    })
  }
  return out
}

/** How many photographs the record actually holds. */
function photoCount(photos) {
  const p = photos
  if (Array.isArray(p)) return p.length
  if (p && typeof p === 'object') return Object.keys(p).length
  return 0
}

/** The zone identifier for a scored zone, by position rather than by label. */
const zoneIdAt = (zones, i) => {
  const z = obj(arr(zones)[i])
  return str(z.zid) ? [str(z.zid)] : []
}

/** A prose reference to a photograph the record does not hold. */
export function checkPhotoReferences(ctx, opts = {}) {
  const c = obj(ctx)
  const count = photoCount(c.photos)
  const out = []
  const re = /\bphoto\s*#?\s*(\d+)\b/gi
  for (const body of proseBodies(c)) {
    re.lastIndex = 0
    let m
    const seen = new Set()
    while ((m = re.exec(body.text)) !== null) {
      const n = parseInt(m[1], 10)
      if (!Number.isFinite(n) || n < 1 || n <= count || seen.has(n)) continue
      seen.add(n)
      out.push(reportFinding({
        rule: 'photo-ref-missing',
        issue_type: 'orphaned_evidence',
        // Blocking in the legacy vocabulary. Clamped, and the clamp is the
        // phase policy rather than a judgement about this rule.
        severity: 'blocking',
        section: body.section,
        kind: 'photo',
        ref: String(n),
        subject: `photo-ref-missing::${body.source}::${n}`,
        title: `Photograph ${n} is referenced and not attached`,
        description: `${body.section} refers to "Photo ${n}", and the assessment holds ${count === 1 ? 'one photograph' : `${count} photographs`}. A reader following that reference arrives at nothing.`,
        generatedAt: opts.generatedAt,
      }))
    }
  }
  return out
}

/** Two rows in one category of one zone saying essentially the same thing. */
export function checkDuplicateFindings(ctx, opts = {}) {
  const c = obj(ctx)
  const out = []
  arr(c.zoneScores).forEach((zs, zi) => {
    const z = obj(zs)
    const zoneName = str(z.zoneName) || `Zone ${zi + 1}`
    arr(z.cats).forEach((cat) => {
      const rows = arr(obj(cat).r)
      const label = str(obj(cat).l) || 'category'
      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          const a = str(obj(rows[i]).t)
          const b = str(obj(rows[j]).t)
          if (!a || !b) continue
          if (jaccardSimilarity(a, b) < DUPLICATE_FINDING_THRESHOLD) continue
          out.push(reportFinding({
            rule: 'duplicate-finding',
            issue_type: 'redundancy',
            severity: 'advisory',
            section: 'Findings',
            kind: 'finding',
            ref: `${zoneName} · ${label}`,
            subject: `duplicate-finding::${zi}::${label}::${i}::${j}`,
            zoneIds: zoneIdAt(c.zones, zi),
            title: `Two findings read alike in ${zoneName}`,
            description: `Two ${label.toLowerCase()} findings in ${zoneName} are worded almost identically: "${a.slice(0, 90)}" and "${b.slice(0, 90)}". Printed as separate rows they read as two observations rather than one.`,
            generatedAt: opts.generatedAt,
          }))
        }
      }
    })
  })
  return out
}

/** Collection and receipt dates that cannot both be right. */
export function checkLabDates(ctx, opts = {}) {
  const rows = arr(obj(obj(ctx).labResults).rows)
  const out = []
  rows.forEach((raw, i) => {
    const row = obj(raw)
    const collected = row.collectedAt
    const received = row.receivedAt
    if (!collected || !received) return
    const tc = Date.parse(collected)
    const tr = Date.parse(received)
    if (Number.isNaN(tc) || Number.isNaN(tr)) return
    const name = str(row.sampleId) || `sample ${i + 1}`
    if (tc > tr) {
      out.push(reportFinding({
        rule: 'lab-date-inversion',
        issue_type: 'contradiction',
        severity: 'warning',
        section: 'Laboratory results',
        kind: 'labRow',
        ref: name,
        subject: `lab-date-inversion::${name}::${i}`,
        title: `Sample ${name} is recorded as received before it was collected`,
        description: `Sample ${name} carries a collection date of ${collected} and a receipt date of ${received}. The two dates are in the wrong order, so at least one of them is entered incorrectly.`,
        generatedAt: opts.generatedAt,
      }))
      return
    }
    const days = Math.round((tr - tc) / 86400000)
    if (days > LAB_HOLDING_DAYS) {
      out.push(reportFinding({
        rule: 'lab-date-holding',
        issue_type: 'missing_context',
        severity: 'advisory',
        section: 'Laboratory results',
        kind: 'labRow',
        ref: name,
        subject: `lab-date-holding::${name}::${i}`,
        title: `Sample ${name} reached the laboratory after a long interval`,
        description: `Sample ${name} took ${days} days to reach the laboratory, which is beyond the holding window most indoor air quality analyses assume. The report does not say what that means for the result.`,
        generatedAt: opts.generatedAt,
      }))
    }
  })
  return out
}

/** A citation used in a way the cited document does not support. */
export function checkCitationAntiPatterns(ctx, opts = {}) {
  const out = []
  for (const body of proseBodies(ctx)) {
    for (const ap of ANTI_PATTERNS) {
      if (!ap.pattern.test(body.text)) continue
      out.push(reportFinding({
        rule: `anti-pattern-${ap.id}`,
        issue_type: 'unsupported_conclusion',
        severity: 'advisory',
        section: body.section,
        kind: body.kind,
        ref: body.source,
        subject: `anti-pattern-${ap.id}::${body.source}`,
        title: 'A citation is used for something it does not settle',
        description: `${body.section} uses a citation in a way the cited document does not support. ${ap.why}`,
        generatedAt: opts.generatedAt,
      }))
    }
  }
  return out
}

/** Laboratory rows naming samples the field record never registered. */
export function checkSampleIdDrift(ctx, opts = {}) {
  const c = obj(ctx)
  const rows = arr(obj(c.labResults).rows)
  if (!rows.length) return []

  const registry = new Set()
  const addAll = (list) => arr(list).forEach((s) => {
    const id = typeof s === 'string' ? s : str(obj(s).id)
    if (id) registry.add(String(id).toLowerCase())
  })
  addAll(obj(c.presurvey).ps_samples)
  arr(c.zones).forEach((z) => addAll(obj(z).samples))
  // No field registry means nothing to compare against, which is not a
  // finding: most assessments never register a sample id at all.
  if (!registry.size) return []

  const unmatched = rows
    .map((r) => str(obj(r).sampleId))
    .filter((id) => id && !registry.has(id.toLowerCase()))
  if (!unmatched.length) return []

  const shown = [...new Set(unmatched)].sort()
  return [reportFinding({
    rule: 'sample-id-drift',
    issue_type: 'orphaned_evidence',
    severity: 'advisory',
    section: 'Laboratory results',
    kind: 'labRow',
    ref: shown.join(', ').slice(0, 120),
    subject: `sample-id-drift::${shown.join(',')}`,
    title: `${shown.length === 1 ? 'A laboratory sample is' : `${shown.length} laboratory samples are`} not in the field register`,
    description: `The laboratory results name ${shown.slice(0, 6).map((s) => `"${s}"`).join(', ')}${shown.length > 6 ? ` and ${shown.length - 6} more` : ''}, which the field sample register does not carry. This is ordinary where a laboratory assigns its own identifiers; the report does not say which field sample each row belongs to.`,
    generatedAt: opts.generatedAt,
  })]
}

// ── 3. Finding to recommendation coverage ─────────────────────────────────

/** Findings-table outcomes severe enough to expect an immediate action. */
export const SEVERE_OUTCOMES = Object.freeze(['priority', 'elevated'])

/** The register tier an action must sit in to answer a severe finding. */
export const IMMEDIATE_PRIORITY = 'Immediate'

/** Everywhere a register row's location column can mean "this zone". */
const ANY_ZONE = 'Building-wide'

/**
 * Does one register row's location cover this zone?
 *
 * The column is built by `actionRegister`: a zone name, a comma-joined list
 * of them, an equipment label, or `Building-wide`, any of which may carry a
 * trailing unmapped-HVAC caveat. Parsed structurally rather than by substring,
 * so a zone called "North" is not covered by an action filed against
 * "North Annex".
 */
export function locationCovers(location, zoneName) {
  const raw = str(location).replace(/\s*\(no HVAC unit mapped\)\s*$/i, '')
  if (!raw) return false
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.includes(ANY_ZONE)) return true
  return !!zoneName && parts.includes(zoneName)
}

/**
 * A severe finding whose room carries no immediate action.
 *
 * The structural replacement for `checkFindingsWithoutRecs`, which joined a
 * finding to a recommendation by counting shared five-letter words. Both
 * halves of the join are already structured by the time the report is
 * assembled — the findings table carries a zone and an outcome, the action
 * register carries a location and a priority — so the join is a lookup and
 * the token heuristic was only ever standing in for one.
 *
 * It reads the outcome the ENGINE reached, and proposes no action of its own.
 * Whether a given finding needs an action is the assessor's call; whether the
 * report contains one for the room is a fact about the document.
 */
export function checkFindingCoverage(model, opts = {}) {
  const m = obj(model)
  const rows = arr(obj(m.findings).rows)
  if (!rows.length) return []
  const register = arr(obj(m.recommendations).register)
  const immediate = register.filter((r) => str(obj(r).priority) === IMMEDIATE_PRIORITY)

  const out = []
  const seen = new Set()
  rows.forEach((raw) => {
    const row = obj(raw)
    if (!SEVERE_OUTCOMES.includes(str(row.sev))) return
    const zoneName = str(row.z)
    if (!zoneName || seen.has(zoneName)) return
    if (immediate.some((r) => locationCovers(obj(r).location, zoneName))) return
    seen.add(zoneName)
    const zones = arr(opts.zones)
    const idx = zones.findIndex((z) => str(obj(z).zn) === zoneName)
    out.push(reportFinding({
      rule: 'finding-without-immediate-action',
      issue_type: 'coverage_mismatch',
      severity: 'warning',
      section: 'Recommended actions',
      kind: 'finding',
      ref: zoneName,
      subject: `finding-without-immediate-action::${zoneName}`,
      zoneIds: idx >= 0 ? zoneIdAt(zones, idx) : [],
      title: `No immediate action is filed for ${zoneName}`,
      description: `The findings table carries a finding for ${zoneName} at the report's highest outcome band, and no action in the register is filed as ${IMMEDIATE_PRIORITY.toLowerCase()} for that location. Either an action is missing or the existing ones do not name where they apply.`,
      generatedAt: opts.generatedAt,
    }))
  })
  return out
}

// ── 4. Material stale content ─────────────────────────────────────────────

/**
 * Stored content, written for an earlier record, that the export will drop
 * along with the assessor's own work.
 *
 * MATERIAL staleness, not storage staleness, and the distinction is the whole
 * rule. When the stored sections are stale, `applyAiSections` already refuses
 * them and the document falls back to its own deterministic prose — the
 * report is correct, nothing wrong reaches a client, and saying so would be a
 * warning about a mechanism working. So a stale record of generated text
 * alone raises nothing.
 *
 * What is material is the assessor's own contribution inside that record: a
 * section they rewrote, or one they kept with a written justification. That is
 * work they did deliberately, it is still shown to them under Report sections,
 * and the export is silently not using it. The record and the deliverable
 * disagree about text a person wrote.
 */
export function checkMaterialStaleContent(model, aiSections, opts = {}) {
  if (str(obj(model).aiSectionsStatus) !== 'stale') return []
  const rec = obj(aiSections)
  const edited = Object.keys(obj(rec.edits)).filter((k) => str(obj(obj(rec.edits)[k]).text))
  const overridden = Object.keys(obj(rec.overrides)).filter((k) => str(obj(obj(rec.overrides)[k]).justification))
  const affected = [...new Set([...edited, ...overridden])].sort()
  if (!affected.length) return []

  const parts = []
  if (edited.length) parts.push(edited.length === 1 ? 'one section you rewrote' : `${edited.length} sections you rewrote`)
  if (overridden.length) parts.push(overridden.length === 1 ? 'one you kept with a written reason' : `${overridden.length} you kept with a written reason`)

  return [reportFinding({
    rule: 'stale-assessor-content',
    issue_type: 'stale_content',
    severity: 'warning',
    section: 'Report sections',
    kind: 'section',
    ref: affected.join(', '),
    subject: `stale-assessor-content::${affected.join(',')}`,
    title: 'Your edits to the report sections are not in the export',
    description: `The assessment changed after the report sections were written, so the export uses the report's own text for all of them. That includes ${parts.join(' and ')}. Regenerate the sections and reapply the change, or leave the deterministic text in place deliberately.`,
    inputs_fingerprint: str(rec.fingerprint) || null,
    generatedAt: opts.generatedAt,
  })]
}

// ── 5. Orphaned field evidence ────────────────────────────────────────────

/**
 * A photograph filed against a zone the assessment no longer has.
 *
 * Photographs are keyed `z{zoneIndex}-{fieldId}`, so deleting a zone leaves
 * every photograph taken in it addressed to an index past the end of the
 * list. `parsePhotoKey` still parses the key and the appendix still prints
 * the image, captioned "Zone 7" for a report whose last zone is 4, and it
 * spends one of the appendix's eight slots doing it.
 *
 * Deterministic, because the identifier is structural: nothing here reads a
 * caption, a label or a timestamp to decide which room a photograph belongs
 * to. An assessment with no zones at all raises nothing rather than
 * declaring every photograph orphaned — that is a draft, not a defect.
 */
export function checkOrphanedPhotos(ctx, opts = {}) {
  const c = obj(ctx)
  const zones = arr(c.zones)
  if (!zones.length) return []
  const photos = obj(c.photos)

  const counts = new Map()
  Object.keys(photos).forEach((key) => {
    const parsed = parsePhotoKey(key)
    if (!parsed || parsed.zoneIndex < zones.length) return
    const n = arr(photos[key]).filter((p) => obj(p).src || isNum(obj(p).ts) || str(obj(p).idbId)).length
    if (!n) return
    counts.set(parsed.zoneIndex, (counts.get(parsed.zoneIndex) || 0) + n)
  })
  if (!counts.size) return []

  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([zoneIndex, n]) => reportFinding({
    rule: 'photo-zone-orphan',
    issue_type: 'orphaned_evidence',
    severity: 'warning',
    section: 'Photographs',
    kind: 'photo',
    ref: `z${zoneIndex}`,
    subject: `photo-zone-orphan::${zoneIndex}`,
    title: `${n === 1 ? 'A photograph is' : `${n} photographs are`} filed against a zone that is no longer in the assessment`,
    description: `${n === 1 ? 'One photograph is' : `${n} photographs are`} recorded against zone ${zoneIndex + 1}, and the assessment now has ${zones.length === 1 ? 'one zone' : `${zones.length} zones`}. The appendix prints ${n === 1 ? 'it' : 'them'} under a zone name the rest of the report does not use.`,
    generatedAt: opts.generatedAt,
  }))
}

// ── Entry point ───────────────────────────────────────────────────────────

const OWN_RULES = [
  checkPhotoReferences,
  checkDuplicateFindings,
  checkLabDates,
  checkCitationAntiPatterns,
  checkSampleIdDrift,
  checkOrphanedPhotos,
]

/** Severity first, then the order the rules produced them. Stable. */
const SEVERITY_RANK = { blocking: 0, warning: 1, advisory: 2 }

/**
 * Every report-consistency finding for one assembled report.
 *
 * Pure and synchronous. Returns [] for anything it cannot read, so adding it
 * can never make a previously clean report show something it cannot explain.
 *
 * @param {object} input
 * @param {object} input.model       the assembled render model, AI folded in
 * @param {Array}  input.consistency `checkRenderModel(model)` output, run by
 *   the caller. This module never re-runs those rules.
 * @param {object} [input.assessment] the record the report was built from:
 *   `{ zones, zoneScores, recs, photos, presurvey, narrative, labResults }`
 * @param {object} [input.aiSections] the stored AI-section record, for
 *   material staleness only
 * @param {string} [input.generatedAt] ISO. Provenance only, never identity.
 * @returns {object[]} integrity findings, severity first
 */
export function detectReportConsistency(input = {}) {
  const opts = {
    generatedAt: input.generatedAt || null,
    zones: arr(obj(input.assessment).zones),
  }
  const out = [
    ...projectRenderConsistency(input.consistency, opts),
    ...OWN_RULES.flatMap((rule) => {
      try { return rule(input.assessment, opts) || [] } catch { return [] }
    }),
  ]
  try { out.push(...checkFindingCoverage(input.model, opts)) } catch { /* a rule that throws is not a clean report, but it is not this one's to report either */ }
  try { out.push(...checkMaterialStaleContent(input.model, input.aiSections, opts)) } catch { /* as above */ }

  // One finding per id. Two rules reaching the same statement about the same
  // place IS one statement, and showing it twice is the redundancy this layer
  // reports elsewhere.
  const seen = new Set()
  return out
    .filter((f) => (seen.has(f.id) ? false : seen.add(f.id)))
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))
}

/**
 * One finding as the Report-consistency section already renders a row.
 *
 * A PRESENTATION projection and nothing else, the same relationship
 * `zoneSheetItems` has with the Zone-complete sheet. The panel has rendered
 * `{ id, where, message }` since `checkRenderModel` was wired to it, and the
 * twenty projected rules come back through here with exactly the values they
 * had before — the rule id in `id`, the rule's own `where`, the rule's own
 * message — so the surface is unchanged for everything it showed yesterday
 * and the new rules join it in the same shape.
 */
export function asConsistencyRow(finding) {
  const f = obj(finding)
  const a = obj(f.anchor)
  return { id: str(a.rule) || f.id, where: str(a.section) || 'Report', message: str(f.description) }
}

export const __test = { discriminator, proseBodies, photoCount, SEVERITY_RANK, integrityIdentity }
