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
 * Page chrome (running header + "Page X of N" footer) is drawn live via the
 * pdfkit `pageAdded` event rather than the buffered-page / switchToPage API,
 * which appends blank pages in pdfkit 0.18. The total page count for the
 * footer comes from a cheap first pass (the layout is deterministic, so both
 * passes paginate identically).
 *
 * Run via: node scripts/generate-sample-report-pdf.mjs
 */

import PDFDocument from 'pdfkit'
import { createWriteStream, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '..', 'public', 'sample-report.pdf')
mkdirSync(dirname(OUT_PATH), { recursive: true })

// ─── Palette (modern consultant) ───────────────────────────────────
const INK = '#0F172A'
const SLATE = '#1E293B'
const SOFT = '#475569'
const FAINT = '#64748B'
const RULE = '#CBD5E1'
const ZEBRA = '#F1F5F9'
const CARD = '#F8FAFC'
const ACCENT = '#0E7490'
const ACCENT_DK = '#155E75'
const ACCENT_TINT = '#E0F2F7'

const SEV = {
  ok:       { label: 'Acceptable', color: '#15803D' },
  advisory: { label: 'Advisory',   color: '#B45309' },
  elevated: { label: 'Elevated',   color: '#C2410C' },
  priority: { label: 'Priority',   color: '#B91C1C' },
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

// Continuous 1-min log captured in Zone 8-D during a six-person meeting —
// the series AtmosFlow Logger Studio charts (CO2, temperature, RH). The
// occupied window (meeting) is indices OCC_WINDOW for occupancy shading.
// Fictitious.
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
const OCC_WINDOW = [2, 11] // indices ≈ 13:15–13:45 (meeting occupied)
const CO2_ADVISORY = 1000  // STD.v.co2.con — ASHRAE 62.1 indoor advisory (ppm)

// Site photographs — sample placeholders (a live report embeds field photos).
const PHOTOS = [
  { title: 'Interior conference room (8-D)', sub: 'Windowless; logged during a six-person meeting' },
  { title: 'Rooftop fresh-air intake', sub: 'Outdoor reference / economizer station' },
  { title: 'Copy / print room (8-F)', sub: 'Laser printers; limited local exhaust' },
  { title: 'Break room (12-B)', sub: 'Shared return air; intermittent cooking' },
]

const mean = (k) => Math.round(ZONES.reduce((s, z) => s + z[k], 0) / ZONES.length * 10) / 10
const range = (k) => [Math.min(...ZONES.map(z => z[k])), Math.max(...ZONES.map(z => z[k]))]
const MEAN = { co2: Math.round(mean('co2')), co: mean('co'), t: mean('t'), rh: Math.round(mean('rh')), pm: Math.round(mean('pm')), tvoc: Math.round(mean('tvoc')) }
const RNG = { co2: range('co2'), co: range('co'), t: range('t'), rh: range('rh'), pm: range('pm'), tvoc: range('tvoc') }

// ─── Geometry ──────────────────────────────────────────────────────
const MARGIN = 64
const PAGE_W = 612
const PAGE_H = 792
const CONTENT_W = PAGE_W - MARGIN * 2
const HEADER_Y = 50
const CONTENT_TOP = 92
const BOTTOM_LIMIT = PAGE_H - MARGIN

// Module-level handle so the helpers below close over the "current" doc;
// render() reassigns it for each pass.
let doc
let pageNum = 1
let TOTAL = 0

// ─── Primitives (operate on the current `doc`) ─────────────────────
function hr(y = doc.y, color = RULE, w = 0.75) {
  doc.save().lineWidth(w).strokeColor(color).moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).stroke().restore()
}
function ensure(h) { if (doc.y + h > BOTTOM_LIMIT) doc.addPage() }
function h1(text) {
  ensure(60)
  doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(17).text(text, MARGIN, doc.y, { width: CONTENT_W })
  doc.moveDown(0.5)
}
function h2(text) {
  ensure(46)
  doc.moveDown(0.3)
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(10.5).text(text.toUpperCase(), MARGIN, doc.y, { characterSpacing: 0.8, width: CONTENT_W })
  doc.moveDown(0.25)
  hr(doc.y)
  doc.moveDown(0.45)
}
function h3(text) {
  ensure(34)
  doc.fillColor(ACCENT_DK).font('Helvetica-Bold').fontSize(10).text(text, MARGIN, doc.y, { width: CONTENT_W })
  doc.moveDown(0.2)
}
function p(text, opts = {}) {
  doc.fillColor(INK).font('Helvetica').fontSize(10).text(text, MARGIN, doc.y, { align: 'justify', lineGap: 2.5, width: CONTENT_W, ...opts })
  doc.moveDown(0.45)
}
function bullets(items) {
  items.forEach((it) => {
    ensure(22)
    doc.fillColor(INK).font('Helvetica').fontSize(10)
      .text('•  ', MARGIN, doc.y, { continued: true, width: CONTENT_W })
      .text(it, { lineGap: 2, width: CONTENT_W })
    doc.moveDown(0.3)
  })
  doc.moveDown(0.2)
}

