/**
 * AtmosFlow Assessment Engine v3.0
 *
 * Deterministic, sufficiency-aware FINDING GENERATION. Missing data →
 * INSUFFICIENT, not silence.
 *
 * ── What this engine no longer does ───────────────────────────────────
 * Through v2.9 this file did two jobs at once: it produced the findings
 * AND it scored them onto a 100-point weighted composite. The score is
 * gone. Nothing here computes a number, a weight, a deduction or a risk
 * band, and `tests/engine/no-scoring.test.ts` fails if any of them come
 * back.
 *
 * The findings themselves are untouched. Every branch below read
 * `if (condition) { s = N; r.push({...}) }`; the branch conditions were
 * always raw-data comparisons and the finding's text, severity and
 * citation were always independent of `s`. Removing the score was
 * therefore a deletion, not a rewrite — the sentences a reader sees are
 * byte-identical to the ones v2.9 produced.
 *
 * What survives, because it was never about points: the criteria
 * registry (which owns severity, sentence and citation for PM2.5, CO,
 * formaldehyde and TVOC), data-sufficiency status, confidence, the
 * building-profile threshold overrides, and the two structural
 * condition flags `gate5` and `synergistic`.
 */

import { STD } from '../constants/standards'
import { evaluateCriteria, capSeverity, criterionById } from '../constants/criteria'

// A walkthrough reading is a grab sample. Named once so the criterion layer's
// determinative/indicative logic reads explicitly rather than by default.
const EVIDENCE_BASIS_WALKTHROUGH = 'screening_grab'
import { evaluateCategorySufficiency, evaluateAllSufficiency } from './sufficiency'
import { getConfidenceLevel } from './riskBands'
import { countFindings } from '../utils/assessmentVerdict'
import { resolveAssessmentDate } from '../utils/assessmentDate'
import { getBuildingProfile, getRHOverride, getTempOverride, getACHOverride, getProfileContextFindings } from './buildingProfiles'

/**
 * The ONE numeric parser every reading goes through (audit 2026-09, H1).
 *
 * Returns a finite number or null. Accepts plain numbers and numeric strings,
 * including thousands separators ('1,180'). Rejects everything else — '<5',
 * '>x', 'abc', '', undefined, booleans — as null rather than as NaN or 0.
 *
 * Before this, every branch read `+d.co2`, so `'abc'` became NaN, every
 * comparison against it was false, and the zone fell through to the `pass`
 * tier: a garbage reading scored as a clean one. `reportModel.num()` imports
 * this same function so the results table and the engine cannot disagree
 * about what a cell says.
 */
export function readNumber(raw) {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null
  // Optional sign; digits with optional 3-digit groups; optional decimals.
  if (!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d*)?$/.test(s) || !/\d/.test(s)) return null
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Was the field ENTERED at all? Distinguishes "not captured" (empty /
 * undefined — the existing sufficiency machinery handles that) from
 * "captured but unreadable" (a non-numeric string), which is a DATA GAP the
 * engine must state rather than silently pass.
 */
export function isEntered(raw) {
  if (raw === null || raw === undefined) return false
  if (typeof raw === 'string') return raw.trim() !== ''
  return true
}

// A reading that was entered but cannot be read as a number. Severity `info`
// — a data gap reduces confidence and never inflates concern — and the
// `dataGap` flag is what scoreZone and the report model key on. The raw text
// is deliberately NOT echoed: a garbage reading must not become a finding
// that states it.
function dataGapFinding(label, p) {
  return { t: `${label} reading entered but not numeric — Data Gap (not evaluated)`, sev: 'info', dataGap: true, p }
}

// ZONE_WEIGHTS lived here — the five category weights (25/25/20/15/15)
// that made the composite a WEIGHTED mean. Only one profile ever carried
// an override, and it left with the data-center module in 2026-08.

