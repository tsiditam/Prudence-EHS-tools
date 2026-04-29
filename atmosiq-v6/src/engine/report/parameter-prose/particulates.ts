/**
 * AtmosFlow Engine v2.2 §8 — Airborne Particulates parameter prose
 *
 * Standards-background and measurement-summary content for PM2.5 and
 * PM10 mass concentration. Cites OSHA, EPA, and WHO references.
 */

import type { ParameterProse } from './types'

const STANDARDS_BACKGROUND = `Airborne particulate matter is regulated and characterized by particle aerodynamic diameter. The Occupational Safety and Health Administration (OSHA) Permissible Exposure Limit for Particulates Not Otherwise Regulated (PNOR) is 5 mg/m³ for the respirable fraction over an 8-hour Time Weighted Average (29 CFR 1910.1000 Table Z-1). The U.S. Environmental Protection Agency (EPA) has established National Ambient Air Quality Standards (NAAQS) for both PM10 (150 µg/m³, 24-hour standard) and PM2.5 (35 µg/m³, 24-hour standard, with the annual primary standard reduced to 9 µg/m³ effective May 2024). The World Health Organization 2021 Global Air Quality Guidelines recommend annual PM2.5 below 5 µg/m³ and 24-hour PM2.5 below 15 µg/m³ as health-protective benchmarks. Indoor concentrations are commonly evaluated against EPA NAAQS as a screening reference because no formal indoor PM standard exists. Indoor amplification — the indoor-to-outdoor (I/O) PM2.5 ratio — exceeding approximately 1.0 indicates an indoor particulate source; ratios above 2.0 are widely interpreted in the indoor air quality literature as warranting source investigation. Optical light-scattering instruments, including the TSI DustTrak family, measure mass concentration based on Mie scattering and may differ from gravimetric reference methods; calibration to the prevailing aerosol composition is recommended before drawing quantitative conclusions.`

export const PARTICULATES_PROSE: ParameterProse = {
  parameter: 'Airborne Particulates',
  standardsBackground: STANDARDS_BACKGROUND,
  applicableStandards: [
    { source: '29 CFR 1910.1000 Table Z-1 — PNOR Respirable PEL 5 mg/m³', authority: 'regulatory', edition: 'current' },
    { source: 'EPA NAAQS — PM10 24-hour 150 µg/m³', authority: 'regulatory', edition: 'current' },
    { source: 'EPA NAAQS — PM2.5 24-hour 35 µg/m³ / annual 9 µg/m³ (May 2024 final rule)', authority: 'regulatory', edition: '2024' },
    { source: 'WHO Global Air Quality Guidelines', authority: 'consensus', edition: '2021' },
    { source: 'Chen & Zhao (2011) — Indoor/Outdoor PM2.5 Ratio Methodology', authority: 'peer_reviewed', edition: 'Atmospheric Environment' },
  ],
  summaryTemplate(range) {
    if (range.count === 0) {
      return 'PM2.5 was not measured during this assessment.'
    }
    const within = range.withinStandards
      ? 'were within applicable regulatory standards and industry guidelines'
      : 'were elevated relative to applicable regulatory standards and industry guidelines'
    const elevatedClause = !range.withinStandards && range.elevatedInZones && range.elevatedInZones.length > 0
      ? ` Elevated values were recorded in ${range.elevatedInZones.join(', ')}; per-zone values are presented in Appendix A.`
      : ''
    const ioClause = range.outdoorReference !== undefined
      ? ` Outdoor PM2.5 reference for the day of survey was ${range.outdoorReference} ${range.unit}.`
      : ''
    return `PM2.5 mass concentrations recorded during the survey ranged from ${range.low} ${range.unit} to ${range.high} ${range.unit}, averaging ${range.average} ${range.unit}, and ${within}.${ioClause}${elevatedClause}`
  },
}
