/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * IncidentDocxReport — single-event DOCX export for the incident-
 * response flow. Much smaller than the full assessment report:
 * one event, one location, no scoring. Renders the same fields the
 * IncidentDetail screen displays so the export is "what you see is
 * what's filed."
 *
 * Export UX:
 *  - iOS PWA (Safari 15+): hands the Blob to navigator.share() so the
 *    user can save to Files, email, AirDrop, or send via Messages
 *    with a single tap on the native share sheet.
 *  - Desktop / browsers without canShare({files}): standard <a download>
 *    trigger downloads the .docx to the user's Downloads folder.
 */

import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, WidthType, BorderStyle,
} from 'docx'
import { BODY_SECTION_PROPERTIES } from './docx/page-setup'
import { DOCX_STYLES } from './docx/styles'

const FONT = { font: 'Cambria' }

// dataURL → Uint8Array for ImageRun. Photos are stored as base64
// dataURLs in storage.js; the docx library wants raw bytes.
function dataUrlToBytes(dataUrl) {
  try {
    const comma = dataUrl.indexOf(',')
    if (comma < 0) return null
    const base64 = dataUrl.slice(comma + 1)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function fmtDateTime(iso) {
  try { return new Date(iso).toLocaleString() } catch { return iso || '' }
}

// Slug-safe filename component. Keeps letters/digits, replaces
// everything else with '-', collapses runs, trims.
function slug(s, max = 40) {
  return (s || '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'incident'
}

function H1(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120 },
    children: [new TextRun({ ...FONT, text, bold: true, size: 36 })],
  })
}

function H2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
    children: [new TextRun({ ...FONT, text, bold: true, size: 24 })],
  })
}

function P(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ ...FONT, text: text ?? '', size: 22, ...opts })],
  })
}

// Two-column key/value row used in the summary table.
function summaryRow(label, value) {
  const cell = (text, bold) => new TableCell({
    width: { size: bold ? 30 : 70, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      children: [new TextRun({ ...FONT, text: text ?? '—', bold, size: 22 })],
    })],
  })
  return new TableRow({ children: [cell(label, true), cell(value, false)] })
}

function buildSummaryTable(incident) {
  const rows = [
    summaryRow('Incident ID', incident.id),
    summaryRow('Reported at', fmtDateTime(incident.reported_at)),
    summaryRow('Reporter', [incident.reporter_name, incident.reporter_role].filter(Boolean).join(' · ')),
    summaryRow('Building', incident.building_name || incident.building_id || '—'),
    summaryRow('Location', incident.location),
    summaryRow('Trigger', incident.trigger_type),
    summaryRow('Severity', (incident.severity || '').toUpperCase()),
    summaryRow('Status', (incident.status || '').replace('_', ' ')),
  ]
  if (incident.medical_attention) {
    rows.push(summaryRow('Medical attention', 'Sought'))
  }
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      left:   { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      right:  { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'EEEEEE' },
      insideVertical:   { style: BorderStyle.SINGLE, size: 2, color: 'EEEEEE' },
    },
  })
}

function buildPhotoParagraphs(photoIds) {
  const out = []
  for (const dataUrl of photoIds || []) {
    const bytes = dataUrlToBytes(dataUrl)
    if (!bytes) continue
    out.push(new Paragraph({
      spacing: { after: 160 },
      children: [new ImageRun({
        data: bytes,
        transformation: { width: 320, height: 240 },
      })],
    }))
  }
  return out
}

function buildSections(incident, profile) {
  const children = []

  // Title block
  children.push(H1('AtmosFlow Incident Report'))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 320 },
    children: [new TextRun({ ...FONT, text: 'by Prudence Safety & Environmental Consulting, LLC', italics: true, size: 20, color: '666666' })],
  }))

  // Summary table
  children.push(buildSummaryTable(incident))

  // Observations
  children.push(H2('Observations'))
  children.push(P(incident.observations || '(none recorded)'))

  // Symptoms
  if ((incident.symptoms?.length || 0) > 0) {
    children.push(H2('Symptoms reported'))
    for (const s of incident.symptoms) {
      children.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60 },
        children: [new TextRun({ ...FONT, text: s, size: 22 })],
      }))
    }
  }

  // Actions
  const hasActionList = (incident.actions_taken?.length || 0) > 0
  const hasActionFree = !!incident.actions_taken_other
  if (hasActionList || hasActionFree) {
    children.push(H2('Actions taken'))
    if (hasActionList) {
      for (const a of incident.actions_taken) {
        children.push(new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 60 },
          children: [new TextRun({ ...FONT, text: a, size: 22 })],
        }))
      }
    }
    if (hasActionFree) {
      children.push(P(incident.actions_taken_other))
    }
  }

  // Photographs
  const photoParas = buildPhotoParagraphs(incident.photo_ids)
  if (photoParas.length > 0) {
    children.push(H2('Photographs'))
    children.push(...photoParas)
  }

  // Record metadata
  children.push(H2('Record'))
  children.push(P(`Created: ${fmtDateTime(incident.created_at)}`))
  if (incident.updated_at && incident.updated_at !== incident.created_at) {
    children.push(P(`Last updated: ${fmtDateTime(incident.updated_at)}`))
  }
  if (profile?.name) {
    children.push(P(`Exported by: ${profile.name}${profile.firm ? ' · ' + profile.firm : ''}`))
  }
  children.push(P(`Exported at: ${fmtDateTime(new Date().toISOString())}`))

  // Disclaimer — screening-only positioning per CLAUDE.md.
  children.push(new Paragraph({
    spacing: { before: 320, after: 80 },
    children: [new TextRun({
      ...FONT, size: 18, italics: true, color: '666666',
      text: 'This is a screening-level incident record documenting an indoor air event as reported by site personnel. It is not an exposure assessment, regulatory determination, or substitute for professional industrial-hygiene evaluation. For health concerns or emergencies, contact qualified medical and emergency services.',
    })],
  }))

  return [{
    ...BODY_SECTION_PROPERTIES,
    children,
  }]
}

function buildFilename(incident) {
  const dateIso = (incident.reported_at || incident.created_at || '').slice(0, 10) || 'undated'
  const where = slug(incident.building_name || incident.location || 'incident', 30)
  return `AtmosFlow-Incident-${where}-${dateIso}.docx`
}

// Hands the document to the user. Prefers the iOS share sheet
// (single tap → save to Files, email, AirDrop, Messages); falls back
// to direct download elsewhere.
async function deliverBlob(blob, filename) {
  // Web Share API path — iOS PWA, Android Chrome.
  try {
    if (typeof navigator !== 'undefined' && navigator.canShare) {
      const file = new File([blob], filename, { type: blob.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'AtmosFlow Incident Report' })
        return
      }
    }
  } catch (err) {
    // User cancelled the share sheet or share is unavailable —
    // fall through to download. Don't surface the error.
    if (err?.name !== 'AbortError') console.warn('Share failed, falling back to download:', err)
  }
  // Download path.
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export async function generateIncidentDocx(incident, profile) {
  if (!incident) throw new Error('generateIncidentDocx: incident is required')

  const doc = new Document({
    styles: DOCX_STYLES,
    creator: profile?.name || 'AtmosFlow',
    title: `Incident Report — ${incident.location || incident.id}`,
    description: 'AtmosFlow incident-response record',
    sections: buildSections(incident, profile),
  })

  const blob = await Packer.toBlob(doc)
  await deliverBlob(blob, buildFilename(incident))
}