export function scoreZone(z, bldg) {
  const d = { ...bldg, ...z }
  const suff = evaluateAllSufficiency(d)
  const profile = getBuildingProfile(d.ft)
  const rhOvr = profile ? getRHOverride(profile, d.zone_subtype) : null
  const tempOvr = profile ? getTempOverride(profile, d.zone_subtype) : null
  const achOvr = profile ? getACHOverride(profile, d.zone_subtype) : null
  const rawCats = [assessVent(d, achOvr), assessCont(d), assessHVAC(d), assessComp(d), assessEnv(d, rhOvr, tempOvr)]
  // Append building-profile context findings
  if (profile) {
    const ctxFindings = getProfileContextFindings(profile, d)
    ctxFindings.forEach(f => { const cat = rawCats.find(c => c.l === 'Environment') || rawCats[4]; cat.r.push(f) })
  }
  // Sufficiency decides whether a category was ASSESSED, which is a
  // statement about the data collected and survives the score removal
  // unchanged. What went is the third state in between — "scored, but
  // capped because optional inputs were missing" — which only ever
  // described an arithmetic ceiling.
  //
  // A category with no data at all is a DATA_GAP, unless it produced a
  // critical finding or tripped the HVAC gate anyway: an observation
  // made without instruments is still an observation, and suppressing it
  // for want of a complete record would hide the worst thing in the
  // assessment.
  const cats = rawCats.map(c => {
    const cs = suff[c.l]
    if (cs && cs.isInsufficient) return { ...c, status: 'INSUFFICIENT', reason: cs.reason, sufficiency: cs }
    if (cs && cs.sufficiency === 0 && !c.gate5 && !c.r.some(r => r.sev === 'critical')) {
      return { ...c, status: 'DATA_GAP', reason: 'No category data collected', sufficiency: cs }
    }
    return { ...c, sufficiency: cs }
  })
  const assessed = cats.filter(c => c.status !== 'INSUFFICIENT' && c.status !== 'DATA_GAP')
  let confidence = getConfidenceLevel(suff._overall || 0)
  const ventCat = cats.find(c => c.l === 'Ventilation')
  const hvacCat = cats.find(c => c.l === 'HVAC')
  // Ventilation Confidence Cap: CO2/field-indicator-only caps at Moderate
  if (ventCat && !d.cfm_person && !d.ach && confidence === 'High') confidence = 'Medium'
  // Critical HVAC Condition caps confidence
  if (hvacCat?.gate5 && (confidence === 'High')) confidence = 'Medium'
  // HVAC admin gap (unknown maintenance) reduces confidence
  if (hvacCat?.adminGap && confidence === 'High') confidence = 'Medium'
  const insufficientCats = cats.filter(c => c.status === 'INSUFFICIENT' || c.status === 'DATA_GAP').map(c => c.l)
  // Data gaps reduce confidence; they never inflate concern. That includes a
  // reading that was entered but could not be read as a number (`dataGap`
  // findings) and a comfort band that could not be selected for want of a
  // survey date — both are gaps in the RECORD, same as an unknown
  // maintenance history.
  if (insufficientCats.length > 0 && confidence === 'High') confidence = 'Medium'
  if (cats.some(c => c.r.some(r => r.dataGap)) && confidence === 'High') confidence = 'Medium'
  return {
    cats,
    zoneName: z.zn || 'Zone',
    // `partialScore` kept its name through the removal on purpose: it is
    // read by hasPartialData() and by four renderers, and it never meant
    // "the score is partial" — it meant a category went unassessed.
    partialScore: insufficientCats.length > 0,
    confidence,
    sufficiency: suff,
    zoneSubtype: d.zone_subtype,
    insufficientCats,
    assessedCats: assessed.map(c => c.l),
    hvacAdminGap: hvacCat?.adminGap || false,
  }
}

/**
 * Roll the per-zone assessments into the site-level summary.
 *
 * This replaces `compositeScore`, which returned a 0-100 number, an
 * average, a worst zone, a risk band and the name of the rule that
 * produced them ('worst-zone-override' / 'weighted-mean-of-zones'). None
 * of that survives. What a reader needs from the site level is how many
 * zones were assessed, what was found across them, and how far the data
 * goes — so that is what this returns.
 *
 * Building confidence is still the LOWEST zone confidence: a building
 * cannot be better understood than its least-measured zone.
 */
export function summarizeAssessment(zoneAssessments) {
  if (!zoneAssessments || !zoneAssessments.length) return null
  const confOrder = { Insufficient: 0, Low: 1, Medium: 2, High: 3 }
  const confidence = zoneAssessments.reduce(
    (worst, z) => ((confOrder[z.confidence] ?? 0) < (confOrder[worst] ?? 0) ? z.confidence : worst),
    'High',
  )
  return {
    count: zoneAssessments.length,
    findings: countFindings(zoneAssessments),
    confidence,
    partialData: zoneAssessments.some(z => z.partialScore || (z.insufficientCats || []).length > 0),
  }
}

