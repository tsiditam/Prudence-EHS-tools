/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AtmosFlow fixed IAQ report renderer (pdfkit).
 *
 * This is the SINGLE renderer for AtmosFlow's screening-level IAQ report. It
 * owns 100% of the visual structure — layout, typography, color, tables,
 * charts, page breaks, headers/footers, watermark, branding — and reads ALL
 * variable content from a `model` object (the Report Model). No AI and no
 * caller decides layout; the renderer produces the same visual format every
 * time. The drawing code is the exact code behind the approved sample report
 * (scripts/generate-sample-report-pdf.mjs), so any model — fictitious sample
 * or real assessment — comes out in the identical design.
 *
 * Pure layout. It contains NO assessment prose: section titles and the
 * severity-legend labels are fixed structure; every paragraph, bullet, table
 * row, and chart series comes from the model. Sections whose model data is
 * empty are omitted.
 *
 * CommonJS so the Vercel serverless render endpoint (api/report-pdf.js) and
 * the build-time sample script and vitest can all use it; it depends only on
 * `pdfkit` (pure JS, no headless browser).
 *
 * `renderReportPdf(model) → Promise<Buffer>`  (two-pass: count pages, then
 * stamp "Page X of N"). The buffer is a complete PDF.
 */

const PDFDocument = require('pdfkit')

// ─── Fixed palette / geometry ──────────────────────────────────────
const INK = '#0F172A', SLATE = '#1E293B', SOFT = '#475569', FAINT = '#64748B'
const RULE = '#CBD5E1', ZEBRA = '#F1F5F9', CARD = '#F8FAFC'
const DEFAULT_ACCENT = '#0E7490', DEFAULT_ACCENT_DK = '#155E75', DEFAULT_ACCENT_TINT = '#E0F2F7'
const SERIES = { co2: '#0E9FB8', temp: '#EA7A2B', rh: '#2563EB', pm25: '#7C3AED', tvoc: '#059669', co: '#CA8A04' }
const OCC_FILL = '#10B981'
const SEV = {
  ok: { label: 'Acceptable', color: '#15803D' },
  advisory: { label: 'Advisory', color: '#B45309' },
  elevated: { label: 'Elevated', color: '#C2410C' },
  priority: { label: 'Priority', color: '#B91C1C' },
}
const MARGIN = 64, PAGE_W = 612, PAGE_H = 792
const CONTENT_W = PAGE_W - MARGIN * 2
const HEADER_Y = 50, CONTENT_TOP = 92, BOTTOM_LIMIT = PAGE_H - MARGIN

// Per-render mutable state (reassigned each pass).
let doc, pageNum = 1, TOTAL = 0, M = {}
let ACCENT = DEFAULT_ACCENT, ACCENT_DK = DEFAULT_ACCENT_DK, ACCENT_TINT = DEFAULT_ACCENT_TINT

