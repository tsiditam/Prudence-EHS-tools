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

export function scoreZone(z, bldg) {
  const d = { ...bldg, ...z }
  const cats = [scoreVent(d), scoreCont(d), scoreHVAC(d), scoreComp(d), scoreEnv(d)]
  const tot = cats.reduce((a, c) => a + c.s, 0)
  let risk, rc
  if (tot >= 85)      { risk = 'Low Risk';  rc = '#22D3EE' }
  else if (tot >= 70) { risk = 'Moderate';  rc = '#FBBF24' }
  else if (tot >= 50) { risk = 'High Risk'; rc = '#FB923C' }
  else                { risk = 'Critical';  rc = '#EF4444' }
  return { tot, risk, rc, cats, zoneName: z.zn || 'Zone' }
}

// Composite per AIHA exposure assessment strategy (Bullock & Ignacio, 2015):
// worst-case zone drives composite when any zone is Critical.
export function compositeScore(zoneScores) {
  if (!zoneScores.length) return null
  const avg   = Math.round(zoneScores.reduce((a, z) => a + z.tot, 0) / zoneScores.length)
  const worst = Math.min(...zoneScores.map(z => z.tot))
  const tiers = zoneScores.map(z => z.risk)
  const hasCritical = tiers.some(t => t === 'Critical')
  const comp = hasCritical ? worst : avg
  const logic = hasCritical ? 'worst-zone-override' : 'mean-of-zones'
  const rationale = hasCritical
    ? 'AIHA exposure assessment strategy (Bullock & Ignacio, 2015): worst-case zone drives composite when any zone is Critical.'
    : 'No Critical zones present; composite reflects arithmetic mean of per-zone scores.'
  let risk, rc
  if (comp >= 85)      { risk = 'Low Risk';  rc = '#22D3EE' }
  else if (comp >= 70) { risk = 'Moderate';  rc = '#FBBF24' }
  else if (comp >= 50) { risk = 'High Risk'; rc = '#FB923C' }
  else                 { risk = 'Critical';  rc = '#EF4444' }
  return { tot: comp, avg, worst, risk, rc, count: zoneScores.length, logic, rationale }
}

