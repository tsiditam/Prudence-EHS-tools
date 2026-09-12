/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * The deterministic audit — generated prose checked against the closed
 * evidence package it was written from.
 *
 * `auditNarrative(text, pkg)` returns what the prose asserts that the package
 * does not support. It is pure, it uses no model, and it is the half of the
 * validation layer that cannot itself hallucinate. A second AI pass can judge
 * whether an argument holds together; it cannot be trusted to notice that
 * 45 became 54, and that is the failure that reaches a client.
 *
 * WHY THIS EXISTS BESIDE `api/_banned-language.js`
 *   That scanner is a fixed list of fifteen phrases plus six context rules,
 *   and it is the liability floor: `caused by`, `noncompliant`, `toxic mold`
 *   are wrong in any report, so it stays where it is, server-side, unchanged.
 *   This is the other question — not "is this phrase ever allowed?" but "does
 *   THIS assessment support THIS sentence?". "Exceeds the OSHA PEL" is a
 *   correct sentence when an 8-hour TWA was measured and a false one from a
 *   grab reading. Only the package knows which.
 *
 * SHAPE, DELIBERATELY COPIED FROM `modelConsistency.js`
 *   An array of `{ id, where, message, severity }`, empty when the prose is
 *   supported. Rule ids are exported so `tests/engine/narrative-audit.test.ts`
 *   can fail if a rule is added without a negative case — the discipline that
 *   keeps `checkRenderModel` honest.
 *
 * THE FALSE-POSITIVE LINE
 *   A number is checked only when it carries a UNIT. `45 µg/m³` is a
 *   measurement claim; `three areas` and `roughly twenty times higher` are
 *   arithmetic over the package and the prompt explicitly asks for them. A
 *   rule that flagged those would be turned off within a week, which is worse
 *   than not having it. Rounding is allowed and alteration is not: a prose
 *   figure passes when the package value rounded to the prose's own precision
 *   equals it.
 */

/** Every rule this module can emit. Pinned by the test. */
export const AUDIT_RULE_IDS = Object.freeze([
  'figure-unsupported',
  'criterion-unattested',
  'interpretation-exceeded',
  'criterion-comparison-unsupported',
  'causation-asserted',
  'limitation-missing',
  'finding-contradicted',
  'recommendation-unsupported',
  'rule-error',
])

const str = (v) => (v === null || v === undefined ? '' : String(v))

// ── Units ──────────────────────────────────────────────────────────────
//
// Symbol and spelled-out forms map to one canonical unit, because the prompt
// asks for "micrograms per cubic meter (µg/m³)" on first use and the
// abbreviation afterwards. Both are the same claim.

const UNIT_FORMS = [
  ['ppm', ['ppm', 'parts per million']],
  // Both spellings of the unit. The product writes American English, but this
  // list matches MODEL OUTPUT, and a spelling the list does not know is a
  // figure that goes unchecked rather than one that is flagged.
  ['µg/m³', ['µg/m³', 'µg/m3', 'ug/m³', 'ug/m3', 'micrograms per cubic meter', 'micrograms per cubic metre', 'mcg/m3']], // spelling-ok
  ['°F', ['°f', 'degrees fahrenheit', 'deg f']],
  ['°C', ['°c', 'degrees celsius']],
  ['%', ['%', 'percent']],
  ['cfm', ['cfm', 'cubic feet per minute']],
  ['ACH', ['ach', 'air changes per hour']],
  ['ft²', ['ft²', 'sq ft', 'square feet']],
]

const canonicalUnit = (raw) => {
  const v = str(raw).trim().toLowerCase()
  for (const [canon, forms] of UNIT_FORMS) {
    if (forms.includes(v)) return canon
  }
  return null
}

/** Alternation of every unit spelling, longest first so "ppm" cannot win over a longer form. */
const UNIT_ALT = UNIT_FORMS
  .flatMap(([, forms]) => forms)
  .sort((a, b) => b.length - a.length)
  .map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

