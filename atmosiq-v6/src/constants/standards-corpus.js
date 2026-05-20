/**
 * Prudence EHS — IAQ Standards Corpus
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Curated, primary-source-cited reference chunks for the Field
 * Assistant's semantic-search layer (L3). Each chunk is short
 * (~100-250 words) and focused on a single concept so TF-IDF
 * retrieval surfaces the right passage cleanly.
 *
 * Copyright posture:
 *   • OSHA CFR text (29 CFR 1910.xxx) — public domain (17 USC 105,
 *     US gov works). May quote verbatim.
 *   • NIOSH publications (Pocket Guide, NMAM, ToxProfiles) — public
 *     domain (DHHS Pub).
 *   • EPA regulations (40 CFR 50.xxx NAAQS, IRIS) — public domain.
 *   • ATSDR ToxProfiles — public domain.
 *   • ASHRAE 62.1 / 55 / 241, ACGIH TLVs, IICRC S520, Mølhave 1991
 *     — copyrighted third-party documents. Each chunk paraphrases
 *     the substance, cites the section/version, and does not quote
 *     proprietary text verbatim.
 *
 * Editing rules:
 *   • Every chunk must have a verifiable primary-source citation.
 *   • Paraphrase ASHRAE / ACGIH / IICRC content; do not paste
 *     section text verbatim.
 *   • New chunks need BCSP sign-off before merge (CLAUDE.md
 *     "Journal citations must be verified").
 *   • Keep chunks 80-300 words for retrieval quality. Longer chunks
 *     dilute TF; shorter chunks lose context.
 *
 * Engine-sacred: pure data file. Read-only.
 */

