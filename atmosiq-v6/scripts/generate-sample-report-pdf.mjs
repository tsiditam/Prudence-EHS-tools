#!/usr/bin/env node
/**
 * Generates public/sample-report.pdf — a representative, customer-facing
 * sample of an AtmosFlow screening-level IAQ assessment report. Linked from
 * the public landing page ("See sample report" CTA) and the onboarding
 * email sequence.
 *
 * The content is hand-curated (not engine-rendered) because (a) the
 * canonical fixture is TS with engine-internal types, (b) a marketing-facing
 * sample needs to be legible, self-contained, and brand-consistent, and
 * (c) we want to ship this PDF without re-running the engine.
 *
 * All data below is FICTITIOUS — a sample building, sample readings, sample
 * assessor. Positioning is screening-only throughout (no compliance
 * certification, no regulatory exposure determination, no medical claims).
 *
 * Run via: node scripts/generate-sample-report-pdf.mjs
 */

import PDFDocument from 'pdfkit'
import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '..', 'public', 'sample-report.pdf')
mkdirSync(dirname(OUT_PATH), { recursive: true })

// ─── Palette (modern consultant) ───────────────────────────────────
const INK = '#0F172A'   // slate-900 — body
const SLATE = '#1E293B' // slate-800 — headings
const SOFT = '#475569'  // slate-600 — secondary
const FAINT = '#64748B' // slate-500 — captions
const RULE = '#CBD5E1'  // slate-300 — hairlines
const ZEBRA = '#F1F5F9' // slate-100 — table stripe
const CARD = '#F8FAFC'  // slate-50  — cards
const ACCENT = '#0E7490'   // cyan-700 — brand
const ACCENT_DK = '#155E75' // cyan-800
const ACCENT_TINT = '#E0F2F7'

// Severity tiers (screening outcomes)
const SEV = {
  ok:       { label: 'Acceptable', color: '#15803D' }, // green-700
  advisory: { label: 'Advisory',   color: '#B45309' }, // amber-700
  elevated: { label: 'Elevated',   color: '#C2410C' }, // orange-700
  priority: { label: 'Priority',   color: '#B91C1C' }, // red-700
}

// ─── Fictitious assessment data ────────────────────────────────────
const REPORT = {
  facility: 'Meridian Commerce Tower (sample)',
  address: '1450 Asherton Park Drive, Suite 600, Calverton Heights, MD 20899',
  date: 'March 14, 2026',
  assessor: 'John Smith, CIH, CSP',
  firm: 'Prudence Safety & Environmental Consulting, LLC',
  reportId: 'PSEC-IAQ-2026-0314-MCT',
  floors: 'Floors 7, 8, and 12',
  instrument: 'TSI Q-Trak 7575 multi-parameter monitor + DustTrak DRX 8534',
}

// Per-zone direct-reading measurements (occupied-hours grab + short log).
const ZONES = [
  { id: '7-A',  use: 'South perimeter office',     co2: 612,  co: 0.4, t: 71.8, rh: 41, pm: 7,  tvoc: 220, sev: 'ok' },
  { id: '7-C',  use: 'Open workstations',          co2: 740,  co: 0.5, t: 72.5, rh: 43, pm: 9,  tvoc: 280, sev: 'ok' },
  { id: '8-B',  use: 'Open office',                co2: 905,  co: 0.6, t: 73.4, rh: 46, pm: 11, tvoc: 340, sev: 'ok' },
  { id: '8-D',  use: 'Interior conference (no operable window)', co2: 1247, co: 0.7, t: 74.9, rh: 51, pm: 14, tvoc: 520, sev: 'elevated' },
  { id: '8-F',  use: 'Copy / print room',          co2: 880,  co: 0.6, t: 73.1, rh: 44, pm: 18, tvoc: 610, sev: 'advisory' },
  { id: '12-A', use: 'Executive suite',            co2: 690,  co: 0.4, t: 72.0, rh: 40, pm: 6,  tvoc: 240, sev: 'ok' },
  { id: '12-B', use: 'Break room',                 co2: 1015, co: 1.1, t: 73.8, rh: 48, pm: 16, tvoc: 430, sev: 'advisory' },
  { id: '12-D', use: 'IT-room-adjacent office',    co2: 760,  co: 0.5, t: 70.2, rh: 36, pm: 8,  tvoc: 300, sev: 'ok' },
]
const OUTDOOR = { co2: 432, co: 0.3, t: 58.0, rh: 55, pm: 12, tvoc: 50 }

