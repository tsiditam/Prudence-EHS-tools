/**
 * AtmosFlow DOCX Report — Image Utilities
 * Converts base64 data URLs to Uint8Array for docx ImageRun
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
