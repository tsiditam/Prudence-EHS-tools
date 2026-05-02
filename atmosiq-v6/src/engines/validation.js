/**
 * AtmosFlow Assessment Validation — pre-finalize gate.
 * Blockers prevent report rendering. Priority Actions derived from
 * findings — cannot be empty when findings exist.
 *
 * Engine v2.7 Fix 4 — extended evidentiary completeness checks beyond
 * instrument calibration. Reports finalized today with placeholder
 * data ("Not Specified" client, no occupant denominator, no photos
 * for Critical findings) created defensibility liability; the calibration
 * gate proved the pattern works, so we extend it with six more checks:
 *   1. client name populated and non-placeholder
 *   2. site contact name + role both populated (people request reports,
 *      buildings don't)
 *   3. requested_by is a person, not a bare facility name
 *   4. Critical/High findings each have at least one photo, OR an
 *      explicit "photo capture not feasible" override with justification
 *   5. zones with reported occupant symptoms have an occupant denominator
 *   6. assessor name does not match placeholder patterns
 *
 * The gate returns { canFinalize, blockers, warnings, mode } — callers
 * surface `blockers` as a structured list per severity, NOT as a generic
 * error.
 */

import { ASSESSMENT_MODES } from './riskBands'
import { evaluateAllSufficiency } from './sufficiency'

const NOT_SPECIFIED_PATTERNS = /^(not specified|n\/a|na|none|tbd|todo)$/i
const ASSESSOR_PLACEHOLDER_PATTERNS = /\b(hobo lobo|lorem|ipsum|test user|placeholder|example name|john doe|jane doe)\b/i

function isMissingOrPlaceholder(value) {
  if (value == null) return true
  const s = String(value).trim()
  if (s.length === 0) return true
  if (NOT_SPECIFIED_PATTERNS.test(s)) return true
  return false
}

function zoneHasSymptomFindings(zoneScore) {
  if (!zoneScore || !zoneScore.cats) return false
  return zoneScore.cats.some(c => (c.r || []).some(r =>
    typeof r.t === 'string' && /symptom|occupant|complaint|headache|irritation|fatigue/i.test(r.t)
  ))
}

function zoneHasOccupantDenominator(zone) {
  if (!zone) return false
  const total = zone.total_count ?? zone.totalOccupants ?? zone.occupant_total
  const affected = zone.affected_count ?? zone.affectedOccupants ?? zone.occupant_affected
  return total != null && affected != null
}

function zoneHasPhotos(photos, zoneName) {
  if (!photos || typeof photos !== 'object') return false
  const list = photos[zoneName]
  return Array.isArray(list) && list.length > 0
}

function zoneHasPhotoOverride(overrides, zoneName) {
  if (!overrides || typeof overrides !== 'object') return false
  const entry = overrides[zoneName]
  return entry && typeof entry.reason === 'string' && entry.reason.trim().length > 0
}

