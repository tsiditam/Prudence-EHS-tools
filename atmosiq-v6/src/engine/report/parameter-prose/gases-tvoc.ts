/**
 * AtmosFlow Engine v2.2 §8 — Total VOC (TVOC) parameter prose
 *
 * Cites Mølhave (1991) and Seifert (1990) IAQ engineering practice
 * for typical office TVOC backgrounds, notes the absence of a
 * regulatory limit for total VOCs, and points at TO-17 speciation as
 * the path to compound-level identification.
 */

import type { ParameterProse } from './types'

const TVOC_BACKGROUND = `Total Volatile Organic Compounds (TVOC) is an indicator that aggregates the photoionizable organic species detected by a photoionization detector (PID) into a single mass-equivalent concentration. No regulatory limit exists for total VOCs because the metric does not identify the individual compounds that drive toxicological assessment. Mølhave (1991, "Volatile organic compounds, indoor air quality and health," Indoor Air 1(4): 357–376) and Seifert (1990) describe typical office indoor TVOC backgrounds in the range of approximately 40 to 800 parts per billion under normal conditions, with sustained values above 1,000 ppb (~3 mg/m³) commonly interpreted in indoor air quality literature as warranting source investigation. Mølhave proposed advisory tiers — comfort range below 200 µg/m³, multifactorial exposure range 200 to 3,000 µg/m³, discomfort range above 3,000 µg/m³ — that remain widely cited as benchmarks despite not being regulatory limits. Definitive identification of individual VOC compounds requires sorbent-tube sampling with thermal desorption gas chromatography mass spectrometry per EPA Method TO-17. Photoionization detector response is also compound-dependent and depends on the calibration gas; values reported should be interpreted within ±25 percent uncertainty for mixed-VOC indoor environments.`

export const TVOC_PROSE: ParameterProse = {
  parameter: 'Total Volatile Organic Compounds (TVOC)',
  standardsBackground: TVOC_BACKGROUND,
  applicableStandards: [
    { source: 'Mølhave, L. (1991). "Volatile organic compounds, indoor air quality and health." Indoor Air 1(4): 357–376.', authority: 'peer_reviewed', edition: '1991' },
    { source: 'Seifert (1990) — Regulating Indoor Air (Bundesgesundheitsamt)', authority: 'advisory', edition: '1990' },
    { source: 'EPA Method TO-17 — Determination of Volatile Organic Compounds via Thermal Desorption GC/MS', authority: 'consensus', edition: 'current' },
  ],
  summaryTemplate(range) {
    if (range.count === 0) return 'Total volatile organic compounds were not measured during this assessment.'
    const head = `Total VOCs ranged from ${range.low} to ${range.high} ${range.unit}, averaging ${range.average} ${range.unit}.`
    if (range.withinStandards) {
      return `${head} Concentrations are within typical office background per the Mølhave (1991) tiers.`
    }
    const zones = range.elevatedInZones && range.elevatedInZones.length > 0
      ? ` Elevated in ${range.elevatedInZones.join(', ')}; per-zone values are in Appendix A.`
      : ''
    return `${head} Concentrations are above typical office background per the Mølhave (1991) tiers. TVOC is a non-specific sum; speciate per EPA Method TO-17 to identify the source.${zones}`
  },
}