const mean = (k) => Math.round(ZONES.reduce((s, z) => s + z[k], 0) / ZONES.length * 10) / 10
const range = (k) => [Math.min(...ZONES.map(z => z[k])), Math.max(...ZONES.map(z => z[k]))]
const MEAN = { co2: Math.round(mean('co2')), co: mean('co'), t: mean('t'), rh: Math.round(mean('rh')), pm: Math.round(mean('pm')), tvoc: Math.round(mean('tvoc')) }
const RNG = { co2: range('co2'), co: range('co'), t: range('t'), rh: range('rh'), pm: range('pm'), tvoc: range('tvoc') }

// ─── Document ──────────────────────────────────────────────────────
const MARGIN = 64
const PAGE_W = 612
const PAGE_H = 792
const CONTENT_W = PAGE_W - MARGIN * 2
const HEADER_Y = 50
const CONTENT_TOP = 92
const BOTTOM_LIMIT = PAGE_H - MARGIN

const doc = new PDFDocument({
  size: 'LETTER',
  margins: { top: CONTENT_TOP, bottom: MARGIN, left: MARGIN, right: MARGIN },
  bufferPages: true,
  info: {
    Title: 'AtmosFlow — Sample Indoor Air Quality Assessment Report',
    Author: REPORT.firm,
    Subject: 'Sample screening-level IAQ assessment — for evaluation use only',
    Keywords: 'IAQ, indoor air quality, screening assessment, sample report',
  },
})
doc.pipe(createWriteStream(OUT_PATH))

// pdfkit 0.18 buffers pages (constructor option) and supports switchToPage,
// but doesn't expose bufferPages(). The initial page is created during
// construction (before this listener attaches), so total = counted + 1.
let addedPages = 0
doc.on('pageAdded', () => { addedPages++ })

// ─── Primitives ────────────────────────────────────────────────────
function hr(y = doc.y, color = RULE, w = 0.75) {
  doc.save().lineWidth(w).strokeColor(color)
    .moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).stroke().restore()
}
function ensure(h) {
  if (doc.y + h > BOTTOM_LIMIT) doc.addPage()
}
function h1(text) {
  ensure(60)
  doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(17).text(text, { width: CONTENT_W })
  doc.moveDown(0.5)
}
function h2(text) {
  ensure(46)
  doc.moveDown(0.3)
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(10.5).text(text.toUpperCase(), { characterSpacing: 0.8, width: CONTENT_W })
  doc.moveDown(0.25)
  hr(doc.y)
  doc.moveDown(0.45)
}
function h3(text) {
  ensure(34)
  doc.fillColor(ACCENT_DK).font('Helvetica-Bold').fontSize(10).text(text, { width: CONTENT_W })
  doc.moveDown(0.2)
}
function p(text, opts = {}) {
  doc.fillColor(INK).font('Helvetica').fontSize(10).text(text, { align: 'justify', lineGap: 2.5, width: CONTENT_W, ...opts })
  doc.moveDown(0.45)
}
function bullets(items) {
  doc.fillColor(INK).font('Helvetica').fontSize(10)
  items.forEach((it) => {
    ensure(20)
    doc.text('•  ', MARGIN, doc.y, { continued: true, width: CONTENT_W })
      .text(it, { lineGap: 2, width: CONTENT_W })
    doc.moveDown(0.25)
  })
  doc.moveDown(0.25)
}

