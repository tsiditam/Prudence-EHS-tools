/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * assessmentDate — when the survey was actually conducted.
 *
 * Distinct from `ts`, which is stamped when the report is FINALIZED. They are
 * usually the same day and sometimes are not: a walkthrough on Thursday
 * finalized on Monday reported Monday as the assessment date, and if the two
 * fall either side of a month boundary the thermal-comfort season flips with
 * them (see comfortSeason in engines/scoring.js).
 *
 * Resolution order, most authoritative first:
 *   1. `presurvey.ps_survey_date` — what the assessor entered
 *   2. `ts` — the finalize timestamp, for records predating the field
 *   3. null — caller decides (the report prints today; scoring treats it live)
 *
 * Shared by PrintReport, DocxReport and the scoring path so all three answer
 * the question the same way. They each derived it separately before.
 *
 * Contact: tsidi@prudenceehs.com
 */

/** ISO-8601 date (YYYY-MM-DD) the assessment was conducted, or null. */
export function resolveAssessmentDate(data) {
  const entered = data?.presurvey?.ps_survey_date
  if (typeof entered === 'string' && entered.trim()) {
    const d = new Date(entered)
    if (!Number.isNaN(d.getTime())) return entered.slice(0, 10)
  }
  if (data?.ts) {
    const d = new Date(data.ts)
    if (!Number.isNaN(d.getTime())) return String(data.ts).slice(0, 10)
  }
  return null
}

/**
 * Long-form date for report chrome ("March 14, 2026").
 * Falls back to today so a draft preview never renders an empty date.
 */
export function formatAssessmentDate(data, fallbackToToday = true) {
  const iso = resolveAssessmentDate(data)
  const d = iso ? new Date(`${iso}T12:00:00`) : (fallbackToToday ? new Date() : null)
  if (!d || Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
