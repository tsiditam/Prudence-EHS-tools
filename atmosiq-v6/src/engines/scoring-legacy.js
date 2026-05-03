/**
 * AtmosFlow Scoring — Legacy Helper Functions
 * evalOSHA, calcVent, genRecs, evalMeasurementConfidence, evalMold
 *
 * v2.8.0 — genRecs now returns RecommendationAction[] objects per
 * bucket instead of the legacy "ZoneName: text" string array.
 * Equipment-bound rules emit one action per piece of HVAC equipment
 * with affectedZoneIds carried as metadata, eliminating the per-zone
 * duplication seen in pre-2.8 reports. Renderers consume the object
 * shape via src/utils/recFormatting.js (which also handles legacy
 * string-shaped reports stored in localStorage before this engine
 * version).
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

// ── Equipment-scoped rule registry ──
//
// Each rule fires per zone (the trigger condition lives in the
// per-zone iteration below). When fired it records the zone in a
// Set keyed by ruleKey. After all zones are processed, the emit
// phase groups affected zones by serving equipment and emits one
// RecommendationAction per equipment unit (with affectedZoneIds
// listing every zone served by that unit that triggered the rule).
//
// If a triggered zone has no equipment mapped, the rule emits a
// single building-scoped fallback action prefixed
// "HVAC equipment not yet identified —" so the assessor can resolve
// the mapping and re-run scoring.
//
// Scope is declared on the rule, not inferred at runtime — engine
// stays deterministic.
const EQ_RULES = {
  drainpan_immediate: { bucket: 'imm', text: 'Address drain pan condition immediately. Evaluate for microbial growth.' },
  drainpan_clean: { bucket: 'imm', text: 'Clean drain pan, treat with EPA-registered biocide, and verify proper slope and condensate disposal.' },
  legionella_188: { bucket: 'eng', text: 'Evaluate drain pan for Legionella risk per ASHRAE Standard 188. If building lacks a Water Management Program, consider Legionella sampling given active occupant respiratory symptoms.' },
  oa_damper: { bucket: 'eng', text: 'Evaluate outdoor air delivery rate and verify OA damper position within 24–72 hours.' },
  filter_replace_imm: { bucket: 'imm', text: 'Replace air filters immediately. Inspect filter housing for bypass or damage.' },
  filter_replace_high: { bucket: 'eng', text: 'Replace or service air filters. Inspect filter housing for bypass or damage.' },
  comprehensive_hvac_overdue: { bucket: 'eng', text: 'Schedule comprehensive HVAC inspection within 24–72 hours when occupant symptoms are active.' },
  comprehensive_hvac_high: { bucket: 'eng', text: 'Schedule comprehensive HVAC inspection.' },
  comprehensive_hvac_assessment: { bucket: 'eng', text: 'Conduct comprehensive HVAC system assessment — inspect filter condition, measure supply airflow, and evaluate drain pan and condensate management.' },
}

// Build a zone-name → list-of-equipment-IDs map. Equipment IDs are
// resolved against zone.zid (the stable per-assessment id). For
// drafts pre-dating equipment capture (no zid, no servingEquipmentIds)
// the map returns an empty array, which is the unmapped-fallback
// trigger condition.
function buildZoneEquipmentMap(zones, equipment) {
  const eqByZid = {}
  for (const e of (equipment || [])) {
    for (const zid of (e.servedZoneIds || [])) {
      if (!eqByZid[zid]) eqByZid[zid] = []
      eqByZid[zid].push(e.id)
    }
  }
  const byZoneName = {}
  for (const z of (zones || [])) {
    const name = z.zn || ''
    if (!name) continue
    // Prefer the inverse on the zone if present (in-walkthrough state)
    const direct = Array.isArray(z.servingEquipmentIds) ? z.servingEquipmentIds : null
    byZoneName[name] = direct && direct.length ? direct : (z.zid ? (eqByZid[z.zid] || []) : [])
  }
  return byZoneName
}

/**
 * Generate tiered recommendations.
 *
 * @param {Array} zoneScores  Output of scoreZone(z, bldg) per zone.
 * @param {Object} bldg       Building-level context.
 * @param {Object} [opts]
 * @param {Array} [opts.zones]      Original ZoneData[] (carries zid + servingEquipmentIds).
 * @param {Array} [opts.equipment]  HvacEquipment[] captured during walkthrough.
 * @returns {{imm: RecommendationAction[], eng, adm, mon}}
 */