// Generic table with dynamic row heights (cells wrap; row grows to fit).
// columns: [{ label, key|render, width, align }]. rows: data objects.
function table(columns, rows, opts = {}) {
  const fs = opts.fontSize || 8.5
  const padX = 6, padY = 5
  const minRowH = opts.rowH || (fs + padY * 2 + 1)
  const totalW = columns.reduce((s, c) => s + c.width, 0)
  const scale = CONTENT_W / totalW
  const widths = columns.map(c => c.width * scale)
  const cellOf = (c, r) => {
    const cell = c.render ? c.render(r) : r[c.key]
    if (cell && typeof cell === 'object') return { t: cell.t == null ? '' : String(cell.t), color: cell.color || INK, bold: !!cell.bold }
    return { t: cell == null ? '' : String(cell), color: INK, bold: false }
  }

  // Header height (labels may be multi-line)
  doc.font('Helvetica-Bold').fontSize(fs)
  const headH = Math.max(minRowH, ...columns.map((c, i) =>
    doc.heightOfString(c.label, { width: widths[i] - padX * 2 }))) + 8

  const drawHead = () => {
    const y = doc.y
    doc.save().rect(MARGIN, y, CONTENT_W, headH).fill(opts.headerFill || ACCENT).restore()
    let x = MARGIN
    columns.forEach((c, i) => {
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(fs)
        .text(c.label, x + padX, y + 4, { width: widths[i] - padX * 2, align: c.align || 'left' })
      x += widths[i]
    })
    doc.y = y + headH
  }

  ensure(headH + minRowH)
  drawHead()
  rows.forEach((r, ri) => {
    const cells = columns.map(c => cellOf(c, r))
    // Row height = tallest cell
    const rowH = Math.max(minRowH, ...cells.map((cell, i) => {
      doc.font(cell.bold || r.__bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs)
      return doc.heightOfString(cell.t, { width: widths[i] - padX * 2 }) + padY * 2
    }))
    if (doc.y + rowH > BOTTOM_LIMIT) { doc.addPage(); drawHead() }
    const y = doc.y
    if (r.__bold) doc.save().rect(MARGIN, y, CONTENT_W, rowH).fill(ACCENT_TINT).restore()
    else if (ri % 2 === 1) doc.save().rect(MARGIN, y, CONTENT_W, rowH).fill(ZEBRA).restore()
    let x = MARGIN
    columns.forEach((c, i) => {
      doc.fillColor(cells[i].color).font(cells[i].bold || r.__bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs)
        .text(cells[i].t, x + padX, y + padY, { width: widths[i] - padX * 2, align: c.align || 'left' })
      x += widths[i]
    })
    doc.y = y + rowH
    hr(doc.y, RULE, 0.4)
  })
  doc.moveDown(0.6)
}

// Severity chip (inline, for legends / summaries)
function chip(label, color, x, y, w = 70) {
  doc.save().roundedRect(x, y, w, 14, 7).fill(color)
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5)
    .text(label.toUpperCase(), x, y + 3.6, { width: w, align: 'center', characterSpacing: 0.5, lineBreak: false })
  doc.restore()
}

// ─── COVER (page 0) ────────────────────────────────────────────────
doc.save().rect(0, 0, PAGE_W, 168).fill(ACCENT).restore()
doc.save().rect(0, 168, PAGE_W, 5).fill(ACCENT_DK).restore()
doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(30).text('AtmosFlow', MARGIN, 52)
doc.fillColor(ACCENT_TINT).font('Helvetica').fontSize(12.5).text('Indoor Air Quality Assessment', MARGIN, 94)
doc.fillColor(ACCENT_TINT).font('Helvetica').fontSize(9).text('by Prudence Safety & Environmental Consulting, LLC', MARGIN, 116)

doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(23).text('Screening-Level IAQ Assessment Report', MARGIN, 214, { width: CONTENT_W })
doc.fillColor(SOFT).font('Helvetica').fontSize(12).text('Direct-reading evaluation of carbon dioxide, comfort, and particulate / VOC indicators', MARGIN, doc.y + 4, { width: CONTENT_W })
doc.moveDown(0.5)
chip('Sample — Evaluation Use Only', FAINT, MARGIN, doc.y + 4, 196)

// Identity card
const cardY = 330
doc.save().roundedRect(MARGIN, cardY, CONTENT_W, 168, 9).fillAndStroke(CARD, RULE).restore()
let my = cardY + 20
const metaRow = (label, value) => {
  doc.fillColor(FAINT).font('Helvetica').fontSize(9).text(label.toUpperCase(), MARGIN + 22, my, { width: 140, characterSpacing: 0.5, lineBreak: false })
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(value, MARGIN + 170, my - 1, { width: CONTENT_W - 192, lineBreak: false })
  my += 24
}
metaRow('Facility', REPORT.facility)
metaRow('Address', REPORT.address)
metaRow('Scope', REPORT.floors)
metaRow('Assessment date', REPORT.date)
metaRow('Assessor of record', REPORT.assessor)
metaRow('Report ID', REPORT.reportId)

