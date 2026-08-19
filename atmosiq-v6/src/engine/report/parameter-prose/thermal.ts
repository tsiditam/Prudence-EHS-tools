/**
 * AtmosFlow Engine v2.2 §8 — Temperature and Relative Humidity prose
 *
 * Cites ASHRAE 55 thermal comfort, the Graphic Comfort Zone Method,
 * and the New York City DOHMH guidance on humidity for mold prevention.
 */

import type { ParameterProse } from './types'

const TEMPERATURE_BACKGROUND = `Indoor temperature is evaluated against ASHRAE Standard 55-2023 (Thermal Environmental Conditions for Human Occupancy), which establishes the range of operative temperatures predicted to be acceptable to a majority of occupants under typical office conditions. The Graphic Comfort Zone Method, when applied to typical sedentary office activity (1.0 met) and seasonal clothing assumptions, produces a recommended operative temperature range of approximately 68 to 78 degrees Fahrenheit. ASHRAE 55 is a comfort consensus standard, not a health-based or regulatory limit, and does not establish enforceable temperature requirements. Comfort interpretation depends on activity level, clothing, individual physiology, and air movement, which were not characterized as part of this evaluation. For specialty occupancies including data centers, ASHRAE Technical Committee 9.9 provides equipment-reliability-based temperature ranges that may extend below or above ASHRAE 55 occupant comfort.`

const RH_BACKGROUND = `Relative humidity is evaluated against ASHRAE Standard 55-2023, which does not specify a lower humidity bound for comfort but recommends that humidification systems not be relied on to achieve comfort below 30 percent RH. The upper bound for ASHRAE 55 comfort is 60 percent RH; sustained relative humidity above 60 percent on susceptible building materials is widely associated in the indoor air quality literature with increased risk of microbial amplification and dust-mite proliferation. The New York City Department of Health and Mental Hygiene Guidelines on Assessment and Remediation of Fungi recommend maintaining indoor relative humidity below 65 percent to inhibit mold growth on susceptible materials; analogous jurisdictions in other states adopt comparable health-protective benchmarks. Single-point relative humidity measurements characterize an instantaneous condition; sustained excursion duration is the relevant parameter for microbial risk assessment, and continuous relative humidity logging over 14 or more days is recommended where persistent microbial amplification risk is suspected.`

export const TEMPERATURE_PROSE: ParameterProse = {
  parameter: 'Temperature',
  standardsBackground: TEMPERATURE_BACKGROUND,
  applicableStandards: [
    { source: 'ASHRAE Standard 55-2023 — Thermal Environmental Conditions for Human Occupancy', authority: 'consensus', edition: '2023' },
    { source: 'ASHRAE Technical Committee 9.9 — Thermal Guidelines for Data Processing Environments', authority: 'consensus', edition: 'current' },
  ],
  summaryTemplate(range) {
    if (range.count === 0) return 'Temperature was not measured during this assessment.'
    const head = `Temperature ranged from ${range.low}${range.unit} to ${range.high}${range.unit}, averaging ${range.average}${range.unit}.`
    if (range.withinStandards === null) return head
    // ASHRAE 55 is not a pass/fail test on dry-bulb temperature. The
    // Graphic Comfort Zone Method takes clothing insulation, metabolic
    // rate, mean radiant temperature and air speed, none of which a spot
    // temperature and RH reading capture — a point this report's own
    // Appendix D already made while these sentences asserted the opposite.
    // So the comparison is reported as what it is: an observation against
    // the seasonal comfort band, not a determination under the standard.
    if (range.withinStandards) {
      return `${head} No thermal comfort condition was identified in the areas assessed. Comfort under ASHRAE 55 also depends on clothing, activity level, radiant temperature and air movement, which were not characterised during this assessment.`
    }
    const zones = range.elevatedInZones && range.elevatedInZones.length > 0
      ? ` in ${range.elevatedInZones.join(', ')}; per-zone values are in Appendix A`
      : ''
    return `${head} Measured temperature fell outside the seasonal comfort band applied in this assessment${zones}. Clothing, activity level, radiant temperature and air movement were not characterised, so this is a comfort observation rather than a determination under ASHRAE 55. Deviations of this kind commonly drive occupant comfort complaints.`
  },
}

export const RH_PROSE: ParameterProse = {
  parameter: 'Relative Humidity',
  standardsBackground: RH_BACKGROUND,
  applicableStandards: [
    { source: 'ASHRAE Standard 55-2023 — Thermal Environmental Conditions for Human Occupancy', authority: 'consensus', edition: '2023' },
    { source: 'NYC DOHMH — Guidelines on Assessment and Remediation of Fungi', authority: 'advisory', edition: 'current' },
  ],
  summaryTemplate(range) {
    if (range.count === 0) return 'Relative humidity was not measured during this assessment.'
    const head = `Relative humidity ranged from ${range.low}${range.unit} to ${range.high}${range.unit}, averaging ${range.average}${range.unit}.`
    if (range.withinStandards === null) return head
    if (range.withinStandards) {
      return `${head} No humidity condition was identified in the areas assessed. Single-point readings characterise the moment measured; sustained excursion duration is what matters for microbial risk.`
    }
    const zones = range.elevatedInZones && range.elevatedInZones.length > 0
      ? ` Out of range in ${range.elevatedInZones.join(', ')}; per-zone values are in Appendix A.`
      : ''
    return `${head} Conditions are outside the recommended 30 to 60 percent range. Sustained humidity above 60 percent supports microbial amplification; below 30 percent drives mucosal irritation complaints.${zones}`
  },
}
