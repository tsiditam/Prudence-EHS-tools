/**
 * AtmosFlow 3.0 — Escalation registry (Phase 20).
 *
 * Some conditions bypass ordinary prioritization. These rules RE-EXPRESS the
 * legacy load-bearing "cap the score" decisions (multiple-contaminant
 * exceedance, critical-HVAC gate, active water, CO) as deterministic escalation
 * — conservatively, per open scientific questions #1–#2 in
 * docs/ATMOSFLOW_3_MIGRATION.md. Each rule carries its trigger, technical
 * basis, allowable response, professional-review requirement, and the
 * overstatements it must not license.
 *
 * These are AtmosFlow deterministic investigation methodology (not attributed
 * to any external body's escalation scheme). Thresholds await CIH sign-off;
 * until then they mirror the legacy trigger conditions verbatim.
 */

import { InvestigationPriority } from './types'
import { REFERENCES } from './references'
import { ZoneObservation, num } from './rules/common'
import { multipleTier1Exceedance } from './rules/contaminants'

export interface EscalationRule {
  ruleId: string
  description: string
  trigger: (z: ZoneObservation) => boolean
  priority: InvestigationPriority
  technicalBasis: string
  allowableResponse: string
  prohibitedOverstatement: string[]
  professionalReviewRequired: boolean
}

export interface EscalationNotice {
  ruleId: string
  zoneId: string
  priority: InvestigationPriority
  message: string
  technicalBasis: string
  allowableResponse: string
  professionalReviewRequired: boolean
  prohibitedOverstatement: string[]
}

export const ESCALATION_RULES: EscalationRule[] = [
  {
    ruleId: 'AF-ESC-MULTI-CONTAMINANT',
    description: 'Two or more Tier-1 contaminants numerically above their OSHA PEL.',
    trigger: (z) => multipleTier1Exceedance(z),
    priority: InvestigationPriority.IMMEDIATE_EVALUATION,
    technicalBasis: 'Multiple Tier-1 contaminants numerically above their OSHA PEL warrant immediate competent-person evaluation and confirmatory sampling. Screening spot readings do not establish TWA exceedances.',
    allowableResponse: 'Recommend immediate professional evaluation and confirmatory, method-appropriate sampling.',
    prohibitedOverstatement: ['OSHA violation', 'confirmed overexposure', '8-hour TWA exceeded'],
    professionalReviewRequired: true,
  },
  {
    ruleId: 'AF-ESC-CO-ABOVE-PEL',
    description: 'Carbon monoxide numerically above the OSHA PEL.',
    trigger: (z) => {
      const co = num(z.co)
      return co !== undefined && co > (REFERENCES.co_osha_pel.value as number)
    },
    priority: InvestigationPriority.PRIORITY,
    technicalBasis: 'A CO spot reading above the OSHA PEL warrants prompt source identification. Interim policy pending CIH determination (open question #2); no immediate-danger language without documented sustained levels.',
    allowableResponse: 'Recommend prompt combustion-source inspection and time-weighted CO characterization.',
    prohibitedOverstatement: ['immediate danger to life', 'CO 8-hour TWA exceeded'],
    professionalReviewRequired: true,
  },
  {
    ruleId: 'AF-ESC-HVAC-CRITICAL',
    description: 'Critical HVAC hygiene/air-distribution condition (drain-pan standing water or bio-growth, no supply airflow, or no filtration).',
    trigger: (z) =>
      z.dp === 'Standing water' || z.dp === 'Bio growth observed' ||
      z.sa === 'No airflow detected' || z.fm === 'No filter',
    priority: InvestigationPriority.PRIORITY,
    technicalBasis: 'Directly observed critical HVAC hygiene/air-distribution conditions warrant prompt corrective action; drain-pan moisture additionally warrants Legionella evaluation per ASHRAE 188 absent a Water Management Program.',
    allowableResponse: 'Recommend prompt HVAC correction and, for drain-pan moisture, ASHRAE 188 evaluation.',
    prohibitedOverstatement: ['building is unsafe', 'Legionella present', 'health risk established'],
    professionalReviewRequired: false,
  },
  {
    ruleId: 'AF-ESC-ACTIVE-WATER',
    description: 'Active water intrusion or extensive water damage.',
    trigger: (z) => z.wd === 'Active leak' || z.wd === 'Extensive damage',
    priority: InvestigationPriority.PRIORITY,
    technicalBasis: 'Directly observed active/extensive water intrusion warrants prompt source control and drying to limit microbial amplification.',
    allowableResponse: 'Recommend prompt source control, documented dry-out, and concealed-space investigation.',
    prohibitedOverstatement: ['mold contamination confirmed', 'health hazard established'],
    professionalReviewRequired: false,
  },
  {
    ruleId: 'AF-ESC-MICROBIAL-EXTENSIVE',
    description: 'Extensive visible suspected microbial growth.',
    trigger: (z) => !!z.mi && z.mi.includes('Extensive'),
    priority: InvestigationPriority.PRIORITY,
    technicalBasis: 'Extensive visible suspected microbial growth warrants professional remediation assessment per IICRC S520. Visual observation does not confirm identification or establish health risk.',
    allowableResponse: 'Recommend professional remediation assessment (IICRC S520); sample with an outdoor reference if identification is warranted.',
    prohibitedOverstatement: ['confirmed toxic mold', 'mold caused occupant illness'],
    professionalReviewRequired: true,
  },
]

/** Evaluate all escalation rules against a zone; returns the notices that fired. */
export function evaluateEscalations(z: ZoneObservation, zoneId: string): EscalationNotice[] {
  return ESCALATION_RULES.filter((r) => r.trigger(z)).map((r) => ({
    ruleId: r.ruleId,
    zoneId,
    priority: r.priority,
    message: r.description,
    technicalBasis: r.technicalBasis,
    allowableResponse: r.allowableResponse,
    professionalReviewRequired: r.professionalReviewRequired,
    prohibitedOverstatement: r.prohibitedOverstatement,
  }))
}