doc.fillColor(FAINT).font('Helvetica-Oblique').fontSize(8.5).text(
  'This document is a fictitious sample produced to illustrate AtmosFlow report structure and tone. All facility identifiers, measurements, and personnel are invented and do not describe a real building or assessment.',
  MARGIN, 540, { width: CONTENT_W, align: 'center', lineGap: 1.5 },
)
doc.save().rect(MARGIN, 596, CONTENT_W, 0.75).fill(RULE).restore()
doc.fillColor(SOFT).font('Helvetica').fontSize(8.5).text('Screening-level evaluation — not a regulatory exposure determination, OSHA compliance certification, or medical evaluation.', MARGIN, 608, { width: CONTENT_W, align: 'center' })

// ─── EXECUTIVE SUMMARY ─────────────────────────────────────────────
doc.addPage()
h1('Executive Summary')
p(`On ${REPORT.date}, ${REPORT.firm} conducted a screening-level indoor air quality (IAQ) assessment of ${REPORT.floors.toLowerCase()} at ${REPORT.facility}. The assessment combined direct-reading instrument measurements with visual inspection and occupant interviews across eight representative zones during normal occupied-hours operation. Its purpose is to characterize ventilation adequacy, thermal comfort, and common airborne indicators, and to prioritize follow-up where conditions warrant. This is a screening evaluation; results reflect conditions observed during the assessment window and are interpreted in light of the limitations in Section 7.`)

h2('Findings at a Glance')
table(
  [
    { label: 'Parameter', width: 118, render: r => ({ t: r.p, bold: true }) },
    { label: 'Site range', width: 96, render: r => r.r },
    { label: 'Reference basis', width: 150, render: r => r.b },
    { label: 'Screening outcome', width: 96, render: r => ({ t: SEV[r.s].label, color: SEV[r.s].color, bold: true }) },
  ],
  [
    { p: 'Carbon dioxide (CO2)', r: `${RNG.co2[0]}–${RNG.co2[1]} ppm`, b: 'ASHRAE 62.1 ventilation indicator', s: 'elevated' },
    { p: 'Carbon monoxide (CO)', r: `${RNG.co[0]}–${RNG.co[1]} ppm`, b: 'US EPA NAAQS 9 ppm (8-hr)', s: 'ok' },
    { p: 'Temperature', r: `${RNG.t[0]}–${RNG.t[1]} °F`, b: 'ASHRAE 55 comfort envelope', s: 'ok' },
    { p: 'Relative humidity', r: `${RNG.rh[0]}–${RNG.rh[1]} %`, b: 'ASHRAE 55 (30–60% target)', s: 'ok' },
    { p: 'Fine particulate (PM2.5)', r: `${RNG.pm[0]}–${RNG.pm[1]} µg/m³`, b: 'US EPA NAAQS 35 µg/m³ (24-hr)', s: 'advisory' },
    { p: 'Total VOCs (TVOC)', r: `${RNG.tvoc[0]}–${RNG.tvoc[1]} µg/m³`, b: 'Mølhave (1991) advisory tiers', s: 'advisory' },
  ],
  { fontSize: 9, rowH: 26 },
)

h2('Severity Legend')
{
  const ly = doc.y
  chip(SEV.ok.label, SEV.ok.color, MARGIN, ly, 86)
  chip(SEV.advisory.label, SEV.advisory.color, MARGIN + 96, ly, 86)
  chip(SEV.elevated.label, SEV.elevated.color, MARGIN + 192, ly, 86)
  chip(SEV.priority.label, SEV.priority.color, MARGIN + 288, ly, 86)
  doc.y = ly + 22
  doc.fillColor(FAINT).font('Helvetica').fontSize(8.5).text(
    'Acceptable: within recognized screening references. Advisory: monitor / investigate source. Elevated: corrective action recommended. Priority: prompt action recommended.',
    MARGIN, doc.y, { width: CONTENT_W, lineGap: 1.5 },
  )
  doc.moveDown(0.6)
}

