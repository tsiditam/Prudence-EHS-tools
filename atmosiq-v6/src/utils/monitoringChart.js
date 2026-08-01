/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * monitoringChart — the figure for each parameter of the Indoor Environmental
 * Monitoring Report, drawn to a canvas and rasterized for the document.
 *
 * This is the chart from the reviewed design, not the app's on-screen
 * Recharts timeline: a print figure with the reference line, the marked
 * occupancy columns, the annotated event markers, and the labelled peak. It
 * is drawn with the 2D canvas API rather than SVG/DOM because the output is a
 * PNG for a Word document, and because a canvas render is identical in the
 * browser and in a headless build — no font-loading or layout race to lose.
 *
 * The drawing routine takes a context and a plain series, so the geometry can
 * be exercised without a DOM; only `renderMonitoringChart` needs a canvas.
 */

const isNum = (v) => v != null && Number.isFinite(v)

/** The figure's palette — the reviewed report colours. */
export const CHART_COLORS = {
  ink: '#0B1220',
  muted: '#8A929E',
  hair: '#E7EBEF',
  line: '#0891B2',
  fillTop: 'rgba(8,145,178,0.20)',
  fillBottom: 'rgba(8,145,178,0.02)',
  band: 'rgba(15,23,42,0.045)',
  reference: '#B45309',
  comfort: 'rgba(14,159,110,0.07)',
  comfortLine: '#0E9F6E',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The figure's drawing size, in CSS pixels.
 *
 * Exported because the DOCX layer sizes the embedded image from it: deriving
 * the printed height from this aspect means changing the canvas can never
 * silently stretch the figure on the page.
 */
export const CHART_SIZE = { width: 920, height: 360 }

/**
 * A "nice" axis: rounded bounds and a step that yields ~5–7 gridlines, so the
 * y-axis reads 400/600/800 rather than 437/611/785.
 */
export function niceScale(min, max, targetTicks = 7) {
  if (!isNum(min) || !isNum(max)) return { min: 0, max: 1, step: 1 }
  if (max === min) { max = min + 1 }
  const raw = (max - min) / targetTicks
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  // 2.5 is included so a range like 400–1800 lands on a 200 step rather than
  // jumping to 500 and flattening the trend.
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  let lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  // Never leave more than one empty step below the data: an axis that starts
  // at zero when the readings sit near 500 throws away half the plot and
  // visually flattens the very variation the figure exists to show.
  while (min - lo >= step) lo += step
  return { min: lo, max: hi, step }
}

/**
 * Format a value at the precision its axis step actually carries.
 *
 * Rounding to whole numbers on a 2.5 step would print the 67.5 gridline as
 * "68" — a gridline mislabelled by half a degree, which in a measurement
 * record is a defect, not a cosmetic one.
 */
export function axisFormat(v, step) {
  const decimals = Number.isInteger(step) ? 0 : step < 1 ? 2 : 1
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Site-local calendar day label, offset-explicit (no host-timezone reliance). */
function dayLabel(ms, utcOffsetMin) {
  const d = new Date(ms + utcOffsetMin * 60000)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

/** Midnight boundaries across the series, for the x-axis day ticks. */
function dayTicks(t0, t1, utcOffsetMin) {
  const out = []
  const DAY = 86400000
  const first = Math.floor((t0 + utcOffsetMin * 60000) / DAY) * DAY - utcOffsetMin * 60000
  for (let t = first; t <= t1 + DAY; t += DAY) {
    if (t >= t0 - DAY / 2 && t <= t1 + DAY / 2) out.push(t)
  }
  return out.slice(0, 8)
}

/**
 * Draw one parameter's figure.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} spec
 * @param {{t:number,v:number}[]} [spec.points] ascending readings
 * @param {number} [spec.width] CSS pixels
 * @param {number} [spec.height] CSS pixels
 * @param {number} [spec.limit] upper screening reference
 * @param {number[]} [spec.band] comfort range [lo, hi]
 * @param {string} [spec.referenceLabel]
 * @param {{start:number,end:number}[]} [spec.occupancy]
 * @param {{t:number,label:string}[]} [spec.events]
 * @param {number} [spec.utcOffsetMin]
 * @param {string} [spec.font] canvas font family
 */
export function drawMonitoringChart(ctx, spec = {}) {
  const pts = (spec.points || []).filter((p) => p && isNum(p.t) && isNum(p.v))
  const W = spec.width || CHART_SIZE.width
  const H = spec.height || CHART_SIZE.height
  const font = spec.font || 'Inter, Helvetica, Arial, sans-serif'
  const offset = isNum(spec.utcOffsetMin) ? spec.utcOffsetMin : 0
  const C = CHART_COLORS

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)
  if (pts.length < 2) return

  const padL = 62
  const padR = 18
  const padT = 26
  const padB = 34
  const x0 = padL
  const x1 = W - padR
  const y0 = padT
  const y1 = H - padB

  const t0 = pts[0].t
  const t1 = pts[pts.length - 1].t
  const vals = pts.map((p) => p.v)
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  // The reference must be visible even when no reading approached it —
  // a chart that crops its own reference line misleads.
  if (isNum(spec.limit)) hi = Math.max(hi, spec.limit)
  if (Array.isArray(spec.band)) { lo = Math.min(lo, spec.band[0]); hi = Math.max(hi, spec.band[1]) }
  const pad = (hi - lo) * 0.08 || 1
  const scale = niceScale(lo - pad, hi + pad)

  const X = (t) => x0 + ((t - t0) / (t1 - t0 || 1)) * (x1 - x0)
  const Y = (v) => y1 - ((v - scale.min) / (scale.max - scale.min || 1)) * (y1 - y0)

  // Marked occupancy — a neutral wash, kept quiet so the trend line stays
  // the dominant mark on the page.
  ctx.fillStyle = C.band
  ;(spec.occupancy || []).forEach((w) => {
    if (!isNum(w.start) || !isNum(w.end)) return
    const a = X(Math.max(w.start, t0))
    const b = X(Math.min(w.end, t1))
    if (b > a) ctx.fillRect(a, y0, b - a, y1 - y0)
  })

  // Gridlines + y labels
  ctx.font = `11px ${font}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'right'
  for (let v = scale.min; v <= scale.max + 1e-9; v += scale.step) {
    const y = Y(v)
    ctx.strokeStyle = C.hair
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()
    ctx.fillStyle = C.muted
    ctx.fillText(axisFormat(v, scale.step), x0 - 10, y)
  }

  // Day ticks
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = C.muted
  dayTicks(t0, t1, offset).forEach((t) => {
    const x = X(Math.min(Math.max(t, t0), t1))
    ctx.fillText(dayLabel(t, offset), x, y1 + 9)
  })

  // Comfort band, or the upper reference line.
  if (Array.isArray(spec.band) && isNum(spec.band[0]) && isNum(spec.band[1])) {
    ctx.fillStyle = C.comfort
    ctx.fillRect(x0, Y(spec.band[1]), x1 - x0, Y(spec.band[0]) - Y(spec.band[1]))
    ctx.strokeStyle = C.comfortLine
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1
    ctx.setLineDash([5, 4])
    ;[spec.band[0], spec.band[1]].forEach((b) => {
      ctx.beginPath()
      ctx.moveTo(x0, Y(b))
      ctx.lineTo(x1, Y(b))
      ctx.stroke()
    })
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    if (spec.referenceLabel) {
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.font = `10px ${font}`
      ctx.fillStyle = C.muted
      ctx.fillText(spec.referenceLabel, x0 + 5, Y(spec.band[1]) - 4)
    }
  } else if (isNum(spec.limit)) {
    ctx.strokeStyle = C.reference
    ctx.lineWidth = 1.4
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(x0, Y(spec.limit))
    ctx.lineTo(x1, Y(spec.limit))
    ctx.stroke()
    ctx.setLineDash([])
    if (spec.referenceLabel) {
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.font = `10px ${font}`
      ctx.fillStyle = C.reference
      ctx.fillText(spec.referenceLabel, x0 + 5, Y(spec.limit) - 4)
    }
  }

  // Area fill under the trend
  const grad = ctx.createLinearGradient(0, y0, 0, y1)
  grad.addColorStop(0, C.fillTop)
  grad.addColorStop(1, C.fillBottom)
  ctx.beginPath()
  ctx.moveTo(X(pts[0].t), Y(pts[0].v))
  pts.forEach((p) => ctx.lineTo(X(p.t), Y(p.v)))
  ctx.lineTo(X(t1), y1)
  ctx.lineTo(X(t0), y1)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  // Trend line
  ctx.beginPath()
  ctx.moveTo(X(pts[0].t), Y(pts[0].v))
  pts.forEach((p) => ctx.lineTo(X(p.t), Y(p.v)))
  ctx.strokeStyle = C.line
  ctx.lineWidth = 1.8
  ctx.lineJoin = 'round'
  ctx.stroke()

  // Annotated events — a dashed rule and a caret, labelled above the plot.
  ;(spec.events || []).forEach((e) => {
    if (!isNum(e.t) || e.t < t0 || e.t > t1) return
    const x = X(e.t)
    ctx.strokeStyle = C.ink
    ctx.globalAlpha = 0.32
    ctx.lineWidth = 1
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.moveTo(x, y0)
    ctx.lineTo(x, y1)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    ctx.fillStyle = C.ink
    ctx.beginPath()
    ctx.moveTo(x, y0 + 2)
    ctx.lineTo(x - 4, y0 - 5)
    ctx.lineTo(x + 4, y0 - 5)
    ctx.closePath()
    ctx.fill()
    if (e.label) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.font = `9.5px ${font}`
      ctx.fillStyle = C.muted
      ctx.fillText(e.label, x, y0 - 8)
    }
  })

  // The maximum, labelled — the single most-cited point on the figure.
  let peak = pts[0]
  pts.forEach((p) => { if (p.v > peak.v) peak = p })
  const px = X(peak.t)
  const py = Y(peak.v)
  ctx.fillStyle = C.line
  ctx.beginPath()
  ctx.arc(px, py, 3.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(px, py, 3.4, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = C.ink
  ctx.font = `600 10.5px ${font}`
  const right = px > W - 110
  ctx.textAlign = right ? 'right' : 'left'
  ctx.textBaseline = 'bottom'
  const peakText = `Max ${axisFormat(peak.v, scale.step)}`
  ctx.fillText(peakText, px + (right ? -7 : 7), py - 7)
}

/**
 * Render a parameter figure to a PNG data URL.
 *
 * Requires a canvas — in the SPA that is `document.createElement('canvas')`.
 * Returns null (rather than throwing) anywhere a canvas is unavailable, so a
 * report generated in a context without one simply omits its figures.
 *
 * @returns {string|null} a `data:image/png;base64,…` URL
 */
export function renderMonitoringChart(spec = {}) {
  if (typeof document === 'undefined' || !document.createElement) return null
  const W = spec.width || CHART_SIZE.width
  const H = spec.height || CHART_SIZE.height
  // 2× for a figure that stays crisp when Word scales it onto the page.
  const dpr = spec.scale || 2
  try {
    const canvas = document.createElement('canvas')
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.scale(dpr, dpr)
    drawMonitoringChart(ctx, { ...spec, width: W, height: H })
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/**
 * Figures for every parameter in a report model, keyed by parameter — the
 * shape `buildMonitoringReportModel` accepts as `opts.charts`.
 */
export function renderMonitoringCharts(params, points, opts = {}) {
  const out = {}
  ;(params || []).forEach((entry) => {
    if (!entry || !entry.param) return
    const series = (points || [])
      .filter((p) => p && isNum(p.t) && isNum(p[entry.param]))
      .map((p) => ({ t: p.t, v: p[entry.param] }))
    if (series.length < 2) return
    const ref = entry.reference || {}
    const url = renderMonitoringChart({
      points: series,
      limit: ref.limit,
      band: ref.band,
      referenceLabel: ref.band
        ? `${ref.band[0]}–${ref.band[1]} ${entry.unit || ''}`.trim()
        : isNum(ref.limit)
          ? `${ref.limit.toLocaleString('en-US')} ${entry.unit || ''} reference`.trim()
          : null,
      occupancy: opts.occupancy,
      events: opts.events,
      utcOffsetMin: opts.utcOffsetMin,
      width: opts.width,
      height: opts.height,
    })
    if (url) out[entry.param] = url
  })
  return out
}
