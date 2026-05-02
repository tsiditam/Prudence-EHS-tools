/**
 * AtmosFlow Engine v2.2 §8 — Carbon Dioxide (CO₂) parameter prose
 *
 * Cites ASHRAE 62.1 differential surrogate methodology, sedentary-
 * office bioeffluent thresholds, OSHA PEL, and the Persily 2021 ASHRAE
 * Journal caveat (CO₂ is a ventilation effectiveness indicator, not
 * an air quality contaminant).
 *
 * NOTE on Persily 2021: the framing source is the short ASHRAE Journal
 * piece "Don't Blame Standard 62.1 for 1000 ppm CO₂" (63(2): 74–75,
 * February 2021). This is a separate document from the 2022 ASHRAE
 * Position Document on Indoor Carbon Dioxide; if you cite the
 * position document, add a distinct entry — they are different
 * publications and should not be conflated.
 *
 * Journal entries must be verified against primary sources (title,
 * journal, volume, issue, page range, year) before adding. See the
 * developer note in standards.js — unverified entries get a TODO and
 * are excluded from generated reports until corrected.
 */

import type { ParameterProse } from './types'

const CO2_BACKGROUND = `Carbon dioxide is widely used in indoor air quality evaluations as a surrogate indicator of ventilation effectiveness rather than as an air quality contaminant in its own right. ASHRAE Standard 62.1 — Ventilation for Acceptable Indoor Air Quality — does not establish an indoor CO₂ concentration limit; the historical 700 ppm differential threshold above outdoor concentration is a sedentary-office bioeffluent perception threshold, drawn from a since-removed informative appendix and intended as a screening reference for whether outdoor-air ventilation is matched to occupant load. Indoor CO₂ values approaching 1,000 ppm with sustained occupancy are commonly interpreted as suggestive of ventilation that may be below the rate required for the observed occupancy; values above 2,500 ppm are sometimes associated with self-reported drowsiness and concentration symptoms in indoor air quality literature. The Occupational Safety and Health Administration Permissible Exposure Limit for carbon dioxide is 5,000 ppm over an 8-hour Time Weighted Average (29 CFR 1910.1000 Table Z-1); typical indoor office CO₂ measurements fall well below this regulatory limit. Per Persily (2021, "Don't Blame Standard 62.1 for 1000 ppm CO₂," ASHRAE Journal 63(2): 74–75), CO₂ should be interpreted strictly as a ventilation effectiveness indicator. Definitive determination of outdoor-air delivery requires direct measurement of supply airflow and outdoor-air fraction at the air handler per AABC or NEBB methodology.`

export const CO2_PROSE: ParameterProse = {
  parameter: 'Carbon Dioxide (CO₂)',
  standardsBackground: CO2_BACKGROUND,
  applicableStandards: [
    { source: 'ASHRAE Standard 62.1 — Ventilation for Acceptable Indoor Air Quality', authority: 'consensus', edition: 'current' },
    { source: '29 CFR 1910.1000 Table Z-1 — Carbon Dioxide PEL 5,000 ppm 8-hr TWA', authority: 'regulatory', edition: 'current' },
    { source: 'Persily, A.K. (2021). "Don\'t Blame Standard 62.1 for 1000 ppm CO₂." ASHRAE Journal 63(2): 74–75.', authority: 'peer_reviewed', edition: '2021' },
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
