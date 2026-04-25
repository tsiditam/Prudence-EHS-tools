/**
 * AtmosFlow Scoring Engine v2.3
 * Sufficiency-aware deterministic scoring. Missing data → INSUFFICIENT, not full credit.
 */

import { STD } from '../constants/standards'
import { evaluateCategorySufficiency, evaluateAllSufficiency } from './sufficiency'
import { getRiskBand, getConfidenceLevel } from './riskBands'
import { getBuildingProfile, getRHOverride, getProfileContextFindings } from './buildingProfiles'

// Zone-specific weights: data_hall uses equipment-focused weighting
const ZONE_WEIGHTS = {
  data_hall: { Ventilation: 15, Contaminants: 40, HVAC: 30, Complaints: 0, Environment: 15 },
  default:   { Ventilation: 25, Contaminants: 25, HVAC: 20, Complaints: 15, Environment: 15 },
}

function getZoneWeights(zoneSubtype) {
  return ZONE_WEIGHTS[zoneSubtype] || ZONE_WEIGHTS.default
}

export function scoreZone(z, bldg) {
  const d = { ...bldg, ...z }
  const suff = evaluateAllSufficiency(d)
  const profile = getBuildingProfile(d.ft)
  const rhOvr = profile ? getRHOverride(profile, d.zone_subtype) : null
  const weights = getZoneWeights(d.zone_subtype)
  const rawCats = [scoreVent(d), scoreCont(d), scoreHVAC(d), scoreComp(d), scoreEnv(d, rhOvr)]
  // Apply zone-specific weights (preserve original max for sufficiency scaling)
  rawCats.forEach(c => { c.origMx = c.mx; c.mx = weights[c.l] ?? c.mx; if (weights[c.l] === 0) { c.s = 0; c.suppressed = true } })
  // Rescale scores to new max when weights differ from default
  rawCats.forEach(c => {
    if (!c.suppressed && c.mx !== ZONE_WEIGHTS.default[c.l]) {
      const defaultMax = ZONE_WEIGHTS.default[c.l]
      c.s = defaultMax > 0 ? Math.round((c.s / defaultMax) * c.mx) : 0
    }
  })
  // Append building-profile context findings
  if (profile) {
    const ctxFindings = getProfileContextFindings(profile, d)
    ctxFindings.forEach(f => { const cat = rawCats.find(c => c.l === 'Environment') || rawCats[4]; cat.r.push(f) })
  }
  const cats = rawCats.map(c => {
    if (c.suppressed) return { ...c, status: 'SUPPRESSED' }
    const cs = suff[c.l]
    if (cs && cs.isInsufficient) return { ...c, s: null, status: 'INSUFFICIENT', reason: cs.reason, sufficiency: cs }
    if (cs && cs.maxAwardable === 0) {
      if (c.gate5 || c.r.some(r => r.sev === 'critical')) return { ...c, s: 0, sufficiency: cs, capped: true }
      return { ...c, s: null, status: 'DATA_GAP', reason: 'No category data collected', sufficiency: cs }
    }
    const scaledMaxAw = (c.origMx && c.origMx !== c.mx) ? Math.round((cs.maxAwardable / c.origMx) * c.mx) : cs.maxAwardable
    if (cs && scaledMaxAw < c.mx) return { ...c, s: Math.min(c.s, scaledMaxAw), sufficiency: cs, capped: true }
    return { ...c, sufficiency: cs }
  })
  const scorable = cats.filter(c => c.s !== null && c.status !== 'SUPPRESSED')
  let tot = scorable.length > 0 ? scorable.reduce((a, c) => a + c.s, 0) : null
  // Normalize against available max when categories have insufficient data
  // Missing data reduces confidence, not inflates risk
  const availableMax = scorable.reduce((a, c) => a + c.mx, 0)
  let normalizedFrom = null
  if (availableMax > 0 && availableMax < 100 && tot !== null) {
    normalizedFrom = tot
    tot = Math.round((tot / availableMax) * 100)
  }
  // Critical Concern Override: G3/GX corrosion or ISO Class 8 failure forces score < 50
  if (d.zone_subtype === 'data_hall') {
    if (d.gaseous_corrosion && (d.gaseous_corrosion.includes('G3') || d.gaseous_corrosion.includes('GX'))) {
      tot = tot !== null ? Math.min(tot, 39) : 39
      cats.find(c => c.l === 'Contaminants')?.r.push({ t: `Gaseous corrosion ${d.gaseous_corrosion} — Critical Concern Override applied per ISA-71.04`, std: 'ANSI/ISA 71.04-2013', sev: 'critical' })
    }
    if (d.iso_class === 'ISO Class 8') {
      tot = tot !== null ? Math.min(tot, 39) : 39
      cats.find(c => c.l === 'Contaminants')?.r.push({ t: 'ISO 14644-1 Class 8 particle limit exceeded — Critical Concern Override applied', std: 'ISO 14644-1:2015', sev: 'critical' })
    }
  }
  // Category lookups for overrides
  const contCat = cats.find(c => c.l === 'Contaminants')
  const hvacCat = cats.find(c => c.l === 'HVAC')
  const ventCat = cats.find(c => c.l === 'Ventilation')
  // Multiple Contaminant Exceedance Rule: multiple Tier 1 PEL exceedances → force Critical
  if (contCat?.synergistic && tot !== null) tot = Math.min(tot, 39)
  // Critical HVAC Condition Override → force zone below 50
  if (hvacCat?.gate5 && tot !== null) tot = Math.min(tot, 40)
  const band = getRiskBand(tot)
  let confidence = getConfidenceLevel(suff._overall || 0)
  // Ventilation Confidence Cap: CO2/field-indicator-only caps at Moderate
  if (ventCat && !d.cfm_person && !d.ach && confidence === 'High') confidence = 'Medium'
  // Critical HVAC Condition caps confidence
  if (hvacCat?.gate5 && (confidence === 'High')) confidence = 'Medium'
  // HVAC admin gap (unknown maintenance) reduces confidence
  if (hvacCat?.adminGap && confidence === 'High') confidence = 'Medium'
  // Data gaps reduce confidence, not risk
  if (normalizedFrom !== null && confidence === 'High') confidence = 'Medium'
  const insufficientCats = cats.filter(c => c.status === 'INSUFFICIENT' || c.status === 'DATA_GAP').map(c => c.l)
  return { tot, risk: band.label, rc: band.color, cats, zoneName: z.zn || 'Zone', partialScore: cats.some(c => c.status === 'INSUFFICIENT' || c.status === 'DATA_GAP'), confidence, sufficiency: suff, zoneSubtype: d.zone_subtype, weights, normalizedFrom, availableMax, insufficientCats, hvacAdminGap: hvacCat?.adminGap || false }
}

