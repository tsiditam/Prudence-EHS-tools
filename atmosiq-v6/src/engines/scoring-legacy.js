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
import { evaluateCriteria } from '../constants/criteria'
import { getConfidenceLevel } from './riskBands'
import { evaluateAllSufficiency } from './sufficiency'
import { CONTROL_TIER, ZONE_PRESSURE, ZONE_PRESSURE_OPTIONS } from '../constants/pressurizationStandards'
import { pressurizationRecommendations } from './pressurization'
// The one numeric parser (audit H1). scoring.js re-exports this module, so
// the import is circular; it is safe because nothing here calls it at
// module-evaluation time.
import { readNumber } from './scoring'

// ── OSHA 3430 control hierarchy ──
//
// Every emitted action carries `controlTier`, so a report can group
// remedies by WHAT THEY DO rather than only by when they are due. The
// existing buckets answer urgency (imm / eng / adm / mon) and are not a
// hierarchy: an Immediate action can be source management (arrest the
// leak) or engineering (restore airflow), and the bucket cannot tell
// you which.
//
// The tier is declared AT EACH EMIT SITE, never inferred from the
// action's wording. Routing on prose is what let `matches` = includes
// mis-classify the CO₂ tiers in classify.ts; rewording an action must
// not silently move it between tiers.
//
// `null` is a deliberate fourth state, not an omission: a data-gap
// action ("obtain ventilation measurements") is an INVESTIGATION step,
// not a control, and the hierarchy has no honest slot for it. Forcing
// it into administrative_control would claim the assessment had
// recommended a control it did not.
const T_SOURCE = CONTROL_TIER.SOURCE_MANAGEMENT
const T_ENG = CONTROL_TIER.ENGINEERING
const T_ADM = CONTROL_TIER.ADMINISTRATIVE
const T_NONE = null

/**
 * OSHA-relevance flags.
 *
 * Every flag below reads a raw measurement against a published limit,
 * with one exception that used to read the composite: a complaint
 * pattern flagged only when the score fell under 70. That rule is gone,
 * and its removal is a small improvement rather than a loss — callers
 * passed `composite?.tot || 0`, so a missing composite scored 0 and the
 * rule fired by DEFAULT, on exactly the assessments that had the least
 * evidence behind them.
 *
 * A complaint pattern with concurrent hazard indicators is now what it
 * says: complaints reported, alongside at least one other flag raised by
 * a measurement.
 */
