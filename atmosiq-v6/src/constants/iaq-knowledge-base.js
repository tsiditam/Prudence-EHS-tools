/**
 * Prudence EHS — IAQ Knowledge Base
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Curated, primary-source-cited lookup tables for the Field Assistant
 * agent (Jasper). Three lookups are exposed:
 *
 *   • lookupExposureLimit(analyte)   — OSHA PEL + NIOSH REL + ACGIH TLV
 *   • lookupSamplingMethod(analyte)  — NIOSH/OSHA/EPA analytical methods
 *   • lookupHealthEffects(analyte)   — acute/chronic effects + target organs
 *
 * Why curated tables (not LLM recall):
 *   • Hallucinated PEL values are a litigation surface. Jasper used to
 *     occasionally cite "OSHA PEL for formaldehyde is 0.75 ppm" — which
 *     happens to be right — but also occasionally invented values for
 *     analytes it hadn't seen often. With this table, every value the
 *     agent surfaces is traceable to 29 CFR / NIOSH NPG / ACGIH TLV-2025.
 *   • The lookup functions return null + a "not in table" message
 *     instead of guessing. The agent's prompt instructs it to say so
 *     to the assessor rather than invent a value.
 *
 * Engine-sacred: this file is pure data + pure lookup. No scoring
 * decisions are made here. The engine continues to own thresholds
 * (in src/constants/standards.js → STD). These tables are
 * exposure-LIMIT data for advisory citation; they are NOT the
 * engine's scoring thresholds. The two layers overlap (e.g. both
 * mention HCHO OSHA PEL) but serve different purposes.
 *
 * Editing rules:
 *   • Every numeric value must be sourced to a primary citation in
 *     the `source` field (29 CFR section, NIOSH NPG, ACGIH TLV year,
 *     EPA document number, etc.).
 *   • If a value is not in primary literature, mark it null with a
 *     comment explaining why. Do not propagate "industry common
 *     knowledge" numbers without a citation.
 *   • Citations need BCSP sign-off before merging materially new
 *     analytes (CLAUDE.md "Journal citations must be verified").
 *
 * Sources canonical:
 *   - 29 CFR 1910.1000 Tables Z-1, Z-2, Z-3 (OSHA general industry PELs)
 *   - 29 CFR 1910.1001–.1052 (substance-specific OSHA standards)
 *   - NIOSH Pocket Guide to Chemical Hazards (DHHS Pub 2005-149,
 *     with 2007 update + per-substance criteria docs)
 *   - ACGIH "TLVs and BEIs" 2025 edition
 *   - NIOSH Manual of Analytical Methods (NMAM) 5th ed.
 *   - EPA Compendium TO-15, TO-17 (VOC analytical methods)
 *   - EPA NAAQS (40 CFR Part 50)
 *   - ATSDR ToxProfiles (health effects)
 */

// ── Normalize the user-facing name space ────────────────────────────
// Each analyte has a canonical key + an alias array so Jasper can call
// the tool with either the chemical name, a common abbreviation, or
// the CAS number.
const ANALYTES = {
  'carbon monoxide': {
    aliases: ['co', 'carbon monoxide', '630-08-0'],
    cas: '630-08-0',
    canonical: 'Carbon Monoxide (CO)',
  },
  'carbon dioxide': {
    aliases: ['co2', 'co₂', 'carbon dioxide', '124-38-9'],
    cas: '124-38-9',
    canonical: 'Carbon Dioxide (CO₂)',
  },
  formaldehyde: {
    aliases: ['hcho', 'formaldehyde', 'ch2o', '50-00-0'],
    cas: '50-00-0',
    canonical: 'Formaldehyde (HCHO)',
  },
  'nitrogen dioxide': {
    aliases: ['no2', 'no₂', 'nitrogen dioxide', '10102-44-0'],
    cas: '10102-44-0',
    canonical: 'Nitrogen Dioxide (NO₂)',
  },
  'sulfur dioxide': {
    aliases: ['so2', 'so₂', 'sulfur dioxide', 'sulphur dioxide', '7446-09-5'],
    cas: '7446-09-5',
    canonical: 'Sulfur Dioxide (SO₂)',
  },
  ozone: {
    aliases: ['o3', 'o₃', 'ozone', '10028-15-6'],
    cas: '10028-15-6',
    canonical: 'Ozone (O₃)',
  },
  'pm2.5': {
    aliases: ['pm2.5', 'pm 2.5', 'fine particulate', 'fine particles'],
    cas: null,
    canonical: 'PM₂.₅ (fine particulate, ≤2.5 µm)',
  },
  pm10: {
    aliases: ['pm10', 'pm 10', 'coarse particulate'],
    cas: null,
    canonical: 'PM₁₀ (respirable particulate, ≤10 µm)',
  },
  tvoc: {
    aliases: ['tvoc', 'total voc', 'total vocs', 'total volatile organic compounds'],
    cas: null,
    canonical: 'Total Volatile Organic Compounds (TVOC)',
  },
  benzene: {
    aliases: ['benzene', 'c6h6', '71-43-2'],
    cas: '71-43-2',
    canonical: 'Benzene',
  },
  toluene: {
    aliases: ['toluene', 'methylbenzene', '108-88-3'],
    cas: '108-88-3',
    canonical: 'Toluene',
  },
  xylenes: {
    aliases: ['xylene', 'xylenes', 'mixed xylenes', '1330-20-7'],
    cas: '1330-20-7',
    canonical: 'Xylenes (mixed isomers)',
  },
  ethylbenzene: {
    aliases: ['ethylbenzene', '100-41-4'],
    cas: '100-41-4',
    canonical: 'Ethylbenzene',
  },
  styrene: {
    aliases: ['styrene', 'vinylbenzene', '100-42-5'],
    cas: '100-42-5',
    canonical: 'Styrene',
  },
  'methylene chloride': {
    aliases: ['methylene chloride', 'dcm', 'dichloromethane', '75-09-2'],
    cas: '75-09-2',
    canonical: 'Methylene Chloride (Dichloromethane)',
  },
  trichloroethylene: {
    aliases: ['tce', 'trichloroethylene', 'trichloroethene', '79-01-6'],
    cas: '79-01-6',
    canonical: 'Trichloroethylene (TCE)',
  },
  tetrachloroethylene: {
    aliases: ['pce', 'perc', 'tetrachloroethylene', 'perchloroethylene', '127-18-4'],
    cas: '127-18-4',
    canonical: 'Tetrachloroethylene (Perchloroethylene, PCE)',
  },
  asbestos: {
    aliases: ['asbestos', 'chrysotile', 'amphibole'],
    cas: null,
    canonical: 'Asbestos (all forms, airborne fibers)',
  },
  'lead (inorganic)': {
    aliases: ['lead', 'pb', 'inorganic lead', '7439-92-1'],
    cas: '7439-92-1',
    canonical: 'Lead (inorganic, airborne)',
  },
  'mercury vapor': {
    aliases: ['mercury', 'hg', 'mercury vapor', 'elemental mercury', '7439-97-6'],
    cas: '7439-97-6',
    canonical: 'Mercury (elemental, vapor)',
  },
  radon: {
    aliases: ['radon', 'rn-222', '14859-67-7'],
    cas: '14859-67-7',
    canonical: 'Radon (Rn-222)',
  },
  'hydrogen sulfide': {
    aliases: ['h2s', 'hydrogen sulfide', '7783-06-4'],
    cas: '7783-06-4',
    canonical: 'Hydrogen Sulfide (H₂S)',
  },
  ammonia: {
    aliases: ['ammonia', 'nh3', '7664-41-7'],
    cas: '7664-41-7',
    canonical: 'Ammonia (NH₃)',
  },
  chlorine: {
    aliases: ['chlorine', 'cl2', '7782-50-5'],
    cas: '7782-50-5',
    canonical: 'Chlorine (Cl₂)',
  },
}