// Zone-type priority weights for composite calculation
// Mission-critical zones carry more weight than support spaces
const ZONE_PRIORITY_WEIGHTS = {
  data_hall: 1.5,
  battery_room: 1.3,
  noc_office: 1.0,
  mechanical: 0.8,
  office: 0.8,
  default: 1.0,
}

// Composite per AIHA exposure assessment strategy (Bullock & Ignacio, 2015)
// with zone-type priority weighting for mixed-use buildings
export function compositeScore(zoneScores) {
  if (!zoneScores.length) return null
  const scorable = zoneScores.filter(z => z.tot !== null)
  if (!scorable.length) return { tot: null, avg: null, worst: null, risk: 'Insufficient Data', rc: '#6B7380', count: zoneScores.length, logic: 'no-scorable-zones', rationale: 'No zones have sufficient data for scoring.', partialComposite: true }
  // Weighted average: mission-critical zones count more
  let totalWeight = 0, weightedSum = 0
  scorable.forEach(z => {
    const w = ZONE_PRIORITY_WEIGHTS[z.zoneSubtype] || ZONE_PRIORITY_WEIGHTS.default
    totalWeight += w
    weightedSum += z.tot * w
  })
  const avg = Math.round(weightedSum / totalWeight)
  const worst = Math.min(...scorable.map(z => z.tot))
  const hasCritical = scorable.some(z => getRiskBand(z.tot).id === 'CRITICAL')
  const comp = hasCritical ? worst : avg
  const logic = hasCritical ? 'worst-zone-override' : 'weighted-mean-of-zones'
  const rationale = hasCritical
    ? 'AIHA exposure assessment strategy: worst-case zone drives composite when any zone is Critical.'
    : 'No Critical zones; composite reflects priority-weighted mean (mission-critical zones weighted 1.5x).'
  const band = getRiskBand(comp)
  const partialComposite = scorable.length < zoneScores.length
  // Building confidence = lowest zone confidence (cannot claim High if riskiest zone wasn't fully tested)
  const confOrder = { 'Insufficient': 0, 'Low': 1, 'Medium': 2, 'High': 3 }
  const worstConfidence = scorable.reduce((w, z) => (confOrder[z.confidence] || 0) < (confOrder[w] || 0) ? z.confidence : w, 'High')
  return { tot: comp, avg, worst, risk: band.label, rc: band.color, count: zoneScores.length, logic, rationale, partialComposite, confidence: worstConfidence }
}

