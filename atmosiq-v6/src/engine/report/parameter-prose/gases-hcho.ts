/**
 * AtmosFlow Engine v2.2 §8 — Formaldehyde (HCHO) parameter prose
 *
 * Cites OSHA 29 CFR 1910.1048 (PEL 0.75 ppm, STEL 2.0 ppm, action
 * level 0.5 ppm), NIOSH REL 0.016 ppm ceiling, the substantial gap
 * between OSHA PEL and NIOSH REL, and the direct-reading instrument
 * specificity caveat with NIOSH 2016 (DNPH cartridge) as the
 * confirmatory method.
 */

import type { ParameterProse } from './types'

const HCHO_BACKGROUND = `Formaldehyde is a building-material and product-emission contaminant regulated under the dedicated formaldehyde standard at 29 CFR 1910.1048. The Occupational Safety and Health Administration Permissible Exposure Limit is 0.75 parts per million as an 8-hour Time Weighted Average, with a Short-Term Exposure Limit of 2.0 parts per million for any 15-minute period and an Action Level of 0.5 parts per million as an 8-hour Time Weighted Average. The National Institute for Occupational Safety and Health Recommended Exposure Limit is 0.016 parts per million as an 8-hour Time Weighted Average with a 0.1 parts per million ceiling, established as a health-protective recommendation. The substantial gap between the NIOSH REL and the OSHA PEL reflects different regulatory and technical bases — NIOSH RELs are health-protective recommendations, while the OSHA PEL incorporates technical and economic feasibility. Direct-reading formaldehyde instruments, including electrochemical and photoacoustic models, have meaningful specificity limitations and may respond to interfering compounds; observed values near the NIOSH REL ceiling cannot reliably be distinguished from instrument noise. NIOSH Method 2016 (2,4-dinitrophenylhydrazine — DNPH — cartridge sampling, 2 to 4 hour Time Weighted Average) is the confirmatory analytical method appropriate when instrument-based screening warrants formal exposure assessment.`

export const HCHO_PROSE: ParameterProse = {
  parameter: 'Formaldehyde (HCHO)',
  standardsBackground: HCHO_BACKGROUND,
  applicableStandards: [
    { source: '29 CFR 1910.1048 — Formaldehyde PEL 0.75 ppm 8-hr TWA, STEL 2.0 ppm, AL 0.5 ppm', authority: 'regulatory', edition: 'current' },
    { source: 'NIOSH REL — Formaldehyde 0.016 ppm 8-hr TWA, Ceiling 0.1 ppm', authority: 'consensus', edition: 'current' },
    { source: 'NIOSH Method 2016 — DNPH cartridge integrated sampling', authority: 'consensus', edition: 'current' },
  ],
  summaryTemplate(range) {
    if (range.count === 0) return 'Formaldehyde was not measured during this assessment.'
    const within = range.withinStandards
      ? 'were within screening-level expectations and well below the OSHA Action Level of 0.5 ppm'
      : 'were elevated relative to the screening trigger applied for this evaluation. Direct-reading instruments have specificity limitations near the NIOSH REL; confirmatory NIOSH Method 2016 (DNPH cartridge) integrated sampling is recommended where formal exposure assessment is warranted'
    const elevatedClause = !range.withinStandards && range.elevatedInZones && range.elevatedInZones.length > 0
      ? ` Elevated values were recorded in ${range.elevatedInZones.join(', ')}; per-zone values are presented in Appendix A.`
      : ''
    return `Formaldehyde concentrations recorded during the survey ranged from ${range.low} ${range.unit} to ${range.high} ${range.unit}, averaging ${range.average} ${range.unit}, and ${within}.${elevatedClause}`
  },
}
