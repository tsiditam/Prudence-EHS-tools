/**
 * AtmosFlow Engine v2.2 §8 — Parameter Prose Module Types
 *
 * Each parameter-prose module exports a ParameterProse describing the
 * regulatory and industry-standards background for a single measured
 * parameter and a summaryTemplate function that produces a CIH-
 * conservative measurement-summary paragraph from a ParameterRange.
 */

import type { Citation } from '../../types/citation'
import type { ParameterRange } from '../parameter-ranges'

export interface ParameterProse {
  readonly parameter: string
  readonly standardsBackground: string
  readonly summaryTemplate: (range: ParameterRange) => string
  readonly applicableStandards: ReadonlyArray<Citation>
}

export type { ParameterRange }
