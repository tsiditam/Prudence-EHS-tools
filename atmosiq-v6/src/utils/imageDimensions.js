/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * imageDimensions — the pixel size of an image data URL, read from the file
 * header without a DOM.
 *
 * The DOCX renderer sizes every embedded picture explicitly (`ImageRun`
 * takes a width and a height, and Word draws exactly that box), so an image
 * whose aspect ratio is not known is drawn distorted. The logger charts and
 * site photographs are rendered at fixed sizes the app controls; a client's
 * floor plan is whatever shape they uploaded. This reads that shape from
 * the bytes so the report model — which runs without a browser, in tests and
 * in any server-side render — can fit the figure to the page correctly.
 *
 * Supports PNG, JPEG, GIF, BMP and WebP. Returns null for anything else, or
 * for a header too damaged to read, and never throws.
 */

const HEAD_BYTES = 256 * 1024 // JPEG EXIF blocks can push the size marker this far in

// Decode the first `limit` bytes of a base64 payload. `atob` needs whole
// quartets, so the slice is aligned to four characters.
function headBytes(base64, limit) {
  const chars = Math.min(base64.length, Math.ceil((limit * 4) / 3))
  const aligned = chars - (chars % 4)
  const bin = atob(base64.slice(0, aligned))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const u16be = (b, i) => (b[i] << 8) | b[i + 1]
const u32be = (b, i) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3])
const u16le = (b, i) => b[i] | (b[i + 1] << 8)
const u24le = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
const u32le = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0
const ascii = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n))

function png(b) {
  if (b.length < 24) return null
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (!sig.every((v, i) => b[i] === v)) return null
  return { width: u32be(b, 16), height: u32be(b, 20) }
}

function gif(b) {
  if (b.length < 10 || ascii(b, 0, 4) !== 'GIF8') return null
  return { width: u16le(b, 6), height: u16le(b, 8) }
}

function bmp(b) {
  if (b.length < 26 || ascii(b, 0, 2) !== 'BM') return null
  // Height is signed; negative means top-down rows.
  const h = u32le(b, 22)
  return { width: u32le(b, 18), height: h > 0x7fffffff ? 0x100000000 - h : h }
}

function jpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue } // padding between segments
    const marker = b[i + 1]
    if (marker === 0xff) { i++; continue }
    // Start-of-frame markers carry the dimensions: C0–C3, C5–C7, C9–CB, CD–CF.
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (sof) return { height: u16be(b, i + 5), width: u16be(b, i + 7) }
    if (marker === 0xd9 || marker === 0xda) return null // end of image / scan data: no frame header seen
    const len = u16be(b, i + 2)
    if (len < 2) return null
    i += 2 + len
  }
  return null
}

function webp(b) {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null
  const chunk = ascii(b, 12, 4)
  if (chunk === 'VP8 ') return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
  if (chunk === 'VP8L') {
    const bits = u32le(b, 21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 }
  return null
}

const valid = (d) => (d && Number.isFinite(d.width) && Number.isFinite(d.height) && d.width > 0 && d.height > 0 ? d : null)

/**
 * @param {string} dataUrl  `data:image/...;base64,...`
 * @returns {{width:number, height:number}|null}
 */
export function imageDimensions(dataUrl) {
  if (typeof dataUrl !== 'string' || typeof atob !== 'function') return null
  const m = /^data:image\/[a-z0-9.+-]+;base64,/i.exec(dataUrl)
  if (!m) return null
  try {
    const b = headBytes(dataUrl.slice(m[0].length), HEAD_BYTES)
    return valid(png(b) || gif(b) || bmp(b) || webp(b) || jpeg(b))
  } catch {
    return null
  }
}

/**
 * Scale `dims` to fit inside a box, preserving aspect ratio and never
 * enlarging. Null in, null out.
 *
 * @returns {{width:number, height:number}|null} integer pixels
 */
export function fitWithin(dims, maxWidth, maxHeight) {
  const d = valid(dims)
  if (!d) return null
  const scale = Math.min(1, maxWidth / d.width, maxHeight / d.height)
  return { width: Math.max(1, Math.round(d.width * scale)), height: Math.max(1, Math.round(d.height * scale)) }
}
