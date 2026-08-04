/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Mold screening — IICRC S520 remediation-Condition classifier.
 *
 * Suggests a Condition (1 normal ecology / 2 settled spores / 3 actual growth)
 * for one indoor environment from the observed evidence. In S520 the Condition
 * is a PROFESSIONAL determination; this module produces a SCREENING-suggested
 * condition with an explicit `basis`, and the orchestrator always attaches the
 * "confirm with a qualified professional" caveat. Evidence-driven and
 * deterministic — no numbers invented, no health claim made.
 */

import { REMEDIATION_CONDITIONS } from '../../constants/moldStandards.js'
import { SPORE_SCREENING } from '../../constants/moldStandards.js'

/**
 * @param {{
 *   visibleGrowth?: boolean,
 *   hiddenSuspected?: boolean,
 *   mustyOdor?: boolean,
 *   moistureElevated?: boolean,
 *   sporeOutcome?: string|null
 * }} ev
 * @returns {{ conditionId: 1|2|3, label: string, definition: string, basis: string[], source: string }}
 */
export function classifyCondition(ev = {}) {
  const basis = []
  let conditionId = 1

  if (ev.visibleGrowth) { basis.push('Visible mold growth observed'); conditionId = 3 }
  if (ev.hiddenSuspected) { basis.push('Hidden growth suspected (cavity/system)'); conditionId = 3 }

  if (conditionId !== 3) {
    const amplification = ev.sporeOutcome === SPORE_SCREENING.outcomes.possibleAmplificationIndicator
    if (amplification) {
      basis.push('Comparative spore screening indicates possible amplification (settled spores)')
      conditionId = 2
    } else if (ev.mustyOdor && ev.moistureElevated) {
      basis.push('Musty odor with elevated moisture — possible hidden growth / settled spores')
      conditionId = 2
    }
  }

  if (!basis.length) basis.push('No visible growth, amplification indicators, or moisture/odor signals observed')

  const cond = REMEDIATION_CONDITIONS[conditionId]
  return {
    conditionId,
    label: cond.label,
    definition: cond.definition,
    basis,
    source: cond.source,
  }
}
