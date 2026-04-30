#!/usr/bin/env node
/**
 * Generates public/sample-report.pdf — a deliberately-redacted excerpt of
 * a representative AtmosFlow IAQ assessment report. Used by the public
 * landing page ("See sample report" CTA) and the onboarding email
 * sequence.
 *
 * The content here is hand-curated rather than rendered from a fixture
 * because (a) the canonical Meridian Commerce Tower fixture is in TS
 * with engine-internal types, (b) a marketing-facing sample needs to be
 * legible, brief, and stylistically consistent with the brand, and (c)
 * we want to be able to ship this PDF without re-running the engine.
 *
 * Run via: node scripts/generate-sample-report-pdf.mjs
 */

import PDFDocument from 'pdfkit'
import { createWriteStream, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '..', 'public', 'sample-report.pdf')
mkdirSync(dirname(OUT_PATH), { recursive: true })

const SLATE = '#1E293B'
const ACCENT = '#0E7490'
const SOFT = '#475569'
const RULE = '#CBD5E1'

const doc = new PDFDocument({
  size: 'LETTER',
  margins: { top: 72, bottom: 72, left: 72, right: 72 },
  info: {
    Title: 'AtmosFlow — Sample Indoor Air Quality Assessment Report',
    Author: 'Prudence Safety & Environmental Consulting, LLC',
    Subject: 'Sample IAQ assessment — for evaluation use only',
  },
})
const stream = createWriteStream(OUT_PATH)
doc.pipe(stream)

const PAGE_W = 612
const CONTENT_W = PAGE_W - 144

function rule(y, color = RULE) {
  doc.save()
  doc.lineWidth(0.75).strokeColor(color)
  doc.moveTo(72, y).lineTo(72 + CONTENT_W, y).stroke()
  doc.restore()
}

function h1(text) {
  doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(20).text(text, { align: 'left' })
  doc.moveDown(0.4)
}
function h2(text) {
  doc.moveDown(0.6)
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(11).text(text.toUpperCase(), { characterSpacing: 0.8 })
  doc.moveDown(0.2)
  rule(doc.y)
  doc.moveDown(0.4)
}
function p(text, opts = {}) {
  doc.fillColor(SLATE).font('Helvetica').fontSize(10.5).text(text, { align: 'justify', lineGap: 2, ...opts })
  doc.moveDown(0.4)
}
function meta(label, value) {
  doc.fillColor(SOFT).font('Helvetica').fontSize(9).text(`${label}: `, { continued: true })
  doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(9).text(String(value))
}

// ─── Cover ─────────────────────────────────────────────────────────
doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(28).text('AtmosFlow', { align: 'center' })
doc.fillColor(SOFT).font('Helvetica').fontSize(11).text('Indoor Air Quality Assessment Report', { align: 'center' })
doc.moveDown(0.4)
doc.fillColor(SOFT).fontSize(9).text('— Sample Excerpt for Evaluation —', { align: 'center' })
doc.moveDown(2)

rule(doc.y)
doc.moveDown(0.6)
meta('Facility', 'Meridian Commerce Tower (sample, redacted)')
meta('Address', '900 Block Example Boulevard, Bethesda, MD')
meta('Assessment Date', 'March 14, 2026')
meta('Assessor', 'J. Smith, CIH, CSP')
meta('Firm', 'Prudence Safety & Environmental Consulting, LLC')
meta('Report ID', 'PSEC-IAQ-2026-0314-MCT')
doc.moveDown(0.6)
rule(doc.y)
doc.moveDown(2)

h2('Transmittal')
p('This report documents an indoor air quality (IAQ) assessment of three floors at Meridian Commerce Tower conducted on March 14, 2026. The assessment included direct-reading instrument measurements of carbon dioxide, carbon monoxide, temperature, and relative humidity, supplemented by visual inspection and occupant interviews. All measurements were captured during normal occupied-hours operation. This is a screening-level evaluation; conclusions reflect the conditions observed at the time of assessment and should be interpreted in light of the limitations stated below.')

h2('Methodology')
p('Direct-reading instrumentation: TSI Q-Trak 7575 (CO₂, CO, T, RH) — calibrated 12 days prior to assessment, within manufacturer specification. Measurements were captured at 1-minute intervals, with grab readings taken at occupied breathing-zone height (1.5 m AGL) for ≥3 minutes per location. Instrument accuracy at 1,000 ppm CO₂: ±50 ppm (manufacturer-stated). Threshold references: ASHRAE 62.1-2022, ASHRAE 55-2020, OSHA PELs (29 CFR 1910.1000), EPA NAAQS, WHO Indoor Air Quality Guidelines.')