// Ventilation hierarchy per ASHRAE 62.1-2022 Table 6.2.2.1; Persily 2022 caveat applied.
// Priority: cfm/person > ACH > CO₂ (confirmatory only when cfm/ACH available)
function scoreVent(d) {
  let s = 25, r = []
  const co2Caveat = 'CO₂ is a ventilation effectiveness indicator, not a standalone air quality metric per ASHRAE 62.1-2022.'

  if (d.cfm_person) {
    // Primary: outdoor air delivery vs ASHRAE 62.1-2022 Table 6.2.2.1
    const cfm = +d.cfm_person
    const req = STD.v.oa[d.su]?.pp || 5
    if (cfm < req * 0.5)       { s = 0;  r.push({ t: `OA delivery ${cfm} cfm/person — critically below ASHRAE 62.1 minimum (${req} cfm/person)`, std: 'ASHRAE 62.1-2022', sev: 'critical' }) }
    else if (cfm < req)        { s = 10; r.push({ t: `OA delivery ${cfm} cfm/person — below ASHRAE 62.1 minimum (${req} cfm/person)`, std: 'ASHRAE 62.1-2022', sev: 'high' }) }
    else if (cfm < req * 1.2)  { s = 20; r.push({ t: `OA delivery ${cfm} cfm/person — marginally above minimum (${req} cfm/person)`, std: 'ASHRAE 62.1-2022', sev: 'medium' }) }
    else                       { r.push({ t: `OA delivery ${cfm} cfm/person — meets ASHRAE 62.1 minimum (${req} cfm/person)`, std: 'ASHRAE 62.1-2022', sev: 'pass' }) }
    // CO₂ as confirmatory only
    if (d.co2) r.push({ t: `CO₂ ${d.co2} ppm (confirmatory). ${co2Caveat}`, std: STD.v.ref, sev: 'info' })
  } else if (d.ach) {
    // Secondary: air changes per hour
    const ach = +d.ach
    const achMin = (d.su === 'healthcare' || d.su === 'lab') ? 6 : 4
    if (ach < achMin * 0.5)    { s = 5;  r.push({ t: `ACH ${ach} — critically below minimum (${achMin} ACH)`, std: 'CDC/ASHRAE 170', sev: 'critical' }) }
    else if (ach < achMin)     { s = 12; r.push({ t: `ACH ${ach} — below recommended minimum (${achMin} ACH)`, std: 'CDC/ASHRAE 170', sev: 'high' }) }
    else                       { r.push({ t: `ACH ${ach} — meets or exceeds minimum (${achMin} ACH)`, std: 'CDC/ASHRAE 170', sev: 'pass' }) }
    if (d.co2) r.push({ t: `CO₂ ${d.co2} ppm (confirmatory). ${co2Caveat}`, std: STD.v.ref, sev: 'info' })
  } else if (d.co2) {
    // Tertiary: CO₂ with Limited Confidence badge
    const v = +d.co2, o = d.co2o ? +d.co2o : STD.v.co2.base, df = v - o
    if (v > STD.v.co2.act)                              { s = 0;  r.push({ t: 'CO₂ ' + v + ' ppm — severely elevated. ' + co2Caveat, std: STD.v.ref, sev: 'critical' }) }
    else if (df > STD.v.co2.diff || v > STD.v.co2.con) { s = 10; r.push({ t: 'CO₂ ' + v + ' ppm — exceeds ventilation screening threshold (Δ' + df + ' ppm). ' + co2Caveat, std: STD.v.ref, sev: 'high' }) }
    else if (v > 800)                                   { s = 20; r.push({ t: 'CO₂ ' + v + ' ppm — approaching concern level. ' + co2Caveat, std: STD.v.ref, sev: 'medium' }) }
    else r.push({ t: 'CO₂ ' + v + ' ppm — within screening range. ' + co2Caveat, std: STD.v.ref, sev: 'pass' })
    r.push({ t: 'Ventilation scored from CO₂ only — Limited Confidence. Where possible, evaluate cfm/person directly.', sev: 'info' })
  } else {
    let f = 0
    if (d.sa === 'No airflow detected') f += 3
    else if (d.sa === 'Weak / reduced') f += 2
    if (d.od === 'Closed / minimum' || d.od === 'Stuck / inoperable') f += 2
    if (d.cx === 'Yes — complaints reported' && (d.sy || []).some(s => ['Headache','Fatigue','Concentration issues'].includes(s))) f += 1
    if (f >= 4)      { s = 5;  r.push({ t: 'No airflow data — ventilation inadequacy inferred from field indicators', sev: 'high' }) }
    else if (f >= 2) { s = 12; r.push({ t: 'No airflow data — ventilation concern from field observations', sev: 'medium' }) }
    else if (f >= 1) { s = 18; r.push({ t: 'No airflow data — minor ventilation indicators observed', sev: 'low' }) }
    else r.push({ t: 'No airflow data — no ventilation concerns from field indicators', sev: 'pass' })
  }
  return { s, mx: 25, l: 'Ventilation', r }
}