// Table with dynamic row heights (cells wrap; row grows to fit).
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
  doc.font('Helvetica-Bold').fontSize(fs)
  const headH = Math.max(minRowH, ...columns.map((c, i) => doc.heightOfString(c.label, { width: widths[i] - padX * 2 }))) + 8
  const drawHead = () => {
    const y = doc.y
    doc.save().rect(MARGIN, y, CONTENT_W, headH).fill(opts.headerFill || ACCENT).restore()
    let x = MARGIN
    columns.forEach((c, i) => {
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(fs).text(c.label, x + padX, y + 4, { width: widths[i] - padX * 2, align: c.align || 'left' })
      x += widths[i]
    })
    doc.y = y + headH
  }
  ensure(headH + minRowH)
  drawHead()
  rows.forEach((r, ri) => {
    const cells = columns.map(c => cellOf(c, r))
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
  // Cells leave doc.x at the last column's offset; reset so following
  // headings / paragraphs start at the left margin (not drifting right).
  doc.x = MARGIN
  doc.moveDown(0.6)
}

function chip(label, color, x, y, w = 70) {
  doc.save().roundedRect(x, y, w, 14, 7).fill(color)
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5).text(label.toUpperCase(), x, y + 3.6, { width: w, align: 'center', characterSpacing: 0.5, lineBreak: false })
  doc.restore()
}

// ─── Figures: charts, floor plan, photo placeholders ───────────────
function ensureFig(h) { if (doc.y + h > BOTTOM_LIMIT) doc.addPage() }
function figTitle(t) {
  doc.fillColor(ACCENT_DK).font('Helvetica-Bold').fontSize(9.5).text(t, MARGIN, doc.y, { width: CONTENT_W })
  doc.moveDown(0.3)
}
function figCaption(t) {
  doc.moveDown(0.2)
  doc.fillColor(FAINT).font('Helvetica-Oblique').fontSize(8.5).text(t, MARGIN, doc.y, { width: CONTENT_W, lineGap: 1.5 })
  doc.x = MARGIN
  doc.moveDown(0.7)
}

// Logger Studio chart palette + conventions, mirrored from
// src/components/sensor/SensorCharts.jsx (Recharts) rendered in the LIGHT
// report palette: per-parameter series colors, monotone line (no dots, no
// area fill), horizontal-only grid, unit-only Y axis, a dashed advisory
// reference line labelled with its source standard, and occupancy shading.
const SERIES = { co2: '#0E9FB8', temp: '#EA7A2B', rh: '#2563EB', pm25: '#7C3AED', tvoc: '#059669', co: '#CA8A04' }
const OCC_FILL = '#10B981'

function metaLine(t) {
  doc.fillColor(FAINT).font('Helvetica').fontSize(8.5).text(t, MARGIN, doc.y, { width: CONTENT_W, lineGap: 1.5 })
  doc.x = MARGIN
  doc.moveDown(0.35)
}

// Single-parameter timeline (e.g. "CO2 Over Time").
function loggerLineChart({ points, valueKey, color, yMin, yMax, yTicks = 4, unit, refY, refLabel, occ, xEvery = 3, height = 196 }) {
  ensureFig(height + 18)
  const top = doc.y
  const axisL = MARGIN + 46, axisR = MARGIN + CONTENT_W
  const plotTop = top + 14, plotBot = top + height - 20
  const plotH = plotBot - plotTop, plotW = axisR - axisL
  const yToPix = v => plotBot - ((v - yMin) / (yMax - yMin)) * plotH
  const xToPix = i => axisL + (i / (points.length - 1)) * plotW
  doc.save()
  // occupancy band (behind everything)
  if (occ) { doc.rect(xToPix(occ[0]), plotTop, xToPix(occ[1]) - xToPix(occ[0]), plotH).fillColor(OCC_FILL).fillOpacity(0.13).fill(); doc.fillOpacity(1) }
  // horizontal grid + left tick labels
  for (let g = 0; g <= yTicks; g++) {
    const val = yMin + (yMax - yMin) * g / yTicks, yy = yToPix(val)
    doc.lineWidth(0.4).strokeColor(RULE).strokeOpacity(0.6).moveTo(axisL, yy).lineTo(axisR, yy).stroke().strokeOpacity(1)
    doc.fillColor(SOFT).font('Helvetica').fontSize(7).text(String(Math.round(val)), MARGIN, yy - 4, { width: 40, align: 'right', lineBreak: false })
  }
  // unit (top of Y axis)
  doc.fillColor(SOFT).font('Helvetica-Bold').fontSize(7).text(unit, MARGIN, plotTop - 11, { width: 40, align: 'right', lineBreak: false })
  // dashed advisory reference line, labelled with its standard
  if (refY != null) {
    const ty = yToPix(refY)
    doc.dash(3, { space: 2 }).lineWidth(0.9).strokeColor(color).strokeOpacity(0.75).moveTo(axisL, ty).lineTo(axisR, ty).stroke().undash().strokeOpacity(1)
    doc.fillColor(color).font('Helvetica').fontSize(7).text(refLabel, axisR - 200, ty - 9, { width: 198, align: 'right', lineBreak: false })
  }
  // series line (monotone, 2px, no dots/no fill)
  doc.lineWidth(2).strokeColor(color)
  points.forEach((pt, i) => { const X = xToPix(i), Y = yToPix(pt[valueKey]); if (i === 0) doc.moveTo(X, Y); else doc.lineTo(X, Y) })
  doc.stroke()
  // axes + x time labels
  doc.lineWidth(0.6).strokeColor(SOFT).moveTo(axisL, plotTop).lineTo(axisL, plotBot).lineTo(axisR, plotBot).stroke()
  doc.fillColor(SOFT).font('Helvetica').fontSize(6.8)
  points.forEach((pt, i) => { if (i % xEvery === 0 || i === points.length - 1) doc.text(pt.x, xToPix(i) - 14, plotBot + 4, { width: 28, align: 'center', lineBreak: false }) })
  doc.restore()
  doc.x = MARGIN
  doc.y = top + height
}