const FIGURE_RE = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s*(${UNIT_ALT})(?![a-z])`, 'gi')

const parseValue = (raw) => {
  const n = Number(str(raw).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Decimal places the writer chose to state. A rounded figure is still true. */
const precisionOf = (raw) => {
  const m = str(raw).match(/\.(\d+)$/)
  return m ? m[1].length : 0
}

const roundTo = (v, d) => Number(Math.round(Number(`${v}e${d}`)) + `e-${d}`)

// ── Parameters ─────────────────────────────────────────────────────────
//
// How a reader-facing narrative names each parameter. The engine's key never
// appears in prose; these are what the prompt asks the writer to use.

const PARAM_ALIASES = {
  co2: ['carbon dioxide', 'co₂', 'co2'],
  co: ['carbon monoxide', 'co'],
  temperature: ['temperature', 'thermal comfort'],
  relativeHumidity: ['relative humidity', 'humidity'],
  pm25: ['pm2.5', 'pm₂.₅', 'fine particulate', 'fine particles', 'particulate matter', 'particulates'],
  tvoc: ['tvoc', 'total vocs', 'volatile organic compound', 'volatile organic'],
}

/** `CO` must not match inside `CO2` / `CO₂`. */
const aliasRegex = (alias) => {
  const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9₂.])`, 'gi')
}

/** Character windows around every mention of a parameter, for proximity tests. */
function mentionWindows(text, parameter, before = 140, after = 200) {
  const out = []
  for (const alias of (PARAM_ALIASES[parameter] || [])) {
    const re = aliasRegex(alias)
    let m
    while ((m = re.exec(text)) !== null) {
      out.push(text.slice(Math.max(0, m.index - before), m.index + alias.length + after))
    }
  }
  return out
}

// ── Claim vocabularies ─────────────────────────────────────────────────

/** Asserts a SETTLED comparison outcome. */
const DETERMINATIVE_RE = /\b(exceed(?:s|ed|ing)?|in compliance|complies|compliant|non-?compliant|meets? the|satisfies|violat(?:es|ion)|above the (?:osha|niosh|who|epa|ashrae|acgih)\b|in excess of)\b/i

/** Asserts ANY comparison against a criterion. Superset of the above. */
const COMPARISON_RE = /\b(exceed(?:s|ed|ing)?|above the|below the|within the|outside the|meets? the|satisfies|complies|compliant|non-?compliant|against the (?:limit|threshold|standard|guideline)|the (?:limit|threshold|guideline|standard) (?:of|for)|action level)\b/i

/** Asserts cause. */
const CAUSATION_RE = /\b(caused by|is causing|are causing|causes? the|due to|responsible for|resulted from|result(?:s|ed)? in|led to|because of|attributable to|stems? from)\b/i

/** Asserts the parameter raised nothing. */
const ACCEPTABLE_RE = /\b(did not identify|no (?:notable|additional notable|significant) (?:condition|concern)|within (?:the )?(?:acceptable|normal|expected)|acceptable range|raised no|no concern|unremarkable)\b/i

/**
 * Interventions a narrative can name. Controlled, because the check is "did
 * the writer introduce a control the engine never recommended?" and an
 * open-ended similarity match on rewritten prose is not decidable.
 */
const INTERVENTIONS = [
  'hepa', 'ultraviolet', 'uv-c', 'ozone', 'bipolar ionization', 'needlepoint ionization',
  'photocatalytic', 'dehumidifier', 'humidifier', 'air scrubber', 'negative air machine',
  'encapsulant', 'biocide', 'antimicrobial', 'fogging',
  'to-17', 'to-15', 'summa canister', 'sampling pump', 'spore trap', 'tape lift',
  'thermal desorption', 'duct cleaning', 'remediation', 'abatement', 'air sampling',
]

/** Standards a narrative can cite. Matched only when used AS a criterion. */
const STANDARD_TOKENS = [
  'ashrae 62.1', 'ashrae 55', 'ashrae 241', 'ashrae',
  'osha', 'niosh', 'acgih', 'naaqs', 'iicrc s520', 'iicrc',
  'well v2', 'well building', 'atsdr', 'who', 'epa',
]

const has = (re, s) => re.test(s)

// ── Rules ──────────────────────────────────────────────────────────────

/**
 * Every figure with a unit must come from the package. Rounding is allowed;
 * a different number is not.
 */
function figuresAreSupported(text, pkg) {
  const out = []
  const values = pkg.immutable_values || []
  for (const m of text.matchAll(FIGURE_RE)) {
    const value = parseValue(m[1])
    const unit = canonicalUnit(m[2])
    if (value === null || !unit) continue
    const d = precisionOf(m[1].replace(/,/g, ''))
    const supported = values.some(v => canonicalUnit(v.unit) === unit && roundTo(v.value, d) === value)
    if (!supported) {
      out.push({
        id: 'figure-unsupported',
        where: `${m[1]} ${m[2]}`,
        severity: 'blocking',
        message: `The narrative states ${m[1]} ${m[2]}, which is not a measured value or an applied threshold in this assessment. Measurement values, units and thresholds are read-only.`,
      })
    }
  }
  return out
}

