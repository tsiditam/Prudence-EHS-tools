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
 * Engine refusal triggers, paired with the IH-facing guidance the
 * preflight modal renders. Order matches the renderTriggers list in the
 * modal so we don't reshuffle the user's mental model.
 *
 * `overridable: true` means the IH can elect to issue under
 * professional-judgment override. `overridable: false` means the
 * underlying refusal cannot be honestly overridden (e.g., bypassing the
 * "no measurements" trigger would produce a report with empty Results
 * sections — not a flag, a fig leaf). For those triggers, the modal
 * only offers a "fix in app" path.
 */
const TRIGGER_GUIDANCE = {
  no_measurement: {
    label: 'No instrument measurements recorded',
    description:
      'The engine sees no zones with direct-reading instrument data. ' +
      'A consultant report needs at least one measurement to populate ' +
      'the Results section and per-zone tables.',
    fixWhere: 'Open any zone → Measurements tab → enter CO₂, PM2.5, CO, temperature, or RH.',
    overridable: true,
    overrideCaveat:
      'Overriding produces a report with empty / sparse Results sections. ' +
      'The cover notice will state this explicitly so recipients are not misled.',
  },
  bulk_insufficiency: {
    label: 'More than half of zone categories lack sufficient data',
    description:
      'Sufficiency is computed per (zone × category) cell. The engine ' +
      'flags the report as data-thin when over 50% of cells are below ' +
      'their sufficiency threshold.',
    fixWhere: 'Open the zones flagged with red sufficiency bars → fill in the missing fields.',
    overridable: true,
    overrideCaveat:
      'Overriding marks the affected categories as scored under IH judgment. ' +
      'Recipients see a prominent insufficient-data cover notice.',
  },
  confidence_collapse: {
    label: 'No findings at validated or screening confidence',
    description:
      'Every finding in the assessment is at the lowest confidence tier ' +
      '("insufficient_data"). The engine cannot anchor a professional ' +
      'opinion to evidence at that tier.',
    fixWhere: 'Add an instrument-anchored measurement to at least one zone, or override.',
    overridable: true,
    overrideCaveat:
      'Overriding bumps one finding to provisional-screening confidence ' +
      'and lets the report render. The cover notice flags the override.',
  },
  calibration_absence: {
    label: 'No instrument calibration record on file',
    description:
      'AtmosFlow checks that calibration date/status was captured at the ' +
      'time of the assessment. This is normally a hard gate — calibration ' +
      'verification is a litigation defense.',
    fixWhere:
      'Pre-Survey → Instruments → "Last factory/field calibration date" or "Calibration status." ' +
      'Note: updates to your profile only flow into NEW assessments — fix it on this one too.',
    overridable: true,
    overrideCaveat:
      'CLAUDE.md flags calibration gating as "Preserve" — overriding here is ' +
      'a deliberate professional judgment that takes precedence over the engine\'s ' +
      'standard defensibility check. The cover notice will state this explicitly.',
  },
  credential_absence: {
    label: 'No credentials on the preparing assessor or reviewer',
    description:
      'The preparing assessor has no listed credentials AND no reviewing ' +
      'professional is designated. A consultant report needs at least one ' +
      'licensed signer.',
    fixWhere:
      'Profile → Credentials → add CIH / CSP / PE / ROH. ' +
      'OR designate a reviewing professional on this assessment.',
    overridable: false,
    overrideCaveat:
      'Cannot honestly override — the report has no licensed signer. ' +
      'Add credentials before issuing.',
  },
  insufficient_opinion: {
    label: 'All findings are at insufficient-data confidence',
    description:
      'Every finding across every zone landed at the insufficient_data ' +
      'confidence tier. The engine cannot render a professional opinion ' +
      'without at least one finding at provisional or higher confidence.',
    fixWhere: 'Add a measurement-backed observation to at least one finding, or override.',
    overridable: true,
    overrideCaveat:
      'Overriding bumps the highest-quality finding to provisional confidence. ' +
      'The cover notice flags the override.',
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
