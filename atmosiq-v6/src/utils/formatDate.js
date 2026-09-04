/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * formatDate — the one place dates are formatted for the UI.
 *
 * Seven near-identical `fmtDate` / `formatDate` / `fD` helpers had grown
 * across MobileApp, projectsTheme, settingsHelpers, IncidentLog,
 * SimilarAssessmentsPanel, MoldModeScreen and IncidentDocxReport (audit
 * 2026-09 §6). They differed only in fallback text and whether an invalid
 * date became '' or "Invalid Date". Each call site keeps its exact
 * output through the options below; new code should call these directly.
 *
 *   formatDate('2026-09-04T10:00:00Z')            → 'Sep 4, 2026'
 *   formatDate(null, { fallback: '—' })            → '—'
 *   formatDateTime('2026-09-04T10:00:00Z')        → 'Sep 4, 2026, 10:00 AM' (en-US)
 *   formatShortDateTime(iso)                      → 'Sep 4, 10:00 AM' (device locale)
 *
 * Passing `locale: undefined` / `options: undefined` explicitly selects
 * the device default (what a bare toLocaleDateString() gives), which is
 * what the mold list and the incident DOCX have always shown.
 */

export const DATE_OPTIONS = Object.freeze({ month: 'short', day: 'numeric', year: 'numeric' })
export const DATETIME_OPTIONS = Object.freeze({ month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
export const SHORT_DATETIME_OPTIONS = Object.freeze({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const DEFAULT_LOCALE = 'en-US'

function toDate(value) {
  if (value == null || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Date only. `opts.fallback` is returned for null / empty / invalid input
 * (default ''). `opts.locale` and `opts.options` default to en-US
 * "Sep 4, 2026"; pass either as `undefined` in the object to use the
 * device default instead.
 */
export function formatDate(value, opts = {}) {
  const fallback = 'fallback' in opts ? opts.fallback : ''
  const d = toDate(value)
  if (!d) return fallback
  const locale = 'locale' in opts ? opts.locale : DEFAULT_LOCALE
  const options = 'options' in opts ? opts.options : DATE_OPTIONS
  try {
    return options === undefined && locale === undefined ? d.toLocaleDateString() : d.toLocaleDateString(locale, options)
  } catch {
    return fallback
  }
}

/** Date + time. Same option contract as formatDate. */
export function formatDateTime(value, opts = {}) {
  const fallback = 'fallback' in opts ? opts.fallback : ''
  const d = toDate(value)
  if (!d) return fallback
  const locale = 'locale' in opts ? opts.locale : DEFAULT_LOCALE
  const options = 'options' in opts ? opts.options : DATETIME_OPTIONS
  try {
    return options === undefined && locale === undefined ? d.toLocaleString() : d.toLocaleString(locale, options)
  } catch {
    return fallback
  }
}

/** "Sep 4, 10:00 AM" in the device locale — list rows where the year is noise. */
export function formatShortDateTime(value, opts = {}) {
  return formatDateTime(value, { locale: undefined, options: SHORT_DATETIME_OPTIONS, ...opts })
}

export default formatDate