// Ventilation hierarchy per ASHRAE 62.1-2025; Persily 2022 caveat
function assessVent(d, achOverride) {
  const r = []
  const co2Ref = 'ASHRAE Position Document on Indoor CO₂ (2022)'
  const co2Caveat = 'CO₂ is a ventilation effectiveness indicator, not an air quality contaminant. No current ASHRAE standard establishes an indoor CO₂ limit (Persily, ASHRAE Journal 2021). The 700 ppm indoor-outdoor differential is a sedentary-office bioeffluent perception threshold from a since-removed informative appendix.'
  // Every reading through the one parser (H1). A field that was entered but
  // cannot be read is a data gap, stated as such; an empty field keeps the
  // "not captured" behaviour the sufficiency layer already handles.
  const cfm = readNumber(d.cfm_person), ach = readNumber(d.ach), v = readNumber(d.co2), co2o = readNumber(d.co2o)
  if (cfm == null && isEntered(d.cfm_person)) r.push(dataGapFinding('OA delivery (cfm/person)', 'cfm_person'))
  if (ach == null && isEntered(d.ach)) r.push(dataGapFinding('ACH', 'ach'))
  if (v == null && isEntered(d.co2)) r.push(dataGapFinding('CO₂', 'co2'))
  // An ACH reading is EVALUABLE only against a design requirement the
  // record actually carries — a building-profile override with a table
  // citation. The generic fallback that stood here (6 ACH for healthcare /
  // lab, 4 for everything else, cited "CDC/ASHRAE 170") was an unsourced
  // figure: 170's Table 7.1 ranges 2–20 by room type and states no generic
  // rate, and nothing publishes 4 ACH for an office. Without an override the
  // reading is reported, not judged (citations handoff §3; gap ledger in
  // tests/engine/citations-gap-ledger.ts).
  const achEvaluable = ach != null && achOverride != null && Number.isFinite(achOverride.min)
  const hasAirflow = cfm != null || achEvaluable
  if (cfm != null) {
    // `??`, not `||`: enclosed parking carries pp = 0 (62.1 gives it an area
    // rate only), and `|| 5` turned that genuine zero into an office rate.
    const req = STD.v.oa[d.su]?.pp ?? 5
    // Gap 11: value equal to minimum = "at minimum", not "marginally above".
    // Meeting the minimum exactly is COMPLIANT (audit M7) — the standard says
    // "not less than", so equality satisfies it — and is reported as such
    // rather than as a medium finding.
    if (cfm < req * 0.5)      { r.push({ t: `OA delivery ${cfm} cfm/person — critically below ASHRAE 62.1 minimum (${req})`, std: 'ASHRAE 62.1-2025', sev: 'critical' }) }
    else if (cfm < req)       { r.push({ t: `OA delivery ${cfm} cfm/person — below ASHRAE 62.1 minimum (${req})`, std: 'ASHRAE 62.1-2025', sev: 'high' }) }
    else if (cfm === req)     { r.push({ t: `OA delivery ${cfm} cfm/person — meets the ASHRAE 62.1 minimum (${req}) with no margin above it. Area component (Ra×Az) not captured — ventilation calc incomplete.`, std: 'ASHRAE 62.1-2025', sev: 'pass' }) }
    else if (cfm < req * 1.2) { r.push({ t: `OA delivery ${cfm} cfm/person — marginally above minimum (${req})`, std: 'ASHRAE 62.1-2025', sev: 'medium' }) }
    else                      { r.push({ t: `OA delivery ${cfm} cfm/person — exceeds ASHRAE 62.1 minimum (${req})`, std: 'ASHRAE 62.1-2025', sev: 'pass' }) }
  } else if (achEvaluable) {
    const achMin = achOverride.min
    const achStd = achOverride.label
    if (ach < achMin * 0.5) { r.push({ t: `ACH ${ach} — critically below minimum (${achMin})`, std: achStd, sev: 'critical' }) }
    else if (ach < achMin)  { r.push({ t: `ACH ${ach} — below minimum (${achMin})`, std: achStd, sev: 'high' }) }
    else if (ach === achMin){ r.push({ t: `ACH ${ach} — meets the minimum (${achMin}) with no margin above it`, std: achStd, sev: 'pass' }) }
    else                    { r.push({ t: `ACH ${ach} — meets or exceeds minimum (${achMin})`, std: achStd, sev: 'pass' }) }
  } else if (ach != null) {
    r.push({ t: `ACH ${ach} recorded — no design air-change requirement is recorded for this space type, so the reading is reported, not evaluated (Data Gap)`, sev: 'info', dataGap: true, p: 'ach' })
  }
  // CO₂ is evaluated against its criteria WHETHER OR NOT airflow was measured
  // (audit H4). It used to be demoted to an info-only "confirmatory" line the
  // moment cfm/person or ACH was present, so 3,000 ppm beside any airflow
  // figure produced no finding at all. Airflow findings are additional
  // evidence, not a replacement for the indicator.
  if (v != null) {
    const hasOutdoor = co2o != null
    const o = hasOutdoor ? co2o : STD.v.co2.base, df = v - o
    // CO₂ indexes outdoor-air delivery per occupant; it is not a contaminant
    // measure, and no concentration of it alone is a critical finding. The cap
    // comes from the criterion class rather than a literal here, so this branch
    // cannot drift back to `critical` — which it was, rating a stuffy meeting
    // room the same as a hydrogen reading at 25% of the lower explosive limit.
    // Since the verdict layer escalates the whole assessment on any critical
    // finding, that miscalibration reached the report's triage priority.
    //
    // Tier order below the NIOSH indicator: a measured differential above
    // 500 ppm is `medium`; an absolute reading above 800 ppm with NO outdoor
    // baseline is `low`, stated with its limitation. The second tier was
    // unreachable until 2026-09 — the medium tier's condition swallowed it —
    // so an 850 ppm reading without a baseline was rated the same as one with
    // a measured differential behind it.
    if (v > STD.v.co2.act)                              { r.push({ t: 'CO₂ ' + v + ' ppm — severely elevated, indicating significant ventilation inadequacy. ' + co2Caveat, std: co2Ref, sev: capSeverity('critical', 'ventilation_indicator'), p: 'co2', cid: 'co2_action' }) }
    else if (df > STD.v.co2.diff || v > STD.v.co2.con) { r.push({ t: 'CO₂ ' + v + ' ppm (Δ' + df + ' ppm above outdoor) — ventilation rate appears inadequate for occupant load. ' + co2Caveat, std: co2Ref, sev: 'high', p: 'co2', cid: 'co2_concern' }) }
    else if (hasOutdoor && df > 500)                    { r.push({ t: 'CO₂ ' + v + ' ppm (Δ' + df + ' ppm above outdoor ' + o + ') — ventilation approaching concern for sedentary occupancy. ' + co2Caveat, std: co2Ref, sev: 'medium', p: 'co2', cid: 'co2_concern' }) }
    else if (!hasOutdoor && v > 800)                    { r.push({ t: 'CO₂ ' + v + ' ppm — approaching concern (no outdoor baseline for differential). ' + co2Caveat, std: co2Ref, sev: 'low', p: 'co2' }) }
    else r.push({ t: 'CO₂ ' + v + ' ppm' + (hasOutdoor ? ' (Δ' + df + ' ppm)' : '') + ' — within the reference range for ventilation adequacy. ' + co2Caveat, std: co2Ref, sev: 'pass', p: 'co2' })
    if (!hasAirflow) r.push({ t: 'Ventilation assessed from CO₂ only — Limited Confidence. CO₂ is a ventilation indicator and should not be interpreted as a contaminant measurement.', sev: 'info' })
  } else if (!hasAirflow) {
    let f = 0
    if (d.sa === 'No airflow detected') f += 3
    else if (d.sa === 'Weak / reduced') f += 2
    if (d.od === 'Closed / minimum' || d.od === 'Stuck / inoperable') f += 2
    if (d.cx === 'Yes — complaints reported' && (d.sy || []).some(s => ['Headache','Fatigue','Concentration issues'].includes(s))) f += 1
    if (f >= 4)      { r.push({ t: 'No airflow data — ventilation inadequacy inferred', sev: 'high' }) }
    else if (f >= 2) { r.push({ t: 'No airflow data — ventilation concern from observations', sev: 'medium' }) }
    else if (f >= 1) { r.push({ t: 'No airflow data — minor indicators observed', sev: 'low' }) }
    // An unreadable entered reading is already a data gap; it must not also
    // fall through to a `pass` line.
    else if (!r.some(x => x.dataGap)) r.push({ t: 'No airflow data — no ventilation concerns from indicators', sev: 'pass' })
  }
  return { l: 'Ventilation', r }
}

