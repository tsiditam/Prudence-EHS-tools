/**
 * AtmosFlow — Mold Screening Report generator.
 *
 * The standalone deliverable for the mold userMode: a Word report produced from
 * a mold screening result (assessMold output) — no IAQ assessment, no score.
 * Reuses the same chrome (styles, header/footer, page setup) as the consultant
 * and monitoring reports, so it reads as a sibling. Body comes from the pure
 * `sections-mold.js`; this file only packages it. Screening only.
 */

import { Document, Packer } from 'docx'
import { DOCX_STYLES } from './styles'
import { BODY_SECTION_PROPERTIES, LETTER_BODY_PAGE } from './page-setup'
import { reportSectionAttachments } from './report-chrome'
import { moldReportChildren } from './sections-mold'
import { MOLD_ENGINE_VERSION } from '../../version'

/** File name for a generated report — safe for every OS. */
export function moldReportFileName(meta = {}, ext = 'docx') {
  const site = String(meta.site || 'Mold')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'Mold'
  return `AtmosFlow-Mold-Assessment-Report-${site}.${ext}`
}

/**
 * Build the report as a `docx` Document.
 *
 * @param {import('../../types/mold').MoldScreeningResult} result
 * @param {object} [meta] title / site / preparedFor / preparedBy / date / zones / firm
 */
export function buildMoldReportDocument(result, meta = {}) {
  const title = meta.title || 'Mold Assessment Report'
  const version = (result && result.version) || MOLD_ENGINE_VERSION
  const chrome = reportSectionAttachments({
    firm: meta.firm || 'Prudence EHS',
    clientName: meta.preparedFor || '',
    title,
    ribbon: [meta.site, meta.date, `Mold engine v${version}`].filter(Boolean),
    sectionRelativeTotal: false,
  })

  return new Document({
    creator: 'AtmosFlow — Prudence EHS',
    title: `${title}${meta.site ? ` — ${meta.site}` : ''}`,
    description: `Mold Assessment Report (mold engine v${version})`,
    styles: DOCX_STYLES,
    sections: [
      {
        properties: { ...BODY_SECTION_PROPERTIES, page: { ...LETTER_BODY_PAGE, pageNumbers: { start: 1 } } },
        children: moldReportChildren(result, meta),
        ...chrome,
      },
    ],
  })
}

/** Build the report and return it as a Blob, without downloading. */
export async function getMoldReportBlob(result, meta = {}) {
  const doc = buildMoldReportDocument(result, meta)
  return { blob: await Packer.toBlob(doc) }
}

/** Generate and download the report. */
export async function generateMoldReport(result, meta = {}) {
  const { blob } = await getMoldReportBlob(result, meta)
  const fileName = moldReportFileName(meta)

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)

  return { fileName }
}
