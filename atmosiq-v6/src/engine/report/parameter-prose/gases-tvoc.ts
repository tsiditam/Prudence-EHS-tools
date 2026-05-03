/**
 * AtmosFlow Engine v2.2 §8 — Total VOC (TVOC) parameter prose
 *
 * Cites Mølhave (1991) and Seifert (1990) IAQ engineering practice
 * for typical office TVOC backgrounds, notes the absence of a
 * regulatory limit for total VOCs, and points at TO-17 speciation as
 * the path to compound-level identification.
 */

import type { ParameterProse } from './types'

const TVOC_BACKGROUND = `Total Volatile Organic Compounds (TVOC) is a screening indicator that aggregates the photoionizable organic species detected by a photoionization detector (PID) into a single mass-equivalent concentration. No regulatory limit exists for total VOCs because the metric does not identify the individual compounds that drive toxicological assessment. Mølhave (1991, "Volatile organic compounds, indoor air quality and health," Indoor Air 1(4): 357–376) and Seifert (1990) describe typical office indoor TVOC backgrounds in the range of approximately 40 to 800 parts per billion under normal conditions, with sustained values above 1,000 ppb (~3 mg/m³) commonly interpreted in indoor air quality literature as warranting source investigation. Mølhave proposed advisory tiers — comfort range below 200 µg/m³, multifactorial exposure range 200 to 3,000 µg/m³, discomfort range above 3,000 µg/m³ — that remain widely cited as screening benchmarks despite not being regulatory limits. Definitive identification of individual VOC compounds requires sorbent-tube sampling with thermal desorption gas chromatography mass spectrometry per EPA Method TO-17. Photoionization detector response is also compound-dependent and depends on the calibration gas; values reported should be interpreted within ±25 percent uncertainty for mixed-VOC indoor environments.`

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
    const within = range.withinStandards
      ? 'were within typical office background ranges per Mølhave (1991) screening tiers'
      : 'were elevated relative to typical office background ranges per Mølhave (1991) screening tiers. No regulatory limit exists for total VOCs; confirmatory speciation per EPA Method TO-17 (sorbent tube sampling, thermal desorption GC/MS) is recommended when source investigation is warranted'
    const elevatedClause = !range.withinStandards && range.elevatedInZones && range.elevatedInZones.length > 0
      ? ` Elevated values were recorded in ${range.elevatedInZones.join(', ')}; per-zone values are presented in Appendix A.`
      : ''
    return `Total VOC concentrations recorded during the survey ranged from ${range.low} ${range.unit} to ${range.high} ${range.unit}, averaging ${range.average} ${range.unit}, and ${within}.${elevatedClause}`
  },
}
