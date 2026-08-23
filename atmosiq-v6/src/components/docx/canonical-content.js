/**
 * Canonical report content — Phase 2 additive blocks.
 *
 * Hardcoded data + static prose for the report-spec sections that the
 * engine ClientReport does not currently produce: the Standards /
 * Benchmarks table (docs/report-spec/03 §4 + 07 benchmark-type model),
 * the standalone Disclaimer, the Conclusions closing, and the
 * Certification statement.
 *
 * This module holds DATA + STRINGS only (no docx imports) so the
 * static prose can be unit-tested against the Phase-1 banned-language
 * linter (scanProseForBannedLanguage) and the table can be asserted
 * row-for-row against the spec. The DOCX builders in
 * sections-v21client.js render these into Paragraph/Table nodes.
 *
 * Benchmark-type labels follow the docs/report-spec/07 taxonomy. Note:
 * NIOSH RELs are classified as "Recommended exposure limit" (advisory),
 * NOT "Occupational exposure limit" — the §7 taxonomy is authoritative
 * and §7 explicitly prohibits presenting a REL as an enforceable OEL.
 *
 * 2026-08: BENCHMARK_ROWS was a hand-maintained list, and it had drifted
 * into a third statement of the criteria — after `src/constants/standards.js`
 * and `src/constants/criteria.js`. A CIH review of a live report caught two
 * consequences: the 700 ppm CO₂ differential was attributed to
 * "ASHRAE 62.1-2025" as though the standard sets an indoor CO₂ limit (it
 * does not — the figure comes from a since-removed informative appendix;
 * see Persily 2021), and the OSHA CO PEL, an 8-hour TWA, was labelled a
 * "Regulatory ceiling for workplace". The table also omitted the indoor CO
 * criteria the engine actually applies, so a reader could not find the
 * basis of a CO finding in it.
 *
 * The contaminant and ventilation rows are now GENERATED from the criterion
 * registry, so the table states the criteria that actually produce findings,
 * with their averaging periods, and cannot drift from them. Temperature and
 * relative humidity stay hand-authored: they are seasonal bands rather than
 * a threshold ladder and are deliberately not in the registry
 * (see docs/CRITERIA.md, "Known remaining work").
 */

import { allCriteria } from '../../constants/criteria'
import { STD } from '../../constants/standards'

export const FIRM_NAME = 'Prudence Safety & Environmental Consulting, LLC'

// ── Standards / Benchmarks (docs/report-spec §4 + §7) ──

export const BENCHMARK_TABLE_HEADERS = [
  'Parameter', 'Benchmark', 'Source', 'Benchmark Type', 'Purpose in Report',
]

// Criterion class → the docs/report-spec §7 benchmark-type label and the
// one-line "purpose in report". The class already encodes the weight a
// criterion carries, so this is a rename, not a second judgement.
export const CLASS_PRESENTATION = {
  physical_hazard:       ['Occupational exposure limit', 'Acute hazard threshold'],
  regulatory_oel:        ['Occupational exposure limit', 'Enforceable workplace limit'],
  health_indoor:         ['Public health ambient guideline', 'Health-based indoor guideline'],
  ambient_benchmark:     ['Public health ambient guideline', 'Ambient comparison, not an occupational limit'],
  ventilation_indicator: ['Ventilation benchmark', 'Indicator of outdoor-air delivery per occupant'],
  certification_target:  ['Indicator', 'Certification performance target, not a health limit'],
  advisory:              ['Indicator', 'Source-investigation indicator, not a compliance limit'],
  comfort_consensus:     ['Thermal comfort criterion', 'Comfort evaluation, not a health standard'],
}

// NIOSH RELs and ceilings are advisory: §7 prohibits presenting one as an
// enforceable OEL, and the registry classes them on the occupational ladder
// because that is where they sit. The taxonomy wins for the label — and the
// PURPOSE column has to move with it, or a row reads "Recommended exposure
// limit / Enforceable workplace limit" and contradicts itself.
export const isRecommendedNotEnforceable = (source) => /NIOSH/i.test(source) && !/OSHA|CFR/i.test(source)
export const RECOMMENDED_PRESENTATION = ['Recommended exposure limit', 'Advisory occupational value, not a regulatory limit']

const PARAMETER_LABEL = {
  co: 'CO', hcho: 'HCHO', pm25: 'PM2.5', pm10: 'PM10', tvoc: 'TVOCs', co2: 'CO₂',
}

function criterionRows() {
  return allCriteria().map((c) => {
    let [typeLabel, purpose] = CLASS_PRESENTATION[c.class] || ['Indicator', 'Investigative indicator']
    if (isRecommendedNotEnforceable(c.source) && typeLabel === 'Occupational exposure limit') {
      ;[typeLabel, purpose] = RECOMMENDED_PRESENTATION
    }
    const period = c.averagingLabel && c.averagingLabel !== 'instantaneous'
      ? ` (${c.averagingLabel})`
      : ''
    return [
      `${PARAMETER_LABEL[c.parameter] || c.parameter} (${c.label})`,
      `${c.valueLabel} ${c.unit}${period}`,
      c.source,
      typeLabel,
      purpose,
    ]
  })
}

