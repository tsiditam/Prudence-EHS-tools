/**
 * AtmosFlow Engine v2.2 §8 — Carbon Monoxide (CO) parameter prose
 *
 * Cites ASHRAE 62.1 9 ppm 8-hour reference, ACGIH TLV 25 ppm, NIOSH
 * REL 35 ppm, OSHA PEL 50 ppm, and the General Duty Clause history.
 */

import type { ParameterProse } from './types'

const CO_BACKGROUND = `Carbon monoxide is a colorless, odorless gas produced by incomplete combustion. Multiple authoritative thresholds apply to indoor evaluation. The American Conference of Governmental Industrial Hygienists (ACGIH) Threshold Limit Value is 25 parts per million as an 8-hour Time Weighted Average. The National Institute for Occupational Safety and Health (NIOSH) Recommended Exposure Limit is 35 parts per million as an 8-hour Time Weighted Average with a ceiling of 200 ppm. The Occupational Safety and Health Administration Permissible Exposure Limit is 50 parts per million as an 8-hour Time Weighted Average (29 CFR 1910.1000 Table Z-1). ASHRAE Standard 62.1 references 9 parts per million (the EPA NAAQS 8-hour primary standard) as the indoor air quality benchmark for carbon monoxide. The OSHA 1989 air-contaminants final rule attempted to lower the PEL to 35 ppm; that rule was vacated in court, but the General Duty Clause (Section 5(a)(1) of the OSH Act) continues to be applied where measured carbon monoxide exposures result in adverse health effects, and the 35 ppm NIOSH REL is widely treated as the de facto health-protective benchmark in indoor air quality practice. Direct-reading carbon monoxide instruments produce short-duration data; documented determination of OSHA PEL compliance requires 8-hour Time Weighted Average sampling per validated methodology.`

export const CO_PROSE: ParameterProse = {
  parameter: 'Carbon Monoxide (CO)',
  standardsBackground: CO_BACKGROUND,
  applicableStandards: [
    { source: '29 CFR 1910.1000 Table Z-1 — CO PEL 50 ppm 8-hr TWA', authority: 'regulatory', edition: 'current' },
    { source: 'NIOSH Recommended Exposure Limit — CO 35 ppm 8-hr TWA, Ceiling 200 ppm', authority: 'consensus', edition: 'current' },
    { source: 'ACGIH Threshold Limit Value — CO 25 ppm 8-hr TWA', authority: 'consensus', edition: 'current' },
    { source: 'ASHRAE Standard 62.1 — CO Reference 9 ppm', authority: 'consensus', edition: 'current' },
    { source: 'EPA NAAQS — CO 9 ppm 8-hour primary standard', authority: 'regulatory', edition: 'current' },
    { source: 'OSH Act Section 5(a)(1) — General Duty Clause', authority: 'regulatory', edition: 'current' },
  ],
  summaryTemplate(range) {
    if (range.count === 0) return 'Carbon monoxide was not measured during this assessment.'
    const head = `Carbon monoxide ranged from ${range.low} to ${range.high} ${range.unit}, averaging ${range.average} ${range.unit}.`
    // No within/outside claim when the engine supplied no verdict.
    if (range.withinStandards === null) return head
    if (range.withinStandards) {
      // Was: "…within the 9 ppm indoor reference, with no indication of a
      // combustion source." Two problems. The threshold was restated here
      // even though the criterion registry owns it (and its lowest indoor
      // tier is 6 ppm, not 9, so the sentence could contradict the finding
      // it summarised). And absence of a source is not what a spot reading
      // shows — a combustion source that was not firing, or not venting
      // toward the sampled location, produces exactly this result.
      return `${head} No elevated carbon monoxide was identified in any zone measured. These are single time-point readings that characterise the locations and times sampled; they do not establish that no combustion source is present.`
    }
    const zones = range.elevatedInZones && range.elevatedInZones.length > 0
      ? ` Elevated in ${range.elevatedInZones.join(', ')}; per-zone values are in Appendix A.`
      : ''
    return `${head} Concentrations exceed the 9 ppm indoor reference. Identify and correct the combustion source. Occupational exposure determination requires 8-hour TWA sampling, which was not performed during this assessment.${zones}`
  },
}