function scoreCont(d) {
  let dd = 0, r = []
  if (d.pm) {
    const v = +d.pm, ho = !!d.pmo
    if (v > STD.c.pm25.epa)      { dd += ho ? 12 : 8; r.push({ t: 'PM2.5 ' + v + ' µg/m³ — exceeds EPA 24-hr standard' + (ho?'':' (outdoor baseline not recorded)'), std:'EPA NAAQS', sev:'high' }) }
    else if (v > STD.c.pm25.who) { dd += ho ? 6  : 4; r.push({ t: 'PM2.5 ' + v + ' µg/m³ — exceeds WHO guideline' + (ho?'':' (outdoor baseline not recorded)'), std:'WHO AQG', sev:'medium' }) }
  }
  if (d.co) {
    const v = +d.co
    if (v > STD.c.co.osha)       { dd += 25; r.push({ t: 'CO ' + v + ' ppm — EXCEEDS OSHA PEL', std:'OSHA', sev:'critical' }) }
    else if (v > STD.c.co.niosh) { dd += 12; r.push({ t: 'CO ' + v + ' — exceeds NIOSH REL', std:'NIOSH', sev:'high' }) }
  }
  if (d.hc) {
    const v = +d.hc
    if (v > STD.c.hcho.osha)       { dd += 25; r.push({ t: 'Formaldehyde ' + v + ' ppm — exceeds OSHA permissible exposure limit', std:'29 CFR 1910.1048', sev:'critical' }) }
    else if (v > STD.c.hcho.al)    { dd += 12; r.push({ t: 'Formaldehyde ' + v + ' ppm — exceeds OSHA action level', std:'29 CFR 1910.1048', sev:'high' }) }
    else if (v > STD.c.hcho.niosh) { dd += 6;  r.push({ t: 'Formaldehyde ' + v + ' ppm — exceeds NIOSH recommended exposure limit', std:'NIOSH REL', sev:'medium' }) }
  }
  if (d.tv) {
    const v = +d.tv, ho = !!d.tvo
    if (v > STD.c.tvoc.act)      { dd += ho?15:10; r.push({ t:'TVOCs '+v+' — significantly elevated'+(ho?'':' (no outdoor baseline)'), sev:'high' }) }
    else if (v > STD.c.tvoc.con) { dd += ho?7:5;   r.push({ t:'TVOCs '+v+' — elevated'+(ho?'':' (no outdoor baseline)'), sev:'medium' }) }
  }
  // Mold separated per AIHA 2020 guidance; drives IICRC S520 Conditions, not composite.
  // Mold findings are reported via evalMold() as a parallel panel.
  if (d.op === 'Strong / overpowering')    { dd += 10; r.push({ t:'Strong odor: '+((d.ot||[]).join(', ')||'?'), sev:'high' }) }
  else if (d.op === 'Moderate persistent') { dd += 5;  r.push({ t:'Moderate odor', sev:'medium' }) }
  if (d.vd === 'Airborne haze' || d.vd === 'Heavy accumulation') { dd += 5; r.push({ t:d.vd, sev:'medium' }) }
  if (!r.length) r.push({ t:'No contaminant concerns', sev:'pass' })
  return { s: Math.max(0, 25 - dd), mx: 25, l: 'Contaminants', r }
}

function scoreHVAC(d) {
  let s = 20, r = []
  if (d.hm === 'Within 6 months')     r.push({ t:'HVAC maintenance current (within 6 months)', sev:'pass' })
  else if (d.hm === '6-12 months ago'){ s -= 5;  r.push({ t:'HVAC maintenance 6–12 months ago', sev:'low' }) }
  else if (d.hm === 'Over 12 months') { s -= 15; r.push({ t:'HVAC maintenance overdue (>12 months)', sev:'high' }) }
  else if (d.hm === 'Unknown')        { s -= 20; r.push({ t:'HVAC maintenance history unknown', sev:'high' }) }
  if (d.fc === 'Heavily loaded' || d.fc === 'Damaged / Bypass') { s -= 5; r.push({ t:'Filter condition: '+d.fc.toLowerCase(), sev:'medium' }) }
  if (d.fm === 'No filter')           { s -= 8;  r.push({ t:'No filtration installed', sev:'high' }) }
  if (d.sa === 'No airflow detected') { s -= 8;  r.push({ t:'No supply airflow detected at diffuser', sev:'critical' }) }
  if (d.dp === 'Standing water' || d.dp === 'Bio growth observed') { s -= 5; r.push({ t:'Condensate drain pan: '+d.dp.toLowerCase(), sev:'medium' }) }
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
  if (d.sr === 'Yes — clear pattern') { s = Math.max(0, s-3); r.push({ t:'Symptoms resolve when away from building', sev:'high' }) }
  if (d.cc === 'Yes — this zone') r.push({ t:'Symptom clustering observed in this zone', sev:'medium' })
  if ((d.sy||[]).length) r.push({ t:'Reported symptoms: '+d.sy.join(', ').toLowerCase(), sev:'info' })
  return { s, mx: 15, l: 'Complaints', r }
}

