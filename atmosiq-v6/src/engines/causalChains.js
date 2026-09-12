/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 */

import { STD } from '../constants/standards'
import { detectSBSPattern } from './scoring'
import { evaluatePressurization, findCoOccurringMechanisms, shouldConsolidate } from './pressurization'
import { consolidatedMechanismStatement, notEvaluatedStatement } from './pressurizationNarrative'
import {
  PRESSURIZATION_REVIEW_LABEL, ZONE_PRESSURE,
  NEGATIVE_PRESSURE_SHORT, NOT_EVALUATED_SHORT,
} from '../constants/pressurizationStandards'

// Chain `type` labels are written as INLINE LITERALS at every push site
// below, including the two pressurization ones. That is not styling:
// `tests/engine/investigation.test.ts` greps this file for quoted chain
// labels and fails if one is missing from CHAIN_TYPE_TO_RULE in
// src/engine/investigation.ts. Hoisting a label into a constant would
// make it invisible to that scan, and the two files would be free to
// drift — which is the defect the guard exists to catch.

/**
 * @param {Array}  zones       Zone records.
 * @param {Object} bldg        Building record.
 * @param {Array}  zoneScores  scoreZone() output, one per zone.
 * @param {Object} [opts]
 * @param {Object} [opts.presurvey]  Pre-survey record — carries the
 *   differential-pressure instrument envelope (ps_inst_press_*). Optional:
 *   without it the pressurization mechanism degrades to qualitative, which
 *   is the correct reading of an assessment that recorded no instrument.
 */
/**
 * A chain's confidence, WEIGHED rather than counted.
 *
 * Every chain below used to end in some form of `ev.length >= N`, which asks
 * how many strings are in an array — not what kind of evidence exists. The
 * cross-contamination chain showed what that costs: `ev` began with one entry
 * and `path_crosstalk_source` pushed a second, so typing ANY text at all into
 * a free-text "source" field — "unknown", "?", a guess — raised the chain from
 * Possible to Moderate. The field describes the same observation the chain
 * already rests on; it is not a second, independent line of evidence.
 *
 * This is the rule CLAUDE.md already draws for the professional-opinion
 * rollup — "the opinion rollup weighs findings; it does not count them" —
 * arriving four months late in the module next door.
 *
 * The weighing:
 *   measured        an instrument reading, or a directly observed physical
 *                   condition (standing water, visible growth). Something
 *                   that would still be true if nobody had been asked.
 *   corroborating   INDEPENDENT lines of support — a second condition, a
 *                   symptom pattern, a pressure differential. Not a restatement
 *                   or an elaboration of the observation already counted.
 *   hypothesisOnly  the chain proposes a mechanism nothing measured.
 *                   It can never be Strong, whatever else is present.
 */
const weighChain = ({ measured = false, corroborating = 0, hypothesisOnly = false }) => {
  if (hypothesisOnly) return corroborating >= 2 ? 'Moderate' : 'Possible'
  if (measured && corroborating >= 2) return 'Strong'
  if (measured || corroborating >= 2) return 'Moderate'
  return 'Possible'
}

// Confidence vocabulary above, weakest to strongest.
//
// INTERNAL ONLY since 2026-09. It still ranks the chains (pickPrimaryChain)
// and still constrains what a narrative may assert about one
// (evidencePackage.js), but no client-facing surface prints the word. A
// published Possible / Moderate / Strong reads as a measurement of certainty,
// and AtmosFlow does not document a methodology that would let a client ask
// "what makes this Moderate rather than Low?" and get an answer. What the
// report states instead is what it can defend: the evidence, that no causal
// relationship is established, and what would verify it (`verification`).
const CHAIN_CONFIDENCE_RANK = { Possible: 1, Moderate: 2, Strong: 3 }

/**
 * What would settle each pathway, keyed by chain type.
 *
 * The report's Working Hypotheses section has always promised that each
 * hypothesis "names the verification it requires". It never did: `refutableBy`
 * was declared on the type (`src/types/assessment.ts`) and read by
 * `reportModel.js`, and nothing in this file — the only producer of chains —
 * ever set it. Every report carried the promise and bare root-cause sentences.
 *
 * That mattered more once the confidence label came off. A reader who is told
 * a pathway is unconfirmed needs to know what would confirm it, or the section
 * is a list of things the assessment declined to conclude.
 *
 * Written as a lowercase clause so one string serves the summary sentence, the
 * pathway table and the bullet. Each names an OBSERVATION or MEASUREMENT that
 * would resolve the question — never a remedy, which belongs to the action
 * register and nowhere else.
 */