doc.addPage()

// ─── Findings (sample one parameter) ──────────────────────────────
h1('Per-Parameter Results — Carbon Dioxide')
h2('Standards Background')
p('ASHRAE 62.1-2022 prescribes ventilation rates rather than CO₂ concentration limits. Indoor CO₂ is commonly used as an indicator of ventilation adequacy relative to occupant load: concentrations 700 ppm above outdoor ambient (typically ~420 ppm globally) suggest under-ventilation per ASHRAE’s indicator approach. OSHA does not enforce a specific PEL for indoor CO₂ at typical office concentrations; the 5,000 ppm 8-hour TWA PEL applies to industrial exposures. ACGIH TLV is 5,000 ppm 8-hour TWA, 30,000 ppm STEL.')

h2('Observations')
p('CO₂ measurements were captured in eight zones across floors 7, 8, and 12 between 09:30 and 14:45 hrs. Outdoor reference baseline (north-facing rooftop intake) averaged 432 ppm during the assessment window. Indoor measurements ranged from 612 ppm (Zone 7-A, south-facing perimeter office) to 1,247 ppm (Zone 8-D, interior windowless conference room, occupied by 6 persons during the 13:15–13:45 sample). The conference-room peak of 1,247 ppm represents 815 ppm above outdoor baseline, exceeding the ASHRAE 62.1 ventilation-adequacy indicator (~700 ppm above outdoor) by 115 ppm during the measurement window.')

h2('Range Summary')
p('Site-wide arithmetic mean: 818 ppm (n=8). Outdoor baseline: 432 ppm. Indoor-outdoor differential range: 180–815 ppm.')

h2('Confidence Tier')
p('Provisional screening level. Direct-reading instrumentation is appropriate for screening assessment and ventilation indicator-tracking; it does not substitute for laboratory-analyzed time-weighted-average sampling required for regulatory exposure determinations. The 30-minute sample window in Zone 8-D is short relative to ASHRAE’s steady-state assumption; a longer measurement (≥4 hours) is recommended to confirm.')

doc.addPage()

// ─── Recommendations ──────────────────────────────────────────────
h1('Recommended Actions')
h2('Immediate (0–7 Days)')
p('Increase outdoor air supply to Floor 8, Zone D (interior conference room) during occupied hours. Verify damper position and economizer operation through the building automation system. Consider relocating high-occupancy meetings (>4 persons) to perimeter conference rooms with operable windows or higher-capacity supply diffusers until balanced.')

h2('Short Term (7–30 Days)')
p('Conduct a CO₂-tracer ventilation survey of Floor 8 with a portable multi-gas instrument capable of 4-hour logging during normal occupancy. Cross-reference with the building’s as-built mechanical drawings to confirm Zone D meets ASHRAE 62.1 Table 6.2.2.1 ventilation requirements for Conference/Meeting space (5 cfm/person + 0.06 cfm/ft²). Re-calibrate the rooftop fresh-air station if differential pressure readings show drift > 10% from baseline.')

h2('Medium Term (30–90 Days)')
p('Add CO₂ sensors to Zones 8-D and 12-B for continuous logging through one full HVAC seasonal cycle. Establish baseline mean and 95th-percentile values for each zone. Integrate with the BAS to enable demand-controlled ventilation if occupancy varies substantially across the week. Document the as-designed vs as-installed ventilation rate in the building’s O&M records.')

h2('Limitations')
p('This assessment is screening-level. Findings are based on direct-reading instrumentation captured during a single assessment window and reflect conditions on March 14, 2026 only. No laboratory-analyzed integrated samples were collected. Occupant counts and activity levels were observed at the time of measurement; sustained higher-occupancy conditions could produce different concentration profiles. This report does not constitute a regulatory exposure determination, an OSHA compliance certification, or a medical evaluation. The CIH signing this report has reviewed all measurements and findings and asserts professional judgment on the recommendations above.')

// ─── Footer marker on last page ────────────────────────────────────
doc.moveDown(1.5)
rule(doc.y)
doc.moveDown(0.3)
doc.fillColor(SOFT).font('Helvetica-Oblique').fontSize(8.5).text('Generated by AtmosFlow — atmosiq.prudenceehs.com', { align: 'center' })
doc.fillColor(SOFT).font('Helvetica').fontSize(8.5).text('© 2026 Prudence Safety & Environmental Consulting, LLC. Sample for evaluation use only — facility identifiers redacted.', { align: 'center' })

doc.end()

stream.on('finish', () => {
  console.log(`Wrote ${OUT_PATH}`)
})