export function validateAssessment(assessment) {
  const blockers = []
  const warnings = []
  const mode = ASSESSMENT_MODES[assessment.assessmentMode] || ASSESSMENT_MODES.FULL_ASSESSMENT
  const zones = assessment.zones || []
  const zoneScores = assessment.zoneScores || []
  const allFindings = zoneScores.flatMap(zs => zs.cats.flatMap(c => c.r))
  const criticalFindings = allFindings.filter(f => f.sev === 'critical')
  const highFindings = allFindings.filter(f => f.sev === 'high')
  const recs = assessment.recs || {}
  const hasImmediate = (recs.imm || []).length > 0
  const hasEngineering = (recs.eng || []).length > 0

  // Instrument registration
  if (mode.requiresInstruments && !assessment.presurvey?.ps_inst_iaq) {
    blockers.push('No instrument registered. Required for ' + mode.id + ' mode.')
  }

  // Calibration
  if (mode.requiresCalibration && assessment.presurvey?.ps_inst_iaq) {
    const calStatus = assessment.presurvey?.ps_inst_iaq_cal_status || ''
    if (!calStatus.includes('within manufacturer') && !calStatus.includes('Calibrated')) {
      blockers.push('Instrument calibration not confirmed. Required for FULL_ASSESSMENT mode.')
    }
  }

  // ─── v2.7 Fix 4: evidentiary completeness ──────────────────────────
  const client = assessment.client || {}
  const building = assessment.building || {}

  // 1. Client name populated and non-placeholder
  const clientName = client.name || client.organization || building.client_name
  if (isMissingOrPlaceholder(clientName)) {
    blockers.push('Client name is empty or "Not Specified". A real client name is required for report finalization.')
  }

  // 2. Site contact — both name AND role required
  if (isMissingOrPlaceholder(client.contact_name)) {
    blockers.push('Site contact name is missing. Reports are addressed to a person, not a building.')
  }
  if (isMissingOrPlaceholder(client.contact_role)) {
    blockers.push('Site contact role is missing (e.g. Facility Manager, Building Owner, EHS Director).')
  }

  // 3. Requested-by must be a person, not the facility name itself
  const requestedBy = client.requested_by || client.requestedBy
  if (requestedBy != null && requestedBy !== '') {
    const facilityName = building.fn || building.name || ''
    if (facilityName && String(requestedBy).trim() === String(facilityName).trim()) {
      blockers.push('Requested-by is set to the facility name with no person attached. Buildings do not request reports — capture the requester\'s name.')
    }
  }

  // 4. Critical/High findings need photo evidence (or explicit override)
  const photos = assessment.photos || {}
  const overrides = assessment.photoOverrides || {}
  const photoBlockedZones = new Set()
  for (const zs of zoneScores) {
    const zoneName = zs.zoneName || ''
    if (!zoneName) continue
    const zoneFindings = (zs.cats || []).flatMap(c => c.r || [])
    const hasCriticalOrHigh = zoneFindings.some(f => f.sev === 'critical' || f.sev === 'high')
    if (!hasCriticalOrHigh) continue
    if (zoneHasPhotos(photos, zoneName)) continue
    if (zoneHasPhotoOverride(overrides, zoneName)) continue
    photoBlockedZones.add(zoneName)
  }
  for (const zoneName of photoBlockedZones) {
    blockers.push(`Zone "${zoneName}" has Critical or High findings but no photo evidence and no "photo capture not feasible" override with justification.`)
  }

  // 5. Zones with reported occupant symptoms must have an occupant denominator
  for (let i = 0; i < zones.length; i++) {
    const zoneScore = zoneScores[i]
    if (!zoneHasSymptomFindings(zoneScore)) continue
    if (zoneHasOccupantDenominator(zones[i])) continue
    const zoneName = zoneScore?.zoneName || zones[i]?.zn || `zone ${i + 1}`
    blockers.push(`Zone "${zoneName}" reports occupant symptoms but no occupant denominator (affected_count of total_count) was recorded.`)
  }

  // 6. Assessor name must not match placeholder patterns
  const assessorName = assessment.presurvey?.ps_assessor || assessment.profile?.name
  if (assessorName && ASSESSOR_PLACEHOLDER_PATTERNS.test(String(assessorName))) {
    blockers.push(`Assessor name "${assessorName}" matches a placeholder pattern. Replace with the actual licensed professional's name before finalizing.`)
  }
  // ─── end Fix 4 ──────────────────────────────────────────────────────

  // Sufficiency check per zone
  zones.forEach((z, i) => {
    const suff = evaluateAllSufficiency({ ...assessment.building, ...z })
    const insufficient = Object.entries(suff)
      .filter(([k, v]) => k !== '_overall' && v.isInsufficient)
      .map(([k]) => k)

    if (mode.id === 'FULL_ASSESSMENT' && insufficient.length > 0) {
      blockers.push(`Zone "${z.zn || i + 1}": ${insufficient.join(', ')} — insufficient data for FULL_ASSESSMENT.`)
    }
    if (suff._overall < 0.5) {
      warnings.push(`Zone "${z.zn || i + 1}": overall data sufficiency at ${Math.round(suff._overall * 100)}%.`)
    }
  })

  // Critical findings without recommendations
  if (criticalFindings.length > 0 && !hasImmediate) {
    blockers.push('Critical findings exist but no Immediate priority actions generated.')
  }
  if (highFindings.length > 0 && !hasImmediate && !hasEngineering) {
    blockers.push('High-severity findings exist with no matching Priority Actions.')
  }

  // Confidence warning
  if (assessment.confidence === 'Low' || assessment.confidence === 'Insufficient') {
    warnings.push(`Assessment confidence is ${assessment.confidence}. Consider additional data collection.`)
  }

  // Missing building metadata
  const bldg = assessment.building || {}
  if (!bldg.ba) warnings.push('Building year not recorded.')
  if (!bldg.ht) warnings.push('HVAC system type not recorded.')
  if (!bldg.fm) warnings.push('Filter type not recorded.')

  return {
    canFinalize: blockers.length === 0,
    blockers,
    warnings,
    mode: mode.id,
  }
}