const VERIFICATION = {
  'Ventilation Deficiency': 'outdoor-air delivery should be measured directly and compared against the design ventilation rate for this occupancy',
  'Microbial / Bioaerosol': 'concealed moisture should be investigated where it is suspected, and the extent of any affected material defined',
  'VOC Source': 'speciated VOC sampling should identify which compounds are present and where they originate',
  'Moisture / Biological': 'the moisture source should be located and the extent of affected material defined',
  'Chemical Exposure': 'the contaminant should be identified by speciated sampling and characterized over a full work period',
  'Cross-Contamination Pathway': 'the pathway should be confirmed by differential-pressure measurement or tracer testing between the two spaces',
  'Building Pressurization': 'building pressure should be measured across the envelope under normal operating conditions',
  'Building Pressurization — Not Evaluated': 'exterior-door airflow and differential pressure across the envelope should be observed and recorded',
}

/** The verification clause for a chain type, ignoring its (Hypothesis) suffix. */
const verificationFor = (type) => {
  const base = String(type || '').replace(/\s*\((?:Hypothesis|Mechanism)\)\s*$/, '').trim()
  return VERIFICATION[base] || null
}

/**
 * The chain a surface should LEAD with.
 *
 * Both the report's conceptual site model and the results hero used to take
 * `chains[0]` — whichever chain this file happened to push first, which is the
 * complaint-driven block. So an assessment whose strongest pathway was a
 * measured ventilation deficiency (Strong, a CO2 reading behind it) was
 * presented under a complaint-only hypothesis (Moderate) whose evidence was
 * nothing but occupant reports. Source-file ordering decided the headline.
 *
 * It lives here rather than in the report model because the hero needs it too,
 * and two surfaces naming different pathways as "the" finding for one
 * assessment is exactly the cross-layer disagreement CLAUDE.md warns about.
 *
 * Strongest confidence wins; more evidence breaks a tie; array order breaks
 * the rest, so the choice is deterministic for a given assessment.
 */
export function pickPrimaryChain(chains) {
  if (!chains || !chains.length) return undefined
  return chains.reduce((best, c) => {
    const rank = (x) => CHAIN_CONFIDENCE_RANK[x && x.confidence] || 0
    if (rank(c) !== rank(best)) return rank(c) > rank(best) ? c : best
    const ev = (x) => (Array.isArray(x && x.evidence) ? x.evidence.length : 0)
    return ev(c) > ev(best) ? c : best
  }, chains[0])
}