/**
 * A standard named as a criterion must be one this report cites. A standard
 * named inside a disclaimer ("not an OSHA compliance certification") is not a
 * citation, so the token is only checked when it sits beside a comparison or
 * a figure.
 */
function citedStandardsAreInThePackage(text, pkg) {
  const out = []
  const names = (pkg.references || []).map(r => str(r.name).toLowerCase())
  const seen = new Set()
  const lower = text.toLowerCase()
  for (const token of STANDARD_TOKENS) {
    const re = aliasRegex(token)
    let m
    while ((m = re.exec(lower)) !== null) {
      const window = text.slice(Math.max(0, m.index - 70), m.index + token.length + 70)
      const usedAsCriterion = has(COMPARISON_RE, window) || FIGURE_RE.test(window)
      FIGURE_RE.lastIndex = 0
      if (!usedAsCriterion) continue
      if (names.some(n => n.includes(token))) continue
      // A longer token already reported covers this one ("ashrae" under
      // "ashrae 62.1") — report the most specific name only.
      if ([...seen].some(s => s.includes(token))) continue
      seen.add(token)
      out.push({
        id: 'criterion-unattested',
        where: token,
        severity: 'blocking',
        message: `The narrative uses ${token.toUpperCase()} as a comparison criterion, but no finding in this assessment was evaluated against it. Cite only the references the package carries.`,
      })
    }
  }
  return out
}

/**
 * A criterion the reading cannot settle may not be stated as a settled
 * outcome. The package says which, per finding, off the engine's own
 * `determinative` flag.
 */
function interpretationStaysWithinEvidence(text, pkg) {
  const out = []
  const seen = new Set()
  for (const p of (pkg.prohibited_claims || [])) {
    if (p.claim !== 'compliance_determination' || !p.parameter) continue
    if (seen.has(p.parameter)) continue
    for (const window of mentionWindows(text, p.parameter)) {
      if (!has(DETERMINATIVE_RE, window)) continue
      seen.add(p.parameter)
      out.push({
        id: 'interpretation-exceeded',
        where: p.parameter,
        severity: 'blocking',
        message: `The narrative states a settled comparison for ${p.parameter}. ${p.why}`,
      })
      break
    }
  }
  return out
}

/**
 * A parameter no criterion was applied to may be reported and not compared.
 * Covers TVOC on every report, and any parameter the engine judged nothing
 * about on this one.
 */
function unjudgedParametersAreNotCompared(text, pkg) {
  const out = []
  const seen = new Set()
  for (const p of (pkg.prohibited_claims || [])) {
    if (p.claim !== 'criterion_comparison' || !p.parameter) continue
    if (seen.has(p.parameter)) continue
    for (const window of mentionWindows(text, p.parameter)) {
      if (!has(COMPARISON_RE, window)) continue
      seen.add(p.parameter)
      out.push({
        id: 'criterion-comparison-unsupported',
        where: p.parameter,
        severity: 'blocking',
        message: `The narrative compares ${p.parameter} to a criterion. ${p.why}`,
      })
      break
    }
  }
  return out
}

/**
 * Causation. The global phrase ban catches "caused by" anywhere; this catches
 * the softer forms when they land on a pathway the engine weighed as a
 * candidate rather than an established explanation.
 */
function causationIsNotAsserted(text, pkg) {
  const out = []
  const hasPathwayProhibition = (pkg.prohibited_claims || []).some(p => p.claim === 'causation')
  if (!hasPathwayProhibition) return out
  const m = text.match(CAUSATION_RE)
  if (!m) return out
  const idx = text.indexOf(m[0])
  return [{
    id: 'causation-asserted',
    where: m[0],
    severity: 'blocking',
    message: `The narrative asserts cause ("${m[0]}") where the engine weighed the pathway as a candidate explanation. Use "consistent with", "an indicator of", or "may indicate". Context: "${text.slice(Math.max(0, idx - 60), idx + 80).trim()}"`,
  }]
}

/**
 * Every applicable limitation must survive the rewrite.
 *
 * `when` scopes a limitation to prose that actually raises the subject: a
 * narrative that never mentions TVOC owes no TVOC caveat. Without that, the
 * rule fires on every disclosure the report carries and gets switched off.
 */