// The structured half of a criterion-backed finding. `classify.ts` and the
// report model read these instead of parsing the sentence.
function criterionFields(hit) {
  return {
    criterionClass: hit.criterion.class,
    averaging: hit.criterion.averaging,
    determinative: hit.determinative,
    evidenceBasis: EVIDENCE_BASIS_WALKTHROUGH,
  }
}

// Intake option keyword → [EPA (2008) size band, response severity]. The
// printed area is the intake option itself (`d.mi`), so it always matches
// what the assessor selected; this table only supplies the band label.
const MOLD_EXTENT_BANDS = [
  ['Extensive', '>100 ft²', 'critical'],
  ['Moderate', '10–100 ft²', 'high'],
  ['Small', '<10 ft²', 'medium'],
]
const MOLD_JURISDICTION = ' Consult applicable state and local regulations for jurisdiction-specific mold remediation requirements.'

function assessCont(d) {
  const r = []
  const pm = readNumber(d.pm), pmo = readNumber(d.pmo)
  if (pm == null && isEntered(d.pm)) r.push(dataGapFinding('PM2.5', 'pm25'))
  if (pm != null) {
    const v = pm, ho = pmo != null
    // PM2.5 evaluates through the shared criterion registry, the same way
    // CO, formaldehyde and TVOC do. It was the last parameter still
    // comparing against literals lifted out of STD, and it showed: the
    // finding read "PM2.5 38 µg/m³ — exceeds EPA 24-hr standard" from an
    // instantaneous reading, with none of the averaging-period caveat that
    // the registry gives every other analyte. A grab reading cannot
    // establish a 24-hour mean, and saying so is not a hedge — it is what
    // the measurement can and cannot settle.
    //
    // Severity, the sentence and the citation all come from the
    // criterion. The presence or absence of a concurrent outdoor reading
    // used to weight the deduction; with no deduction to weight, it is
    // said outright in the finding instead — which is where a reader
    // could act on it anyway.
    const hit = evaluateCriteria('pm25', v, EVIDENCE_BASIS_WALKTHROUGH)
    if (hit) {
      r.push({
        t: 'PM2.5 ' + hit.statement + (ho ? '' : ' No concurrent outdoor reading was taken, so the indoor elevation cannot be separated from ambient infiltration.'),
        std: hit.criterion.source,
        sev: hit.severity,
        p: 'pm25',
        cid: hit.criterion.id,
        ...criterionFields(hit),
      })
    }
    if (ho && pmo > 0) {
      const ioRatio = Math.round((v / pmo) * 100) / 100
      if (ioRatio > 2) r.push({ t: 'Indoor/outdoor PM2.5 ratio: ' + ioRatio + ' (>2.0 indicates significant indoor particulate source)', std: 'Chen & Zhao, Atmospheric Environment 2011', sev: 'medium', p:'pm25' })
      else if (ioRatio > 1) r.push({ t: 'Indoor/outdoor PM2.5 ratio: ' + ioRatio + ' (>1.0 indicates indoor contribution)', std: 'Chen & Zhao, Atmospheric Environment 2011', sev: 'info', p:'pm25' })
      else r.push({ t: 'Indoor/outdoor PM2.5 ratio: ' + ioRatio + ' (≤1.0 — no significant indoor source)', sev: 'pass', p:'pm25' })
    }
  }
  // CO and formaldehyde evaluate through the shared criterion registry
  // (constants/criteria.js), which carries each threshold's averaging period,
  // class and citation. Severity, the finding sentence and the caveat about
  // what a grab reading can settle all derive from the criterion — they are no
  // longer literals repeated at each branch, which is how the averaging-period
  // caveat came to be present on one branch and missing from the two above it.
  //
  // The structured criterion fields (`criterionClass`, `averaging`,
  // `determinative`, `evidenceBasis`) are load-bearing: since 2026-09
  // src/engine/bridge/classify.ts routes a contaminant finding on THEM, not
  // on whether 'osha' appears in `std` or the text — so a documented-PEL
  // condition type is reachable only when the criterion is an 8-hour TWA and
  // the measurement basis can settle it. Pinned by tests.
  const oelHits = []
  for (const [field, parameter, label] of [['co', 'co', 'CO'], ['hc', 'hcho', 'Formaldehyde']]) {
    const value = readNumber(d[field])
    if (value == null) { if (isEntered(d[field])) r.push(dataGapFinding(label, parameter)); continue }
    const hit = evaluateCriteria(parameter, value, EVIDENCE_BASIS_WALKTHROUGH)
    if (!hit) continue
    // A `critical` hit on CO or formaldehyde is a PEL / ceiling / STEL tier
    // (the registry orders worst-first); those are what the multi-contaminant
    // rule below counts. The class alone would also count a NIOSH REL or an
    // action-level hit, which is not what "exceedance" meant here.
    if (hit.severity === 'critical') oelHits.push({ label, hit })
    r.push({ t: label + ' ' + hit.statement, std: hit.criterion.source, sev: hit.severity, p: parameter, cid: hit.criterion.id, ...criterionFields(hit) })
  }
  // TVOC raises no finding, deliberately (2026-08). The branch that lived here
  // evaluated the reading against Mølhave's 1991 advisory tiers — the only
  // basis this platform ever had for judging a TVOC number, and a research
  // dose-response framework rather than a limit. Both criteria were removed,
  // so `evaluateCriteria('tvoc', …)` now returns null and the branch could
  // only ever have been dead code pretending to be a decision.
  //
  // The reading is still captured, still charted and still reported. It is
  // simply not compared to anything, because a non-specific sum with no
  // consensus health-based limit has nothing to be compared to. Speciation
  // (EPA TO-17) is what identifies the compounds that would.
  if (d.op === 'Strong / overpowering')    { r.push({ t:'Strong odor: '+((d.ot||[]).join(', ')||'?'), sev:'high' }) }
  else if (d.op === 'Moderate persistent') { r.push({ t:'Moderate odor', sev:'medium' }) }
  if (d.vd === 'Airborne haze' || d.vd === 'Heavy accumulation') { r.push({ t:d.vd, sev:'medium' }) }
  // Mold indicators. Under IICRC S520 (2015, reaffirmed 2024) ANY actual
  // growth is Condition 3; Condition 2 is settled spores without growth and
  // Condition 1 is normal ecology. Area never lowers the Condition — it sets
  // the response (severity) and the EPA (2008) remediation size band, which
  // is <10 / 10–100 / >100 ft². The previous text placed a 10–100 ft² area at
  // "Condition 2 likely", printed "10–30 sq ft" against an intake option that
  // says 10–100, and attributed a Level I–IV ladder to EPA that is NYC
  // DOHMH's. The mold module's own `remediationCondition.js` had this right;
  // the two engines now agree (parity test).
  if (d.mi && d.mi !== 'None' && d.mi !== 'Suspected discoloration') {
    const band = MOLD_EXTENT_BANDS.find(([key]) => d.mi.includes(key))
    if (band) {
      r.push({
        t: 'Visible mold growth (' + d.mi + ') — IICRC S520 Condition 3 (actual growth). Extent: ' + band[1] + ' per EPA (2008) size bands.' + MOLD_JURISDICTION,
        std: 'IICRC S520-2024; EPA Mold Remediation in Schools and Commercial Buildings (2008)',
        sev: band[2],
        moldCondition: 3,
        moldExtent: band[1],
      })
    }
  }
  // Multiple Contaminant Exceedance: more than one contaminant at a PEL-level
  // criterion. The comparison and the sentence come from the registry (H2):
  // a grab reading cannot "exceed an OSHA PEL", so the finding says what the
  // measurement basis can and cannot settle, and carries the structured
  // fields classify.ts routes on.
  const synergistic = oelHits.length >= 2
  if (synergistic) {
    const allDeterminative = oelHits.every(h => h.hit.determinative)
    const labels = oelHits.map(h => `${h.label} (${h.hit.criterion.label})`).join(' and ')
    r.push({
      t: 'Multiple Contaminant Exceedance: more than one contaminant reads above an occupational exposure limit — ' + labels
        + (allDeterminative ? '.' : '. A short-duration reading is indicative for these limits but cannot establish compliance with their averaging periods.')
        + ' Immediate Follow-Up Sampling Required',
      sev: 'critical',
      p: 'multi_oel',
      criterionClass: 'regulatory_oel',
      averaging: allDeterminative ? oelHits[0].hit.criterion.averaging : 'hour8',
      determinative: allDeterminative,
      evidenceBasis: EVIDENCE_BASIS_WALKTHROUGH,
    })
  }
  if (!r.length) r.push({ t:'No contaminant concerns', sev:'pass' })
  return { l: 'Contaminants', r, synergistic }
}

