/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * modelConsistency — does the assembled report agree with itself?
 *
 * `checkRenderModel(model)` reads the output of `assembleRenderModel` and
 * returns every place one section of the report contradicts another. It is
 * PURE and MODEL-ONLY: it never re-scores, never reads the engine, and never
 * opens a file — which is what lets the same function run in two places:
 *
 *   1. tests/engine/cross-layer-consistency.test.ts, over a fixture matrix,
 *      where a non-empty result fails the build; and
 *   2. the Report tab, on the exact model the export will render, where a
 *      non-empty result is shown to the assessor before they generate the
 *      document. Advisory, like every other readiness signal — the platform
 *      surfaces a contradiction; it does not block the deliverable.
 *
 * Why this exists. Every defect the 2026-09 walkthrough audit found was one
 * layer of the report disagreeing with another: a site-mean row reading
 * Acceptable under two Elevated zones, "most areas acceptable" over a table
 * with every area flagged, HVAC "acceptable" beside weak supply air, two
 * ventilation pathways over one zone, a date the cover stated and the
 * scorer could not see. The existing cross-layer test compares the model
 * against the ENGINE, parameter by parameter; this compares the model
 * against ITSELF, section by section. Both are needed, and neither is a
 * substitute for the other.
 *
 * Each check is a named function so a failure says which rule tripped, and
 * so a rule can be pointed at in a test that proves it bites. A check that
 * cannot be shown to fail on a deliberately broken model is not a check.
 */

const RANK = { not_evaluated: -1, reference: -1, ok: 0, advisory: 1, elevated: 2, priority: 3 }
const rank = (sev) => (sev in RANK ? RANK[sev] : -1)

/** A finding for the caller: where it is, what disagrees, and why it matters. */
const issue = (id, where, message) => ({ id, where, message })

// ── Individual rules ──────────────────────────────────────────────────────

/** The site-mean row can never read better than the worst zone above it. */
function siteMeanNotBetterThanZones(M) {
  const rows = (M.results && M.results.rows) || []
  const mean = rows.find(r => r.id === 'Site mean')
  if (!mean) return []
  const zones = rows.filter(r => r.id !== 'Site mean' && r.id !== 'Outdoor reference')
  const worst = zones.reduce((w, r) => Math.max(w, rank(r.sev)), -1)
  if (rank(mean.sev) < worst) {
    return [issue('site-mean-rank', 'Measurement Results',
      `The site-mean row reads "${mean.sev}" while a zone row above it reads worse. A summary row cannot be better than the rows it summarizes.`)]
  }
  return []
}

/**
 * The overall statement may not represent the assessment as clean while the
 * report carries a finding, and its scope claim must match the census.
 *
 * This rule used to compare the statement against the MEASUREMENT RESULTS
 * TABLE, which is how it missed the defect it most needed to catch: that
 * table covers six parameters, the engine finds conditions outside all six,
 * and on an assessment where every one of the six was clean while four
 * findings stood in one room, the statement announced "Measured parameters
 * were within recognized references across the areas assessed, with 4 items
 * flagged for follow-up" and this rule agreed with it. Both were reading the
 * same incomplete source.
 *
 * It now reads the FINDINGS CENSUS — the canonical record of what the engine
 * concluded — so the rule and the statement can only agree when the statement
 * is right about the whole report rather than about one table.
 */
function overallStatementMatchesCensus(M) {
  const text = String(M.overallStatement || '')
  if (!text) return []
  const rows = (M.findings && M.findings.rows) || []
  const out = []
  // The all-clear sentence, over a report that carries findings. This is the
  // Larkin Hall contradiction, stated as an invariant.
  if (!rows.length) return out
  if (/\bAll measured parameters were within recognized references\b/.test(text)
      || /\bno corrective action is indicated\b/i.test(text)) {
    out.push(issue('summary-all-clear', 'Overall statement',
      `The overall statement reads as an all-clear while the report carries ${rows.length} finding(s). A summary may not describe the assessment as clean when the findings census contradicts it.`))
  }
  const zones = new Set(rows.flatMap(r => r.zones || [r.z]).filter(Boolean))
  const tableZones = ((M.results && M.results.rows) || [])
    .filter(r => r.id !== 'Site mean' && r.id !== 'Outdoor reference').length
  const affected = zones.size
  if (/Every area assessed carries/.test(text) && tableZones && affected < tableZones) {
    out.push(issue('summary-scope', 'Overall statement',
      `"Every area assessed carries at least one condition of note" while findings name only ${affected} of ${tableZones} areas.`))
  }
  const m = /identified in (\d+) of the (\d+) area/.exec(text)
  if (m && Number(m[1]) !== affected) {
    out.push(issue('summary-scope', 'Overall statement',
      `The statement says ${m[1]} area(s) carry conditions of note; the findings census names ${affected}.`))
  }
  return out
}

