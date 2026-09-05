/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * siteSaveMessage — turn an /api/sites error code into a sentence an
 * assessor can act on.
 *
 * Why this exists: the save path did `throw new Error(json.error)`, so
 * whatever machine token the API returned became the entire user-facing
 * message. A field report showed the Save-site sheet displaying the word
 * "internal_error" under the cadence row — a string that names no cause,
 * suggests no next step, and looks like the app broke rather than like a
 * server that is not configured.
 *
 * Each message says what happened AND what to do, because the right
 * action differs sharply by code: retry, fix the name, sign in again, or
 * stop and tell an administrator. "Something went wrong" would collapse
 * all four.
 *
 * The assessment itself is already saved by the time this sheet appears
 * — it opens after the report row is persisted — so every message can
 * truthfully say the work is not lost. That is the single most useful
 * thing to tell someone whose save just failed.
 */

const MESSAGES = {
  // 503 — the deployment has no Supabase credentials. Retrying cannot
  // help and the assessor cannot fix it, so it says so plainly.
  not_configured:
    'Site library is unavailable on this build — the server is missing its database configuration. '
    + 'Your assessment is saved; ask an administrator to check the deployment environment.',
  // 401 — the access token expired mid-session.
  not_authenticated: 'Your session expired. Sign in again, then save the site from Settings → Sites.',
  invalid_token: 'Your session expired. Sign in again, then save the site from Settings → Sites.',
  // 400 — the assessor can fix these from the sheet.
  name_required: 'Enter a site name to save it to your library.',
  site_required: 'Enter a site name to save it to your library.',
  // 404 — editing a row that is gone.
  site_not_found: 'That site is no longer in your library. Save it as a new site instead.',
  // 500 — the query itself failed. Retrying is reasonable.
  insert_failed: 'Could not save the site. Your assessment is saved — retry from Settings → Sites.',
  update_failed: 'Could not update the site. Your assessment is saved — retry from Settings → Sites.',
  query_failed: 'Could not load your site library. Your assessment is saved — retry from Settings → Sites.',
  delete_failed: 'Could not remove that site. Try again from Settings → Sites.',
}

const FALLBACK =
  'Could not save the site. Your assessment is saved — you can retry from Settings → Sites.'

/**
 * @param {unknown} code   the `error` field from the API response
 * @param {number} [status] HTTP status, used only to sharpen the fallback
 * @returns {string} a sentence safe to render directly to the user
 */
export function siteSaveMessage(code, status) {
  if (typeof code === 'string' && MESSAGES[code]) return MESSAGES[code]
  // An unrecognised 5xx is still worth distinguishing from a 4xx: one is
  // worth retrying and the other probably is not.
  if (typeof status === 'number' && status >= 500) {
    return 'The server could not save the site right now. Your assessment is saved — retry from Settings → Sites.'
  }
  return FALLBACK
}

export default siteSaveMessage
