/**
 * AtmosFlow Assessment Validation — pre-finalize gate.
 * Priority Actions derived from findings — cannot be empty when findings
 * exist.
 *
 * Engine v2.7 Fix 4 — extended evidentiary completeness checks beyond
 * instrument calibration. Reports finalized today with placeholder
 * data ("Not Specified" client, no occupant denominator, no photos
 * for Critical findings) created defensibility liability.
 *
 * Severity tiers (v2.8): each check is classified `hard` or
 * `dismissible`.
 *   • HARD blockers prevent finalization (canFinalize === false):
 *     instrument registration, calibration, client name, site contact
 *     name + role, and photo evidence for Critical/High zones. These
 *     are the load-bearing defensibility + litigation items.
 *   • DISMISSIBLE blockers are surfaced with the same field/location
 *     detail but do NOT block finalization — the licensed assessor may
 *     proceed and the item is logged for the CIH review: requested-by
 *     provenance, occupant denominator, assessor-name placeholder, and
 *     findings-without-recommendations completeness.
 *
 * Each blocker is a structured object:
 *   { id, field, label, message, location, severity }
 * so callers can point the assessor at the exact field and screen
 * rather than surfacing a generic error.
 *
 * Client identity is autowired from `presurvey.ps_recipient_*` (the
 * fields the intake actually captures, per src/engine/bridge/meta.ts)
 * when an explicit `client` object is not supplied, so the gate reads
 * the recipient data the assessor entered instead of an empty object.
 *
 * The gate returns:
 *   { canFinalize, blockers, hardBlockers, dismissibleBlockers,
 *     warnings, mode }
 * `blockers` remains a string[] of HARD blocker messages for back-compat.
 */

import { ASSESSMENT_MODES } from './riskBands'
import { evaluateAllSufficiency } from './sufficiency'

const NOT_SPECIFIED_PATTERNS = /^(not specified|n\/a|na|none|tbd|todo)$/i
const ASSESSOR_PLACEHOLDER_PATTERNS = /\b(hobo lobo|lorem|ipsum|test user|placeholder|example name|john doe|jane doe)\b/i

// Where the assessor fixes each field. Surfaced verbatim in the
// Readiness panel and the consultant preflight so "what's missing"
// always comes with "where to fix it".
const LOC = {
  recipientOrg:  'Assessment Details → Client / Recipient → Recipient organization',
  recipientName: 'Assessment Details → Client / Recipient → Recipient name',
  recipientRole: 'Assessment Details → Client / Recipient → Recipient title',
  assessor:      'Pre-Survey → Assessor → Assessor name and credentials',
  instrument:    'Pre-Survey → Instruments → Primary IAQ meter',
  calibration:   'Pre-Survey → Instruments → Calibration status',
  zonePhotos:    (z) => `Zone "${z}" → attach a photo, or mark "photo capture not feasible" with justification`,
  zoneOccupants: (z) => `Zone "${z}" → "How many affected?" (affected) + "Occupant count?" (total)`,
  recommendations: 'Results → Actions → priority recommendations',
}

function isMissingOrPlaceholder(value) {
  if (value == null) return true
  const s = String(value).trim()
  if (s.length === 0) return true
  if (NOT_SPECIFIED_PATTERNS.test(s)) return true
  return false
}

function zoneHasSymptomFindings(zoneScore) {
  if (!zoneScore || !zoneScore.cats) return false
  // Only non-pass findings count. Scoring pushes {t:'No complaints', sev:'pass'}
  // for cx='No complaints', and that text matches /complaint/ — without the
  // sev filter, a zone explicitly reporting "No complaints" would falsely
  // trigger the occupant-denominator gap.
  return zoneScore.cats.some(c => (c.r || []).some(r =>
    r && r.sev !== 'pass' && typeof r.t === 'string' && /symptom|occupant|complaint|headache|irritation|fatigue/i.test(r.t)
  ))
}

function present(v) {
  return v != null && String(v).trim() !== ''
}