/** Every leading finding in the executive summary must appear in the findings table. */
function summaryFindingsInTable(M) {
  const es = M.execSummary
  if (!es || typeof es === 'string' || !Array.isArray(es.findings)) return []
  const rows = (M.findings && M.findings.rows) || []
  const out = []
  for (const line of es.findings) {
    // "Zone — claim", where the claim is the headline of some row's text.
    // Matched against each row's OWN zone name rather than split on the
    // first " — ", because zone names carry em-dashes too ("4th Floor Open
    // Office — North") — which is exactly what this rule's first run caught,
    // in itself.
    const text = String(line)
    const matched = rows.some(r => {
      const prefix = `${r.z} — `
      if (!text.startsWith(prefix)) return false
      const claim = text.slice(prefix.length)
      return claim.length > 0 && String(r.f).startsWith(claim.slice(0, Math.min(claim.length, 40)))
    })
    if (!matched) {
      out.push(issue('summary-finding-orphan', 'Executive summary',
        `Leading finding "${text.slice(0, 70)}…" has no matching row in the findings table.`))
    }
  }
  return out
}

/** A cited criterion must resolve to an appendix entry; an appendix entry must be used. */
function citationsResolve(M) {
  const refs = (M.references || []).map(r => r[0])
  const rows = (M.findings && M.findings.rows) || []
  const out = []
  for (const r of rows) {
    if (r.std && !refs.includes(r.std)) {
      out.push(issue('citation-missing', 'Findings', `"${String(r.f).slice(0, 50)}…" cites ${r.std}, which is not in the references appendix.`))
    }
    if (r.cite) {
      const n = Number(String(r.cite).replace(/[[\]]/g, ''))
      const entry = (M.references || [])[n - 1]
      if (!entry || (r.std && entry[0] !== r.std)) {
        out.push(issue('citation-number', 'Findings', `Citation ${r.cite} on "${String(r.f).slice(0, 50)}…" does not resolve to the criterion it cites.`))
      }
    }
  }
  for (const [ref, , usage] of (M.references || [])) {
    if (!usage) out.push(issue('reference-orphan', 'References', `${ref} is listed but nothing in the report cites or applies it.`))
  }
  return out
}

/** Every register row names where the action applies, who owns it, and what would show it done. */
function registerComplete(M) {
  const reg = (M.recommendations && M.recommendations.register) || []
  const out = []
  reg.forEach((r, i) => {
    if (!r.location) out.push(issue('register-location', 'Recommended actions', `Action ${i + 1} ("${String(r.action).slice(0, 50)}…") has no location.`))
    if (!r.owner) out.push(issue('register-owner', 'Recommended actions', `Action ${i + 1} has no owner role.`))
    if (!r.evidence) out.push(issue('register-evidence', 'Recommended actions', `Action ${i + 1} has no completion evidence.`))
    if (!r.action) out.push(issue('register-action', 'Recommended actions', `Action ${i + 1} is empty.`))
  })
  return out
}

/**
 * A measured parameter is attributed to an instrument, or its absence is
 * disclosed — never silently attributed to whatever meter is listed first.
 */
