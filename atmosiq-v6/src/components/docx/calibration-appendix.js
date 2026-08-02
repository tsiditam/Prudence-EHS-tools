/**
 * AtmosFlow — Calibration Appendix Mapper
 *
 * Pure function: takes a single-assessment context (presurvey only —
 * not the full `data` object) and emits the AppendixB + AppendixE
 * structures that sections-v21client.js renders.
 *
 * Lives outside src/engine/ on purpose. The TypeScript engine declares
 * appendixB / appendixE as optional readonly fields on
 * ClientReportAppendix but does not populate them today, so this is a
 * report-rendering augmentation layer — not engine work, no scoring
 * touched. The augmentation site is DocxReport.js, which spread-merges
 * the output into result.report.appendix before buildClientDocx reads
 * it.
 *
 * Calibration status is derived from getCalibrationBannerState() in
 * src/utils/instrumentRegistry.js — the same helper the dashboard
 * exception banner uses — so the in-app warning and the rendered
 * report agree on what "expiring" means. The 365-day validity figure
 * lives in instrumentRegistry.js and is the single source of truth;
 * 365 is the confirmed methodology figure (product decision, 2026-08),
 * and CLAUDE.md has been corrected to match.
 *
 * WHAT CALIBRATION STATE ACTUALLY DOES, since the QA notes below have
 * to state it accurately:
 *   • EXPIRED (>CAL_VALIDITY_DAYS) or MISSING metadata — interrupts
 *     finalization in MobileApp.finishAssessment with a warning listing
 *     what is missing. The assessor can acknowledge and proceed
 *     (finishAssessment(true)); it is a speed bump, not a hard block,
 *     and NO justification is captured when they do.
 *   • EXPIRING — surfaces here and in the in-app banner only.
 *   • NO RECORD AT ALL — additionally fires the engine's calibration
 *     data-gap trigger, which puts a warning on the cover and in the
 *     "Limitations on Reliance" section (engine v2.9+).
 *
 * Inputs that are missing or empty silently omit a row. The renderer
 * gates on instrumentRows.length > 0 / calibrationRecords.length > 0,
 * so callers that pass an empty presurvey get no appendix at all
 * (matches today's behavior).
 */

import { CAL_VALIDITY_DAYS, getCalibrationBannerState } from '../../utils/instrumentRegistry'

/**
 * Render a presurvey calibration-status field plus a calibration date
 * into a single display string suitable for an appendix table cell.
 *
 *   "Current — 287 days remaining"
 *   "EXPIRING — 12 days remaining"
 *   "EXPIRED — 31 days overdue"
 *   "Date not recorded"
 *
 * @param {string|null|undefined} calDate    ISO date string from presurvey.ps_inst_*_cal
 * @param {string|null|undefined} calStatus  human-readable status string (Current / Factory / etc.)
 * @param {Date} [now]                       injectable clock for testing
 * @returns {string}
 */
export function renderCalibrationStatus(calDate, calStatus, now = new Date()) {
  if (!calDate) {
    return calStatus && calStatus !== 'Unknown' && calStatus !== 'Not recorded'
      ? `${calStatus} — date not recorded`
      : 'Date not recorded'
  }
  const banner = getCalibrationBannerState('meter', calDate, now)
  if (!banner) {
    const daysSince = Math.floor((now.getTime() - new Date(calDate).getTime()) / 86400000)
    const remaining = CAL_VALIDITY_DAYS - daysSince
    return `Current — ${remaining} days remaining`
  }
  if (banner.kind === 'expired') {
    return `EXPIRED — ${Math.abs(banner.daysToExpiry)} days overdue`
  }
  if (banner.kind === 'expiring') {
    return `EXPIRING — ${banner.daysToExpiry} days remaining`
  }
  return 'Date not recorded'
}

/**
 * Build a single AppendixBInstrumentRow from presurvey fields. Returns
 * null when the make/model is missing.
 */
function instrumentRow(meter, serial, calDate, calStatus, parametersMeasured, now) {
  if (!meter || !String(meter).trim()) return null
  return {
    model: String(meter).trim(),
    serial: serial ? String(serial).trim() : '',
    lastCalibration: calDate ? String(calDate) : '',
    calibrationStatus: renderCalibrationStatus(calDate, calStatus, now),
    parametersMeasured: parametersMeasured || [],
  }
}

/**
 * Build a single AppendixECalibrationRow from presurvey fields. Returns
 * null when the make/model is missing. Same gating shape as appendix B
 * but with the (subtly different) field names appendix E expects.
 */
function calibrationRecord(meter, serial, calDate, calStatus, now) {
  if (!meter || !String(meter).trim()) return null
  return {
    instrumentModel: String(meter).trim(),
    serial: serial ? String(serial).trim() : '',
    lastCalibration: calDate ? String(calDate) : '',
    status: renderCalibrationStatus(calDate, calStatus, now),
  }
}

/**
 * Build appendix B + E from a presurvey object. The two appendices are
 * generated together because they cite the same instrument set —
 * appendix B documents methodology (what was measured with what), and
 * appendix E documents the calibration QA program for those same
 * instruments.
 *
 * @param {object} presurvey  the assessment's presurvey object (data.presurvey)
 * @param {object} [opts]
 * @param {Date}   [opts.now]  injectable clock for testing
 * @returns {{
 *   appendixB: { title: string, description: string, instrumentRows: Array, zoneRows: Array } | null,
 *   appendixE: { title: string, description: string, calibrationRecords: Array, qaNotes: Array } | null,
 * }}
 */