h2('Overall Screening Statement')
p(`Most zones presented acceptable ventilation, comfort, and air-quality indicators. One interior conference room (Zone 8-D) showed a carbon-dioxide concentration consistent with under-ventilation relative to occupant load during a high-occupancy meeting, and two zones (8-F copy/print room and 12-B break room) showed advisory-tier particulate and VOC readings attributable to identifiable local sources. No carbon-monoxide, thermal, or humidity conditions outside the screening references were observed. Recommended actions in Section 5 are scoped to ventilation balancing on Floor 8 and short-term source control / monitoring elsewhere.`)

// ─── 1. SCOPE & SITE ───────────────────────────────────────────────
doc.addPage()
h1('1. Scope & Site Description')
p(`The assessment covered ${REPORT.floors.toLowerCase()} of ${REPORT.facility}, a multi-tenant Class-A office building served by a central variable-air-volume (VAV) HVAC system with rooftop air handlers and perimeter VAV boxes. Eight zones were selected to represent a cross-section of use types: perimeter and interior offices, open workstations, a conference room, a copy/print room, an executive suite, and a break room. Occupancy at the time of assessment ranged from 1 to 6 persons per zone. Outdoor conditions were mild and dry (≈58 °F, 55% RH), with light wind from the northwest.`)
p('The objective was a screening characterization of indoor air quality indicators to (a) confirm whether observed conditions fall within recognized comfort and ventilation references, (b) identify any zones warranting follow-up, and (c) provide a defensible, prioritized action list. The assessment did not include integrated time-weighted-average sampling, microbial sampling, or destructive investigation.')

h2('2. Methodology & Instrumentation')
h3('Direct-reading instrumentation')
bullets([
  `${REPORT.instrument}. CO2, CO, temperature, and relative humidity captured with the Q-Trak; fine particulate (PM2.5) captured with the DustTrak DRX.`,
  'Calibration: both instruments bump-checked the morning of the assessment and last factory-calibrated 12 days prior, within manufacturer specification. CO2 accuracy at 1,000 ppm: ±50 ppm (manufacturer-stated). PM2.5 zeroed with a HEPA filter immediately before use.',
  'Measurement protocol: grab readings at occupied breathing-zone height (1.5 m AGL) held at least 3 minutes per location, with a short continuous log (1-minute interval) in the conference room during an occupied meeting.',
])
h3('Reference framework')
p('Outcomes are screened against recognized consensus and regulatory references: ASHRAE 62.1-2022 (ventilation, used as an indicator basis for CO2 — not a CO2 contaminant limit), ASHRAE 55-2020 (thermal comfort), US EPA NAAQS (CO and PM2.5), OSHA PELs (29 CFR 1910.1000), and the Mølhave (1991) advisory tiers for TVOC. References are used to contextualize screening readings, not to render compliance determinations.')

// ─── 3. RESULTS ────────────────────────────────────────────────────
doc.addPage()
h1('3. Measurement Results')
p('The table below summarizes representative occupied-hours readings by zone. The outdoor reference and site arithmetic mean are shown for context. Values are direct-reading grab measurements unless otherwise noted.')

const sevCell = (z) => ({ t: SEV[z.sev].label, color: SEV[z.sev].color, bold: true })
table(
  [
    { label: 'Zone', width: 52, key: 'id' },
    { label: 'Use', width: 120, key: 'use' },
    { label: 'CO2\nppm', width: 50, align: 'right', render: z => String(z.co2) },
    { label: 'CO\nppm', width: 42, align: 'right', render: z => z.co.toFixed(1) },
    { label: 'T\n°F', width: 42, align: 'right', render: z => z.t.toFixed(1) },
    { label: 'RH\n%', width: 38, align: 'right', render: z => String(z.rh) },
    { label: 'PM2.5\nµg/m³', width: 48, align: 'right', render: z => String(z.pm) },
    { label: 'TVOC\nµg/m³', width: 50, align: 'right', render: z => String(z.tvoc) },
    { label: 'Outcome', width: 60, render: sevCell },
  ],
  [
    { id: 'Outdoor', use: 'Rooftop intake (reference)', co2: OUTDOOR.co2, co: OUTDOOR.co, t: OUTDOOR.t, rh: OUTDOOR.rh, pm: OUTDOOR.pm, tvoc: OUTDOOR.tvoc, sev: 'ok' },
    ...ZONES,
    { id: 'Site mean', use: '', co2: MEAN.co2, co: MEAN.co, t: MEAN.t, rh: MEAN.rh, pm: MEAN.pm, tvoc: MEAN.tvoc, sev: 'ok', __bold: true },
  ].map(z => ({ ...z })),
  { fontSize: 8, rowH: 22 },
)
doc.fillColor(FAINT).font('Helvetica').fontSize(8).text('Site mean is the arithmetic mean of the eight occupied zones (outdoor reference excluded). Outcome reflects the zone’s governing parameter.', MARGIN, doc.y, { width: CONTENT_W, lineGap: 1.5 })
doc.moveDown(0.8)

