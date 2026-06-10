/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * loggerChartImages — guarantee that every logger timeline the assessor
 * flagged "Include in report" actually carries a usable PNG by the time a
 * report is generated.
 *
 * Why this exists
 * ---------------
 * Report inclusion is a two-part contract: a graph must be flagged
 * (`graphs[id].include === true`) AND carry a rasterized figure
 * (`graphs[id].imageDataUrl`). The DOCX appendix, the AtmosFlow PDF
 * (`loggerImages`), and the Web report all embed that PNG; the live
 * Logger result tab re-renders from points, so it shows the chart even
 * when the PNG is missing — which is exactly how a graph can read
 * "IN REPORT" in-app yet vanish from the exported file.
 *
 * Historically the PNG was captured with html2canvas the moment the
 * toggle flipped. That capture is unreliable on iOS Safari (and the
 * results-tab toggle never captured at all), so included graphs routinely
 * reached export with no image and were silently dropped.
 *
 * This module removes that fragility. At export time it re-renders each
 * included, re-derivable timeline off-screen with the light report palette
 * and rasterizes the chart's own inline <svg> via an Image + canvas round
 * trip — a self-contained SVG with no foreignObject, which iOS Safari
 * rasterizes reliably (unlike html2canvas over mixed SVG/HTML). The result
 * is written back onto `graphs[id].imageDataUrl`, so every downstream
 * report consumer embeds a correct, current figure.
 *
 * Re-derivable here: the per-parameter timelines (CO₂, temp/RH, PM, CO,
 * TVOC, formaldehyde) and the multi-parameter comparison, all driven by
 * the primary dataset's points. The cross-dataset overlays (indoor/outdoor
 * differential, zone comparison) depend on aligned datasets computed in
 * Logger Studio, so their previously captured image is preserved as-is and
 * never overwritten.
 */

import { createElement } from 'react'
import { normalizeSensorData, primaryDataset } from './sensorParser'
import { GRAPH_DEFS, MultiParameterChart, LIGHT_PALETTE } from '../components/sensor/SensorCharts'

// Match the on-screen capture footprint (SensorDataPage CAP_W/CAP_H) so the
// report figure keeps the ~2.27:1 aspect the DOCX/PDF layouts expect.
const CHART_W = 664
const CHART_H = 284
const RASTER_SCALE = 2

const isUsableImage = (s) => typeof s === 'string' && s.startsWith('data:image')

/**
 * Serialize a live <svg> element to a white-background PNG data URL.
 *
 * Self-contained SVG → base64 data URL → <img> → canvas → toDataURL is the
 * reliable cross-browser raster path (notably on iOS Safari, where
 * html2canvas over Recharts' SVG+HTML legend frequently fails). The chart's
 * inline <svg> carries its own geometry and colors, so nothing external is
 * referenced. The series legend is intentionally omitted from the figure —
 * report consumers print the parameter list as a caption beneath it.
 */
function defaultRasterizeSvg(svgEl, width, height) {
  return new Promise((resolve) => {
    try {
      if (typeof document === 'undefined' || typeof Image === 'undefined') { resolve(null); return }
      const clone = svgEl.cloneNode(true)
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      clone.setAttribute('width', String(width))
      clone.setAttribute('height', String(height))
      const xml = new XMLSerializer().serializeToString(clone)
      // encodeURIComponent + unescape keeps multibyte glyphs (µ, ₂, °) valid
      // through btoa, which only accepts latin1.
      const src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)))
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = width * RASTER_SCALE
          canvas.height = height * RASTER_SCALE
          const ctx = canvas.getContext('2d')
          if (!ctx) { resolve(null); return }
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.scale(RASTER_SCALE, RASTER_SCALE)
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/png'))
        } catch { resolve(null) }
      }
      img.onerror = () => resolve(null)
      img.src = src
    } catch { resolve(null) }
  })
}

