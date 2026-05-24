/**
 * AtmosFlow DOCX Report — Sensor Data / Environmental Evidence Graphs.
 *
 * Appends report-ready IAQ timelines the assessor flagged for inclusion
 * on the Sensor Data screen. Each graph is embedded as the white-paper
 * PNG captured client-side, with its caption, data source, range and a
 * data-quality note. Screening / documentation only — the section carries
 * the standing disclaimer and makes no compliance determination.
 *
 * Fed by raw `data.sensorData` (no engine dependency), mirroring the lab
 * results appendix.
 */

import { Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun } from 'docx'
import dayjs from 'dayjs'
import { base64ToUint8Array, inferImageType, isImageDataUrl } from './images'

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, italics: !!opts.italics, bold: !!opts.bold, color: opts.color, size: opts.size })],
  spacing: { after: opts.after ?? 120, before: opts.before ?? 0 },
  alignment: opts.align,
})

const fmtRange = (s, e) => (s && e ? `${dayjs(s).format('MMM D, YYYY HH:mm')} – ${dayjs(e).format('MMM D, YYYY HH:mm')}` : 'Row order (no timestamps)')

// Embedded image is the CAP_W-16 × CAP_H-16 capture (≈ 2.34:1); scale to
// a 600pt-wide figure that fits the 1-inch-margin content area.
const IMG_W = 600
const IMG_H = Math.round(600 * (284 / 664))

export function buildSensorGraphsAppendix(sensorData) {
  if (!sensorData || !sensorData.graphs) return []
  const included = Object.values(sensorData.graphs).filter((g) => g && g.include && isImageDataUrl(g.imageDataUrl))
  if (!included.length) return []

  const out = []
  out.push(new Paragraph({ text: 'Appendix — Environmental Evidence Graphs', heading: HeadingLevel.HEADING_1, pageBreakBefore: true, spacing: { after: 120 } }))
  out.push(p(
    'The following timelines were generated from uploaded sensor logger data for screening and documentation purposes. Interpretation should be reviewed by a qualified IAQ professional; AtmosFlow does not make compliance determinations.',
    { italics: true, color: '595959', after: 200 },
  ))
  if (sensorData.fileName) {
    out.push(p(`Data source: ${sensorData.fileName} · ${sensorData.summary?.count ?? '—'} readings · ${fmtRange(sensorData.summary?.start, sensorData.summary?.end)}`, { color: '595959', size: 18, after: 200 }))
  }

  included.forEach((g) => {
    out.push(new Paragraph({ text: g.title || 'Sensor Graph', heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 } }))
    try {
      out.push(new Paragraph({
        children: [new ImageRun({ data: base64ToUint8Array(g.imageDataUrl), transformation: { width: IMG_W, height: IMG_H }, type: inferImageType(g.imageDataUrl) })],
        spacing: { after: 80 },
      }))
    } catch { /* skip an unreadable image rather than break generation */ }
    if (Array.isArray(g.series) && g.series.length) {
      out.push(p(`Parameters: ${g.series.join(', ')}${sensorData.summary ? ` · ${fmtRange(sensorData.summary.start, sensorData.summary.end)}` : ''}`, { color: '595959', size: 18, after: 60 }))
    }
    if (g.caption && g.caption.trim()) out.push(p(g.caption.trim(), { after: 80 }))
    if (g.notes && g.notes.trim()) out.push(p(`Notes: ${g.notes.trim()}`, { color: '595959', size: 18, after: 80 }))
  })

  // Carry the data-quality status onto the report when it isn't clean.
  if (sensorData.quality && sensorData.quality.level && sensorData.quality.level !== 'ok') {
    out.push(p(`Data quality: ${sensorData.quality.status}`, { italics: true, color: '9A4A08', size: 18, before: 80, after: 120 }))
  }
  return out
}