// HVAC: physical hygiene > administrative history (EPA BAQ, CIH best practice)
function assessHVAC(d) {
  let r = [], gate5 = false, adminGap = false
  // Administrative — a documentation gap is a gap in the RECORD, so it sets
  // `adminGap` (which caps confidence) rather than raising a finding's
  // severity. That split predates the score removal and is why confidence
  // and severity stayed independent through it.
  if (d.hm === 'Within 6 months')     r.push({ t:'HVAC maintenance current', sev:'pass' })
  else if (d.hm === '6-12 months ago'){ r.push({ t:'HVAC maintenance 6–12 months ago', sev:'low' }) }
  else if (d.hm === 'Over 12 months') { r.push({ t:'HVAC maintenance overdue (>12 months)', sev:'medium' }) }
  else if (d.hm === 'Unknown')        { adminGap = true; r.push({ t:'HVAC maintenance history unknown — Data Gap (reduces confidence; not itself a physical deficiency)', sev:'info' }) }
  // Physical/Hygiene (high impact)
  if (d.fc === 'Heavily loaded' || d.fc === 'Damaged / Bypass') { r.push({ t:'Filter condition: '+d.fc.toLowerCase()+' — degraded filtration performance', sev:'high' }) }
  if (d.fm === 'No filter')           { gate5 = true; r.push({ t:'No filtration installed — Major HVAC Deficiency', sev:'critical' }) }
  if (d.sa === 'No airflow detected') { gate5 = true; r.push({ t:'No supply airflow detected — Critical HVAC Condition Identified', sev:'critical' }) }
  // The Legionella / ASHRAE 188 escalation was removed in 2026-08. It fired on
  // this one intake field and nothing else — no water system, no aerosol
  // pathway, no symptom, no building type. ASHRAE 188 scopes itself to
  // building water systems with a recognised aerosol transmission risk
  // (cooling towers, evaporative condensers, domestic hot water, decorative
  // fountains, misters); a low-temperature condensate drain pan is not one,
  // and answering a dropdown does not establish an exposure pathway.
  //
  // The phrase library reached this conclusion first and wrote it down —
  // `phrases/hvac.ts`, hvac_drain_pan_microbial_reservoir. But that entry only
  // governs renderClientReport / PrintReport, and the AtmosFlow DOCX (the only
  // client deliverable) takes `text: r.t` straight off this finding
  // (`report/reportModel.js` collectFindings). So the sentence one layer had
  // deliberately retired was still the one reaching clients. Same cross-layer
  // split as the 67–82°F comfort band: two layers, two answers, and the
  // unaudited one shipped.
  //
  // 188 also had no record behind it — absent from STANDARDS_MANIFEST,
  // criteria.js and standards-corpus.js alike — so the double-entry
  // reconciliation could not see it. The condition itself is real and keeps
  // both its severity and its `gate5` flag; only the escalation went. Nothing
  // replaces the citation: the corpus documents no drain-pan threshold, and a
  // finding with no citation is honest where an invented one is not.
  if (d.dp === 'Standing water' || d.dp === 'Bio growth observed') { gate5 = true; r.push({ t:'Drain pan: '+d.dp.toLowerCase()+' — Critical Moisture/Hygiene Deficiency. Potential microbial reservoir in the condensate pan.', sev:'critical' }) }
  // Critical HVAC Condition. The finding used to end "caps category at
  // 30%", which described what the condition did to the SCORE rather
  // than what it is. The condition is unchanged; only the sentence about
  // the arithmetic went.
  if (gate5) r.push({ t:'Critical HVAC Condition Identified: active physical deficiency in the air-handling system', sev:'critical' })
  if (!r.length) {
    const hasAnyData = d.hm || d.fc || d.sa || d.dp || d.fm
    r = [{ t: hasAnyData ? 'HVAC system conditions acceptable' : 'No HVAC system data collected', sev: hasAnyData ? 'pass' : 'info' }]
  }
  return { l: 'HVAC', r, gate5, adminGap }
}

