/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * The closed evidence package — what an AI writer is allowed to work from.
 *
 * AtmosFlow's deterministic engine decides what was measured, which criterion
 * applied, whether the comparison can be settled from a walkthrough, how
 * severe the condition is, and which actions are eligible. An AI pass may
 * improve how that is COMMUNICATED. It may not decide any of it.
 *
 * The distinction only holds if the model is handed a closed universe. Until
 * now it was handed `standardsManifest: { bibliography: STANDARDS_MANIFEST,
 * referenceValues: STD }` — every threshold in the product — under an
 * instruction to cite only from it. That instruction is satisfiable by citing
 * the WHO annual PM2.5 guideline in a report that never evaluated it. The
 * engine already knows which criteria fired, because every criterion-backed
 * finding carries its `cid`; the package carries those and nothing else.
 *
 * WHAT THIS IS A PROJECTION OF
 *   `assembleRenderModel(data)` — the deterministic report itself — plus the
 *   engine outputs it was built from, for the structured criterion fields the
 *   model drops on its way to the page (`cid`, `criterionClass`, `averaging`,
 *   `determinative`). Nothing is re-derived. A package that re-computed a
 *   value could disagree with the report it describes, which is the exact
 *   class of defect `modelConsistency.js` exists to catch; a projection
 *   cannot.
 *
 * WHAT IT CARRIES
 *   facts                   identity and provenance — immutable
 *   measurements            every printed reading, with the criterion that
 *                           judged it (or null, which is itself a constraint)
 *   observations            what was seen and said, carrying no verdict
 *   findings                the engine's conclusions, verbatim
 *   references              only the standards this report actually cites
 *   allowed_interpretations what MAY be asserted, per subject
 *   prohibited_claims       what may NOT be, per subject, with the reason
 *   required_limitations    what MUST appear, with the tokens that prove it
 *   recommendation_options  the only actions eligible to be written
 *   sections                which sections a writer may author
 *   immutable_values        the flat index the audit checks figures against
 *
 * The three constraint arrays are DERIVED, never authored here. An averaging
 * period that no walkthrough can settle produces the limitation and the
 * prohibition together, off the same `determinative` flag the engine already
 * computed. Writing them by hand would be a second opinion beside the
 * registry, which is how this codebase got a comfort band nobody could trace.
 *
 * Pair with `./narrativeAudit.js`, which checks generated prose against the
 * package and reports what it cannot support.
 */

import { REPORT_PARAMETERS, REPORT_RESULT_COLUMNS } from './reportModel'

/** Bumped when the package's shape changes in a way a consumer would notice. */
export const PACKAGE_VERSION = 1

/** Rows in `results` that are derived, not measured at a location. */
const SITE_MEAN = 'Site mean'
const OUTDOOR = 'Outdoor reference'

/** Sections an AI pass may author. Everything else is rendered, not written. */
export const WRITABLE_SECTIONS = Object.freeze([
  'executive_summary',
  'discussion',
  'conceptual_site_model',
  'recommendations_prose',
  'parameter_background',
])

/**
 * Sections that are deterministic output. A writer receives them as read-only
 * context; nothing it returns is allowed to replace them.
 */
export const IMMUTABLE_SECTIONS = Object.freeze([
  'measurement_results',
  'findings_table',
  'qa_qc',
  'instrument_records',
  'references',
  'limitations',
  'action_register',
  'floor_plans',
  'photographs',
])

const str = (v) => (v === null || v === undefined ? '' : String(v))
const nonEmpty = (v) => str(v).trim() !== ''
const num = (v) => (Number.isFinite(Number(v)) && str(v).trim() !== '' ? Number(v) : null)