// Ventilation hierarchy per ASHRAE 62.1-2022; Persily 2022 caveat
function scoreVent(d) {
  let s = 25, r = []
  const co2Caveat = 'CO₂ is a ventilation effectiveness indicator, not a standalone air quality metric per ASHRAE 62.1-2022.'
  if (d.cfm_person) {
    const cfm = +d.cfm_person, req = STD.v.oa[d.su]?.pp || 5
    // Gap 11: value equal to minimum = "at minimum", not "marginally above"
    if (cfm < req * 0.5)      { s = 0;  r.push({ t: `OA delivery ${cfm} cfm/person — critically below ASHRAE 62.1 minimum (${req})`, std: 'ASHRAE 62.1-2022', sev: 'critical' }) }
    else if (cfm < req)       { s = 10; r.push({ t: `OA delivery ${cfm} cfm/person — below ASHRAE 62.1 minimum (${req})`, std: 'ASHRAE 62.1-2022', sev: 'high' }) }
    else if (cfm === req)     { s = 20; r.push({ t: `OA delivery ${cfm} cfm/person — at ASHRAE 62.1 minimum (${req}). Area component (Ra×Az) not captured — ventilation calc incomplete.`, std: 'ASHRAE 62.1-2022', sev: 'medium' }) }
    else if (cfm < req * 1.2) { s = 20; r.push({ t: `OA delivery ${cfm} cfm/person — marginally above minimum (${req})`, std: 'ASHRAE 62.1-2022', sev: 'medium' }) }
    else                      { r.push({ t: `OA delivery ${cfm} cfm/person — exceeds ASHRAE 62.1 minimum (${req})`, std: 'ASHRAE 62.1-2022', sev: 'pass' }) }
    if (d.co2) r.push({ t: `CO₂ ${d.co2} ppm (confirmatory). ${co2Caveat}`, std: STD.v.ref, sev: 'info' })
  } else if (d.ach) {
    const ach = +d.ach, achMin = (d.su === 'healthcare' || d.su === 'lab') ? 6 : 4
    if (ach < achMin * 0.5) { s = 5;  r.push({ t: `ACH ${ach} — critically below minimum (${achMin})`, std: 'CDC/ASHRAE 170', sev: 'critical' }) }
    else if (ach < achMin)  { s = 12; r.push({ t: `ACH ${ach} — below minimum (${achMin})`, std: 'CDC/ASHRAE 170', sev: 'high' }) }
    else if (ach === achMin){ s = 20; r.push({ t: `ACH ${ach} — at minimum (${achMin})`, std: 'CDC/ASHRAE 170', sev: 'medium' }) }
    else                    { r.push({ t: `ACH ${ach} — meets or exceeds minimum (${achMin})`, std: 'CDC/ASHRAE 170', sev: 'pass' }) }
    if (d.co2) r.push({ t: `CO₂ ${d.co2} ppm (confirmatory). ${co2Caveat}`, std: STD.v.ref, sev: 'info' })
  } else if (d.co2) {
    const v = +d.co2, o = d.co2o ? +d.co2o : STD.v.co2.base, df = v - o
    if (v > STD.v.co2.act)                              { s = 0;  r.push({ t: 'CO₂ ' + v + ' ppm — severely elevated. ' + co2Caveat, std: STD.v.ref, sev: 'critical' }) }
    else if (df > STD.v.co2.diff || v > STD.v.co2.con) { s = 10; r.push({ t: 'CO₂ ' + v + ' ppm — exceeds screening threshold (Δ' + df + ' ppm). ' + co2Caveat, std: STD.v.ref, sev: 'high' }) }
    else if (v > 800)                                   { s = 20; r.push({ t: 'CO₂ ' + v + ' ppm — approaching concern. ' + co2Caveat, std: STD.v.ref, sev: 'medium' }) }
    else r.push({ t: 'CO₂ ' + v + ' ppm — within screening range. ' + co2Caveat, std: STD.v.ref, sev: 'pass' })
    r.push({ t: 'Ventilation scored from CO₂ only — Limited Confidence.', sev: 'info' })
  } else {
    let f = 0
    if (d.sa === 'No airflow detected') f += 3
    else if (d.sa === 'Weak / reduced') f += 2
    if (d.od === 'Closed / minimum' || d.od === 'Stuck / inoperable') f += 2
    if (d.cx === 'Yes — complaints reported' && (d.sy || []).some(s => ['Headache','Fatigue','Concentration issues'].includes(s))) f += 1
    if (f >= 4)      { s = 5;  r.push({ t: 'No airflow data — ventilation inadequacy inferred', sev: 'high' }) }
    else if (f >= 2) { s = 12; r.push({ t: 'No airflow data — ventilation concern from observations', sev: 'medium' }) }
    else if (f >= 1) { s = 18; r.push({ t: 'No airflow data — minor indicators observed', sev: 'low' }) }
    else r.push({ t: 'No airflow data — no ventilation concerns from indicators', sev: 'pass' })
  }
  return { s, mx: 25, l: 'Ventilation', r }
}

