/**
 * AtmosFlow Engine v2.2 §8 — Carbon Monoxide (CO) parameter prose
 *
 * Cites the OSHA PEL (50 ppm), the NIOSH REL (35 ppm), and the 9 ppm
 * EPA NAAQS 8-hour standard that ASHRAE 62.1 references indoors.
 *
 * Three citations were removed in 2026-08 as furniture — a citation
 * earns its place only if removing it changes what the reader does:
 *
 *   • The ACGIH TLV (25 ppm) was a THIRD parallel occupational limit
 *     for one reading, alongside the REL and the PEL. It drove no
 *     finding — `criteria.js` has no ACGIH criterion — so it was a
 *     number the report named and never used. `contextualStandards.js`
 *     separately explains that the TLVs are a distinct consensus series
 *     which this assessment did not apply, and that is the honest place
 *     for it. (The TLVs are also ACGIH-copyrighted and licensed;
 *     reproducing values in a commercial deliverable should be a
 *     deliberate decision, not one inherited from a prose template.)
 *   • The OSHA 1989 air-contaminants rule and its vacatur is regulatory
 *     history. It explained why practice acts on 35 rather than 50 — a
 *     conclusion the text still states plainly, without the litigation
 *     narrative. A CIH already knows it; a facility manager does not
 *     need it to act.
 *   • OSH Act §5(a)(1) — the General Duty Clause — is a legal
 *     enforcement hook. Invoking it edges toward the compliance
 *     determination this platform states it does not make, and no
 *     finding rests on it.
 *
 * The ACGIH *Bioaerosols* guidelines remain cited in `sampling.js`.
 * That is sampling METHODOLOGY, not an exposure limit, and it tells the
 * reader what to order — which is exactly the test these three failed.
 */

import type { ParameterProse } from './types'

const CO_BACKGROUND = `Carbon monoxide is a colorless, odorless gas produced by incomplete combustion. The Occupational Safety and Health Administration Permissible Exposure Limit is 50 parts per million as an 8-hour Time Weighted Average (29 CFR 1910.1000 Table Z-1). The National Institute for Occupational Safety and Health Recommended Exposure Limit is 35 parts per million as an 8-hour Time Weighted Average with a ceiling of 200 ppm; the NIOSH REL is the health-protective benchmark generally applied in indoor air quality practice, and it is the figure this assessment treats as the point of concern. For indoor evaluation the more relevant comparison is lower still: ASHRAE Standard 62.1 references 9 parts per million — the EPA 8-hour primary NAAQS — as the indoor benchmark for carbon monoxide, because an occupied building is not an industrial process and its occupants are not a healthy-adult worker population on a defined shift. Direct-reading carbon monoxide instruments produce short-duration data; documented determination of OSHA PEL compliance requires 8-hour Time Weighted Average sampling per validated methodology.`

export const CO_PROSE: ParameterProse = {
  parameter: 'Carbon Monoxide (CO)',
  standardsBackground: CO_BACKGROUND,
  applicableStandards: [
    { source: '29 CFR 1910.1000 Table Z-1 — CO PEL 50 ppm 8-hr TWA', authority: 'regulatory', edition: 'current' },
    { source: 'NIOSH Recommended Exposure Limit — CO 35 ppm 8-hr TWA, Ceiling 200 ppm', authority: 'consensus', edition: 'current' },
    { source: 'ASHRAE Standard 62.1 — CO Reference 9 ppm', authority: 'consensus', edition: 'current' },
    { source: 'EPA NAAQS — CO 9 ppm 8-hour primary standard', authority: 'regulatory', edition: 'current' },
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
