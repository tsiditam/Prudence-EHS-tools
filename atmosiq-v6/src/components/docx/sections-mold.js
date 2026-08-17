/**
 * AtmosFlow — Mold Screening Report, DOCX body.
 *
 * The standalone deliverable for the mold userMode: a Word report built from a
 * mold screening result (assessMold output) — IICRC S520 water Category +
 * remediation Condition, comparative spore screening, categorical findings,
 * limitations, and the standing screening-only framing. No health verdict.
 *
 * Reuses the consultant report's shared chrome (styles, headings, tables,
 * page/header/footer via mold-report.js), so it reads as a sibling of the other
 * AtmosFlow reports. The pure row-builders (conditionRows / findingRows /
 * sporeRows) are exported so content is unit-testable without packing a .docx —
 * the same rows feed the tables here.
 */

import { p } from './paragraphs'
import { sectionHeading2 } from './headings'
import { buildTable, kvTable } from './tables'
import { MOLD_SCREENING_DISCLAIMER, NO_HEALTH_LIMIT_NOTE } from '../../constants/moldStandards'

const SEV = { elevated_indicator: 'Elevated indicator', screening_indicator: 'Indicator', observation: 'Observation' }
const CAT = { water_damage: 'Water damage', moisture: 'Moisture', visible_growth: 'Visible growth', spore_screening: 'Spore analysis', hvac: 'HVAC' }
const SPORE = {
  'possible-amplification-indicator': 'Possible amplification indicator',
  'consistent-with-normal-ecology': 'Consistent with normal ecology',
  'insufficient-data': 'Insufficient data (no paired outdoor reference)',
}

const dash = (v) => (v === undefined || v === null || v === '' ? '—' : v)

export function zoneLabel(zones, id) {
  if (id === 'system') return 'Building systems'
  const z = (zones || []).find((x) => String(x.id) === String(id))
  return z?.label || z?.name || String(id)
}

/** Per-zone rows: [Area, S520 Condition, Water Category, Spore screening]. */
export function conditionRows(result, zones = []) {
  const waterBy = new Map((result?.waterCategories || []).map((w) => [w.zoneId, w]))
  const sporeBy = new Map((result?.sporeScreening || []).map((s) => [s.zoneId, s]))
  return (result?.conditions || []).map((c) => [
    zoneLabel(zones, c.zoneId),
    c.label,
    dash(waterBy.get(c.zoneId)?.label),
    dash(SPORE[sporeBy.get(c.zoneId)?.outcome]),
  ])
}

/** Finding rows: [Severity, Category, Area, Finding]. */
export function findingRows(result, zones = []) {
  return (result?.findings || []).map((f) => [
    SEV[f.severity] || f.severity,
    CAT[f.category] || f.category,
    zoneLabel(zones, f.zoneId),
    f.summary,
  ])
}

/** Spore rows: [Area, Outcome, Indicator genera indoors, Indoor > outdoor]. */
export function sporeRows(result, zones = []) {
  return (result?.sporeScreening || []).map((s) => [
    zoneLabel(zones, s.zoneId),
    SPORE[s.outcome] || s.outcome,
    dash((s.indicatorGeneraIndoors || []).join(', ')),
    dash((s.indoorExceedsOutdoor || []).join(', ')),
  ])
}

/**
 * The report body children (docx elements), built from the same rows above.
 * Empty sections are omitted rather than rendered blank.
 *
 * @param {import('../../types/mold').MoldScreeningResult} result
 * @param {{ title?: string, site?: string, preparedFor?: string, preparedBy?: string, date?: string, zones?: Array }} [meta]
 */
export function moldReportChildren(result, meta = {}) {
  const zones = meta.zones || []
  const children = []

  // Title + meta.
  children.push(p(meta.title || 'Mold Assessment Report', { bold: true, size: 40, after: 80 }))
  children.push(kvTable([
    ['Site', meta.site || '—'],
    ['Prepared for', meta.preparedFor || '—'],
    ['Prepared by', meta.preparedBy || '—'],
    ['Date', meta.date || '—'],
    ['Method', 'IICRC S520 — assessment (mold engine v' + (result?.version || '—') + ')'],
  ]))

  // Per-zone classification.
  const cRows = conditionRows(result, zones)
  if (cRows.length) {
    children.push(sectionHeading2('Per-area classification (IICRC S520)'))
    children.push(buildTable(
      [{ text: 'Area', width: 25 }, { text: 'Condition', width: 30 }, { text: 'Water category', width: 25 }, { text: 'Spore analysis', width: 20 }],
      cRows,
    ))
  }

  // Findings.
  const fRows = findingRows(result, zones)
  children.push(sectionHeading2(`Findings (${fRows.length})`))
  if (fRows.length) {
    children.push(buildTable(
      [{ text: 'Severity', width: 20 }, { text: 'Category', width: 18 }, { text: 'Area', width: 20 }, { text: 'Finding', width: 42 }],
      fRows,
    ))
    children.push(p('Each finding is an indicator recommended for qualified-professional review; none is a determination of occupant health risk, contamination extent, or clearance.', { italics: true, size: 18, after: 80 }))
  } else {
    children.push(p('No indicators were raised.'))
  }

  // Spore screening.
  const sRows = sporeRows(result, zones)
  if (sRows.length) {
    children.push(sectionHeading2('Comparative spore analysis'))
    children.push(buildTable(
      [{ text: 'Area', width: 22 }, { text: 'Outcome', width: 30 }, { text: 'Indicator genera indoors', width: 26 }, { text: 'Indoor > outdoor', width: 22 }],
      sRows,
    ))
    children.push(p(NO_HEALTH_LIMIT_NOTE, { italics: true, size: 18 }))
  }

  // Basis and limitations — where the assessment's screening scope is stated
  // (the IAQ report's "Limitations on Reliance" pattern), rather than a banner.
  children.push(sectionHeading2('Basis and limitations'))
  children.push(p(result?.disclaimer || MOLD_SCREENING_DISCLAIMER, { italics: true }))
  for (const l of (result?.limitations || [])) children.push(p('• ' + l, { size: 20, after: 60 }))

  // Standards referenced.
  if ((result?.standardsCited || []).length) {
    children.push(sectionHeading2('Standards referenced'))
    children.push(p(result.standardsCited.join(' · '), { size: 18, color: '64748B' }))
  }

  return children
}