function scoreEnv(d) {
  let dd = 0, r = []
  const ssn = new Date().getMonth() >= 4 && new Date().getMonth() <= 9 ? 'summer' : 'winter'
  if (d.tf) {
    const t = +d.tf, rng = STD.t.temp[ssn]
    if (t < rng.min || t > rng.max)        { dd += 5; r.push({ t:'Temperature '+t+'°F — outside recognized thermal comfort range (per ASHRAE 55)', std:STD.t.ref, sev:'high' }) }
    else if (t < rng.oMin || t > rng.oMax) { dd += 2; r.push({ t:'Temperature '+t+'°F — outside optimal comfort conditions (per ASHRAE 55)', std:STD.t.ref, sev:'low' }) }
  } else if (d.tc === 'Too hot' || d.tc === 'Too cold') { dd += 4; r.push({ t:'Occupant-reported thermal discomfort: '+d.tc.toLowerCase(), sev:'medium' }) }
  if (d.rh) {
    const v = +d.rh
    if (v < STD.t.rh.min || v > STD.t.rh.max) { dd += 4; r.push({ t:'Relative humidity '+v+'% — outside recommended range (30–60%)', std:STD.t.ref, sev:v>70||v<20?'high':'medium' }) }
  } else if (d.hp === 'Too humid / stuffy' || d.hp === 'Too dry') { dd += 3; r.push({ t:'Occupant-reported humidity concern: '+d.hp.toLowerCase(), sev:'medium' }) }
  if (d.wd === 'Extensive damage')  { dd += 15; r.push({ t:'Extensive water damage observed', sev:'critical' }) }
  else if (d.wd === 'Active leak')  { dd += 10; r.push({ t:'Active water intrusion observed', sev:'high' }) }
  else if (d.wd === 'Old staining') { dd += 3;  r.push({ t:'Historical water staining observed', sev:'low' }) }
  if (!r.length) r.push({ t:'Environmental conditions within acceptable range', sev:'pass' })
  return { s: Math.max(0, 15-dd), mx: 15, l: 'Environment', r }
}

export function evalOSHA(d, tot) {
  const fl = []
  if (d.cx === 'Yes — complaints reported' && tot < 70) fl.push('Documented complaint pattern with concurrent hazard indicators')
  if (d.co2 && +d.co2 > STD.v.co2.con)  fl.push('Ventilation-related concern pattern')
  if (d.wd === 'Active leak' || d.wd === 'Extensive damage' || (d.mi && !['None','Suspected discoloration'].includes(d.mi))) fl.push('Water/mold indicators present')
  if (d.sr === 'Yes — clear pattern' && (d.ac === 'More than 10' || d.ac === '6-10')) fl.push('Building-related symptom pattern — widespread')
  if (d.co && +d.co > STD.c.co.osha)   fl.push('CO measurement above OSHA PEL threshold')
  if (d.hc && +d.hc > STD.c.hcho.osha) fl.push('Formaldehyde measurement above OSHA PEL threshold')
  const hs = !!d.co2 || !!d.tf, hc = d.cx === 'Yes — complaints reported', hk = d.hm !== 'Unknown'
  const conf = (hs&&hc&&hk)?'High':[hs,hc,hk].filter(Boolean).length>=2?'Medium':'Limited'
  const gaps = []
  if (!hs) gaps.push('No instrument data')
  if (!hk) gaps.push('HVAC maintenance unknown')
  return { flag: fl.length > 0, fl, conf, gaps }
}

