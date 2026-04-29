/**
 * AtmosFlow Engine v2.2 §8 — Carbon Dioxide (CO₂) parameter prose
 *
 * Cites ASHRAE 62.1 differential surrogate methodology, sedentary-
 * office bioeffluent thresholds, OSHA PEL, and the Persily ASHRAE
 * Journal 2021 caveat (CO₂ is a ventilation effectiveness indicator,
 * not an air quality contaminant).
 */

import type { ParameterProse } from './types'

const CO2_BACKGROUND = `Carbon dioxide is widely used in indoor air quality evaluations as a surrogate indicator of ventilation effectiveness rather than as an air quality contaminant in its own right. ASHRAE Standard 62.1 — Ventilation for Acceptable Indoor Air Quality — does not establish an indoor CO₂ concentration limit; the historical 700 ppm differential threshold above outdoor concentration is a sedentary-office bioeffluent perception threshold, drawn from a since-removed informative appendix and intended as a screening reference for whether outdoor-air ventilation is matched to occupant load. Indoor CO₂ values approaching 1,000 ppm with sustained occupancy are commonly interpreted as suggestive of ventilation that may be below the rate required for the observed occupancy; values above 2,500 ppm are sometimes associated with self-reported drowsiness and concentration symptoms in indoor air quality literature. The Occupational Safety and Health Administration Permissible Exposure Limit for carbon dioxide is 5,000 ppm over an 8-hour Time Weighted Average (29 CFR 1910.1000 Table Z-1); typical indoor office CO₂ measurements fall well below this regulatory limit. Per Persily (ASHRAE Journal 2021, "Indoor Carbon Dioxide Concentrations and Indoor Air Quality"), CO₂ should be interpreted strictly as a ventilation effectiveness indicator. Definitive determination of outdoor-air delivery requires direct measurement of supply airflow and outdoor-air fraction at the air handler per AABC or NEBB methodology.`

export const CO2_PROSE: ParameterProse = {
  parameter: 'Carbon Dioxide (CO₂)',
  standardsBackground: CO2_BACKGROUND,
  applicableStandards: [
    { source: 'ASHRAE Standard 62.1 — Ventilation for Acceptable Indoor Air Quality', authority: 'consensus', edition: 'current' },
    { source: '29 CFR 1910.1000 Table Z-1 — Carbon Dioxide PEL 5,000 ppm 8-hr TWA', authority: 'regulatory', edition: 'current' },
    { source: 'Persily — ASHRAE Journal: Indoor Carbon Dioxide Concentrations and Indoor Air Quality', authority: 'peer_reviewed', edition: '2021' },
  ],
  summaryTemplate(range) {
    if (range.count === 0) return 'Carbon dioxide was not measured during this assessment.'
    const outdoorClause = range.outdoorReference !== undefined
      ? ` Outdoor CO₂ reference for the day of survey was ${range.outdoorReference} ${range.unit}, producing an indoor differential range of ${(range.low - range.outdoorReference).toFixed(0)} to ${(range.high - range.outdoorReference).toFixed(0)} ${range.unit} above outdoor.`
      : ''
    const within = range.withinStandards
      ? 'were within the ASHRAE 62.1 screening reference of 700 ppm above outdoor (or 1,000 ppm absolute when no outdoor reference was available) and well below the OSHA PEL of 5,000 ppm'
      : 'exceeded the ASHRAE 62.1 screening reference of 700 ppm above outdoor (or 1,000 ppm absolute when no outdoor reference was available), suggesting outdoor-air delivery may be below the rate required for the observed occupancy. The values remained well below the OSHA PEL of 5,000 ppm 8-hour TWA'
    const elevatedClause = !range.withinStandards && range.elevatedInZones && range.elevatedInZones.length > 0
      ? ` Elevated values were recorded in ${range.elevatedInZones.join(', ')}; per-zone values are presented in Appendix A.`
      : ''
    return `Carbon dioxide concentrations recorded during the survey ranged from ${range.low} ${range.unit} to ${range.high} ${range.unit}, averaging ${range.average} ${range.unit}, and ${within}.${outdoorClause}${elevatedClause}`
  },
}
