/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Share-or-download helper for generated PDFs / DOCX / etc.
 *
 * Prefers the Web Share API where available so iOS / Android users
 * land in the native share sheet (Save to Files, AirDrop, Mail,
 * Messages). Falls back to a synthesised <a download> click for
 * desktop browsers and older mobile WebViews.
 *
 * Originally lived inline in IncidentDocxReport.js; extracted here
 * so the new CoC form generators share the same delivery behavior
 * without duplicating ~25 LOC of share-API detection.
 */

export async function deliverFile(blob, filename) {
  // Web Share API path — only attempt when the platform reports both
  // share() AND canShare() for File payloads. Some browsers expose
  // share() for text/url only, so canShare() guards against that.
  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.share) {
    try {
      const file = new File([blob], filename, { type: blob.type })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename })
        return { delivered: 'share' }
      }
    } catch (err) {
      // User cancelled the share sheet — that's not an error worth
      // logging, just fall through to the download fallback so they
      // still get the file if they want it.
      if (err && err.name !== 'AbortError') {
        console.warn('[deliverFile] share failed, falling back to download:', err.message)
      } else {
        // User intentionally cancelled — don't surprise them with a
        // download. Return early.
        return { delivered: 'cancelled' }
      }
    }
  }

  // Anchor-download fallback.
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke after a tick so Safari has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { delivered: 'download' }
}
