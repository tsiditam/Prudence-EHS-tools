/**
 * AtmosFlow DOCX Report — Lab Results Appendix section
 *
 * Renders an appendix-G-style table of lab results imported via the
 * LabResultsImport UI. Closes the CoC loop in the deliverable: the
 * client gets a single report with both the field observations + the
 * confirmatory lab analysis, instead of an AtmosFlow report PLUS a
 * loose lab PDF the assessor mailed under separate cover.
 *
 * Render rules:
 *   • No section emitted if assessment.labResults is missing or
 *     empty — silent no-op so legacy / un-attached assessments
 *     render identically to before this PR.
 *   • Heading reads "Appendix G — Laboratory Analytical Results"
 *     because A-F are already claimed by the v2.1 client report
 *     pipeline (see src/engine/report/types.ts:319-325).
 *   • Lab name + import provenance line ("Imported from FILENAME on
 *     DATE") sits between the heading and the table.
 *   • Table columns: Sample ID, Location, Collected, Analyte,
 *     Result, Units, DL. Detection limit + lab notes are omitted
 *     from the table to keep it narrow; full row data including
 *     unmapped `extra` columns can be re-exported via the
 *     LabResultsImport UI.
 *   • Each row's collected/received date displays as-is (we don't
 *     re-parse — lab CSVs vary in date format and round-tripping
 *     would risk timezone drift).
 *
 * Engine-sacred audit: no src/engine/ touch. Pure DOCX rendering.
 */

import { Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { FONTS, COLORS } from './styles'
import { buildTable } from './tables'

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, font: FONTS.body, size: opts.size || 22, color: opts.color || COLORS.body, bold: opts.bold, italics: opts.italics })],
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { after: opts.after !== undefined ? opts.after : 120 },
  ...(opts.heading ? { heading: opts.heading } : {}),
})

function formatImportDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

/**
 * Build the Lab Results appendix section.
 *
 * @param {object} labResults  assessment.labResults blob
 * @param {string} [labResults.laboratory]         human-readable lab name
 * @param {string} [labResults.importedAt]         ISO timestamp
 * @param {string} [labResults.importedFromFilename]
 * @param {Array}  [labResults.rows]               parser output rows
 * @returns {Array} DOCX children (heading + provenance + table + footnote) — empty when nothing to render
 */
export function buildLabResultsAppendix(labResults) {
  if (!labResults || !Array.isArray(labResults.rows) || labResults.rows.length === 0) {
    return []
  }
  const rows = labResults.rows
  const lab = labResults.laboratory || 'Independent analytical laboratory'
  const importedDate = formatImportDate(labResults.importedAt)
  const provenance = importedDate && labResults.importedFromFilename
    ? `${lab}. Results imported from ${labResults.importedFromFilename} on ${importedDate}.`
    : importedDate
      ? `${lab}. Results imported on ${importedDate}.`
      : `${lab}.`

  const tableRows = rows.map(r => [
    r.sampleId || '—',
    r.location || '—',
    r.collectedAt || '—',
    r.analyte || '—',
    r.result || '—',
    r.units || '—',
    r.detectionLimit || '—',
  ])

  return [
    p('Appendix G — Laboratory Analytical Results', { heading: HeadingLevel.HEADING_2 }),
    p(provenance, { size: 20, color: COLORS.sub, align: AlignmentType.JUSTIFIED, after: 160 }),
    buildTable(
      [
        { text: 'Sample ID', width: 14 },
        { text: 'Location', width: 22 },
        { text: 'Collected', width: 12 },
        { text: 'Analyte', width: 20 },
        { text: 'Result', width: 12 },
        { text: 'Units', width: 10 },
        { text: 'DL', width: 10 },
      ],
      tableRows,
    ),
    p(
      'Laboratory results are reported as received from the analytical laboratory. Interpretation of these values in the context of the building investigation is provided in the body of this report; the raw data above supports independent review by a qualified industrial hygienist.',
      { size: 18, color: COLORS.muted, italics: true, after: 200 },
    ),
  ]
}
