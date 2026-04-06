const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument({
  size: 'letter',
  margins: { top: 72, bottom: 72, left: 72, right: 72 },
  info: {
    Title: 'AtmosIQ Technical White Paper',
    Author: 'Prudence Safety & Environmental Consulting, LLC',
    Subject: 'Indoor Air Quality Assessment Intelligence Platform',
  }
});

const stream = fs.createWriteStream('public/AtmosIQ-Technical-White-Paper.pdf');
doc.pipe(stream);

const W = 468; // usable width (letter - margins)
const DARK = '#0A0A10';
const CYAN = '#0E7490';
const GOLD = '#92400E';
const BODY = '#1A1A2A';
const DIM = '#4A4A5A';

function hr() {
  doc.moveDown(0.5);
  doc.strokeColor('#D4D4D8').lineWidth(0.5)
    .moveTo(72, doc.y).lineTo(540, doc.y).stroke();
  doc.moveDown(0.5);
}

function heading(text, size = 18) {
  doc.font('Helvetica-Bold').fontSize(size).fillColor(DARK).text(text);
  doc.moveDown(0.4);
}

function subheading(text) {
  doc.font('Helvetica-Bold').fontSize(13).fillColor(CYAN).text(text);
  doc.moveDown(0.3);
}

function body(text) {
  doc.font('Helvetica').fontSize(10.5).fillColor(BODY).text(text, { lineGap: 4, align: 'justify' });
  doc.moveDown(0.5);
}

function bullet(text) {
  const x = doc.x;
  doc.font('Helvetica').fontSize(10.5).fillColor(BODY)
    .text('  \u2022  ' + text, { lineGap: 3, indent: 8 });
  doc.moveDown(0.2);
}

function checkPage(needed = 120) {
  if (doc.y > 660) doc.addPage();
}

// ── COVER PAGE ──
doc.rect(0, 0, 612, 792).fill(DARK);

// Accent line
doc.rect(72, 120, 200, 3).fill('#22D3EE');

doc.font('Helvetica-Bold').fontSize(42).fillColor('#F0F4F8')
  .text('AtmosIQ', 72, 150);
doc.font('Helvetica').fontSize(16).fillColor('#22D3EE')
  .text('Technical White Paper', 72, 200);

doc.moveDown(4);
doc.font('Helvetica').fontSize(22).fillColor('#A0A0B0')
  .text('Indoor Air Quality\nAssessment Intelligence\nPlatform', 72, 280, { lineGap: 8 });

doc.font('Helvetica').fontSize(11).fillColor('#606070')
  .text('Version 6.0  |  April 2026', 72, 520);

doc.font('Helvetica').fontSize(10).fillColor('#606070')
  .text('Prudence Safety & Environmental Consulting, LLC', 72, 560);
doc.text('tsidi@prudenceehs.com', 72, 575);

doc.font('Helvetica').fontSize(8).fillColor('#38384A')
  .text('CONFIDENTIAL — Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC. All rights reserved.', 72, 720, { width: W });

// ── PAGE 2: EXECUTIVE SUMMARY ──
doc.addPage();

heading('Executive Summary', 22);
hr();

body(
  'AtmosIQ is a field-grade indoor air quality (IAQ) assessment intelligence platform developed by Prudence Safety & Environmental Consulting, LLC. Designed for Certified Industrial Hygienists (CIHs), environmental health and safety (EHS) professionals, and building science consultants, AtmosIQ transforms the traditional IAQ assessment workflow from a fragmented, spreadsheet-based process into a systematic, standards-referenced, and defensible methodology.'
);

body(
  'The platform integrates real-time instrument data with structured building and zone observations, scoring each assessment across five weighted categories against ASHRAE 62.1-2025, ASHRAE 55-2023, OSHA 29 CFR 1910, EPA guidelines, and NIOSH Recommended Exposure Limits. AtmosIQ generates composite risk scores, causal chain analyses, hypothesis-driven sampling plans, OSHA defensibility evaluations, and AI-powered findings narratives.'
);