// ─── Primitives ────────────────────────────────────────────────────
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
  doc.x = MARGIN
  doc.moveDown(0.6)
}
function chip(label, color, x, y, w = 70) {
  doc.save().roundedRect(x, y, w, 14, 7).fill(color)
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5).text(label.toUpperCase(), x, y + 3.6, { width: w, align: 'center', characterSpacing: 0.5, lineBreak: false })
  doc.restore()
}
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
function metaLine(t) {
  doc.fillColor(FAINT).font('Helvetica').fontSize(8.5).text(t, MARGIN, doc.y, { width: CONTENT_W, lineGap: 1.5 })
  doc.x = MARGIN
  doc.moveDown(0.35)
}
function loggerLineChart({ points, valueKey, color, yMin, yMax, yTicks = 4, unit, refY, refLabel, occ, xEvery = 3, height = 196 }) {
  ensureFig(height + 18)
  const top = doc.y
  const axisL = MARGIN + 46, axisR = MARGIN + CONTENT_W
  const plotTop = top + 14, plotBot = top + height - 20
  const plotH = plotBot - plotTop, plotW = axisR - axisL
  const yToPix = v => plotBot - ((v - yMin) / (yMax - yMin)) * plotH
  const xToPix = i => axisL + (i / (points.length - 1)) * plotW
  doc.save()
  if (occ) { doc.rect(xToPix(occ[0]), plotTop, xToPix(occ[1]) - xToPix(occ[0]), plotH).fillColor(OCC_FILL).fillOpacity(0.13).fill(); doc.fillOpacity(1) }
  for (let g = 0; g <= yTicks; g++) {
    const val = yMin + (yMax - yMin) * g / yTicks, yy = yToPix(val)
    doc.lineWidth(0.4).strokeColor(RULE).strokeOpacity(0.6).moveTo(axisL, yy).lineTo(axisR, yy).stroke().strokeOpacity(1)
    doc.fillColor(SOFT).font('Helvetica').fontSize(7).text(String(Math.round(val)), MARGIN, yy - 4, { width: 40, align: 'right', lineBreak: false })
  }
  doc.fillColor(SOFT).font('Helvetica-Bold').fontSize(7).text(unit, MARGIN, plotTop - 11, { width: 40, align: 'right', lineBreak: false })
  if (refY != null) {
    const ty = yToPix(refY)
    doc.dash(3, { space: 2 }).lineWidth(0.9).strokeColor(color).strokeOpacity(0.75).moveTo(axisL, ty).lineTo(axisR, ty).stroke().undash().strokeOpacity(1)
    doc.fillColor(color).font('Helvetica').fontSize(7).text(refLabel, axisR - 200, ty - 9, { width: 198, align: 'right', lineBreak: false })
  }
  doc.lineWidth(2).strokeColor(color)
  points.forEach((pt, i) => { const X = xToPix(i), Y = yToPix(pt[valueKey]); if (i === 0) doc.moveTo(X, Y); else doc.lineTo(X, Y) })
  doc.stroke()
  doc.lineWidth(0.6).strokeColor(SOFT).moveTo(axisL, plotTop).lineTo(axisL, plotBot).lineTo(axisR, plotBot).stroke()
  doc.fillColor(SOFT).font('Helvetica').fontSize(6.8)
  points.forEach((pt, i) => { if (i % xEvery === 0 || i === points.length - 1) doc.text(pt.x, xToPix(i) - 14, plotBot + 4, { width: 28, align: 'center', lineBreak: false }) })
  doc.restore()
  doc.x = MARGIN
  doc.y = top + height
}
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
  doc.rect(axisL, yR(60), plotW, yR(30) - yR(60)).fillColor(SERIES.rh).fillOpacity(0.08).fill(); doc.fillOpacity(1)
  if (occ) { doc.rect(xToPix(occ[0]), plotTop, xToPix(occ[1]) - xToPix(occ[0]), plotH).fillColor(OCC_FILL).fillOpacity(0.12).fill(); doc.fillOpacity(1) }
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
  doc.lineWidth(2).strokeColor(SERIES.temp)
  points.forEach((pt, i) => { const X = xToPix(i), Y = yT(pt.temp); if (i === 0) doc.moveTo(X, Y); else doc.lineTo(X, Y) })
  doc.stroke()
  doc.lineWidth(2).strokeColor(SERIES.rh)
  points.forEach((pt, i) => { const X = xToPix(i), Y = yR(pt.rh); if (i === 0) doc.moveTo(X, Y); else doc.lineTo(X, Y) })
  doc.stroke()
  doc.lineWidth(0.6).strokeColor(SOFT).moveTo(axisL, plotTop).lineTo(axisL, plotBot).lineTo(axisR, plotBot).stroke()
  doc.lineWidth(0.6).strokeColor(SOFT).moveTo(axisR, plotTop).lineTo(axisR, plotBot).stroke()
  doc.fillColor(SOFT).font('Helvetica').fontSize(6.8)
  points.forEach((pt, i) => { if (i % 3 === 0 || i === points.length - 1) doc.text(pt.x, xToPix(i) - 14, plotBot + 4, { width: 28, align: 'center', lineBreak: false }) })
  const ly = plotBot + 16
  doc.rect(MARGIN, ly, 12, 3).fillColor(SERIES.temp).fill()
  doc.fillColor(INK).font('Helvetica').fontSize(7.5).text('Temperature (°F)', MARGIN + 16, ly - 3, { width: 130, lineBreak: false })
  doc.rect(MARGIN + 150, ly, 12, 3).fillColor(SERIES.rh).fill()
  doc.fillColor(INK).font('Helvetica').fontSize(7.5).text('Relative Humidity (%)', MARGIN + 166, ly - 3, { width: 150, lineBreak: false })
  doc.restore()
  doc.x = MARGIN
  doc.y = top + height
}
// Peak-value-by-zone bar chart (e.g. CO2). Bars colored by screening outcome.
function barChart({ data, threshold, thresholdLabel, unit = 'ppm', height = 200 }) {
  ensureFig(height + 18)
  const top = doc.y
  const axisL = MARGIN + 40, axisR = MARGIN + CONTENT_W
  const plotTop = top + 14, plotBot = top + height - 28
  const plotH = plotBot - plotTop, plotW = axisR - axisL
  const yMax = Math.max(threshold ? threshold * 1.15 : 0, ...data.map(d => d.value)) || 1
  const yToPix = v => plotBot - (v / yMax) * plotH
  const n = data.length, slot = plotW / n, bw = Math.min(54, slot * 0.6)
  doc.save()
  for (let g = 0; g <= 4; g++) {
    const val = (yMax / 4) * g, yy = yToPix(val)
    doc.lineWidth(0.4).strokeColor(RULE).strokeOpacity(0.6).moveTo(axisL, yy).lineTo(axisR, yy).stroke().strokeOpacity(1)
    doc.fillColor(SOFT).font('Helvetica').fontSize(7).text(String(Math.round(val)), MARGIN, yy - 4, { width: 34, align: 'right', lineBreak: false })
  }
  doc.fillColor(SOFT).font('Helvetica-Bold').fontSize(7).text(unit, MARGIN, plotTop - 11, { width: 34, align: 'right', lineBreak: false })
  data.forEach((d, i) => {
    const x = axisL + slot * i + (slot - bw) / 2
    const by = yToPix(d.value), bh = plotBot - by
    doc.rect(x, by, bw, bh).fillColor((SEV[d.outcome] || SEV.ok).color).fill()
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(6.6).text(String(d.value), x - 5, by - 9, { width: bw + 10, align: 'center', lineBreak: false })
    doc.fillColor(SOFT).font('Helvetica').fontSize(6.8).text(String(d.zone), x - 6, plotBot + 4, { width: bw + 12, align: 'center', lineBreak: false })
  })
  if (threshold != null) {
    const ty = yToPix(threshold)
    doc.dash(3, { space: 2 }).lineWidth(0.9).strokeColor(SEV.elevated.color).strokeOpacity(0.8).moveTo(axisL, ty).lineTo(axisR, ty).stroke().undash().strokeOpacity(1)
    if (thresholdLabel) doc.fillColor(SEV.elevated.color).font('Helvetica').fontSize(7).text(thresholdLabel, axisR - 220, ty - 9, { width: 218, align: 'right', lineBreak: false })
  }
  doc.lineWidth(0.6).strokeColor(SOFT).moveTo(axisL, plotTop).lineTo(axisL, plotBot).lineTo(axisR, plotBot).stroke()
  doc.restore()
  doc.x = MARGIN
  doc.y = top + height
}
function floorPlan() {
  const height = 250
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
  room(0, 0, 0.50, 0.40, '8-B  Open office', CARD, 'S1')
  room(0.50, 0, 0.28, 0.40, '8-A  Reception', '#FFFFFF')
  room(0.78, 0, 0.22, 0.40, '8-F  Copy / print', CARD, 'S3')
  room(0, 0.40, 1.0, 0.16, 'Corridor', ZEBRA)
  room(0, 0.56, 0.34, 0.44, '8-C  Open office', '#FFFFFF')
  room(0.34, 0.56, 0.20, 0.44, 'Core (elev. / WC)', '#E2E8F0')
  room(0.54, 0.56, 0.46, 0.44, '8-D  Interior conference', CARD, 'S2 (logger)')
  doc.restore()
  const ly = y0 + h + 8
  doc.circle(MARGIN + 4, ly + 4, 3.2).fillColor(ACCENT).fill()
  doc.fillColor(SOFT).font('Helvetica').fontSize(8).text('Direct-reading sampling location (S#)    ·    S2 = continuous logger station    ·    Not to scale; layout is schematic.', MARGIN + 14, ly, { width: CONTENT_W - 14, lineBreak: false })
  doc.x = MARGIN
  doc.y = ly + 18
}
function photoGrid(items) {
  const gap = 14, colW = (CONTENT_W - gap) / 2, frameH = 96, cardH = frameH + 30
  for (let i = 0; i < items.length; i += 2) {
    ensureFig(cardH + 8)
    const top = doc.y
    for (let j = 0; j < 2 && i + j < items.length; j++) {
      const it = items[i + j]
      const x = MARGIN + j * (colW + gap)
      const buf = it.imageDataUrl ? safeImageBuf(it.imageDataUrl) : null
      if (buf) {
        try {
          doc.image(buf, x, top, { width: colW, height: frameH, cover: [colW, frameH] })
          doc.lineWidth(0.6).strokeColor(RULE).rect(x, top, colW, frameH).stroke()
        } catch { drawPhotoPlaceholder(x, top, colW, frameH) }
      } else {
        drawPhotoPlaceholder(x, top, colW, frameH)
      }
      doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(8).text(`Photo ${i + j + 1}. ${it.title}`, x, top + frameH + 5, { width: colW, lineBreak: false })
      doc.fillColor(FAINT).font('Helvetica').fontSize(7).text(it.sub || '', x, top + frameH + 16, { width: colW, lineBreak: false })
    }
    doc.x = MARGIN
    doc.y = top + cardH + 8
  }
}
function drawPhotoPlaceholder(x, top, colW, frameH) {
  doc.roundedRect(x, top, colW, frameH, 6).fillColor(ZEBRA).fill()
  doc.lineWidth(0.6).strokeColor(RULE).roundedRect(x, top, colW, frameH, 6).stroke()
  doc.save()
  doc.circle(x + colW - 26, top + 24, 7).fillColor('#94A3B8').fill()
  const by = top + frameH - 14, bx = x + 14, bw = colW - 28
  doc.fillColor('#CBD5E1').moveTo(bx, by).lineTo(bx + bw * 0.34, by - 34).lineTo(bx + bw * 0.60, by).closePath().fill()
  doc.fillColor('#B6C2D1').moveTo(bx + bw * 0.42, by).lineTo(bx + bw * 0.72, by - 46).lineTo(bx + bw, by).closePath().fill()
  doc.restore()
}
function drawChrome(n) {
  const meta = M.meta || {}
  const mb = doc.page.margins.bottom
  doc.page.margins.bottom = 0
  doc.save()
  // Diagonal watermark (DRAFT / SAMPLE) behind the chrome.
  if (meta.watermark) {
    doc.save().rotate(-32, { origin: [PAGE_W / 2, PAGE_H / 2] })
      .fillColor(ACCENT).fillOpacity(0.06).font('Helvetica-Bold').fontSize(110)
      .text(meta.watermark, 0, PAGE_H / 2 - 60, { width: PAGE_W, align: 'center', lineBreak: false })
      .fillOpacity(1).restore()
  }
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(8.5).text('AtmosFlow', MARGIN, HEADER_Y, { lineBreak: false, continued: true })
    .fillColor(FAINT).font('Helvetica').text('  ·  Indoor Air Quality Assessment', { lineBreak: false })
  doc.fillColor(FAINT).font('Helvetica').fontSize(8).text(meta.headerLabel || '', MARGIN, HEADER_Y, { width: CONTENT_W, align: 'right', lineBreak: false })
  doc.lineWidth(0.5).strokeColor(RULE).moveTo(MARGIN, HEADER_Y + 16).lineTo(MARGIN + CONTENT_W, HEADER_Y + 16).stroke()
  const fy = PAGE_H - 44
  doc.lineWidth(0.5).strokeColor(RULE).moveTo(MARGIN, fy).lineTo(MARGIN + CONTENT_W, fy).stroke()
  doc.fillColor(FAINT).font('Helvetica').fontSize(7.5).text(meta.footerNote || '', MARGIN, fy + 6, { lineBreak: false })
  doc.fillColor(FAINT).font('Helvetica').fontSize(7.5).text(TOTAL ? `Page ${n} of ${TOTAL}` : `Page ${n}`, MARGIN, fy + 6, { width: CONTENT_W, align: 'right', lineBreak: false })
  doc.restore()
  doc.page.margins.bottom = mb
}

