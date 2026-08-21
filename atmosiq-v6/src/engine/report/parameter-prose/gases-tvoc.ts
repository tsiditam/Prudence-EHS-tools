/**
 * AtmosFlow Engine v2.2 §8 — Total VOC (TVOC) parameter prose
 *
 * Cites Mølhave (1991) for typical office TVOC backgrounds and the
 * advisory tiers, notes the absence of a regulatory limit for total
 * VOCs, and points at TO-17 speciation as the path to compound-level
 * identification.
 *
 * Seifert (1990) was dropped in 2026-08: it was a second citation
 * supporting the same background range Mølhave already supports, and
 * the tiers the engine actually applies are Mølhave's. Two references
 * for one number is padding, and the weaker one goes — a 1990
 * Bundesgesundheitsamt document is the harder of the two for a reader
 * to obtain and check.
 */

import type { ParameterProse } from './types'

const TVOC_BACKGROUND = `Total Volatile Organic Compounds (TVOC) is an indicator that aggregates the photoionizable organic species detected by a photoionization detector (PID) into a single mass-equivalent concentration. No regulatory limit exists for total VOCs because the metric does not identify the individual compounds that drive toxicological assessment. Mølhave (1991, "Volatile organic compounds, indoor air quality and health," Indoor Air 1(4): 357–376) describes typical office indoor TVOC backgrounds in the range of approximately 40 to 800 parts per billion under normal conditions, with sustained values above 1,000 ppb (~3 mg/m³) commonly interpreted in indoor air quality literature as warranting source investigation. Mølhave proposed advisory tiers — comfort range below 200 µg/m³, multifactorial exposure range 200 to 3,000 µg/m³, discomfort range above 3,000 µg/m³ — that remain widely cited as benchmarks despite not being regulatory limits. Definitive identification of individual VOC compounds requires sorbent-tube sampling with thermal desorption gas chromatography mass spectrometry per EPA Method TO-17. Photoionization detector response is also compound-dependent and depends on the calibration gas; values reported should be interpreted within ±25 percent uncertainty for mixed-VOC indoor environments.`

export const TVOC_PROSE: ParameterProse = {
  parameter: 'Total Volatile Organic Compounds (TVOC)',
  standardsBackground: TVOC_BACKGROUND,
  applicableStandards: [
    { source: 'Mølhave, L. (1991). "Volatile organic compounds, indoor air quality and health." Indoor Air 1(4): 357–376.', authority: 'peer_reviewed', edition: '1991' },
    { source: 'EPA Method TO-17 — Determination of Volatile Organic Compounds via Thermal Desorption GC/MS', authority: 'consensus', edition: 'current' },
  ],
  summaryTemplate(range) {
    if (range.count === 0) return 'Total volatile organic compounds were not measured during this assessment.'
    const head = `Total VOCs ranged from ${range.low} to ${range.high} ${range.unit}, averaging ${range.average} ${range.unit}.`
    if (range.withinStandards === null) return head
    if (range.withinStandards) {
      return `${head} Concentrations are within typical office background per the Mølhave (1991) tiers, and no VOC condition was identified in any zone measured.`
    }
    const zones = range.elevatedInZones && range.elevatedInZones.length > 0
      ? ` Elevated in ${range.elevatedInZones.join(', ')}; per-zone values are in Appendix A.`
      : ''
    return `${head} Concentrations are above typical office background per the Mølhave (1991) tiers. TVOC is a non-specific sum; speciate per EPA Method TO-17 to identify the source.${zones}`
  },
}