function instrumentsCoverParameters(M) {
  const rows = ((M.results && M.results.rows) || []).filter(r => r.id !== 'Site mean' && r.id !== 'Outdoor reference')
  const qa = (M.qaQc || []).join(' | ')
  const lim = (M.limitations || []).join(' ')
  const out = []
  if (rows.some(r => r.tvoc !== null && r.tvoc !== undefined) && !/VOC \/ PID meter/.test(qa)) {
    out.push(issue('qa-tvoc', 'Investigation Methods & QA/QC', 'TVOC readings appear in the results table but QA/QC carries no VOC / PID meter row.'))
  }
  if (/no PID is documented/.test(qa) && !/TVOC[^.]*no instrument/.test(lim)) {
    out.push(issue('qa-tvoc-limitation', 'Limitations', 'QA/QC says no PID is on record for TVOC, but Limitations does not disclose it.'))
  }
  if (/no instrument for them is documented/.test(qa) && /Formaldehyde/.test(qa) && !/Formaldehyde[^.]*no instrument/.test(lim)) {
    out.push(issue('qa-hcho-limitation', 'Limitations', 'QA/QC says no instrument is on record for formaldehyde, but Limitations does not disclose it.'))
  }
  return out
}

/** Observations recount; they do not judge. No severity word, no citation. */
function observationsCarryNoVerdict(M) {
  const obs = M.observations
  if (!obs) return []
  const VERDICT = /\b(ASHRAE|NIOSH|OSHA|WHO|EPA)\b|\b(Priority|Elevated|Advisory|Acceptable)\b|inadequate|exceeds|non-?compliant/
  const out = []
  for (const z of obs.zones || []) {
    for (const line of [...(z.observed || []), ...(z.occupantReports || [])]) {
      if (VERDICT.test(line)) out.push(issue('observation-verdict', 'Walkthrough observations', `"${line}" states a verdict or cites a standard; observations must only recount.`))
    }
  }
  return out
}

/** A limitation that says something is absent must not sit beside that thing. */
function limitationsAgreeWithSections(M) {
  const lim = (M.limitations || []).join(' ')
  const out = []
  const photos = ((M.photos && M.photos.items) || []).length
  if (/No photographs are included/.test(lim) && photos > 0) {
    out.push(issue('limitation-photos', 'Limitations', `Limitations say no photographs are included while the photograph appendix carries ${photos}.`))
  }
  const logger = !!(M.loggerImages && M.loggerImages.images && M.loggerImages.images.length)
  if (/No continuous logger data was collected/.test(lim) && logger) {
    out.push(issue('limitation-logger', 'Limitations', 'Limitations say no logger data was collected while the report carries logger graphs.'))
  }
  // A parameter the engine declined to judge is disclosed as a gap.
  for (const g of M.findingsAtGlance || []) {
    if (g.outcome !== 'not_evaluated') continue
    const label = String(g.parameter).split(' (')[0]
    // TVOC is "not evaluated" by design and says so in its own basis column.
    if (/TVOC/i.test(g.parameter)) continue
    if (!new RegExp(label.split(' ')[0], 'i').test(lim)) {
      out.push(issue('gap-undisclosed', 'Limitations', `${g.parameter} is shown as not evaluated but no limitation explains why.`))
    }
  }
  return out
}

/**
 * Every pin on the floor plan names a location the results table carries.
 *
 * The figure's numbers resolve through the table beneath it to a location
 * name; a name that appears nowhere else in the report is a pin pointing at
 * nothing. Every results row is a place except the site mean, which is an
 * arithmetic summary. The outdoor reference IS a place and IS a row, so an
 * outdoor pin resolves to it.
 */
function floorPlanPinsResolve(M) {
  const figures = M.floorPlans && Array.isArray(M.floorPlans.figures) ? M.floorPlans.figures : []
  if (!figures.length) return []
  const named = new Set(
    ((M.results && M.results.rows) || [])
      .filter(r => r && r.id !== 'Site mean')
      .map(r => String(r.id)),
  )
  const out = []
  for (const fig of figures) {
    for (const p of (Array.isArray(fig.pins) ? fig.pins : [])) {
      if (named.has(String(p.zone))) continue
      const where = figures.length > 1 ? ` (${fig.label})` : ''
      out.push(issue('floorplan-pin', 'Site plan', `Pin ${p.n} on the floor plan${where} is labeled "${p.zone}", which is not a zone in the measurement results.`))
    }
  }
  return out
}