body(
  'This white paper details the technical methodology, scoring algorithms, causal intelligence engine, and the standards framework that underpin the AtmosIQ platform.'
);

// ── THE PROBLEM ──
doc.moveDown(0.5);
heading('The Problem', 18);
hr();

body(
  'Indoor air quality assessments are among the most complex evaluations in environmental health and safety. A single commercial building assessment may involve multiple zones, dozens of instrument readings, occupant complaint data, HVAC system evaluation, environmental observations, and cross-referencing against no fewer than six regulatory and consensus standards.'
);

body('Current industry challenges include:');

bullet('Fragmented data collection across spreadsheets, paper forms, and disconnected instruments');
bullet('Inconsistent application of standards — assessors may reference ASHRAE 62.1 for ventilation but miss OSHA defensibility implications');
bullet('Subjective risk characterization with no standardized scoring methodology');
bullet('Inability to systematically identify root causes when multiple factors interact (e.g., ventilation deficiency + moisture intrusion + chemical sources)');
bullet('Time-intensive report generation that delays client deliverables');
bullet('No automated sampling plan generation — recommendations depend entirely on individual assessor experience');

// ── PLATFORM ARCHITECTURE ──
checkPage();
doc.moveDown(0.5);
heading('Platform Architecture', 18);
hr();

body(
  'AtmosIQ v6 is built as a progressive web application (PWA) using React, enabling deployment across desktop browsers, tablets, and mobile devices. The architecture separates concerns into distinct engines, each responsible for a specific analytical function.'
);

subheading('Core Engines');

bullet('Scoring Engine — Multi-category weighted scoring with standard-specific thresholds');
bullet('Causal Chain Engine — Evidence-weighted root cause identification across four pathways');
bullet('Sampling Engine — Hypothesis-driven laboratory sampling plan generation');
bullet('Narrative Engine — AI-powered professional findings narrative generation');
bullet('Ventilation Calculator — ASHRAE 62.1-2025 outdoor air requirement computation');
bullet('OSHA Defensibility Engine — Compliance gap analysis with confidence scoring');

// ── SCORING METHODOLOGY ──
checkPage();
doc.addPage();
heading('Scoring Methodology', 18);
hr();

body(
  'AtmosIQ employs a 100-point composite scoring system distributed across five weighted categories. Each category is scored independently based on field data and evaluated against applicable standards. The weighting reflects the relative health significance and regulatory importance of each domain.'
);

subheading('Category Weights');
doc.moveDown(0.2);

const cats = [
  ['Ventilation (25 points)', 'ASHRAE 62.1-2025 compliance, CO2 differential analysis, outdoor air adequacy, supply airflow assessment'],
  ['Contaminants (25 points)', 'PM2.5 (EPA/WHO), CO (OSHA/NIOSH), HCHO (OSHA/NIOSH), TVOCs, mold indicators, odor assessment'],
  ['HVAC Condition (20 points)', 'Maintenance history, filter condition and rating, supply air delivery, condensate drain pan status'],
  ['Occupant Complaints (15 points)', 'Complaint presence, affected population, symptom resolution pattern, spatial clustering'],
  ['Environment (15 points)', 'Thermal comfort (ASHRAE 55), relative humidity, water damage assessment, visible environmental conditions'],
];

cats.forEach(([title, desc]) => {
  checkPage(60);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(DARK).text(title);
  doc.font('Helvetica').fontSize(10).fillColor(DIM).text(desc, { lineGap: 2 });
  doc.moveDown(0.5);
});

subheading('Composite Score Calculation');
body(
  'The facility-level composite score is calculated using a weighted average that incorporates worst-zone performance to prevent false confidence from averaging. The formula applies 60% weight to the mean zone score and 40% weight to the worst-performing zone: Composite = (Average x 0.6) + (Worst x 0.4). This ensures that a single critically deficient zone is not masked by acceptable conditions elsewhere in the facility.'
);

