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

/**
 * The figure's palette — the report's five colours and nothing else.
 *
 * Cyan carries the data, amber the reference, green the comfort range, and
 * everything structural is a neutral grey. Restraint is the point: a figure
 * whose gridlines compete with its trend line is harder to read, not richer.
 */
export const CHART_COLORS = {
  ink: '#0B1220',
  muted: '#6B7480', // axis labels — darker than the old #8A929E, so they read
  hair: '#EEF1F4', // gridlines — softer, so they recede behind the data
  line: '#0891B2',
  // Conditional trace colours. The line stays teal in range; the span above the
  // selected reference (or outside the comfort band) turns amber; a span above a
  // defined higher action tier turns red. The colour encodes each READING
  // against the reference — the status chip carries the parameter-level verdict.
  excursion: '#D97706', // above the selected reference / outside the band
  action: '#DC2626', //    above a defined higher action/review tier
  fillTop: 'rgba(8,145,178,0.16)',
  fillBottom: 'rgba(8,145,178,0.01)',
  band: 'rgba(15,23,42,0.035)',
  reference: '#B45309',
  comfort: 'rgba(14,159,110,0.06)',
  comfortLine: '#0E9F6E',
}

/**
 * Line weights, in CSS pixels.
 *
 * The trend is drawn THINNER than the reference it is measured against. That
 * inverts the usual instinct and is deliberate: the reference is the one mark
 * a reader must not miss, and a hairline trend reads as data rather than as
 * decoration — the difference between a chart and a logger screenshot.
 */
const STROKE = { trend: 1.35, reference: 1.8, grid: 1, event: 1 }

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
 * The figure's label font, led by the document's own body face.
 *
 * The figure is rasterized in the browser and dropped into a document set in
 * Aptos, so its axis labels and captions sit on the same page as body text in
 * that face. A different family here reads as two documents spliced together.
 *
 * Unlike the DOCX layer this CAN be a stack, because it resolves in a browser
 * rather than through `w:rFonts`: Aptos where the machine has it, then the
 * product's screen font, then the platform grotesques.
 */
export const CHART_FONT = 'Aptos, Inter, Helvetica, Arial, sans-serif'

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
  const decimals = axisDecimals(step)
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/**
 * Exactly the decimal places a step needs, derived from the step itself.
 *
 * A fixed two places is right for a 2.5 step and wrong for a 0.005 one — a
 * formaldehyde axis in mg/m³ would then print 0.00, 0.01, 0.01, 0.02, with
 * adjacent gridlines carrying the SAME label. Reading a value off an axis
 * whose labels repeat is not possible, so the precision follows the step.
 *
 * Computed from the exponent rather than the string form: `niceScale` builds
 * its step as a multiplier times a power of ten, and at small magnitudes that
 * arithmetic leaves float noise (2.5e-3 becomes 0.0025000000000000005) that a
 * string-length count would turn into sixteen decimal places.
 */
export function axisDecimals(step) {
  if (!isNum(step) || step <= 0) return 0
  const exp = Math.floor(Math.log10(step))
  // The 2.5-style multiplier needs one place more than its magnitude implies.
  const base = step / Math.pow(10, exp)
  const extra = Math.abs(base - Math.round(base)) < 1e-9 ? 0 : 1
  return Math.max(0, -exp + extra)
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
 * The values a trace is split at so each span can be coloured against the
 * selected reference: a band's two edges, or an upper limit (plus a higher
 * action tier where one is defined). Sorted ascending.
 */
function traceThresholds(spec) {
  if (Array.isArray(spec.band) && isNum(spec.band[0]) && isNum(spec.band[1])) {
    return [spec.band[0], spec.band[1]].sort((a, b) => a - b)
  }
  if (isNum(spec.limit)) {
    return [spec.limit, isNum(spec.actionLimit) ? spec.actionLimit : null].filter(isNum).sort((a, b) => a - b)
  }
  return []
}

/**
 * The colour a reading of value `v` takes: teal in range, amber for an
 * excursion (above the upper reference, or outside the comfort band), red above
 * a defined higher action tier. One spike therefore colours only its own span,
 * never the whole trace — the amber "% above" of the strip and this amber span
 * tell the same story.
 */