// Dual-axis Temperature & Relative Humidity timeline (left °F / right %),
// with the ASHRAE 55 RH comfort band and a two-series legend.
function loggerDualChart({ points, occ, height = 210 }) {
  ensureFig(height + 18)
  const top = doc.y
  const axisL = MARGIN + 44, axisR = MARGIN + CONTENT_W - 32
  const plotTop = top + 14, plotBot = top + height - 32
  const plotH = plotBot - plotTop, plotW = axisR - axisL
  const tMin = 66, tMax = 82, rhMin = 0, rhMax = 100
  const yT = v => plotBot - ((v - tMin) / (tMax - tMin)) * plotH
  const yR = v => plotBot - ((v - rhMin) / (rhMax - rhMin)) * plotH
  const xToPix = i => axisL + (i / (points.length - 1)) * plotW
  doc.save()
  // RH comfort band (30–60%, right axis)
  doc.rect(axisL, yR(60), plotW, yR(30) - yR(60)).fillColor(SERIES.rh).fillOpacity(0.08).fill(); doc.fillOpacity(1)
  if (occ) { doc.rect(xToPix(occ[0]), plotTop, xToPix(occ[1]) - xToPix(occ[0]), plotH).fillColor(OCC_FILL).fillOpacity(0.12).fill(); doc.fillOpacity(1) }
  // shared gridlines, dual tick labels (temp left / rh right)
  const ticks = 4
  for (let g = 0; g <= ticks; g++) {
    const yy = plotBot - plotH * g / ticks
    doc.lineWidth(0.4).strokeColor(RULE).strokeOpacity(0.6).moveTo(axisL, yy).lineTo(axisR, yy).stroke().strokeOpacity(1)
    doc.fillColor(SERIES.temp).font('Helvetica').fontSize(7).text(String(Math.round(tMin + (tMax - tMin) * g / ticks)), MARGIN, yy - 4, { width: 38, align: 'right', lineBreak: false })
    doc.fillColor(SERIES.rh).font('Helvetica').fontSize(7).text(String(Math.round(rhMin + (rhMax - rhMin) * g / ticks)), axisR + 3, yy - 4, { width: 28, align: 'left', lineBreak: false })
  }
  doc.fillColor(SERIES.temp).font('Helvetica-Bold').fontSize(7).text('°F', MARGIN, plotTop - 11, { width: 38, align: 'right', lineBreak: false })
  doc.fillColor(SERIES.rh).font('Helvetica-Bold').fontSize(7).text('%', axisR + 3, plotTop - 11, { width: 28, align: 'left', lineBreak: false })
  doc.fillColor(SOFT).font('Helvetica').fontSize(6.6).text('30–60% · ASHRAE 55-2023 comfort', axisL + 4, yR(60) + 2, { width: plotW - 8, lineBreak: false })
  // lines
  doc.lineWidth(2).strokeColor(SERIES.temp)
  points.forEach((pt, i) => { const X = xToPix(i), Y = yT(pt.temp); if (i === 0) doc.moveTo(X, Y); else doc.lineTo(X, Y) })
  doc.stroke()
  doc.lineWidth(2).strokeColor(SERIES.rh)
  points.forEach((pt, i) => { const X = xToPix(i), Y = yR(pt.rh); if (i === 0) doc.moveTo(X, Y); else doc.lineTo(X, Y) })
  doc.stroke()
  // axes
  doc.lineWidth(0.6).strokeColor(SOFT).moveTo(axisL, plotTop).lineTo(axisL, plotBot).lineTo(axisR, plotBot).stroke()
  doc.lineWidth(0.6).strokeColor(SOFT).moveTo(axisR, plotTop).lineTo(axisR, plotBot).stroke()
  // x labels
  doc.fillColor(SOFT).font('Helvetica').fontSize(6.8)
  points.forEach((pt, i) => { if (i % 3 === 0 || i === points.length - 1) doc.text(pt.x, xToPix(i) - 14, plotBot + 4, { width: 28, align: 'center', lineBreak: false }) })
  // legend
  const ly = plotBot + 16
  doc.rect(MARGIN, ly, 12, 3).fillColor(SERIES.temp).fill()
  doc.fillColor(INK).font('Helvetica').fontSize(7.5).text('Temperature (°F)', MARGIN + 16, ly - 3, { width: 130, lineBreak: false })
  doc.rect(MARGIN + 150, ly, 12, 3).fillColor(SERIES.rh).fill()
  doc.fillColor(INK).font('Helvetica').fontSize(7.5).text('Relative Humidity (%)', MARGIN + 166, ly - 3, { width: 150, lineBreak: false })
  doc.restore()
  doc.x = MARGIN
  doc.y = top + height
}