export function derivePriorityActions(zoneScores) {
  const actions = { imm: [], eng: [], adm: [], mon: [] }

  ;(zoneScores || []).forEach(zs => {
    zs.cats.forEach(c => c.r.forEach(r => {
      if (r.sev === 'critical') {
        actions.imm.push({ zone: zs.zoneName, finding: r.t, timing: '0–7 days', action: deriveAction(r, zs.zoneName, 'critical') })
      }
      if (r.sev === 'high') {
        actions.eng.push({ zone: zs.zoneName, finding: r.t, timing: '7–30 days', action: deriveAction(r, zs.zoneName, 'high') })
      }
      if (r.sev === 'medium') {
        actions.adm.push({ zone: zs.zoneName, finding: r.t, timing: '30–90 days', action: deriveAction(r, zs.zoneName, 'medium') })
      }
    }))
  })

  // Always include monitoring
  actions.mon.push({ zone: 'All', finding: 'Ongoing', timing: 'Continuous', action: 'Conduct periodic reassessment to verify corrective action effectiveness and track IAQ trend data.' })

  // Deduplicate
  Object.keys(actions).forEach(k => {
    const seen = new Set()
    actions[k] = actions[k].filter(a => {
      const key = a.action
      if (seen.has(key)) return false
      seen.add(key); return true
    })
  })

  return actions
}

function deriveAction(finding, zone, severity) {
  const t = finding.t.toLowerCase()
  if (t.includes('co ') && t.includes('osha')) return `${zone}: Immediately evacuate and investigate combustion source. Ventilate before reoccupancy.`
  if (t.includes('formaldehyde') && t.includes('osha')) return `${zone}: Implement exposure controls per 29 CFR 1910.1048.`
  if (t.includes('mold') && t.includes('extensive')) return `${zone}: Engage qualified remediation contractor per IICRC S520.`
  if (t.includes('no supply airflow')) return `${zone}: Request immediate HVAC service to restore airflow.`
  if (t.includes('water') || t.includes('leak')) return `${zone}: Arrest water intrusion. Assess materials within 48 hours.`
  if (t.includes('co₂') || t.includes('ventilation')) return `${zone}: Evaluate outdoor air delivery rate. Verify OA damper position.`
  if (t.includes('pm2.5') || t.includes('pm')) return `Upgrade filtration to MERV 13+. Evaluate filter housing for bypass.`
  if (t.includes('maintenance')) return `Schedule comprehensive HVAC inspection including coil cleaning and controls verification.`
  if (t.includes('occupant') || t.includes('symptom')) return `${zone}: Document affected occupants and symptom patterns using NIOSH IEQ questionnaire or equivalent structured instrument.`
  if (t.includes('temperature') || t.includes('thermal')) return `${zone}: Verify thermostat setpoints and HVAC zoning for this area.`
  if (t.includes('humidity')) return `${zone}: Evaluate humidity control. Check for moisture sources.`
  return `${zone}: Address ${severity} finding — ${finding.t.slice(0, 80)}.`
}