function assessComp(d) {
  const r = []
  if (d.cx !== 'Yes — complaints reported') { r.push({ t:'No complaints', sev:'pass' }); return { l:'Complaints', r } }
  if (d.ac === 'More than 10' || d.ac === '6-10') { r.push({ t:d.ac+' occupants reporting symptoms', sev:'critical' }) }
  else if (d.ac === '3-5')                        { r.push({ t:'3–5 occupants reporting symptoms', sev:'high' }) }
  else if (d.ac === '1-2')                        { r.push({ t:'1–2 occupants reporting symptoms', sev:'medium' }) }
  // A blank or "Unknown" count is not "1–2 occupants". The complaint stands
  // at the floor severity a reported complaint carries; the count is a gap.
  else                                            { r.push({ t:'Complaints reported — number of affected occupants not captured (Data Gap)', sev:'medium', dataGap: true }) }
  if (d.sr === 'Yes — clear pattern') { r.push({ t:'Symptoms resolve away from building', sev:'high' }) }
  if (d.cc === 'Yes — this zone') r.push({ t:'Symptom clustering in this zone', sev:'medium' })
  if ((d.sy||[]).length) r.push({ t:'Symptoms: '+d.sy.join(', ').toLowerCase(), sev:'info' })
  return { l: 'Complaints', r }
}