export function buildCalibrationAppendix(presurvey, opts = {}) {
  const now = opts.now || new Date()
  const ps = presurvey || {}

  // IAQ meter — CO2, Temperature, RH, and CO depending on the device.
  // The presurvey only carries the make/model string; we attribute the
  // ASHRAE-62.1-recoverable parameter set (the most defensible inference
  // since IAQ meters in this category universally cover that set).
  const iaqRow = instrumentRow(
    ps.ps_inst_iaq,
    ps.ps_inst_iaq_serial,
    ps.ps_inst_iaq_cal,
    ps.ps_inst_iaq_cal_status,
    ['CO₂', 'Temperature', 'Relative Humidity', 'CO'],
    now,
  )
  const pidRow = instrumentRow(
    ps.ps_inst_pid,
    ps.ps_inst_pid_serial,
    ps.ps_inst_pid_cal,
    ps.ps_inst_pid_cal_status,
    ['TVOC'],
    now,
  )
  const iaqRec = calibrationRecord(
    ps.ps_inst_iaq,
    ps.ps_inst_iaq_serial,
    ps.ps_inst_iaq_cal,
    ps.ps_inst_iaq_cal_status,
    now,
  )
  const pidRec = calibrationRecord(
    ps.ps_inst_pid,
    ps.ps_inst_pid_serial,
    ps.ps_inst_pid_cal,
    ps.ps_inst_pid_cal_status,
    now,
  )

  const instrumentRows = [iaqRow, pidRow].filter(Boolean)
  const calibrationRecords = [iaqRec, pidRec].filter(Boolean)

  if (instrumentRows.length === 0 && calibrationRecords.length === 0) {
    return { appendixB: null, appendixE: null }
  }

  // ── QA notes ────────────────────────────────────────────────────
  //
  // These sentences are client-facing assertions about AtmosFlow's own
  // controls, so they have to be literally true. Two previously were
  // not, and both were corrected in 2026-08:
  //
  //   1. "AtmosFlow blocks report finalization when any listed
  //      instrument is past validity." Overstated. Stale calibration
  //      INTERRUPTS finalization (MobileApp.finishAssessment) with a
  //      warning, but the assessor can acknowledge and proceed in one
  //      click — so "blocks" promised a hard control that is really a
  //      speed bump. Report EXPORT is not gated at all. (The engine's
  //      calibration data-gap trigger fires on the ABSENCE of a record,
  //      not on an expired one.)
  //
  //   2. "Finalization was permitted only via the documented override
  //      path." Doubly untrue: finalization was never blocked, so
  //      nothing needed permitting — and the override path it named is
  //      unreachable. `data.ihOverride` (DocxReport.js) is populated by
  //      no caller, because the preflight modal that set it was removed
  //      by product decision.
  //
  // Claiming a control that does not exist is worse than claiming none:
  // it invites a reader to rely on a safeguard that was never applied.
  const qaNotes = []
  qaNotes.push(
    `Calibration validity: ${CAL_VALIDITY_DAYS} days from the most recent calibration date. `
    + 'Instruments outside validity, or without a recorded calibration, interrupt assessment finalization '
    + 'with a warning the assessor must acknowledge before proceeding; the assessor of record determines '
    + 'whether the instrument record supports the conclusions drawn.',
  )
  const anyExpiring = calibrationRecords.some(r => r.status.startsWith('EXPIRING'))
  const anyExpired = calibrationRecords.some(r => r.status.startsWith('EXPIRED'))
  const anyUnrecorded = calibrationRecords.some(r => r.status === 'Date not recorded')
  if (anyExpired) {
    qaNotes.push(
      'One or more instruments listed below are PAST calibration validity. '
      + 'Measurements obtained with those instruments should be treated as screening-only, '
      + 'and any conclusion resting on them re-confirmed with an instrument within validity.',
    )
  } else if (anyExpiring) {
    qaNotes.push('One or more instruments are within the calibration warning window. Schedule recalibration before the next assessment.')
  }
  if (anyUnrecorded) {
    // This is the one calibration condition that DOES have a
    // report-level consequence: the engine's calibration trigger reads
    // the same presurvey fields (bridge/legacy.ts:654) and, when no
    // record exists at all, raises a data gap that surfaces on the cover
    // and in "Limitations on Reliance". Pointing there is accurate and
    // saves the reader correlating two sections.
    qaNotes.push(
      'One or more instruments have no recorded calibration date. Calibration provenance for the '
      + 'affected measurements cannot be verified from this assessment record. Where no instrument '
      + 'has a documented calibration record, this is also reported as a data gap on the cover and '
      + 'under "Limitations on Reliance".',
    )
  }

  return {
    appendixB: {
      title: 'Appendix B — Sampling Locations and Methodology',
      description: 'Instruments deployed during the assessment, the parameters they measured, and the calibration provenance for each unit.',
      instrumentRows,
      zoneRows: [],
    },
    appendixE: {
      title: 'Appendix E — Quality Assurance and Instrument Calibration',
      description: 'Per-instrument calibration records and QA notes supporting the defensibility of the measurements reported in the body of this report.',
      calibrationRecords,
      qaNotes,
    },
  }
}