export function buildCausalChains(zones, bldg, zoneScores, opts = {}) {
  const chains = []
  zoneScores.forEach((zs, i) => {
    const z = zones[i] || {}, d = { ...bldg, ...z }, zName = zs.zoneName

    // Occupant-complaint pattern fires environmental hypotheses
    // from complaints alone. The platform screens building conditions only —
    // it never characterizes occupant health, so no SBS / building-related-
    // illness language appears in any output. Symptom characterization
    // requires an occupant survey + medical/occupational-health input and is
    // outside this assessment's scope.
    const sbsDetected = detectSBSPattern(d)
    if (sbsDetected && !chains.some(c => c.zone === zName && c.type.includes('Ventilation'))) {
      const ev = []
      // Independent corroborations, counted once each — a symptom LIST is one
      // line of support however many symptoms it names.
      const sbsCorroboration =
        (d.sr === 'Yes — clear pattern' ? 1 : 0) +
        (d.cc === 'Yes — this zone' ? 1 : 0) +
        ((d.sy || []).length ? 1 : 0)
      if (d.ac) ev.push((d.ac) + ' occupants with symptoms')
      if (d.sr === 'Yes — clear pattern') ev.push('Symptoms resolve when away from building')
      if (d.cc === 'Yes — this zone') ev.push('Symptom clustering in this zone')
      // The "Other" write-in (sy_other) rides along in the SAME evidence
      // line: it is what the assessor recorded, so it prints, but it is not
      // a second line of support and never matches a symptom rule.
      if ((d.sy||[]).length || d.sy_other) ev.push('Reported: ' + [...(d.sy||[]), ...(d.sy_other ? [d.sy_other] : [])].join(', '))
      // rootCause states the CAUSE only. What to do about it — check
      // ventilation rates, check damper operation — is a recommendation, and
      // the recommendations register and the actions list both carry it. It
      // used to be appended here, which made the cause too long for its card
      // and got it truncated mid-word in the app.
      chains.push({ zone: zName, type: 'Ventilation Deficiency (Hypothesis)',
        rootCause: 'Occupant complaints were reported in this zone. Insufficient outdoor-air delivery is a common contributor to complaint patterns of this kind.',
        evidence: ev,
        // It is labeled "(Hypothesis)" and its rootCause says "is a common
        // contributor". It reached 'Strong' when four complaint fields were
        // filled in, which is a count of how much the assessor typed. Nothing
        // here is measured, so Strong is off the table by construction.
        confidence: weighChain({ hypothesisOnly: true, corroborating: sbsCorroboration }) })
      chains.push({ zone: zName, type: 'Microbial / Bioaerosol (Hypothesis)',
        rootCause: 'Concealed moisture or microbial amplification behind finishes remains possible; a walkthrough cannot see it.',
        evidence: [...ev, 'Hypothesis — requires confirmatory investigation'], confidence: 'Possible' })
      chains.push({ zone: zName, type: 'VOC Source (Hypothesis)',
        rootCause: 'New materials, cleaning products, or adjacent processes may be contributing VOCs not captured by walkthrough.',
        evidence: [...ev, 'Hypothesis — requires TVOC/speciation sampling'], confidence: 'Possible' })
    }

    // Ventilation deficiency chain (measurement-based)
    // A ventilation problem worth chaining. This was `ventScore.s <= 15`
    // — the category having lost 10 of its 25 points — which is the same
    // question asked in the currency of a score that no longer exists.
    // A high or critical ventilation finding IS the deficiency; the
    // points were only ever a proxy for it.
    const ventScore = zs.cats.find(c => c.l === 'Ventilation')
    const hasVentIssue = !!ventScore?.r?.some(r => r.sev === 'high' || r.sev === 'critical')
    const hasSymptomsRelated = d.cx === 'Yes — complaints reported' && d.sr === 'Yes — clear pattern'
    const hasDamperIssue = d.od === 'Closed / minimum' || d.od === 'Stuck / inoperable'
    const hasWeakFlow = d.sa === 'Weak / reduced' || d.sa === 'No airflow detected'
    if (hasVentIssue && (hasSymptomsRelated || hasDamperIssue || hasWeakFlow)) {
      const ev = []
      if (d.co2) ev.push('CO₂ at ' + d.co2 + ' ppm')
      if (hasDamperIssue) ev.push('OA damper: ' + d.od)
      if (hasWeakFlow) ev.push('Supply airflow: ' + d.sa)
      if (hasSymptomsRelated) ev.push((d.ac||'Multiple') + ' occupants with building-related symptoms')
      // The measured chain SUPERSEDES the complaint-only hypothesis for the
      // same mechanism in the same zone. They both describe inadequate
      // outdoor-air delivery; the difference is that this one has a CO2
      // reading behind it. The de-dup guard below only ever tested the exact
      // string 'Ventilation Deficiency', and the complaint block pushes
      // 'Ventilation Deficiency (Hypothesis)' — a different string — so the
      // guard never matched and BOTH shipped. Every affected report carried
      // two ventilation pathways over the same zones with two different
      // confidences, and because the report's "primary finding" was simply
      // chains[0], it led with the weaker, complaint-only one and never
      // showed the CO2 that supported the stronger.
      const supersededAt = chains.findIndex(c => c.zone === zName && c.type === 'Ventilation Deficiency (Hypothesis)')
      if (supersededAt !== -1) chains.splice(supersededAt, 1)
      if (!chains.some(c => c.zone === zName && c.type === 'Ventilation Deficiency'))
        chains.push({ zone: zName, type: 'Ventilation Deficiency', rootCause: hasDamperIssue ? 'Outdoor air damper restriction limiting fresh air delivery' : 'Inadequate ventilation rate for occupant load', evidence: ev, confidence: weighChain({
          measured: !!d.co2,
          corroborating: (hasDamperIssue ? 1 : 0) + (hasWeakFlow ? 1 : 0) + (hasSymptomsRelated ? 1 : 0),
        }) })
    }
    // Moisture chain
    const hasWater = d.wd === 'Active leak' || d.wd === 'Extensive damage'
    const hasMold = d.mi && !['None','Suspected discoloration'].includes(d.mi)
    const hasMusty = (d.ot||[]).includes('Musty / Earthy')
    const hasResp = (d.sy||[]).some(s => ['Cough','Wheezing','Nasal congestion','Throat irritation'].includes(s))
    if ((hasWater||hasMold||hasMusty) && (hasMold||hasMusty||hasResp)) {
      const ev = []
      if (hasWater) ev.push('Water intrusion: ' + d.wd)
      if (hasMold) ev.push('Visible mold: ' + d.mi)
      if (hasMusty) ev.push('Musty/earthy odor')
      if (hasResp) ev.push('Respiratory symptoms reported')
      if (d.rh && +d.rh > 60) ev.push('Indoor RH at ' + d.rh + '%')
      const hasQuantitative = hasWater || hasMold || (d.rh && +d.rh > 65)
      chains.push({ zone: zName, type: 'Moisture / Biological', rootCause: hasWater ? 'Active water intrusion supporting microbial amplification' : 'Chronic moisture condition with biological growth indicators', evidence: ev, confidence: weighChain({
        measured: hasQuantitative,
        corroborating: (hasMusty ? 1 : 0) + (hasResp ? 1 : 0) + (d.rh && +d.rh > 60 ? 1 : 0),
      }) })
    }
    // Chemical chain
    const hasSrc = (d.src_internal||[]).length > 0 || (d.src_adjacent||[]).length > 0
    // A TVOC term (`d.tv > STD.c.tvoc.con`) sat alongside HCHO here until
    // 2026-08, gated on Mølhave's advisory tier. It went with every other
    // TVOC threshold. A causal chain is an explanation offered to a reader,
    // and "the TVOC was elevated" is not one this platform can support
    // without a limit to call it elevated against. HCHO still drives the
    // chain — it has a real exposure limit behind it, so the chain now rests
    // on a measurement that means something.
    const hasHCHO = d.hc && +d.hc > STD.c.hcho.niosh
    const hasIrr = (d.sy||[]).some(s => ['Eye irritation','Headache','Throat irritation'].includes(s))
    if (hasSrc && hasHCHO && hasIrr) {
      const ev = []
      ev.push('HCHO at ' + d.hc + ' ppm')
      // Write-ins (src_internal_other / src_adjacent_other) print with the
      // sources but do not satisfy hasSrc above — a source the engine
      // cannot classify is recorded, not inferred from.
      ev.push('Sources: ' + [...(d.src_internal||[]),...(d.src_adjacent||[]), ...(d.src_internal_other ? [d.src_internal_other] : []), ...(d.src_adjacent_other ? [d.src_adjacent_other] : [])].filter(s => s !== 'None identified').join(', '))
      ev.push('Irritation symptoms reported')
      chains.push({ zone: zName, type: 'Chemical Exposure', rootCause: 'Contaminant source(s) producing elevated concentrations with correlated symptoms', evidence: ev, confidence: weighChain({
        measured: !!hasHCHO,
        // The guard above already requires an identified source AND correlated
        // irritation symptoms, so both corroborators are present by
        // construction. Stated rather than assumed, so a change to the guard
        // cannot silently change the confidence.
        corroborating: (hasSrc ? 1 : 0) + (hasIrr ? 1 : 0),
      }) })
    }
    // Cross-contamination chain
    if (d.path_crosstalk && d.path_crosstalk !== 'None observed' && d.path_crosstalk !== 'Not assessed') {
      const ev = ['Cross-contamination: ' + d.path_crosstalk]
      // Naming the source ELABORATES the observation already in `ev`; it does
      // not independently corroborate it. It still belongs in the evidence
      // list a reader sees — it is useful — but it must not move the tier,
      // which is exactly what `ev.length >= 2` made it do.
      if (d.path_crosstalk_source) ev.push('Source: ' + d.path_crosstalk_source)
      const negativePressure = d.path_pressure === 'Negative (draws in)'
      if (negativePressure) ev.push('Zone under negative pressure')
      chains.push({ zone: zName, type: 'Cross-Contamination Pathway', rootCause: 'Air pathway allowing contaminant migration from adjacent source', evidence: ev, confidence: weighChain({
        // A measured differential is the one thing here that is not somebody's
        // description of what they saw.
        measured: negativePressure,
        corroborating: 0,
      }) })
    }
  })

  // ── Pressurization: the consolidating mechanism ─────────────────────
  //
  // Runs AFTER the per-zone rules, and it is the only rule here that
  // reasons across zones, because the condition it describes is a
  // property of the building rather than of a room.
  //
  // What it does that the rules above do not: where several of the
  // observations it can explain are present at once, it emits ONE
  // statement instead of leaving the reader to notice that four
  // separate findings share an explanation. That is the whole value —
  // a report listing elevated particulate, elevated humidity, an odor
  // and envelope moisture as four unrelated items has buried the fact
  // that one test-and-balance evaluation bears on all four.
  //
  // It never replaces the individual findings. They stay where they
  // are, scored as they were; this adds the connection between them.
  const pressurization = evaluatePressurization({ bldg, zones, presurvey: opts.presurvey })

  // Collect the explainable observations across every zone, deduped by
  // KIND. Two zones with elevated particulate are one kind of thing the
  // mechanism explains, not two — counting them twice would let a
  // single observation repeated across a floor trip consolidation on
  // its own.
  const byKind = new Map()
  zoneScores.forEach((zs, i) => {
    const d = { ...bldg, ...(zones[i] || {}) }
    for (const hit of findCoOccurringMechanisms(d)) {
      const existing = byKind.get(hit.key)
      if (existing) { existing.zoneNames.push(zs.zoneName); continue }
      byKind.set(hit.key, { ...hit, zoneNames: [zs.zoneName] })
    }
  })
  const hits = [...byKind.values()]

  if (shouldConsolidate(pressurization, hits)) {
    // Name the zone only when the observations sit in exactly one; with
    // several, naming one of them would misdescribe the rest.
    const zoneNames = [...new Set(hits.flatMap(h => h.zoneNames))]
    const namedZone = zoneNames.length === 1 ? zoneNames[0] : null
    const evidence = hits.map(h => h.detail.charAt(0).toUpperCase() + h.detail.slice(1))
    if (pressurization.quantitative.present) {
      evidence.unshift('Differential pressure ' + pressurization.quantitative.rawValue + ' ' + pressurization.quantitative.rawUnits + ' (interior vs outdoors)')
    } else {
      evidence.unshift('Exterior door test: air flows inward')
    }
    for (const zoneName of pressurization.zonesNegative) {
      evidence.push(zoneName + ' negative relative to the adjacent space')
    }
    evidence.push('Review status: ' + PRESSURIZATION_REVIEW_LABEL)
    chains.push({
      zone: namedZone || 'Building-wide',
      scope: 'building',
      type: 'Building Pressurization (Mechanism)',
      // `rootCause` states the condition and stops — it renders in a
      // fixed card, and a paragraph there gets clipped mid-word (the
      // defect findings-state-the-finding.test.ts exists to prevent).
      // The reasoning, the list of what it explains and the follow-up
      // live in `mechanismStatement`, which the report renders in full.
      rootCause: NEGATIVE_PRESSURE_SHORT,
      mechanismStatement: consolidatedMechanismStatement(pressurization, hits, namedZone),
      evidence,
      // Capped at Moderate by construction. A walkthrough cannot
      // establish that the mechanism IS the explanation, only that it
      // is available and would account for what was seen; "Strong"
      // would overstate every version of this chain.
      confidence: pressurization.qualitativeOnly ? 'Possible' : 'Moderate',
      mechanism: true,
      consolidates: hits.map(h => h.key),
      reviewLabel: PRESSURIZATION_REVIEW_LABEL,
    })
  } else if (!pressurization.evaluated) {
    // Silence is not an acceptable output. An assessment that says
    // nothing about pressurization reads, to a client, as one that
    // ruled infiltration out — so the absence is stated as explicitly
    // as a finding would be.
    chains.push({
      zone: 'Building-wide',
      scope: 'building',
      type: 'Building Pressurization — Not Evaluated',
      rootCause: NOT_EVALUATED_SHORT,
      mechanismStatement: notEvaluatedStatement(pressurization),
      evidence: [
        'No exterior-door airflow observation recorded',
        'No differential-pressure measurement recorded',
        'Review status: ' + PRESSURIZATION_REVIEW_LABEL,
      ],
      confidence: 'Possible',
      mechanism: true,
      notEvaluated: true,
      reviewLabel: PRESSURIZATION_REVIEW_LABEL,
    })
  }

  // Stamped in ONE place rather than on eight push sites: a chain added later
  // gets its verification clause without anyone remembering to attach it, and
  // a type with no entry in VERIFICATION carries null rather than silently
  // inheriting another pathway's.
  return chains.map(c => (c && !c.verification ? { ...c, verification: verificationFor(c.type) } : c))
}

/**
 * The pressurization assessment on its own, for consumers that need the
 * mechanism without the chain list (the result surface, the report's
 * building section, the recommendations register).
 *
 * Exported from here rather than re-derived at each call site so every
 * consumer sees the same evaluation of the same record.
 */
export function buildPressurization(zones, bldg, presurvey) {
  return evaluatePressurization({ bldg, zones, presurvey })
}

// Re-exported so a consumer reading chains does not need to know which
// module owns the zone-pressure vocabulary.
export { ZONE_PRESSURE }