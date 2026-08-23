/**
 * AtmosFlow Engine v2.2 §8 — Temperature and Relative Humidity prose
 *
 * Cites ASHRAE 55 thermal comfort and the Graphic Comfort Zone Method.
 *
 * The NYC DOHMH fungi guidance was dropped in 2026-08. It supplied a
 * SECOND humidity number (65 %) beside the ASHRAE 55 upper bound of
 * 60 % that the engine actually applies — so the more permissive of the
 * two was the one the report cited last, and neither drove the finding.
 * It was also a municipal health-department document being cited as a
 * national benchmark, tagged `edition: 'current'` for a document that
 * has not been revised since 2008. The microbial-amplification point it
 * carried is retained; it rests on the engine's own 60 % bound and the
 * literature.
 *
 * 2026-08: the humidity prose no longer cites ASHRAE 55 as the source of the
 * 30-60 % band. That standard sets only an upper humidity limit, expressed as
 * a humidity ratio rather than an RH percentage, and dropped its lower limit
 * in 55-2013 — so "the upper bound for ASHRAE 55 comfort is 60 percent RH"
 * was an approximation stated as a citation, and the 30 % floor was
 * attributed to a standard that does not contain it. The band is US EPA
 * moisture-control guidance. See STD.t.rh in constants/standards.js.
 */

import type { ParameterProse } from './types'

const TEMPERATURE_BACKGROUND = `Indoor temperature is evaluated against ASHRAE Standard 55-2023 (Thermal Environmental Conditions for Human Occupancy), which establishes the range of operative temperatures predicted to be acceptable to a majority of occupants under typical office conditions. The Graphic Comfort Zone Method, which is defined for metabolic rates of 1.0 to 1.3 met and clothing insulation of 0.5 to 1.0 clo, produces an acceptable operative temperature range of approximately 68 to 76 degrees Fahrenheit in winter and 73 to 79 degrees Fahrenheit in summer. The range is stated in operative temperature, which combines air temperature with mean radiant temperature; the values reported here are dry-bulb air temperature, which approximates it and diverges near glazing, exterior walls and other radiant surfaces. ASHRAE 55 is a comfort consensus standard, not a health-based or regulatory limit, and does not establish enforceable temperature requirements. Comfort interpretation depends on activity level, clothing, individual physiology, and air movement, which were not characterized as part of this evaluation. For specialty occupancies including data centers, ASHRAE Technical Committee 9.9 provides equipment-reliability-based temperature ranges that may extend below or above ASHRAE 55 occupant comfort.`

const RH_BACKGROUND = `Relative humidity is evaluated against the 30 to 60 percent range recommended by US EPA moisture-control guidance, which advises keeping indoor relative humidity below 60 percent and ideally between 30 and 50 percent. ASHRAE Standard 55-2023 is not the source of this range: it expresses its own upper humidity limit as a humidity ratio rather than a relative humidity percentage, and it specifies no lower humidity bound, having dropped one in the 2013 edition. The two bounds do not share a rationale. Sustained relative humidity above 60 percent on susceptible building materials is widely associated in the indoor air quality literature with increased risk of microbial amplification and dust-mite proliferation. The 60 percent bound is a moisture-control and comfort benchmark rather than a microbial threshold, and no consensus standard sets a humidity limit for mold control — what governs microbial amplification is the water activity at a material surface, which depends on surface temperature as well as room humidity, so a cold exterior wall can sustain growth while the room reads well below 60 percent. Single-point relative humidity measurements characterize an instantaneous condition; sustained excursion duration is the relevant parameter for microbial risk assessment, and continuous relative humidity logging over 14 or more days is recommended where persistent microbial amplification risk is suspected.`

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
