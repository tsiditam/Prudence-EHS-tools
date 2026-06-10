/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Environmental Evidence Graphs — shared HTML builder for the Web report.
 *
 * The DOCX appendix (sections-sensor.js) and the AtmosFlow PDF (loggerImages)
 * both embed the logger timelines the assessor flagged "Include in report".
 * The Web (HTML) report previously had no equivalent section, so the same
 * charts were absent there. This module renders that section from the same
 * `sensorData.graphs` contract — an included graph carrying a usable PNG —
 * so all three export formats stay in lockstep.
 *
 * Screening / documentation only — the section carries the standing
 * disclaimer and makes no compliance determination.
 */

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c])

/**
 * The included logger graphs that carry a usable rasterized figure. Mirrors
 * the DOCX/PDF inclusion gate exactly: `include === true` AND a data-URL PNG.
 * Returns a plain array so callers (renderer, tests) share one definition.
 */
export function extractIncludedLoggerGraphs(sensorData) {
  const graphs = sensorData && sensorData.graphs
  if (!graphs || typeof graphs !== 'object') return []
  return Object.values(graphs)
    .filter((g) => g && g.include && typeof g.imageDataUrl === 'string' && g.imageDataUrl.startsWith('data:image'))
    .map((g) => ({
      title: g.title || 'Logger chart',
      series: Array.isArray(g.series) && g.series.length ? g.series : null,
      caption: g.caption && g.caption.trim() ? g.caption.trim() : '',
      imageDataUrl: g.imageDataUrl,
    }))
}

/**
 * Render the "Environmental Evidence Graphs" section, or '' when no included
 * graph carries an image. `dataSource` is an optional source-file label.
 *
 * The image `src` is an app-generated data-URL PNG and is emitted verbatim;
 * all author/parameter text is HTML-escaped.
 */
export function renderLoggerGraphsSectionHtml(graphs, opts = {}) {
  if (!Array.isArray(graphs) || !graphs.length) return ''
  const sub = 'font-size:10px;color:#5C6F7E;margin:4px 0 0;'
  const source = opts.dataSource
    ? `<p style="font-size:10px;color:#5C6F7E;margin:0 0 12px;">Data source: ${e(opts.dataSource)}</p>`
    : ''
  const figures = graphs.map((g) => `
    <figure style="margin:0 0 18px;page-break-inside:avoid;break-inside:avoid;">
      <figcaption style="font-size:12px;font-weight:600;color:#1E293B;margin-bottom:6px;">${e(g.title)}</figcaption>
      <img src="${g.imageDataUrl}" alt="${e(g.title)}" style="width:100%;height:auto;display:block;border:1px solid #E2E8F0;border-radius:4px;" />
      ${g.series ? `<p style="${sub}">Parameters: ${e(g.series.join(', '))}</p>` : ''}
      ${g.caption ? `<p style="font-size:11px;color:#475569;margin:6px 0 0;line-height:1.5;">${e(g.caption)}</p>` : ''}
    </figure>`).join('')
  return `
  <h2 class="pg-break" id="environmental-evidence-graphs">Environmental Evidence Graphs</h2>
  <p style="font-size:11px;color:#475569;margin-bottom:12px;line-height:1.5;">The following timelines were generated from uploaded sensor logger data for screening and documentation purposes. Interpretation should be reviewed by a qualified IAQ professional; AtmosFlow does not make compliance determinations.</p>
  ${source}
  ${figures}`
}

/** Convenience: extract + render in one call from raw sensorData. */
export function loggerGraphsSectionFromSensorData(sensorData, opts = {}) {
  return renderLoggerGraphsSectionHtml(extractIncludedLoggerGraphs(sensorData), opts)
}
