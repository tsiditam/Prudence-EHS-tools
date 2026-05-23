/**
 * Consultant Report Preflight
 *
 * Runs the v2.1 engine's refusal-to-issue triggers BEFORE the user hits
 * the Consultant DOCX path. Surfaces each fired trigger with plain-
 * language guidance so the IH can either fix the underlying data or
 * elect to issue under professional-judgment override.
 *
 * The engine itself (src/engine/) is untouched — we consume its public
 * API (`legacyToAssessmentScore`, `deriveAssessmentMeta`,
 * `evaluateRefusalTriggers`) but never modify it. The override path
 * (consultantReportOverride.js) mutates the *score* the engine produces,
 * not the engine.
 */

import { legacyToAssessmentScore, deriveAssessmentMeta } from '../engine/bridge'
import { evaluateRefusalTriggers } from '../engine/report/pre-assessment-memo'

/**
 * Defensibility requirements surfaced before report issuance, paired
 * with the IH-facing guidance the preflight modal renders. Order
 * matches the modal's render list so we don't reshuffle the user's
 * mental model.
 *
 * `overridable: true` means a reviewing IH may proceed under
 * documented professional judgment. `overridable: false` means the
 * requirement must be completed before issuance — proceeding without
 * it would produce a deliverable that no licensed professional has
 * actually signed off on.
 */
const TRIGGER_GUIDANCE = {
  no_measurement: {
    label: 'Instrument measurements not recorded',
    description:
      'No zones currently include direct-reading instrument data. ' +
      'A consultant report relies on at least one measurement to ' +
      'populate the Results section and per-zone tables.',
    fixWhere:
      'To resolve: open any zone → Measurements tab → record CO₂, PM2.5, ' +
      'CO, temperature, or relative humidity readings for the zones surveyed.',
    overridable: true,
    overrideCaveat:
      'The reviewing IH may proceed if a documented walkthrough or qualitative ' +
      'assessment provides sufficient basis. The final report will include a ' +
      'disclosure noting that direct-reading measurements were not collected.',
  },
  bulk_insufficiency: {
    label: 'Multiple zones below the data-sufficiency threshold',
    description:
      'More than half of the (zone × category) cells in this assessment ' +
      'are below their data-sufficiency threshold, which limits the ' +
      'reliability of category-level conclusions.',
    fixWhere:
      'To resolve: open the zones flagged with reduced sufficiency and ' +
      'complete the missing observations or measurements.',
    overridable: true,
    overrideCaveat:
      'The reviewing IH may proceed if professional judgment supports the ' +
      'conclusions despite the data gaps. The final report will include a ' +
      'disclosure noting the affected categories were scored under documented ' +
      'professional judgment.',
  },
  confidence_collapse: {
    label: 'No findings at validated or screening confidence',
    description:
      'Every finding in this assessment currently sits at the lowest ' +
      'confidence tier. A consultant-grade professional opinion is ' +
      'typically anchored to at least one finding at screening or ' +
      'validated confidence.',
    fixWhere:
      'To resolve: add an instrument-anchored measurement to at least ' +
      'one zone, or proceed under documented professional judgment.',
    overridable: true,
    overrideCaveat:
      'The reviewing IH may elect to issue based on qualitative ' +
      'observations. The final report will include a disclosure noting ' +
      'the confidence-tier override.',
  },
  calibration_absence: {
    label: 'Instrument calibration verification missing',
    description:
      'AtmosFlow requires documentation of instrument calibration status ' +
      'at the time of assessment to support technical defensibility and ' +
      'data reliability.',
    fixWhere:
      'To resolve: Pre-Survey → Instruments → add calibration date, field ' +
      'verification status, or calibration documentation for the instruments ' +
      'used during this assessment.\n\n' +
      'Note: Profile updates apply only to future assessments. Existing ' +
      'assessments must be updated individually.',
    overridable: true,
    overrideCaveat:
      'The reviewing IH may proceed without calibration documentation if ' +
      'sufficient technical justification exists. The final report will ' +
      'include a disclosure noting that standard calibration verification ' +
      'requirements were not fully satisfied.',
  },
  credential_absence: {
    label: 'Reviewer credentials required before issuance',
    description:
      'This assessment does not currently include a designated reviewing ' +
      'professional or documented reviewer credentials. Consultant-issued ' +
      'reports require at least one qualified reviewing professional, such ' +
      'as CIH, CSP, PE, or ROH.',
    fixWhere:
      'To resolve: add reviewer credentials under Profile → Credentials, ' +
      'or assign a qualified reviewing professional to this assessment.',
    overridable: false,
    overrideCaveat:
      'This requirement must be completed before report issuance.',
  },
  insufficient_opinion: {
    label: 'All findings sit at insufficient-data confidence',
    description:
      'Every finding across every zone currently sits at the ' +
      'insufficient-data confidence tier. A consultant-grade professional ' +
      'opinion typically requires at least one finding at provisional ' +
      'confidence or above.',
    fixWhere:
      'To resolve: add a measurement-backed observation to at least one ' +
      'finding, or proceed under documented professional judgment.',
    overridable: true,
    overrideCaveat:
      'The reviewing IH may elect to issue based on the available evidence. ' +
      'The final report will include a disclosure noting the confidence-tier ' +
      'override.',
  },
}

function fallbackGuidance(id) {
  return {
    label: id,
    description: 'Engine flagged a refusal trigger.',
    fixWhere: 'Review the assessment data.',
    overridable: false,
    overrideCaveat: '',
  }
}

/**
 * Build the AssessmentScore the engine sees, given the reportData
 * shape that DocxReport.executeExport passes in.
 */
export function buildScoreFromReportData(reportData) {
  const meta = deriveAssessmentMeta({
    profile: reportData.profile,
    presurvey: reportData.presurvey,
    building: reportData.building,
    assessmentDate: reportData.ts ? reportData.ts.slice(0, 10) : undefined,
  })
  return legacyToAssessmentScore(
    reportData.zoneScores || [],
    reportData.comp || null,
    reportData.zones || [],
    { meta, presurvey: reportData.presurvey, building: reportData.building },
  )
}

/**
 * Run the engine's refusal triggers and return structured preflight
 * info. `wouldRefuse` is true iff at least one trigger fired.
 */
export function runConsultantPreflight(reportData) {
  const score = buildScoreFromReportData(reportData)
  const triggers = evaluateRefusalTriggers(score)
  const fired = triggers.filter(t => t.fired)
  const enriched = fired.map(t => {
    const guidance = TRIGGER_GUIDANCE[t.id] || fallbackGuidance(t.id)
    return {
      id: t.id,
      engineDescription: t.description,
      ...guidance,
    }
  })
  return {
    wouldRefuse: fired.length > 0,
    triggers: enriched,
    score,
  }
}
