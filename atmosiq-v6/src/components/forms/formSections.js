/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Shared section renderers for AtmosFlow chain-of-custody PDF forms.
 * Both MoldCoCForm and TvocCoCForm call into here for everything
 * that isn't form-specific: page header band, identity blocks,
 * transfer table, lab-use-only table, footer.
 *
 * All helpers receive the jsPDF doc directly and mutate the page
 * cursor — keeps form code linear at the call sites instead of
 * juggling layout state objects.
 */

import {
  PAGE_W, PAGE_H, MARGIN, CONTENT_W,
  ACCENT, ACCENT_DARK, SLATE, SOFT, RULE, MUTED,
  FONT_FAMILY, SZ_TITLE, SZ_SECTION, SZ_LABEL, SZ_BODY, SZ_BODY_SMALL, SZ_FOOTER,
  TRANSFER_ROW_H, FOOTER_COPYRIGHT, FORM_VERSION,
} from './formStyles'

const today = () => new Date().toISOString().slice(0, 10)

// ─── Header band ──────────────────────────────────────────────────
// Top strip across the page: brand-cyan accent rule, AtmosFlow word-
// mark left, form title + version + generated date right. Returns the
// y position immediately below the header so the caller can continue
// from there.
export function drawHeaderBand(doc, { title, formId }) {
  // 3pt brand stripe at the top of the page.
  doc.setFillColor(ACCENT)
  doc.rect(0, 0, PAGE_W, 4, 'F')

  // Wordmark — "AtmosFlow" Helvetica-Bold.
  doc.setFont(FONT_FAMILY, 'bold')
  doc.setFontSize(SZ_TITLE)
  doc.setTextColor(SLATE)
  doc.text('AtmosFlow', MARGIN, 32)

  // Subtitle line under the wordmark.
  doc.setFont(FONT_FAMILY, 'normal')
  doc.setFontSize(SZ_BODY_SMALL)
  doc.setTextColor(SOFT)
  doc.text('Chain of Custody', MARGIN, 44)

  // Right-aligned: form title + meta.
  doc.setFont(FONT_FAMILY, 'bold')
  doc.setFontSize(12)
  doc.setTextColor(ACCENT_DARK)
  doc.text(title, PAGE_W - MARGIN, 30, { align: 'right' })

  doc.setFont(FONT_FAMILY, 'normal')
  doc.setFontSize(SZ_FOOTER)
  doc.setTextColor(SOFT)
  doc.text(
    `Form ${formId} · v${FORM_VERSION} · generated ${today()}`,
    PAGE_W - MARGIN, 42,
    { align: 'right' },
  )

  // Divider line under the header block.
  doc.setDrawColor(RULE)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, 54, PAGE_W - MARGIN, 54)

  return 62 // y cursor for the next block
}

// ─── Footer ───────────────────────────────────────────────────────
// Renders form ID, page n/N, and the copyright on every page.
export function drawFooter(doc, { formId, pageNum, pageCount }) {
  const y = PAGE_H - 24
  doc.setDrawColor(RULE)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, y - 8, PAGE_W - MARGIN, y - 8)

  doc.setFont(FONT_FAMILY, 'normal')
  doc.setFontSize(SZ_FOOTER)
  doc.setTextColor(SOFT)
  doc.text(`Form ${formId} · v${FORM_VERSION}`, MARGIN, y)
  doc.text(`Page ${pageNum} of ${pageCount}`, PAGE_W / 2, y, { align: 'center' })
  doc.text(FOOTER_COPYRIGHT, PAGE_W - MARGIN, y, { align: 'right' })
}

// ─── Section header ───────────────────────────────────────────────
// Small uppercase label in accent color with a subtle rule below.
// Returns the next y position.
export function sectionHeader(doc, y, label) {
  doc.setFont(FONT_FAMILY, 'bold')
  doc.setFontSize(SZ_SECTION)
  doc.setTextColor(ACCENT_DARK)
  doc.text(label.toUpperCase(), MARGIN, y)

  doc.setDrawColor(ACCENT)
  doc.setLineWidth(0.8)
  doc.line(MARGIN, y + 2, MARGIN + 36, y + 2)

  return y + 10
}