/**
 * Thermal-comfort season for the ASHRAE 55 band.
 *
 * Approximating clothing insulation by calendar month is imprecise — May is
 * spring — but the imprecision was never the hazard. Reading the CLOCK was:
 * summer optimal is 73–79°F and winter 68.5–74°F, so a 76°F reading passes in
 * one and fails in the other. A report re-scored in November applied the
 * winter band to a survey done in October, and the same data produced a
 * different report depending on the day it was rendered.
 *
 * The date travels with the assessment. Callers pass the survey date. With
 * NO date this returns null — it does not read the clock (audit H5). The
 * "live walkthrough" case that justified the fallback also reached the
 * re-score path in AssessmentContext, so a report re-rendered in another
 * month silently changed band; the caller that genuinely is live passes
 * today explicitly, and every other caller states the gap.
 *
 * A date-only string (YYYY-MM-DD, what resolveAssessmentDate returns) is
 * read by its calendar month directly, so a UTC-midnight parse cannot roll
 * 1 May back into April in a western time zone.
 *
 * @param {string|Date|null|undefined} assessmentDate when the assessment was conducted
 * @returns {'summer'|'winter'|null}
 */
export function comfortSeason(assessmentDate) {
  if (assessmentDate === null || assessmentDate === undefined || assessmentDate === '') return null
  let m
  if (typeof assessmentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(assessmentDate.trim())) {
    m = Number(assessmentDate.trim().slice(5, 7)) - 1
    if (m < 0 || m > 11) return null
  } else {
    const d = new Date(assessmentDate)
    if (Number.isNaN(d.getTime())) return null   // unparseable → no season, not "today's"
    m = d.getMonth()
  }
  return m >= 4 && m <= 9 ? 'summer' : 'winter'
}

/**
 * The survey date for scoring, as YYYY-MM-DD or null. Reads, in order:
 * `assessmentDate` riding on the building object (MobileApp passes it), then
 * `presurvey.ps_survey_date` / `ts` if the caller handed the whole record
 * through — the same resolution `resolveAssessmentDate` applies for the
 * report, so both surfaces answer the question identically.
 */
export function resolveScoringDate(d) {
  const ad = d && d.assessmentDate
  if (ad instanceof Date) return Number.isNaN(ad.getTime()) ? null : ad.toISOString().slice(0, 10)
  if (typeof ad === 'string' && ad.trim()) {
    const iso = resolveAssessmentDate({ presurvey: { ps_survey_date: ad } })
    if (iso) return iso
  }
  return resolveAssessmentDate(d)
}