export function genRecs(zoneScores, bldg, opts = {}) {
  const zones = opts.zones || []
  const equipment = opts.equipment || []
  const eqById = Object.fromEntries(equipment.map(e => [e.id, e]))
  const eqLabel = (id) => eqById[id]?.label || id
  const equipmentByZone = buildZoneEquipmentMap(zones, equipment)

  const buckets = { imm: [], eng: [], adm: [], mon: [] }
  // Per-rule trigger sets for equipment-scoped emit phase
  const triggers = {}
  const trigger = (ruleKey, zoneName) => {
    if (!triggers[ruleKey]) triggers[ruleKey] = new Set()
    triggers[ruleKey].add(zoneName)
  }
  const pushZone = (bucket, zoneName, text) => {
    buckets[bucket].push({
      scope: 'zone',
      text,
      zoneId: zoneName,
      zoneName,
      affectedZoneIds: [zoneName],
      affectedZoneNames: [zoneName],
    })
  }
  const pushBuilding = (bucket, text, affectedZoneNames = []) => {
    buckets[bucket].push({
      scope: 'building',
      text,
      affectedZoneIds: affectedZoneNames,
      affectedZoneNames,
    })
  }

  zoneScores.forEach(zs => {
    zs.cats.forEach(c => c.r.forEach(r => {
      if (r.sev === 'critical') {
        if (r.t.includes('CO ')) pushZone('imm', zs.zoneName, 'Immediately evacuate and investigate combustion source.')
        if (r.t.includes('ormaldehyde')) pushZone('imm', zs.zoneName, 'Implement exposure controls per 29 CFR 1910.1048.')
        // No supply airflow / no filtration are intrinsically building-scoped
        // (no zone prefix in legacy output) — the HVAC service request is
        // about the system, not a single zone.
        if (r.t.includes('No supply airflow')) pushBuilding('imm', 'Request immediate HVAC service to restore airflow.')
        if (r.t.includes('No filtration') || r.t.includes('no filter')) pushBuilding('imm', 'Request immediate HVAC service — no filtration installed.')
        if (r.t.includes('Drain pan')) trigger('drainpan_immediate', zs.zoneName)
        if (r.t.includes('water') || r.t.includes('leak')) pushZone('imm', zs.zoneName, 'Arrest water intrusion. Assess materials within 48 hours.')
        if (r.t.toLowerCase().includes('occupant') && r.t.includes('symptom')) pushZone('imm', zs.zoneName, 'Document symptom patterns using NIOSH IEQ questionnaire or equivalent structured instrument. Evaluate ventilation immediately.')
      }
      if (r.sev === 'high' || r.sev === 'medium') {
        if (r.t.includes('maintenance') && r.t.includes('overdue')) trigger('comprehensive_hvac_overdue', zs.zoneName)
      }
      if (r.sev === 'high') {
        if (r.t.includes('CO₂') || r.t.includes('ventilation') || r.t.includes('OA delivery')) trigger('oa_damper', zs.zoneName)
        // PM filtration upgrade is a building-wide spec change (MERV
        // class) that applies system-wide regardless of which zone
        // surfaced the finding.
        if (r.t.includes('PM')) pushBuilding('eng', 'Upgrade filtration to MERV 13+. Evaluate filter housing for bypass.')
        if (r.t.includes('maintenance')) trigger('comprehensive_hvac_high', zs.zoneName)
        if (r.t.includes('ilter condition') || r.t.includes('filtration')) trigger('filter_replace_high', zs.zoneName)
        if (r.t.includes('Temperature') || r.t.includes('comfort range')) pushZone('eng', zs.zoneName, 'Evaluate thermostat settings and HVAC zoning for thermal comfort.')
        if (r.t.includes('occupant') || r.t.includes('symptom')) pushZone('adm', zs.zoneName, 'Document affected occupants using NIOSH IEQ questionnaire or equivalent structured symptom instrument.')
        if (r.t.includes('resolve')) pushZone('adm', zs.zoneName, 'Building-related symptom pattern — investigate ventilation and source pathways.')
      }
    }))
    // Pattern-driven recs (water / mold / drain pan / filter / pressure / symptom cluster)
    const hasWater = zs.cats.some(c => c.r.some(r => r.t.includes('water') || r.t.includes('leak') || r.t.includes('Water')))
    const hasMold = zs.cats.some(c => c.r.some(r => r.t.toLowerCase().includes('mold')))
    const hasDrainPan = zs.cats.some(c => c.r.some(r => r.t.includes('Drain pan')))
    const hasSymptomCluster = zs.cats.some(c => c.l === 'Complaints' && c.r.some(r => r.sev === 'critical' || r.sev === 'high'))
    const hasFilterIssue = zs.cats.some(c => c.r.some(r => r.t.toLowerCase().includes('filter') && (r.sev === 'high' || r.sev === 'critical')))
    const hasNegPressure = zs.cats.some(c => c.r.some(r => r.t.includes('Negative') || r.t.includes('negative')))
    if (hasWater) pushZone('imm', zs.zoneName, 'Repair water intrusion source. Assess affected materials within 48 hours per IICRC S500.')
    if (hasMold) {
      pushZone('eng', zs.zoneName, 'Remediate visible mold per IICRC S520 / EPA Mold Remediation in Schools and Commercial Buildings. For areas <10 sq ft (Level I), trained maintenance staff with PPE (N95, gloves, eye protection) may perform cleanup.')
      pushZone('eng', zs.zoneName, 'Post-remediation verification per IICRC S520 — visual clearance and clearance air sampling before reoccupancy.')
    }
    if (hasDrainPan) {
      trigger('drainpan_clean', zs.zoneName)
      trigger('legionella_188', zs.zoneName)
    }
    if (hasFilterIssue) trigger('filter_replace_imm', zs.zoneName)
    if (hasNegPressure) pushZone('eng', zs.zoneName, 'Correct building pressurization. Negative pressure draws contaminants from adjacent spaces and outdoor sources. Evaluate exhaust/supply balance.')
    if (hasSymptomCluster) {
      pushZone('imm', zs.zoneName, 'Deploy portable HEPA filtration units in affected occupied areas as interim measure.')
      pushZone('adm', zs.zoneName, 'Implement occupant risk communication plan per ATSDR guidance. Notify affected occupants of assessment findings and planned corrective actions.')
      pushZone('adm', zs.zoneName, 'Evaluate feasibility of temporary relocation for symptomatic occupants until corrective actions are verified effective.')
    }
    if (hasMold || hasWater) {
      pushZone('adm', zs.zoneName, 'Document loss and remediation scope for insurance notification.')
      pushZone('mon', zs.zoneName, 'Establish re-occupancy and clearance criteria. Post-remediation verification required before returning to normal operations.')
    }
    // Data-center–specific recommendations remain zone-scoped per the
    // "v2.8 keep zone-scoped" list (coupons / particle counters are
    // deployed in named zones, not on a single piece of equipment).
    if (zs.zoneSubtype === 'data_hall') {
      const hasCorrosionRisk = zs.cats.some(c => c.r.some(r => r.t.includes('corrosion risk') || r.t.includes('71.04')))
      const hasParticleRisk = zs.cats.some(c => c.r.some(r => r.t.includes('ISO 14644') || r.t.includes('ISO Class')))
      if (hasCorrosionRisk || hasParticleRisk) {
        pushZone('imm', zs.zoneName, 'Notify facility engineering and equipment owners of elevated environmental risk per screening assessment.')
        pushZone('imm', zs.zoneName, 'Visually inspect installed equipment for surface corrosion indicators (silver tarnish, copper discoloration, creep corrosion on PCBs). Photograph and document findings.')
        pushZone('eng', zs.zoneName, 'Verify outdoor air damper position and operation. Confirm gas-phase filter media is within service life per manufacturer specification.')
        pushZone('eng', zs.zoneName, 'Consider suspending new equipment installations in affected zone if visual corrosion indicators are confirmed during inspection.')
      }
      if (hasCorrosionRisk) pushZone('eng', zs.zoneName, 'Deploy ANSI/ISA 71.04-compliant copper+silver reactivity coupons for 30-day passive exposure. Minimum 3 locations: hot-aisle return, cold-aisle supply, intake plenum near OA damper.')
      if (hasParticleRisk) pushZone('eng', zs.zoneName, 'Deploy calibrated particle counter at ISO 14644-1 size thresholds (≥0.5 µm, ≥1 µm, ≥5 µm). Sampling per ISO 14644-1:2015 §B.')
      if (hasCorrosionRisk || hasParticleRisk) pushZone('eng', zs.zoneName, 'Conduct outdoor air quality screening at OA intake. Document upwind contamination sources within 1 mile and coordinate with prevailing wind direction.')
    }
    // Data-gap-driven (HVAC gap is equipment-scoped; the rest are
    // zone-scoped because they're about taking measurements in the
    // zone, not servicing a piece of equipment).
    zs.cats.forEach(c => {
      if (c.status === 'INSUFFICIENT' || c.status === 'DATA_GAP' || (c.capped && c.sufficiency?.sufficiency < 0.4)) {
        if (c.l === 'HVAC') trigger('comprehensive_hvac_assessment', zs.zoneName)
        if (c.l === 'Ventilation') pushZone('eng', zs.zoneName, 'Obtain ventilation measurements (CO₂ differential, outdoor air delivery rate) to complete the assessment.')
        if (c.l === 'Contaminants') pushZone('eng', zs.zoneName, 'Collect air quality measurements (PM2.5, CO) to establish contaminant baseline.')
        if (c.l === 'Environment') pushZone('eng', zs.zoneName, 'Measure temperature and relative humidity to evaluate thermal comfort conditions.')
      }
    })
  })

  // ── Equipment-scoped emit phase ──
  // For each rule that triggered, group affected zones by serving
  // equipment. Emit one action per equipment unit. Zones with no
  // equipment mapped fall through to a single building-scoped action
  // per rule with the unmapped-equipment prefix.
  for (const [ruleKey, zoneSet] of Object.entries(triggers)) {
    const def = EQ_RULES[ruleKey]
    if (!def) continue
    const zoneList = [...zoneSet]
    const byEq = {}
    const unmapped = []
    for (const zoneName of zoneList) {
      const eqIds = equipmentByZone[zoneName] || []
      if (eqIds.length === 0) {
        unmapped.push(zoneName)
      } else {
        for (const eqId of eqIds) {
          if (!byEq[eqId]) byEq[eqId] = new Set()
          byEq[eqId].add(zoneName)
        }
      }
    }
    for (const [eqId, zSet] of Object.entries(byEq)) {
      const affected = [...zSet]
      buckets[def.bucket].push({
        scope: 'equipment',
        equipmentId: eqId,
        equipmentLabel: eqLabel(eqId),
        text: def.text,
        affectedZoneIds: affected,
        affectedZoneNames: affected,
      })
    }
    if (unmapped.length > 0) {
      buckets[def.bucket].push({
        scope: 'building',
        text: `HVAC equipment not yet identified — ${def.text}`,
        affectedZoneIds: unmapped,
        affectedZoneNames: unmapped,
      })
    }
  }

  // ── Building-scoped tail ──
  if (bldg.hm === 'Unknown') pushBuilding('adm', 'Establish preventive HVAC maintenance schedule.')
  pushBuilding('mon', 'Conduct periodic reassessment to verify corrective action effectiveness.')

  // Dedup within each bucket — key off scope, equipment/zone id, and text
  const keyOf = (a) => `${a.scope}|${a.equipmentId || a.zoneId || ''}|${a.text}`
  for (const k of ['imm','eng','adm','mon']) {
    const seen = new Set()
    buckets[k] = buckets[k].filter(a => {
      const key = keyOf(a)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  return buckets
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