// Wait for React to commit and Recharts to draw, then hand back the chart's
// <svg>. Polls a bounded number of animation frames so a slow first paint
// doesn't yield an empty element, and bails (null) rather than hang.
function waitForChartSvg(host, maxFrames = 30) {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'undefined') { resolve(host.querySelector('svg')); return }
    let frames = 0
    const tick = () => {
      const svg = host.querySelector('svg')
      // A drawn Recharts line chart has at least one <path>; wait for it so we
      // never rasterize an empty axis frame.
      if (svg && svg.querySelector('path')) { resolve(svg); return }
      if (++frames >= maxFrames) { resolve(svg || null); return }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

// Default renderer: mount the chart element off-screen with createRoot,
// rasterize its SVG, unmount. Isolated behind a parameter so the selection
// logic can be unit-tested without a real DOM/canvas.
async function defaultRenderChartToPng(element) {
  if (typeof document === 'undefined') return null
  const { createRoot } = await import('react-dom/client')
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${CHART_W}px;height:${CHART_H}px;background:#FFFFFF;pointer-events:none;`
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    root.render(element)
    const svg = await waitForChartSvg(host)
    if (!svg) return null
    return await defaultRasterizeSvg(svg, CHART_W, CHART_H)
  } catch {
    return null
  } finally {
    try { root.unmount() } catch { /* noop */ }
    host.remove()
  }
}

// Build the chart element for a re-derivable included graph, or null when the
// graph isn't one we can redraw from the primary dataset here.
function chartElementFor(id, ds, env) {
  const common = {
    data: ds.points,
    hasTs: ds.hasTimestamps,
    units: ds.units || {},
    palette: LIGHT_PALETTE,
    width: CHART_W,
    height: CHART_H,
    occupancy: Array.isArray(env.occupancyWindows) ? env.occupancyWindows : [],
  }
  const refs = env.thresholds || { co2: true }
  if (id === 'multi') {
    const stored = env.graphs.multi && env.graphs.multi.params
    const params = (Array.isArray(stored) && stored.length) ? stored : (ds.params || []).slice(0, 3)
    if (!params.length) return null
    return { element: createElement(MultiParameterChart, { ...common, params }), title: 'Multi-Parameter Comparison', series: null }
  }
  const def = GRAPH_DEFS.find((g) => g.id === id)
  if (!def || !def.needs(ds.params || [])) return null
  return {
    element: createElement(def.Chart, { ...common, showRefs: !!refs[def.refKey] }),
    title: def.title,
    series: def.series,
  }
}

/**
 * Return a copy of `sensorData` in which every included, re-derivable logger
 * timeline carries a freshly rendered `imageDataUrl`. Cross-dataset overlays
 * keep their existing captured image. The original object is never mutated;
 * when nothing needs rendering (or rendering fails) the original images are
 * preserved so an export never loses a figure it already had.
 *
 * @param sensorData              v1 or v2 logger envelope (with `.graphs`)
 * @param opts.renderChartToPng   injected renderer (testing seam)
 */
export async function ensureLoggerChartImages(sensorData, opts = {}) {
  const renderChartToPng = opts.renderChartToPng || defaultRenderChartToPng
  if (!sensorData || typeof sensorData !== 'object' || !sensorData.graphs) return sensorData

  const env = normalizeSensorData(sensorData)
  const ds = primaryDataset(env)
  if (!ds || !Array.isArray(ds.points) || ds.points.length === 0) return sensorData

  // Included graphs that need an image. Fill-only-when-missing: a capture that
  // failed (iOS) left no image at all, so this catches every broken case;
  // preserving an existing usable image avoids regressing a good capture
  // (which carries the on-screen legend this point-driven raster omits).
  // Cross-dataset overlays (co2-diff, zones-*) depend on aligned datasets
  // computed in Logger Studio and cannot be re-derived here, so they are left
  // to whatever image they already captured.
  const included = Object.entries(sensorData.graphs || {}).filter(([id, st]) => {
    if (!st || !st.include) return false
    if (isUsableImage(st.imageDataUrl)) return false
    if (id === 'co2-diff' || id.startsWith('zones-')) return false
    return true
  })
  if (!included.length) return sensorData

  const nextGraphs = { ...sensorData.graphs }
  let changed = false
  for (const [id, st] of included) {
    const spec = chartElementFor(id, ds, env)
    if (!spec) continue
    const png = await renderChartToPng(spec.element)
    if (!isUsableImage(png)) continue // keep any existing image on failure
    nextGraphs[id] = {
      ...st,
      imageDataUrl: png,
      title: st.title || spec.title,
      ...(spec.series && !st.series ? { series: spec.series } : null),
    }
    changed = true
  }
  return changed ? { ...sensorData, graphs: nextGraphs } : sensorData
}