function traceColor(v, spec, C) {
  if (Array.isArray(spec.band) && isNum(spec.band[0]) && isNum(spec.band[1])) {
    return v < spec.band[0] || v > spec.band[1] ? C.excursion : C.line
  }
  if (isNum(spec.limit)) {
    if (isNum(spec.actionLimit) && v >= spec.actionLimit) return C.action
    if (v >= spec.limit) return C.excursion
    return C.line
  }
  return C.line
}

/** Fractions in (0,1) where a segment from value `va` to `vb` crosses each
 * threshold, so the line can change colour exactly on the reference, not at the
 * next logged point. Sorted ascending. */
function segmentCuts(va, vb, thresholds) {
  const cuts = []
  for (const t of thresholds) {
    if ((va < t && vb > t) || (va > t && vb < t)) {
      const f = (t - va) / (vb - va)
      if (f > 0 && f < 1) cuts.push(f)
    }
  }
  return cuts.sort((a, b) => a - b)
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
 * @param {number} [spec.actionLimit] a higher action/review tier, where one is
 *   defined; readings above it draw red. Omitted → no red span.
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
  const font = spec.font || CHART_FONT
  const offset = isNum(spec.utcOffsetMin) ? spec.utcOffsetMin : 0
  const C = CHART_COLORS

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)
  if (pts.length < 2) return

  const padL = 70
  const padR = 26
  const padT = 34
  const padB = 42
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
  ctx.font = `12px ${font}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'right'
  for (let v = scale.min; v <= scale.max + 1e-9; v += scale.step) {
    const y = Y(v)
    ctx.strokeStyle = C.hair
    ctx.lineWidth = STROKE.grid
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()
    ctx.fillStyle = C.muted
    ctx.fillText(axisFormat(v, scale.step), x0 - 14, y)
  }

  // Day ticks
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = C.muted
  dayTicks(t0, t1, offset).forEach((t) => {
    const x = X(Math.min(Math.max(t, t0), t1))
    ctx.fillText(dayLabel(t, offset), x, y1 + 13)
  })

  // Comfort band, or the upper reference line.
  if (Array.isArray(spec.band) && isNum(spec.band[0]) && isNum(spec.band[1])) {
    ctx.fillStyle = C.comfort
    ctx.fillRect(x0, Y(spec.band[1]), x1 - x0, Y(spec.band[0]) - Y(spec.band[1]))
    ctx.strokeStyle = C.comfortLine
    ctx.globalAlpha = 0.6
    ctx.lineWidth = STROKE.reference
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
      ctx.font = `10.5px ${font}`
      ctx.fillStyle = C.muted
      ctx.fillText(spec.referenceLabel, x0 + 5, Y(spec.band[1]) - 4)
    }
  } else if (isNum(spec.limit)) {
    ctx.strokeStyle = C.reference
    ctx.lineWidth = STROKE.reference
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

  // Trend line, coloured per reading against the selected reference: teal in
  // range, amber across an excursion, red above a defined action tier. Each
  // segment is split exactly where it crosses a threshold, so only the
  // out-of-range span changes colour — a lone spike never tints the whole
  // trace, and a mostly-out-of-range series reads as mostly amber.
  const thresholds = traceThresholds(spec)
  ctx.lineWidth = STROKE.trend
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const stops = [0, ...segmentCuts(a.v, b.v, thresholds), 1]
    for (let s = 0; s < stops.length - 1; s++) {
      const f0 = stops[s]
      const f1 = stops[s + 1]
      const va = a.v + (b.v - a.v) * f0
      const vb = a.v + (b.v - a.v) * f1
      ctx.strokeStyle = traceColor((va + vb) / 2, spec, C)
      ctx.beginPath()
      ctx.moveTo(X(a.t + (b.t - a.t) * f0), Y(va))
      ctx.lineTo(X(a.t + (b.t - a.t) * f1), Y(vb))
      ctx.stroke()
    }
  }

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
      ctx.font = `10px ${font}`
      ctx.fillStyle = C.muted
      ctx.fillText(e.label, x, y0 - 8)
    }
  })

  // The maximum, labelled — the single most-cited point on the figure.
  let peak = pts[0]
  pts.forEach((p) => { if (p.v > peak.v) peak = p })
  const px = X(peak.t)
  const py = Y(peak.v)
  // The peak dot takes the colour of its own span — amber (or red) when the
  // maximum is itself an excursion, so the most-cited point reads true.
  ctx.fillStyle = traceColor(peak.v, spec, C)
  ctx.beginPath()
  ctx.arc(px, py, 3.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(px, py, 3.4, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = C.ink
  ctx.font = `600 11px ${font}`
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

/** The sparkline's drawing size, in CSS pixels. */
export const SPARK_SIZE = { width: 132, height: 26 }

/**
 * A sparkline: the shape of the series, with no axis and no scale.
 *
 * It sits under a summary figure and answers one question a single number
 * cannot — was that mean steady, or the midpoint of something swinging? It
 * carries no labels ON PURPOSE. A tiny chart with a readable axis invites
 * being read as a chart, and this one is 26 pixels tall; the real figure is
 * two inches below it and is where any value should be read from.
 */
export function drawSparkline(ctx, spec = {}) {
  const pts = (spec.points || []).filter(isNum)
  const W = spec.width || SPARK_SIZE.width
  const H = spec.height || SPARK_SIZE.height
  ctx.clearRect(0, 0, W, H)
  if (pts.length < 2) return

  const lo = Math.min(...pts)
  const hi = Math.max(...pts)
  const pad = 3
  const span = hi - lo || 1
  const X = (i) => (i / (pts.length - 1)) * W
  const Y = (v) => H - pad - ((v - lo) / span) * (H - pad * 2)

  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, CHART_COLORS.fillTop)
  grad.addColorStop(1, CHART_COLORS.fillBottom)
  ctx.beginPath()
  ctx.moveTo(X(0), Y(pts[0]))
  pts.forEach((v, i) => ctx.lineTo(X(i), Y(v)))
  ctx.lineTo(W, H)
  ctx.lineTo(0, H)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(X(0), Y(pts[0]))
  pts.forEach((v, i) => ctx.lineTo(X(i), Y(v)))
  ctx.strokeStyle = CHART_COLORS.line
  ctx.lineWidth = 1.1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()
}

/**
 * Evenly resample a series to `n` points, preserving its extremes.
 *
 * A sparkline is ~130 px wide, so drawing 4,000 readings into it wastes bytes
 * and renders as a solid block. Bucketing keeps the shape; carrying each
 * bucket's mean would flatten exactly the peaks the strip is reporting, so
 * the value furthest from the running mean wins each bucket.
 */
export function sparkSeries(points, param, n = 64) {
  const vals = (points || []).map((p) => (p ? p[param] : null)).filter(isNum)
  if (vals.length <= n) return vals
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const size = vals.length / n
  const out = []
  for (let i = 0; i < n; i++) {
    const slice = vals.slice(Math.floor(i * size), Math.max(Math.floor((i + 1) * size), Math.floor(i * size) + 1))
    let pick = slice[0]
    slice.forEach((v) => { if (Math.abs(v - mean) > Math.abs(pick - mean)) pick = v })
    out.push(pick)
  }
  return out
}

/** A sparkline as a PNG data URL, or null where no canvas exists. */
export function renderSparkline(points, opts = {}) {
  if (typeof document === 'undefined' || !document.createElement) return null
  const W = opts.width || SPARK_SIZE.width
  const H = opts.height || SPARK_SIZE.height
  const dpr = opts.scale || 3 // small marks need more of it to stay crisp
  try {
    const canvas = document.createElement('canvas')
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.scale(dpr, dpr)
    drawSparkline(ctx, { points, width: W, height: H })
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
      actionLimit: ref.actionLimit,
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

/**
 * Sparklines for every parameter, keyed the same way as the figures.
 *
 * Kept separate from `renderMonitoringCharts` rather than folded into it:
 * they are different marks with different jobs, and a caller that wants the
 * figures without the strip decoration should not have to pay for both.
 */
export function renderSparklines(params, points, opts = {}) {
  const out = {}
  ;(params || []).forEach((entry) => {
    if (!entry || !entry.param) return
    const series = sparkSeries(points, entry.param, opts.samples)
    if (series.length < 2) return
    const url = renderSparkline(series, opts)
    if (url) out[entry.param] = url
  })
  return out
}