h2('Per-Parameter Interpretation')
h3('Carbon dioxide (CO2) — ventilation indicator')
p(`Outdoor baseline averaged ${OUTDOOR.co2} ppm. Indoor concentrations ranged ${RNG.co2[0]}–${RNG.co2[1]} ppm (site mean ${MEAN.co2} ppm). ASHRAE 62.1 prescribes ventilation rates rather than a CO2 limit; an indoor-to-outdoor differential above roughly 700 ppm is commonly used as an indicator of under-ventilation relative to occupant load. The conference-room peak of ${RNG.co2[1]} ppm in Zone 8-D — captured during a six-person meeting — represents ${RNG.co2[1] - OUTDOOR.co2} ppm above outdoor baseline, exceeding the indicator by ~115 ppm during the measurement window. All other zones remained within the indicator range.`)

h3('Carbon monoxide (CO)')
p(`CO was uniformly low (${RNG.co[0]}–${RNG.co[1]} ppm) and well below the US EPA NAAQS (9 ppm, 8-hour) and the OSHA PEL (50 ppm, 8-hour TWA). The slightly higher break-room reading (Zone 12-B, 1.1 ppm) is consistent with intermittent toaster/appliance use and is not of concern at this level.`)

h3('Thermal comfort — temperature & relative humidity')
p(`Temperatures (${RNG.t[0]}–${RNG.t[1]} °F) and relative humidity (${RNG.rh[0]}–${RNG.rh[1]}%) fell within the ASHRAE 55 comfort envelope for the season and clothing assumptions. The interior conference room trended to the warm/humid edge during occupancy, consistent with the elevated CO2 and reduced air exchange noted above.`)

h3('Fine particulate (PM2.5)')
p(`PM2.5 ranged ${RNG.pm[0]}–${RNG.pm[1]} µg/m³ (site mean ${MEAN.pm} µg/m³), below the US EPA NAAQS 24-hour standard of 35 µg/m³. The copy/print room (Zone 8-F, 18 µg/m³) and break room (Zone 12-B, 16 µg/m³) were advisory-tier relative to quieter office zones, attributable to laser-printer and cooking activity respectively. These are local, intermittent sources rather than a building-wide condition.`)

h3('Total volatile organic compounds (TVOC)')
p(`TVOC ranged ${RNG.tvoc[0]}–${RNG.tvoc[1]} µg/m³ (isobutylene-equivalent; site mean ${MEAN.tvoc} µg/m³). Per the Mølhave (1991) advisory framework, the copy/print room (610 µg/m³) and conference room (520 µg/m³) fall in the lower "multifactorial exposure range," where irritation or comfort complaints become possible in sensitive individuals but no specific health effect is established. TVOC by photoionization is a non-specific comfort indicator only; it does not identify individual compounds or establish toxicological significance.`)

// ─── 4. FINDINGS ───────────────────────────────────────────────────
doc.addPage()
h1('4. Findings & Interpretation')
p('Findings are screening observations, ranked by recommended response. Each is tied to the zone and the governing indicator. No finding constitutes a regulatory exposure determination.')

const FINDINGS = [
  { z: '8-D', sev: 'elevated', f: 'CO2 of 1,247 ppm during a six-person meeting indicates under-ventilation of the interior conference room relative to occupant load.' },
  { z: '8-F', sev: 'advisory', f: 'PM2.5 (18 µg/m³) and TVOC (610 µg/m³) elevated relative to office baseline, consistent with laser-printer emissions and limited local exhaust.' },
  { z: '12-B', sev: 'advisory', f: 'CO2 (1,015 ppm) and PM2.5 (16 µg/m³) elevated during break/meal periods; intermittent cooking source with shared return air.' },
  { z: '8-D', sev: 'advisory', f: 'TVOC (520 µg/m³) in the lower multifactorial range, co-located with the ventilation finding above.' },
  { z: 'All others', sev: 'ok', f: 'Ventilation, comfort, CO, particulate, and VOC indicators within recognized screening references at the time of assessment.' },
]
table(
  [
    { label: 'Zone', width: 70, key: 'z' },
    { label: 'Severity', width: 78, render: r => ({ t: SEV[r.sev].label, color: SEV[r.sev].color, bold: true }) },
    { label: 'Screening finding', width: 320, key: 'f' },
  ],
  FINDINGS,
  { fontSize: 9, rowH: 40 },
)

