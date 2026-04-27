/**
 * AtmosFlow Scoring — Legacy Helper Functions
 * evalOSHA, calcVent, genRecs, evalMeasurementConfidence, evalMold
 * Split from scoring.js to stay under 300-line limit.
 */

import { STD } from '../constants/standards'
import { getConfidenceLevel } from './riskBands'
import { evaluateAllSufficiency } from './sufficiency'

export function evalOSHA(d, tot) {
  const fl = []
  if (d.cx === 'Yes — complaints reported' && tot < 70) fl.push('Documented complaint pattern with concurrent hazard indicators')
  if (d.co2 && +d.co2 > STD.v.co2.con) fl.push('Ventilation-related concern pattern')
  if (d.wd === 'Active leak' || d.wd === 'Extensive damage' || (d.mi && !['None','Suspected discoloration'].includes(d.mi))) fl.push('Water/mold indicators present')
  if (d.sr === 'Yes — clear pattern' && (d.ac === 'More than 10' || d.ac === '6-10')) fl.push('Building-related symptom pattern — widespread')
  if (d.co && +d.co > STD.c.co.osha) fl.push('CO measurement above OSHA PEL threshold')
  if (d.hc && +d.hc > STD.c.hcho.osha) fl.push('Formaldehyde measurement above OSHA PEL threshold')
  const suff = evaluateAllSufficiency(d)
  const conf = getConfidenceLevel(suff._overall || 0)
  const gaps = []
  if (!d.co2 && !d.tf) gaps.push('No instrument data')
  if (!d.hm || d.hm === 'Unknown') gaps.push('HVAC maintenance unknown')
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
        if (r.t.includes('CO ')) R.imm.push(zs.zoneName+': Immediately evacuate and investigate combustion source.')
        if (r.t.includes('ormaldehyde')) R.imm.push(zs.zoneName+': Implement exposure controls per 29 CFR 1910.1048.')
        if (r.t.includes('No supply airflow')) R.imm.push('Request immediate HVAC service to restore airflow.')
        if (r.t.includes('No filtration') || r.t.includes('no filter')) R.imm.push('Request immediate HVAC service — no filtration installed.')
        if (r.t.includes('Drain pan')) R.imm.push(zs.zoneName+': Address drain pan condition immediately. Evaluate for microbial growth.')
        if (r.t.includes('water') || r.t.includes('leak')) R.imm.push(zs.zoneName+': Arrest water intrusion. Assess materials within 48 hours.')
        if (r.t.toLowerCase().includes('occupant') && r.t.includes('symptom')) R.imm.push(zs.zoneName+': Document symptom patterns using NIOSH IEQ questionnaire or equivalent structured instrument. Evaluate ventilation immediately.')
      }
      if (r.sev === 'high' || r.sev === 'medium') {
        if (r.t.includes('maintenance') && r.t.includes('overdue')) R.eng.push('Schedule comprehensive HVAC inspection within 24–72 hours when occupant symptoms are active.')
      }
      if (r.sev === 'high') {
        if (r.t.includes('CO₂') || r.t.includes('ventilation') || r.t.includes('OA delivery')) R.eng.push(zs.zoneName+': Evaluate outdoor air delivery rate and verify OA damper position within 24–72 hours.')
        if (r.t.includes('PM')) R.eng.push('Upgrade filtration to MERV 13+. Evaluate filter housing for bypass.')
        if (r.t.includes('maintenance')) R.eng.push('Schedule comprehensive HVAC inspection.')
        if (r.t.includes('ilter condition') || r.t.includes('filtration')) R.eng.push(zs.zoneName+': Replace or service air filters. Inspect filter housing for bypass or damage.')
        if (r.t.includes('Temperature') || r.t.includes('comfort range')) R.eng.push(zs.zoneName+': Evaluate thermostat settings and HVAC zoning for thermal comfort.')
        if (r.t.includes('occupant') || r.t.includes('symptom')) R.adm.push(zs.zoneName+': Document affected occupants using NIOSH IEQ questionnaire or equivalent structured symptom instrument.')
        if (r.t.includes('resolve')) R.adm.push(zs.zoneName+': Building-related symptom pattern — investigate ventilation and source pathways.')
      }
    }))
    // Water intrusion / mold / drain pan expanded recommendations
    const hasWater = zs.cats.some(c => c.r.some(r => r.t.includes('water') || r.t.includes('leak') || r.t.includes('Water')))
    const hasMold = zs.cats.some(c => c.r.some(r => r.t.toLowerCase().includes('mold')))
    const hasDrainPan = zs.cats.some(c => c.r.some(r => r.t.includes('Drain pan')))
    const hasSymptomCluster = zs.cats.some(c => c.l === 'Complaints' && c.r.some(r => r.sev === 'critical' || r.sev === 'high'))
    const hasFilterIssue = zs.cats.some(c => c.r.some(r => r.t.toLowerCase().includes('filter') && (r.sev === 'high' || r.sev === 'critical')))
    const hasNegPressure = zs.cats.some(c => c.r.some(r => r.t.includes('Negative') || r.t.includes('negative')))
    if (hasWater) R.imm.push(zs.zoneName+': Repair water intrusion source. Assess affected materials within 48 hours per IICRC S500.')
    if (hasMold) {
      R.eng.push(zs.zoneName+': Remediate visible mold per IICRC S520 / EPA Mold Remediation in Schools and Commercial Buildings. For areas <10 sq ft (Level I), trained maintenance staff with PPE (N95, gloves, eye protection) may perform cleanup.')
      R.eng.push(zs.zoneName+': Post-remediation verification per IICRC S520 — visual clearance and clearance air sampling before reoccupancy.')
    }
    if (hasDrainPan) {
      R.imm.push(zs.zoneName+': Clean drain pan, treat with EPA-registered biocide, and verify proper slope and condensate disposal.')
      R.eng.push(zs.zoneName+': Evaluate drain pan for Legionella risk per ASHRAE Standard 188. If building lacks a Water Management Program, consider Legionella sampling given active occupant respiratory symptoms.')
    }
    if (hasFilterIssue) R.imm.push(zs.zoneName+': Replace air filters immediately. Inspect filter housing for bypass or damage.')
    if (hasNegPressure) R.eng.push(zs.zoneName+': Correct building pressurization. Negative pressure draws contaminants from adjacent spaces and outdoor sources. Evaluate exhaust/supply balance.')
    if (hasSymptomCluster) {
      R.imm.push(zs.zoneName+': Deploy portable HEPA filtration units in affected occupied areas as interim measure.')
      R.adm.push(zs.zoneName+': Implement occupant risk communication plan per ATSDR guidance. Notify affected occupants of assessment findings and planned corrective actions.')
      R.adm.push(zs.zoneName+': Evaluate feasibility of temporary relocation for symptomatic occupants until corrective actions are verified effective.')
    }
    if (hasMold || hasWater) {
      R.adm.push(zs.zoneName+': Document loss and remediation scope for insurance notification.')
      R.mon.push(zs.zoneName+': Establish re-occupancy and clearance criteria. Post-remediation verification required before returning to normal operations.')
    }
    // Data center–specific recommendations matched to screening findings
    if (zs.zoneSubtype === 'data_hall') {
      const hasCorrosionRisk = zs.cats.some(c => c.r.some(r => r.t.includes('corrosion risk') || r.t.includes('71.04')))
      const hasParticleRisk = zs.cats.some(c => c.r.some(r => r.t.includes('ISO 14644') || r.t.includes('ISO Class')))
      if (hasCorrosionRisk || hasParticleRisk) {
        R.imm.push(zs.zoneName+': Notify facility engineering and equipment owners of elevated environmental risk per screening assessment.')
        R.imm.push(zs.zoneName+': Visually inspect installed equipment for surface corrosion indicators (silver tarnish, copper discoloration, creep corrosion on PCBs). Photograph and document findings.')
        R.eng.push(zs.zoneName+': Verify outdoor air damper position and operation. Confirm gas-phase filter media is within service life per manufacturer specification.')
        R.eng.push(zs.zoneName+': Consider suspending new equipment installations in affected zone if visual corrosion indicators are confirmed during inspection.')
      }
      if (hasCorrosionRisk) {
        R.eng.push(zs.zoneName+': Deploy ANSI/ISA 71.04-compliant copper+silver reactivity coupons for 30-day passive exposure. Minimum 3 locations: hot-aisle return, cold-aisle supply, intake plenum near OA damper.')
      }
      if (hasParticleRisk) {
        R.eng.push(zs.zoneName+': Deploy calibrated particle counter at ISO 14644-1 size thresholds (≥0.5 µm, ≥1 µm, ≥5 µm). Sampling per ISO 14644-1:2015 §B.')
      }
      if (hasCorrosionRisk || hasParticleRisk) {
        R.eng.push(zs.zoneName+': Conduct outdoor air quality screening at OA intake. Document upwind contamination sources within 1 mile and coordinate with prevailing wind direction.')
      }
    }
    // Data-gap-driven recommendations: when a category is INSUFFICIENT or severely capped, advise assessment
    zs.cats.forEach(c => {
      if (c.status === 'INSUFFICIENT' || c.status === 'DATA_GAP' || (c.capped && c.sufficiency?.sufficiency < 0.4)) {
        if (c.l === 'HVAC') R.eng.push(zs.zoneName+': Conduct comprehensive HVAC system assessment — inspect filter condition, measure supply airflow, and evaluate drain pan and condensate management.')
        if (c.l === 'Ventilation') R.eng.push(zs.zoneName+': Obtain ventilation measurements (CO₂ differential, outdoor air delivery rate) to complete the assessment.')
        if (c.l === 'Contaminants') R.eng.push(zs.zoneName+': Collect air quality measurements (PM2.5, CO) to establish contaminant baseline.')
        if (c.l === 'Environment') R.eng.push(zs.zoneName+': Measure temperature and relative humidity to evaluate thermal comfort conditions.')
      }
    })
  })
  if (bldg.hm === 'Unknown') R.adm.push('Establish preventive HVAC maintenance schedule.')
  R.mon.push('Conduct periodic reassessment to verify corrective action effectiveness.')
  Object.keys(R).forEach(k => { R[k] = [...new Set(R[k])] })
  return R
}

