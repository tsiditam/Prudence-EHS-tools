/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * floorPlanFigure — the uploaded floor plan with the assessed zones drawn on
 * it, as one image the report can embed.
 *
 * The spatial map screen overlays zone pins on the plan as HTML positioned
 * by percentage. A Word document has no such overlay: an embedded picture is
 * a picture. So, at export time, this draws the plan onto a canvas, marks
 * each zone that was placed on it with a numbered pin, and hands back a
 * single raster plus its size. The report model keys the numbers to a table
 * of zone names beneath the figure.
 *
 * Browser-only (Image + canvas), like loggerChartImages. Every failure path
 * returns null so the caller falls back to the raw plan — which the model
 * still sizes correctly from its header (utils/imageDimensions) and lists
 * the sampled locations beneath, with their positions, so nothing recorded
 * is lost.
 *
 * The markers are identical and neutral. They carry a sequence number that
 * resolves through the table beneath the figure, and no severity — see
 * utils/samplePoints.js for why that encoding was retired.
 */

import { samplePoints } from './samplePoints'

const MAX_WIDTH = 1600 // px; larger plans are scaled down before pins are drawn
const PIN_FILL = '#2E7B9B' // report teal (sections-atmosflow TEAL)
const PIN_RING = '#FFFFFF'

const isImageDataUrl = (s) => typeof s === 'string' && s.startsWith('data:image/') && s.includes(';base64,')

function loadImage(src) {
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = src
    } catch {
      resolve(null)
    }
  })
}

/**
 * @param {string|{imageDataUrl:string}} floorPlan  the uploaded plan (data URL)
 * @param {Array} zones  assessment zones; those with mapX/mapY (%) are drawn
 * @param {object} opts  passed to samplePoints — `building` carries the
 *                       outdoor reference's position
 * @returns {Promise<{imageDataUrl:string, width:number, height:number, pinsDrawn:boolean}|null>}
 */
export async function composeFloorPlanFigure(floorPlan, zones = [], opts = {}) {
  const url = typeof floorPlan === 'string' ? floorPlan : floorPlan && floorPlan.imageDataUrl
  if (!isImageDataUrl(url)) return null
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null
  const img = await loadImage(url)
  if (!img || !img.naturalWidth || !img.naturalHeight) return null

  const pins = samplePoints(zones, opts)
  // No pins: the plan itself is the figure. Hand back its true size without
  // re-encoding — a JPEG plan re-saved as PNG can grow several-fold.
  if (!pins.length) return { imageDataUrl: url, width: img.naturalWidth, height: img.naturalHeight, pinsDrawn: false }

  try {
    const scale = Math.min(1, MAX_WIDTH / img.naturalWidth)
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)

    // Pin radius follows the plan's width so a marker reads the same on a
    // phone photo of a plan and on a 1600px CAD export.
    const r = Math.max(11, Math.round(w * 0.016))
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const p of pins) {
      const cx = (p.x / 100) * w
      const cy = (p.y / 100) * h
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = PIN_FILL
      ctx.fill()
      ctx.lineWidth = Math.max(2, r * 0.18)
      ctx.strokeStyle = PIN_RING
      ctx.stroke()
      ctx.fillStyle = PIN_RING
      ctx.font = `bold ${Math.round(r * 1.1)}px Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`
      ctx.fillText(String(p.n), cx, cy + r * 0.05)
    }
    // Keep a photographed plan as JPEG; line drawings stay PNG.
    const jpeg = /^data:image\/jpe?g/i.test(url)
    const out = jpeg ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png')
    if (!isImageDataUrl(out)) return null
    return { imageDataUrl: out, width: w, height: h, pinsDrawn: true }
  } catch {
    return null
  }
}