// Build a reverse lookup from any alias → canonical key
const ALIAS_INDEX = (() => {
  const m = new Map()
  for (const [key, info] of Object.entries(ANALYTES)) {
    for (const alias of info.aliases) m.set(alias.toLowerCase(), key)
    m.set(key.toLowerCase(), key)
  }
  return m
})()

/**
 * Resolve a free-form analyte string to a canonical key. Returns null
 * if not in the table.
 */
export function resolveAnalyte(name) {
  if (!name || typeof name !== 'string') return null
  const key = ALIAS_INDEX.get(name.trim().toLowerCase())
  return key || null
}

/**
 * List all canonical analyte names + their aliases. Used by the agent
 * to recover from a "not found" lookup ("Did you mean one of these?").
 */
export function listAnalytes() {
  return Object.entries(ANALYTES).map(([key, info]) => ({
    key,
    canonical: info.canonical,
    cas: info.cas,
    aliases: info.aliases.slice(),
  }))
}

// ── Exposure limits ─────────────────────────────────────────────────
// Schema for each entry:
//   {
//     osha:    { value, units, type: 'TWA'|'STEL'|'Ceiling'|'AL',
//                  duration, citation, note? } | null,
//     niosh:   { value, units, type, duration, citation, note? } | null,
//     acgih:   { value, units, type, duration, citation, note? } | null,
//     epa:     { value, units, type, duration, citation, note? } | null,
//     other:   [{...}]  (e.g. WHO, advisory)
//     idlh:    { value, units, citation } | null
//     carcinogen: 'OSHA-regulated' | 'NIOSH-Ca' | 'IARC-1' | 'IARC-2A' | null
//   }
//
// All values from primary sources; see file header. The Field
// Assistant tool dispatch returns this object verbatim — Jasper
// renders it for the assessor with citations preserved.

