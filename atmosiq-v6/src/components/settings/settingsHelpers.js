/**
 * Shared helpers for the Settings panels (Report Templates + Site
 * Library). Both panels previously defined byte-identical copies of
 * these.
 */

import { formatDate } from '../../utils/formatDate'

export async function getAuthHeader() {
  try {
    const session = await (await import('../../utils/cloudStorage')).default.getSession()
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : null
  } catch {
    return null
  }
}

// Single definition lives in src/utils/formatDate.js.
export const fmtDate = (iso) => formatDate(iso)