function zoneHasOccupantDenominator(zone) {
  if (!zone) return false
  // Autowire from the fields zone intake actually captures: `oc`
  // (occupant count → total) and `ac` (affected range). Falls back to
  // the explicit denominator fields when supplied directly.
  const total = zone.total_count ?? zone.totalOccupants ?? zone.occupant_total ?? zone.oc
  const affected = zone.affected_count ?? zone.affectedOccupants ?? zone.occupant_affected ?? zone.ac
  return present(total) && present(affected)
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
  const hardBlockers = []
  const dismissibleBlockers = []
  const warnings = []
  const addHard = (id, field, label, message, location) =>
    hardBlockers.push({ id, field, label, message, location, severity: 'hard' })
  const addDismissible = (id, field, label, message, location) =>
    dismissibleBlockers.push({ id, field, label, message, location, severity: 'dismissible' })

  const mode = ASSESSMENT_MODES[assessment.assessmentMode] || ASSESSMENT_MODES.FULL_ASSESSMENT
  const zones = assessment.zones || []
  const zoneScores = assessment.zoneScores || []
  const allFindings = zoneScores.flatMap(zs => zs.cats.flatMap(c => c.r))
  const criticalFindings = allFindings.filter(f => f.sev === 'critical')
  const highFindings = allFindings.filter(f => f.sev === 'high')
  const recs = assessment.recs || {}
  const hasImmediate = (recs.imm || []).length > 0
  const hasEngineering = (recs.eng || []).length > 0

  // Instrument registration — HARD (calibration gate, CLAUDE.md mandate)
  if (mode.requiresInstruments && !assessment.presurvey?.ps_inst_iaq) {
    addHard('instrument_missing', 'ps_inst_iaq', 'Instrument not registered',
      'No instrument registered. Required for ' + mode.id + ' mode.', LOC.instrument)
  }

  // Calibration — HARD (calibration gate, CLAUDE.md mandate)
  if (mode.requiresCalibration && assessment.presurvey?.ps_inst_iaq) {
    const calStatus = assessment.presurvey?.ps_inst_iaq_cal_status || ''
    if (!calStatus.includes('within manufacturer') && !calStatus.includes('Calibrated')) {
      addHard('calibration_unconfirmed', 'ps_inst_iaq_cal_status', 'Calibration not confirmed',
        'Instrument calibration not confirmed. Required for FULL_ASSESSMENT mode.', LOC.calibration)
    }
  }

  // ─── Evidentiary completeness ───────────────────────────────────────
  // Client identity autowires from presurvey.ps_recipient_* (the fields
  // intake captures) when no explicit client object is supplied.
  const client = assessment.client || {}
  const building = assessment.building || {}
  const presurvey = assessment.presurvey || {}
  const clientName = client.name || client.organization || building.client_name || presurvey.ps_recipient_organization
  const contactName = client.contact_name || presurvey.ps_recipient_name
  const contactRole = client.contact_role || presurvey.ps_recipient_title
  const requestedBy = client.requested_by || client.requestedBy || presurvey.ps_recipient_name

  // Client name — HARD
  if (isMissingOrPlaceholder(clientName)) {
    addHard('client_name', 'ps_recipient_organization', 'Client name missing',
      'Client name is empty or "Not Specified". A real client name is required for report finalization.', LOC.recipientOrg)
  }

  // Site contact name + role — HARD
  if (isMissingOrPlaceholder(contactName)) {
    addHard('contact_name', 'ps_recipient_name', 'Site contact name missing',
      'Site contact name is missing. Reports are addressed to a person, not a building.', LOC.recipientName)
  }
  if (isMissingOrPlaceholder(contactRole)) {
    addHard('contact_role', 'ps_recipient_title', 'Site contact role missing',
      'Site contact role is missing (e.g. Facility Manager, Building Owner, EHS Director).', LOC.recipientRole)
  }

  // Requested-by provenance — DISMISSIBLE
  if (requestedBy != null && requestedBy !== '') {
    const facilityName = building.fn || building.name || ''
    if (facilityName && String(requestedBy).trim() === String(facilityName).trim()) {
      addDismissible('requested_by_facility', 'ps_recipient_name', 'Requested-by is the facility name',
        'Requested-by is set to the facility name with no person attached. Buildings do not request reports — capture the requester\'s name.', LOC.recipientName)
    }
  }

  // Critical/High findings need photo evidence (or explicit override) — HARD
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
    addHard(`photo_${zoneName}`, 'photos', 'Critical/High finding without photo',
      `Zone "${zoneName}" has Critical or High findings but no photo evidence and no "photo capture not feasible" override with justification.`, LOC.zonePhotos(zoneName))
  }

  // Occupant denominator for symptomatic zones — DISMISSIBLE
  for (let i = 0; i < zones.length; i++) {
    const zoneScore = zoneScores[i]
    if (!zoneHasSymptomFindings(zoneScore)) continue
    if (zoneHasOccupantDenominator(zones[i])) continue
    const zoneName = zoneScore?.zoneName || zones[i]?.zn || `zone ${i + 1}`
    addDismissible(`occupant_denom_${zoneName}`, 'ac', 'Occupant denominator missing',
      `Zone "${zoneName}" reports occupant symptoms but no occupant denominator was recorded — set "How many affected?" (the affected count) to complete the affected-of-total figure.`, LOC.zoneOccupants(zoneName))
  }

  // Assessor name placeholder — DISMISSIBLE
  const assessorName = assessment.presurvey?.ps_assessor || assessment.profile?.name
  if (assessorName && ASSESSOR_PLACEHOLDER_PATTERNS.test(String(assessorName))) {
    addDismissible('assessor_placeholder', 'ps_assessor', 'Assessor name looks like a placeholder',
      `Assessor name "${assessorName}" matches a placeholder pattern. Replace with the actual licensed professional's name before finalizing.`, LOC.assessor)
  }
  // ─── end evidentiary completeness ───────────────────────────────────

  // Sufficiency check per zone — surfaced as warnings, not blockers.
  // Rationale: per-category sufficiency is a confidence signal, not a
  // defensibility-required field. The canonical Finalization Gate is the
  // six-blocker spec above (client/contact/photos/denominator/assessor).
  // Insufficient categories already propagate via `qualitative_only` +
  // `insufficientCats` into the rendered report (DOCX + PrintReport both
  // annotate affected zones), and the bulk-insufficiency refusal trigger
  // in `src/engine/report/pre-assessment-memo.ts` still intercepts the
  // >50%-cells-insufficient case. Hard-blocking finalization on top of
  // those layers locked the IH out of generating any report at all when
  // a single category fell short — surfacing as a warning keeps the
  // signal visible without taking the report hostage.
  zones.forEach((z, i) => {
    const suff = evaluateAllSufficiency({ ...assessment.building, ...z })
    const insufficient = Object.entries(suff)
      .filter(([k, v]) => k !== '_overall' && v.isInsufficient)
      .map(([k]) => k)

    if (mode.id === 'FULL_ASSESSMENT' && insufficient.length > 0) {
      warnings.push(`Zone "${z.zn || i + 1}": ${insufficient.join(', ')} — insufficient data for FULL_ASSESSMENT. Report will render with reduced confidence; affected categories will be flagged in the audit trail.`)
    }
    if (suff._overall < 0.5) {
      warnings.push(`Zone "${z.zn || i + 1}": overall data sufficiency at ${Math.round(suff._overall * 100)}%.`)
    }
  })

  // Findings without recommendations — DISMISSIBLE (completeness signal)
  if (criticalFindings.length > 0 && !hasImmediate) {
    addDismissible('critical_no_imm', 'recs', 'Critical findings without Immediate actions',
      'Critical findings exist but no Immediate priority actions generated.', LOC.recommendations)
  }
  if (highFindings.length > 0 && !hasImmediate && !hasEngineering) {
    addDismissible('high_no_recs', 'recs', 'High findings without Priority Actions',
      'High-severity findings exist with no matching Priority Actions.', LOC.recommendations)
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
    canFinalize: hardBlockers.length === 0,
    blockers: hardBlockers.map(b => b.message),
    hardBlockers,
    dismissibleBlockers,
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