export function calcVent(su, sf, oc) {
  if (!su || !sf || !oc) return null
  const r = STD.v.oa[su]; if (!r) return null
  const pOA = r.pp * oc, aOA = r.ps * sf, tot = pOA + aOA
  return { pOA, aOA, tot, pp: tot / oc, ref: STD.v.ref }
}

export function genRecs(zoneScores, bldg) {
  const R = { imm: [], eng: [], adm: [], mon: [] }
  zoneScores.forEach(zs => {
    zs.cats.forEach(c => c.r.forEach(r => {
      if (r.sev === 'critical') {
        if (r.t.includes('CO '))   R.imm.push(zs.zoneName+': Immediately evacuate affected area and investigate potential combustion source. Ventilate space before reoccupancy.')
        if (r.t.includes('ormaldehyde'))  R.imm.push(zs.zoneName+': Implement exposure controls and initiate medical surveillance per 29 CFR 1910.1048 requirements.')
        if (r.t.toLowerCase().includes('mold') && r.t.includes('xtensive')) R.imm.push(zs.zoneName+': Engage qualified remediation contractor. Remediate per EPA Mold Remediation in Schools guidance and IICRC S520.')
        if (r.t.includes('No supply airflow')) R.imm.push('Request emergency HVAC service to restore supply airflow to affected zones.')
        if (r.t.includes('water'))      R.imm.push(zs.zoneName+': Identify and arrest active water intrusion. Assess affected materials for moisture damage within 48 hours.')
      }
      if (r.sev === 'high') {
        if (r.t.includes('CO₂') || r.t.includes('ventilation')) R.eng.push(zs.zoneName+': Evaluate outdoor air delivery rate and verify OA damper position. Measure supply and return airflow balance.')
        if (r.t.includes('PM'))         R.eng.push('Upgrade air filtration to MERV 13 or higher. Evaluate filter housing for bypass.')
        if (r.t.includes('maintenance')) R.eng.push('Schedule comprehensive HVAC system inspection including coil cleaning, belt check, and controls verification.')
        if (r.t.includes('mold'))       R.eng.push(zs.zoneName+': Conduct mold assessment per AIHA Recognition, Evaluation, and Control of Indoor Mold guidelines.')
        if (r.t.includes('occupants'))  R.adm.push(zs.zoneName+': Document affected occupant count and symptom patterns. Consider administering standardized symptom survey (e.g., EPA BASE protocol).')
      }
    }))
  })
  if (bldg.hm === 'Unknown') R.adm.push('Establish preventive HVAC maintenance schedule with documented service records.')
  R.mon.push('Conduct periodic reassessment to verify corrective action effectiveness and track IAQ trend data.')
  Object.keys(R).forEach(k => { R[k] = [...new Set(R[k])] })
  return R
}

// Mold separated per AIHA 2020; drives IICRC S520 Conditions, not composite.
export function evalMold(d) {
  if (!d.mi || d.mi === 'None') return null
  let condition, sqft = d.mia ? +d.mia : null, triggered = false
  if (d.mi.includes('Extensive'))          { condition = 3; triggered = true }
  else if (d.mi.includes('Moderate'))      { condition = (sqft && sqft >= 10) ? 3 : 2; triggered = condition >= 2 }
  else if (d.mi.includes('Small'))         { condition = (sqft && sqft >= 10) ? 2 : 1; triggered = condition >= 2 }
  else                                     { condition = 1; triggered = false }
  return {
    condition,
    label: `IICRC S520 Condition ${condition}`,
    sqft,
    investigationTriggered: triggered,
    visual: d.mi,
    caveat: 'Visual observation only — not confirmed by sampling',
  }
}