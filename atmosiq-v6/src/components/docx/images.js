/**
 * AtmosFlow DOCX Report — Image Utilities
 * Converts base64 data URLs to Uint8Array for docx ImageRun, plus a
 * small helper that returns the image MIME type as the `type` field
 * the docx package expects (jpg | png | gif | bmp).
 */

export function base64ToUint8Array(dataUrl) {
  const base64 = dataUrl.split(',')[1]
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

/**
 * Extract the image-format token from a data URL header and map it
 * to the `type` string the docx package accepts on ImageRun:
 *   data:image/jpeg;base64,...  → 'jpg'
 *   data:image/png;base64,...   → 'png'
 *   data:image/webp;base64,...  → 'png' (treated as png — docx package
 *                                        doesn't have a 'webp' branch;
 *                                        the underlying bytes are still
 *                                        readable by Word)
 *
 * Falls back to 'png' on unrecognized inputs so the ImageRun still
 * renders rather than throwing during DOCX generation.
 */
export function inferImageType(dataUrl) {
  if (typeof dataUrl !== 'string') return 'png'
  const head = dataUrl.slice(0, 32).toLowerCase()
  if (head.includes('image/jpeg') || head.includes('image/jpg')) return 'jpg'
  if (head.includes('image/png')) return 'png'
  if (head.includes('image/gif')) return 'gif'
  if (head.includes('image/bmp')) return 'bmp'
  return 'png'
}

/**
 * True when the input looks like a usable image data URL the cover
 * page can embed. Treated as a defensive check so callers don't
 * have to gate on null + ''.startsWith() everywhere.
 */
export function isImageDataUrl(s) {
  return typeof s === 'string'
    && s.length > 32
    && s.startsWith('data:image/')
    && s.includes(';base64,')
}
