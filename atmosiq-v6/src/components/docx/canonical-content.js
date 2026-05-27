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
 */

export const FIRM_NAME = 'Prudence Safety & Environmental Consulting, LLC'

// ── Standards / Benchmarks (docs/report-spec §4 + §7) ──

export const BENCHMARK_TABLE_HEADERS = [
  'Parameter', 'Benchmark', 'Source', 'Benchmark Type', 'Purpose in Report',
]

export const BENCHMARK_ROWS = [
  ['CO₂ (differential)', 'Δ700 ppm above outdoor', 'ASHRAE 62.1-2025', 'Ventilation screening benchmark', 'Indicator of outdoor air adequacy'],
  ['CO₂ (absolute)', '1000 ppm concern / 1500 ppm action', 'ASHRAE 62.1-2025', 'Ventilation screening benchmark', 'Screening thresholds for ventilation assessment'],
  ['Temperature (summer)', '73-79°F optimal, 67-82°F range', 'ASHRAE 55-2023', 'Thermal comfort criterion', 'Comfort evaluation, not health standard'],
  ['Temperature (winter)', '68.5-74°F optimal, 68.5-76°F range', 'ASHRAE 55-2023', 'Thermal comfort criterion', 'Comfort evaluation, not health standard'],
  ['Relative Humidity', '30-60%', 'ASHRAE 55-2023', 'Comfort / moisture indicator', 'Comfort + mold risk screening'],
  ['PM2.5 (EPA)', '35 µg/m³ (24-hr)', 'EPA NAAQS', 'Public health ambient guideline', 'Screening comparison, not occupational limit'],
  ['PM2.5 (WHO)', '15 µg/m³', 'WHO AQG', 'Public health ambient guideline', 'More conservative screening benchmark'],
  ['CO (OSHA)', '50 ppm TWA', '29 CFR 1910.1000', 'Occupational exposure limit', 'Regulatory ceiling for workplace'],
  ['CO (NIOSH)', '35 ppm TWA', 'NIOSH REL', 'Recommended exposure limit', 'Recommended exposure limit'],
  ['HCHO (OSHA PEL)', '0.75 ppm TWA', '29 CFR 1910.1048', 'Occupational exposure limit', 'Regulatory limit'],
  ['HCHO (OSHA AL)', '0.5 ppm', '29 CFR 1910.1048', 'Occupational exposure limit', 'Action level trigger'],
  ['HCHO (NIOSH)', '0.016 ppm', 'NIOSH REL', 'Recommended exposure limit', 'Recommended exposure limit'],
  ['TVOCs (concern)', '500 µg/m³', 'AIHA/ACGIH', 'Internal concern threshold', 'Investigation trigger, not legal limit'],
  ['TVOCs (acute)', '3000 µg/m³', 'AIHA/ACGIH', 'Internal concern threshold', 'Acute concern trigger'],
]

// Allowed benchmark-type labels (docs/report-spec/07 taxonomy).
export const BENCHMARK_TYPE_LABELS = [
  'Occupational exposure limit',
  'Recommended exposure limit',
  'Public health ambient guideline',
  'Ventilation screening benchmark',
  'Thermal comfort criterion',
  'Comfort / moisture indicator',
  'Internal concern threshold',
]

export const BENCHMARK_INTRO =
  'The following published standards, guidelines, and benchmark types frame the screening-level evaluation in this report. Benchmark types carry different regulatory, health, and investigative weight and are not interchangeable. This table is presented in full for every assessment.'

export const BENCHMARK_FOOTNOTE =
  'Benchmark types carry different legal and technical weight. Occupational exposure limits are enforceable workplace standards. Public health guidelines are health-based recommendations. Comfort criteria address thermal acceptability. Screening benchmarks and internal concern thresholds are investigative triggers used for prioritization, not compliance determination.'

// ── Disclaimer (standalone, distinct from the Limitations section) ──

export const DISCLAIMER_PARAGRAPHS = [
  'This report presents screening-level indoor air quality observations prepared for the named client and project. It does not constitute a comprehensive industrial hygiene exposure assessment, a medical or health evaluation, or a determination of regulatory compliance.',
  'Direct-reading measurements are point-in-time values collected at the locations and times noted and may not represent worst-case, average, or typical conditions. Findings are screening-level indicators that support prioritization and further evaluation; they do not establish exposure, causation, or building-relatedness.',
  'Reliance on this report by any party other than the named client, or for any purpose other than that stated herein, is at that party’s own risk. This report should be read in its entirety and in the context of the professional judgment, limitations, and benchmark classifications described herein.',
  `${FIRM_NAME} prepared this screening report under the professional standard of care applicable to screening-level indoor air quality assessments.`,
]

// ── Conclusions closing line ──

export const CONCLUSIONS_CLOSING =
  'These conclusions are screening-level and reflect conditions observed during a single site visit. They are presented as professional judgment to support prioritization and further evaluation, and are not exposure, health, or regulatory-compliance determinations.'

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
    `This indoor air quality screening assessment was conducted, and this report prepared, under the professional judgment of ${assessor}${assessorSuffix} on behalf of ${firm}. The observations and screening-level measurements presented reflect conditions at the time and locations assessed.`,
  ]

  if (opts.reviewStatus === 'final_issued_to_client' && reviewer) {
    paras.push(`This report was reviewed and approved by ${reviewer}${reviewerSuffix} and is issued as a final reviewed report.`)
  } else if (opts.reviewStatus === 'reviewed_by_qualified_professional' && reviewer) {
    paras.push(`This report was reviewed by ${reviewer}${reviewerSuffix} and is pending final approval.`)
  } else {
    paras.push('This report is issued for professional review and requires review by a qualified professional before external reliance.')
  }

  paras.push('This is a screening-level assessment. It does not represent a comprehensive industrial hygiene exposure assessment or a determination of regulatory compliance, and it should be interpreted together with the limitations and benchmark classifications described in this report.')

  return paras
}
