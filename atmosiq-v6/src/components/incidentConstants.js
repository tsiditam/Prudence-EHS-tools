/**
 * Shared incident constants. The severity→colour map was defined
 * identically in IncidentLog.jsx and IncidentDetail.jsx. Values are
 * theme CSS variables so they flip with light/dark mode.
 */
export const SEVERITY_COLOR = {
  minor: 'var(--dim)',
  moderate: 'var(--warn)',
  significant: 'var(--warn)',
  severe: 'var(--danger)',
  critical: 'var(--danger)',
}