/** The conclusion the summary states is the one the site model tables. */
function conclusionAgreesWithSiteModel(M) {
  const es = M.execSummary
  const cm = M.conceptualModel
  if (!cm || !es || typeof es === 'string') return []
  const heading = String(cm.heading || '').toLowerCase()
  const conclusion = (es.paragraphs || []).find(p => /leading explanation/i.test(p)) || ''
  if (!conclusion) return []
  // "The leading explanation is <pathway> in <zone>" — the pathway must be
  // the one the site model is headed with.
  const m = /leading explanation is (.+?) in /i.exec(conclusion)
  if (m && !heading.includes(m[1].toLowerCase())) {
    return [issue('conclusion-vs-site-model', 'Executive summary',
      `The summary names "${m[1]}" as the leading explanation; the conceptual site model is headed "${cm.heading}".`)]
  }
  return []
}

/**
 * An action's own text must not name a deadline tighter than its bucket.
 *
 * The register prints Timeframe and Action side by side, so "within 24–72
 * hours" in a 7–30 day row is a contradiction the reader sees at once. The
 * fix was to take deadlines OUT of action text — timing is stated once, in
 * the column — and this rule keeps them out. It is deliberately about
 * contradiction, not presence: "48 hours per IICRC S500" in an Immediate row
 * is a standard's own figure inside its window and passes.
 */
// Each bucket's window in hours, [from, to]. A text deadline contradicts the
// bucket when it falls entirely OUTSIDE that window — in either direction.
// The first draft of this rule checked only the upper edge, and "within 72
// hours" under a 7–30 day bucket is a deadline EARLIER than the window, not
// later; the negative test caught it, which is what negative tests are for.
const BUCKET_WINDOW = { 'Immediate': [0, 7 * 24], 'Short term': [7 * 24, 30 * 24], 'Medium term': [30 * 24, 90 * 24], 'Ongoing': [0, Infinity] }
function registerTimeframeAgrees(M) {
  const reg = (M.recommendations && M.recommendations.register) || []
  const out = []
  reg.forEach((r, i) => {
    const m = /within\s+(\d+)(?:\s*[–-]\s*(\d+))?\s*(hour|day|week)s?/i.exec(String(r.action || ''))
    if (!m) return
    const unit = ({ hour: 1, day: 24, week: 168 })[m[3].toLowerCase()]
    const lower = Number(m[1]) * unit
    const upper = Number(m[2] || m[1]) * unit
    const window = BUCKET_WINDOW[r.priority]
    if (window && (upper < window[0] || lower > window[1])) {
      out.push(issue('register-timeframe', 'Recommended actions',
        `Action ${i + 1} says "${m[0]}" but is filed under ${r.priority} (${r.timeframe}); the text and the column disagree about when.`))
    }
  })
  return out
}

/**
 * A non-determinative comparison may not be presented as a demonstrated
 * exceedance of the reference's averaging-period exposure limit.
 *
 * The engine computes `determinative` from the criterion's averaging period
 * against the measurement's evidence basis: a 15-minute walkthrough reading
 * cannot settle a 10-hour TWA. Being NUMERICALLY ABOVE a reference value and
 * DEMONSTRATING EXCEEDANCE of that reference's exposure limit are different
 * claims, and only the first is available from a short-duration measurement.
 *
 * This rule reads the flag rather than the prose, so a new wording cannot
 * escape it — the check is that the management row carrying the finding says
 * the comparison is unsettled, and that no layer upgrades it to an exposure.
 */
function nonDeterminativeNotAnExceedance(M) {
  const rows = (M.findings && M.findings.rows) || []
  const unsettled = rows.filter(r => r && r.determinative === false)
  if (!unsettled.length) return []
  const out = []
  const items = ((M.managerSummary && M.managerSummary.attention && M.managerSummary.attention.items) || [])
  for (const r of unsettled) {
    const row = items.find(it => (it.zones || []).some(z => (r.zones || [r.z]).includes(z)))
    if (row && !/cannot settle/i.test(String(row.whyItMatters || ''))) {
      out.push(issue('unsettled-comparison', 'What needs attention',
        `"${String(r.f).slice(0, 60)}…" rests on a comparison this measurement cannot settle, and the management row does not say so.`))
    }
  }
  // No layer may turn it into an exposure determination. Scoped to the prose
  // a reader meets, not to the engine's own finding sentence.
  const EXPOSURE = /\b(?:exposure (?:limit|standard) (?:was |is )?exceeded|exceeded the (?:PEL|REL|TLV|OEL)|demonstrated exceedance|in excess of the (?:permissible|recommended) exposure)\b/i
  for (const [where, text] of proseOf(M)) {
    if (EXPOSURE.test(text)) {
      out.push(issue('exposure-asserted', where,
        `"${text.slice(0, 70)}…" states an exposure-limit exceedance. A short-duration measurement compares against a reference value; it does not demonstrate exceedance of its averaging-period limit.`))
    }
  }
  return out
}