// ─── Cover (page 1, no chrome) ─────────────────────────────────────
function drawCover() {
  const meta = M.meta || {}
  doc.save().rect(0, 0, PAGE_W, 168).fill(ACCENT).restore()
  doc.save().rect(0, 168, PAGE_W, 5).fill(ACCENT_DK).restore()
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(30).text('AtmosFlow', MARGIN, 52)
  doc.fillColor(ACCENT_TINT).font('Helvetica').fontSize(12.5).text('Indoor Air Quality Assessment', MARGIN, 94)
  doc.fillColor(ACCENT_TINT).font('Helvetica').fontSize(9).text(`by ${meta.firm || 'Prudence Safety & Environmental Consulting, LLC'}`, MARGIN, 116)

  doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(23).text(meta.reportTitle || 'Screening-Level IAQ Assessment Report', MARGIN, 214, { width: CONTENT_W })
  doc.fillColor(SOFT).font('Helvetica').fontSize(12).text(meta.coverSubtitle || '', MARGIN, doc.y + 4, { width: CONTENT_W })
  doc.moveDown(0.5)
  if (meta.coverStatusChip) chip(meta.coverStatusChip, FAINT, MARGIN, doc.y + 4, Math.min(260, 12 + meta.coverStatusChip.length * 5.4))

  const cardY = 330
  doc.save().roundedRect(MARGIN, cardY, CONTENT_W, 168, 9).fillAndStroke(CARD, RULE).restore()
  let my = cardY + 20
  const metaRow = (label, value) => {
    doc.fillColor(FAINT).font('Helvetica').fontSize(9).text(String(label).toUpperCase(), MARGIN + 22, my, { width: 140, characterSpacing: 0.5, lineBreak: false })
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(value || '—', MARGIN + 170, my - 1, { width: CONTENT_W - 192, lineBreak: false })
    my += 24
  }
  ;(meta.coverRows || []).slice(0, 6).forEach(([l, v]) => metaRow(l, v))

  if (meta.coverDisclaimer) {
    doc.fillColor(FAINT).font('Helvetica-Oblique').fontSize(8.5).text(meta.coverDisclaimer, MARGIN, 540, { width: CONTENT_W, align: 'center', lineGap: 1.5 })
  }
  doc.save().rect(MARGIN, 596, CONTENT_W, 0.75).fill(RULE).restore()
  doc.fillColor(SOFT).font('Helvetica').fontSize(8.5).text(
    meta.coverFooter || 'Screening-level evaluation — not a regulatory exposure determination, OSHA compliance certification, or medical evaluation.',
    MARGIN, 608, { width: CONTENT_W, align: 'center' },
  )
}