function requiredLimitationsSurvive(text, pkg) {
  const lower = text.toLowerCase()
  const out = []
  for (const lim of (pkg.required_limitations || [])) {
    const alternatives = lim.must_mention || []
    if (!alternatives.length) continue
    const when = lim.when
    if (Array.isArray(when) && !when.some(t => lower.includes(str(t).toLowerCase()))) continue
    const present = alternatives.some(tokens => tokens.every(t => lower.includes(str(t).toLowerCase())))
    if (present) continue
    out.push({
      id: 'limitation-missing',
      where: lim.id,
      severity: 'blocking',
      message: `A required limitation is not stated anywhere in the narrative: "${lim.text}"`,
    })
  }
  return out
}

/** Prose must not clear a parameter the engine flagged. */
function findingsAreNotContradicted(text, pkg) {
  const out = []
  const flagged = new Set((pkg.findings || []).map(f => f.parameter).filter(Boolean))
  const seen = new Set()
  for (const parameter of flagged) {
    // The engine's `p` stamp uses `rh`; the package's measurements use the
    // model key. Accept either spelling.
    const key = parameter === 'rh' ? 'relativeHumidity' : parameter
    if (!PARAM_ALIASES[key] || seen.has(key)) continue
    for (const window of mentionWindows(text, key, 100, 160)) {
      if (!has(ACCEPTABLE_RE, window)) continue
      seen.add(key)
      out.push({
        id: 'finding-contradicted',
        where: key,
        severity: 'blocking',
        message: `The narrative describes ${key} as raising nothing, but the engine produced a finding for it. The narrative may not clear a parameter the assessment flagged.`,
      })
      break
    }
  }
  return out
}

/** An intervention the engine never recommended must not appear as advice. */
function recommendationsComeFromTheRegister(text, pkg) {
  const lower = text.toLowerCase()
  const offered = (pkg.recommendation_options || []).map(r => str(r.action).toLowerCase()).join(' ')
  const out = []
  for (const noun of INTERVENTIONS) {
    if (!aliasRegex(noun).test(lower)) continue
    if (offered.includes(noun)) continue
    out.push({
      id: 'recommendation-unsupported',
      where: noun,
      severity: 'warning',
      message: `The narrative names "${noun}", which no recommendation in the action register proposes. A control or analytical method the engine did not recommend is the writer's addition, not the assessment's.`,
    })
  }
  return out
}

const RULES = [
  figuresAreSupported,
  citedStandardsAreInThePackage,
  interpretationStaysWithinEvidence,
  unjudgedParametersAreNotCompared,
  causationIsNotAsserted,
  requiredLimitationsSurvive,
  findingsAreNotContradicted,
  recommendationsComeFromTheRegister,
]

/**
 * Audit generated prose against the evidence package it was written from.
 *
 * @param {string} text  the narrative as the model returned it
 * @param {object} pkg   output of `buildEvidencePackage(model, engine)`
 * @returns {Array<{id: string, where: string, message: string, severity: 'blocking'|'warning'}>}
 *   empty when the prose is supported by the package
 */
export function auditNarrative(text, pkg) {
  const body = str(text)
  if (!body.trim() || !pkg) return []
  const out = []
  for (const rule of RULES) {
    try {
      out.push(...rule(body, pkg))
    } catch (e) {
      out.push({
        id: 'rule-error',
        where: rule.name,
        severity: 'warning',
        message: `Audit rule ${rule.name} failed: ${(e && e.message) || e}`,
      })
    }
  }
  return out
}

/**
 * Whether a narrative may be shown to the assessor as written.
 *
 * Advisory by design, exactly like the finalization gate and the report
 * consistency panel: AtmosFlow surfaces what it cannot support and lets a
 * credentialed assessor decide. The caller decides what to do with
 * `blocking`; nothing here blocks an export.
 */
export function summarizeAudit(issues = []) {
  const blocking = issues.filter(i => i.severity === 'blocking')
  const warnings = issues.filter(i => i.severity !== 'blocking')
  return {
    supported: blocking.length === 0,
    blocking: blocking.length,
    warnings: warnings.length,
    summary: blocking.length === 0 && warnings.length === 0
      ? 'Every statement in the narrative is supported by the assessment record.'
      : blocking.length === 0
        ? `${warnings.length} item${warnings.length === 1 ? '' : 's'} to review before issue.`
        : `${blocking.length} statement${blocking.length === 1 ? '' : 's'} the assessment record does not support.`,
  }
}
