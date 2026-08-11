/**
 * AtmosFlow 3.0 — Canonical ReferenceValue registry (Phase 11).
 *
 * Typed reference values with the metadata the applicability engine needs:
 * referenceType, averagingPeriod, mandatory/advisory, population, citation.
 *
 * Numeric values MUST stay in step with the frozen legacy manifest in
 * src/constants/standards.js (STD). A parity drift-guard test asserts this
 * (tests/engine/investigation-reference-parity.test.ts). Stage 4 will unify
 * the two behind a single source; until then, treat standards.js as the
 * source of truth and mirror here.
 *
 * Reference TYPE classification (not the number) is the defensibility keystone:
 * enforceable OEL vs advisory REL vs public-health standard/guideline vs
 * ventilation criterion vs comfort criterion vs investigative benchmark.
 */

import { AveragingPeriod, ReferenceValue } from './types'

export const REFERENCES: Record<string, ReferenceValue> = {
  // ── Contaminants ──────────────────────────────────────────────────────
  co_osha_pel: {
    id: 'co_osha_pel',
    organization: 'OSHA',
    document: 'PEL, 29 CFR 1910.1000 Table Z-1',
    edition: 'current',
    parameter: 'co',
    value: 50,
    units: 'ppm',
    referenceType: 'occupational_exposure_limit',
    averagingPeriod: AveragingPeriod.TWA_8_HOUR,
    population: 'occupational',
    mandatory: true,
    citation: { organization: 'OSHA', document: '29 CFR 1910.1000 Table Z-1', edition: 'current', prescribesMethodology: true },
  },
  co_niosh_rel: {
    id: 'co_niosh_rel',
    organization: 'NIOSH',
    document: 'REL, Pocket Guide',
    edition: 'current',
    parameter: 'co',
    value: 35,
    units: 'ppm',
    referenceType: 'recommended_exposure_limit',
    averagingPeriod: AveragingPeriod.TWA_8_HOUR,
    population: 'occupational',
    mandatory: false,
    citation: { organization: 'NIOSH', document: 'Pocket Guide to Chemical Hazards', edition: '2005-149' },
  },
  co_epa_naaqs_8h: {
    id: 'co_epa_naaqs_8h',
    organization: 'EPA',
    document: 'NAAQS (CO, 8-hour)',
    edition: '2024',
    parameter: 'co',
    value: 9,
    units: 'ppm',
    referenceType: 'public_health_standard',
    averagingPeriod: AveragingPeriod.TWA_8_HOUR,
    population: 'general',
    mandatory: true,
    citation: { organization: 'EPA', document: '40 CFR 50', edition: '2024' },
  },
  hcho_osha_pel: {
    id: 'hcho_osha_pel',
    organization: 'OSHA',
    document: 'Formaldehyde PEL, 29 CFR 1910.1048',
    edition: 'current',
    parameter: 'hcho',
    value: 0.75,
    units: 'ppm',
    referenceType: 'occupational_exposure_limit',
    averagingPeriod: AveragingPeriod.TWA_8_HOUR,
    population: 'occupational',
    mandatory: true,
    citation: { organization: 'OSHA', document: '29 CFR 1910.1048', edition: 'current', prescribesMethodology: true },
  },
  hcho_osha_al: {
    id: 'hcho_osha_al',
    organization: 'OSHA',
    document: 'Formaldehyde Action Level, 29 CFR 1910.1048',
    edition: 'current',
    parameter: 'hcho',
    value: 0.5,
    units: 'ppm',
    referenceType: 'occupational_exposure_limit',
    averagingPeriod: AveragingPeriod.TWA_8_HOUR,
    population: 'occupational',
    mandatory: true,
    citation: { organization: 'OSHA', document: '29 CFR 1910.1048', edition: 'current', prescribesMethodology: true },
  },
  hcho_niosh_rel: {
    id: 'hcho_niosh_rel',
    organization: 'NIOSH',
    document: 'Formaldehyde REL (ceiling)',
    edition: 'current',
    parameter: 'hcho',
    value: 0.016,
    units: 'ppm',
    referenceType: 'recommended_exposure_limit',
    averagingPeriod: AveragingPeriod.CEILING,
    population: 'occupational',
    mandatory: false,
    citation: { organization: 'NIOSH', document: 'Pocket Guide to Chemical Hazards', edition: '2005-149' },
  },
  pm25_epa_24h: {
    id: 'pm25_epa_24h',
    organization: 'EPA',
    document: 'NAAQS (PM2.5, 24-hour)',
    edition: '2024',
    parameter: 'pm2.5',
    value: 35,
    units: 'µg/m³',
    referenceType: 'public_health_standard',
    averagingPeriod: AveragingPeriod.HOUR_24,
    population: 'general',
    mandatory: true,
    limitations: ['NAAQS carry a statistical form (percentile/3-year average) a single session cannot evaluate.'],
    citation: { organization: 'EPA', document: '40 CFR 50.18', edition: '2024' },
  },
  pm25_who_24h: {
    id: 'pm25_who_24h',
    organization: 'WHO',
    document: 'Air Quality Guidelines (PM2.5, 24-hour)',
    edition: '2021',
    parameter: 'pm2.5',
    value: 15,
    units: 'µg/m³',
    referenceType: 'public_health_guideline',
    averagingPeriod: AveragingPeriod.HOUR_24,
    population: 'general',
    mandatory: false,
    citation: { organization: 'WHO', document: 'Global Air Quality Guidelines', edition: '2021' },
  },
  tvoc_molhave_advisory: {
    id: 'tvoc_molhave_advisory',
    organization: 'Mølhave (advisory)',
    document: 'TVOC multifactorial-exposure advisory tier',
    edition: '1991',
    parameter: 'tvoc',
    value: 500,
    units: 'µg/m³',
    referenceType: 'investigative_benchmark',
    population: 'general',
    mandatory: false,
    limitations: [
      'TVOC has no consensus health limit. TVOC does not identify individual compounds. Advisory only.',
    ],
    citation: { organization: 'Mølhave, L.', document: 'Indoor Air 1(4):357-376', edition: '1991' },
  },
  // ── Ventilation (CO2 as a surrogate — NOT a health limit) ─────────────
  co2_ventilation_surrogate: {
    id: 'co2_ventilation_surrogate',
    organization: 'AtmosFlow (screening trigger)',
    document: 'Indoor-outdoor CO₂ differential ventilation surrogate',
    edition: 'n/a',
    parameter: 'co2_differential',
    value: 700,
    units: 'ppm above outdoor',
    referenceType: 'internal_screening_trigger',
    population: 'sedentary office',
    mandatory: false,
    limitations: [
      'CO₂ is a ventilation-effectiveness indicator, not an air-quality contaminant limit. No current ASHRAE standard sets an indoor CO₂ limit (Persily 2021). The 700 ppm differential is a bioeffluent perception threshold from a since-removed informative appendix.',
    ],
    citation: { organization: 'ASHRAE', document: 'Position Document on Indoor Carbon Dioxide', edition: '2022' },
  },
  // ── Thermal comfort (ASHRAE 55) ───────────────────────────────────────
  temp_ashrae55: {
    id: 'temp_ashrae55',
    organization: 'ASHRAE',
    document: 'Standard 55 thermal comfort (operative temperature)',
    edition: '2023',
    parameter: 'temperature',
    units: '°F',
    referenceType: 'thermal_comfort_criterion',
    population: 'general',
    mandatory: false,
    citation: { organization: 'ASHRAE', document: 'Standard 55', edition: '2023' },
  },
  rh_comfort_band: {
    id: 'rh_comfort_band',
    organization: 'General IAQ guidance / IICRC',
    document: '30–60% RH comfort/moisture-management band',
    edition: 'n/a',
    parameter: 'relative_humidity',
    units: '%',
    referenceType: 'investigative_benchmark',
    population: 'general',
    mandatory: false,
    limitations: [
      'The 30–60% RH band is a general IAQ/moisture rule of thumb, not an ASHRAE 55 comfort requirement; ASHRAE 55-2023 sets only an upper humidity bound.',
    ],
    citation: { organization: 'IICRC / EPA', document: 'moisture-management guidance', edition: 'current' },
  },
}