// ─── Body (model-driven; sections omitted when empty) ──────────────
function buildContent() {
  drawCover()

  if (M.execSummary) { doc.addPage(); h1('Executive Summary'); p(M.execSummary) }

  if (M.findingsAtGlance && M.findingsAtGlance.length) {
    h2('Findings at a Glance')
    table(
      [
        { label: 'Parameter', width: 118, render: r => ({ t: r.parameter, bold: true }) },
        { label: 'Site range', width: 96, render: r => r.range },
        { label: 'Reference basis', width: 150, render: r => r.basis },
        { label: 'Screening outcome', width: 96, render: r => ({ t: (SEV[r.outcome] || SEV.ok).label, color: (SEV[r.outcome] || SEV.ok).color, bold: true }) },
      ],
      M.findingsAtGlance, { fontSize: 9, rowH: 26 },
    )
  }

  if (M.showSeverityLegend) {
    h2('Severity Legend')
    const ly = doc.y
    chip(SEV.ok.label, SEV.ok.color, MARGIN, ly, 86)
    chip(SEV.advisory.label, SEV.advisory.color, MARGIN + 96, ly, 86)
    chip(SEV.elevated.label, SEV.elevated.color, MARGIN + 192, ly, 86)
    chip(SEV.priority.label, SEV.priority.color, MARGIN + 288, ly, 86)
    doc.y = ly + 22
    doc.fillColor(FAINT).font('Helvetica').fontSize(8.5).text(
      M.severityLegendNote || 'Acceptable: within recognized screening references. Advisory: monitor / investigate source. Elevated: corrective action recommended. Priority: prompt action recommended.',
      MARGIN, doc.y, { width: CONTENT_W, lineGap: 1.5 })
    doc.x = MARGIN; doc.moveDown(0.6)
  }

  if (M.overallStatement) { h2('Overall Screening Statement'); p(M.overallStatement) }

  if (M.scope && (M.scope.paras || M.scope.text)) {
    doc.addPage()
    h1('1. Scope & Site Description')
    ;(M.scope.paras || [M.scope.text]).forEach(para => p(para))
    if (M.scope.showFloorPlanSchematic) { floorPlan(); if (M.scope.floorPlanCaption) figCaption(M.scope.floorPlanCaption) }
  }

  if (M.methodology) {
    h2('2. Methodology & Instrumentation')
    if (M.methodology.bullets && M.methodology.bullets.length) { h3('Direct-reading instrumentation'); bullets(M.methodology.bullets) }
    if (M.methodology.referenceFramework) { h3('Reference framework'); p(M.methodology.referenceFramework) }
  }

  if (M.results) {
    doc.addPage()
    h1('3. Measurement Results')
    if (M.results.intro) p(M.results.intro)
    if (M.results.rows && M.results.rows.length) {
      table(
        [
          { label: 'Zone', width: 52, key: 'id' },
          { label: 'Use', width: 120, key: 'use' },
          { label: 'CO2\nppm', width: 50, align: 'right', render: z => fmt(z.co2) },
          { label: 'CO\nppm', width: 42, align: 'right', render: z => fmt(z.co) },
          { label: 'T\n°F', width: 42, align: 'right', render: z => fmt(z.t) },
          { label: 'RH\n%', width: 38, align: 'right', render: z => fmt(z.rh) },
          { label: 'PM2.5\nµg/m³', width: 48, align: 'right', render: z => fmt(z.pm) },
          { label: 'TVOC\nµg/m³', width: 50, align: 'right', render: z => fmt(z.tvoc) },
          { label: 'Outcome', width: 60, render: z => ({ t: (SEV[z.sev] || SEV.ok).label, color: (SEV[z.sev] || SEV.ok).color, bold: true }) },
        ],
        M.results.rows, { fontSize: 8, rowH: 22 },
      )
    }
    if (M.results.note) metaLine(M.results.note)
    if (M.results.parameters && M.results.parameters.length) {
      h2('Per-Parameter Interpretation')
      if (M.results.perParamIntro) p(M.results.perParamIntro)
      M.results.parameters.forEach(param => { h3(param.title); (param.body || []).forEach(b => p(b)) })
    }
  }

  if (M.logger) {
    doc.addPage()
    h1('3.1 Environmental Evidence Graphs (Logger Studio)')
    if (M.logger.disclaimer) { doc.fillColor(FAINT).font('Helvetica-Oblique').fontSize(9).text(M.logger.disclaimer, MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 }); doc.x = MARGIN; doc.moveDown(0.5) }
    if (M.logger.dataSource) { metaLine(M.logger.dataSource); doc.moveDown(0.2) }
    if (M.logger.line) { figTitle(M.logger.lineTitle || 'CO2 Over Time'); loggerLineChart(M.logger.line); if (M.logger.lineParams) metaLine(M.logger.lineParams); if (M.logger.lineCaption) figCaption(M.logger.lineCaption) }
    if (M.logger.dual) { figTitle(M.logger.dualTitle || 'Temperature & Relative Humidity'); loggerDualChart(M.logger.dual); if (M.logger.dualParams) metaLine(M.logger.dualParams); if (M.logger.dualCaption) figCaption(M.logger.dualCaption) }
  }

  // Real assessments embed Logger Studio's actual chart PNGs rather than
  // redrawing from raw points; the sample uses the point-drawn charts above.
  if (M.loggerImages && M.loggerImages.images && M.loggerImages.images.length) {
    doc.addPage()
    h1('3.1 Environmental Evidence Graphs (Logger Studio)')
    if (M.loggerImages.disclaimer) { doc.fillColor(FAINT).font('Helvetica-Oblique').fontSize(9).text(M.loggerImages.disclaimer, MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 }); doc.x = MARGIN; doc.moveDown(0.5) }
    if (M.loggerImages.dataSource) { metaLine(M.loggerImages.dataSource); doc.moveDown(0.2) }
    M.loggerImages.images.forEach(g => {
      const imgH = 196
      ensureFig(imgH + 26)
      if (g.title) figTitle(g.title)
      const gbuf = safeImageBuf(g.imageDataUrl)
      if (gbuf) { try { doc.image(gbuf, MARGIN, doc.y, { fit: [CONTENT_W, imgH], align: 'center' }); doc.y += imgH + 4 } catch { /* skip unreadable image */ } }
      doc.x = MARGIN
      if (g.params) metaLine(g.params)
      if (g.caption) figCaption(g.caption)
    })
  }

  if (M.co2Bars && M.co2Bars.data && M.co2Bars.data.length > 1) {
    if (!M.logger) { doc.addPage(); h1('3.1 Measurement Charts') }
    figTitle('Peak CO2 by Zone')
    barChart({ data: M.co2Bars.data, threshold: M.co2Bars.threshold, thresholdLabel: M.co2Bars.thresholdLabel })
    if (M.co2Bars.caption) figCaption(M.co2Bars.caption)
  }

  if (M.findings) {
    doc.addPage()
    h1('4. Findings & Interpretation')
    if (M.findings.intro) p(M.findings.intro)
    if (M.findings.rows && M.findings.rows.length) {
      table(
        [
          { label: 'Zone', width: 52, key: 'z' },
          { label: 'Severity', width: 62, render: r => ({ t: (SEV[r.sev] || SEV.ok).label, color: (SEV[r.sev] || SEV.ok).color, bold: true }) },
          { label: 'Conf.', width: 52, key: 'conf' },
          { label: 'Screening finding', width: 304, key: 'f' },
        ],
        M.findings.rows, { fontSize: 9, rowH: 30 },
      )
    }
    if (M.reportedConcerns && M.reportedConcerns.rows && M.reportedConcerns.rows.length) {
      h2('Reported Concerns & Exposure Pathways')
      if (M.reportedConcerns.intro) p(M.reportedConcerns.intro)
      table(
        [
          { label: 'Reported concern', width: 150, key: 'c' },
          { label: 'Potential pathway', width: 130, key: 'pw' },
          { label: 'Screening evidence', width: 190, render: r => ({ t: r.e, color: r.color || INK }) },
        ],
        M.reportedConcerns.rows, { fontSize: 8.5, rowH: 30 },
      )
    }
    if (M.conceptualModel && M.conceptualModel.rows && M.conceptualModel.rows.length) {
      h2('Conceptual Site Model — Primary Finding')
      if (M.conceptualModel.intro) p(M.conceptualModel.intro)
      table(
        [
          { label: 'Element', width: 86, render: r => ({ t: r[0], bold: true, color: ACCENT_DK }) },
          { label: M.conceptualModel.heading || 'Primary finding', width: 414, render: r => r[1] },
        ],
        M.conceptualModel.rows, { fontSize: 9, rowH: 26 },
      )
    }
    if (M.workingHypotheses && M.workingHypotheses.items && M.workingHypotheses.items.length) {
      h2('Working Hypotheses (Pending Verification)')
      if (M.workingHypotheses.intro) p(M.workingHypotheses.intro)
      bullets(M.workingHypotheses.items)
    }
  }

  const rec = M.recommendations
  if (rec && ((rec.immediate || []).length || (rec.shortTerm || []).length || (rec.mediumTerm || []).length)) {
    doc.addPage()
    h1('5. Recommended Actions')
    if (rec.intro) p(rec.intro)
    if ((rec.immediate || []).length) { h2('Immediate (0–7 days)'); bullets(rec.immediate) }
    if ((rec.shortTerm || []).length) { h2('Short term (7–30 days)'); bullets(rec.shortTerm) }
    if ((rec.mediumTerm || []).length) { h2(rec.mediumTermLabel || 'Medium term (30–90 days)'); bullets(rec.mediumTerm) }
  }

  const hasQa = M.qaQc && M.qaQc.length
  const hasLim = M.limitations && M.limitations.length
  if (hasQa || hasLim || M.review) {
    doc.addPage()
    if (hasQa) { h1('6. Quality Assurance / Quality Control'); bullets(M.qaQc) }
    if (hasLim) { h2('7. Limitations'); M.limitations.forEach(l => p(l)) }
    if (M.review) {
      h2('8. Professional Review & Signature')
      if (M.review.statement) p(M.review.statement)
      doc.moveDown(1.2)
      const sy = doc.y
      doc.save().lineWidth(0.75).strokeColor(SLATE).moveTo(MARGIN, sy).lineTo(MARGIN + 230, sy).stroke().restore()
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(10.5).text(M.review.signatureName || '', MARGIN, sy + 6)
      if (M.review.signatureTitle) doc.fillColor(SOFT).font('Helvetica').fontSize(9).text(M.review.signatureTitle, MARGIN, doc.y + 1)
      if (M.review.signatureFirm) doc.fillColor(SOFT).font('Helvetica').fontSize(9).text(M.review.signatureFirm, MARGIN, doc.y + 1)
      if (M.review.signatureMeta) doc.fillColor(FAINT).font('Helvetica').fontSize(9).text(M.review.signatureMeta, MARGIN, doc.y + 3)
    }
  }

  if (M.references && M.references.length) {
    doc.addPage()
    h1('Appendix A — Standards & References')
    table(
      [
        { label: 'Reference', width: 150, render: r => ({ t: r[0], bold: true }) },
        { label: 'Basis of use', width: 350, render: r => r[1] },
      ],
      M.references, { fontSize: 8.5, rowH: 32 },
    )
  }

  if (M.about && M.about.text) {
    doc.moveDown(0.5)
    h2(M.about.title || 'Appendix B — About AtmosFlow')
    p(M.about.text)
  }

  if (M.photos) {
    doc.addPage()
    h1('Appendix C — Site Photographs')
    if (M.photos.intro) p(M.photos.intro)
    if (M.photos.items && M.photos.items.length) photoGrid(M.photos.items)
    else p('No project photographs were uploaded.')
  }
}