h2('Probable Contributing Factors')
bullets([
  'Interior zones on Floor 8 share a common VAV branch; balancing appears weighted toward perimeter loads, leaving the windowless conference room short on outdoor-air delivery at peak occupancy.',
  'Local emission sources (laser printing, food preparation) are served by general return air rather than dedicated local exhaust, allowing transient particulate / VOC excursions to mix into adjacent spaces.',
  'No evidence of water intrusion, visible microbial growth, or combustion spillage was observed during the walkthrough.',
])

// ─── 5. RECOMMENDATIONS ────────────────────────────────────────────
doc.addPage()
h1('5. Recommended Actions')
h2('Immediate (0–7 days)')
bullets([
  'Increase outdoor-air supply to Floor 8, Zone 8-D during occupied hours. Verify VAV damper position and economizer operation through the building automation system (BAS).',
  'Until balanced, relocate meetings of more than four persons to perimeter conference rooms with higher supply capacity.',
  'Confirm the copy/print room (8-F) door-undercut and any transfer-air path; if a local exhaust fan is present, verify it runs during business hours.',
])
h2('Short term (7–30 days)')
bullets([
  'Conduct a CO2-tracer ventilation survey of Floor 8 with a 4-hour logging instrument during normal occupancy. Cross-reference against as-built mechanical drawings to confirm Zone 8-D meets ASHRAE 62.1 Table 6.2.2.1 for Conference/Meeting space (5 cfm/person + 0.06 cfm/ft²).',
  'Re-balance the Floor 8 interior VAV branch; re-measure CO2 and supply airflow after adjustment.',
  'Evaluate adding dedicated local exhaust or a standalone HEPA unit for the copy/print room.',
])
h2('Medium term (30–90 days)')
bullets([
  'Add continuous CO2 sensors to Zones 8-D and 12-B and log through one full HVAC seasonal cycle; establish per-zone baseline mean and 95th-percentile values.',
  'Integrate the new sensors with the BAS to enable demand-controlled ventilation where occupancy varies substantially across the week.',
  'Document as-designed versus as-installed ventilation rates in the building O&M records, and schedule a follow-up screening after corrective work.',
])

// ─── 6/7/8 ─────────────────────────────────────────────────────────
doc.addPage()
h1('6. Quality Assurance / Quality Control')
bullets([
  'Instruments bump-checked the morning of the assessment; factory calibration within the prior 12 days and within manufacturer specification.',
  'PM2.5 monitor zeroed against a HEPA filter immediately before fieldwork; CO2 verified against fresh outdoor air at the rooftop intake.',
  'Grab readings held to stabilization (≥3 minutes) before recording; the conference-room reading captured during a representative occupied meeting.',
  'All readings and field notes were recorded in AtmosFlow and reviewed against the reference framework by the assessor of record.',
])

h2('7. Limitations')
p('This assessment is screening-level. Findings are based on direct-reading instrumentation captured during a single assessment window and reflect conditions on the assessment date only. No laboratory-analyzed integrated samples, microbial sampling, or destructive investigation were performed. Occupant counts and activity levels were observed at the time of measurement; sustained higher-occupancy or different operating conditions could produce different concentration profiles. Direct-reading TVOC and PM2.5 are non-specific comfort indicators and do not identify individual compounds or establish toxicological significance. This report does not constitute a regulatory exposure determination, an OSHA compliance certification, or a medical evaluation, and should not be relied upon as such.')