function scoreCont(d) {
  let dd = 0, r = []
  if (d.pm) {
    const v = +d.pm, ho = !!d.pmo
    if (v > STD.c.pm25.epa)      { dd += ho ? 12 : 8; r.push({ t: 'PM2.5 ' + v + ' µg/m³ — exceeds EPA 24-hr standard' + (ho?'':' (no outdoor baseline)'), std:'EPA NAAQS', sev:'high' }) }
    else if (v > STD.c.pm25.who) { dd += ho ? 6  : 4; r.push({ t: 'PM2.5 ' + v + ' µg/m³ — exceeds WHO guideline' + (ho?'':' (no outdoor baseline)'), std:'WHO AQG', sev:'medium' }) }
  }
  if (d.co) {
    const v = +d.co
    if (v > STD.c.co.osha)       { dd += 25; r.push({ t: 'CO ' + v + ' ppm — EXCEEDS OSHA PEL', std:'OSHA', sev:'critical' }) }
    else if (v > STD.c.co.niosh) { dd += 12; r.push({ t: 'CO ' + v + ' — exceeds NIOSH REL', std:'NIOSH', sev:'high' }) }
  }
  if (d.hc) {
    const v = +d.hc
    if (v > STD.c.hcho.osha)       { dd += 25; r.push({ t: 'Formaldehyde ' + v + ' ppm — exceeds OSHA PEL', std:'29 CFR 1910.1048', sev:'critical' }) }
    else if (v > STD.c.hcho.al)    { dd += 12; r.push({ t: 'Formaldehyde ' + v + ' ppm — exceeds OSHA action level', std:'29 CFR 1910.1048', sev:'high' }) }
    else if (v > STD.c.hcho.niosh) { dd += 6;  r.push({ t: 'Formaldehyde ' + v + ' ppm — exceeds NIOSH REL', std:'NIOSH REL', sev:'medium' }) }
  }
  if (d.tv) {
    const v = +d.tv, ho = !!d.tvo
    const tvocCaveat = ' TVOC is a screening indicator only. No regulatory limit exists for total VOCs.'
    if (v > STD.c.tvoc.act)      { dd += ho?15:10; r.push({ t:'TVOCs '+v+' µg/m³ — significantly elevated.'+tvocCaveat, sev:'high' }) }
    else if (v > STD.c.tvoc.con) { dd += ho?7:5;   r.push({ t:'TVOCs '+v+' µg/m³ — elevated.'+tvocCaveat, sev:'medium' }) }
  }
  if (d.op === 'Strong / overpowering')    { dd += 10; r.push({ t:'Strong odor: '+((d.ot||[]).join(', ')||'?'), sev:'high' }) }
  else if (d.op === 'Moderate persistent') { dd += 5;  r.push({ t:'Moderate odor', sev:'medium' }) }
  if (d.vd === 'Airborne haze' || d.vd === 'Heavy accumulation') { dd += 5; r.push({ t:d.vd, sev:'medium' }) }
  // Multiple Contaminant Exceedance: multiple Tier 1 contaminants exceeding OSHA PEL
  let tier1Count = 0
  if (d.co && +d.co > STD.c.co.osha) tier1Count++
  if (d.hc && +d.hc > STD.c.hcho.osha) tier1Count++
  const synergistic = tier1Count >= 2
  if (synergistic) { dd = 25; r.push({ t:'Multiple Contaminant Exceedance: More than one Tier 1 contaminant exceeds OSHA PELs — Immediate Follow-Up Sampling Required', sev:'critical' }) }
  if (!r.length) r.push({ t:'No contaminant concerns', sev:'pass' })
  return { s: Math.max(0, 25 - dd), mx: 25, l: 'Contaminants', r, synergistic }
}