const EXPOSURE_LIMITS = {
  'carbon monoxide': {
    osha: { value: 50, units: 'ppm', type: 'TWA', duration: '8-hour', citation: '29 CFR 1910.1000 Table Z-1' },
    niosh: { value: 35, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'NIOSH Pocket Guide (2005-149)', note: 'Ceiling 200 ppm also applies' },
    acgih: { value: 25, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025' },
    epa: null,
    other: [],
    idlh: { value: 1200, units: 'ppm', citation: 'NIOSH IDLH (1994)' },
    carcinogen: null,
  },
  'carbon dioxide': {
    osha: { value: 5000, units: 'ppm', type: 'TWA', duration: '8-hour', citation: '29 CFR 1910.1000 Table Z-1' },
    niosh: { value: 5000, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'NIOSH Pocket Guide', note: 'STEL 30000 ppm' },
    acgih: { value: 5000, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025', note: 'STEL 30000 ppm' },
    epa: null,
    other: [
      {
        agency: 'ASHRAE 62.1-2025',
        value: 700,
        units: 'ppm',
        type: 'differential',
        duration: 'indoor minus outdoor',
        citation: 'ASHRAE 62.1-2025 §6 (proxy for under-ventilation when occupants are CO₂ source)',
        note: 'CO₂ is NOT a toxic indicator at typical IAQ concentrations — it is a ventilation-adequacy proxy',
      },
    ],
    idlh: { value: 40000, units: 'ppm', citation: 'NIOSH IDLH (1996)' },
    carcinogen: null,
  },
  formaldehyde: {
    osha: { value: 0.75, units: 'ppm', type: 'TWA', duration: '8-hour', citation: '29 CFR 1910.1048(c)', note: 'STEL 2 ppm; Action Level 0.5 ppm 8-hr TWA' },
    niosh: { value: 0.016, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'NIOSH Pocket Guide', note: 'Ceiling 0.1 ppm (15-min); NIOSH-Ca' },
    acgih: { value: 0.1, units: 'ppm', type: 'Ceiling', duration: 'instantaneous', citation: 'ACGIH TLVs and BEIs 2025', note: 'A2 — Suspected human carcinogen' },
    epa: null,
    other: [
      { agency: 'NIOSH Action Level', value: 0.5, units: 'ppm', type: 'AL', duration: '8-hour', citation: '29 CFR 1910.1048(d)(2)' },
    ],
    idlh: { value: 20, units: 'ppm', citation: 'NIOSH IDLH (1994)' },
    carcinogen: 'OSHA-regulated',
  },
  'nitrogen dioxide': {
    osha: { value: 5, units: 'ppm', type: 'Ceiling', duration: 'instantaneous', citation: '29 CFR 1910.1000 Table Z-1' },
    niosh: { value: 1, units: 'ppm', type: 'STEL', duration: '15-minute', citation: 'NIOSH Pocket Guide' },
    acgih: { value: 0.2, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025' },
    epa: { value: 0.053, units: 'ppm', type: 'NAAQS Annual', duration: 'annual arithmetic mean', citation: 'EPA NAAQS 40 CFR 50.11' },
    other: [],
    idlh: { value: 20, units: 'ppm', citation: 'NIOSH IDLH (1994)' },
    carcinogen: null,
  },
  'sulfur dioxide': {
    osha: { value: 5, units: 'ppm', type: 'TWA', duration: '8-hour', citation: '29 CFR 1910.1000 Table Z-1' },
    niosh: { value: 2, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'NIOSH Pocket Guide', note: 'STEL 5 ppm' },
    acgih: { value: 0.25, units: 'ppm', type: 'STEL', duration: '15-minute', citation: 'ACGIH TLVs and BEIs 2025' },
    epa: { value: 75, units: 'ppb', type: 'NAAQS 1-hour', duration: '99th percentile of daily max', citation: 'EPA NAAQS 40 CFR 50.17' },
    other: [],
    idlh: { value: 100, units: 'ppm', citation: 'NIOSH IDLH (1994)' },
    carcinogen: null,
  },
  ozone: {
    osha: { value: 0.1, units: 'ppm', type: 'TWA', duration: '8-hour', citation: '29 CFR 1910.1000 Table Z-1' },
    niosh: { value: 0.1, units: 'ppm', type: 'Ceiling', duration: 'instantaneous', citation: 'NIOSH Pocket Guide' },
    acgih: { value: 0.05, units: 'ppm', type: 'TWA', duration: '8-hour, heavy work', citation: 'ACGIH TLVs and BEIs 2025', note: 'Ranges from 0.05–0.20 ppm depending on workload + duration' },
    epa: { value: 0.070, units: 'ppm', type: 'NAAQS 8-hour', duration: 'annual fourth-highest daily max', citation: 'EPA NAAQS 40 CFR 50.19 (2015 revision)' },
    other: [],
    idlh: { value: 5, units: 'ppm', citation: 'NIOSH IDLH (1994)' },
    carcinogen: null,
  },
  'pm2.5': {
    osha: null,
    niosh: null,
    acgih: null,
    epa: { value: 9, units: 'µg/m³', type: 'NAAQS Annual', duration: 'annual arithmetic mean', citation: 'EPA NAAQS 40 CFR 50.20 (2024 revision)', note: 'Also 35 µg/m³ 24-hour 98th percentile' },
    other: [
      { agency: 'WHO 2021 AQG', value: 5, units: 'µg/m³', type: 'Annual', duration: 'annual mean', citation: 'WHO Global Air Quality Guidelines 2021' },
      { agency: 'WHO 2021 AQG', value: 15, units: 'µg/m³', type: '24-hour', duration: '24-hour 99th percentile', citation: 'WHO Global Air Quality Guidelines 2021' },
    ],
    idlh: null,
    carcinogen: 'IARC-1', // outdoor air pollution / PM2.5
    note: 'No OSHA workplace PEL for PM2.5 specifically; falls under PNOR/PNOC. Indoor exposures benchmarked to EPA NAAQS as policy reference.',
  },
  pm10: {
    osha: null,
    niosh: null,
    acgih: null,
    epa: { value: 150, units: 'µg/m³', type: 'NAAQS 24-hour', duration: 'not to be exceeded more than once per year on average over 3 years', citation: 'EPA NAAQS 40 CFR 50.6' },
    other: [
      { agency: 'WHO 2021 AQG', value: 15, units: 'µg/m³', type: 'Annual', duration: 'annual mean', citation: 'WHO Global Air Quality Guidelines 2021' },
      { agency: 'WHO 2021 AQG', value: 45, units: 'µg/m³', type: '24-hour', duration: '24-hour 99th percentile', citation: 'WHO Global Air Quality Guidelines 2021' },
    ],
    idlh: null,
    carcinogen: null,
  },
  tvoc: {
    osha: null,
    niosh: null,
    acgih: null,
    epa: null,
    other: [
      { agency: 'Mølhave 1991 (advisory)', value: 0.2, units: 'mg/m³', type: 'Comfort range', duration: 'long-term', citation: 'Mølhave, L. (1991) Volatile Organic Compounds, Indoor Air Quality and Health. Indoor Air 1(4):357-376', note: '<0.2 mg/m³ comfort; 0.2–3 mg/m³ irritation possible; 3–25 mg/m³ irritation + headache; >25 mg/m³ toxic range. ADVISORY ONLY — not regulatory.' },
    ],
    idlh: null,
    carcinogen: null,
    note: 'TVOC is a screening proxy, not a regulated value. Speciate to individual compounds (benzene, formaldehyde, etc.) for any regulatory or risk determination.',
  },
  benzene: {
    osha: { value: 1, units: 'ppm', type: 'TWA', duration: '8-hour', citation: '29 CFR 1910.1028(c)(1)', note: 'STEL 5 ppm; Action Level 0.5 ppm 8-hr TWA' },
    niosh: { value: 0.1, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'NIOSH Pocket Guide', note: 'STEL 1 ppm; NIOSH-Ca' },
    acgih: { value: 0.5, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025', note: 'STEL 2.5 ppm; A1 — Confirmed human carcinogen' },
    epa: null,
    other: [],
    idlh: { value: 500, units: 'ppm', citation: 'NIOSH IDLH (1996)' },
    carcinogen: 'IARC-1',
  },
  toluene: {
    osha: { value: 200, units: 'ppm', type: 'TWA', duration: '8-hour', citation: '29 CFR 1910.1000 Table Z-2', note: 'Ceiling 300 ppm; Peak 500 ppm (10-min)' },
    niosh: { value: 100, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'NIOSH Pocket Guide', note: 'STEL 150 ppm' },
    acgih: { value: 20, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025' },
    epa: null,
    other: [],
    idlh: { value: 500, units: 'ppm', citation: 'NIOSH IDLH (1996)' },
    carcinogen: null,
  },
  xylenes: {
    osha: { value: 100, units: 'ppm', type: 'TWA', duration: '8-hour', citation: '29 CFR 1910.1000 Table Z-1' },
    niosh: { value: 100, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'NIOSH Pocket Guide', note: 'STEL 150 ppm' },
    acgih: { value: 100, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025', note: 'STEL 150 ppm' },
    epa: null,
    other: [],
    idlh: { value: 900, units: 'ppm', citation: 'NIOSH IDLH (1996)' },
    carcinogen: null,
  },
  ethylbenzene: {
    osha: { value: 100, units: 'ppm', type: 'TWA', duration: '8-hour', citation: '29 CFR 1910.1000 Table Z-1' },
    niosh: { value: 100, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'NIOSH Pocket Guide', note: 'STEL 125 ppm' },
    acgih: { value: 20, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025' },
    epa: null,
    other: [],
    idlh: { value: 800, units: 'ppm', citation: 'NIOSH IDLH (1996)' },
    carcinogen: 'IARC-2B',
  },
  styrene: {
    osha: { value: 100, units: 'ppm', type: 'TWA', duration: '8-hour', citation: '29 CFR 1910.1000 Table Z-2', note: 'Ceiling 200 ppm; Peak 600 ppm (5-min)' },
    niosh: { value: 50, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'NIOSH Pocket Guide', note: 'STEL 100 ppm' },
    acgih: { value: 10, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025', note: 'STEL 20 ppm' },
    epa: null,
    other: [],
    idlh: { value: 700, units: 'ppm', citation: 'NIOSH IDLH (1996)' },
    carcinogen: 'IARC-2A',
  },
  'methylene chloride': {
    osha: { value: 25, units: 'ppm', type: 'TWA', duration: '8-hour', citation: '29 CFR 1910.1052(c)', note: 'STEL 125 ppm (15-min); Action Level 12.5 ppm' },
    niosh: { value: null, units: 'ppm', type: 'Lowest feasible', duration: '—', citation: 'NIOSH Pocket Guide', note: 'NIOSH-Ca; reduce exposure to lowest feasible concentration' },
    acgih: { value: 50, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025' },
    epa: null,
    other: [],
    idlh: { value: 2300, units: 'ppm', citation: 'NIOSH IDLH (1996)' },
    carcinogen: 'IARC-2A',
  },
  trichloroethylene: {
    osha: { value: 100, units: 'ppm', type: 'TWA', duration: '8-hour', citation: '29 CFR 1910.1000 Table Z-2', note: 'Ceiling 200 ppm; Peak 300 ppm (5-min)' },
    niosh: { value: 25, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'NIOSH Pocket Guide', note: 'NIOSH-Ca' },
    acgih: { value: 10, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025', note: 'STEL 25 ppm; A2 carcinogen' },
    epa: null,
    other: [],
    idlh: { value: 1000, units: 'ppm', citation: 'NIOSH IDLH (1996)' },
    carcinogen: 'IARC-1',
  },
  tetrachloroethylene: {
    osha: { value: 100, units: 'ppm', type: 'TWA', duration: '8-hour', citation: '29 CFR 1910.1000 Table Z-2', note: 'Ceiling 200 ppm' },
    niosh: { value: null, units: 'ppm', type: 'Lowest feasible', duration: '—', citation: 'NIOSH Pocket Guide', note: 'NIOSH-Ca; reduce exposure to lowest feasible concentration' },
    acgih: { value: 25, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025', note: 'STEL 100 ppm; A3 carcinogen' },
    epa: null,
    other: [],
    idlh: { value: 150, units: 'ppm', citation: 'NIOSH IDLH (1996)' },
    carcinogen: 'IARC-2A',
  },
  asbestos: {
    osha: { value: 0.1, units: 'f/cc', type: 'TWA', duration: '8-hour', citation: '29 CFR 1910.1001(c)(1)', note: 'Excursion limit 1.0 f/cc (30-min)' },
    niosh: { value: 0.1, units: 'f/cc', type: 'TWA', duration: '8-hour (≥5 µm)', citation: 'NIOSH Pocket Guide', note: 'NIOSH-Ca' },
    acgih: { value: 0.1, units: 'f/cc', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025', note: 'A1 — Confirmed human carcinogen' },
    epa: null,
    other: [],
    idlh: null,
    carcinogen: 'IARC-1',
  },
  'lead (inorganic)': {
    osha: { value: 0.05, units: 'mg/m³', type: 'TWA', duration: '8-hour', citation: '29 CFR 1910.1025(c)', note: 'Action Level 0.03 mg/m³' },
    niosh: { value: 0.05, units: 'mg/m³', type: 'TWA', duration: '8-hour', citation: 'NIOSH Pocket Guide', note: 'Air-lead 0.050 mg/m³ goal; NIOSH calls for lower in light of revised BLL targets' },
    acgih: { value: 0.05, units: 'mg/m³', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025', note: 'BEI: blood lead 20 µg/dL' },
    epa: { value: 0.15, units: 'µg/m³', type: 'NAAQS rolling 3-month', duration: '3-month average', citation: 'EPA NAAQS 40 CFR 50.16 (2008 revision)' },
    other: [],
    idlh: { value: 100, units: 'mg/m³', citation: 'NIOSH IDLH (1994)' },
    carcinogen: 'IARC-2A',
  },
  'mercury vapor': {
    osha: { value: 0.1, units: 'mg/m³', type: 'Ceiling', duration: 'instantaneous', citation: '29 CFR 1910.1000 Table Z-2' },
    niosh: { value: 0.05, units: 'mg/m³', type: 'TWA', duration: '8-hour', citation: 'NIOSH Pocket Guide', note: 'Skin notation' },
    acgih: { value: 0.025, units: 'mg/m³', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025', note: 'Skin notation; BEI: urine mercury 20 µg/g creatinine' },
    epa: null,
    other: [],
    idlh: { value: 10, units: 'mg/m³', citation: 'NIOSH IDLH (1994)' },
    carcinogen: null,
  },
  radon: {
    osha: null,
    niosh: null,
    acgih: null,
    epa: { value: 4, units: 'pCi/L', type: 'Action Level (residential)', duration: 'annual avg', citation: 'EPA 402-K-12-002 "A Citizen\'s Guide to Radon"', note: '148 Bq/m³ equivalent. EPA recommends mitigation at or above this level.' },
    other: [
      { agency: 'WHO', value: 100, units: 'Bq/m³', type: 'Reference level', duration: 'annual avg', citation: 'WHO Handbook on Indoor Radon (2009)', note: '~2.7 pCi/L equivalent' },
    ],
    idlh: null,
    carcinogen: 'IARC-1',
    note: 'No OSHA general-industry PEL for radon. Uranium mining has 10 CFR 20 limits. Indoor screening referenced to EPA action level.',
  },
  'hydrogen sulfide': {
    osha: { value: 20, units: 'ppm', type: 'Ceiling', duration: 'instantaneous', citation: '29 CFR 1910.1000 Table Z-2', note: 'Peak 50 ppm (10-min, once per 8-hr shift)' },
    niosh: { value: 10, units: 'ppm', type: 'Ceiling', duration: '10-minute', citation: 'NIOSH Pocket Guide' },
    acgih: { value: 1, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025', note: 'STEL 5 ppm' },
    epa: null,
    other: [],
    idlh: { value: 100, units: 'ppm', citation: 'NIOSH IDLH (1994)' },
    carcinogen: null,
  },
  ammonia: {
    osha: { value: 50, units: 'ppm', type: 'TWA', duration: '8-hour', citation: '29 CFR 1910.1000 Table Z-1' },
    niosh: { value: 25, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'NIOSH Pocket Guide', note: 'STEL 35 ppm' },
    acgih: { value: 25, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025', note: 'STEL 35 ppm' },
    epa: null,
    other: [],
    idlh: { value: 300, units: 'ppm', citation: 'NIOSH IDLH (1994)' },
    carcinogen: null,
  },
  chlorine: {
    osha: { value: 1, units: 'ppm', type: 'Ceiling', duration: 'instantaneous', citation: '29 CFR 1910.1000 Table Z-1' },
    niosh: { value: 0.5, units: 'ppm', type: 'STEL', duration: '15-minute', citation: 'NIOSH Pocket Guide' },
    acgih: { value: 0.1, units: 'ppm', type: 'TWA', duration: '8-hour', citation: 'ACGIH TLVs and BEIs 2025', note: 'STEL 0.4 ppm' },
    epa: null,
    other: [],
    idlh: { value: 10, units: 'ppm', citation: 'NIOSH IDLH (1994)' },
    carcinogen: null,
  },
}

// ── Sampling methods ────────────────────────────────────────────────
// Schema: { method, agency, matrix, technique, range, notes? }[]
const SAMPLING_METHODS = {
  'carbon monoxide': [
    { method: 'Direct-read (electrochemical sensor)', agency: 'Field', matrix: 'air', technique: 'Electrochemical cell', range: '0–500 ppm typical', notes: 'Most common in IAQ screening. Verify cal gas record + 270-day calibration.' },
    { method: 'NIOSH 6604', agency: 'NIOSH', matrix: 'air', technique: 'Portable GC', range: '1–500 ppm', notes: 'Confirmatory if direct-read result is contested.' },
  ],
  'carbon dioxide': [
    { method: 'Direct-read (NDIR)', agency: 'Field', matrix: 'air', technique: 'Non-dispersive infrared', range: '0–5000 ppm typical', notes: 'IAQ field standard. Pair with outdoor reading at every assessment for differential interpretation.' },
    { method: 'NIOSH 6603', agency: 'NIOSH', matrix: 'air', technique: 'Portable IR', range: '0–10000 ppm', notes: 'Method-validated equivalent.' },
  ],
  formaldehyde: [
    { method: 'NIOSH 2016', agency: 'NIOSH', matrix: 'air', technique: 'HPLC with DNPH-coated cartridge', range: '0.01–1.5 ppm', notes: 'Preferred for time-weighted samples; 24-hr passive badges feasible.' },
    { method: 'NIOSH 2541', agency: 'NIOSH', matrix: 'air', technique: 'GC/FID, XAD-2 sorbent', range: 'Higher-concentration alternative', notes: '' },
    { method: 'OSHA 1007', agency: 'OSHA', matrix: 'air', technique: 'HPLC with DNPH', range: '0.01–10 ppm', notes: 'OSHA reference method for 1910.1048 compliance sampling.' },
    { method: 'Direct-read (electrochemical, sub-ppm)', agency: 'Field', matrix: 'air', technique: 'Electrochemical', range: '0.01–5 ppm', notes: 'Screening only — cross-sensitivity to other aldehydes. Confirm with NIOSH 2016 for any actionable finding.' },
  ],
  'nitrogen dioxide': [
    { method: 'NIOSH 6014', agency: 'NIOSH', matrix: 'air', technique: 'Visible absorption, TEA-impregnated filter', range: '0.1–5 ppm', notes: 'Passive diffusive badge.' },
    { method: 'Direct-read (electrochemical)', agency: 'Field', matrix: 'air', technique: 'Electrochemical', range: '0–20 ppm typical', notes: 'Watch for SO₂ cross-sensitivity on some sensors.' },
  ],
  'sulfur dioxide': [
    { method: 'NIOSH 6004', agency: 'NIOSH', matrix: 'air', technique: 'IC, impinger or filter', range: 'Method-dependent', notes: '' },
    { method: 'Direct-read (electrochemical)', agency: 'Field', matrix: 'air', technique: 'Electrochemical', range: '0–20 ppm typical', notes: '' },
  ],
  ozone: [
    { method: 'OSHA ID-214', agency: 'OSHA', matrix: 'air', technique: 'IC, nitrite-impregnated filter', range: '0.01–1 ppm', notes: '' },
    { method: 'Direct-read (UV photometric)', agency: 'Field', matrix: 'air', technique: 'UV absorption at 254 nm', range: '0–1 ppm', notes: 'EPA equivalent method for ambient monitoring.' },
  ],
  'pm2.5': [
    { method: 'NIOSH 0600', agency: 'NIOSH', matrix: 'air', technique: 'Gravimetric, respirable cyclone + 37mm PVC filter', range: 'Field-deployable', notes: 'Use 37 mm PVC filter, BGI4L or equivalent cyclone for respirable cut.' },
    { method: 'Direct-read (light scatter)', agency: 'Field', matrix: 'air', technique: 'Optical particle counter or nephelometer (e.g. DustTrak, Aerocet)', range: '0.001–100 mg/m³', notes: 'Screening only — gravimetric correction factor for actionable findings.' },
    { method: 'EPA FRM/FEM PM2.5', agency: 'EPA', matrix: 'air', technique: 'Federal Reference Method gravimetric', range: 'Ambient', notes: 'Reference method for NAAQS comparison.' },
  ],
  pm10: [
    { method: 'NIOSH 0500', agency: 'NIOSH', matrix: 'air', technique: 'Gravimetric, total dust (no size-selective inlet)', range: 'Field-deployable', notes: '' },
    { method: 'Direct-read (optical)', agency: 'Field', matrix: 'air', technique: 'Optical particle counter, PM10 inlet', range: '0.001–100 mg/m³', notes: 'Screening only.' },
  ],
  tvoc: [
    { method: 'EPA TO-15', agency: 'EPA', matrix: 'air', technique: 'GC/MS, Summa canister', range: 'sub-ppb to ppm', notes: 'Reference method for VOC speciation. Use when individual compound IDs needed (benzene, etc.).' },
    { method: 'EPA TO-17', agency: 'EPA', matrix: 'air', technique: 'Thermal desorption GC/MS, sorbent tube', range: 'sub-ppb to ppm', notes: 'Pumped sample on Tenax or carbopack tube. Lower detection than passive.' },
    { method: 'Direct-read (PID)', agency: 'Field', matrix: 'air', technique: 'Photoionization detector, 10.6 eV typical', range: '0.001–10000 ppm', notes: 'Screening only — PID responds to a mix of VOCs with compound-specific response factors. Calibrate to isobutylene; apply RF for target compound interpretation.' },
  ],
  benzene: [
    { method: 'NIOSH 1500', agency: 'NIOSH', matrix: 'air', technique: 'GC/FID, charcoal tube', range: '0.5–500 ppm', notes: 'Common BTEX panel method.' },
    { method: 'OSHA 12', agency: 'OSHA', matrix: 'air', technique: 'GC/FID, charcoal tube', range: 'Compliance', notes: 'OSHA reference for 1910.1028.' },
    { method: 'EPA TO-15', agency: 'EPA', matrix: 'air', technique: 'GC/MS, Summa canister', range: 'sub-ppb', notes: 'Preferred for sub-ppb IAQ levels.' },
  ],
  toluene: [
    { method: 'NIOSH 1501', agency: 'NIOSH', matrix: 'air', technique: 'GC/FID, charcoal tube', range: '1–500 ppm', notes: 'BTEX panel method.' },
    { method: 'EPA TO-15', agency: 'EPA', matrix: 'air', technique: 'GC/MS, Summa canister', range: 'sub-ppb', notes: '' },
  ],
  xylenes: [
    { method: 'NIOSH 1501', agency: 'NIOSH', matrix: 'air', technique: 'GC/FID, charcoal tube', range: '1–500 ppm', notes: 'BTEX panel method.' },
    { method: 'EPA TO-15', agency: 'EPA', matrix: 'air', technique: 'GC/MS, Summa canister', range: 'sub-ppb', notes: '' },
  ],
  ethylbenzene: [
    { method: 'NIOSH 1501', agency: 'NIOSH', matrix: 'air', technique: 'GC/FID, charcoal tube', range: '1–500 ppm', notes: 'BTEX panel method.' },
    { method: 'EPA TO-15', agency: 'EPA', matrix: 'air', technique: 'GC/MS, Summa canister', range: 'sub-ppb', notes: '' },
  ],
  styrene: [
    { method: 'NIOSH 1501', agency: 'NIOSH', matrix: 'air', technique: 'GC/FID, charcoal tube', range: '1–200 ppm', notes: '' },
    { method: 'EPA TO-15', agency: 'EPA', matrix: 'air', technique: 'GC/MS, Summa canister', range: 'sub-ppb', notes: '' },
  ],
  'methylene chloride': [
    { method: 'NIOSH 1005', agency: 'NIOSH', matrix: 'air', technique: 'GC/FID, charcoal tube', range: '5–1000 ppm', notes: '' },
    { method: 'OSHA 80', agency: 'OSHA', matrix: 'air', technique: 'GC/FID', range: 'Compliance', notes: 'OSHA reference for 1910.1052.' },
  ],
  trichloroethylene: [
    { method: 'NIOSH 1022', agency: 'NIOSH', matrix: 'air', technique: 'GC/FID, charcoal tube', range: '0.1–100 ppm', notes: '' },
    { method: 'EPA TO-15', agency: 'EPA', matrix: 'air', technique: 'GC/MS, Summa canister', range: 'sub-ppb', notes: '' },
  ],
  tetrachloroethylene: [
    { method: 'NIOSH 1003', agency: 'NIOSH', matrix: 'air', technique: 'GC/FID, charcoal tube', range: '0.1–100 ppm', notes: 'Halogenated hydrocarbon group method.' },
    { method: 'EPA TO-15', agency: 'EPA', matrix: 'air', technique: 'GC/MS, Summa canister', range: 'sub-ppb', notes: '' },
  ],
  asbestos: [
    { method: 'NIOSH 7400', agency: 'NIOSH', matrix: 'air', technique: 'PCM, phase-contrast microscopy', range: '0.04–0.5 f/cc (loaded)', notes: 'Standard OSHA compliance method. Counts fibers ≥5 µm length, ≥3:1 aspect ratio. Does not identify mineral type.' },
    { method: 'NIOSH 7402', agency: 'NIOSH', matrix: 'air', technique: 'TEM, transmission electron microscopy', range: 'sub-PCM', notes: 'Confirmatory; identifies mineral type and counts thinner fibers PCM misses.' },
    { method: 'EPA AHERA', agency: 'EPA', matrix: 'air', technique: 'TEM (AHERA-spec)', range: 'Clearance', notes: '40 CFR 763 clearance criteria for school abatement; 70 fibers/mm² filter limit.' },
    { method: 'NIOSH 9002 / EPA 600/R-93/116', agency: 'NIOSH/EPA', matrix: 'bulk', technique: 'PLM, polarized light microscopy', range: '<1% to 100%', notes: 'Standard bulk method. Below 1% requires point-counting or TEM.' },
  ],
  'lead (inorganic)': [
    { method: 'NIOSH 7300/7301', agency: 'NIOSH', matrix: 'air', technique: 'ICP-AES', range: 'Method-dependent', notes: 'Multi-element method.' },
    { method: 'NIOSH 7082', agency: 'NIOSH', matrix: 'air', technique: 'Flame AAS', range: 'Method-dependent', notes: '' },
    { method: 'NIOSH 9100 / ASTM E1979', agency: 'NIOSH/ASTM', matrix: 'wipe', technique: 'Surface wipe + acid extraction + AAS or ICP', range: 'µg/ft²', notes: 'Loading limits (40 CFR 745): 10 µg/ft² floor, 100 µg/ft² windowsill (post-2020 EPA RRP).' },
    { method: 'XRF (in-situ)', agency: 'Field', matrix: 'paint/surface', technique: 'X-ray fluorescence', range: 'mg/cm²', notes: 'HUD/EPA action level 1.0 mg/cm² for paint. Screening; confirmatory wipe or chip required for negative findings near action level.' },
  ],
  'mercury vapor': [
    { method: 'NIOSH 6009', agency: 'NIOSH', matrix: 'air', technique: 'Cold-vapor AAS, hopcalite sorbent', range: '0.001–0.5 mg/m³', notes: '' },
    { method: 'Direct-read (Lumex / Jerome)', agency: 'Field', matrix: 'air', technique: 'AAS or gold-film', range: 'sub-µg/m³', notes: 'Real-time mercury vapor analyzer; useful for spill response.' },
  ],
  radon: [
    { method: 'EPA charcoal canister', agency: 'EPA', matrix: 'air', technique: 'Activated charcoal adsorption + gamma counting', range: '0.5–500 pCi/L', notes: 'Short-term (2–7 day) screening. Inexpensive.' },
    { method: 'EPA Alpha-track detector', agency: 'EPA', matrix: 'air', technique: 'Etched-track polycarbonate', range: 'Long-term', notes: '90-day to 1-year integrated measurement.' },
    { method: 'Continuous radon monitor (CRM)', agency: 'EPA/NRPP', matrix: 'air', technique: 'Scintillation or ion chamber, continuous', range: '0.1–999 pCi/L', notes: 'Real-time; required by NRPP for short-term real-estate transaction tests.' },
    { method: 'E-PERM electret', agency: 'EPA', matrix: 'air', technique: 'Electret ion chamber', range: 'Short or long-term', notes: '' },
  ],
  'hydrogen sulfide': [
    { method: 'NIOSH 6013', agency: 'NIOSH', matrix: 'air', technique: 'IC, KOH-impregnated solid sorbent', range: '0.5–500 ppm', notes: '' },
    { method: 'Direct-read (electrochemical)', agency: 'Field', matrix: 'air', technique: 'Electrochemical', range: '0–100 ppm typical', notes: 'Confined-space monitor standard.' },
  ],
  ammonia: [
    { method: 'NIOSH 6015', agency: 'NIOSH', matrix: 'air', technique: 'IC, H₂SO₄-treated solid sorbent', range: '1–200 ppm', notes: '' },
    { method: 'NIOSH 6016', agency: 'NIOSH', matrix: 'air', technique: 'Colorimetric badge', range: '5–50 ppm', notes: 'Passive diffusive.' },
    { method: 'Direct-read (electrochemical)', agency: 'Field', matrix: 'air', technique: 'Electrochemical', range: '0–100 ppm typical', notes: '' },
  ],
  chlorine: [
    { method: 'OSHA ID-101', agency: 'OSHA', matrix: 'air', technique: 'IC, sulfamic-acid-treated filter', range: '0.05–10 ppm', notes: '' },
    { method: 'Direct-read (electrochemical)', agency: 'Field', matrix: 'air', technique: 'Electrochemical', range: '0–10 ppm typical', notes: '' },
  ],
}

// ── Health effects ──────────────────────────────────────────────────
// Schema:
//   {
//     acute:    [{ symptom, threshold? }],
//     chronic:  [{ effect }],
//     targetOrgans: string[],
//     biomarkers: [{ name, matrix }],
//     sources:  string[]    // citations
//   }
const HEALTH_EFFECTS = {
  'carbon monoxide': {
    acute: [
      { symptom: 'Headache, fatigue', threshold: 'COHb 10–20%' },
      { symptom: 'Confusion, impaired judgment, tachycardia', threshold: 'COHb 20–30%' },
      { symptom: 'Loss of consciousness, seizure', threshold: 'COHb >40%' },
      { symptom: 'Death', threshold: 'COHb >50–60%' },
    ],
    chronic: [{ effect: 'Cardiovascular stress; possible neurocognitive sequelae after severe acute exposure' }],
    targetOrgans: ['Central nervous system', 'Cardiovascular system'],
    biomarkers: [{ name: 'Carboxyhemoglobin (COHb)', matrix: 'blood' }],
    sources: ['ATSDR ToxProfile CO (2012)', 'OSHA 29 CFR 1910.1000'],
  },
  'carbon dioxide': {
    acute: [
      { symptom: 'Drowsiness, mild headache, decreased cognitive performance', threshold: '~1000–2500 ppm (IAQ proxy)' },
      { symptom: 'Headache, dyspnea, tachycardia', threshold: '>20000 ppm' },
      { symptom: 'Unconsciousness', threshold: '>70000 ppm' },
    ],
    chronic: [{ effect: 'No demonstrated chronic toxicity at IAQ-relevant levels — CO₂ is a ventilation-adequacy indicator, not a contaminant of concern at typical building levels' }],
    targetOrgans: ['Central nervous system (asphyxiant at very high levels)'],
    biomarkers: [],
    sources: ['ASHRAE 62.1-2025 §6', 'ATSDR ToxProfile CO₂'],
  },
  formaldehyde: {
    acute: [
      { symptom: 'Eye, nose, throat irritation', threshold: '0.5–1 ppm (sensitive individuals)' },
      { symptom: 'Lacrimation, cough, bronchospasm', threshold: '>2 ppm' },
      { symptom: 'Pulmonary edema (high acute)', threshold: '>20 ppm' },
    ],
    chronic: [
      { effect: 'Nasopharyngeal cancer (IARC Group 1)' },
      { effect: 'Sensitization (occupational asthma in some workers)' },
    ],
    targetOrgans: ['Eyes', 'Upper respiratory tract', 'Skin'],
    biomarkers: [],
    sources: ['IARC Monograph Vol 100F (2012)', 'ATSDR ToxProfile Formaldehyde (1999)', '29 CFR 1910.1048'],
  },
  'nitrogen dioxide': {
    acute: [
      { symptom: 'Mucous membrane irritation', threshold: '1–5 ppm' },
      { symptom: 'Pulmonary edema (delayed 4–24 hr)', threshold: '>20 ppm sustained' },
    ],
    chronic: [{ effect: 'Reduced lung function; childhood-asthma exacerbation at chronic ambient exposure' }],
    targetOrgans: ['Lower respiratory tract'],
    biomarkers: [],
    sources: ['ATSDR ToxProfile Nitrogen Oxides (2002)', 'EPA NAAQS NO₂ ISA (2016)'],
  },
  'sulfur dioxide': {
    acute: [
      { symptom: 'Bronchoconstriction (asthmatics)', threshold: '<1 ppm exertional' },
      { symptom: 'Eye/throat irritation', threshold: '1–5 ppm' },
      { symptom: 'Respiratory distress', threshold: '>10 ppm' },
    ],
    chronic: [{ effect: 'Chronic bronchitis with prolonged occupational exposure' }],
    targetOrgans: ['Upper and lower respiratory tract'],
    biomarkers: [],
    sources: ['ATSDR ToxProfile SO₂ (1998)'],
  },
  ozone: {
    acute: [
      { symptom: 'Chest tightness, cough, decreased FEV₁', threshold: '0.08–0.12 ppm with exertion' },
      { symptom: 'Pulmonary edema', threshold: '>1 ppm' },
    ],
    chronic: [{ effect: 'Accelerated lung function decline; increased asthma morbidity' }],
    targetOrgans: ['Lower respiratory tract'],
    biomarkers: [],
    sources: ['EPA Ozone ISA (2020)'],
  },
  'pm2.5': {
    acute: [{ symptom: 'Asthma exacerbation; cardiovascular events (sensitive populations)', threshold: '24-hr >35 µg/m³' }],
    chronic: [
      { effect: 'Increased all-cause mortality; lung cancer (IARC outdoor air pollution Group 1)' },
      { effect: 'Cardiopulmonary disease, stroke' },
    ],
    targetOrgans: ['Lower respiratory tract', 'Cardiovascular system'],
    biomarkers: [],
    sources: ['EPA PM ISA (2019)', 'WHO Global AQ Guidelines (2021)', 'IARC Monograph Vol 109 (2016)'],
  },
  pm10: {
    acute: [{ symptom: 'Respiratory symptoms (sensitive populations)', threshold: '24-hr >150 µg/m³' }],
    chronic: [{ effect: 'Reduced lung function; cardiopulmonary morbidity' }],
    targetOrgans: ['Respiratory tract'],
    biomarkers: [],
    sources: ['EPA PM ISA (2019)'],
  },
  tvoc: {
    acute: [{ symptom: 'Nonspecific irritation, headache, "stuffy" feeling (Mølhave construct)', threshold: '0.2–3 mg/m³' }],
    chronic: [{ effect: 'Determined by individual species, not TVOC sum' }],
    targetOrgans: ['Varies by speciation'],
    biomarkers: [],
    sources: ['Mølhave (1991) Indoor Air 1(4):357-376'],
  },
  benzene: {
    acute: [{ symptom: 'CNS depression at high vapor exposures (>500 ppm)', threshold: 'IDLH 500 ppm' }],
    chronic: [
      { effect: 'Acute myeloid leukemia (IARC Group 1, NTP Known Human Carcinogen)' },
      { effect: 'Aplastic anemia, pancytopenia at lower chronic exposures' },
    ],
    targetOrgans: ['Bone marrow', 'Hematopoietic system'],
    biomarkers: [{ name: 't,t-muconic acid', matrix: 'urine' }, { name: 'S-phenylmercapturic acid', matrix: 'urine' }],
    sources: ['IARC Monograph Vol 120 (2018)', 'ATSDR ToxProfile Benzene (2007)', '29 CFR 1910.1028'],
  },
  toluene: {
    acute: [
      { symptom: 'CNS depression, dizziness, narcosis', threshold: '200–500 ppm' },
      { symptom: 'Severe CNS effects, coma', threshold: '>1000 ppm' },
    ],
    chronic: [
      { effect: 'Permanent neurocognitive impairment with chronic high-dose exposure ("solvent encephalopathy")' },
      { effect: 'Ototoxicity (hearing loss) at occupational exposures, especially combined with noise' },
    ],
    targetOrgans: ['CNS', 'Liver', 'Kidney', 'Auditory system'],
    biomarkers: [{ name: 'o-cresol', matrix: 'urine' }],
    sources: ['ATSDR ToxProfile Toluene (2017)'],
  },
  xylenes: {
    acute: [{ symptom: 'Dizziness, headache, CNS depression', threshold: '>200 ppm' }],
    chronic: [{ effect: 'Possible neurocognitive effects at chronic high exposure; ototoxicity' }],
    targetOrgans: ['CNS', 'Liver', 'Kidney'],
    biomarkers: [{ name: 'Methylhippuric acid', matrix: 'urine' }],
    sources: ['ATSDR ToxProfile Xylenes (2007)'],
  },
  ethylbenzene: {
    acute: [{ symptom: 'Eye/throat irritation, CNS depression at high vapor', threshold: '>200 ppm' }],
    chronic: [{ effect: 'Ototoxicity; IARC 2B (possibly carcinogenic)' }],
    targetOrgans: ['Auditory system', 'CNS', 'Kidney'],
    biomarkers: [{ name: 'Mandelic acid', matrix: 'urine' }],
    sources: ['ATSDR ToxProfile Ethylbenzene (2010)', 'IARC Monograph Vol 77 (2000)'],
  },
  styrene: {
    acute: [{ symptom: 'Eye/throat irritation, CNS depression', threshold: '>100 ppm' }],
    chronic: [
      { effect: 'Color-vision impairment; ototoxicity; IARC 2A (probably carcinogenic)' },
    ],
    targetOrgans: ['CNS', 'Auditory system', 'Liver'],
    biomarkers: [{ name: 'Mandelic acid + phenylglyoxylic acid', matrix: 'urine' }],
    sources: ['IARC Monograph Vol 121 (2019)'],
  },
  'methylene chloride': {
    acute: [
      { symptom: 'CNS depression', threshold: '>500 ppm' },
      { symptom: 'Cardiac sensitization (rare, with CO co-exposure from metabolism)', threshold: 'High acute' },
    ],
    chronic: [{ effect: 'Probable human carcinogen (IARC 2A — lung, biliary, hematopoietic cancers)' }],
    targetOrgans: ['CNS', 'Liver', 'Cardiovascular (via CO metabolite)'],
    biomarkers: [{ name: 'COHb', matrix: 'blood', note: 'DCM metabolizes to CO; elevated COHb in DCM workers' }],
    sources: ['IARC Monograph Vol 110 (2017)', 'ATSDR ToxProfile DCM (2000)', '29 CFR 1910.1052'],
  },
  trichloroethylene: {
    acute: [{ symptom: 'CNS depression, headache', threshold: '>100 ppm' }],
    chronic: [
      { effect: 'Kidney cancer (IARC Group 1, sufficient evidence)' },
      { effect: 'Non-Hodgkin lymphoma; possible cardiac defects in offspring with maternal exposure' },
    ],
    targetOrgans: ['CNS', 'Kidney', 'Liver', 'Immune system'],
    biomarkers: [{ name: 'Trichloroacetic acid', matrix: 'urine' }],
    sources: ['IARC Monograph Vol 106 (2014)', 'EPA IRIS TCE (2011)'],
  },
  tetrachloroethylene: {
    acute: [{ symptom: 'CNS depression, dizziness', threshold: '>100 ppm' }],
    chronic: [{ effect: 'Probable human carcinogen (IARC 2A — bladder cancer signal in dry-cleaning workers); neurotoxicity' }],
    targetOrgans: ['CNS', 'Kidney', 'Liver'],
    biomarkers: [{ name: 'Trichloroacetic acid', matrix: 'urine' }, { name: 'PCE', matrix: 'blood' }],
    sources: ['IARC Monograph Vol 106 (2014)', 'ATSDR ToxProfile PCE (2019)'],
  },
  asbestos: {
    acute: [],
    chronic: [
      { effect: 'Mesothelioma (IARC Group 1)' },
      { effect: 'Lung cancer (IARC Group 1; multiplicative with smoking)' },
      { effect: 'Asbestosis (interstitial fibrosis)' },
      { effect: 'Pleural plaques, pleural effusion' },
      { effect: 'Latency typically 20–40 years' },
    ],
    targetOrgans: ['Lung', 'Pleura', 'Peritoneum', 'Larynx', 'Ovary'],
    biomarkers: [],
    sources: ['IARC Monograph Vol 100C (2012)', 'EPA IRIS', '29 CFR 1910.1001'],
  },
  'lead (inorganic)': {
    acute: [
      { symptom: 'Abdominal pain, headache (high acute, rare in modern workplaces)', threshold: 'Severe' },
    ],
    chronic: [
      { effect: 'Neurocognitive deficits (children especially)' },
      { effect: 'Hypertension, cardiovascular morbidity' },
      { effect: 'Nephropathy; reproductive effects (both sexes)' },
      { effect: 'Anemia at higher blood-lead levels' },
    ],
    targetOrgans: ['CNS', 'Kidney', 'Hematopoietic', 'Reproductive system'],
    biomarkers: [
      { name: 'Blood lead level (BLL)', matrix: 'blood', note: 'OSHA medical removal at 50 µg/dL (1910.1025); CDC reference 3.5 µg/dL (2021)' },
      { name: 'Zinc protoporphyrin', matrix: 'blood' },
    ],
    sources: ['IARC Monograph Vol 87 (2006)', 'CDC ALERT 2021 BLL Reference Update', '29 CFR 1910.1025'],
  },
  'mercury vapor': {
    acute: [
      { symptom: 'Tremor, salivation, gingivitis', threshold: 'High acute' },
      { symptom: 'Pneumonitis (very high inhalation)', threshold: '>1 mg/m³' },
    ],
    chronic: [
      { effect: 'Erethism (insomnia, irritability, memory loss); intention tremor' },
      { effect: 'Nephropathy; peripheral neuropathy' },
    ],
    targetOrgans: ['CNS', 'Kidney', 'Peripheral nervous system'],
    biomarkers: [
      { name: 'Urine mercury', matrix: 'urine', note: 'ACGIH BEI 20 µg/g creatinine pre-shift' },
      { name: 'Blood mercury', matrix: 'blood' },
    ],
    sources: ['ATSDR ToxProfile Mercury (2022)'],
  },
  radon: {
    acute: [],
    chronic: [
      { effect: 'Lung cancer (IARC Group 1) — second-leading cause of lung cancer in the U.S. after smoking' },
      { effect: 'Risk synergistic with smoking' },
      { effect: 'Latency typically 5–25 years' },
    ],
    targetOrgans: ['Lung'],
    biomarkers: [],
    sources: ['IARC Monograph Vol 100D (2012)', 'EPA 402-K-12-002', 'WHO Handbook on Indoor Radon (2009)'],
  },
  'hydrogen sulfide': {
    acute: [
      { symptom: 'Eye irritation, headache, nausea', threshold: '10–50 ppm' },
      { symptom: 'Olfactory fatigue (sense of smell lost) — dangerous deception', threshold: '>100 ppm' },
      { symptom: 'Pulmonary edema, knockdown', threshold: '>500 ppm' },
      { symptom: 'Immediate collapse, death', threshold: '>1000 ppm' },
    ],
    chronic: [{ effect: 'Chronic conjunctivitis, fatigue; possible neurocognitive sequelae after severe acute exposure' }],
    targetOrgans: ['CNS', 'Eyes', 'Respiratory tract'],
    biomarkers: [],
    sources: ['ATSDR ToxProfile H₂S (2016)'],
  },
  ammonia: {
    acute: [
      { symptom: 'Severe upper-airway irritation, lacrimation', threshold: '25–50 ppm' },
      { symptom: 'Chest tightness, cough', threshold: '>100 ppm' },
      { symptom: 'Pulmonary edema, airway burns', threshold: '>500 ppm' },
    ],
    chronic: [{ effect: 'Chronic bronchitis with prolonged exposure' }],
    targetOrgans: ['Upper and lower respiratory tract', 'Eyes', 'Skin'],
    biomarkers: [],
    sources: ['ATSDR ToxProfile Ammonia (2004)'],
  },
  chlorine: {
    acute: [
      { symptom: 'Mucous membrane irritation, cough', threshold: '0.5–5 ppm' },
      { symptom: 'Bronchospasm, dyspnea', threshold: '>5 ppm' },
      { symptom: 'Pulmonary edema', threshold: '>20 ppm' },
      { symptom: 'Lethal (acute)', threshold: '>400 ppm 30-min' },
    ],
    chronic: [{ effect: 'Reactive airways dysfunction syndrome (RADS) after severe acute; chronic bronchitis' }],
    targetOrgans: ['Respiratory tract', 'Eyes'],
    biomarkers: [],
    sources: ['ATSDR ToxProfile Chlorine (2010)'],
  },
}

// ── Public lookup API ───────────────────────────────────────────────

/**
 * Returns the exposure-limit row for an analyte, or null if not in
 * the curated table. The caller (Field Assistant agent) is expected
 * to tell the assessor "this analyte isn't in my reference table —
 * please look up the primary source" rather than guessing.
 */
export function lookupExposureLimit(analyte) {
  const key = resolveAnalyte(analyte)
  if (!key) return null
  const row = EXPOSURE_LIMITS[key]
  if (!row) return null
  const info = ANALYTES[key]
  return {
    analyte: info.canonical,
    cas: info.cas,
    ...row,
  }
}

/**
 * Returns the sampling-method list for an analyte (or null). Methods
 * are listed in order of typical defensibility / preference.
 */
export function lookupSamplingMethod(analyte) {
  const key = resolveAnalyte(analyte)
  if (!key) return null
  const methods = SAMPLING_METHODS[key]
  if (!methods) return null
  const info = ANALYTES[key]
  return {
    analyte: info.canonical,
    cas: info.cas,
    methods: methods.slice(),
  }
}

/**
 * Returns the health-effects row for an analyte (or null). Acute +
 * chronic + target organs + biomarkers + primary-source citations.
 */
export function lookupHealthEffects(analyte) {
  const key = resolveAnalyte(analyte)
  if (!key) return null
  const row = HEALTH_EFFECTS[key]
  if (!row) return null
  const info = ANALYTES[key]
  return {
    analyte: info.canonical,
    cas: info.cas,
    ...row,
  }
}

// Test-only exports
export const __test = {
  ANALYTES,
  EXPOSURE_LIMITS,
  SAMPLING_METHODS,
  HEALTH_EFFECTS,
  ALIAS_INDEX,
}