h2('8. Professional Review & Signature')
p('The undersigned has reviewed the measurements, findings, and recommendations in this report and asserts professional judgment on the screening interpretations and the prioritized actions in Section 5.')
doc.moveDown(1.4)
{
  const sy = doc.y
  doc.save().lineWidth(0.75).strokeColor(SLATE).moveTo(MARGIN, sy).lineTo(MARGIN + 230, sy).stroke().restore()
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10.5).text(REPORT.assessor, MARGIN, sy + 6)
  doc.fillColor(SOFT).font('Helvetica').fontSize(9).text('Certified Industrial Hygienist · Certified Safety Professional', MARGIN, doc.y + 1)
  doc.fillColor(SOFT).font('Helvetica').fontSize(9).text(REPORT.firm, MARGIN, doc.y + 1)
  doc.fillColor(FAINT).font('Helvetica').fontSize(9).text(`Report ID ${REPORT.reportId}  ·  ${REPORT.date}`, MARGIN, doc.y + 3)
}

// ─── APPENDICES ────────────────────────────────────────────────────
doc.addPage()
h1('Appendix A — Standards & References')
const REFS = [
  ['ASHRAE 62.1-2022', 'Ventilation and Acceptable Indoor Air Quality. Used as the ventilation-indicator basis for CO2 interpretation (prescribes airflow, not a CO2 limit).'],
  ['ASHRAE 55-2020', 'Thermal Environmental Conditions for Human Occupancy. Comfort envelope for temperature and relative humidity.'],
  ['US EPA NAAQS (40 CFR 50)', 'National Ambient Air Quality Standards. CO 9 ppm (8-hr); PM2.5 35 µg/m³ (24-hr).'],
  ['OSHA 29 CFR 1910.1000', 'Permissible Exposure Limits. CO PEL 50 ppm (8-hr TWA); CO2 PEL 5,000 ppm (8-hr TWA, industrial context).'],
  ['Mølhave, L. (1991)', 'Volatile organic compounds, indoor air quality and health. Advisory TVOC comfort/irritation tiers; non-specific indicator only.'],
  ['Persily, A. (2021)', 'Development and application of an indoor CO2 metric. Clarifies CO2 as a ventilation indicator, not a contaminant limit.'],
]
table(
  [
    { label: 'Reference', width: 150, render: r => ({ t: r[0], bold: true }) },
    { label: 'Basis of use', width: 350, render: r => r[1] },
  ],
  REFS,
  { fontSize: 8.5, rowH: 38 },
)

doc.moveDown(0.5)
h2('Appendix B — About This Sample')
p('AtmosFlow is a screening-only IAQ assessment platform: it captures field observations and direct-reading measurements, screens them against recognized references, and assembles a consultant-grade, defensible report for review by a qualified industrial hygienist or EHS professional. It identifies risk indicators and produces prioritized follow-up — it does not make regulatory classifications or compliance determinations. This sample uses fictitious data to illustrate structure and tone. Learn more at atmosflow.net.')

// ─── Running header / footer (skip cover) ──────────────────────────
const totalPages = addedPages + 1
for (let i = 1; i < totalPages; i++) {
  doc.switchToPage(i)
  // header
  doc.save()
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(8.5).text('AtmosFlow', MARGIN, HEADER_Y, { lineBreak: false, continued: true })
    .fillColor(FAINT).font('Helvetica').text('  ·  Indoor Air Quality Assessment', { lineBreak: false })
  doc.fillColor(FAINT).font('Helvetica').fontSize(8).text('Sample — Evaluation Use Only', MARGIN, HEADER_Y, { width: CONTENT_W, align: 'right', lineBreak: false })
  doc.lineWidth(0.5).strokeColor(RULE).moveTo(MARGIN, HEADER_Y + 16).lineTo(MARGIN + CONTENT_W, HEADER_Y + 16).stroke()
  // footer
  const fy = PAGE_H - 44
  doc.lineWidth(0.5).strokeColor(RULE).moveTo(MARGIN, fy).lineTo(MARGIN + CONTENT_W, fy).stroke()
  doc.fillColor(FAINT).font('Helvetica').fontSize(7.5).text(`${REPORT.reportId}  ·  Confidential sample — © 2026 ${REPORT.firm}`, MARGIN, fy + 6, { lineBreak: false })
  doc.fillColor(FAINT).font('Helvetica').fontSize(7.5).text(`Page ${i + 1} of ${totalPages}`, MARGIN, fy + 6, { width: CONTENT_W, align: 'right', lineBreak: false })
  doc.restore()
}

doc.flushPages()
doc.end()
console.log(`Wrote ${OUT_PATH} (${totalPages} pages)`)
