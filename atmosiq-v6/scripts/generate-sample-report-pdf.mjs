#!/usr/bin/env node
/**
 * Generates public/sample-report.pdf — the customer-facing marketing sample.
 *
 * This is now a THIN wrapper: it builds the fictitious SAMPLE_MODEL (the exact
 * content of the approved sample) and hands it to the shared, model-driven
 * renderer at lib/report/render-pdf.js — the same renderer the live app uses
 * for real assessments. The design therefore can never drift between the
 * sample and a real report: there is one renderer.
 *
 * Run via: node scripts/generate-sample-report-pdf.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderReportPdf } from '../lib/report/render-pdf.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '..', 'public', 'sample-report.pdf')
mkdirSync(dirname(OUT_PATH), { recursive: true })

const SOFT = '#475569'
const CO2_SERIES = '#0E9FB8'

const REPORT = {
  facility: 'Meridian Commerce Tower (sample)',
  address: '1450 Asherton Park Drive, Suite 600, Calverton Heights, MD 20899',
  date: 'March 14, 2026',
  assessor: 'John Smith, CIH, CSP',
  firm: 'Prudence Safety & Environmental Consulting, LLC',
  reportId: 'PSEC-IAQ-2026-0314-MCT',
  floors: 'Floors 7, 8, and 12',
}

const ZONES = [
  { id: '7-A', use: 'South perimeter office', co2: 612, co: 0.4, t: 71.8, rh: 41, pm: 7, tvoc: 220, sev: 'ok' },
  { id: '7-C', use: 'Open workstations', co2: 740, co: 0.5, t: 72.5, rh: 43, pm: 9, tvoc: 280, sev: 'ok' },
  { id: '8-B', use: 'Open office', co2: 905, co: 0.6, t: 73.4, rh: 46, pm: 11, tvoc: 340, sev: 'ok' },
  { id: '8-D', use: 'Interior conference (no operable window)', co2: 1247, co: 0.7, t: 74.9, rh: 51, pm: 14, tvoc: 520, sev: 'elevated' },
  { id: '8-F', use: 'Copy / print room', co2: 880, co: 0.6, t: 73.1, rh: 44, pm: 18, tvoc: 610, sev: 'advisory' },
  { id: '12-A', use: 'Executive suite', co2: 690, co: 0.4, t: 72.0, rh: 40, pm: 6, tvoc: 240, sev: 'ok' },
  { id: '12-B', use: 'Break room', co2: 1015, co: 1.1, t: 73.8, rh: 48, pm: 16, tvoc: 430, sev: 'advisory' },
  { id: '12-D', use: 'IT-room-adjacent office', co2: 760, co: 0.5, t: 70.2, rh: 36, pm: 8, tvoc: 300, sev: 'ok' },
]
const OUTDOOR = { co2: 432, co: 0.3, t: 58.0, rh: 55, pm: 12, tvoc: 50 }
const LOGGER = [
  { x: '13:10', co2: 765, temp: 72.6, rh: 44 }, { x: '13:13', co2: 802, temp: 72.8, rh: 45 },
  { x: '13:16', co2: 868, temp: 73.1, rh: 46 }, { x: '13:19', co2: 941, temp: 73.4, rh: 47 },
  { x: '13:22', co2: 1008, temp: 73.8, rh: 48 }, { x: '13:25', co2: 1074, temp: 74.1, rh: 49 },
  { x: '13:28', co2: 1129, temp: 74.4, rh: 49 }, { x: '13:31', co2: 1176, temp: 74.6, rh: 50 },
  { x: '13:34', co2: 1206, temp: 74.8, rh: 51 }, { x: '13:37', co2: 1229, temp: 74.9, rh: 51 },
  { x: '13:40', co2: 1244, temp: 74.9, rh: 52 }, { x: '13:43', co2: 1247, temp: 75.0, rh: 52 },
  { x: '13:46', co2: 1181, temp: 74.5, rh: 50 }, { x: '13:49', co2: 1042, temp: 73.8, rh: 48 },
  { x: '13:52', co2: 904, temp: 73.1, rh: 46 }, { x: '13:55', co2: 818, temp: 72.7, rh: 45 },
]
const OCC = [2, 11]
const num = (k) => ZONES.map(z => z[k])
const rng = (k) => `${Math.min(...num(k))}–${Math.max(...num(k))}`

const resultsRow = (z) => ({ id: z.id, use: z.use, co2: String(z.co2), co: z.co.toFixed(1), t: z.t.toFixed(1), rh: String(z.rh), pm: String(z.pm), tvoc: String(z.tvoc), sev: z.sev })

const SAMPLE_MODEL = {
  meta: {
    docTitle: 'AtmosFlow — Sample Indoor Air Quality Assessment Report',
    reportTitle: 'Screening-Level IAQ Assessment Report',
    coverSubtitle: 'Direct-reading evaluation of carbon dioxide, comfort, and particulate / VOC indicators',
    coverStatusChip: 'Sample — Evaluation Use Only',
    coverRows: [
      ['Facility', REPORT.facility], ['Address', REPORT.address], ['Scope', REPORT.floors],
      ['Assessment date', REPORT.date], ['Assessor of record', REPORT.assessor], ['Report ID', REPORT.reportId],
    ],
    coverDisclaimer: 'This document is a fictitious sample produced to illustrate AtmosFlow report structure and tone. All facility identifiers, measurements, and personnel are invented and do not describe a real building or assessment.',
    coverFooter: 'Screening-level evaluation — not a regulatory exposure determination, OSHA compliance certification, or medical evaluation.',
    firm: REPORT.firm,
    headerLabel: 'Sample — Evaluation Use Only',
    footerNote: `${REPORT.reportId}  ·  Confidential sample — © 2026 ${REPORT.firm}`,
    watermark: null,
    brandColor: '#0E7490',
  },
  execSummary: `On ${REPORT.date}, ${REPORT.firm} conducted a screening-level indoor air quality (IAQ) assessment of ${REPORT.floors.toLowerCase()} at ${REPORT.facility}. The assessment combined direct-reading instrument measurements with visual inspection and occupant interviews across eight representative zones during normal occupied-hours operation. Its purpose is to characterize ventilation adequacy, thermal comfort, and common airborne indicators, and to prioritize follow-up where conditions warrant. This is a screening evaluation; results reflect conditions observed during the assessment window and are interpreted in light of the limitations in Section 7.`,
  findingsAtGlance: [
    { parameter: 'Carbon dioxide (CO2)', range: `${rng('co2')} ppm`, basis: 'ASHRAE 62.1 ventilation indicator', outcome: 'elevated' },
    { parameter: 'Carbon monoxide (CO)', range: `${rng('co')} ppm`, basis: 'US EPA NAAQS 9 ppm (8-hr)', outcome: 'ok' },
    { parameter: 'Temperature', range: `${rng('t')} °F`, basis: 'ASHRAE 55 comfort envelope', outcome: 'ok' },
    { parameter: 'Relative humidity', range: `${rng('rh')} %`, basis: 'ASHRAE 55 (30–60% target)', outcome: 'ok' },
    { parameter: 'Fine particulate (PM2.5)', range: `${rng('pm')} µg/m³`, basis: 'US EPA NAAQS 35 µg/m³ (24-hr)', outcome: 'advisory' },
    { parameter: 'Total VOCs (TVOC)', range: `${rng('tvoc')} µg/m³`, basis: 'Mølhave (1991) advisory tiers', outcome: 'advisory' },
  ],
  showSeverityLegend: true,
  severityLegendNote: 'Acceptable: within recognized screening references. Advisory: monitor / investigate source. Elevated: corrective action recommended. Priority: prompt action recommended.',
  overallStatement: `Most zones presented acceptable ventilation, comfort, and air-quality indicators. One interior conference room (Zone 8-D) showed a carbon-dioxide trend consistent with possible under-ventilation relative to occupant load during a high-occupancy meeting (a screening inference, not a measured ventilation rate), and two zones (8-F copy/print room and 12-B break room) showed advisory-tier particulate and VOC readings indicating identifiable local sources. No carbon-monoxide, thermal, or humidity conditions outside the screening references were observed. Each finding below carries a confidence rating and the verification it would need; recommended actions in Section 5 follow a verify-before-invest ladder.`,
  scope: {
    paras: [
      `The assessment covered ${REPORT.floors.toLowerCase()} of ${REPORT.facility}, a multi-tenant Class-A office building served by a central variable-air-volume (VAV) HVAC system with rooftop air handlers and perimeter VAV boxes. Eight zones were selected to represent a cross-section of use types: perimeter and interior offices, open workstations, a conference room, a copy/print room, an executive suite, and a break room. Occupancy at the time of assessment ranged from 1 to 6 persons per zone. Outdoor conditions were mild and dry (≈58 °F, 55% RH), with light wind from the northwest.`,
      'The objective was a screening characterization of indoor air quality indicators to (a) confirm whether observed conditions fall within recognized comfort and ventilation references, (b) identify any zones warranting follow-up, and (c) provide a defensible, prioritized action list. The assessment did not include integrated time-weighted-average sampling, microbial sampling, or destructive investigation.',
    ],
    showFloorPlanSchematic: true,
    floorPlanCaption: 'Schematic of Floor 8 showing the spaces sampled and the direct-reading locations (S1–S3). The interior conference room (8-D) has no operable window and was the continuous-logger station.',
  },
  methodology: {
    bullets: [
      'TSI Q-Trak 7575 multi-parameter monitor + DustTrak DRX 8534. CO2, CO, temperature, and relative humidity captured with the Q-Trak; fine particulate (PM2.5) captured with the DustTrak DRX.',
      'Calibration: both instruments bump-checked the morning of the assessment and last factory-calibrated 12 days prior, within manufacturer specification. CO2 accuracy at 1,000 ppm: ±50 ppm (manufacturer-stated). PM2.5 zeroed with a HEPA filter immediately before use.',
      'Measurement protocol: grab readings at occupied breathing-zone height (1.5 m AGL) held at least 3 minutes per location, with a short continuous log (1-minute interval) in the conference room during an occupied meeting.',
    ],
    referenceFramework: 'Outcomes are screened against recognized consensus and regulatory references: ASHRAE 62.1-2022 (ventilation, used as an indicator basis for CO2 — not a CO2 contaminant limit), ASHRAE 55-2020 (thermal comfort), US EPA NAAQS (CO and PM2.5), OSHA PELs (29 CFR 1910.1000), and the Mølhave (1991) advisory tiers for TVOC. References are used to contextualize screening readings, not to render compliance determinations.',
  },
  results: {
    intro: 'The table below summarizes representative occupied-hours readings by zone. The outdoor reference and site arithmetic mean are shown for context. Values are direct-reading grab measurements unless otherwise noted.',
    rows: [
      { id: 'Outdoor', use: 'Rooftop intake (reference)', co2: String(OUTDOOR.co2), co: OUTDOOR.co.toFixed(1), t: OUTDOOR.t.toFixed(1), rh: String(OUTDOOR.rh), pm: String(OUTDOOR.pm), tvoc: String(OUTDOOR.tvoc), sev: 'ok' },
      ...ZONES.map(resultsRow),
      { id: 'Site mean', use: '', co2: '856', co: '0.6', t: '72.7', rh: '44', pm: '11', tvoc: '368', sev: 'ok', __bold: true },
    ],
    note: 'Site mean is the arithmetic mean of the eight occupied zones (outdoor reference excluded). Outcome reflects the zone’s governing parameter.',
    perParamIntro: 'Each indicator below is introduced briefly — what it is and why it is measured — followed by what was observed at this site and how it compares to recognized references.',
    parameters: [
      { title: 'Carbon dioxide (CO2) — ventilation indicator', body: [
        'What it is and why we measure it: Carbon dioxide is produced by people as they breathe and builds up indoors when the supply of outdoor air does not keep pace with the number of occupants. At the concentrations typical of offices it is not itself a health hazard, but it is the most practical real-time indicator of ventilation adequacy — elevated levels usually accompany "stuffiness" complaints and signal that a space is receiving too little fresh air for its occupant load.',
        'Observed: Outdoor baseline averaged 432 ppm. Indoor concentrations ranged 612–1247 ppm (site mean 856 ppm). ASHRAE 62.1 prescribes ventilation rates rather than a CO2 limit; an indoor-to-outdoor differential above roughly 700 ppm is commonly used as an indicator that outdoor-air delivery may be low relative to occupant load. The Zone 8-D peak of 1247 ppm during a six-person meeting is 815 ppm above outdoor — consistent with possible under-ventilation for that occupancy. This is an indicator, not a measurement of ventilation: occupant density, room volume, supply airflow, and the design ventilation rate were not measured, so the finding is a screening hypothesis pending airflow / BAS / TAB verification. All other zones remained within the indicator range.',
      ] },
      { title: 'Carbon monoxide (CO)', body: [
        'What it is and why we measure it: Carbon monoxide is a colorless, odorless gas formed by incomplete combustion — vehicle exhaust, gas-fired appliances, and generators. Because it is an acute hazard that reduces the blood’s ability to carry oxygen, even low indoor readings are screened to rule out combustion sources migrating into occupied space (for example from loading docks, an attached garage, or a flue that is not venting properly).',
        'Observed: CO was uniformly low (0.4–1.1 ppm) and well below the US EPA NAAQS (9 ppm, 8-hour) and the OSHA PEL (50 ppm, 8-hour TWA). The slightly higher break-room reading (Zone 12-B, 1.1 ppm) is consistent with intermittent toaster/appliance use and is not of concern at this level.',
      ] },
      { title: 'Thermal comfort — temperature & relative humidity', body: [
        'What it is and why we measure it: Dry-bulb temperature and relative humidity together define the thermal environment, which is the single most common driver of occupant comfort complaints. Relative humidity also affects air quality: sustained high humidity can support microbial growth, while very low humidity contributes to dryness and irritation of the eyes and airways. Both are screened against the ASHRAE 55 comfort envelope.',
        'Observed: Temperatures (70.2–74.9 °F) and relative humidity (36–51%) fell within the ASHRAE 55 comfort envelope for the season and clothing assumptions. The interior conference room trended to the warm/humid edge during occupancy, consistent with the elevated CO2 and reduced air exchange noted above.',
      ] },
      { title: 'Fine particulate (PM2.5)', body: [
        'What it is and why we measure it: PM2.5 refers to airborne particles 2.5 micrometers and smaller — fine enough to be inhaled deep into the lungs. Indoor sources include cooking, printing, and outdoor particles drawn in through the ventilation system. It is measured as an indicator of particulate exposure and of how effectively the building’s air filtration is performing.',
        'Observed: PM2.5 ranged 6–18 µg/m³ (site mean 11 µg/m³) — generally low and comparable to values commonly observed in mechanically ventilated office environments. For scale only, the US EPA 24-hour NAAQS is 35 µg/m³; NAAQS are outdoor, population-level standards built on long-term epidemiology, not office or occupational screening limits, and are cited here for context rather than as a pass/fail threshold. The copy/print room (Zone 8-F, 18 µg/m³) and break room (Zone 12-B, 16 µg/m³) read modestly higher than quieter office zones, consistent with intermittent laser-printer and cooking activity — local, transient sources rather than a building-wide condition.',
      ] },
      { title: 'Total volatile organic compounds (TVOC)', body: [
        'What it is and why we measure it: Total volatile organic compounds (TVOC) is a combined measure of the many gas-phase chemicals that off-gas from furnishings, finishes, adhesives, cleaning products, and office equipment. It is a non-specific screening indicator — it does not identify individual compounds — but elevated readings often accompany odor or irritation complaints and point to a source worth investigating.',
        'Observed: TVOC ranged 220–610 µg/m³ (isobutylene-equivalent; site mean 368 µg/m³). TVOC by photoionization is a non-specific, instrument- and calibration-dependent indicator: it does not identify the individual compounds present (which here could include cleaning products, printer emissions, fragrances, alcohols, or terpenes) and does not by itself indicate a health risk. The higher readings in the copy/print room (610 µg/m³) and conference room (520 µg/m³) indicate that identifiable VOC sources are present and warrant source investigation — not an exposure or comfort conclusion. The Mølhave (1991) tiers are noted only as legacy context; current practice does not treat a TVOC concentration alone as health-based.',
      ] },
    ],
  },
  logger: {
    disclaimer: 'The following timelines were generated from uploaded sensor logger data for screening and documentation purposes. Interpretation should be reviewed by a qualified IAQ professional; AtmosFlow does not make compliance determinations.',
    dataSource: 'Data source: meridian-8D-conf.csv · 46 readings · Mar 14, 2026 13:10 – 13:55 · 1-min interval',
    lineTitle: 'CO2 Over Time',
    line: { points: LOGGER, valueKey: 'co2', color: CO2_SERIES, yMin: 600, yMax: 1300, unit: 'ppm', refY: 1000, refLabel: '1,000 ppm · ASHRAE 62.1-2025 advisory', occ: OCC },
    lineParams: 'Parameters: CO2 · Mar 14, 2026 13:10–13:55 · shaded band = occupied (meeting)',
    lineCaption: 'CO2 climbed through the occupied meeting to a peak of 1,247 ppm and recovered within roughly ten minutes of adjournment. Dashed line is the ASHRAE 62.1-2025 indoor advisory (1,000 ppm); the peak also exceeds the 700 ppm-over-outdoor ventilation indicator discussed above.',
    dualTitle: 'Temperature & Relative Humidity',
    dual: { points: LOGGER, occ: OCC },
    dualParams: 'Parameters: Temperature, Relative Humidity · Mar 14, 2026 13:10–13:55',
    dualCaption: 'Temperature (left axis) and relative humidity (right axis) both tracked within the ASHRAE 55-2023 comfort envelope, trending to the warm/humid edge during occupancy — consistent with the reduced air exchange shown by the CO2 trend.',
  },
  findings: {
    intro: 'Findings are screening observations, ranked by recommended response and carried with a confidence rating. Confidence reflects the weight of supporting evidence (logger trend, outdoor baseline, replication) against what was not measured (airflow, compound speciation); it is not a probability. No finding constitutes a regulatory exposure determination.',
    rows: [
      { z: '8-D', sev: 'elevated', conf: 'Moderate', f: 'CO2 reached 1,247 ppm during a six-person meeting — consistent with possible under-ventilation relative to occupant load. Screening inference, not a measured ventilation rate.' },
      { z: '8-F', sev: 'advisory', conf: 'Low–Mod', f: 'PM2.5 (18 µg/m³) and TVOC (610 µg/m³) modestly above office baseline; indicates identifiable local sources (laser printing) warranting source investigation.' },
      { z: '12-B', sev: 'advisory', conf: 'Low–Mod', f: 'CO2 (1,015 ppm) and PM2.5 (16 µg/m³) higher during break/meal periods; consistent with intermittent cooking and shared return air.' },
      { z: '8-D', sev: 'advisory', conf: 'Low', f: 'TVOC (520 µg/m³) indicates VOC sources present; non-specific indicator — no compound identification or health conclusion.' },
      { z: 'All others', sev: 'ok', conf: 'Moderate', f: 'Indicators within recognized screening references at the time of assessment.' },
    ],
  },
  reportedConcerns: {
    intro: 'Occupant interviews during the walkthrough surfaced the concerns below, mapped to a plausible pathway and the screening evidence that does — or does not — support it. Occupant reports are subjective and are used to direct measurement, not to replace it.',
    rows: [
      { c: 'Afternoon "stuffiness" in the conference room', pw: 'Ventilation / outdoor-air delivery', e: 'Supported — elevated CO2 trend in 8-D', color: '#C2410C' },
      { c: 'Occasional odor near the print room', pw: 'VOC source (printing)', e: 'Partially supported — elevated TVOC in 8-F', color: '#B45309' },
      { c: 'Isolated eye / throat irritation', pw: 'Source unknown', e: 'Not supported by screening data — no corroborating measurement', color: SOFT },
    ],
  },
  conceptualModel: {
    intro: 'Following standard IAQ investigation logic, the primary finding is expressed as a source → pathway → receptor chain with its supporting evidence and confidence — so the reasoning, not just the number, is on the record.',
    heading: 'Zone 8-D ventilation concern',
    rows: [
      ['Source', 'Metabolic CO2 from meeting occupants (six persons).'],
      ['Pathway', 'Outdoor-air delivery to the windowless interior conference room appears insufficient at peak occupancy — a hypothesis, not yet measured.'],
      ['Receptor', 'Meeting occupants during the occupied window.'],
      ['Evidence', 'Rising 1-min CO2 logger trend to 1,247 ppm; 815 ppm indoor–outdoor differential; recovery on adjournment; interior room with no operable window.'],
      ['Confidence', 'Moderate — strong trend evidence, limited by the absence of airflow / BAS / TAB data.'],
    ],
  },
  workingHypotheses: {
    intro: 'The screening data support the hypotheses below. None is a confirmed cause; each names the verification it requires before it should be relied upon for capital decisions.',
    items: [
      'Outdoor-air delivery to interior Floor 8 zones may be low relative to peak occupancy. The CO2 trend is consistent with this but does not confirm it — verification requires supply-airflow measurement, BAS trend review, or a test-and-balance (TAB) evaluation of the interior VAV branch.',
      'Local emission sources (laser printing, food preparation) appear to lack dedicated local exhaust, allowing transient particulate / VOC excursions to mix into adjacent spaces. Confirmation requires checking exhaust provision and return-air paths for those rooms.',
      'No evidence of water intrusion, visible microbial growth, or combustion spillage was observed during the walkthrough (visual screening only).',
    ],
  },
  recommendations: {
    intro: 'Recommendations follow a verify-before-invest ladder: confirm the suspected cause, correct it, re-test, and only then consider permanent monitoring or capital changes. Priorities reflect screening evidence, not a confirmed diagnosis.',
    immediate: [
      'Increase outdoor-air supply to Floor 8, Zone 8-D during occupied hours. Verify VAV damper position and economizer operation through the building automation system (BAS).',
      'Until balanced, relocate meetings of more than four persons to perimeter conference rooms with higher supply capacity.',
      'Confirm the copy/print room (8-F) door-undercut and any transfer-air path; if a local exhaust fan is present, verify it runs during business hours.',
    ],
    shortTerm: [
      'Conduct a CO2-tracer ventilation survey of Floor 8 with a 4-hour logging instrument during normal occupancy. Cross-reference against as-built mechanical drawings to confirm Zone 8-D meets ASHRAE 62.1 Table 6.2.2.1 for Conference/Meeting space (5 cfm/person + 0.06 cfm/ft²).',
      'Re-balance the Floor 8 interior VAV branch; re-measure CO2 and supply airflow after adjustment.',
      'Evaluate adding dedicated local exhaust or a standalone HEPA unit for the copy/print room.',
    ],
    mediumTermLabel: 'Medium term (30–90 days) — only if warranted',
    mediumTerm: [
      'Only if elevated CO2 recurs after the interior VAV branch is balanced and re-tested, consider temporary continuous CO2 logging in Zones 8-D and 12-B through one cooling season to establish baseline mean and 95th-percentile values before any capital change.',
      'If monitoring confirms a persistent occupancy-driven pattern, then evaluate demand-controlled ventilation for those zones. Permanent BAS sensor integration is a capital decision that should follow verification, not a single screening excursion.',
      'Document as-designed versus as-installed ventilation rates in the building O&M records, and schedule a follow-up screening after corrective work.',
    ],
  },
  qaQc: [
    'Instruments bump-checked the morning of the assessment; factory calibration within the prior 12 days and within manufacturer specification.',
    'PM2.5 monitor zeroed against a HEPA filter immediately before fieldwork; CO2 verified against fresh outdoor air at the rooftop intake.',
    'Grab readings held to stabilization (at least 3 minutes) before recording; the conference-room reading captured during a representative occupied meeting.',
    'All readings and field notes were recorded in AtmosFlow and reviewed against the reference framework by the assessor of record.',
  ],
  limitations: [
    'This assessment is screening-level. Findings are based on direct-reading instrumentation captured during a single assessment window and reflect conditions on the assessment date only. No laboratory-analyzed integrated samples, microbial sampling, or destructive investigation were performed. Occupant counts and activity levels were observed at the time of measurement; sustained higher-occupancy or different operating conditions could produce different concentration profiles. Direct-reading TVOC and PM2.5 are non-specific indicators and do not identify individual compounds or establish toxicological significance. This report does not constitute a regulatory exposure determination, an OSHA compliance certification, or a medical evaluation, and should not be relied upon as such.',
    'In particular, ventilation-related findings are screening inferences from CO2 behavior, not measured airflow or ventilation rates; they should be confirmed by direct airflow, BAS-trend, or test-and-balance evaluation before any remedial investment. Occupant concerns were gathered through informal interview and are not a substitute for a structured symptom or complaint survey. Confidence ratings express the relative weight of available evidence, not a statistical probability.',
  ],
  review: {
    statement: 'The undersigned has reviewed the measurements, findings, and recommendations in this report and asserts professional judgment on the screening interpretations and the prioritized actions in Section 5.',
    signatureName: REPORT.assessor,
    signatureTitle: 'Certified Industrial Hygienist · Certified Safety Professional',
    signatureFirm: REPORT.firm,
    signatureMeta: `Report ID ${REPORT.reportId}  ·  ${REPORT.date}`,
  },
  references: [
    ['ASHRAE 62.1-2022', 'Ventilation and Acceptable Indoor Air Quality. Used as the ventilation-indicator basis for CO2 interpretation (prescribes airflow, not a CO2 limit).'],
    ['ASHRAE 55-2020', 'Thermal Environmental Conditions for Human Occupancy. Comfort envelope for temperature and relative humidity.'],
    ['US EPA NAAQS (40 CFR 50)', 'National Ambient Air Quality Standards. CO 9 ppm (8-hr); PM2.5 35 µg/m³ (24-hr).'],
    ['OSHA 29 CFR 1910.1000', 'Permissible Exposure Limits. CO PEL 50 ppm (8-hr TWA); CO2 PEL 5,000 ppm (8-hr TWA, industrial context).'],
    ['Mølhave, L. (1991)', 'Volatile organic compounds, indoor air quality and health. Advisory TVOC comfort/irritation tiers; non-specific indicator only.'],
    ['Persily, A. (2021)', 'Development and application of an indoor CO2 metric. Clarifies CO2 as a ventilation indicator, not a contaminant limit.'],
  ],
  about: {
    title: 'Appendix B — About This Sample',
    text: 'AtmosFlow is a screening-only IAQ assessment platform: it captures field observations and direct-reading measurements, screens them against recognized references, and assembles a consultant-grade, defensible report for review by a qualified industrial hygienist or EHS professional. It identifies risk indicators and produces prioritized follow-up — it does not make regulatory classifications or compliance determinations. This sample uses fictitious data to illustrate structure and tone. Learn more at atmosflow.net.',
  },
  photos: {
    intro: 'The photographs below are sample placeholders. A live AtmosFlow report embeds the assessor’s geotagged field photos — each tied to the zone and finding it documents (for example, the windowless conference room, the rooftop intake, and the print-room printers referenced in Sections 3 and 4).',
    items: [
      { title: 'Interior conference room (8-D)', sub: 'Windowless; logged during a six-person meeting' },
      { title: 'Rooftop fresh-air intake', sub: 'Outdoor reference / economizer station' },
      { title: 'Copy / print room (8-F)', sub: 'Laser printers; limited local exhaust' },
      { title: 'Break room (12-B)', sub: 'Shared return air; intermittent cooking' },
    ],
  },
}

const buffer = await renderReportPdf(SAMPLE_MODEL)
writeFileSync(OUT_PATH, buffer)
console.log(`Wrote ${OUT_PATH} (${buffer.length} bytes)`)