subheading('Risk Classification');
body('Composite scores map to four risk tiers:');
bullet('85-100: Low Risk — Conditions meet or exceed applicable standards');
bullet('70-84: Moderate Risk — Minor deficiencies identified; monitoring recommended');
bullet('50-69: High Risk — Significant deficiencies requiring engineering or administrative controls');
bullet('0-49: Critical Risk — Immediate action required; potential regulatory exposure');

// ── VENTILATION ANALYSIS ──
checkPage();
doc.addPage();
heading('Ventilation Analysis', 18);
hr();

body(
  'Ventilation scoring is the highest-weighted category (25 points) reflecting its fundamental role in indoor air quality. When CO2 data is available, AtmosIQ performs differential analysis against ASHRAE 62.1-2025 thresholds.'
);

subheading('CO2 Differential Methodology');
body(
  'The platform calculates the indoor-outdoor CO2 differential using the measured outdoor baseline (or the default atmospheric concentration of 420 ppm when outdoor data is unavailable). Thresholds are evaluated as follows:'
);

bullet('Differential > 700 ppm or indoor > 1000 ppm: Below standard (ASHRAE 62.1)');
bullet('Indoor > 1500 ppm: Severely inadequate ventilation');
bullet('Indoor 800-1000 ppm: Approaching concern level');
bullet('Indoor < 800 ppm with acceptable differential: Good ventilation');

subheading('Outdoor Air Rate Calculation');
body(
  'For each zone, AtmosIQ calculates the minimum outdoor air requirement per ASHRAE 62.1-2025 using the Ventilation Rate Procedure. The calculation combines people-based outdoor air rate (Rp x occupant count) with area-based outdoor air rate (Ra x zone floor area), using space-type-specific rates from Table 6-1 of the standard. Nine space types are supported: office, classroom, retail, healthcare, laboratory, warehouse, manufacturing, conference, and data center.'
);

// ── CONTAMINANT EVALUATION ──
checkPage();
doc.moveDown(0.5);
heading('Contaminant Evaluation', 18);
hr();

body('The contaminant scoring engine evaluates six parameter groups against regulatory and consensus thresholds:');
doc.moveDown(0.3);

const contaminants = [
  ['Particulate Matter (PM2.5)', 'Evaluated against EPA NAAQS (35 ug/m3) and WHO guidelines (15 ug/m3). Indoor-outdoor comparison performed when outdoor baseline is available.'],
  ['Carbon Monoxide (CO)', 'OSHA PEL: 50 ppm (8-hr TWA). NIOSH REL: 35 ppm. Exceedance triggers immediate action recommendations.'],
  ['Formaldehyde (HCHO)', 'OSHA PEL: 0.75 ppm. OSHA Action Level: 0.5 ppm. NIOSH REL: 0.016 ppm. Tiered scoring across all three thresholds.'],
  ['Total VOCs (TVOCs)', 'Concern level: 500 ug/m3. Action level: 3000 ug/m3. PID-measured with outdoor baseline comparison when available.'],
  ['Mold Indicators', 'Visual assessment scored by extent: suspected discoloration, small (< 10 sq ft), moderate (10-100 sq ft), extensive (> 100 sq ft). All visual mold findings are flagged as unconfirmed pending sampling.'],
  ['Odor Assessment', 'Characterized by intensity (faint/intermittent, moderate/persistent, strong/overpowering) and type (chemical, musty, sewage, exhaust, off-gassing, sweet).'],
];

contaminants.forEach(([title, desc]) => {
  checkPage(60);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(DARK).text(title);
  doc.font('Helvetica').fontSize(10).fillColor(DIM).text(desc, { lineGap: 2 });
  doc.moveDown(0.5);
});

// ── CAUSAL CHAIN ANALYSIS ──
checkPage();
doc.addPage();
heading('Causal Chain Intelligence', 18);
hr();

body(
  'The Causal Chain Engine is a distinguishing capability of the AtmosIQ platform. Rather than presenting assessment findings as isolated observations, the engine identifies mechanistic pathways that connect root causes to observed conditions and occupant outcomes. Four causal chain types are evaluated:'
);

