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

// Type set inside the figure. The live charts use `var(--font-sans)`, which
// an <img>-loaded SVG cannot resolve (no CSS custom properties, no web
// fonts), so the serialized figure names system faces instead.
const FIGURE_FONT = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
const SVG_NS = 'http://www.w3.org/2000/svg'

// Position of `el` relative to `host`, in CSS px. Off-screen the host is
// laid out for real, so bounding rects are exact; a DOM without layout
// (jsdom) reports zero-size rects, which callers treat as "unmeasured".
function defaultMeasure(el, host) {
  const r = el.getBoundingClientRect()
  const h = host.getBoundingClientRect()
  return { x: r.left - h.left, y: r.top - h.top, width: r.width, height: r.height }
}

/**
 * Compose one standalone SVG figure from a mounted Recharts chart.
 *
 * Recharts draws the plot as `<svg class="recharts-surface">` directly under
 * `.recharts-wrapper`, and the series legend as HTML *before* it in DOM
 * order, each legend item carrying its own 14×14 icon `<svg>`. So
 * `host.querySelector('svg')` on any chart with a legend (PM2.5/PM10,
 * temperature & RH, the multi-parameter comparison) returns a legend icon —
 * a single coloured stroke — and a raster of that, stretched to figure size,
 * is the solid coloured bar that shipped in reports until 2026-09. The
 * single-series charts have no legend and were never affected.
 *
 * This picks the plot surface(s) explicitly, places each at its laid-out
 * position (the small-multiple charts stack two panels), and redraws the
 * legend into the same SVG as text so a two-series figure names its lines —
 * the DOCX prints no series list beneath the image, so without this the
 * reader had colour alone.
 *
 * @param host       element the chart is mounted in
 * @param width      figure width (CSS px)
 * @param height     figure height (CSS px)
 * @param opts.measure   (el, host) → {x, y, width, height}; testing seam
 * @param opts.textColor legend label colour
 * @returns {string|null} serialized SVG, or null when no plot surface is drawn
 */
export function composeChartFigure(host, width, height, opts = {}) {
  const measure = opts.measure || defaultMeasure
  const textColor = opts.textColor || LIGHT_PALETTE.axis
  const surfaces = chartSurfaces(host)
  if (!surfaces.length || !surfaces.some((s) => s.querySelector('path'))) return null

  const doc = host.ownerDocument
  // Created in the SVG namespace, so serialization declares xmlns itself.
  const root = doc.createElementNS(SVG_NS, 'svg')
  root.setAttribute('width', String(width))
  root.setAttribute('height', String(height))
  root.setAttribute('viewBox', `0 0 ${width} ${height}`)

  // Plot surfaces, each nested at its own offset. Unmeasured (no layout):
  // stack them top to bottom by their declared heights, which is how the
  // small-multiple panels lay out anyway.
  let stackY = 0
  surfaces.forEach((svg) => {
    const m = measure(svg, host)
    const w = Number(svg.getAttribute('width')) || width
    const h = Number(svg.getAttribute('height')) || height
    const clone = svg.cloneNode(true)
    clone.removeAttribute('style') // width/height:100% would override the attributes
    clone.setAttribute('x', String(m.width ? m.x : 0))
    clone.setAttribute('y', String(m.height ? m.y : stackY))
    clone.setAttribute('width', String(w))
    clone.setAttribute('height', String(h))
    root.appendChild(clone)
    stackY += h
  })

  // Legend: one stroke + label per item, at the item's laid-out position.
  host.querySelectorAll('.recharts-legend-item').forEach((item) => {
    const icon = item.querySelector('svg')
    const mark = icon && icon.querySelector('line, path')
    const label = item.querySelector('.recharts-legend-item-text')
    const text = label ? String(label.textContent || '').trim() : ''
    if (!mark || !text) return
    const color = mark.getAttribute('stroke') || mark.getAttribute('fill') || textColor
    const mi = measure(icon, host)
    const mt = measure(label, host)
    if (!mi.width || !mt.width) return
    const cy = mi.y + mi.height / 2
    const line = doc.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', String(mi.x)); line.setAttribute('x2', String(mi.x + mi.width))
    line.setAttribute('y1', String(cy)); line.setAttribute('y2', String(cy))
    line.setAttribute('stroke', color); line.setAttribute('stroke-width', '2'); line.setAttribute('stroke-linecap', 'round')
    root.appendChild(line)
    const t = doc.createElementNS(SVG_NS, 'text')
    t.setAttribute('x', String(mt.x)); t.setAttribute('y', String(mt.y + mt.height / 2))
    t.setAttribute('dominant-baseline', 'central')
    t.setAttribute('font-size', '11'); t.setAttribute('font-family', FIGURE_FONT); t.setAttribute('fill', textColor)
    t.textContent = text
    root.appendChild(t)
  })

  return new XMLSerializer().serializeToString(root).replace(/var\(--font-sans\)/g, FIGURE_FONT)
}

// The plot surface(s) of a mounted chart, in document order (top panel
// first for stacked charts). Legend icons are also `svg.recharts-surface`,
// so the parent is the discriminator; the size fallback covers a wrapper
// markup change.
function chartSurfaces(host) {
  const direct = Array.from(host.querySelectorAll('.recharts-wrapper > svg.recharts-surface'))
  if (direct.length) return direct
  return Array.from(host.querySelectorAll('svg')).filter((s) => !s.closest('.recharts-legend-wrapper') && Number(s.getAttribute('width')) >= 100)
}

/**
 * Rasterize a standalone SVG document to a white-background PNG data URL.
 *
 * SVG → base64 data URL → <img> → canvas → toDataURL is the reliable
 * cross-browser raster path (notably on iOS Safari, where html2canvas over
 * Recharts' SVG+HTML legend frequently fails). The figure carries its own
 * geometry, colours and legend, so nothing external is referenced.
 */
function defaultRasterizeSvg(xml, width, height) {
  return new Promise((resolve) => {
    try {
      if (typeof document === 'undefined' || typeof Image === 'undefined') { resolve(null); return }
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

// Wait for React to commit and Recharts to draw every plot surface (a drawn
// line chart has at least one <path>; a stacked chart has one per panel), so
// we never rasterize an empty axis frame. Polls a bounded number of
// animation frames and then composes whatever is there rather than hang.
function waitForChartDrawn(host, maxFrames = 30) {
  return new Promise((resolve) => {
    const drawn = () => { const s = chartSurfaces(host); return s.length > 0 && s.every((svg) => svg.querySelector('path')) }
    if (typeof requestAnimationFrame === 'undefined') { resolve(drawn()); return }
    let frames = 0
    const tick = () => {
      if (drawn()) { resolve(true); return }
      if (++frames >= maxFrames) { resolve(false); return }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

// Default renderer: mount the chart element off-screen with createRoot,
// compose its figure, rasterize, unmount. Isolated behind a parameter so the
// selection logic can be unit-tested without a real DOM/canvas.
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
    await waitForChartDrawn(host)
    const xml = composeChartFigure(host, CHART_W, CHART_H)
    if (!xml) return null
    return await defaultRasterizeSvg(xml, CHART_W, CHART_H)
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
