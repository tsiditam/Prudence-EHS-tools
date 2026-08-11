/**
 * AtmosFlow 3.0 — zone & building investigation orchestrator (Stage 2/3 seam).
 *
 * Runs every domain rule engine over a zone, applies the escalation registry
 * to the matching findings, and derives the conservative AssessmentSummary.
 * This is the function the version-routed dispatch (Stage 3) will call for
 * engine >= 3.0 assessments in place of the legacy scoreZone/compositeScore.
 *
 * Pure and deterministic given (zone, ctx). No numeric risk score is produced.
 */

import {
  AssessmentSummary,
  InvestigationFinding,
  InvestigationPriority,
  PRIORITY_ORDER,
} from './types'
import { deriveAssessmentSummary } from './summary'
import {
  EscalationNotice,
  evaluateEscalations,
} from './escalation'
import { InvestigationContext, ZoneObservation, resetSequences } from './rules/common'
import { assessVentilation } from './rules/ventilation'
import { assessContaminants } from './rules/contaminants'
import { assessMoisture } from './rules/moisture'
import { assessHvac } from './rules/hvac'
import { assessThermal } from './rules/thermal'
import { assessOccupant } from './rules/occupant'
import { assessSourcesPathways } from './rules/sourcesPathways'

export interface ZoneInvestigation {
  zoneId: string
  zoneName: string
  findings: InvestigationFinding[]
  escalations: EscalationNotice[]
}

export interface BuildingInvestigation {
  engineVersion: string
  zones: ZoneInvestigation[]
  summary: AssessmentSummary
  professionalReviewRequired: boolean
}

/** Escalation ruleId → the finding ruleIds it elevates. */
const ESCALATION_TARGETS: Record<string, string[]> = {
  'AF-ESC-MULTI-CONTAMINANT': ['AF-CONT-CO', 'AF-CONT-HCHO'],
  'AF-ESC-CO-ABOVE-PEL': ['AF-CONT-CO'],
  'AF-ESC-HVAC-CRITICAL': ['AF-HVAC-DRAINPAN', 'AF-HVAC-NOAIR', 'AF-HVAC-NOFILTER'],
  'AF-ESC-ACTIVE-WATER': ['AF-MOIST-WATER'],
  'AF-ESC-MICROBIAL-EXTENSIVE': ['AF-MOIST-MICRO'],
}

function maxPriority(a: InvestigationPriority, b: InvestigationPriority): InvestigationPriority {
  return PRIORITY_ORDER[a] >= PRIORITY_ORDER[b] ? a : b
}

export function assessZoneV3(z: ZoneObservation, ctx: InvestigationContext): ZoneInvestigation {
  const zoneId = z.zid || z.zn || 'zone'
  const zoneName = z.zn || zoneId

  const findings: InvestigationFinding[] = [
    ...assessVentilation(z, ctx),
    ...assessContaminants(z, ctx),
    ...assessMoisture(z, ctx),
    ...assessHvac(z, ctx),
    ...assessThermal(z, ctx),
    ...assessOccupant(z, ctx),
    ...assessSourcesPathways(z, ctx),
  ]

  const escalations = evaluateEscalations(z, zoneId)

  // Apply escalation to the matching findings (elevate priority; set review flag).
  for (const esc of escalations) {
    const targets = ESCALATION_TARGETS[esc.ruleId] || []
    for (const f of findings) {
      if (targets.includes(f.ruleId)) {
        f.investigationPriority = maxPriority(f.investigationPriority, esc.priority)
        if (esc.professionalReviewRequired) f.professionalReviewRequired = true
      }
    }
  }

  return { zoneId, zoneName, findings, escalations }
}

export function assessBuildingV3(
  zones: ZoneObservation[],
  ctx: InvestigationContext,
): BuildingInvestigation {
  resetSequences()
  const zoneResults = zones.map((z) => assessZoneV3(z, ctx))
  const allFindings = zoneResults.flatMap((z) => z.findings)
  const allEscalations = zoneResults.flatMap((z) => z.escalations)

  const summary = deriveAssessmentSummary(allFindings)

  // Escalations can raise the highest priority beyond what findings alone imply.
  let highest = summary.highestPriority
  for (const e of allEscalations) highest = maxPriority(highest, e.priority)
  summary.highestPriority = highest

  const professionalReviewRequired =
    allFindings.some((f) => f.professionalReviewRequired) ||
    allEscalations.some((e) => e.professionalReviewRequired)

  return {
    engineVersion: ctx.engineVersion,
    zones: zoneResults,
    summary,
    professionalReviewRequired,
  }
}