// ─── Field grid ───────────────────────────────────────────────────
// Render a grid of label-over-value boxes. `fields` is an array of
// { label, value, w } where w is the column-width fraction (1 = full
// row). Wraps to the next row when a row's fractions overflow 1.0.
// Empty value → a ruled placeholder line for hand-fill.
//
// Returns the y position immediately below the grid.
export function fieldGrid(doc, y, fields, options = {}) {
  const rowH = options.rowH || 26
  const labelOffset = 9
  const valueOffset = 22
  const pad = 4
  let x = MARGIN
  let rowFraction = 0
  let curRowH = rowH

  for (const f of fields) {
    const w = (f.w || 1) * CONTENT_W
    // Wrap to next row?
    if (rowFraction + (f.w || 1) > 1.0001) {
      y += curRowH
      x = MARGIN
      rowFraction = 0
      curRowH = rowH
    }

    // Label
    doc.setFont(FONT_FAMILY, 'bold')
    doc.setFontSize(SZ_LABEL)
    doc.setTextColor(SOFT)
    doc.text((f.label || '').toUpperCase(), x + pad, y + labelOffset)

    // Value or hand-fill underline
    doc.setFont(FONT_FAMILY, 'normal')
    doc.setFontSize(SZ_BODY)
    doc.setTextColor(SLATE)
    if (f.value) {
      doc.text(String(f.value), x + pad, y + valueOffset, {
        maxWidth: w - pad * 2,
      })
    } else {
      // Ruled line for handwriting.
      doc.setDrawColor(RULE)
      doc.setLineWidth(0.4)
      doc.line(x + pad, y + valueOffset + 1, x + w - pad, y + valueOffset + 1)
    }

    x += w
    rowFraction += f.w || 1
  }

  return y + curRowH + 2
}

// ─── Checkbox row ─────────────────────────────────────────────────
// Render a list of checkboxes inline. Each item: { label, w?, hint? }.
// `hint` is small parenthetical text after the label, used for
// "Culturable (medium: ____)" style entries.
export function checkboxRow(doc, y, items, options = {}) {
  const boxSize = 8
  const gapAfterBox = 4
  const pad = 4
  let x = MARGIN
  const rowH = options.rowH || 18
  let rowFraction = 0
  let curY = y

  for (const it of items) {
    const w = (it.w || 0.5) * CONTENT_W
    if (rowFraction + (it.w || 0.5) > 1.0001) {
      curY += rowH
      x = MARGIN
      rowFraction = 0
    }

    // Empty checkbox.
    doc.setDrawColor(ACCENT_DARK)
    doc.setLineWidth(0.8)
    doc.rect(x + pad, curY + 3, boxSize, boxSize)

    // Label.
    doc.setFont(FONT_FAMILY, 'normal')
    doc.setFontSize(SZ_BODY)
    doc.setTextColor(SLATE)
    doc.text(it.label, x + pad + boxSize + gapAfterBox, curY + 10, {
      maxWidth: w - pad * 2 - boxSize - gapAfterBox,
    })

    // Hint (parenthetical with underline).
    if (it.hint) {
      doc.setFont(FONT_FAMILY, 'italic')
      doc.setFontSize(SZ_BODY_SMALL)
      doc.setTextColor(MUTED)
      const labelW = doc.getTextWidth(it.label)
      const hintX = x + pad + boxSize + gapAfterBox + labelW + 4
      doc.text(it.hint, hintX, curY + 10)
    }

    x += w
    rowFraction += it.w || 0.5
  }

  return curY + rowH
}

// ─── Free-text block ──────────────────────────────────────────────
// Ruled lines for handwriting. lineCount controls the number of
// rules. lineH default 16pt = comfortable handwriting clearance.
export function ruledBlock(doc, y, lineCount, options = {}) {
  const lineH = options.lineH || 16
  doc.setDrawColor(RULE)
  doc.setLineWidth(0.4)
  for (let i = 0; i < lineCount; i++) {
    const ly = y + (i + 1) * lineH
    doc.line(MARGIN, ly, PAGE_W - MARGIN, ly)
  }
  return y + (lineCount + 0.5) * lineH
}

// ─── Chain-of-custody transfer table ──────────────────────────────
// Standard 4-row transfer ladder used at the bottom of every CoC.
export function transferTable(doc, y) {
  const cols = [
    { label: 'Relinquished by (print + sign)', w: 0.34 },
    { label: 'Received by (print + sign)', w: 0.34 },
    { label: 'Date / Time', w: 0.22 },
    { label: 'Conditions / notes', w: 0.10 },
  ]
  const rowH = TRANSFER_ROW_H
  const tableH = rowH * 5 // 1 header + 4 transfer rows

  doc.setDrawColor(RULE)
  doc.setLineWidth(0.5)
  doc.rect(MARGIN, y, CONTENT_W, tableH)

  // Header band.
  doc.setFillColor(245, 249, 251) // very pale cyan tint
  doc.rect(MARGIN, y, CONTENT_W, rowH, 'F')

  let x = MARGIN
  doc.setFont(FONT_FAMILY, 'bold')
  doc.setFontSize(SZ_LABEL)
  doc.setTextColor(ACCENT_DARK)
  for (const c of cols) {
    const w = c.w * CONTENT_W
    doc.text(c.label.toUpperCase(), x + 4, y + rowH - 8, { maxWidth: w - 8 })
    if (x > MARGIN) {
      doc.line(x, y, x, y + tableH)
    }
    x += w
  }
  // Final column divider (the right edge of last col is the rect edge).
  // Need to add internal dividers between the inner columns we skipped.
  x = MARGIN
  for (let i = 0; i < cols.length - 1; i++) {
    x += cols[i].w * CONTENT_W
    doc.line(x, y, x, y + tableH)
  }

  // Horizontal row separators.
  for (let i = 1; i < 5; i++) {
    const ry = y + i * rowH
    doc.line(MARGIN, ry, MARGIN + CONTENT_W, ry)
  }

  return y + tableH
}