// Seasonal comfort bands. Not in the criterion registry, and stated as an
// evaluation band rather than a pass/fail line: ASHRAE 55 comfort also
// depends on clothing, activity, radiant temperature and air speed, none of
// which a spot temperature/RH reading captures.
const THERMAL_ROWS = [
  ['Temperature (summer)', `${STD.t.temp.summer.min}–${STD.t.temp.summer.max}°F acceptable (operative temp; ~0.5 clo, 1.0–1.3 met)`, 'ASHRAE 55-2023 (Graphic Comfort Zone Method)', 'Thermal comfort criterion', 'Air temperature measured; comfort evaluation, not a determination'],
  ['Temperature (winter)', `${STD.t.temp.winter.min}–${STD.t.temp.winter.max}°F acceptable (operative temp; ~1.0 clo, 1.0–1.3 met)`, 'ASHRAE 55-2023 (Graphic Comfort Zone Method)', 'Thermal comfort criterion', 'Air temperature measured; comfort evaluation, not a determination'],
  ['Relative Humidity', `${STD.t.rh.min}–${STD.t.rh.max}%`, STD.t.rh.ref, 'Moisture-control practice range', 'Moisture and comfort indicator, not a health limit'],
]

export const BENCHMARK_ROWS = [...criterionRows(), ...THERMAL_ROWS]

// Allowed benchmark-type labels (docs/report-spec/07 taxonomy).
export const BENCHMARK_TYPE_LABELS = [
  'Occupational exposure limit',
  'Recommended exposure limit',
  'Public health ambient guideline',
  'Ventilation benchmark',
  'Thermal comfort criterion',
  'Comfort / moisture indicator',
  'Indicator',
]

export const BENCHMARK_INTRO =
  'The following published criteria frame the evaluation in this report. They carry different regulatory, health, and investigative weight and are not interchangeable, and each is stated with the averaging period it is defined over — a criterion defined as an 8-hour or 24-hour average cannot be settled by a single reading.'

// Benchmark type for references with no registry criterion behind them: the
// comfort BANDS (seasonal ranges, deliberately not a threshold ladder — see
// docs/CRITERIA.md "Known remaining work"), and CO2's ventilation
// indicators, whose 1,000/1,500 ppm figures are NIOSH indoor-ventilation
// indicators rather than criteria in their own right.
//
// Without this a row fell through to a bare "Indicator", so the same
// parameter could be labelled "Ventilation benchmark" when a finding rested
// on it and "Indicator" when it did not — the table disagreeing with itself
// about what kind of thing CO2 is.
export const BAND_PRESENTATION = {
  co2: ['Ventilation benchmark', 'Indicator of outdoor-air delivery per occupant'],
  temperature: ['Thermal comfort criterion', 'Comfort evaluation, not a health standard'],
  rh: ['Comfort / moisture indicator', 'Comfort and moisture indicator'],
  tvoc: ['Indicator', 'Source-investigation indicator, not a compliance limit'],
}

export const APPLIED_REFERENCES_INTRO =
  'Each parameter below is listed with the single published criterion it was evaluated against in this assessment, together with the averaging period that criterion is defined over. A criterion defined as an 8-hour, 24-hour or annual average cannot be settled by a single reading. Background on each criterion, including its standing and the weight it carries, is in Appendix D.'

export const BENCHMARK_FOOTNOTE =
  'Benchmark types carry different legal and technical weight. Occupational exposure limits are enforceable workplace standards. Public health guidelines are health-based recommendations. Comfort criteria address thermal acceptability. Ventilation and other indicators are investigative triggers used for prioritization, not compliance determination.'

// ── Disclaimer (standalone, distinct from the Limitations section) ──

export const DISCLAIMER_PARAGRAPHS = [
  'This report presents indoor air quality observations prepared for the named client and project. It does not constitute a comprehensive industrial hygiene exposure assessment, a medical or health evaluation, or a determination of regulatory compliance.',
  'Direct-reading measurements are point-in-time values collected at the locations and times noted and may not represent worst-case, average, or typical conditions. Findings are indicators that support prioritization and further evaluation; they do not establish exposure, causation, or building-relatedness.',
  'Reliance on this report by any party other than the named client, or for any purpose other than that stated herein, is at that party’s own risk. This report should be read in its entirety and in the context of the professional judgment, limitations, and benchmark classifications described herein.',
  `${FIRM_NAME} prepared this report under the professional standard of care applicable to indoor air quality assessments.`,
]

// ── Conclusions closing line ──

export const CONCLUSIONS_CLOSING =
  'These conclusions reflect conditions observed during a single site visit. They are presented as professional judgment to support prioritization and further evaluation, and are not exposure, health, or regulatory-compliance determinations.'

