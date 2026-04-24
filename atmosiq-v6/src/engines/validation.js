/**
 * AtmosFlow Assessment Validation — v2.3
 * Pre-finalize gate. Blockers prevent report rendering.
 * Priority Actions derived from findings — cannot be empty when findings exist.
 */

import { ASSESSMENT_MODES } from './riskBands'
import { evaluateAllSufficiency } from './sufficiency'

export function validateAssessment(assessment) {
  const blockers = []
  const warnings = []
  const mode = ASSESSMENT_MODES[assessment.assessmentMode] || ASSESSMENT_MODES.FULL_ASSESSMENT
  const zones = assessment.zones || []
  const allFindings = (assessment.zoneScores || []).flatMap(zs => zs.cats.flatMap(c => c.r))
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
  if (t.includes('occupant') || t.includes('symptom')) return `${zone}: Document affected occupants and symptom patterns. Consider EPA BASE survey.`
  if (t.includes('temperature') || t.includes('thermal')) return `${zone}: Verify thermostat setpoints and HVAC zoning for this area.`
  if (t.includes('humidity')) return `${zone}: Evaluate humidity control. Check for moisture sources.`
  return `${zone}: Address ${severity} finding — ${finding.t.slice(0, 80)}.`
}