// ─── Lab-use-only block ───────────────────────────────────────────
// Visually distinct (light gray fill) so the assessor doesn't write
// in it accidentally.
export function labUseOnly(doc, y) {
  const h = 70
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(RULE)
  doc.setLineWidth(0.5)
  doc.rect(MARGIN, y, CONTENT_W, h, 'FD')

  doc.setFont(FONT_FAMILY, 'bold')
  doc.setFontSize(SZ_SECTION)
  doc.setTextColor(SOFT)
  doc.text('LAB USE ONLY', MARGIN + 6, y + 12)

  // Internal grid: lab name | date received | condition received,
  // then a row for lab tech signature and lab IDs.
  doc.setFont(FONT_FAMILY, 'bold')
  doc.setFontSize(SZ_LABEL)
  doc.setTextColor(SOFT)

  const colW = CONTENT_W / 3
  const labels = ['Lab name / address', 'Date received', 'Condition received']
  for (let i = 0; i < labels.length; i++) {
    doc.text(labels[i], MARGIN + 6 + i * colW, y + 24)
    doc.setDrawColor(RULE)
    doc.line(MARGIN + 6 + i * colW, y + 36, MARGIN + 4 + (i + 1) * colW, y + 36)
  }
  const labels2 = ['Lab tech (print + sign)', 'Lab IDs assigned', 'Notes']
  for (let i = 0; i < labels2.length; i++) {
    doc.text(labels2[i], MARGIN + 6 + i * colW, y + 48)
    doc.setDrawColor(RULE)
    doc.line(MARGIN + 6 + i * colW, y + 60, MARGIN + 4 + (i + 1) * colW, y + 60)
  }
  // restore label color
  doc.setTextColor(SOFT)
  return y + h
}

// ─── Pre-fill helpers ─────────────────────────────────────────────
// Pull a clean assessor identity block out of the user's profile.
// Returns an object the form generators feed into fieldGrid().
export function buildSubmittingPartyFields(profile) {
  const p = profile || {}
  const certs = Array.isArray(p.certs) && p.certs.length ? p.certs.join(', ') : ''
  const cal = p.iaq_cal_date
    ? `${p.iaq_meter || 'IAQ meter'} S/N ${p.iaq_serial || '—'} · cal ${p.iaq_cal_date}`
    : ''
  return [
    { label: 'Sampler', value: [p.name, certs].filter(Boolean).join(' · '), w: 0.5 },
    { label: 'Firm', value: p.firm || '', w: 0.5 },
    { label: 'Instrument on file', value: cal, w: 1.0 },
    { label: 'Address', value: '', w: 0.5 },
    { label: 'Phone / email', value: '', w: 0.5 },
    { label: 'Sampler signature', value: '', w: 0.7 },
    { label: 'Date', value: '', w: 0.3 },
  ]
}

export function buildClientFields() {
  return [
    { label: 'Client / Owner', value: '', w: 0.5 },
    { label: 'Project / Site name', value: '', w: 0.5 },
    { label: 'Site address', value: '', w: 0.7 },
    { label: 'PO / Job #', value: '', w: 0.3 },
    { label: 'Site contact (name + role)', value: '', w: 0.5 },
    { label: 'Contact phone / email', value: '', w: 0.5 },
  ]
}

export function buildSamplingConditionFields() {
  return [
    { label: 'Sampling date', value: '', w: 0.25 },
    { label: 'Outdoor temp °F', value: '', w: 0.2 },
    { label: 'Outdoor RH %', value: '', w: 0.2 },
    { label: 'Weather / building notes', value: '', w: 0.35 },
  ]
}

export function buildDestinationLabFields() {
  return [
    { label: 'Destination lab', value: '', w: 0.4 },
    { label: 'Lab address / city / state', value: '', w: 0.4 },
    { label: 'Account # / Attention', value: '', w: 0.2 },
    { label: 'Turnaround', value: '', w: 0.4, hintBelow: 'Standard / 72h / 48h / 24h / Same-day' },
    { label: 'Cooler / storage', value: '', w: 0.3 },
    { label: 'Total samples', value: '', w: 0.3 },
  ]
}
