/**
 * AtmosFlow Engine — Total VOC (TVOC) parameter prose
 *
 * Describes what a TVOC reading IS and what it cannot establish. It cites no
 * threshold, because as of 2026-08 AtmosFlow applies none: TVOC is measured,
 * charted and reported, and compared to nothing.
 *
 * The background prose formerly recited Mølhave's (1991) four advisory tiers
 * — comfort below 200 µg/m³, multifactorial 200-3,000, discomfort above
 * 3,000. Those went with the criteria. A tier printed in a client-facing
 * report reads as a limit however it is captioned, and Mølhave's construct is
 * a chamber-study dose-response framework, not an exposure limit. What
 * survives is the part that was always true and always useful: a PID sums
 * photoionizable species without identifying any of them, so speciation (EPA
 * Method TO-17) is what produces a compound with a limit behind it.
 *
 * Seifert (1990) was dropped in 2026-08 as a second citation for the same
 * background range; Mølhave followed it out of the file for a different
 * reason a few weeks later — including out of `applicableStandards`, which is
 * printed to the client as the criteria this parameter was assessed against.
 * Listing a paper there whose figures the engine does not apply states a
 * basis that does not exist.
 *
 * `summaryTemplate` ignores `withinStandards` for the same reason. TVOC has no
 * criteria, so the engine can never emit a TVOC finding, so the flag is
 * permanently true — and a template that read it would print "within" over
 * every reading ever taken, which is a verdict dressed as a fact.
 */

import type { ParameterProse } from './types'

const TVOC_BACKGROUND = `Total Volatile Organic Compounds (TVOC) is an indicator that aggregates the photoionizable organic species detected by a photoionization detector (PID) into a single mass-equivalent concentration. There is no regulatory limit and no consensus health-based limit for total VOCs, because the metric does not identify the individual compounds that drive toxicological assessment — and AtmosFlow therefore applies no TVOC threshold and makes no determination about a TVOC result. The measured value is reported for what it is: an indicator of the aggregate organic load present at the time of measurement, useful for comparing zones and for tracking change, not for judging acceptability. Definitive identification of individual VOC compounds requires sorbent-tube sampling with thermal desorption gas chromatography mass spectrometry per EPA Method TO-17; each compound so identified can then be evaluated against its own OSHA permissible exposure limit or NIOSH recommended exposure limit. Photoionization detector response is compound-dependent and varies with the calibration gas, so values reported should be interpreted within approximately ±25 percent uncertainty for mixed-VOC indoor environments.`

export const TVOC_PROSE: ParameterProse = {
  parameter: 'Total Volatile Organic Compounds (TVOC)',
  standardsBackground: TVOC_BACKGROUND,
  applicableStandards: [
    { source: 'EPA Method TO-17 — Determination of Volatile Organic Compounds via Thermal Desorption GC/MS', authority: 'consensus', edition: 'current' },
  ],
  summaryTemplate(range) {
    if (range.count === 0) return 'Total volatile organic compounds were not measured during this assessment.'
    const head = `Total VOCs ranged from ${range.low} to ${range.high} ${range.unit}, averaging ${range.average} ${range.unit}.`
    return `${head} No consensus health-based limit exists for total VOCs and none is applied here, so the result is reported without comparison to a threshold. Per-zone values are in Appendix A; where a source is suspected, speciate per EPA Method TO-17.`
  },
}
