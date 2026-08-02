/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * imageAttachments — get a field photo down to a size the chat can send.
 *
 * ── The problem this solves ────────────────────────────────────────────
 *
 * The attachment path caps a photo at ~2 MB, because five of them plus the
 * conversation have to fit inside the serverless body limit. A phone
 * camera produces 3–5 MB. So the single most common thing a field user can
 * do — photograph an AHU and attach it — used to fail with "resize and
 * retry", which on a phone, standing on a roof, is not an instruction
 * anyone can follow.
 *
 * Downscaling in the browser fixes it outright: the vision model receives
 * a bounded image regardless, so nothing analytically useful is lost by
 * doing that reduction here rather than server-side.
 *
 * ── Why it still asks first ────────────────────────────────────────────
 *
 * Because the photo is evidence. This module will happily rewrite a
 * user's image, and in a product whose whole positioning rests on
 * defensible documentation, silently altering an attachment is not a
 * decision a utility function gets to make. The caller prompts; this only
 * does the work when told to.
 *
 * ── HEIC ───────────────────────────────────────────────────────────────
 *
 * The iPhone default. Safari can decode it because the system codec is
 * there; other browsers cannot, and no amount of canvas work changes
 * that. So HEIC is attempted rather than assumed, and a failure produces
 * a specific message instead of a generic rejection.
 */

/** Formats the chat API accepts once the file reaches it. */
export const SENDABLE_MIME = ['image/jpeg', 'image/png', 'image/webp']

/** Longest edge, in pixels, a downscaled photo is fitted into. */
export const TARGET_MAX_EDGE = 2000

/** JPEG quality steps tried, in order, when squeezing to a byte budget. */
const QUALITY_STEPS = [0.82, 0.7, 0.58, 0.45]

/** Ceiling on a single decode, so a stuck decoder cannot hang the UI. */
const DECODE_TIMEOUT_MS = 15_000

const isHeicName = (name) => /\.(heic|heif)$/i.test(name || '')

/** Whether the file is an iPhone-native HEIC/HEIF. */
export function isHeic(file) {
  if (!file) return false
  return isHeicName(file.name) || /heic|heif/i.test(file.type || '')
}

/**
 * Whether a file needs conversion or shrinking before it can be sent.
 *
 * Deliberately narrow: only HEIC (which the chat API cannot take and
 * which is the iPhone default) and an otherwise-valid photo that is
 * merely too big. Every other unsupported format keeps the explicit
 * rejection it has always had — quietly re-encoding whatever a user
 * drops would be a wider behaviour change than the problem justifies,
 * and a format we cannot decode would fail later and less clearly.
 */
export function needsProcessing(file, maxBytes) {
  if (!file) return false
  if (isHeic(file)) return true
  return SENDABLE_MIME.includes(file.type) && file.size > maxBytes
}

/** True when the only problem is size — used to word the prompt. */
export function isOversizeOnly(file, maxBytes) {
  if (!file) return false
  return SENDABLE_MIME.includes(file.type) && file.size > maxBytes
}

/** Human file size, for the confirmation prompt. */
export function formatBytes(n) {
  if (!Number.isFinite(n)) return ''
  if (n < 1000) return `${n} B`
  if (n < 1_000_000) return `${Math.round(n / 1000)} KB`
  return `${(n / 1_000_000).toFixed(1)} MB`
}

/**
 * Decode a file to something drawable.
 *
 * `createImageBitmap` is preferred: it handles EXIF orientation, decodes
 * off the main thread, and is the only path that reaches Safari's HEIC
 * decoder. The `<img>` fallback covers older engines.
 */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // Fall through — a HEIC on a browser without the codec lands here.
    }
  }
  if (typeof Image === 'undefined' || typeof URL === 'undefined') {
    throw new Error('No image decoder available.')
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      // A decoder that neither loads nor errors would leave the whole
      // attach path pending forever, and the composer would just sit
      // there with no chip and no message. Bound it.
      const timer = setTimeout(() => reject(new Error('decode_timeout')), DECODE_TIMEOUT_MS)
      const done = (fn) => (v) => { clearTimeout(timer); fn(v) }
      img.onload = done(() => resolve(img))
      img.onerror = done(() => reject(new Error('decode_failed')))
      img.src = url
    })
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

function drawToCanvas(source, maxEdge) {
  const w = source.width || source.naturalWidth
  const h = source.height || source.naturalHeight
  if (!w || !h) throw new Error('Image had no dimensions.')
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable.')
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function canvasToDataUrl(canvas, quality) {
  return canvas.toDataURL('image/jpeg', quality)
}

/** Decoded byte count behind a base64 data URL. */
export function dataUrlBytes(dataUrl) {
  const i = typeof dataUrl === 'string' ? dataUrl.indexOf(',') : -1
  if (i < 0) return 0
  return Math.floor(((dataUrl.length - i - 1) * 3) / 4)
}

/**
 * Convert and/or shrink a photo until it fits `maxBytes`.
 *
 * Resolution is reduced first and quality second, because for the thing
 * these photos are for — reading a label, seeing the extent of staining —
 * a slightly softer 2000px image is more useful than a crisp 900px one.
 *
 * @param {File} file
 * @param {object} opts
 * @param {number} opts.maxBytes
 * @param {number} [opts.maxEdge]
 * @returns {Promise<{dataUrl: string, bytes: number, width: number, height: number, originalBytes: number}>}
 */
export async function processImage(file, opts = {}) {
  const maxBytes = Number.isFinite(opts.maxBytes) ? opts.maxBytes : 2_000_000
  let maxEdge = Number.isFinite(opts.maxEdge) ? opts.maxEdge : TARGET_MAX_EDGE

  let source
  try {
    source = await decode(file)
  } catch {
    throw new Error(
      isHeicName(file.name)
        ? 'This browser cannot read HEIC photos. On iPhone, set Camera → Formats to "Most Compatible", or share the photo as JPEG.'
        : 'Could not read that image.',
    )
  }

  // Four edge sizes × four qualities is enough to bring any phone photo
  // under a 2 MB budget; the loop stops at the first fit.
  for (let pass = 0; pass < 4; pass++) {
    const canvas = drawToCanvas(source, maxEdge)
    for (const q of QUALITY_STEPS) {
      const dataUrl = canvasToDataUrl(canvas, q)
      const bytes = dataUrlBytes(dataUrl)
      if (bytes <= maxBytes) {
        if (source.close) source.close()
        return {
          dataUrl,
          bytes,
          width: canvas.width,
          height: canvas.height,
          originalBytes: file.size,
        }
      }
    }
    maxEdge = Math.round(maxEdge * 0.7)
  }

  if (source.close) source.close()
  throw new Error('Could not compress that photo small enough to send.')
}
