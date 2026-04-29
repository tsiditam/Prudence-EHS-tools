/**
 * AtmosFlow Engine v2.2 §8 — Carbon Monoxide (CO) parameter prose
 *
 * Cites ASHRAE 62.1 9 ppm 8-hour reference, ACGIH TLV 25 ppm, NIOSH
 * REL 35 ppm, OSHA PEL 50 ppm, and the General Duty Clause history.
 */

import type { ParameterProse } from './types'

const CO_BACKGROUND = `Carbon monoxide is a colorless, odorless gas produced by incomplete combustion. Multiple authoritative thresholds apply to indoor evaluation. The American Conference of Governmental Industrial Hygienists (ACGIH) Threshold Limit Value is 25 parts per million as an 8-hour Time Weighted Average. The National Institute for Occupational Safety and Health (NIOSH) Recommended Exposure Limit is 35 parts per million as an 8-hour Time Weighted Average with a ceiling of 200 ppm. The Occupational Safety and Health Administration Permissible Exposure Limit is 50 parts per million as an 8-hour Time Weighted Average (29 CFR 1910.1000 Table Z-1). ASHRAE Standard 62.1 references 9 parts per million (the EPA NAAQS 8-hour primary standard) as the indoor air quality screening benchmark for carbon monoxide. The OSHA 1989 air-contaminants final rule attempted to lower the PEL to 35 ppm; that rule was vacated in court, but the General Duty Clause (Section 5(a)(1) of the OSH Act) continues to be applied where measured carbon monoxide exposures result in adverse health effects, and the 35 ppm NIOSH REL is widely treated as the de facto health-protective benchmark in indoor air quality practice. Direct-reading carbon monoxide instruments produce screening-grade short-duration data; documented determination of OSHA PEL compliance requires 8-hour Time Weighted Average sampling per validated methodology.`

export const CO_PROSE: ParameterProse = {
  parameter: 'Carbon Monoxide (CO)',
  standardsBackground: CO_BACKGROUND,
  applicableStandards: [
    { source: '29 CFR 1910.1000 Table Z-1 — CO PEL 50 ppm 8-hr TWA', authority: 'regulatory', edition: 'current' },
    { source: 'NIOSH Recommended Exposure Limit — CO 35 ppm 8-hr TWA, Ceiling 200 ppm', authority: 'consensus', edition: 'current' },
    { source: 'ACGIH Threshold Limit Value — CO 25 ppm 8-hr TWA', authority: 'consensus', edition: 'current' },
    { source: 'ASHRAE Standard 62.1 — CO Screening Reference 9 ppm', authority: 'consensus', edition: 'current' },
    { source: 'EPA NAAQS — CO 9 ppm 8-hour primary standard', authority: 'regulatory', edition: 'current' },
    { source: 'OSH Act Section 5(a)(1) — General Duty Clause', authority: 'regulatory', edition: 'current' },
  ],
  summaryTemplate(range) {
    if (range.count === 0) return 'Carbon monoxide was not measured during this assessment.'
    const within = range.withinStandards
      ? 'were within the ASHRAE 62.1 screening reference of 9 ppm and well below the OSHA PEL of 50 ppm'
      : 'were elevated relative to the ASHRAE 62.1 screening reference of 9 ppm. Documented determination of OSHA PEL or NIOSH REL compliance requires 8-hour TWA sampling, which was not performed during this screening assessment'
    const elevatedClause = !range.withinStandards && range.elevatedInZones && range.elevatedInZones.length > 0
      ? ` Elevated values were recorded in ${range.elevatedInZones.join(', ')}; per-zone values are presented in Appendix A.`
      : ''
    return `Carbon monoxide concentrations recorded during the survey ranged from ${range.low} ${range.unit} to ${range.high} ${range.unit}, averaging ${range.average} ${range.unit}, and ${within}.${elevatedClause}`
  },
}