function assessEnv(d, rhOverride, tempOverride) {
  const r = []
  // `d` is { ...bldg, ...zone }, so the date rides in on the building object
  // without changing any scoreZone call site.
  const ssn = comfortSeason(resolveScoringDate(d))
  const t = readNumber(d.tf)
  if (t == null && isEntered(d.tf)) r.push(dataGapFinding('Temperature', 'temperature'))
  // A profile override supplies its own band; otherwise the band is seasonal
  // and needs a date. With no date the engine states the gap rather than
  // guessing a season from the clock (H5).
  const needsSeason = tempOverride?.min == null || tempOverride?.max == null
  if (t != null && needsSeason && !ssn) {
    r.push({
      t: 'Temperature ' + t + '°F recorded — assessment date not recorded, so the ASHRAE 55 seasonal comfort band cannot be selected (Data Gap; not evaluated)',
      std: STD.t.ref, sev: 'info', p: 'temperature', dataGap: true,
    })
  } else if (t != null) {
    const tMin = tempOverride?.min ?? STD.t.temp[ssn].min
    const tMax = tempOverride?.max ?? STD.t.temp[ssn].max
    const tLabel = tempOverride?.label || 'ASHRAE 55'
    const tStd = tempOverride ? tempOverride.label : STD.t.ref
    // The registry criterion for this season. It is the source of the SEVERITY
    // CEILING and the citation; the band still comes from the override chain
    // above, because a building profile may narrow it for a specialty
    // occupancy and the registry does not know about profiles.
    //
    // Reading the cap from the registry rather than writing `sev:'medium'`
    // here is the whole point of bringing temperature into it: this branch
    // wrote `sev:'high'` for four months while CRITERION_CLASS.comfort_consensus
    // declared a ceiling of `medium`, and nothing could see the disagreement
    // because the branch was not governed by a criterion at all.
    const tCrit = ssn ? criterionById('temp', `temp_ashrae55_${ssn}`) : null
    const tSev = capSeverity('medium', tCrit ? tCrit.class : 'comfort_consensus')
    const ssnLabel = ssn ? ssn + ' ' : ''
    // One comparison, one severity. There used to be two — an outer
    // "acceptable" band at `high` and an inner "optimal" band at `low` — and
    // both halves were wrong. ASHRAE 55 states one acceptability criterion,
    // so the inner tier was inventing a distinction the standard does not
    // draw; and `high` breaks the ceiling the criterion class already sets,
    // since `comfort_consensus` caps at `medium` precisely because a comfort
    // consensus standard is not a health or regulatory limit. See STD.t in
    // constants/standards.js for the full account and for the three
    // qualifiers that travel with the band.
    if (t < tMin || t > tMax) {
      r.push({
        t: 'Temperature '+t+'°F — outside the '+tMin+'–'+tMax+'°F '+ssnLabel+'comfort range ('+tLabel+')',
        std: tStd, sev: tSev, p: 'temperature', cid: tCrit ? tCrit.id : null,
        criterionClass: 'comfort_consensus', averaging: 'instantaneous', determinative: true, evidenceBasis: EVIDENCE_BASIS_WALKTHROUGH,
        band: [tMin, tMax], bandUnit: '°F', bandLabel: tLabel+' comfort range'+(ssn ? ' ('+ssn+')' : ''),
      })
    }
  } else if (!isEntered(d.tf) && (d.tc === 'Too hot' || d.tc === 'Too cold')) { r.push({ t:'Thermal discomfort: '+d.tc.toLowerCase(), sev:'medium' }) }
  // RH scoring with building-profile override where the occupancy defines one
  const rhMin = rhOverride?.min ?? STD.t.rh.min
  const rhMax = rhOverride?.max ?? STD.t.rh.max
  const rhCrit = criterionById('rh', 'rh_epa_moisture_control')
  const rhLabel = rhOverride?.label || 'recommended range'
  // Reader-facing name for the band, used when the report cites what a
  // humidity finding rests on. `rhLabel` reads as prose mid-sentence but not
  // as a criterion name in a table column.
  //
  // The citation is STD.t.rh.ref, NOT STD.t.ref. This band is EPA
  // moisture-control guidance; it was attributed to ASHRAE 55 until 2026-08
  // purely because it sat inside the `STD.t` object and inherited its `ref`.
  // See the note on STD.t.rh in constants/standards.js.
  const rhBandLabel = rhOverride?.label || 'moisture-control range'
  const rh = readNumber(d.rh)
  if (rh == null && isEntered(d.rh)) r.push(dataGapFinding('RH', 'rh'))
  if (rh != null) {
    const v = rh
    // One severity. There used to be a `high` tier beyond 70% / below 20%,
    // but `comfort_consensus` caps at `medium`, so the branch could never
    // produce it — a dead tier that read as if it did. The cap is the rule.
    if (v < rhMin || v > rhMax) { r.push({ t:'RH '+v+'% — outside '+rhMin+'–'+rhMax+'% '+rhLabel, std: rhOverride ? rhOverride.label : STD.t.rh.ref, sev: capSeverity('medium', rhCrit ? rhCrit.class : 'comfort_consensus'), p:'rh', cid: rhCrit ? rhCrit.id : null, criterionClass: 'comfort_consensus', averaging: 'instantaneous', determinative: true, evidenceBasis: EVIDENCE_BASIS_WALKTHROUGH, band:[rhMin,rhMax], bandUnit:'%', bandLabel:rhBandLabel }) }
  } else if (!isEntered(d.rh) && (d.hp === 'Too humid / stuffy' || d.hp === 'Too dry')) { r.push({ t:'Humidity concern: '+d.hp.toLowerCase(), sev:'medium' }) }
  if (d.wd === 'Extensive damage')  { r.push({ t:'Extensive water damage', sev:'critical' }) }
  else if (d.wd === 'Active leak')  { r.push({ t:'Active water intrusion', sev:'high' }) }
  else if (d.wd === 'Old staining') { r.push({ t:'Historical water staining', sev:'low' }) }
  if (!r.length) r.push({ t:'Environmental conditions acceptable', sev:'pass' })
  return { l: 'Environment', r }
}

export { evalOSHA, calcVent, genRecs, evalMeasurementConfidence, evalMold, detectSBSPattern } from './scoring-legacy'