// Schematic floor plan with sampling-location markers.
function floorPlan({ height = 250 }) {
  ensureFig(height + 30)
  figTitle('Figure 1 — Representative sampling locations (Floor 8 schematic)')
  const top = doc.y
  const x0 = MARGIN + 6, y0 = top + 4
  const w = CONTENT_W - 12, h = height - 44
  doc.save()
  doc.lineWidth(1.2).strokeColor(SLATE).rect(x0, y0, w, h).stroke()
  const room = (fx, fy, fw, fh, label, fill, marker) => {
    const rx = x0 + fx * w, ry = y0 + fy * h, rw = fw * w, rh = fh * h
    doc.rect(rx, ry, rw, rh).fillColor(fill).fillOpacity(1).fill()
    doc.lineWidth(0.6).strokeColor(RULE).rect(rx, ry, rw, rh).stroke()
    doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(7.5).text(label, rx + 5, ry + 5, { width: rw - 10, lineBreak: false })
    if (marker) {
      const mx = rx + 14, my = ry + rh - 14
      doc.circle(mx, my, 3.4).fillColor(ACCENT).fill()
      doc.fillColor(ACCENT_DK).font('Helvetica-Bold').fontSize(6.6).text(marker, mx + 7, my - 4, { width: rw - 24, lineBreak: false })
    }
  }
  // Top band
  room(0, 0, 0.50, 0.40, '8-B  Open office', CARD, 'S1')
  room(0.50, 0, 0.28, 0.40, '8-A  Reception', '#FFFFFF')
  room(0.78, 0, 0.22, 0.40, '8-F  Copy / print', CARD, 'S3')
  // Corridor
  room(0, 0.40, 1.0, 0.16, 'Corridor', ZEBRA)
  // Bottom band
  room(0, 0.56, 0.34, 0.44, '8-C  Open office', '#FFFFFF')
  room(0.34, 0.56, 0.20, 0.44, 'Core (elev. / WC)', '#E2E8F0')
  room(0.54, 0.56, 0.46, 0.44, '8-D  Interior conference', CARD, 'S2 (logger)')
  doc.restore()
  // Legend
  const ly = y0 + h + 8
  doc.circle(MARGIN + 4, ly + 4, 3.2).fillColor(ACCENT).fill()
  doc.fillColor(SOFT).font('Helvetica').fontSize(8).text('Direct-reading sampling location (S#)    ·    S2 = continuous logger station    ·    Not to scale; layout is schematic.', MARGIN + 14, ly, { width: CONTENT_W - 14, lineBreak: false })
  doc.x = MARGIN
  doc.y = ly + 18
}

// Photo placeholders (a live report embeds the assessor's field photos).
function photoGrid(items) {
  const gap = 14, colW = (CONTENT_W - gap) / 2, frameH = 96, cardH = frameH + 30
  for (let i = 0; i < items.length; i += 2) {
    ensureFig(cardH + 8)
    const top = doc.y
    for (let j = 0; j < 2 && i + j < items.length; j++) {
      const it = items[i + j]
      const x = MARGIN + j * (colW + gap)
      doc.roundedRect(x, top, colW, frameH, 6).fillColor(ZEBRA).fill()
      doc.lineWidth(0.6).strokeColor(RULE).roundedRect(x, top, colW, frameH, 6).stroke()
      // simple "image" glyph: sun + two mountains
      doc.save()
      doc.circle(x + colW - 26, top + 24, 7).fillColor('#94A3B8').fill()
      const by = top + frameH - 14, bx = x + 14, bw = colW - 28
      doc.fillColor('#CBD5E1').moveTo(bx, by).lineTo(bx + bw * 0.34, by - 34).lineTo(bx + bw * 0.60, by).closePath().fill()
      doc.fillColor('#B6C2D1').moveTo(bx + bw * 0.42, by).lineTo(bx + bw * 0.72, by - 46).lineTo(bx + bw, by).closePath().fill()
      doc.restore()
      doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(8).text(`Photo ${i + j + 1}. ${it.title}`, x, top + frameH + 5, { width: colW, lineBreak: false })
      doc.fillColor(FAINT).font('Helvetica').fontSize(7).text(it.sub, x, top + frameH + 16, { width: colW, lineBreak: false })
    }
    doc.x = MARGIN
    doc.y = top + cardH + 8
  }
}

// Running header + footer, stamped on every page except the cover.
// Temporarily lifts the page's bottom margin so footer text drawn in the
// margin band doesn't trip pdfkit's auto-pagination (which would re-enter
// the pageAdded handler).
function drawChrome(n) {
  const mb = doc.page.margins.bottom
  doc.page.margins.bottom = 0
  doc.save()
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(8.5).text('AtmosFlow', MARGIN, HEADER_Y, { lineBreak: false, continued: true })
    .fillColor(FAINT).font('Helvetica').text('  ·  Indoor Air Quality Assessment', { lineBreak: false })
  doc.fillColor(FAINT).font('Helvetica').fontSize(8).text('Sample — Evaluation Use Only', MARGIN, HEADER_Y, { width: CONTENT_W, align: 'right', lineBreak: false })
  doc.lineWidth(0.5).strokeColor(RULE).moveTo(MARGIN, HEADER_Y + 16).lineTo(MARGIN + CONTENT_W, HEADER_Y + 16).stroke()
  const fy = PAGE_H - 44
  doc.lineWidth(0.5).strokeColor(RULE).moveTo(MARGIN, fy).lineTo(MARGIN + CONTENT_W, fy).stroke()
  doc.fillColor(FAINT).font('Helvetica').fontSize(7.5).text(`${REPORT.reportId}  ·  Confidential sample — © 2026 ${REPORT.firm}`, MARGIN, fy + 6, { lineBreak: false })
  const label = TOTAL ? `Page ${n} of ${TOTAL}` : `Page ${n}`
  doc.fillColor(FAINT).font('Helvetica').fontSize(7.5).text(label, MARGIN, fy + 6, { width: CONTENT_W, align: 'right', lineBreak: false })
  doc.restore()
  doc.page.margins.bottom = mb
}