subheading('1. Ventilation Deficiency Chain');
body(
  'Triggered when ventilation scoring indicates deficiency (score <= 15/25) combined with corroborating evidence: outdoor air damper restriction, weak supply airflow, or occupant symptoms that resolve away from the building. Evidence items are aggregated and confidence is rated as Strong (3+ items), Moderate (2 items), or Possible (1 item).'
);

subheading('2. Moisture / Biological Chain');
body(
  'Triggered when water intrusion evidence (active leak, extensive damage) or biological indicators (visible mold, musty odor) co-occur with respiratory symptoms (cough, wheezing, nasal congestion). Elevated indoor humidity (> 60% RH) strengthens the chain. Root cause attribution distinguishes between active water intrusion and chronic moisture conditions.'
);

subheading('3. Chemical Exposure Chain');
body(
  'Triggered when identified contaminant sources (internal or adjacent) coincide with elevated TVOC or HCHO measurements and irritation symptoms (eye irritation, headache, throat irritation). The chain maps source identification to measured concentrations to health outcomes.'
);

subheading('4. Cross-Contamination Pathway');
body(
  'Triggered when evidence of air migration between spaces is observed (odor migration, visible air movement at gaps, duct cross-talk) combined with zone pressure data. Negative zone pressure relative to contaminated adjacent spaces strengthens the chain.'
);

// ── SAMPLING PLAN GENERATION ──
checkPage();
doc.moveDown(0.5);
heading('Sampling Plan Generation', 18);
hr();

body(
  'The Sampling Engine generates hypothesis-driven laboratory sampling recommendations based on field observations. Unlike template-based approaches, each recommendation includes a specific hypothesis, analytical method, required controls, and applicable standard. Sampling triggers include:'
);

bullet('Visible mold indicators: Culturable air samples (Andersen impactor) + surface samples per AIHA Field Guide');
bullet('Active water intrusion: Moisture mapping with conditional bioaerosol sampling per IICRC S520');
bullet('Musty odor without visible mold: Wall cavity sampling via bore hole or spore trap per AIHA guidelines');
bullet('Elevated real-time HCHO: Confirmation via NIOSH 2016 (DNPH cartridge) per OSHA 29 CFR 1910.1048');
bullet('Recent renovation with off-gassing: TO-17 sorbent tube (thermal desorption GC/MS) per EPA Compendium');
bullet('Elevated TVOCs by PID: VOC speciation via TO-15 (SUMMA canister) or TO-17');
bullet('Elevated CO: Source tracing with real-time monitor per ASHRAE 62.1');
bullet('Sewage odor: H2S monitoring with plumbing investigation per OSHA PEL/NIOSH REL');

body(
  'The engine also identifies outdoor control sample gaps — situations where indoor measurements lack corresponding outdoor baselines, which weakens the ability to determine whether elevated levels are building-related or ambient.'
);

// ── OSHA DEFENSIBILITY ──
checkPage();
doc.addPage();
heading('OSHA Defensibility Evaluation', 18);
hr();

body(
  'The OSHA Defensibility Engine evaluates whether assessment findings could trigger regulatory scrutiny under the General Duty Clause (Section 5(a)(1)) or specific OSHA standards. The evaluation considers:'
);

bullet('Documented occupant complaints combined with hazard indicator scores below 70');
bullet('Ventilation deficiency (CO2 > 1000 ppm)');
bullet('Water intrusion or mold indicators');
bullet('Building-related symptom patterns with widespread affected populations');
bullet('Chemical exposures exceeding OSHA Permissible Exposure Limits');

subheading('Confidence Rating');
body(
  'The defensibility evaluation includes a confidence rating based on data completeness. Three factors are assessed: availability of instrument data (CO2, temperature), presence of occupant complaint documentation, and knowledge of HVAC maintenance history. Confidence is rated as High (all three), Medium (two of three), or Limited (one or fewer). Data gaps are explicitly identified to guide supplemental data collection.'
);

// ── AI NARRATIVE GENERATION ──
doc.moveDown(0.5);
heading('AI Narrative Generation', 18);
hr();