export function evalOSHA(d) {
  const fl = []
  const co2 = readNumber(d.co2), co = readNumber(d.co), hc = readNumber(d.hc), tf = readNumber(d.tf)
  if (co2 != null && co2 > STD.v.co2.con) fl.push('Ventilation-related concern pattern')
  if (d.wd === 'Active leak' || d.wd === 'Extensive damage' || (d.mi && !['None','Suspected discoloration'].includes(d.mi))) fl.push('Water/mold indicators present')
  if (d.sr === 'Yes — clear pattern' && (d.ac === 'More than 10' || d.ac === '6-10')) fl.push('Building-related symptom pattern — widespread')
  // Occupational-limit flags come from the criterion registry (audit H2), so
  // the sentence carries the averaging period and what a grab reading can
  // settle. "CO measurement above OSHA PEL threshold" was the bare-exceedance
  // statement the registry exists to prevent. A `critical` hit on either
  // analyte is a PEL / ceiling / STEL tier — the same level the old `> osha`
  // comparison flagged.
  for (const [value, parameter, label] of [[co, 'co', 'CO'], [hc, 'hcho', 'Formaldehyde']]) {
    if (value == null) continue
    const hit = evaluateCriteria(parameter, value, 'screening_grab')
    if (hit && hit.severity === 'critical') fl.push(`${label} ${hit.statement}`)
  }
  if (d.cx === 'Yes — complaints reported' && fl.length > 0) {
    fl.unshift('Documented complaint pattern with concurrent hazard indicators')
  }
  const suff = evaluateAllSufficiency(d)
  const conf = getConfidenceLevel(suff._overall || 0)
  const gaps = []
  if (co2 == null && tf == null) gaps.push('No instrument data')
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
  drainpan_immediate: { bucket: 'imm', tier: T_SOURCE, text: 'Address drain pan condition immediately. Evaluate for microbial growth.' },
  // The EPA-registered-biocide instruction was removed in 2026-08, alongside
  // the Legionella escalation below and for the reason `phrases/hvac.ts`
  // recorded when it retired both: biocide selection is a maintenance
  // decision, not a screening finding. The assessment observed a pan; it did
  // not evaluate what may lawfully be applied to that equipment, whether the
  // condensate discharges somewhere a biocide may not go, or what the
  // manufacturer permits. Naming a product class the assessor never chose is
  // the same over-reach as naming a standard the conditions never triggered.
  drainpan_clean: { bucket: 'imm', tier: T_SOURCE, text: 'Clean the drain pan and associated components in accordance with manufacturer recommendations and applicable HVAC maintenance procedures; correct drainage and slope deficiencies contributing to standing water.' },
  // `legionella_188` was removed in 2026-08, with the finding that produced
  // it. It read "Evaluate drain pan for Legionella risk per ASHRAE Standard
  // 188. If building lacks a Water Management Program, consider Legionella
  // sampling given active occupant respiratory symptoms." — and fired on any
  // finding whose text contained "Drain pan", nothing more. Two problems, both
  // fatal: ASHRAE 188 governs building water systems with a recognised aerosol
  // transmission pathway (cooling towers, evaporative condensers, domestic hot
  // water, fountains, misters), which a low-temperature condensate pan is not;
  // and the closing clause ASSERTED active respiratory symptoms with nothing
  // anywhere checking that any had been recorded. A recommendation may not
  // state a fact the assessment did not observe.
  //
  // `drainpan_immediate` and `drainpan_clean` still fire, so the condition
  // keeps two actions. See tests/engine/drain-pan-no-legionella.test.ts.
  oa_damper: { bucket: 'eng', tier: T_ENG, text: 'Evaluate outdoor air delivery rate and verify OA damper position within 24–72 hours.' },
  filter_replace_imm: { bucket: 'imm', tier: T_ENG, text: 'Replace air filters immediately. Inspect filter housing for bypass or damage.' },
  filter_replace_high: { bucket: 'eng', tier: T_ENG, text: 'Replace or service air filters. Inspect filter housing for bypass or damage.' },
  comprehensive_hvac_overdue: { bucket: 'eng', tier: T_ADM, text: 'Schedule comprehensive HVAC inspection within 24–72 hours when occupant symptoms are active.' },
  comprehensive_hvac_high: { bucket: 'eng', tier: T_ADM, text: 'Schedule comprehensive HVAC inspection.' },
  comprehensive_hvac_assessment: { bucket: 'eng', tier: T_NONE, text: 'Conduct comprehensive HVAC system assessment — inspect filter condition, measure supply airflow, and evaluate drain pan and condensate management.' },
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
 * @param {Object} [opts.pressurization]  evaluatePressurization() output.
 *   Optional; when inward airflow was observed or measured, its
 *   engineering remedies join the `eng` bucket.
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
  // `tier` is required at every call site — see the control-hierarchy
  // note above. It is a positional argument rather than an options
  // object so that omitting it is a visible hole in the diff.
  const pushZone = (bucket, zoneName, text, tier) => {
    buckets[bucket].push({
      scope: 'zone',
      text,
      controlTier: tier,
      zoneId: zoneName,
      zoneName,
      affectedZoneIds: [zoneName],
      affectedZoneNames: [zoneName],
    })
  }
  const pushBuilding = (bucket, text, affectedZoneNames = [], tier) => {
    buckets[bucket].push({
      scope: 'building',
      text,
      controlTier: tier,
      affectedZoneIds: affectedZoneNames,
      affectedZoneNames,
    })
  }

  zoneScores.forEach(zs => {
    zs.cats.forEach(c => c.r.forEach(r => {
      if (r.sev === 'critical') {
        if (r.t.includes('CO ')) pushZone('imm', zs.zoneName, 'Immediately evacuate and investigate combustion source.', T_SOURCE)
        if (r.t.includes('ormaldehyde')) pushZone('imm', zs.zoneName, 'Implement exposure controls per 29 CFR 1910.1048.', T_ENG)
        // No supply airflow / no filtration are intrinsically building-scoped
        // — the HVAC service request is about the system, not a single zone.
        // We still record the originating zone(s) in affectedZoneNames so the
        // Immediate action carries its provenance (the dedup phase below
        // merges these when the same system action surfaces from several zones).
        if (r.t.includes('No supply airflow')) pushBuilding('imm', 'Request immediate HVAC service to restore airflow.', [zs.zoneName], T_ENG)
        if (r.t.includes('No filtration') || r.t.includes('no filter')) pushBuilding('imm', 'Request immediate HVAC service — no filtration installed.', [zs.zoneName], T_ENG)
        if (r.t.includes('Drain pan')) trigger('drainpan_immediate', zs.zoneName)
        // The 'Arrest water intrusion…' emit that stood here was a double:
        // `hasWater` below already pushes one Immediate water action for the
        // zone, and this one also fired on "Drain pan: standing water",
        // which is the drain-pan rule's job (audit M5).
        if (r.t.toLowerCase().includes('occupant') && r.t.includes('symptom')) pushZone('imm', zs.zoneName, 'Document symptom patterns using NIOSH IEQ questionnaire or equivalent structured instrument. Evaluate ventilation immediately.', T_ADM)
      }
      if (r.sev === 'high' || r.sev === 'medium') {
        if (r.t.includes('maintenance') && r.t.includes('overdue')) trigger('comprehensive_hvac_overdue', zs.zoneName)
      }
      if (r.sev === 'high') {
        if (r.t.includes('CO₂') || r.t.includes('ventilation') || r.t.includes('OA delivery')) trigger('oa_damper', zs.zoneName)
        // PM filtration upgrade is a building-wide spec change (MERV
        // class) that applies system-wide regardless of which zone
        // surfaced the finding.
        if (r.t.includes('PM')) pushBuilding('eng', 'Upgrade filtration to MERV 13+. Evaluate filter housing for bypass.', [], T_ENG)
        if (r.t.includes('maintenance')) trigger('comprehensive_hvac_high', zs.zoneName)
        if (r.t.includes('ilter condition') || r.t.includes('filtration')) trigger('filter_replace_high', zs.zoneName)
        if (r.t.includes('Temperature') || r.t.includes('comfort range')) pushZone('eng', zs.zoneName, 'Evaluate thermostat settings and HVAC zoning for thermal comfort.', T_ENG)
        if (r.t.includes('occupant') || r.t.includes('symptom')) pushZone('adm', zs.zoneName, 'Document affected occupants using NIOSH IEQ questionnaire or equivalent structured symptom instrument.', T_ADM)
        if (r.t.includes('resolve')) pushZone('adm', zs.zoneName, 'Building-related symptom pattern — investigate ventilation and source pathways.', T_ADM)
      }
    }))
    // Pattern-driven recs (water / mold / drain pan / filter / pressure / symptom cluster)
    // Water intrusion is an Environment condition; a drain pan holding water
    // is the HVAC rule's job (drainpan_immediate / drainpan_clean), not a
    // second "repair water intrusion" action for the same pan.
    const hasWater = zs.cats.some(c => c.r.some(r => !r.t.startsWith('Drain pan') && (r.t.includes('water') || r.t.includes('leak') || r.t.includes('Water'))))
    const hasMold = zs.cats.some(c => c.r.some(r => r.t.toLowerCase().includes('mold')))
    const hasDrainPan = zs.cats.some(c => c.r.some(r => r.t.includes('Drain pan')))
    const hasSymptomCluster = zs.cats.some(c => c.l === 'Complaints' && c.r.some(r => r.sev === 'critical' || r.sev === 'high'))
    const hasFilterIssue = zs.cats.some(c => c.r.some(r => r.t.toLowerCase().includes('filter') && (r.sev === 'high' || r.sev === 'critical')))
    // A particulate finding the engine actually raised (structured `p`, not
    // the word "PM" in a sentence). Portable HEPA units address particulate;
    // recommending them on a symptom cluster alone stated a condition the
    // assessment had not observed (audit M5).
    const hasParticulate = zs.cats.some(c => c.r.some(r => r.p === 'pm25' && (r.sev === 'critical' || r.sev === 'high' || r.sev === 'medium')))
    // Pressurization keys on the STRUCTURED observation — the zone's
    // `path_pressure` intake answer, canonicalised through the same option
    // map the pressurization module uses, or that module's own zonesNegative
    // list — never on the word "negative" appearing in any finding text,
    // which fired the remedy off a pharmacy profile's context sentence.
    const zoneData = zones.find(z => (z.zn || '') === zs.zoneName)
    const hasNegPressure =
      (zoneData != null && ZONE_PRESSURE_OPTIONS[zoneData.path_pressure] === ZONE_PRESSURE.NEGATIVE) ||
      (opts.pressurization?.zonesNegative || []).includes(zs.zoneName)
    if (hasWater) pushZone('imm', zs.zoneName, 'Repair water intrusion source. Assess affected materials within 48 hours per IICRC S500.', T_SOURCE)
    if (hasMold) {
      pushZone('eng', zs.zoneName, 'Remediate visible mold per IICRC S520 / EPA Mold Remediation in Schools and Commercial Buildings. For areas <10 sq ft (Level I), trained maintenance staff with PPE (N95, gloves, eye protection) may perform cleanup.', T_SOURCE)
      pushZone('eng', zs.zoneName, 'Post-remediation verification per IICRC S520 — visual clearance and clearance air sampling before reoccupancy.', T_ADM)
    }
    if (hasDrainPan) trigger('drainpan_clean', zs.zoneName)
    if (hasFilterIssue) trigger('filter_replace_imm', zs.zoneName)
    if (hasNegPressure) pushZone('eng', zs.zoneName, 'Correct building pressurization. Negative pressure draws contaminants from adjacent spaces and outdoor sources. Evaluate exhaust/supply balance.', T_ENG)
    if (hasSymptomCluster && hasParticulate) {
      pushZone('imm', zs.zoneName, 'Deploy portable HEPA filtration units in affected occupied areas as interim measure.', T_ENG)
    }
    if (hasSymptomCluster) {
      // The ATSDR occupant-risk-communication action was removed in 2026-08.
      // `phrases/complaints.ts` retired it first and said why: it is
      // disproportionate to a routine commercial IAQ assessment, where no
      // hazardous release requiring community risk communication has been
      // identified. ATSDR guidance addresses public-health responses to
      // contaminated sites. The proportionate step is a structured symptom
      // survey, which the critical/medium complaint branches above already
      // emit as a NIOSH IEQ questionnaire action.
      pushZone('adm', zs.zoneName, 'Evaluate feasibility of temporary relocation for symptomatic occupants until corrective actions are verified effective.', T_ADM)
    }
    if (hasMold || hasWater) {
      pushZone('adm', zs.zoneName, 'Document loss and remediation scope for insurance notification.', T_ADM)
      pushZone('mon', zs.zoneName, 'Establish re-occupancy and clearance criteria. Post-remediation verification required before returning to normal operations.', T_ADM)
    }
    // Data-gap-driven (HVAC gap is equipment-scoped; the rest are
    // zone-scoped because they're about taking measurements in the
    // zone, not servicing a piece of equipment).
    zs.cats.forEach(c => {
      if (c.status === 'INSUFFICIENT' || c.status === 'DATA_GAP' || (c.capped && c.sufficiency?.sufficiency < 0.4)) {
        if (c.l === 'HVAC') trigger('comprehensive_hvac_assessment', zs.zoneName)
        if (c.l === 'Ventilation') pushZone('eng', zs.zoneName, 'Obtain ventilation measurements (CO₂ differential, outdoor air delivery rate) to complete the assessment.', T_NONE)
        if (c.l === 'Contaminants') pushZone('eng', zs.zoneName, 'Collect air quality measurements (PM2.5, CO) to establish contaminant baseline.', T_NONE)
        if (c.l === 'Environment') pushZone('eng', zs.zoneName, 'Measure temperature and relative humidity to evaluate thermal comfort conditions.', T_NONE)
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
        controlTier: def.tier,
        affectedZoneIds: affected,
        affectedZoneNames: affected,
      })
    }
    if (unmapped.length > 0) {
      buckets[def.bucket].push({
        scope: 'building',
        text: `HVAC equipment not yet identified — ${def.text}`,
        controlTier: def.tier,
        affectedZoneIds: unmapped,
        affectedZoneNames: unmapped,
      })
    }
  }

  // ── Pressurization remedies ──
  // Engineering controls, authored in the module that owns the
  // mechanism. Appended rather than re-derived here: genRecs does not
  // know how to read a door test, and should not learn — the
  // every-layer-says-the-same-thing rule.
  for (const action of pressurizationRecommendations(opts.pressurization)) {
    buckets.eng.push(action)
  }

  // ── Building-scoped tail ──
  if (bldg.hm === 'Unknown') pushBuilding('adm', 'Establish preventive HVAC maintenance schedule.', [], T_ADM)
  // Monitoring wording depends on whether the screening surfaced any actual
  // deficiency. "Verify corrective action effectiveness" only fits when there
  // is a corrective action to verify — i.e. a critical/high/medium finding
  // (the same severities that drive corrective recs above). On a clean
  // screening where every finding is pass/info/low, that phrasing is a
  // template mismatch, so use a baseline-reassessment phrasing instead.
  const hasDeficiency = zoneScores.some(zs =>
    (zs.cats || []).some(c => (c.r || []).some(r => r.sev === 'critical' || r.sev === 'high' || r.sev === 'medium')))
  pushBuilding('mon', hasDeficiency
    ? 'Conduct periodic reassessment to verify corrective action effectiveness.'
    : 'Conduct periodic baseline reassessment to confirm conditions remain within screening ranges; no corrective actions are currently indicated.', [], T_ADM)

  // Dedup within each bucket — key off scope, equipment/zone id, and text.
  // When duplicates collapse (e.g. a building/system action surfaced from
  // several zones), merge their zone provenance into the kept action so
  // affectedZoneNames/Ids reflect every originating zone, not just the first.
  const keyOf = (a) => `${a.scope}|${a.equipmentId || a.zoneId || ''}|${a.text}`
  const mergeZones = (target, src) => {
    if (Array.isArray(src.affectedZoneNames) && src.affectedZoneNames.length)
      target.affectedZoneNames = [...new Set([...(target.affectedZoneNames || []), ...src.affectedZoneNames])]
    if (Array.isArray(src.affectedZoneIds) && src.affectedZoneIds.length)
      target.affectedZoneIds = [...new Set([...(target.affectedZoneIds || []), ...src.affectedZoneIds])]
  }
  for (const k of ['imm','eng','adm','mon']) {
    const byKey = new Map()
    for (const a of buckets[k]) {
      const key = keyOf(a)
      const existing = byKey.get(key)
      if (existing) mergeZones(existing, a)
      else byKey.set(key, a)
    }
    buckets[k] = [...byKey.values()]
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

// Intake option keyword → EPA (2008) remediation size band. Kept in step
// with MOLD_EXTENT_BANDS in scoring.js (the parity test checks both engines).
const MOLD_EXTENT = [['Extensive', '>100 ft²'], ['Moderate', '10–100 ft²'], ['Small', '<10 ft²']]

/**
 * IICRC S520 Condition from the visual mold indicator.
 *
 * Any observed growth is Condition 3 (actual growth). Condition 2 is settled
 * spores WITHOUT growth and Condition 1 is normal ecology — so area can never
 * lower the Condition, which the previous ladder did (a small patch was
 * "Condition 1 or 2", a 10–100 ft² patch "Condition 2"). Area sets the EPA
 * (2008) size band, which drives the response, not the classification. The
 * mold module's `remediationCondition.js` has always classified this way;
 * `tests/engine/mold-condition-parity.test.ts` holds the two engines together.
 */
export function evalMold(d) {
  if (!d.mi || d.mi === 'None') return null
  const sqft = readNumber(d.mia)
  const band = MOLD_EXTENT.find(([key]) => d.mi.includes(key))
  const visibleGrowth = !!band
  const condition = visibleGrowth ? 3 : 1
  return {
    condition,
    label: visibleGrowth
      ? 'IICRC S520 Condition 3 (actual growth)'
      : 'IICRC S520 Condition 1 (no growth observed — discoloration unconfirmed)',
    sqft,
    extent: band ? band[1] : null,
    investigationTriggered: visibleGrowth,
    visual: d.mi,
    caveat: 'Visual observation only — not confirmed by sampling',
  }
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