// ── Data gaps and limitations on interpretation (scientific) ──
// Client-facing scientific gaps derived from the assessment itself
// (what was not measured / not available), NOT the internal readiness
// blockers from src/engines/validation.js.

export const DATA_GAPS_INTRO =
  'The following data gaps and limitations on interpretation apply to this assessment. They are listed so the reader can weigh the findings appropriately and identify where additional investigation would strengthen the basis for decisions.'

export const DATA_GAP_MESSAGES = {
  hcho: 'Formaldehyde (HCHO) was not measured. Direct-reading values are preliminary; a quantitative exposure assessment requires validated sampling (for example, NIOSH Method 2016 or an equivalent method).',
  co: 'Carbon monoxide (CO) was not measured at the assessed locations.',
  tvoc: 'Total volatile organic compounds (TVOCs) were not screened. TVOC screening does not identify specific compounds and does not substitute for laboratory speciation.',
  outdoor: 'Outdoor (ambient) reference readings were not captured. Indoor/outdoor comparison supports building-attribution screening and was not available for this assessment.',
  continuous: 'Measurements are point-in-time direct readings. Continuous monitoring was not deployed, so reported values may not represent worst-case, average, or typical conditions.',
  lab: 'Laboratory analytical sampling and speciation were not performed. Results identify indicators for prioritization and further evaluation, not specific contaminants or exposures.',
}

// ── Instrument accuracy + calibration note ──

export const INSTRUMENT_ACCURACY_NOTE =
  'Stated instrument accuracy and calibration status for the direct-reading instruments used in this assessment. Stated accuracy is the manufacturer specification for the instrument; it is not a measurement uncertainty determination for the specific conditions sampled.'

// ── Certification statement ──

/**
 * Build the certification statement paragraphs. Pure — returns an array
 * of strings. Signature/credential lines are rendered separately by the
 * existing Signatory block that follows.
 */
export function certificationStatement(opts = {}) {
  const assessor = opts.assessor || 'the preparing assessor'
  const assessorSuffix = opts.assessorCreds ? `, ${opts.assessorCreds}` : ''
  const reviewer = opts.reviewer || ''
  const reviewerSuffix = opts.reviewerCreds ? `, ${opts.reviewerCreds}` : ''
  const firm = opts.firm || FIRM_NAME

  const paras = [
    `This indoor air quality assessment was conducted, and this report prepared, under the professional judgment of ${assessor}${assessorSuffix} on behalf of ${firm}. The observations and measurements presented reflect conditions at the time and locations assessed.`,
  ]

  if (opts.reviewStatus === 'final_issued_to_client' && reviewer) {
    paras.push(`This report was reviewed and approved by ${reviewer}${reviewerSuffix} and is issued as a final reviewed report.`)
  } else if (opts.reviewStatus === 'reviewed_by_qualified_professional' && reviewer) {
    paras.push(`This report was reviewed by ${reviewer}${reviewerSuffix} and is pending final approval.`)
  } else {
    paras.push('This report is issued for professional review and requires review by a qualified professional before external reliance.')
  }

  paras.push('This assessment does not represent a comprehensive industrial hygiene exposure assessment or a determination of regulatory compliance, and it should be interpreted together with the limitations and benchmark classifications described in this report.')

  return paras
}

/**
 * Which intake field a benchmark row belongs to, so a report can print the
 * criteria it actually used instead of the whole library.
 *
 * The table is generated from the criterion registry and now carries every
 * criterion the engine knows — roughly thirty rows. Printing all of them on
 * a two-zone assessment is how a short walkthrough turns into pages of
 * standards a reader has to wade through to reach the three that mattered.
 */
export const benchmarkRowField = (label) =>
  label.startsWith('CO₂') ? 'co2' :
  label.startsWith('Temperature') ? 'tf' :
  label.startsWith('Relative Humidity') ? 'rh' :
  label.startsWith('PM2.5') ? 'pm' :
  label.startsWith('PM10') ? 'pm10' :
  label.startsWith('CO (') ? 'co' :
  label.startsWith('HCHO') ? 'hc' :
  label.startsWith('TVOC') ? 'tv' : null

/** Intake fields carrying a value in at least one zone. */
export function measuredBenchmarkFields(zones) {
  const measured = new Set()
  for (const z of zones || []) {
    if (!z || typeof z !== 'object') continue
    for (const f of ['co2', 'tf', 'rh', 'pm', 'pm10', 'co', 'hc', 'tv']) {
      if (z[f] !== undefined && z[f] !== null && String(z[f]).trim() !== '') measured.add(f)
    }
  }
  return measured
}

/** BENCHMARK_ROWS narrowed to the parameters actually measured. */
export function benchmarkRowsFor(zones) {
  const measured = measuredBenchmarkFields(zones)
  if (measured.size === 0) return []
  return BENCHMARK_ROWS.filter((r) => measured.has(benchmarkRowField(r[0])))
}
