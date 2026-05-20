/**
 * Photo Analysis — client helper.
 *
 * Thin wrapper around POST /api/photo-analyze. Resolves to the
 * canonical PhotoAnalysis shape on success, or null on any failure
 * (rate limit, auth, network, server error). NEVER throws — the
 * caller (PhotoCapture) treats null as "save the photo without
 * analysis" and the rest of the pipeline continues unchanged.
 *
 * PhotoAnalysis shape (per api/photo-analyze.js):
 *   {
 *     observed: string,
 *     concerns: string[],
 *     probable_iaq_class: string | null,
 *     recommended_actions: string[],
 *     confidence: 'low' | 'medium' | 'high',
 *     citations: string[],
 *     disclaimers: string,
 *     ih_review_required: true,
 *     model: string,
 *     generated_at: string,
 *   }
 *
 * Per CLAUDE.md "screening-only" positioning, this output is
 * always rendered as "AI-PROPOSED · IH REVIEW REQUIRED" downstream
 * — never as an authoritative finding.
 */

import { supabase } from './supabaseClient'

/**
 * Analyze a single photo. Returns the analysis object or null.
 *
 * @param {string} imageDataUrl  base64 image data URL ("data:image/jpeg;base64,...")
 * @param {object} [opts]
 * @param {string} [opts.context]  optional free-text context the assessor can attach
 *                                 (e.g. "Zone A — supply diffuser drip pan area").
 * @returns {Promise<object | null>}
 */
export async function analyzePhoto(imageDataUrl, opts = {}) {
  if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
    return null
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return null
  }
  if (!supabase) {
    // Supabase not configured (likely dev/test without env vars). The
    // endpoint won't accept the request anyway; fall through silently.
    return null
  }
  let session
  try {
    const result = await supabase.auth.getSession()
    session = result && result.data && result.data.session
  } catch {
    return null
  }
  if (!session || !session.access_token) return null

  let response
  try {
    response = await fetch('/api/photo-analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        image: imageDataUrl,
        context: typeof opts.context === 'string' ? opts.context : null,
      }),
    })
  } catch {
    return null
  }
  if (!response || !response.ok) {
    // Rate-limit, server error, etc. — best-effort; let the caller
    // proceed without analysis.
    return null
  }
  try {
    const body = await response.json()
    if (body && body.analysis && typeof body.analysis === 'object') {
      return body.analysis
    }
  } catch {
    /* fall through */
  }
  return null
}

/**
 * Format a PhotoAnalysis confidence value into a human-readable
 * caption fragment. Used by both the UI thumbnail badge and the
 * DOCX caption rendering.
 */
export function confidenceLabel(confidence) {
  if (confidence === 'high') return 'high confidence'
  if (confidence === 'medium') return 'medium confidence'
  return 'low confidence'
}

/**
 * Cap text fragments at a length suitable for in-DOCX captions
 * (avoid pushing the row past the column width). Adds an ellipsis
 * when truncated.
 */
export function clampCaption(text, max = 160) {
  if (typeof text !== 'string') return ''
  if (text.length <= max) return text
  return text.slice(0, max - 1).trimEnd() + '…'
}