// ─── Content (cover = page 1, drawn without chrome) ────────────────
function buildContent() {
  // COVER
  doc.save().rect(0, 0, PAGE_W, 168).fill(ACCENT).restore()
  doc.save().rect(0, 168, PAGE_W, 5).fill(ACCENT_DK).restore()
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(30).text('AtmosFlow', MARGIN, 52)
  doc.fillColor(ACCENT_TINT).font('Helvetica').fontSize(12.5).text('Indoor Air Quality Assessment', MARGIN, 94)
  doc.fillColor(ACCENT_TINT).font('Helvetica').fontSize(9).text('by Prudence Safety & Environmental Consulting, LLC', MARGIN, 116)

  doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(23).text('Screening-Level IAQ Assessment Report', MARGIN, 214, { width: CONTENT_W })
  doc.fillColor(SOFT).font('Helvetica').fontSize(12).text('Direct-reading evaluation of carbon dioxide, comfort, and particulate / VOC indicators', MARGIN, doc.y + 4, { width: CONTENT_W })
  doc.moveDown(0.5)
  chip('Sample — Evaluation Use Only', FAINT, MARGIN, doc.y + 4, 196)

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

  // EXECUTIVE SUMMARY
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
  p(`Most zones presented acceptable ventilation, comfort, and air-quality indicators. One interior conference room (Zone 8-D) showed a carbon-dioxide trend consistent with possible under-ventilation relative to occupant load during a high-occupancy meeting (a screening inference, not a measured ventilation rate), and two zones (8-F copy/print room and 12-B break room) showed advisory-tier particulate and VOC readings indicating identifiable local sources. No carbon-monoxide, thermal, or humidity conditions outside the screening references were observed. Each finding below carries a confidence rating and the verification it would need; recommended actions in Section 5 follow a verify-before-invest ladder.`)

  // 1. SCOPE & SITE
  doc.addPage()
  h1('1. Scope & Site Description')
  p(`The assessment covered ${REPORT.floors.toLowerCase()} of ${REPORT.facility}, a multi-tenant Class-A office building served by a central variable-air-volume (VAV) HVAC system with rooftop air handlers and perimeter VAV boxes. Eight zones were selected to represent a cross-section of use types: perimeter and interior offices, open workstations, a conference room, a copy/print room, an executive suite, and a break room. Occupancy at the time of assessment ranged from 1 to 6 persons per zone. Outdoor conditions were mild and dry (≈58 °F, 55% RH), with light wind from the northwest.`)
  p('The objective was a screening characterization of indoor air quality indicators to (a) confirm whether observed conditions fall within recognized comfort and ventilation references, (b) identify any zones warranting follow-up, and (c) provide a defensible, prioritized action list. The assessment did not include integrated time-weighted-average sampling, microbial sampling, or destructive investigation.')

  floorPlan({ height: 250 })
  figCaption('Schematic of Floor 8 showing the spaces sampled and the direct-reading locations (S1–S3). The interior conference room (8-D) has no operable window and was the continuous-logger station.')

  h2('2. Methodology & Instrumentation')
  h3('Direct-reading instrumentation')
  bullets([
    `${REPORT.instrument}. CO2, CO, temperature, and relative humidity captured with the Q-Trak; fine particulate (PM2.5) captured with the DustTrak DRX.`,
    'Calibration: both instruments bump-checked the morning of the assessment and last factory-calibrated 12 days prior, within manufacturer specification. CO2 accuracy at 1,000 ppm: ±50 ppm (manufacturer-stated). PM2.5 zeroed with a HEPA filter immediately before use.',
    'Measurement protocol: grab readings at occupied breathing-zone height (1.5 m AGL) held at least 3 minutes per location, with a short continuous log (1-minute interval) in the conference room during an occupied meeting.',
  ])
  h3('Reference framework')
  p('Outcomes are screened against recognized consensus and regulatory references: ASHRAE 62.1-2022 (ventilation, used as an indicator basis for CO2 — not a CO2 contaminant limit), ASHRAE 55-2020 (thermal comfort), US EPA NAAQS (CO and PM2.5), OSHA PELs (29 CFR 1910.1000), and the Mølhave (1991) advisory tiers for TVOC. References are used to contextualize screening readings, not to render compliance determinations.')

  // 3. RESULTS
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
  p('Each indicator below is introduced briefly — what it is and why it is measured — followed by what was observed at this site and how it compares to recognized references.')
  h3('Carbon dioxide (CO2) — ventilation indicator')
  p('What it is and why we measure it: Carbon dioxide is produced by people as they breathe and builds up indoors when the supply of outdoor air does not keep pace with the number of occupants. At the concentrations typical of offices it is not itself a health hazard, but it is the most practical real-time indicator of ventilation adequacy — elevated levels usually accompany "stuffiness" complaints and signal that a space is receiving too little fresh air for its occupant load.')
  p(`Observed: Outdoor baseline averaged ${OUTDOOR.co2} ppm. Indoor concentrations ranged ${RNG.co2[0]}–${RNG.co2[1]} ppm (site mean ${MEAN.co2} ppm). ASHRAE 62.1 prescribes ventilation rates rather than a CO2 limit; an indoor-to-outdoor differential above roughly 700 ppm is commonly used as an indicator that outdoor-air delivery may be low relative to occupant load. The Zone 8-D peak of ${RNG.co2[1]} ppm during a six-person meeting is ${RNG.co2[1] - OUTDOOR.co2} ppm above outdoor — consistent with possible under-ventilation for that occupancy. This is an indicator, not a measurement of ventilation: occupant density, room volume, supply airflow, and the design ventilation rate were not measured, so the finding is a screening hypothesis pending airflow / BAS / TAB verification. All other zones remained within the indicator range.`)

  h3('Carbon monoxide (CO)')
  p('What it is and why we measure it: Carbon monoxide is a colorless, odorless gas formed by incomplete combustion — vehicle exhaust, gas-fired appliances, and generators. Because it is an acute hazard that reduces the blood’s ability to carry oxygen, even low indoor readings are screened to rule out combustion sources migrating into occupied space (for example from loading docks, an attached garage, or a flue that is not venting properly).')
  p(`Observed: CO was uniformly low (${RNG.co[0]}–${RNG.co[1]} ppm) and well below the US EPA NAAQS (9 ppm, 8-hour) and the OSHA PEL (50 ppm, 8-hour TWA). The slightly higher break-room reading (Zone 12-B, 1.1 ppm) is consistent with intermittent toaster/appliance use and is not of concern at this level.`)

  h3('Thermal comfort — temperature & relative humidity')
  p('What it is and why we measure it: Dry-bulb temperature and relative humidity together define the thermal environment, which is the single most common driver of occupant comfort complaints. Relative humidity also affects air quality: sustained high humidity can support microbial growth, while very low humidity contributes to dryness and irritation of the eyes and airways. Both are screened against the ASHRAE 55 comfort envelope.')
  p(`Observed: Temperatures (${RNG.t[0]}–${RNG.t[1]} °F) and relative humidity (${RNG.rh[0]}–${RNG.rh[1]}%) fell within the ASHRAE 55 comfort envelope for the season and clothing assumptions. The interior conference room trended to the warm/humid edge during occupancy, consistent with the elevated CO2 and reduced air exchange noted above.`)

  h3('Fine particulate (PM2.5)')
  p('What it is and why we measure it: PM2.5 refers to airborne particles 2.5 micrometers and smaller — fine enough to be inhaled deep into the lungs. Indoor sources include cooking, printing, and outdoor particles drawn in through the ventilation system. It is measured as an indicator of particulate exposure and of how effectively the building’s air filtration is performing.')
  p(`Observed: PM2.5 ranged ${RNG.pm[0]}–${RNG.pm[1]} µg/m³ (site mean ${MEAN.pm} µg/m³) — generally low and comparable to values commonly observed in mechanically ventilated office environments. For scale only, the US EPA 24-hour NAAQS is 35 µg/m³; NAAQS are outdoor, population-level standards built on long-term epidemiology, not office or occupational screening limits, and are cited here for context rather than as a pass/fail threshold. The copy/print room (Zone 8-F, 18 µg/m³) and break room (Zone 12-B, 16 µg/m³) read modestly higher than quieter office zones, consistent with intermittent laser-printer and cooking activity — local, transient sources rather than a building-wide condition.`)

  h3('Total volatile organic compounds (TVOC)')
  p('What it is and why we measure it: Total volatile organic compounds (TVOC) is a combined measure of the many gas-phase chemicals that off-gas from furnishings, finishes, adhesives, cleaning products, and office equipment. It is a non-specific screening indicator — it does not identify individual compounds — but elevated readings often accompany odor or irritation complaints and point to a source worth investigating.')
  p(`Observed: TVOC ranged ${RNG.tvoc[0]}–${RNG.tvoc[1]} µg/m³ (isobutylene-equivalent; site mean ${MEAN.tvoc} µg/m³). TVOC by photoionization is a non-specific, instrument- and calibration-dependent indicator: it does not identify the individual compounds present (which here could include cleaning products, printer emissions, fragrances, alcohols, or terpenes) and does not by itself indicate a health risk. The higher readings in the copy/print room (610 µg/m³) and conference room (520 µg/m³) indicate that identifiable VOC sources are present and warrant source investigation — not an exposure or comfort conclusion. The Mølhave (1991) tiers are noted only as legacy context; current practice does not treat a TVOC concentration alone as health-based.`)

  // Logger Studio charts — presented the way the system generates them:
  // the live report's "Environmental Evidence Graphs" appendix embeds the
  // Recharts timelines as light-palette images, each with its title,
  // parameters/data-source line, and caption (see sections-sensor.js).
  doc.addPage()
  h1('3.1 Environmental Evidence Graphs (Logger Studio)')
  doc.fillColor(FAINT).font('Helvetica-Oblique').fontSize(9).text('The following timelines were generated from uploaded sensor logger data for screening and documentation purposes. Interpretation should be reviewed by a qualified IAQ professional; AtmosFlow does not make compliance determinations.', MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 })
  doc.x = MARGIN
  doc.moveDown(0.5)
  metaLine('Data source: meridian-8D-conf.csv · 46 readings · Mar 14, 2026 13:10 – 13:55 · 1-min interval')
  doc.moveDown(0.2)

  figTitle('CO2 Over Time')
  loggerLineChart({ points: LOGGER, valueKey: 'co2', color: SERIES.co2, yMin: 600, yMax: 1300, unit: 'ppm', refY: CO2_ADVISORY, refLabel: '1,000 ppm · ASHRAE 62.1-2025 advisory', occ: OCC_WINDOW, height: 196 })
  metaLine('Parameters: CO2 · Mar 14, 2026 13:10–13:55 · shaded band = occupied (meeting)')
  figCaption('CO2 climbed through the occupied meeting to a peak of 1,247 ppm and recovered within roughly ten minutes of adjournment. Dashed line is the ASHRAE 62.1-2025 indoor advisory (1,000 ppm); the peak also exceeds the 700 ppm-over-outdoor ventilation indicator discussed above.')

  figTitle('Temperature & Relative Humidity')
  loggerDualChart({ points: LOGGER, occ: OCC_WINDOW, height: 210 })
  metaLine('Parameters: Temperature, Relative Humidity · Mar 14, 2026 13:10–13:55')
  figCaption('Temperature (left axis) and relative humidity (right axis) both tracked within the ASHRAE 55-2023 comfort envelope, trending to the warm/humid edge during occupancy — consistent with the reduced air exchange shown by the CO2 trend.')

  // 4. FINDINGS
  doc.addPage()
  h1('4. Findings & Interpretation')
  p('Findings are screening observations, ranked by recommended response and carried with a confidence rating. Confidence reflects the weight of supporting evidence (logger trend, outdoor baseline, replication) against what was not measured (airflow, compound speciation); it is not a probability. No finding constitutes a regulatory exposure determination.')
  const FINDINGS = [
    { z: '8-D', sev: 'elevated', conf: 'Moderate', f: 'CO2 reached 1,247 ppm during a six-person meeting — consistent with possible under-ventilation relative to occupant load. Screening inference, not a measured ventilation rate.' },
    { z: '8-F', sev: 'advisory', conf: 'Low–Mod', f: 'PM2.5 (18 µg/m³) and TVOC (610 µg/m³) modestly above office baseline; indicates identifiable local sources (laser printing) warranting source investigation.' },
    { z: '12-B', sev: 'advisory', conf: 'Low–Mod', f: 'CO2 (1,015 ppm) and PM2.5 (16 µg/m³) higher during break/meal periods; consistent with intermittent cooking and shared return air.' },
    { z: '8-D', sev: 'advisory', conf: 'Low', f: 'TVOC (520 µg/m³) indicates VOC sources present; non-specific indicator — no compound identification or health conclusion.' },
    { z: 'All others', sev: 'ok', conf: 'Moderate', f: 'Indicators within recognized screening references at the time of assessment.' },
  ]
  table(
    [
      { label: 'Zone', width: 52, key: 'z' },
      { label: 'Severity', width: 62, render: r => ({ t: SEV[r.sev].label, color: SEV[r.sev].color, bold: true }) },
      { label: 'Conf.', width: 52, key: 'conf' },
      { label: 'Screening finding', width: 304, key: 'f' },
    ],
    FINDINGS,
    { fontSize: 9, rowH: 30 },
  )

  h2('Reported Concerns & Exposure Pathways')
  p('Occupant interviews during the walkthrough surfaced the concerns below, mapped to a plausible pathway and the screening evidence that does — or does not — support it. Occupant reports are subjective and are used to direct measurement, not to replace it.')
  table(
    [
      { label: 'Reported concern', width: 150, key: 'c' },
      { label: 'Potential pathway', width: 130, key: 'pw' },
      { label: 'Screening evidence', width: 190, render: r => ({ t: r.e, color: r.color }) },
    ],
    [
      { c: 'Afternoon "stuffiness" in the conference room', pw: 'Ventilation / outdoor-air delivery', e: 'Supported — elevated CO2 trend in 8-D', color: SEV.elevated.color },
      { c: 'Occasional odor near the print room', pw: 'VOC source (printing)', e: 'Partially supported — elevated TVOC in 8-F', color: SEV.advisory.color },
      { c: 'Isolated eye / throat irritation', pw: 'Source unknown', e: 'Not supported by screening data — no corroborating measurement', color: SOFT },
    ],
    { fontSize: 8.5, rowH: 30 },
  )

  h2('Conceptual Site Model — Primary Finding')
  p('Following standard IAQ investigation logic, the primary finding is expressed as a source → pathway → receptor chain with its supporting evidence and confidence — so the reasoning, not just the number, is on the record.')
  table(
    [
      { label: 'Element', width: 86, render: r => ({ t: r[0], bold: true, color: ACCENT_DK }) },
      { label: 'Zone 8-D ventilation concern', width: 414, render: r => r[1] },
    ],
    [
      ['Source', 'Metabolic CO2 from meeting occupants (six persons).'],
      ['Pathway', 'Outdoor-air delivery to the windowless interior conference room appears insufficient at peak occupancy — a hypothesis, not yet measured.'],
      ['Receptor', 'Meeting occupants during the occupied window.'],
      ['Evidence', 'Rising 1-min CO2 logger trend to 1,247 ppm; 815 ppm indoor–outdoor differential; recovery on adjournment; interior room with no operable window.'],
      ['Confidence', 'Moderate — strong trend evidence, limited by the absence of airflow / BAS / TAB data.'],
    ],
    { fontSize: 9, rowH: 26 },
  )

  h2('Working Hypotheses (Pending Verification)')
  p('The screening data support the hypotheses below. None is a confirmed cause; each names the verification it requires before it should be relied upon for capital decisions.')
  bullets([
    'Outdoor-air delivery to interior Floor 8 zones may be low relative to peak occupancy. The CO2 trend is consistent with this but does not confirm it — verification requires supply-airflow measurement, BAS trend review, or a test-and-balance (TAB) evaluation of the interior VAV branch.',
    'Local emission sources (laser printing, food preparation) appear to lack dedicated local exhaust, allowing transient particulate / VOC excursions to mix into adjacent spaces. Confirmation requires checking exhaust provision and return-air paths for those rooms.',
    'No evidence of water intrusion, visible microbial growth, or combustion spillage was observed during the walkthrough (visual screening only).',
  ])

  // 5. RECOMMENDATIONS
  doc.addPage()
  h1('5. Recommended Actions')
  p('Recommendations follow a verify-before-invest ladder: confirm the suspected cause, correct it, re-test, and only then consider permanent monitoring or capital changes. Priorities reflect screening evidence, not a confirmed diagnosis.')
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
  h2('Medium term (30–90 days) — only if warranted')
  bullets([
    'Only if elevated CO2 recurs after the interior VAV branch is balanced and re-tested, consider temporary continuous CO2 logging in Zones 8-D and 12-B through one cooling season to establish baseline mean and 95th-percentile values before any capital change.',
    'If monitoring confirms a persistent occupancy-driven pattern, then evaluate demand-controlled ventilation for those zones. Permanent BAS sensor integration is a capital decision that should follow verification, not a single screening excursion.',
    'Document as-designed versus as-installed ventilation rates in the building O&M records, and schedule a follow-up screening after corrective work.',
  ])

  // 6 / 7 / 8
  doc.addPage()
  h1('6. Quality Assurance / Quality Control')
  bullets([
    'Instruments bump-checked the morning of the assessment; factory calibration within the prior 12 days and within manufacturer specification.',
    'PM2.5 monitor zeroed against a HEPA filter immediately before fieldwork; CO2 verified against fresh outdoor air at the rooftop intake.',
    'Grab readings held to stabilization (at least 3 minutes) before recording; the conference-room reading captured during a representative occupied meeting.',
    'All readings and field notes were recorded in AtmosFlow and reviewed against the reference framework by the assessor of record.',
  ])

  h2('7. Limitations')
  p('This assessment is screening-level. Findings are based on direct-reading instrumentation captured during a single assessment window and reflect conditions on the assessment date only. No laboratory-analyzed integrated samples, microbial sampling, or destructive investigation were performed. Occupant counts and activity levels were observed at the time of measurement; sustained higher-occupancy or different operating conditions could produce different concentration profiles. Direct-reading TVOC and PM2.5 are non-specific indicators and do not identify individual compounds or establish toxicological significance. This report does not constitute a regulatory exposure determination, an OSHA compliance certification, or a medical evaluation, and should not be relied upon as such.')
  p('In particular, ventilation-related findings are screening inferences from CO2 behavior, not measured airflow or ventilation rates; they should be confirmed by direct airflow, BAS-trend, or test-and-balance evaluation before any remedial investment. Occupant concerns were gathered through informal interview and are not a substitute for a structured symptom or complaint survey. Confidence ratings express the relative weight of available evidence, not a statistical probability.')

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

  // APPENDICES
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
    { fontSize: 8.5, rowH: 32 },
  )

  doc.moveDown(0.5)
  h2('Appendix B — About This Sample')
  p('AtmosFlow is a screening-only IAQ assessment platform: it captures field observations and direct-reading measurements, screens them against recognized references, and assembles a consultant-grade, defensible report for review by a qualified industrial hygienist or EHS professional. It identifies risk indicators and produces prioritized follow-up — it does not make regulatory classifications or compliance determinations. This sample uses fictitious data to illustrate structure and tone. Learn more at atmosflow.net.')

  // APPENDIX C — PHOTOGRAPHS
  doc.addPage()
  h1('Appendix C — Site Photographs')
  p('The photographs below are sample placeholders. A live AtmosFlow report embeds the assessor’s geotagged field photos — each tied to the zone and finding it documents (for example, the windowless conference room, the rooftop intake, and the print-room printers referenced in Sections 3 and 4).')
  photoGrid(PHOTOS)
}