/**
 * The Executive Summary and the management layer name the SAME primary
 * hypothesis, because both are handed the same chains.
 *
 * They disagreed on a live report: the summary said chemical exposure, from
 * `pickPrimaryChain`, while What Needs Attention said ventilation deficiency,
 * because it took the first chain in array order. One room, one evidence set,
 * two leading hypotheses decided by list position.
 */
function oneLeadingHypothesis(M) {
  const es = M.execSummary
  if (!es || typeof es === 'string') return []
  const conclusion = (es.paragraphs || []).find(p => /leading working hypothesis/i.test(p))
  if (!conclusion) return []
  const named = /^(.+?) in .+? is the leading working hypothesis/i.exec(String(conclusion).trim())
  if (!named) return []
  const claim = named[1].toLowerCase().trim()
  const items = ((M.managerSummary && M.managerSummary.attention && M.managerSummary.attention.items) || [])
    .filter(it => /working hypothesis:/i.test(String(it.status || '')))
  const out = []
  for (const it of items) {
    const m = /working hypothesis:\s*([^—]+)—/i.exec(String(it.status))
    if (!m) continue
    const mgr = m[1].toLowerCase().trim()
    if (mgr && claim && mgr !== claim) {
      out.push(issue('hypothesis-disagreement', 'What needs attention',
        `The executive summary names "${claim}" as the leading working hypothesis; the management row for ${it.location} names "${mgr}". Both read the same chains.`))
    }
  }
  return out
}

/**
 * A hypothesis stays a hypothesis, and a screening measurement stays a
 * screening measurement.
 *
 * Four claim shapes no layer of this report may make, checked over the prose
 * a reader actually meets. Each one is a class the report has the evidence to
 * state properly and would be wrong to state strongly.
 */
function claimsStayWithinEvidence(M) {
  const out = []
  const CLAIMS = [
    [/\b(?:established|confirmed|identified|proven) (?:cause|source)\b|\bthe cause (?:is|was)\b|\bcaused the\b/i,
      'cause-asserted',
      'states an established cause. Every pathway in this report is a working hypothesis pending verification.'],
    [/\b(?:TVOC|total VOCs?)\b[^.]{0,60}\b(?:identifies|identified|is|are) (?:the )?(?:compound|chemical|formaldehyde|benzene)/i,
      'screening-as-identification',
      'reads a non-specific screening measurement as a compound identification. Speciation is what identifies a compound.'],
    [/\b(?:complies with|compliant with|in compliance with|meets the) (?:the )?(?:NAAQS|EPA (?:standard|NAAQS)|ambient standard)/i,
      'context-as-compliance',
      'presents a contextual ambient reference as a compliance criterion. NAAQS are outdoor, population-level standards.'],
    [/\b(?:no (?:findings?|conditions?)[^.]{0,30}(?:therefore|so|which means)[^.]{0,40}(?:safe|healthy|no risk))\b|\bis safe\b|\bproves? (?:the building|it) (?:is )?safe\b/i,
      'absence-as-safety',
      'reads the absence of a flagged result as proof of safety. An assessment reports what it found in the areas and window assessed.'],
  ]
  for (const [where, text] of proseOf(M)) {
    for (const [re, id, why] of CLAIMS) {
      if (assertsPositively(text, re)) out.push(issue(id, where, `"${text.slice(0, 70)}…" ${why}`))
    }
  }
  return out
}

/**
 * Does the text make this claim, or deny it?
 *
 * The report's own conceptual-site-model intro ends "The chain is a working
 * hypothesis, NOT AN ESTABLISHED CAUSE" — which is the report doing exactly
 * the right thing, and which a bare /established cause/ matched on its first
 * run. A rule that fires on the sentence disclaiming the claim is worse than
 * no rule: it trains a reader to ignore it, and the pressure is then to
 * delete the disclaimer rather than the rule.
 *
 * So a match counts only when the words immediately before it do not negate
 * it. The window is short on purpose — a negation four clauses back does not
 * govern this one.
 */