/** A stable id for a thing the audit and the writer both need to name. */
const slug = (s) => str(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'x'

/**
 * Every engine finding, flattened, with the structured criterion fields the
 * report model drops. Keyed by zone + verbatim text, which is an exact join:
 * `collectFindings` copies `text: r.t` with no transformation, so a row that
 * fails to join means some layer reworded a finding on its way to the page.
 */
function engineFindingIndex(zoneScores = []) {
  const byKey = new Map()
  for (const zs of zoneScores || []) {
    const zone = (zs && zs.zoneName) || 'Zone'
    for (const cat of ((zs && zs.cats) || [])) {
      for (const r of ((cat && cat.r) || [])) {
        if (!r) continue
        byKey.set(`${zone} ${str(r.t)}`, {
          zone,
          category: (cat && cat.l) || null,
          parameter: r.p || null,
          criterion_id: r.cid || null,
          criterion_class: r.criterionClass || null,
          averaging: r.averaging || null,
          determinative: typeof r.determinative === 'boolean' ? r.determinative : null,
          evidence_basis: r.evidenceBasis || null,
          data_gap: !!r.dataGap,
          band: Array.isArray(r.band) ? r.band.slice() : null,
          band_unit: r.bandUnit || null,
          band_label: r.bandLabel || null,
          severity: r.sev || null,
          standard: r.std || null,
        })
      }
    }
  }
  return byKey
}

/** Engine findings for one zone and parameter, worst kept first. */
function findingsForParameter(index, zone, engineParam) {
  if (!engineParam) return []
  const out = []
  for (const v of index.values()) {
    if (v.zone === zone && v.parameter === engineParam) out.push(v)
  }
  return out
}

// ── Facts ──────────────────────────────────────────────────────────────
//
// Identity and provenance, taken off the cover block the report already
// prints. Every one is immutable: a writer that changes a facility name, an
// assessment date or a report ID has changed the record, not the prose.

function buildFacts(model) {
  const meta = (model && model.meta) || {}
  const rows = Array.isArray(meta.coverRows) ? meta.coverRows : []
  const facts = rows
    .filter(r => Array.isArray(r) && nonEmpty(r[0]) && nonEmpty(r[1]) && str(r[1]).trim() !== '—')
    .map(r => ({ id: `fact-${slug(r[0])}`, label: str(r[0]), value: str(r[1]) }))
  if (nonEmpty(meta.firm)) facts.push({ id: 'fact-firm', label: 'Prepared by', value: str(meta.firm) })
  if (nonEmpty(meta.reportProfile)) facts.push({ id: 'fact-report-profile', label: 'Report profile', value: str(meta.reportProfile) })
  if (nonEmpty(meta.reportStatus)) facts.push({ id: 'fact-report-status', label: 'Report status', value: str(meta.reportStatus) })
  return facts
}

// ── Measurements ───────────────────────────────────────────────────────
//
// Every reading the results table prints, with the criterion that judged it.
//
// `criterion: null` means no FINDING attached to THIS reading — nothing here
// names a specific standard it satisfies. It does NOT by itself mean the
// parameter was never evaluated: `evaluateCriteria` only returns a hit on an
// EXCEEDANCE, so an in-band reading (temperature inside the ASHRAE 55
// envelope) is genuinely compared and found clean, and also carries
// `criterion: null`. `evaluated` is what tells the two apart — see
// `buildInterpretations`'s `unjudged` set below, which is the thing that
// actually decides whether a PARAMETER may be compared to anything at all.

function buildMeasurements(model, index) {
  const rows = (model && model.results && model.results.rows) || []
  const out = []
  for (const row of rows) {
    const zone = str(row && row.id)
    if (!zone) continue
    const kind = zone === SITE_MEAN ? 'site_mean' : zone === OUTDOOR ? 'outdoor_reference' : 'zone'
    for (const [column, paramKey] of Object.entries(REPORT_RESULT_COLUMNS)) {
      const value = num(row[column])
      if (value === null) continue
      const p = REPORT_PARAMETERS.find(x => x.key === paramKey)
      if (!p) continue
      const engineParam = kind === 'zone' ? (paramKey === 'relativeHumidity' ? 'rh' : paramKey === 'tvoc' ? null : paramKey) : null
      const hits = findingsForParameter(index, zone, engineParam)
      const hit = hits.find(h => h.criterion_id) || hits[0] || null
      out.push({
        id: `meas-${slug(zone)}-${paramKey}`,
        kind,
        zone: kind === 'zone' ? zone : null,
        parameter: paramKey,
        label: p.label,
        value,
        unit: p.unit,
        // The criterion that actually judged this reading, or null.
        criterion: hit && hit.criterion_id
          ? {
            id: hit.criterion_id,
            standard: hit.standard,
            class: hit.criterion_class,
            averaging: hit.averaging,
            band: hit.band,
            band_label: hit.band_label,
          }
          : null,
        // Whether a reading of this kind can SETTLE the comparison. Null when
        // no criterion applied — there is nothing to settle.
        determinative: hit ? hit.determinative : null,
        evaluated: kind === 'zone' && engineParam !== null && !hits.some(h => h.data_gap),
      })
    }
  }
  return out
}

// ── Observations ───────────────────────────────────────────────────────

function buildObservationList(model) {
  const obs = (model && model.observations) || null
  if (!obs) return []
  const out = []
  for (const [label, value] of (obs.building || [])) {
    out.push({ id: `obs-building-${slug(label)}`, scope: 'building', zone: null, text: `${str(label)}: ${str(value)}` })
  }
  for (const block of (obs.zones || [])) {
    const zone = str(block && block.zone)
    for (const [i, line] of (block.observed || []).entries()) {
      out.push({ id: `obs-${slug(zone)}-${i}`, scope: 'zone', zone, text: str(line) })
    }
    for (const [i, line] of (block.occupantReports || []).entries()) {
      out.push({ id: `obs-${slug(zone)}-occ-${i}`, scope: 'occupant_report', zone, text: str(line) })
    }
    if (nonEmpty(block.notes)) {
      out.push({ id: `obs-${slug(zone)}-note`, scope: 'assessor_note', zone, text: str(block.notes) })
    }
  }
  return out
}

// ── Findings ───────────────────────────────────────────────────────────

function buildFindings(model, index) {
  const rows = (model && model.findings && model.findings.rows) || []
  return rows.map((r, i) => {
    const zone = str(r.z)
    const text = str(r.f)
    const e = index.get(`${zone} ${text}`) || null
    return {
      id: `find-${slug(zone)}-${i}`,
      zone,
      // Verbatim off the engine. The writer paraphrases this for the reader;
      // the package keeps the original so the audit can tell a paraphrase
      // from a different claim.
      text,
      severity: str(r.sev),
      basis: str(r.basis),
      standard: r.std || null,
      category: e ? e.category : null,
      parameter: e ? e.parameter : null,
      criterion_id: e ? e.criterion_id : null,
      criterion_class: e ? e.criterion_class : null,
      averaging: e ? e.averaging : null,
      determinative: e ? e.determinative : null,
      // The permitted interpretation, as one token. The same fact
      // `allowed_interpretations` states in a sentence, carried here so the
      // wire form can drop the sentence: a six-zone assessment repeated it
      // forty times and blew the endpoint's payload cap.
      may_assert: !e || !e.criterion_id ? 'observation' : e.determinative === true ? 'exceedance' : 'indication',
      // True when the finding row could not be matched back to an engine
      // finding — some layer reworded it. Surfaced rather than hidden.
      unjoined: !e,
    }
  })
}

/** What each `may_assert` token licenses. Sent once, not per finding. */
export const MAY_ASSERT_LEGEND = Object.freeze({
  exceedance: 'The reading may be stated as exceeding the named criterion.',
  indication: 'The reading may be stated as an indication only; a short-duration reading cannot settle this averaging period, and no compliance outcome may be stated.',
  observation: 'The condition may be described as observed during the assessment; it rests on an observation, not on a measurement compared to a criterion.',
})

// ── References ─────────────────────────────────────────────────────────

function buildReferences(model) {
  const refs = (model && model.references) || []
  return refs
    .filter(r => Array.isArray(r) && nonEmpty(r[0]))
    .map(r => ({ id: `ref-${slug(r[0])}`, name: str(r[0]), basis: str(r[1]), usage: str(r[2]), number: r[3] ?? null }))
}

// ── Permitted and prohibited interpretation ────────────────────────────
//
// Derived from what the engine already decided, never authored here.
//
// `determinative` is the registry's own answer to "can a reading of this kind
// settle this comparison?" — `AVERAGING[x].determinativeFrom` in
// constants/criteria.js. A criterion it cannot settle produces two things at
// once: permission to report the exceedance as indicative, and a prohibition
// on stating it as a compliance outcome. They come from one flag because they
// are one fact.

const CLAUSE = {
  determinative: 'may be stated as exceeding the named criterion',
  indicative: 'may be stated as an indication only; the reading cannot settle this averaging period',
  reported_only: 'may be reported as a measured value; no comparison to any criterion may be drawn',
}

function buildInterpretations(findings, measurements, chains) {
  const allowed = []
  const prohibited = []

  for (const f of findings) {
    if (!f.criterion_id) {
      allowed.push({
        id: `allow-${f.id}`,
        subject: f.id,
        subject_kind: 'finding',
        statement: 'The condition may be described as observed during the assessment. It rests on an observation, not on a measurement compared to a criterion.',
      })
      continue
    }
    const clause = f.determinative === true ? CLAUSE.determinative : CLAUSE.indicative
    allowed.push({
      id: `allow-${f.id}`,
      subject: f.id,
      subject_kind: 'finding',
      statement: `Against ${f.standard || 'the applied criterion'}, this reading ${clause}.`,
    })
    if (f.determinative === false) {
      prohibited.push({
        id: `prohibit-${f.id}-determinative`,
        subject: f.id,
        subject_kind: 'finding',
        parameter: f.parameter,
        claim: 'compliance_determination',
        why: `The criterion is ${f.averaging || 'an averaged'} and a short-duration reading cannot settle it. State the exceedance as indicative.`,
      })
    }
  }

  // A measured parameter the engine judged nothing about may be reported and
  // not compared. This is the "reporting a value is not clearing it" rule,
  // made specific to the parameters it applies to on THIS assessment.
  //
  // `!m.criterion` alone is NOT the test: an in-band temperature reading
  // carries no criterion either, because `evaluateCriteria` only returns a
  // hit on an EXCEEDANCE — a clean reading is genuinely compared and found
  // acceptable, which is a different thing from a parameter no criterion
  // ever applies to (TVOC, always). `evaluated` is the engine's own record of
  // which is which (buildMeasurements, above); a parameter counts as
  // unjudged only when NO zone's reading for it was ever evaluated.
  const everEvaluated = new Set()
  const zoneMeasured = new Set()
  for (const m of measurements) {
    if (m.kind !== 'zone') continue
    zoneMeasured.add(m.parameter)
    if (m.criterion || m.evaluated) everEvaluated.add(m.parameter)
  }
  const unjudged = new Set([...zoneMeasured].filter(p => !everEvaluated.has(p)))
  for (const parameter of unjudged) {
    const p = REPORT_PARAMETERS.find(x => x.key === parameter)
    allowed.push({
      id: `allow-param-${parameter}`,
      subject: parameter,
      subject_kind: 'parameter',
      statement: `${p ? p.label : parameter} ${CLAUSE.reported_only}.`,
    })
    prohibited.push({
      id: `prohibit-param-${parameter}`,
      subject: parameter,
      subject_kind: 'parameter',
      parameter,
      claim: 'criterion_comparison',
      why: 'No criterion was applied to this parameter in this assessment. It may not be described as meeting, satisfying, falling within, or exceeding any standard.',
    })
  }

  // TVOC is never compared to anything, on any assessment. It is a standing
  // product decision (CLAUDE.md; tests/engine/no-molhave.test.ts), carried
  // into the package so the audit enforces it per-report rather than relying
  // on the writer having read the prompt.
  if (measurements.some(m => m.parameter === 'tvoc')) {
    prohibited.push({
      id: 'prohibit-param-tvoc',
      subject: 'tvoc',
      subject_kind: 'parameter',
      parameter: 'tvoc',
      claim: 'criterion_comparison',
      why: 'AtmosFlow applies no TVOC threshold, tier or band. A TVOC reading is measured, charted and reported, never described as above, below, within or exceeding anything.',
    })
  }

  // A hypothesis chain is labeled one in its own type string, and the engine
  // makes Strong unreachable for it (weighChain). The package says so, so the
  // writer cannot promote it and the audit can tell if prose did.
  for (const [i, c] of (chains || []).entries()) {
    if (!c || !nonEmpty(c.type)) continue
    const hypothesis = /\(Hypothesis\)/i.test(str(c.type))
    const id = `chain-${i}-${slug(c.type)}`
    allowed.push({
      id: `allow-${id}`,
      subject: id,
      subject_kind: 'pathway',
      statement: `${str(c.type).replace(/\s*\(Hypothesis\)\s*$/, '')} in ${str(c.zone) || 'the assessed area'} may be described as a candidate explanation at ${str(c.confidence || 'Possible').toLowerCase()} confidence.`,
      // The same facts as fields, so the wire form can carry a row instead of
      // parsing the sentence back.
      pathway: {
        type: str(c.type).replace(/\s*\(Hypothesis\)\s*$/, ''),
        zone: str(c.zone) || null,
        confidence: str(c.confidence || 'Possible'),
        hypothesis,
      },
    })
    prohibited.push({
      id: `prohibit-${id}-causation`,
      subject: id,
      subject_kind: 'pathway',
      claim: 'causation',
      why: hypothesis
        ? 'This pathway is a hypothesis. It may not be stated as the cause, and its confidence may not be raised above what the engine assigned.'
        : `This pathway was weighed at ${str(c.confidence || 'Possible')} confidence. It may not be stated as the established cause.`,
    })
  }

  return { allowed, prohibited }
}

// ── Required limitations ───────────────────────────────────────────────
//
// What the NARRATIVE must carry — not everything the report's Limitations
// section prints. The distinction is the whole design of this block.
//
// A narrative is 600–900 words about what was found. Demanding that it
// restate every scope limitation the report lists ("No photographs are
// included", "No destructive investigation was performed") would require
// eight disclaimers in a summary written for a building owner, and the first
// person to see the audit fire on all eight would switch it off. The report
// states those; they travel in `report_limitations` as context so the writer
// knows the edges of the work, and are not required in the prose.
//
// What IS required is the limitation that bears on a claim the narrative
// itself makes. Each entry carries:
//   `when`         tokens that make it applicable — null means always. A
//                  narrative that never mentions TVOC needs no TVOC caveat.
//   `must_mention` alternative token sets, any one of which proves the
//                  disclosure survived. Tokens, not sentences: the writer is
//                  expected to reword, and the audit checks the disclosure is
//                  still there, not that the words are unchanged.

function buildRequiredLimitations(model, findings, measurements) {
  const out = []
  const push = (id, text, when, mustMention) => out.push({ id, text, when, must_mention: mustMention })

  // The statutory floor, on every report, whatever the prose says.
  push('lim-not-a-determination',
    'Not a regulatory exposure determination, OSHA compliance certification, or medical evaluation.',
    null,
    [['not a regulatory'], ['not a compliance'], ['no regulatory', 'determination'], ['not a medical']])

  push('lim-assessment-date',
    'Reflects conditions on the assessment date only.',
    null,
    [['conditions on the assessment date'], ['on the day'], ['during the assessment'], ['at the time of the assessment']])

  // A criterion the reading cannot settle was applied, so the narrative
  // reports an exceedance it must qualify. Required whenever such a finding
  // exists, because the prompt requires every condition to be covered.
  const nonDeterminative = findings.some(f => f.determinative === false && f.averaging)
  if (nonDeterminative) {
    push('lim-averaging-period',
      'Short-duration readings are indicative for criteria expressed as an average over a longer period; they do not establish compliance with that period.',
      null,
      [['short-duration'], ['short duration'], ['not determinative'], ['do not represent time-weighted'], ['cannot establish']])
  }

  // A parameter the engine declined to judge must be disclosed as such —
  // but only where the narrative brings it up.
  const notEvaluated = (model.findingsAtGlance || []).filter(g => g && g.outcome === 'not_evaluated')
  for (const g of notEvaluated) {
    const first = str(g.parameter).split(/[\s(]/)[0].toLowerCase()
    if (!first) continue
    push(`lim-not-evaluated-${slug(first)}`,
      `${str(g.parameter)} was recorded but not evaluated against a criterion.`,
      [first],
      [[first, 'not evaluated'], [first, 'no applicable'], [first, 'not judged'], [first, 'no criterion'], [first, 'no threshold']])
  }

  if (measurements.some(m => m.parameter === 'tvoc')) {
    push('lim-tvoc',
      'TVOC is a non-specific sum of organic species with no applicable health-based threshold; it is reported, not judged.',
      ['tvoc', 'volatile organic'],
      [['tvoc', 'no applicable'], ['tvoc', 'not judged'], ['volatile organic', 'no applicable'], ['tvoc', 'no threshold'], ['tvoc', 'not evaluated']])
  }

  // Ventilation adequacy inferred from CO₂ alone. Kept from the report's
  // scope limitations — unlike the others — because the narrative is where
  // the inference actually gets made, and "the space is under-ventilated" off
  // an indicator with no measured rate behind it is the overreach this
  // discloses.
  const ventInferred = (model.limitations || []).some(l => /^No quantified ventilation-rate measurement/i.test(str(l)))
  if (ventInferred) {
    push('lim-ventilation-inferred',
      'No quantified ventilation-rate measurement was made; ventilation adequacy is inferred from CO₂ as an indicator only.',
      ['ventilation', 'fresh air', 'outdoor air'],
      [['indicator'], ['was not measured'], ['no measurement of'], ['not measured directly'], ['inferred']])
  }

  return out
}

// ── Recommendation options ─────────────────────────────────────────────

function buildRecommendationOptions(model) {
  const register = (model && model.recommendations && model.recommendations.register) || []
  return register.map((r, i) => ({
    id: `rec-${i}-${slug(r.action)}`,
    priority: str(r.priority),
    timeframe: str(r.timeframe),
    action: str(r.action),
    location: str(r.location),
    control: str(r.control),
    owner: str(r.owner),
    evidence: str(r.evidence),
  }))
}

// ── The immutable index ────────────────────────────────────────────────
//
// Every figure the narrative is allowed to state, as (value, unit) pairs, plus
// the threshold figures the applied criteria carry. The audit uses this to
// decide whether a number in the prose came from the assessment or from the
// model. A bare count with no unit is not in here and is not checked — "three
// areas" is arithmetic over the package, not a measurement claim.

function buildImmutableValues(measurements, findings) {
  const seen = new Set()
  const out = []
  const add = (value, unit, source) => {
    const v = num(value)
    if (v === null) return
    const u = str(unit).trim()
    const key = `${v} ${u}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ value: v, unit: u, source })
  }
  for (const m of measurements) add(m.value, m.unit, m.id)
  for (const f of findings) {
    // Threshold and band figures quoted inside the engine's own finding
    // sentence. They are in the report already; the narrative may repeat them.
    for (const match of str(f.text).matchAll(/(-?\d+(?:\.\d+)?)\s*(ppm|µg\/m³|ug\/m3|°F|°C|%|cfm|ACH|ft²|sq ft)/gi)) {
      add(match[1], match[2], f.id)
    }
  }
  return out
}

/**
 * A stable 32-bit FNV-1a hash of the package's claim-bearing content.
 *
 * Used to detect when text generated for one version of an assessment has
 * gone stale against a later edit — a zone added, a reading changed, a
 * finding that now reads differently — before that text is ever placed in a
 * client deliverable (`src/report/aiSections.js`).
 *
 * Not a security primitive — it needs only to change with overwhelming
 * probability when the evidence changes, which 32 bits comfortably gives it
 * for this purpose; a false "still fresh" would show slightly stale wording,
 * not a wrong number, since `narrativeAudit.js` still checks every figure
 * against the current package before anything renders.
 *
 * `version`, `sections` and `immutable_values` are excluded: the first two
 * describe the package's own shape, not the assessment, and the third is a
 * derived index over fields already included.
 */
/**
 * `JSON.stringify`'s array-form replacer filters keys at EVERY nesting
 * level, not just the top — a well-known trap. With no key here also
 * appearing as a nested field name, that would have stringified every
 * nested object as `{}`. This sorts keys at each level instead, recursively,
 * so the same content always serializes to the same string.
 */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function fingerprintPackage(pkg) {
  if (!pkg) return null
  const { version, sections, immutable_values, ...evidence } = pkg
  const s = stableStringify(evidence)
  let hash = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Build the closed evidence package.
 *
 * @param {object} model   output of `assembleRenderModel(data)`
 * @param {object} [engine]
 * @param {Array}  [engine.zoneScores]    engine zone results, for criterion fields
 * @param {Array}  [engine.causalChains]  weighed pathways, for permitted confidence
 * @returns {object} the package — a plain, serializable, frozen-at-top object
 */
/**
 * Standard names this product recognizes when they appear in prose.
 *
 * Lives here rather than in `narrativeAudit.js` because two things need the
 * same list and a second copy is how two layers start disagreeing: the audit
 * matches them to catch an invented citation, and `buildContextStandards`
 * matches them to find the ones the report ALREADY states.
 */
export const STANDARD_TOKENS = Object.freeze([
  'ashrae 62.1', 'ashrae 55', 'ashrae 241', 'ashrae',
  'osha', 'niosh', 'acgih', 'naaqs', 'iicrc s520', 'iicrc',
  'well v2', 'well building', 'atsdr', 'who', 'epa',
])

/**
 * Standards the report's OWN deterministic text names for scale.
 *
 * `references` carries only the criteria that actually FIRED — what Appendix B
 * lists. But the report says more than that: `REFERENCE_FRAMEWORK` names
 * ASHRAE 62.1, ASHRAE 55, the EPA NAAQS and the OSHA PELs on every report, and
 * the per-parameter background prose quotes the NAAQS figure "for scale only
 * … cited here for context rather than as a pass/fail threshold". Those
 * standards ARE in the document.
 *
 * Without this, the audit read a writer naming one of them as inventing a
 * citation, and discarded the section — for doing exactly what the
 * deterministic prose beside it already does. That is the writer and the
 * document disagreeing, not the writer over-reaching.
 *
 * Derived by reading the model's own rendered text, never hand-listed: if the
 * deterministic prose stops naming a standard, it stops being context here,
 * with nothing to keep in step.
 */
function buildContextStandards(model, references) {
  const cited = (references || []).map(r => str(r.name).toLowerCase())
  const methodology = (model && model.methodology) || {}
  const parameters = (model && model.results && model.results.parameters) || []
  const corpus = [
    str(methodology.referenceFramework),
    ...(methodology.bullets || []).map(str),
    ...parameters.flatMap(p => [...(p && p.body || []).map(str), str(p && p.blurb)]),
  ].join(' ').toLowerCase()

  return STANDARD_TOKENS.filter((token) => {
    if (!corpus.includes(token)) return false
    // Already an applied criterion — it belongs to `references`, not here.
    return !cited.some(name => name.includes(token))
  })
}

export function buildEvidencePackage(model = {}, engine = {}) {
  const index = engineFindingIndex(engine.zoneScores || [])
  const chains = (engine.causalChains || []).filter(Boolean)

  const facts = buildFacts(model)
  const measurements = buildMeasurements(model, index)
  const observations = buildObservationList(model)
  const findings = buildFindings(model, index)
  const references = buildReferences(model)
  const { allowed, prohibited } = buildInterpretations(findings, measurements, chains)
  const required_limitations = buildRequiredLimitations(model, findings, measurements)
  const recommendation_options = buildRecommendationOptions(model)
  const immutable_values = buildImmutableValues(measurements, findings)

  const meta = (model && model.meta) || {}
  const reportIdRow = (meta.coverRows || []).find(r => Array.isArray(r) && str(r[0]) === 'Report ID')

  return {
    version: PACKAGE_VERSION,
    report_id: reportIdRow ? str(reportIdRow[1]) : null,
    facts,
    measurements,
    observations,
    findings,
    references,
    // Standards the report itself names for scale, which are NOT applied
    // criteria. Naming one the way the report does is not an invented
    // citation; presenting one as a pass/fail still is. See
    // `buildContextStandards`.
    context_standards: buildContextStandards(model, references),
    allowed_interpretations: allowed,
    prohibited_claims: prohibited,
    required_limitations,
    // The report's own Limitations section, verbatim, as READ-ONLY context.
    // The writer needs to know what was not done — no logger, no destructive
    // investigation, no personal sampling — to avoid writing as though the
    // work was broader than it was. It is not a checklist the narrative must
    // restate; see `buildRequiredLimitations`.
    report_limitations: (model.limitations || []).map(str).filter(nonEmpty),
    recommendation_options,
    sections: {
      writable: WRITABLE_SECTIONS.slice(),
      immutable: IMMUTABLE_SECTIONS.slice(),
    },
    immutable_values,
  }
}

/**
 * The two caveat sentences `buildStatement` (constants/criteria.js) appends to
 * a finding whose reading cannot settle its averaging period. Matched
 * literally, because they are constants there and nowhere else.
 */
const EVIDENTIARY_CAVEATS = [
  ' A short-duration reading is indicative but not determinative for this averaging period.',
  ' A short-duration reading cannot establish compliance with this averaging period.',
]
const stripEvidentiaryCaveat = (text) => EVIDENTIARY_CAVEATS.reduce((t, c) => t.split(c).join(''), str(text))

/**
 * The endpoint refuses a body above this (`MAX_PAYLOAD_CHARS` in
 * api/narrative.js). Kept in step by `tests/engine/evidence-package.test.ts`;
 * the wire form is budgeted against it here so a large assessment degrades
 * by dropping context rather than by failing with a 413.
 */
export const WIRE_BUDGET_CHARS = 60_000

/**
 * The package as the writer sees it.
 *
 * Three things differ from the audit's copy, all for the same reason: what
 * goes over the wire is paid for per token and capped per request, and the
 * first two-zone measurement of the full package came to 44 KB against an
 * 8 KB payload before it — with a six-zone assessment on course to exceed
 * the endpoint's cap and fail outright.
 *
 *   • Per-finding permission travels as the one-word `may_assert` on the
 *     finding plus a legend sent once, not as a sentence per finding in
 *     `allowed_interpretations` and a second per finding in
 *     `prohibited_claims`. Those arrays keep only their parameter and
 *     pathway entries, which are few and not derivable from a finding.
 *   • `immutable_values` is a flat index built FOR the audit; handing it to
 *     the writer adds a list of bare numbers to the prompt and invites the
 *     model to work from it instead of from the measurements they came from.
 *     `unjoined` is a diagnostic about this codebase's layering.
 *   • If the result still exceeds the budget, context is shed in a fixed
 *     order — assessor notes first, then the report's scope limitations,
 *     then the remaining observations — and the drop is recorded on the
 *     package so the prompt can say what it was not shown. Evidence for a
 *     CLAIM (facts, measurements, findings, references, the three constraint
 *     lists, the action register) is never shed: a narrative written without
 *     it would be wrong, not merely thinner.
 */
export function packageForWriter(pkg, opts = {}) {
  if (!pkg) return null
  const budget = Number.isFinite(opts.budgetChars) ? opts.budgetChars : WIRE_BUDGET_CHARS
  const { immutable_values, ...rest } = pkg
  // Every applied criterion once, keyed by id. Eight zones judged against the
  // same PM2.5 criterion repeated its source, class, averaging period and
  // band eight times; a measurement now carries the id and the writer looks
  // it up here.
  const criteria = {}
  for (const m of (rest.measurements || [])) {
    if (m.criterion && m.criterion.id && !criteria[m.criterion.id]) {
      const { id, ...c } = m.criterion
      criteria[id] = c
    }
  }
  // Parameter label and unit once, keyed by the parameter key each
  // measurement carries, instead of on every one of ninety rows.
  const parameters = {}
  for (const m of (rest.measurements || [])) {
    if (!parameters[m.parameter]) parameters[m.parameter] = { label: m.label, unit: m.unit }
  }
  // Pathways once each, as a row, with one rule for all of them. The audit's
  // copy keeps a permission sentence and a prohibition sentence per pathway;
  // over eight zones that was half a kilobyte of boilerplate per chain.
  const pathways = (rest.allowed_interpretations || [])
    .filter(a => a.subject_kind === 'pathway' && a.pathway)
    .map(a => ({ id: a.subject, ...a.pathway }))
  const wire = {
    ...rest,
    criteria,
    parameters,
    measurements: (rest.measurements || []).map(m => ({
      kind: m.kind, zone: m.zone, parameter: m.parameter, value: m.value,
      criterion: m.criterion ? m.criterion.id : null, determinative: m.determinative, evaluated: m.evaluated,
    })),
    // The finding as the writer needs it. `text` loses the evidentiary caveat
    // sentence the engine appends — it is exactly what `may_assert` encodes,
    // and the audit's copy keeps the sentence verbatim. Structured fields
    // that only the audit and the layering diagnostic read are dropped.
    findings: (rest.findings || []).map(f => ({
      zone: f.zone, text: stripEvidentiaryCaveat(f.text), severity: f.severity,
      standard: f.standard, parameter: f.parameter, averaging: f.averaging, may_assert: f.may_assert,
    })),
    may_assert_legend: { ...MAY_ASSERT_LEGEND },
    context_standards_rule: 'These standards are named by the report itself, for scale, and no finding here was evaluated against any of them. You may name one the same way the report does — as context for what a number means — and you must never present one as a threshold this assessment met, cleared or exceeded. A standard that is on neither this list nor in `references` is not in this report at all.',
    pathways,
    pathway_rule: 'A pathway may be described as a candidate explanation at exactly the confidence stated, never as the cause. A hypothesis may not be promoted; Strong was unreachable for it by construction.',
    // Whole-parameter rules only. Finding rules are the `may_assert` token;
    // pathway rules are the row above.
    allowed_interpretations: (rest.allowed_interpretations || []).filter(a => a.subject_kind === 'parameter'),
    prohibited_claims: (rest.prohibited_claims || []).filter(p => p.subject_kind === 'parameter'),
    context_omitted: [],
  }
  const size = () => JSON.stringify(wire).length
  const shed = [
    ['assessor notes', () => { wire.observations = wire.observations.filter(o => o.scope !== 'assessor_note') }],
    ['report scope limitations', () => { wire.report_limitations = [] }],
    ['walkthrough observations', () => { wire.observations = [] }],
  ]
  for (const [label, drop] of shed) {
    if (size() <= budget) break
    drop()
    wire.context_omitted.push(label)
  }
  return wire
}