// ─── Render one pass to a file; resolves with the page count ───────
function render(total, outPath) {
  return new Promise((resolve, reject) => {
    TOTAL = total || 0
    pageNum = 1
    doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: CONTENT_TOP, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: {
        Title: 'AtmosFlow — Sample Indoor Air Quality Assessment Report',
        Author: REPORT.firm,
        Subject: 'Sample screening-level IAQ assessment — for evaluation use only',
        Keywords: 'IAQ, indoor air quality, screening assessment, sample report',
      },
    })
    // The cover (page 1) is created by the constructor before this handler
    // attaches, so it never receives chrome. Every subsequent page does.
    // The guard is belt-and-suspenders against re-entrant pagination.
    let inChrome = false
    doc.on('pageAdded', () => {
      if (inChrome) return
      pageNum += 1
      inChrome = true
      drawChrome(pageNum)
      inChrome = false
      doc.x = MARGIN
      doc.y = CONTENT_TOP
    })
    const stream = createWriteStream(outPath)
    stream.on('error', reject)
    stream.on('finish', () => resolve(pageNum))
    doc.pipe(stream)
    buildContent()
    doc.end()
  })
}

// Two passes: count first (deterministic layout), then stamp "Page X of N".
const counted = await render(null, join(tmpdir(), 'atmosflow-sample-count.pdf'))
await render(counted, OUT_PATH)
console.log(`Wrote ${OUT_PATH} (${counted} pages)`)