// HVAC scoring: physical hygiene > administrative history (EPA BAQ, CIH best practice)
function scoreHVAC(d) {
  let s = 20, r = [], gate5 = false, adminGap = false
  // Administrative (lower impact — documentation gaps reduce confidence, not score)
  if (d.hm === 'Within 6 months')     r.push({ t:'HVAC maintenance current', sev:'pass' })
  else if (d.hm === '6-12 months ago'){ s -= 3;  r.push({ t:'HVAC maintenance 6–12 months ago', sev:'low' }) }
  else if (d.hm === 'Over 12 months') { s -= 5;  r.push({ t:'HVAC maintenance overdue (>12 months)', sev:'medium' }) }
  else if (d.hm === 'Unknown')        { adminGap = true; r.push({ t:'HVAC maintenance history unknown — Data Gap (confidence reduced, not scored as deficiency)', sev:'info' }) }
  // Physical/Hygiene (high impact)
  if (d.fc === 'Heavily loaded' || d.fc === 'Damaged / Bypass') { s -= 10; r.push({ t:'Filter condition: '+d.fc.toLowerCase()+' — degraded filtration performance', sev:'high' }) }
  if (d.fm === 'No filter')           { s -= 15; gate5 = true; r.push({ t:'No filtration installed — Major HVAC Deficiency', sev:'critical' }) }
  if (d.sa === 'No airflow detected') { s -= 20; gate5 = true; r.push({ t:'No supply airflow detected — Critical HVAC Condition Identified', sev:'critical' }) }
  if (d.dp === 'Standing water' || d.dp === 'Bio growth observed') { s -= 15; gate5 = true; r.push({ t:'Drain pan: '+d.dp.toLowerCase()+' — Critical Moisture/Hygiene Deficiency', sev:'critical' }) }
  // Critical HVAC Condition Override — cap at 30% of max
  if (gate5) { s = Math.min(s, Math.round(20 * 0.3)); r.push({ t:'Critical HVAC Condition Identified: active physical deficiency caps category at 30%', sev:'critical' }) }
  s = Math.max(0, s)
  if (!r.length) {
    const hasAnyData = d.hm || d.fc || d.sa || d.dp || d.fm
    r = [{ t: hasAnyData ? 'HVAC system conditions acceptable' : 'No HVAC system data collected', sev: hasAnyData ? 'pass' : 'info' }]
  }
  return { s, mx: 20, l: 'HVAC', r, gate5, adminGap }
}

