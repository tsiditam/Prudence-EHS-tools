/**
 * AtmosFlow — IAQ Portfolio Summary report (DOCX entry point).
 *
 * Packages the portfolio model (`assemblePortfolioModel`) into a Word document
 * using the shared report chrome (styles, header/footer, page setup), the same
 * way monitoring-report.js packages the monitoring model. One section, so the
 * footer page total is NUMPAGES.
 */

import { Document, Packer } from 'docx'
import { BODY_SECTION_PROPERTIES, LETTER_BODY_PAGE } from './page-setup'
import { DOCX_STYLES } from './styles'
import { reportSectionAttachments } from './report-chrome'
import { portfolioReportChildren } from './sections-portfolio'
import { assemblePortfolioModel } from '../../report/portfolioModel'

/** True when `x` already looks like an assembled portfolio model. */
function isModel(x) {
  return !!x && typeof x === 'object' && x.meta && x.kpis
}

/**
 * Build the portfolio report as a `docx` Document.
 * @param {object} model  an assembled portfolio model
 * @param {object} [opts]
 */
export function buildPortfolioReportDocument(model, opts = {}) {
  const meta = (model && model.meta) || {}
  const firm = meta.firm || opts.firm || 'Prudence EHS'
  const chrome = reportSectionAttachments({
    firm,
    // Internal / practice-facing deliverable — the footer's "prepared for" is
    // the firm itself, not an external client.
    clientName: firm,
    title: 'IAQ Portfolio Summary',
    // ONE section → page total is NUMPAGES (SECTIONPAGES would render empty).
    sectionRelativeTotal: false,
  })
  return new Document({
    creator: 'AtmosFlow — Prudence EHS',
    title: meta.docTitle || 'AtmosFlow — IAQ Portfolio Summary',
    description: 'IAQ Portfolio Summary',
    styles: DOCX_STYLES,
    sections: [
      {
        properties: { ...BODY_SECTION_PROPERTIES, page: { ...LETTER_BODY_PAGE, pageNumbers: { start: 1 } } },
        children: portfolioReportChildren(model),
        ...chrome,
      },
    ],
  })
}

/**
 * Build the report and return it as a Blob (share path / tests).
 * Accepts either an assembled model or the raw `assemblePortfolioModel` input.
 */
export async function getPortfolioReportBlob(input, opts = {}) {
  const model = isModel(input) ? input : assemblePortfolioModel(input || {})
  const doc = buildPortfolioReportDocument(model, opts)
  return { blob: await Packer.toBlob(doc), model }
}

/**
 * Generate and download the portfolio report. Mirrors the download
 * side-effect of the other DOCX generators.
 */
export async function generatePortfolioReport(input, opts = {}) {
  const { blob, model } = await getPortfolioReportBlob(input, opts)
  const fileName = 'AtmosFlow-Portfolio-Summary.docx'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return { fileName, model }
}