function fmt(v) { return v === null || v === undefined || v === '' ? '—' : String(v) }
// pdfkit accepts a Buffer reliably; convert data: URLs so PNG/JPEG embed works.
function imgData(d) {
  if (typeof d === 'string' && d.startsWith('data:')) {
    const i = d.indexOf('base64,')
    if (i >= 0) return Buffer.from(d.slice(i + 7), 'base64')
  }
  return d
}
// Guard against pathological/corrupt images: pdfkit can hang on degenerate
// PNGs (e.g. 1×1 placeholders). Return a usable Buffer only when the image
// looks real; otherwise null → caller draws a placeholder / skips. Real
// Logger Studio charts and field photos pass.
function safeImageBuf(d) {
  const buf = imgData(d)
  if (!Buffer.isBuffer(buf) || buf.length < 100) return null
  // PNG: read IHDR width/height (bytes 16–24) and require sane dimensions.
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
    if (w < 8 || h < 8 || w > 20000 || h > 20000) return null
  }
  return buf
}

// ─── Render (two-pass, returns a Buffer) ───────────────────────────
function renderOnce(model, total) {
  return new Promise((resolve, reject) => {
    M = model || {}
    TOTAL = total || 0
    pageNum = 1
    const bc = (M.meta && M.meta.brandColor) || DEFAULT_ACCENT
    ACCENT = bc
    ACCENT_DK = bc === DEFAULT_ACCENT ? DEFAULT_ACCENT_DK : bc
    ACCENT_TINT = bc === DEFAULT_ACCENT ? DEFAULT_ACCENT_TINT : '#EAF3F5'
    doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: CONTENT_TOP, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: {
        Title: (M.meta && M.meta.docTitle) || 'AtmosFlow — Indoor Air Quality Assessment Report',
        Author: (M.meta && M.meta.firm) || 'Prudence Safety & Environmental Consulting, LLC',
        Subject: 'Screening-level IAQ assessment report',
        Keywords: 'IAQ, indoor air quality, screening assessment',
      },
    })
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
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('error', reject)
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), pages: pageNum }))
    try { buildContent(); doc.end() } catch (e) { reject(e) }
  })
}

/** Render the report model to a complete PDF Buffer. */
async function renderReportPdf(model) {
  const first = await renderOnce(model, 0)        // count pages
  const final = await renderOnce(model, first.pages) // stamp "Page X of N"
  return final.buffer
}

module.exports = { renderReportPdf }
module.exports.renderReportPdf = renderReportPdf
