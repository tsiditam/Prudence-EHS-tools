/**
 * AtmosFlow — Indoor Air Quality Monitoring Report generator.
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
import { BODY_SECTION_PROPERTIES, LETTER_BODY_PAGE } from './page-setup'
import { reportSectionAttachments } from './report-chrome'
import { monitoringReportChildren, MONITORING_DOCX_STYLES } from './sections-monitoring'
import { buildMonitoringReportModel, MONITORING_REPORT_VERSION } from '../../utils/monitoringReportModel'
import { renderMonitoringCharts, renderSparklines } from '../../utils/monitoringChart'
import { primaryDataset } from '../../utils/monitoringSession'

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
    title: (model && model.title) || 'Indoor Air Quality Monitoring Report',
    // The facts that repeat on every page, so a sheet on its own still says
    // what it belongs to.
    ribbon: (model && model.ribbon) || [],
    // This document is ONE section, so the page total is NUMPAGES. Asking for
    // SECTIONPAGES here is what left "Page 6 of " with the total missing.
    sectionRelativeTotal: false,
  })

  return new Document({
    creator: 'AtmosFlow — Prudence EHS',
    title: `${(model && model.title) || 'Indoor Air Quality Monitoring Report'}${
      model && model.cover && model.cover.site ? ` — ${model.cover.site}` : ''
    }`,
    description: `Indoor Air Quality Monitoring Report (${MONITORING_REPORT_VERSION})`,
    styles: MONITORING_DOCX_STYLES,
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
 * Draw each parameter's figure and attach it to the model.
 *
 * Done here rather than in the model so the model stays pure and testable
 * without a canvas, but done by DEFAULT rather than on request: a caller who
 * forgets to pass `charts` should still get a report with its figures, not a
 * silently text-only one.
 *
 * Returns the model unchanged where charts were supplied, or where no canvas
 * is available (a server-side render, for instance) — the sections omit a
 * missing figure rather than reserving a blank.
 */
export function attachMonitoringCharts(model, session, opts = {}) {
  if (!model || (opts.charts && Object.keys(opts.charts).length)) return model
  const params = (model.parameters || []).map((p) => ({
    param: p.param,
    unit: p.unit,
    reference: p.reference ? { limit: p.reference.limit, band: p.reference.band } : null,
  }))
  if (!params.length) return model

  const dataset = primaryDataset(session)
  const points = (dataset && dataset.points) || []
  const charts = renderMonitoringCharts(params, points, {
    occupancy: (session && session.occupancySchedule) || [],
    events: ((session && session.events) || []).map((e) => ({ t: e.t, label: e.label })),
    utcOffsetMin: model.utcOffsetMin,
    width: opts.chartWidth,
    height: opts.chartHeight,
  })
  // The strip's sparklines come from the same pass, so a report can never end
  // up with figures but no shape marks (or the reverse).
  const sparks = renderSparklines(params, points)
  if (!Object.keys(charts).length && !Object.keys(sparks).length) return model

  return {
    ...model,
    parameters: model.parameters.map((p) => ({
      ...p,
      chart: charts[p.param] || p.chart || null,
      spark: sparks[p.param] || p.spark || null,
    })),
  }
}

/**
 * Build the report and return it as a Blob, without downloading.
 * Used by the share path and by the PDF step.
 */
export async function getMonitoringReportBlob(session, opts = {}) {
  const built = opts.model || buildMonitoringReportModel(session, opts)
  const model = attachMonitoringCharts(built, session, opts)
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