body(
  'AtmosIQ integrates AI-powered narrative generation to produce professional findings narratives from assessment data. The system is prompted with the role of an expert CIH and constrained to: describe only what the data shows; never invent scores, thresholds, or standards not provided; write in professional third-person; reference zone names and specific measurements; and limit output to 2-3 paragraphs.'
);

body(
  'The narrative engine receives the complete assessment payload including facility information, zone scores, individual findings, measurements, and recommendations. The resulting narrative is suitable for inclusion in client-facing reports with appropriate professional review.'
);

// ── STANDARDS FRAMEWORK ──
doc.moveDown(0.5);
heading('Standards Framework', 18);
hr();

body('AtmosIQ v6 incorporates the following standards and references:');
doc.moveDown(0.3);

const standards = [
  ['ASHRAE Standard 62.1-2025', 'Ventilation and Acceptable Indoor Air Quality — outdoor air requirements, CO2 monitoring guidance, Ventilation Rate Procedure'],
  ['ASHRAE Standard 55-2023', 'Thermal Environmental Conditions for Human Occupancy — temperature and humidity comfort ranges for summer and winter conditions'],
  ['OSHA 29 CFR 1910.1000', 'Air Contaminants — Permissible Exposure Limits for CO, formaldehyde, and other regulated substances'],
  ['OSHA 29 CFR 1910.1048', 'Formaldehyde Standard — PEL, Action Level, exposure monitoring, and medical surveillance requirements'],
  ['EPA NAAQS / WHO Guidelines', 'Particulate matter (PM2.5) ambient air quality standards and health-based guidelines'],
  ['NIOSH RELs', 'Recommended Exposure Limits for CO (35 ppm) and formaldehyde (0.016 ppm)'],
  ['AIHA / ACGIH', 'Bioaerosol assessment guidelines, indoor air quality investigation protocols'],
  ['EPA Compendium Methods', 'TO-15 and TO-17 VOC sampling and analysis methodologies'],
  ['IICRC S520', 'Standard for Professional Mold Remediation'],
];

standards.forEach(([title, desc]) => {
  checkPage(50);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(title);
  doc.font('Helvetica').fontSize(9.5).fillColor(DIM).text(desc, { lineGap: 2 });
  doc.moveDown(0.4);
});

// ── CONCLUSION ──
checkPage();
doc.addPage();
heading('Conclusion', 18);
hr();

body(
  'AtmosIQ represents a fundamental advancement in how indoor air quality assessments are conducted, analyzed, and reported. By integrating real-time scoring against current standards, causal chain intelligence, automated sampling plan generation, and AI-powered narrative generation into a single field-deployable platform, AtmosIQ enables EHS professionals to deliver more thorough, defensible, and timely assessments.'
);

body(
  'The platform\'s systematic approach eliminates the fragmentation and subjectivity that characterize traditional IAQ assessment workflows, while its multi-standard scoring framework ensures that no regulatory or consensus threshold is overlooked. The causal chain engine transforms isolated observations into actionable root cause analyses, and the sampling plan generator ensures that laboratory follow-up is hypothesis-driven rather than template-based.'
);

body(
  'Prudence Safety & Environmental Consulting, LLC continues to develop and refine the AtmosIQ platform in alignment with evolving standards and best practices in industrial hygiene and environmental health.'
);

doc.moveDown(2);
hr();
doc.moveDown(1);

doc.font('Helvetica-Bold').fontSize(12).fillColor(DARK)
  .text('Prudence Safety & Environmental Consulting, LLC');
doc.moveDown(0.3);
doc.font('Helvetica').fontSize(10).fillColor(DIM)
  .text('Contact: tsidi@prudenceehs.com');
doc.text('Web: atmosiq.prudenceehs.com');
doc.moveDown(1);
doc.font('Helvetica').fontSize(8).fillColor(DIM)
  .text('Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC. All rights reserved. This document is the proprietary information of Prudence Safety & Environmental Consulting, LLC. No part may be reproduced, distributed, or transmitted without prior written permission.', { width: W, align: 'justify' });

doc.end();
stream.on('finish', () => console.log('White paper generated successfully.'));
