/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Marlow grounding corpus — concise, primary-source-cited summaries of the
 * drinking-water regulations HydroScan screens against. Each chunk carries a
 * citation that traces to the STANDARDS_MANIFEST bibliography. These are
 * factual regulatory summaries, NOT new limits: any numeric threshold quoted
 * here also lives in src/constants/standards.js. Searched via TF-IDF
 * (search_standards_corpus) and stringified into the cached system prompt.
 */

export const WATER_STANDARDS_CORPUS = [
  {
    id: 'lcr',
    title: 'Lead and Copper Rule — Action Levels',
    citation: '40 CFR 141 Subpart I; EPA Lead and Copper Rule / LCRR 2024',
    text: "Lead and copper are regulated by treatment-technique Action Levels measured at consumers' taps, not MCLs. The lead Action Level is 15 µg/L and the copper Action Level is 1.3 mg/L at the 90th percentile of first-draw samples. Lead's MCLG is zero — there is no safe level. Exceeding the lead Action Level triggers corrosion-control treatment, public education, and (under the 2024 LCRR) accelerated lead service line replacement. First-draw samples follow a ≥ 6-hour stagnation; the EPA 3Ts protocol profiles first-draw, second-draw, and flushed samples to localize the lead source.",
  },
  {
    id: 'rtcr',
    title: 'Revised Total Coliform Rule (RTCR)',
    citation: '40 CFR 141 Subpart Y (2016)',
    text: 'Total coliforms are an indicator of distribution-system integrity; E. coli indicates fecal contamination and is an acute health risk. E. coli must not be detected — any detection is an MCL violation and warrants an immediate boil-water response and source investigation. A total-coliform-positive sample requires repeat sampling. The system MCL framework replaced the old percent-positive monitoring with an assessment-and-corrective-action approach.',
  },
  {
    id: 'pfas',
    title: 'PFAS National Primary Drinking Water Regulation (2024)',
    citation: '40 CFR 141 (April 2024) — PFAS NPDWR',
    text: 'EPA set enforceable MCLs for six PFAS: PFOA and PFOS at 4 parts per trillion (ppt) each, and PFHxS, PFNA, and HFPO-DA (GenX) at 10 ppt each. PFOA and PFOS have MCLGs of zero. A Hazard Index of 1.0 (unitless) applies to mixtures of PFHxS, PFNA, HFPO-DA, and PFBS: the sum of each measured concentration divided by its health-based water concentration (PFHxS 10, PFNA 10, HFPO-DA 10, PFBS 2000 ppt) must not exceed 1. Sample in HDPE/polypropylene (never glass) by EPA 533 or 537.1 with detection limits ≤ 2 ppt.',
  },
  {
    id: 'dbp',
    title: 'Stage 2 Disinfectants and Disinfection Byproducts Rule',
    citation: '40 CFR 141 Subpart V',
    text: 'Chlorination byproducts are capped by MCLs: Total Trihalomethanes (TTHM) at 80 µg/L and the sum of five Haloacetic Acids (HAA5) at 60 µg/L, both as locational running annual averages. Disinfectant residuals are capped by Maximum Residual Disinfectant Levels (MRDLs): free chlorine and chloramine at 4 mg/L. A measurable residual (commonly 0.2–2.0 mg/L) is still needed for pathogen control through the distribution system.',
  },
  {
    id: 'nitrate',
    title: 'Nitrate and Nitrite — Acute MCLs',
    citation: '40 CFR 141; EPA 816-F-09-004',
    text: 'Nitrate (as N) has an MCL of 10 mg/L and nitrite (as N) an MCL of 1 mg/L. Both are acute contaminants: exceedances can cause methemoglobinemia ("blue baby syndrome") in infants under six months, so nitrate-exceeding water must not be used to prepare infant formula. Common sources are agricultural fertilizer, feedlots, and septic systems — wells near these sources should be tested.',
  },
  {
    id: 'arsenic-metals',
    title: 'Arsenic and Inorganic Metals MCLs',
    citation: '40 CFR 141; EPA 816-F-09-004',
    text: 'Arsenic has an MCL of 10 µg/L and is an IARC Group 1 carcinogen (bladder, lung, skin cancer). Other inorganic MCLs include barium 2 mg/L, chromium (total) 100 µg/L, mercury 2 µg/L, selenium 50 µg/L, cadmium 5 µg/L, antimony 6 µg/L, thallium 2 µg/L, and uranium 30 µg/L. Metals are collected in HDPE preserved with nitric acid (HNO₃) to pH < 2 with a 180-day hold and analyzed by EPA 200.8 (ICP-MS).',
  },
  {
    id: 'ashrae188',
    title: 'Legionella Water Management (ASHRAE 188)',
    citation: 'ASHRAE Standard 188-2018; ASHRAE Guideline 12-2020',
    text: 'ASHRAE 188 establishes water-management-program requirements to control Legionella in building water systems. Key controls: keep stored hot water ≥ 140 °F (60 °C) while delivering ≤ 120 °F at fixtures to prevent scalding, eliminate dead legs and low-flow stagnation, and flush rarely-used fixtures. Aging water heaters, biofilm, and stagnation are risk factors. Legionella is cultured (ISO 11731 / CDC ELITE) from distal fixtures, hot-water returns, and the heater drain — there is no drinking-water MCL for Legionella.',
  },
  {
    id: 'smcl',
    title: 'Secondary (Aesthetic) Standards — SMCLs',
    citation: '40 CFR 143 (National Secondary Drinking Water Regulations)',
    text: 'Secondary MCLs are non-enforceable aesthetic guidelines for taste, odor, color, and staining: iron 0.3 mg/L, manganese 0.05 mg/L (with a separate EPA health advisory at 0.3 mg/L for infants), sulfate 250 mg/L, chloride 250 mg/L, total dissolved solids 500 mg/L, zinc 5 mg/L, color 15 color units, and pH 6.5–8.5. Low pH (< 6.5) is corrosive and can leach lead and copper from plumbing; high pH can reduce disinfection efficacy.',
  },
  {
    id: 'radionuclides',
    title: 'Radionuclides Rule',
    citation: '40 CFR 141 Subpart G',
    text: 'Gross alpha particle activity has an MCL of 15 pCi/L and combined radium-226 + radium-228 an MCL of 5 pCi/L. Deep bedrock wells (granite/metamorphic aquifers) carry higher risk; if gross alpha exceeds 5 pCi/L, follow up with speciated analysis (EPA 900.0 / 903.1 / 904.0). Uranium is regulated separately at 30 µg/L.',
  },
  {
    id: 'well-testing',
    title: 'Private Well Testing Guidance',
    citation: 'EPA Private Well / Ground Water guidance',
    text: 'Private wells are not covered by the Safe Drinking Water Act, so owners are responsible for testing. EPA recommends annual testing for total coliform bacteria, nitrate, pH, and total dissolved solids, plus testing after flooding, new construction, or any change in taste, odor, or color. Test for lead/copper where plumbing risk exists, and for PFAS where a nearby source (military base/AFFF, airport, landfill, industry) is suspected. Wellhead integrity (sealed cap, casing, separation from septic ≥ 50–100 ft) is the first line of defense.',
  },
]