function scoreComp(d) {
  let s = 15, r = []
  if (d.cx !== 'Yes — complaints reported') { r.push({ t:'No complaints', sev:'pass' }); return { s, mx:15, l:'Complaints', r } }
  if (d.ac === 'More than 10' || d.ac === '6-10') { s = 0;  r.push({ t:d.ac+' occupants reporting symptoms', sev:'critical' }) }
  else if (d.ac === '3-5')                        { s = 5;  r.push({ t:'3–5 occupants reporting symptoms', sev:'high' }) }
  else                                            { s = 10; r.push({ t:'1–2 occupants reporting symptoms', sev:'medium' }) }
  if (d.sr === 'Yes — clear pattern') { s = Math.max(0, s-3); r.push({ t:'Symptoms resolve away from building', sev:'high' }) }
  if (d.cc === 'Yes — this zone') r.push({ t:'Symptom clustering in this zone', sev:'medium' })
  if ((d.sy||[]).length) r.push({ t:'Symptoms: '+d.sy.join(', ').toLowerCase(), sev:'info' })
  return { s, mx: 15, l: 'Complaints', r }
}

function scoreEnv(d, rhOverride) {
  let dd = 0, r = []
  const ssn = new Date().getMonth() >= 4 && new Date().getMonth() <= 9 ? 'summer' : 'winter'
  if (d.tf) {
    const t = +d.tf, rng = STD.t.temp[ssn]
    if (t < rng.min || t > rng.max)        { dd += 5; r.push({ t:'Temperature '+t+'°F — outside comfort range (per ASHRAE 55)', std:STD.t.ref, sev:'high' }) }
    else if (t < rng.oMin || t > rng.oMax) { dd += 2; r.push({ t:'Temperature '+t+'°F — outside optimal (per ASHRAE 55)', std:STD.t.ref, sev:'low' }) }
  } else if (d.tc === 'Too hot' || d.tc === 'Too cold') { dd += 4; r.push({ t:'Thermal discomfort: '+d.tc.toLowerCase(), sev:'medium' }) }
  // RH scoring with building-profile override (e.g., data_hall: 20-60%)
  const rhMin = rhOverride?.min ?? STD.t.rh.min
  const rhMax = rhOverride?.max ?? STD.t.rh.max
  const rhLabel = rhOverride?.label || 'recommended range'
  if (d.rh) {
    const v = +d.rh
    if (v < rhMin || v > rhMax) { dd += 4; r.push({ t:'RH '+v+'% — outside '+rhMin+'–'+rhMax+'% '+rhLabel, std: rhOverride ? rhOverride.label : STD.t.ref, sev:v>70||v<20?'high':'medium' }) }
  } else if (d.hp === 'Too humid / stuffy' || d.hp === 'Too dry') { dd += 3; r.push({ t:'Humidity concern: '+d.hp.toLowerCase(), sev:'medium' }) }
  if (d.wd === 'Extensive damage')  { dd += 15; r.push({ t:'Extensive water damage', sev:'critical' }) }
  else if (d.wd === 'Active leak')  { dd += 10; r.push({ t:'Active water intrusion', sev:'high' }) }
  else if (d.wd === 'Old staining') { dd += 3;  r.push({ t:'Historical water staining', sev:'low' }) }
  if (!r.length) r.push({ t:'Environmental conditions acceptable', sev:'pass' })
  return { s: Math.max(0, 15-dd), mx: 15, l: 'Environment', r }
}

export { evalOSHA, calcVent, genRecs, evalMeasurementConfidence, evalMold, detectSBSPattern } from './scoring-legacy'