const NEGATION = /\b(?:not|never|no|nor|cannot|can't|without|rather than|instead of)\b[^.]{0,24}$/i
function assertsPositively(text, re) {
  const str = String(text || '')
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
  let m
  while ((m = rx.exec(str)) !== null) {
    if (!NEGATION.test(str.slice(Math.max(0, m.index - 40), m.index))) return true
    if (m[0].length === 0) rx.lastIndex += 1
  }
  return false
}

/**
 * The client-facing prose this file checks, by section.
 *
 * Deliberately NOT the engine's own finding sentences: those are the
 * authoritative output of the deterministic layer and are governed by the
 * criterion registry and `api/_banned-language.js`. What is checked here is
 * every place a projection RESTATES them — the summary, the management layer,
 * the section intros — because that is where a restatement can get stronger
 * than the thing it restates.
 */
function proseOf(M) {
  const out = []
  const push = (where, v) => { if (typeof v === 'string' && v.trim()) out.push([where, v]) }
  const es = M.execSummary
  if (es && typeof es !== 'string') {
    ;(es.paragraphs || []).forEach(p => push('Executive summary', p))
    push('Executive summary', es.nextStep)
  } else push('Executive summary', es)
  push('Overall statement', M.overallStatement)
  const mgr = M.managerSummary || {}
  const att = mgr.attention || {}
  push('What needs attention', att.intro)
  push('What needs attention', att.none)
  ;(att.items || []).forEach(it => {
    push('What needs attention', it.status)
    push('What needs attention', it.whyItMatters)
  })
  ;((mgr.scope || {}).did || []).forEach(l => push('Assessment scope', l))
  ;(M.discussion && M.discussion.paragraphs ? M.discussion.paragraphs : []).forEach(p => push('Discussion', p))
  push('Conceptual site model', Array.isArray((M.conceptualModel || {}).intro) ? (M.conceptualModel.intro || []).join(' ') : (M.conceptualModel || {}).intro)
  ;((M.workingHypotheses || {}).items || []).forEach(i => push('Working hypotheses', i))
  ;((M.co2Bars || {}).caption ? [M.co2Bars.caption] : []).forEach(c => push('Charts', c))
  ;(((M.loggerImages || {}).images) || []).forEach(g => push('Logger evidence', g.caption))
  return out
}

// ── Entry point ───────────────────────────────────────────────────────────

const RULES = [
  siteMeanNotBetterThanZones,
  overallStatementMatchesCensus,
  summaryFindingsInTable,
  citationsResolve,
  registerComplete,
  registerTimeframeAgrees,
  instrumentsCoverParameters,
  observationsCarryNoVerdict,
  limitationsAgreeWithSections,
  floorPlanPinsResolve,
  conclusionAgreesWithSiteModel,
  nonDeterminativeNotAnExceedance,
  oneLeadingHypothesis,
  claimsStayWithinEvidence,
]

/**
 * @param {object} model  output of assembleRenderModel
 * @returns {Array<{id: string, where: string, message: string}>} empty when the report agrees with itself
 */
export function checkRenderModel(model) {
  if (!model || typeof model !== 'object') return []
  return RULES.flatMap(rule => {
    try { return rule(model) || [] } catch (e) {
      // A rule that throws is a bug in the rule, not a clean report.
      return [issue('rule-error', rule.name, `Consistency rule "${rule.name}" threw: ${e && e.message}`)]
    }
  })
}

/** The rule ids, for tests that assert every rule is exercised. */
export const RULE_IDS = [
  'site-mean-rank', 'summary-scope', 'summary-all-clear', 'summary-finding-orphan', 'citation-missing', 'citation-number',
  'reference-orphan', 'register-location', 'register-owner', 'register-evidence', 'register-action', 'register-timeframe',
  'qa-tvoc', 'qa-tvoc-limitation', 'qa-hcho-limitation', 'observation-verdict',
  'limitation-photos', 'limitation-logger', 'gap-undisclosed', 'floorplan-pin', 'conclusion-vs-site-model',
  'unsettled-comparison', 'exposure-asserted', 'hypothesis-disagreement',
  'cause-asserted', 'screening-as-identification', 'context-as-compliance', 'absence-as-safety',
]
