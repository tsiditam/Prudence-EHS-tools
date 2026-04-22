/**
 * AtmosFlow Scoring Engine v2.3
 * Sufficiency-aware deterministic scoring. Missing data → INSUFFICIENT, not full credit.
 */

import { STD } from '../constants/standards'
import { evaluateCategorySufficiency, evaluateAllSufficiency } from './sufficiency'
import { getRiskBand, getConfidenceLevel } from './riskBands'
import { getBuildingProfile, getRHOverride, getProfileContextFindings } from './buildingProfiles'

export function scoreZone(z, bldg) {
  const d = { ...bldg, ...z }
  const suff = evaluateAllSufficiency(d)
  const profile = getBuildingProfile(d.ft)
  const rhOvr = profile ? getRHOverride(profile, d.zone_subtype) : null
  const rawCats = [scoreVent(d), scoreCont(d), scoreHVAC(d), scoreComp(d), scoreEnv(d, rhOvr)]
  // Append building-profile context findings to the appropriate category
  if (profile) {
    const ctxFindings = getProfileContextFindings(profile, d)
    ctxFindings.forEach(f => { const cat = rawCats.find(c => c.l === 'Environment') || rawCats[4]; cat.r.push(f) })
  }
  const cats = rawCats.map(c => {
    const cs = suff[c.l]
    if (cs && cs.isInsufficient) {
      return { ...c, s: null, status: 'INSUFFICIENT', reason: cs.reason, sufficiency: cs }
    }
    if (cs && cs.maxAwardable < c.mx) {
      return { ...c, s: Math.min(c.s, cs.maxAwardable), sufficiency: cs, capped: true }
    }
    return { ...c, sufficiency: cs }
  })
  const scorable = cats.filter(c => c.s !== null)
  const tot = scorable.length > 0 ? scorable.reduce((a, c) => a + c.s, 0) : null
  const band = getRiskBand(tot)
  const confidence = getConfidenceLevel(suff._overall || 0)
  return { tot, risk: band.label, rc: band.color, cats, zoneName: z.zn || 'Zone', partialScore: cats.some(c => c.status === 'INSUFFICIENT'), confidence, sufficiency: suff }
}

// Composite per AIHA exposure assessment strategy (Bullock & Ignacio, 2015)
export function compositeScore(zoneScores) {
  if (!zoneScores.length) return null
  const scorable = zoneScores.filter(z => z.tot !== null)
  if (!scorable.length) return { tot: null, avg: null, worst: null, risk: 'Insufficient Data', rc: '#6B7380', count: zoneScores.length, logic: 'no-scorable-zones', rationale: 'No zones have sufficient data for scoring.', partialComposite: true }
  const avg = Math.round(scorable.reduce((a, z) => a + z.tot, 0) / scorable.length)
  const worst = Math.min(...scorable.map(z => z.tot))
  const hasCritical = scorable.some(z => getRiskBand(z.tot).id === 'CRITICAL')
  const comp = hasCritical ? worst : avg
  const logic = hasCritical ? 'worst-zone-override' : 'mean-of-zones'
  const rationale = hasCritical
    ? 'AIHA exposure assessment strategy: worst-case zone drives composite when any zone is Critical.'
    : 'No Critical zones present; composite reflects arithmetic mean of per-zone scores.'
  const band = getRiskBand(comp)
  const partialComposite = scorable.length < zoneScores.length
  return { tot: comp, avg, worst, risk: band.label, rc: band.color, count: zoneScores.length, logic, rationale, partialComposite }
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
  if (!r.length) r.push({ t:'No contaminant concerns', sev:'pass' })
  return { s: Math.max(0, 25 - dd), mx: 25, l: 'Contaminants', r }
}

function scoreHVAC(d) {
  let s = 20, r = []
  if (d.hm === 'Within 6 months')     r.push({ t:'HVAC maintenance current', sev:'pass' })
  else if (d.hm === '6-12 months ago'){ s -= 5;  r.push({ t:'HVAC maintenance 6–12 months ago', sev:'low' }) }
  else if (d.hm === 'Over 12 months') { s -= 15; r.push({ t:'HVAC maintenance overdue (>12 months)', sev:'high' }) }
  else if (d.hm === 'Unknown')        { s -= 20; r.push({ t:'HVAC maintenance history unknown', sev:'high' }) }
  if (d.fc === 'Heavily loaded' || d.fc === 'Damaged / Bypass') { s -= 5; r.push({ t:'Filter condition: '+d.fc.toLowerCase(), sev:'medium' }) }
  if (d.fm === 'No filter')           { s -= 8;  r.push({ t:'No filtration installed', sev:'high' }) }
  if (d.sa === 'No airflow detected') { s -= 8;  r.push({ t:'No supply airflow detected', sev:'critical' }) }
  if (d.dp === 'Standing water' || d.dp === 'Bio growth observed') { s -= 5; r.push({ t:'Drain pan: '+d.dp.toLowerCase(), sev:'medium' }) }
  s = Math.max(0, s)
  if (!r.length) r = [{ t:'HVAC system conditions acceptable', sev:'pass' }]
  return { s, mx: 20, l: 'HVAC', r }
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
