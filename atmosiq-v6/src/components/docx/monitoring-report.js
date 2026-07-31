/**
 * AtmosFlow — Indoor Environmental Monitoring Report generator.
 *
 * The standalone Logger Studio deliverable: a report produced from logger
 * data alone, with no assessment, no engine run, and no composite score.
 *
 * Sits beside `generateConsultantOnly` / `generateTechnicalOnly` in the DOCX
 * pipeline and reuses the same chrome (styles, header/footer, page setup), so
 * it reads as a sibling of the consultant report rather than a different
 * product. Content comes from the pure model in
 * `src/utils/monitoringReportModel.js`; this file only packages it.
 */

import { Document, Packer } from 'docx'
import { DOCX_STYLES } from './styles'
import { BODY_SECTION_PROPERTIES, LETTER_BODY_PAGE } from './page-setup'
import { reportSectionAttachments } from './report-chrome'
import { monitoringReportChildren } from './sections-monitoring'
import { buildMonitoringReportModel, MONITORING_REPORT_VERSION } from '../../utils/monitoringReportModel'

/** File name for a generated report — safe for every OS. */
export function monitoringReportFileName(model, ext = 'docx') {
  const site = String((model && model.cover && model.cover.site) || 'Monitoring')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'Monitoring'
  const edition = model && model.edition === 'technical' ? '-Technical' : ''
  return `AtmosFlow-Monitoring-Report-${site}${edition}.${ext}`
}

/**
 * Build the report as a `docx` Document.
 *
 * @param {object} model a monitoring report model
 * @param {object} [opts]
 * @param {string} [opts.firm] firm name for the running header
 * @param {string} [opts.clientName] for the running footer
 */
export function buildMonitoringReportDocument(model, opts = {}) {
  const chrome = reportSectionAttachments({
    firm: opts.firm || 'Prudence EHS',
    clientName: opts.clientName || (model && model.cover && model.cover.preparedFor) || '',
  })

  return new Document({
    creator: 'AtmosFlow — Prudence EHS',
    title: `${(model && model.title) || 'Indoor Environmental Monitoring Report'}${
      model && model.cover && model.cover.site ? ` — ${model.cover.site}` : ''
    }`,
    description: `Indoor Environmental Monitoring Report (${MONITORING_REPORT_VERSION})`,
    styles: DOCX_STYLES,
    sections: [
      {
        properties: { ...BODY_SECTION_PROPERTIES, page: { ...LETTER_BODY_PAGE, pageNumbers: { start: 1 } } },
        children: monitoringReportChildren(model),
        ...chrome,
      },
    ],
  })
}

/**
 * Build the report and return it as a Blob, without downloading.
 * Used by the share path and by the PDF step.
 */
export async function getMonitoringReportBlob(session, opts = {}) {
  const model = opts.model || buildMonitoringReportModel(session, opts)
  const doc = buildMonitoringReportDocument(model, opts)
  return { blob: await Packer.toBlob(doc), model }
}

/**
 * Generate and download the report.
 *
 * @param {object} session a MonitoringSession
 * @param {object} [opts] as `buildMonitoringReportModel`, plus firm/clientName
 * @returns {Promise<{fileName: string, model: object}>}
 */
export async function generateMonitoringReport(session, opts = {}) {
  const { blob, model } = await getMonitoringReportBlob(session, opts)
  const fileName = monitoringReportFileName(model)

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
