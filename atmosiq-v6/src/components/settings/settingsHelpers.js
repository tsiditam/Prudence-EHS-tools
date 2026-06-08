/**
 * Shared helpers for the Settings panels (Report Templates + Site
 * Library). Both panels previously defined byte-identical copies of
 * these.
 */

export async function getAuthHeader() {
  try {
    const session = await (await import('../../utils/cloudStorage')).default.getSession()
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : null
  } catch {
    return null
  }
}

export function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