export function evalMeasurementConfidence(zones) {
  const zoneConfs = zones.map(z => {
    let m = 0
    if (z.co2) m++; if (z.tf) m++; if (z.rh) m++; if (z.pm) m++
    if (z.co) m++; if (z.tv) m++; if (z.hc) m++; if (z.cfm_person) m++; if (z.ach) m++
    const hasDuration = z.meas_duration && z.meas_duration !== 'Spot check (instantaneous)'
    const hasOcc = z.meas_occ && z.meas_occ !== 'Unknown'
    if (m >= 3 || hasDuration) return 'High'
    if (m >= 2 || (m >= 1 && hasOcc)) return 'Moderate'
    return 'Low'
  })
  const worst = zoneConfs.includes('Low') ? 'Low' : zoneConfs.includes('Moderate') ? 'Moderate' : 'High'
  return { overall: worst, zones: zoneConfs }
}

export function evalMold(d) {
  if (!d.mi || d.mi === 'None') return null
  let condition, sqft = d.mia ? +d.mia : null, triggered = false
  if (d.mi.includes('Extensive'))     { condition = 3; triggered = true }
  else if (d.mi.includes('Moderate')) { condition = (sqft && sqft >= 10) ? 3 : 2; triggered = condition >= 2 }
  else if (d.mi.includes('Small'))    { condition = (sqft && sqft >= 10) ? 2 : 1; triggered = condition >= 2 }
  else                                { condition = 1; triggered = false }
  return { condition, label: `IICRC S520 Condition ${condition}`, sqft, investigationTriggered: triggered, visual: d.mi, caveat: 'Visual observation only — not confirmed by sampling' }
}

// Gap 3: SBS pattern detection — complaints alone can trigger causal chains
export function detectSBSPattern(zoneData) {
  const d = zoneData
  let signals = 0
  if (d.cx === 'Yes — complaints reported' && d.ac && d.ac !== '1-2') signals++
  if (d.sr === 'Yes — clear pattern') signals++
  if (d.cc === 'Yes — this zone') signals++
  if ((d.sy || []).length >= 2) signals++
  return signals >= 2
}