export const STANDARDS_CORPUS = [
  // ── OSHA framework ───────────────────────────────────────────────
  {
    id: 'osha-z1-overview',
    title: 'OSHA Permissible Exposure Limits (PELs) — Table Z-1',
    citation: '29 CFR 1910.1000 Table Z-1',
    document: 'OSHA-CFR-1910',
    year: 1971,
    tags: ['osha', 'pel', 'twa', 'exposure-limit', 'compliance', 'table-z1'],
    text: 'OSHA Table Z-1 lists Permissible Exposure Limits (PELs) for approximately 500 air contaminants applicable to general industry. PELs are 8-hour Time-Weighted Average (TWA) concentrations that may not be exceeded during a worker shift, with limited exceptions for short-term exposure limits (STEL, typically 15-minute) and ceiling limits (instantaneous). The Z-1 PELs were largely adopted from 1968 ACGIH Threshold Limit Values (TLVs) in 1971 and most have not been updated since, despite advances in toxicology. PELs are minimum legal requirements only — NIOSH RELs and current ACGIH TLVs are often more protective. Several substances (asbestos 1910.1001, lead 1910.1025, benzene 1910.1028, formaldehyde 1910.1048, methylene chloride 1910.1052, etc.) have their own substance-specific standards that supersede Table Z-1 with lower limits, action levels, medical surveillance, and exposure-monitoring requirements.',
  },
  {
    id: 'osha-z2-peak',
    title: 'OSHA Table Z-2 — Ceiling and Peak Limits',
    citation: '29 CFR 1910.1000 Table Z-2',
    document: 'OSHA-CFR-1910',
    year: 1971,
    tags: ['osha', 'pel', 'ceiling', 'peak', 'stel', 'table-z2'],
    text: 'OSHA Table Z-2 lists a smaller set of substances with a three-tier limit structure: 8-hour TWA, ceiling (acceptable maximum at any time), and an acceptable maximum peak (above the ceiling) for a stated short duration. Examples include benzene (older Z-2 entry superseded by 1910.1028), toluene (200 ppm TWA, 300 ppm ceiling, 500 ppm 10-min peak), trichloroethylene, and tetrachloroethylene. The peak structure recognizes that brief excursions above the ceiling may be unavoidable in some operations but must be controlled in duration and frequency. Many Table Z-2 substances now have stricter substance-specific OSHA standards or revised ACGIH/NIOSH limits; cite the most protective applicable limit when documenting exposure for screening.',
  },
  {
    id: 'osha-action-level',
    title: 'OSHA Action Levels — concept and use',
    citation: '29 CFR 1910 substance-specific standards',
    document: 'OSHA-CFR-1910',
    year: 1978,
    tags: ['osha', 'action-level', 'al', 'monitoring', 'medical-surveillance'],
    text: 'An OSHA Action Level (AL) is a concentration, typically one-half the 8-hour TWA PEL, that triggers ancillary protections short of compliance violations. When workplace concentrations reach or exceed the AL, the employer must initiate periodic exposure monitoring, medical surveillance (for substances where it applies), and employee training. Action levels appear in substance-specific standards including lead (0.030 mg/m³, AL = ½ PEL of 0.050), benzene (0.5 ppm, ½ of 1 ppm PEL), formaldehyde (0.5 ppm, two-thirds of 0.75 PEL), methylene chloride (12.5 ppm, ½ of 25 PEL), and asbestos (0.05 f/cc, ½ of 0.1 f/cc PEL). The statistical rationale is that the AL accounts for measurement uncertainty: an 8-hr sample at the AL has roughly a 5% probability that the true exposure exceeds the PEL.',
  },
  {
    id: 'niosh-rel-idlh',
    title: 'NIOSH RELs and IDLH values',
    citation: 'NIOSH Pocket Guide to Chemical Hazards (DHHS Pub 2005-149)',
    document: 'NIOSH-NPG',
    year: 2007,
    tags: ['niosh', 'rel', 'idlh', 'exposure-limit', 'recommendation'],
    text: 'The NIOSH Recommended Exposure Limit (REL) is a non-regulatory health-based limit set by the National Institute for Occupational Safety and Health. RELs are typically TWA values for up to a 10-hour workday in a 40-hour week, often paired with a 15-minute STEL and/or ceiling limit. RELs are generally more protective than OSHA PELs because they reflect current toxicology. The Immediately Dangerous to Life or Health (IDLH) value is a separate NIOSH concept: the airborne concentration at which a worker could not escape within 30 minutes without irreversible health effects. IDLHs guide respirator selection (above IDLH requires supplied-air or SCBA), confined-space entry decisions, and emergency response. The NIOSH Pocket Guide (NPG) is the canonical compilation; RELs are also available in NIOSH criteria documents for individual substances.',
  },
  {
    id: 'acgih-tlv-bei',
    title: 'ACGIH TLVs and BEIs',
    citation: 'ACGIH "TLVs and BEIs" 2025 edition',
    document: 'ACGIH-TLV',
    year: 2025,
    tags: ['acgih', 'tlv', 'bei', 'exposure-limit', 'biomarker'],
    text: 'The American Conference of Governmental Industrial Hygienists (ACGIH) publishes annually-updated Threshold Limit Values (TLVs) and Biological Exposure Indices (BEIs). TLVs are health-based guidelines (not regulations) — typically expressed as 8-hour TWA, with optional STEL (15-min) and ceiling limits. ACGIH classifies carcinogens A1 (confirmed human), A2 (suspected human), A3 (confirmed animal, unknown human relevance), A4 (not classifiable), A5 (not suspected). BEIs are biological monitoring values: concentrations of a chemical, its metabolite, or a biomarker in blood/urine/exhaled breath that correspond to inhalation exposure at the TLV. Examples: benzene BEI is t,t-muconic acid 500 µg/g creatinine end-of-shift; lead BEI is blood lead 20 µg/dL. The 2025 edition includes notations for skin absorption (Skin), respiratory/dermal sensitization (SEN/DSEN), and dermal sensitization (DSEN). ACGIH TLVs are commonly cited in IAQ work where OSHA PELs are outdated; some jurisdictions (Canada, Mexico, parts of EU) reference TLVs directly in regulation.',
  },

  // ── EPA NAAQS ────────────────────────────────────────────────────
  {
    id: 'epa-naaqs-overview',
    title: 'EPA National Ambient Air Quality Standards (NAAQS)',
    citation: '40 CFR Part 50',
    document: 'EPA-NAAQS',
    year: 1971,
    tags: ['epa', 'naaqs', 'ambient', 'criteria-pollutant', 'outdoor'],
    text: 'The EPA National Ambient Air Quality Standards (NAAQS) under the Clean Air Act apply to ambient (outdoor) air for six criteria pollutants: particulate matter (PM2.5 and PM10), ozone, nitrogen dioxide, sulfur dioxide, carbon monoxide, and lead. Primary standards protect public health (including sensitive populations — children, elderly, those with asthma); secondary standards protect public welfare (visibility, ecosystems, materials). NAAQS are revised based on EPA Integrated Science Assessments approximately every 5–10 years. NAAQS are NOT workplace standards — OSHA PELs and ACGIH TLVs apply to occupational exposure. However, for indoor environmental quality (IEQ) screening, NAAQS are frequently used as policy reference values for non-occupational indoor exposures (residences, schools, offices) where no OSHA limit exists or where the OSHA limit is inappropriate for non-worker populations.',
  },
  {
    id: 'epa-pm25-2024-revision',
    title: 'EPA PM2.5 Annual NAAQS 2024 revision',
    citation: 'EPA 40 CFR 50.20 (Federal Register Feb 2024)',
    document: 'EPA-NAAQS',
    year: 2024,
    tags: ['epa', 'naaqs', 'pm25', 'particulate', '2024-revision'],
    text: 'In February 2024, the EPA finalized a reduction of the primary annual PM2.5 NAAQS from 12 µg/m³ to 9 µg/m³ (3-year average of weighted annual means). The 24-hour PM2.5 standard remains at 35 µg/m³ (98th percentile, 3-year average). The 2024 revision reflects accumulated epidemiological evidence linking long-term PM2.5 exposures below 12 µg/m³ to increased all-cause mortality, lung cancer (IARC Group 1 — outdoor air pollution), and cardiovascular morbidity. For indoor air quality screening, 9 µg/m³ is the appropriate annual reference. The WHO Global Air Quality Guidelines (2021) are stricter: 5 µg/m³ annual, 15 µg/m³ 24-hour 99th percentile. Workplace PM2.5 has no OSHA-specific PEL; respirable particulate falls under PNOR/PNOC limits (5 mg/m³ respirable, 15 mg/m³ total) which are not health-based for fine particulate. Use EPA NAAQS as the policy benchmark for IAQ screening.',
  },

  // ── ASHRAE 62.1 ventilation ──────────────────────────────────────
  {
    id: 'ashrae-621-vrp',
    title: 'ASHRAE 62.1 Ventilation Rate Procedure (VRP)',
    citation: 'ASHRAE 62.1-2025 §6.2',
    document: 'ASHRAE-62.1',
    year: 2025,
    tags: ['ashrae', '62.1', 'ventilation', 'vrp', 'outdoor-air', 'cfm'],
    text: 'The Ventilation Rate Procedure (VRP) in ASHRAE 62.1-2025 is the prescriptive path for determining minimum outdoor air intake. Required outdoor air for the breathing zone is computed as Vbz = Rp × Pz + Ra × Az, where Rp is the people component (cfm per person), Pz is the zone population, Ra is the area component (cfm per square foot), and Az is the zone floor area. Values vary by occupancy category: offices typically Rp = 5 cfm/person, Ra = 0.06 cfm/ft²; classrooms Rp = 10 cfm/person; conference rooms Rp = 5 cfm/person, Ra = 0.06 cfm/ft². The VRP yields a breathing-zone outdoor air requirement; the zone outdoor air (Voz) divides by a zone air distribution effectiveness (Ez) factor (typically 0.8 for ceiling supply with mixing, 1.0 for floor supply). When evaluating whether mechanical ventilation is adequate, compare measured outdoor air delivery (via duct traverse, tracer gas, or CO₂ mass balance) against the VRP calculated requirement.',
  },
  {
    id: 'ashrae-621-iaqp',
    title: 'ASHRAE 62.1 Indoor Air Quality Procedure (IAQP)',
    citation: 'ASHRAE 62.1-2025 §6.3',
    document: 'ASHRAE-62.1',
    year: 2025,
    tags: ['ashrae', '62.1', 'ventilation', 'iaqp', 'performance-based'],
    text: 'The Indoor Air Quality Procedure (IAQP) is the performance-based alternative to the Ventilation Rate Procedure in ASHRAE 62.1-2025. Rather than prescribing minimum outdoor air rates, the IAQP requires the designer to (a) identify contaminants of concern, (b) establish target indoor concentrations referencing applicable standards (ASHRAE 62.1 Appendix B, ASHRAE Position Documents, EPA NAAQS, OSHA PELs, etc.), and (c) demonstrate by mass balance and contaminant source modeling that the design will not exceed those targets. The IAQP enables credit for filtration (MERV-13 minimum, MERV-A for particulate-control credits), gas-phase air cleaning, and source-control measures. Auditors and code officials often resist IAQP because demonstration requires defensible source-strength data — frequently unavailable. In litigation contexts, IAQP designs that under-ventilate via the VRP standard must produce the design calculations as evidence that target concentrations were actually met.',
  },
  {
    id: 'ashrae-621-co2-dcv',
    title: 'CO₂ as a ventilation indicator and DCV',
    citation: 'ASHRAE 62.1-2025 §6.4 + Appendix C',
    document: 'ASHRAE-62.1',
    year: 2025,
    tags: ['ashrae', '62.1', 'co2', 'ventilation', 'dcv', 'demand-controlled'],
    text: 'CO₂ is widely used as a proxy for ventilation adequacy in human-occupied spaces because exhaled CO₂ from occupants is the primary indoor source. ASHRAE 62.1-2025 does not specify an absolute indoor CO₂ limit; instead, the indoor-outdoor CO₂ differential is the diagnostic. At steady-state occupancy, a sustained differential of approximately 700 ppm above outdoor (typically ~420 ppm) corresponds to ventilation roughly matching the VRP Rp component for office activity, yielding indoor concentrations near 1100–1200 ppm. Higher differentials suggest under-ventilation; concentrations above 1500 ppm correlate in some studies with elevated reports of headache, drowsiness, and decreased cognitive performance, though CO₂ itself is not toxic at these levels. Demand-controlled ventilation (DCV) modulates outdoor air to maintain a CO₂ setpoint, reducing energy use during low occupancy. DCV is permitted by ASHRAE 62.1 when zones have variable occupancy and outdoor air rates are not driven by the area component alone. Field measurement requires NDIR sensors calibrated within 270 days; always pair indoor readings with a simultaneous outdoor reading.',
  },
  {
    id: 'ashrae-241-2023',
    title: 'ASHRAE 241-2023 Control of Infectious Aerosols',
    citation: 'ASHRAE 241-2023',
    document: 'ASHRAE-241',
    year: 2023,
    tags: ['ashrae', '241', 'infection', 'aerosol', 'equivalent-clean-air', 'ecai'],
    text: 'ASHRAE Standard 241-2023, "Control of Infectious Aerosols," was developed in response to the COVID-19 pandemic to provide minimum requirements for the mitigation of airborne infectious disease transmission via the built environment. The central concept is Equivalent Clean Airflow per occupant for infection risk reduction (ECAi), expressed in cfm/person. ECAi can be achieved through any combination of outdoor air, in-room HEPA filtration, MERV-13+ central filtration with adequate airflow, upper-room or in-duct UV-C germicidal irradiation (UVGI), and bipolar ionization (with limitations). ECAi targets vary by occupancy category and "infection risk management mode" — a separate operating mode buildings can enter during community outbreaks. ASHRAE 241 does not replace ASHRAE 62.1 ventilation requirements; it adds infection-control criteria on top. For IAQ screening, citing ASHRAE 241 supports recommendations to upgrade filtration, add portable HEPA units, or commission UV-C in spaces with sustained high occupancy (schools, healthcare, transit).',
  },

  // ── ASHRAE 55 thermal comfort ────────────────────────────────────
  {
    id: 'ashrae-55-comfort',
    title: 'ASHRAE 55 thermal comfort framework',
    citation: 'ASHRAE 55-2023',
    document: 'ASHRAE-55',
    year: 2023,
    tags: ['ashrae', '55', 'thermal-comfort', 'temperature', 'humidity', 'pmv'],
    text: 'ASHRAE 55-2023 defines thermal comfort as "that condition of mind which expresses satisfaction with the thermal environment." The standard accepts that at least 80% of occupants will be thermally satisfied within the acceptable range. The Predicted Mean Vote (PMV) / Predicted Percentage of Dissatisfied (PPD) method (Fanger) accounts for six factors: air temperature, mean radiant temperature, air speed, humidity, metabolic rate (clo for activity, ~1.0 met seated), and clothing insulation. For typical office work (1.1 met, 0.5–1.0 clo), the acceptable operative temperature range is approximately 68–76 °F (20–24 °C) in winter and 73–79 °F (23–26 °C) in summer; the acceptable relative humidity range is broadly 30–60 %. Below 30 % RH, dry-eye and respiratory irritation complaints increase; above 60 % RH, microbial growth risk rises (IICRC S520 condition framework). For non-air-conditioned buildings, ASHRAE 55 includes an adaptive comfort model that allows wider acceptable ranges depending on prevailing mean outdoor temperature.',
  },

  // ── Mold (IICRC S520) ────────────────────────────────────────────
  {
    id: 'iicrc-s520-conditions',
    title: 'IICRC S520 Condition 1/2/3 framework',
    citation: 'IICRC S520-2024 Standard for Professional Mold Remediation',
    document: 'IICRC-S520',
    year: 2024,
    tags: ['iicrc', 's520', 'mold', 'condition-1', 'condition-2', 'condition-3', 'remediation'],
    text: 'IICRC S520-2024 establishes a three-condition framework for indoor mold contamination assessment. Condition 1 ("normal fungal ecology") describes an indoor environment whose fungal ecology is comparable to typical outdoor or unaffected indoor environments — visible mold absent, ambient sampling within normal ranges, no moisture-damaged materials. Condition 2 ("settled spores") indicates an environment contaminated with spore tracking, dust, or fragments from a Condition 3 source — no active growth, but settled-spore burden requires source control plus surface cleaning to restore Condition 1. Condition 3 ("actual growth") is an environment with active or recent fungal growth on materials, including visible colonies, hidden growth confirmed by direct examination, or odor-and-moisture combinations strongly indicative of growth. Remediation goals are written as a transition: Condition 3 → Condition 1 (source removal + post-remediation verification), with intermediate Condition 2 cleaning as needed. Clearance criteria are professional judgment supported by visual reinspection, moisture mapping (substrates < 16 % wood moisture equivalent, < 1 % surface RH equivalence), and where appropriate, post-remediation air or surface sampling.',
  },
  {
    id: 'mold-sampling-strategy',
    title: 'Mold sampling strategy — outdoor reference and indoor comparisons',
    citation: 'AIHA Recognition Evaluation Solution (RES) approach + IICRC S520',
    document: 'AIHA-IICRC',
    year: 2023,
    tags: ['mold', 'sampling', 'spore-trap', 'air-sampling', 'outdoor-reference', 'aiha'],
    text: 'Mold sampling without a hypothesis is uninformative. The defensible approach is to (a) form a hypothesis about contamination based on visual inspection and moisture mapping, (b) sample to test that hypothesis, and (c) interpret results against simultaneous outdoor reference samples. Air sampling using spore traps (Air-O-Cell, Allergenco-D, Versatrap) typically collects 75–150 L at 15 L/min for 5–10 minutes. Indoor concentrations should generally be lower than and qualitatively similar to outdoor (same dominant taxa). Indoor concentrations exceeding outdoor by 10× or more, dominance by taxa NOT present outdoors, or presence of indicator taxa (Aspergillus, Penicillium, Chaetomium, Stachybotrys) above outdoor levels suggest an indoor source. Surface samples (tape lifts, bulk, dust) confirm growth on materials. Culturable methods (NIOSH 0800, 0801) identify viable species. There are no regulatory air concentration limits for mold; defensible interpretation cites outdoor reference comparisons + IICRC S520 condition transitions, not absolute numbers.',
  },

  // ── Sampling methodology ────────────────────────────────────────
  {
    id: 'co2-not-toxic',
    title: 'CO₂ is a ventilation indicator, not a toxic indicator at IAQ levels',
    citation: 'ATSDR ToxProfile CO₂ + Persily & de Jonge 2017',
    document: 'IAQ-Methodology',
    year: 2023,
    tags: ['co2', 'ventilation', 'methodology', 'toxic', 'atsdr', 'screening'],
    text: 'A common misconception treats indoor CO₂ as a toxic contaminant. At IAQ-typical concentrations (400–2000 ppm), CO₂ has no demonstrated acute toxicity in healthy adults. The OSHA PEL (5000 ppm 8-hr TWA) is unlikely to be exceeded in any normally-occupied building. Above approximately 1500 ppm, some studies report decreased cognitive performance, increased drowsiness, and elevated headache rates — but the mechanism is contested. Many researchers attribute these effects to co-varying contaminants (VOCs, bioeffluents, particulates) that accumulate when ventilation is inadequate, with CO₂ acting only as a proxy. The defensible IAQ use of CO₂ is as a ventilation-adequacy indicator: indoor-outdoor differentials >700 ppm during steady-state occupancy suggest under-ventilation per ASHRAE 62.1. When citing CO₂ in screening reports, frame findings as "indicates inadequate outdoor air supply per ASHRAE 62.1" rather than "CO₂ exposure may cause health effects."',
  },
  {
    id: 'molhave-tvoc-framework',
    title: 'Mølhave TVOC dose-response framework (1991)',
    citation: 'Mølhave, L. (1991) Indoor Air 1(4):357-376',
    document: 'Molhave-1991',
    year: 1991,
    tags: ['tvoc', 'voc', 'molhave', 'sbs', 'sick-building', 'screening'],
    text: 'Lars Mølhave\'s 1991 dose-response framework for Total Volatile Organic Compounds (TVOC) is the most-cited screening benchmark in IAQ work, despite being 30+ years old and non-regulatory. The four-tier construct: (1) below 0.2 mg/m³ (~50 ppb isobutylene-equivalent), comfort range — no expected effects; (2) 0.2–3 mg/m³, multifactorial effects possible — irritation, headache, "stuffy feeling," in combination with other building factors; (3) 3–25 mg/m³, discomfort and irritation likely, headache and difficulty concentrating; (4) above 25 mg/m³, toxic range. The construct is advisory only and based on chamber studies with mixtures of common VOCs. Critical caveats: TVOC measured by PID does not speciate, so health-significant individual VOCs (formaldehyde, benzene, naphthalene) may be present without elevating TVOC; conversely, high TVOC may reflect benign emissions (limonene, terpenes from cleaning products). For any actionable finding, speciate via EPA TO-15 (Summa canister) or TO-17 (sorbent tube) and evaluate each VOC against its OSHA PEL / NIOSH REL / ACGIH TLV.',
  },
  {
    id: 'direct-read-vs-lab',
    title: 'Direct-read screening vs lab-confirmed sampling',
    citation: 'NIOSH NMAM 5th Ed. + AIHA Field Manual',
    document: 'IAQ-Methodology',
    year: 2023,
    tags: ['sampling', 'direct-read', 'lab', 'methodology', 'screening', 'defensibility'],
    text: 'Direct-read instruments (PID for VOCs, electrochemical sensors for CO/NO2/SO2/H2S, NDIR for CO2, optical particle counters for PM2.5/PM10) are appropriate for screening — rapid characterization, source-tracking, and hot-spot identification. They are not appropriate as the sole basis for compliance determinations, exposure-limit comparisons, or expert testimony. Limitations: (a) cross-sensitivities (electrochemical NO2 sensors often respond to SO2; PID 10.6 eV doesn\'t see methane or formaldehyde reliably; OPCs need gravimetric correction); (b) drift between calibrations; (c) no analyte speciation. For any finding that triggers a recommendation, a remediation action, or a compliance determination, confirm with a NIOSH NMAM or OSHA method (e.g. NIOSH 1500/1501 for BTEX, NIOSH 2016 for HCHO, NIOSH 0600 for respirable particulate gravimetric) or EPA TO-15/TO-17 for VOC speciation. Document the screening result, the confirmatory method used, the chain of custody, the lab name, and the instrument calibration records. This two-tier (screening + confirmation) approach is the litigation-defensible workflow.',
  },
  {
    id: 'sampling-strategy-mr',
    title: 'Maximum-Risk vs Random sampling strategy',
    citation: 'NIOSH Occupational Exposure Sampling Strategy Manual (DHHS 77-173)',
    document: 'NIOSH-77-173',
    year: 1977,
    tags: ['sampling', 'strategy', 'mr', 'random', 'compliance', 'statistics'],
    text: 'The NIOSH Occupational Exposure Sampling Strategy Manual (1977, still authoritative) distinguishes two sampling approaches. Maximum-Risk (MR) sampling targets the worker, task, and time period expected to have the highest exposure — appropriate for screening, source identification, and confirming worst-case is within limits. If the MR sample is below the action level, lower-risk workers are presumably below as well. Random sampling targets the homogeneous exposure group (HEG) using statistical sampling theory — appropriate for compliance determination, regulatory monitoring, and exposure characterization across a workforce. The number of random samples needed depends on the desired confidence (typically 95%) and the within-group variability; NIOSH provides tables (Leidel-Busch-Lynch tables). For IAQ screening of occupant complaints, MR sampling at the location and time of complaint generation is the appropriate strategy. For occupational compliance documentation under OSHA substance-specific standards (lead, benzene, formaldehyde, etc.), random sampling of the HEG with the prescribed minimum sample count is required.',
  },

  // ── Sampling methods ────────────────────────────────────────────
  {
    id: 'niosh-nmam-numbering',
    title: 'NIOSH NMAM method numbering scheme',
    citation: 'NIOSH Manual of Analytical Methods, 5th Edition',
    document: 'NIOSH-NMAM',
    year: 2023,
    tags: ['niosh', 'nmam', 'analytical-method', 'sampling-method'],
    text: 'NIOSH Manual of Analytical Methods (NMAM) numbering follows a four-digit scheme by analyte class. 0000-series: gravimetric/respirable dust (NIOSH 0500 total dust, 0600 respirable, 0800 culturable bioaerosol). 1000-series: VOCs by GC (NIOSH 1003 halogenated hydrocarbons including TCE/PCE, NIOSH 1005 methylene chloride, NIOSH 1500 hydrocarbons BP 36-216°C including BTEX, NIOSH 1501 aromatic hydrocarbons, NIOSH 1022 trichloroethylene). 2000-series: aldehydes and ketones (NIOSH 2016 formaldehyde by HPLC with DNPH, NIOSH 2541 formaldehyde by GC). 6000-series: gases by direct-read or selective methods (NIOSH 6009 mercury vapor, NIOSH 6013 hydrogen sulfide, NIOSH 6014 NO2, NIOSH 6015 ammonia). 7000-series: metals and minerals (NIOSH 7300/7301 elements by ICP-AES, NIOSH 7400 asbestos by PCM, NIOSH 7402 asbestos by TEM, NIOSH 9100 lead surface wipe). 9000-series: bulk methods (NIOSH 9002 PLM bulk asbestos).',
  },
  {
    id: 'epa-to15-to17',
    title: 'EPA TO-15 and TO-17 for VOC speciation',
    citation: 'EPA Compendium Method TO-15 (1999) and TO-17 (1999)',
    document: 'EPA-Compendium',
    year: 1999,
    tags: ['epa', 'to-15', 'to-17', 'voc', 'speciation', 'summa', 'sorbent-tube'],
    text: 'EPA Compendium Methods TO-15 and TO-17 are the two canonical methods for speciated VOC analysis. TO-15 uses a 1-L or 6-L evacuated stainless-steel canister (Summa-passivated) with whole-air collection. Sampling intervals range from grab (<1 minute) to 24-hour integrated via a flow-restricting orifice. Analysis is by GC/MS with a target list typically including ~65 VOCs (benzene, toluene, ethylbenzene, xylenes, trichloroethylene, tetrachloroethylene, vinyl chloride, methylene chloride, plus oxygenates, freons, and chlorinated compounds). Detection limits typically 0.1–1 ppb. TO-17 uses a sorbent tube (Tenax-TA, Carbopack, or multi-bed) with pumped sampling at typically 50–100 mL/min for 1–8 hours, followed by thermal desorption and GC/MS analysis. TO-17 generally achieves lower detection limits than TO-15 and supports a wider analyte list (including very volatile and semi-volatile compounds), but is more sensitive to sorbent capacity and water-vapor effects. For IAQ vapor-intrusion investigations and indoor-source apportionment, TO-15 is the more common choice; for low-level industrial workplace VOCs or specific compound targeting, TO-17 may be preferred. Always coordinate with the receiving lab on method selection.',
  },
  {
    id: 'asbestos-pcm-tem',
    title: 'Asbestos analysis — NIOSH 7400 PCM vs 7402 TEM',
    citation: 'NIOSH NMAM 7400 (PCM) and 7402 (TEM)',
    document: 'NIOSH-NMAM',
    year: 2019,
    tags: ['asbestos', 'pcm', 'tem', 'niosh-7400', 'niosh-7402', 'fiber-counting'],
    text: 'NIOSH 7400 (Phase-Contrast Microscopy, PCM) and NIOSH 7402 (Transmission Electron Microscopy, TEM) are paired methods for airborne asbestos fibers. NIOSH 7400 counts all fibers ≥5 µm length with aspect ratio ≥3:1 on a 0.45 µm or 0.8 µm mixed cellulose ester filter at 400× magnification. PCM is the OSHA compliance method (1910.1001) — fast, inexpensive, but cannot distinguish asbestos from non-asbestos fibers (gypsum, fiberglass, cellulose) and underestimates very thin fibers below the resolution limit (~0.25 µm width). NIOSH 7402 uses TEM at much higher magnification (typically 10,000–20,000×) to identify mineral type via selected-area electron diffraction (SAED) and energy-dispersive spectroscopy (EDS). TEM counts thinner fibers PCM misses and confirms whether PCM-counted fibers are actually asbestos. EPA AHERA (40 CFR 763) post-abatement clearance in schools requires TEM at 70 fibers/mm² filter loading. For occupational compliance, NIOSH 7400 (PCM) is the default; pair with NIOSH 7402 (TEM) when PCM results are contested, near the PEL/action level, or when non-asbestos fiber interference is suspected.',
  },

  // ── Health framework ────────────────────────────────────────────
  {
    id: 'iarc-carcinogen-groups',
    title: 'IARC carcinogen classification groups',
    citation: 'IARC Monographs Preamble, current edition',
    document: 'IARC',
    year: 2019,
    tags: ['iarc', 'carcinogen', 'group-1', 'group-2a', 'group-2b', 'group-3', 'classification'],
    text: 'The International Agency for Research on Cancer (IARC) classifies agents by the weight of evidence for human carcinogenicity, not by potency. Group 1 — Carcinogenic to humans: sufficient evidence in humans. Examples: asbestos, benzene, formaldehyde, trichloroethylene, radon, tobacco smoke, outdoor air pollution / PM2.5. Group 2A — Probably carcinogenic: limited human + sufficient animal evidence. Examples: tetrachloroethylene (PCE), methylene chloride, styrene, lead inorganic. Group 2B — Possibly carcinogenic: limited human or sufficient animal alone. Examples: ethylbenzene, gasoline. Group 3 — Not classifiable: inadequate evidence in both humans and animals. Group 4 (only one substance, caprolactam) — Probably NOT carcinogenic; this category is no longer used since 2019 monographs. The IARC group does not encode potency: a Group 1 carcinogen present at trace exposures may pose less risk than a Group 2A carcinogen at high exposures. When citing in screening reports, pair the IARC group with the specific exposure level and a route-relevant risk assessment (e.g. EPA IRIS or ATSDR Minimal Risk Levels).',
  },
  {
    id: 'sbs-bri',
    title: 'Sick Building Syndrome (SBS) vs Building-Related Illness (BRI)',
    citation: 'WHO 1983 + NIOSH HHE-83-002-1374',
    document: 'WHO-NIOSH',
    year: 1983,
    tags: ['sbs', 'bri', 'sick-building', 'health', 'screening'],
    text: 'Sick Building Syndrome (SBS) and Building-Related Illness (BRI) are distinct constructs and should be cited correctly in screening. SBS, first articulated by WHO in 1983, describes nonspecific symptoms (eye/nose/throat irritation, headache, fatigue, dry skin, cognitive complaints) that resolve after leaving the building and have no identifiable specific etiology. SBS is typically associated with inadequate ventilation, low relative humidity, elevated TVOC, or psychogenic/ergonomic factors; multifactorial and difficult to attribute to a single cause. Building-Related Illness (BRI) describes a specific, diagnosable disease with a building-source etiology — Legionnaires\' disease (Legionella from cooling towers/showers), humidifier fever (thermophilic actinomycetes), hypersensitivity pneumonitis (Aspergillus, Stachybotrys), asthma exacerbation (sensitization to mold or chemicals), or carbon monoxide poisoning (combustion source). BRI requires medical diagnosis and a documented exposure pathway. Screening reports should not diagnose either SBS or BRI — those determinations require licensed medical professionals and an industrial hygienist working together. The screening role is to identify environmental conditions consistent with risk and recommend medical referral when warranted.',
  },
  {
    id: 'sensitization-asthma',
    title: 'Occupational sensitization and asthma',
    citation: 'AOEC Sensitizer List + ACGIH SEN/DSEN notations',
    document: 'AOEC',
    year: 2023,
    tags: ['sensitization', 'asthma', 'allergen', 'sen', 'occupational-asthma'],
    text: 'Chemical sensitization is a mechanism by which exposure to a sensitizing agent leads to an immune-mediated response — once sensitized, an individual reacts to subsequent exposures at far lower concentrations than non-sensitized individuals. Common occupational sensitizers (causing occupational asthma in some workers) include formaldehyde, isocyanates (TDI, MDI, HDI), latex proteins, glutaraldehyde, persulfates, anhydrides, and certain wood dusts (Western red cedar, oak). The ACGIH adds Skin Sensitization (DSEN) and Respiratory Sensitization (SEN) notations to TLVs for confirmed sensitizers. The Association of Occupational and Environmental Clinics (AOEC) maintains a peer-reviewed asthmagen list. For IAQ screening: sensitization implies that protective exposure limits derived for non-sensitized workers may not protect already-sensitized individuals. When an occupant reports asthma exacerbation correlating with building exposure, evaluate for known sensitizer sources (formaldehyde-emitting composite wood, mold, cleaning chemicals, isocyanate-containing paints) regardless of whether ambient concentrations are below standard limits. Always recommend medical referral for occupational asthma evaluation.',
  },

  // ── Defensibility ───────────────────────────────────────────────
  {
    id: 'instrument-calibration',
    title: 'Instrument calibration documentation requirements',
    citation: 'OSHA Technical Manual + ASTM D1071 + ANSI/ISA-RP12.13',
    document: 'OSHA-ASTM-ANSI',
    year: 2019,
    tags: ['calibration', 'instrument', 'defensibility', 'documentation'],
    text: 'Defensible IAQ screening requires documented instrument calibration. Minimum documentation: instrument make/model/serial number, calibration date and operator, calibration standard used (gas concentration, NIST-traceable particle reference, etc.), zero/span readings before and after adjustment, calibration certificate from manufacturer or accredited cal lab. Calibration frequency varies by instrument class: electrochemical cells (CO, NO2, SO2, H2S) typically 6-month manufacturer factory cal + field bump tests before each use; NDIR CO2 sensors typically annual factory cal + field zero with N2 or outdoor ambient verification; PID lamps 12-month factory + isobutylene span at start of work; optical particle counters annual gravimetric correlation + flow check before sampling. AtmosFlow enforces a 270-day calibration gate on finalized reports; instruments past the calibration window cannot generate signed deliverables. In litigation, calibration records are routinely subpoenaed — maintain originals and ensure traceability to NIST-certified primary standards.',
  },
  {
    id: 'chain-of-custody',
    title: 'Chain of Custody (CoC) for laboratory samples',
    citation: 'EPA SW-846 + ASTM D4840',
    document: 'EPA-ASTM',
    year: 2016,
    tags: ['coc', 'chain-of-custody', 'sampling', 'lab', 'defensibility'],
    text: 'A Chain of Custody (CoC) is a written record documenting the possession, transfer, and condition of a sample from collection through analytical reporting. CoC is essential for litigation-defensible sampling. Required elements: sample ID (unique, indelible), collection date/time/location, sampler name and signature, sample matrix (air, bulk, surface, water), analytical method requested, preservatives or special handling notes, every transfer (relinquished-by / received-by names + signatures + date-time), and lab-receipt condition (intact seals, temperature on arrival for cooler samples). Any gap in custody — unsigned transfer, missing time, unknown location during transit — creates a defensibility weakness exploitable in cross-examination. EPA SW-846 specifies CoC requirements for environmental sampling; ASTM D4840 provides general guidance. AtmosFlow generates branded CoC PDFs for Mold and TVOC sampling; assessors print, hand-complete in the field with wet signatures at each transfer, and submit to the destination lab. Digital fill is permitted but wet signatures carry higher evidentiary weight in disputes.',
  },
  {
    id: 'screening-vs-compliance',
    title: 'Screening vs Compliance sampling — methodological distinction',
    citation: 'AIHA Industrial Hygiene Sampling Strategy Manual',
    document: 'AIHA',
    year: 2019,
    tags: ['screening', 'compliance', 'methodology', 'defensibility', 'iaq'],
    text: 'IAQ screening and compliance sampling serve different purposes and have different defensibility requirements. Screening sampling: hypothesis generation, source identification, hot-spot characterization. Direct-read instruments often acceptable; sample count low; statistical interpretation informal; documentation minimal beyond field notes. Acceptable conclusion: "Indoor concentrations elevated relative to outdoor reference; recommend further investigation." Compliance sampling: documents whether occupational exposure exceeds an OSHA PEL or similar regulatory limit. Method must be NIOSH-NMAM, OSHA-validated, or EPA-published; sample count meets statistical sufficiency (NIOSH Leidel-Busch-Lynch); chain of custody complete; lab is AIHA-accredited or NELAC-equivalent; instrument calibration current; sampling strategy targets the HEG with maximum-risk or random design. Acceptable conclusion: a compliance determination with quantified uncertainty. AtmosFlow positions explicitly as a screening tool; compliance determinations require qualified professional sign-off (CIH, CSP) and primary-source analytical methods. Reports should disclaim accordingly and recommend confirmatory sampling for any finding that approaches or exceeds an exposure limit.',
  },

  // ── Special topics ──────────────────────────────────────────────
  {
    id: 'radon-screening',
    title: 'Radon screening protocol',
    citation: 'EPA 402-K-12-002 "A Citizen\'s Guide to Radon"',
    document: 'EPA-402-K-12',
    year: 2012,
    tags: ['radon', 'rn-222', 'screening', 'epa', 'mitigation'],
    text: 'EPA recommends radon testing in all homes and ground-contact occupied spaces. The EPA action level is 4 pCi/L (148 Bq/m³) annual average — at or above this level, mitigation is recommended. Levels between 2 and 4 pCi/L should also be considered for mitigation; WHO recommends 100 Bq/m³ (~2.7 pCi/L) as a reference. Short-term screening (2–7 day charcoal canister or continuous radon monitor, CRM) is appropriate for initial assessment but has high day-to-day variability — barometric pressure, weather, HVAC operation. Long-term testing (alpha-track or E-Perm electret, 90 days to 1 year) gives the most representative annual exposure. For real-estate transactions, NRPP (National Radon Proficiency Program) typically requires CRM short-term tests with specific protocols (closed-building conditions, no testing within 48 hours of weather front passage). Radon is IARC Group 1 — the second-leading cause of lung cancer in the US after smoking. Risk is synergistic with smoking. No OSHA general-industry PEL for radon; uranium mining has 10 CFR 20 limits. For IAQ screening in homes, schools, and offices, cite EPA 4 pCi/L action level.',
  },
  {
    id: 'lead-rrp',
    title: 'Lead RRP rule and HUD action levels',
    citation: '40 CFR 745 (EPA RRP) + 24 CFR 35 (HUD Lead Safe Housing)',
    document: 'EPA-HUD',
    year: 2020,
    tags: ['lead', 'rrp', 'hud', 'paint', 'wipe', 'sampling'],
    text: 'Lead in paint, dust, and soil is regulated by EPA and HUD for residential / child-occupied facilities (pre-1978 construction). EPA Renovation, Repair and Painting (RRP) rule (40 CFR 745) requires lead-safe work practices for any renovation disturbing >6 ft² interior or 20 ft² exterior of painted surface in target housing. HUD Lead Safe Housing Rule (24 CFR 35) applies to federally-assisted housing. Action levels (post-2020 EPA revision): floor dust 10 µg/ft², windowsill dust 100 µg/ft², window trough 400 µg/ft². Paint lead-based threshold: 1.0 mg/cm² by XRF or 5,000 ppm by laboratory analysis. Soil action levels: 400 ppm play area, 1200 ppm general residential. Sampling methods: NIOSH 9100 wipe (acid extraction + AAS or ICP) for surface dust; XRF (HUD-approved instrument, in-situ) for paint screening — confirmatory chip sample by NIOSH 7300 or 7082 for any near-threshold XRF result. CDC blood lead reference (2021): 3.5 µg/dL (down from 5 µg/dL). OSHA PEL for lead is 50 µg/m³ air, Action Level 30 µg/m³ (29 CFR 1910.1025), with medical removal at blood lead 50 µg/dL.',
  },
  {
    id: 'combustion-sources-indoor',
    title: 'Indoor combustion sources — CO, NO₂, PM',
    citation: 'EPA IAQ Tools for Schools + ASHRAE 62.1 §5',
    document: 'EPA-ASHRAE',
    year: 2024,
    tags: ['combustion', 'co', 'no2', 'gas-stove', 'furnace', 'venting'],
    text: 'Unvented or improperly-vented indoor combustion is a significant IAQ hazard. Sources include gas cooking ranges (especially without exhaust hood ventilation), unvented gas space heaters, wood and pellet stoves with poor draft, gas water heaters in occupied spaces, attached garages with vehicle idling, and backdrafting from chimneys / flues. Combustion products of concern: carbon monoxide (CO — acute toxicity, COHb formation), nitrogen dioxide (NO₂ — respiratory irritant, asthma exacerbation in children), ultrafine and fine particulate (PM2.5 — IARC Group 1, cardiopulmonary risk), polycyclic aromatic hydrocarbons (PAHs — wood smoke, IARC carcinogens), and formaldehyde (incomplete combustion + off-gassing from combustion-byproduct condensation). Screening recommendations: install hard-wired CO detectors per NFPA 720; document gas stove ventilation (range hood vented to exterior, not recirculating); inspect water heater, furnace, and boiler flues for spillage with combustion-spillage test; recommend NO₂ sampling (NIOSH 6014 passive badge) in homes with gas appliances and asthmatic occupants; recommend PM2.5 monitoring (optical or gravimetric) in homes with wood-burning appliances.',
  },
  {
    id: 'mercury-vapor-response',
    title: 'Mercury vapor spill response and screening',
    citation: 'ATSDR ToxFAQs Mercury + EPA Region Spills',
    document: 'ATSDR-EPA',
    year: 2022,
    tags: ['mercury', 'spill', 'cfl', 'thermometer', 'cleanup', 'response'],
    text: 'Elemental mercury vapor exposure can occur from broken thermometers, fluorescent lamps (including CFLs, ~3-5 mg per bulb), thermostat switches, blood-pressure cuffs (older), and lab spills. Cleanup of small spills (<2 grams, a typical CFL or thermometer): never use a vacuum (aerosolizes mercury), never use a broom (spreads droplets), and never dispose of contaminated material in regular trash. Use a stiff card to scoop droplets into a sealed glass jar; use sulfur powder or commercial mercury spill kit for residual decontamination; ventilate the area for ≥24 hours; dispose as hazardous waste. For larger spills, evacuate, ventilate, and call EPA Region or state environmental agency. Mercury vapor screening: direct-read Lumex or Jerome instrument (atomic absorption or gold-film) detects sub-µg/m³ concentrations in real-time; NIOSH 6009 (hopcalite sorbent + cold-vapor AAS) for time-integrated samples. EPA recommends action when indoor concentrations exceed 1 µg/m³ (cleanup target) or 3 µg/m³ (continued occupation discouraged). ATSDR Minimal Risk Level (chronic inhalation) is 0.3 µg/m³. ACGIH TLV is 0.025 mg/m³ (25 µg/m³) for occupational exposure with skin notation.',
  },
];

/**
 * Compact summary used for the agent's "what's in the corpus" answer.
 * Avoids loading the full chunk array into the prompt.
 */
export function summarizeCorpus() {
  return {
    chunkCount: STANDARDS_CORPUS.length,
    documents: Array.from(new Set(STANDARDS_CORPUS.map((c) => c.document))).sort(),
  }
}
