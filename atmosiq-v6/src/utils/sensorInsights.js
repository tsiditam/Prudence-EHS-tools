/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Sensor-insights helpers for the AtmosFlow AI "draw insights from a
 * logger upload" action in the Sensor Data analyzer. Mirrors the
 * report-review pattern (utils/reportReview.js): the screening-only
 * directive lives here and rides the Field Assistant request context, so
 * the visible chat message stays a short prompt and no server change is
 * required — api/field-assistant.ts serializes the whole context object.
 *
 * Summary-only by design: we send the computed per-parameter statistics,
 * units, sampling metadata, and data-quality flags — never the raw time
 * series — to keep token cost / latency down and avoid shipping the log.
 */

export const SENSOR_INSIGHTS_CREDIT_COST = 1

// Directive the assistant follows when context.sensor_insights is present.
// Screening-only / advisory framing is non-negotiable; the per-parameter
// caveats mirror the rest of AtmosFlow (CO₂ as a ventilation indicator, not
// a contaminant limit; TVOC Mølhave advisory + reference-compound
// assumption; HCHO carcinogen + instrument caveats; PM2.5 regulatory
// context; occupational limits are time-weighted, not snapshot pass/fail).
export const SENSOR_INSIGHTS_INSTRUCTIONS = [
  'You are giving a SCREENING-LEVEL reading of indoor air quality (IAQ) logger data for a consultant. This is advisory only: you do not certify results and you do not make compliance, pass/fail, causation, or final IAQ determinations — a qualified professional confirms everything.',
  '',
  'The data in context.sensor_insights is a SUMMARY of one uploaded logger file (per-parameter mean/median/min/max/n, units, sampling interval and date range, and data-quality flags). You do NOT have the raw time series, so do not claim to see specific spikes at specific timestamps — speak to ranges, central tendency, and variability.',
  '',
  'Cover, where the data supports it:',
  '1. What the central values and ranges suggest at a screening level, per parameter, in the units provided.',
  '2. Data-quality caveats that affect interpretation (gaps, irregular intervals, flatlines, out-of-range values, short logging windows, missing timestamps).',
  '3. Relationships worth noting across parameters — framed as hypotheses to investigate, not conclusions.',
  '4. What the consultant should investigate or measure next.',
  '',
  'Parameter framing (do not violate):',
  '- CO₂ is a VENTILATION-EFFECTIVENESS indicator, not an air-quality contaminant; no current ASHRAE standard sets an indoor CO₂ limit (Persily 2021). Do not call a CO₂ value a violation.',
  '- TVOC is a mixture with no single limit; reference the Mølhave 1991 tiers as ADVISORY only, and note that any ppb↔µg/m³ figure assumes a reference compound (isobutylene).',
  '- Formaldehyde (HCHO) is an IARC Group 1 carcinogen; occupational limits (OSHA PEL, NIOSH REL ceiling) are TWA/ceiling values not directly comparable to a short logger mean, and consumer HCHO sensors have accuracy / cross-sensitivity limits (treat as qualitative).',
  '- PM2.5 NAAQS values are annual / 24-hour regulatory averages, not a snapshot pass/fail.',
  '- Occupational exposure limits are time-weighted; a logging-window mean is not a TWA.',
  '',
  'Output: a short, scannable screening read — central values + ranges, then data-quality caveats, then "what to check next". Do not invent values not present in the summary. End with a one-line reminder that this is a screening aid requiring professional review (IH Review Required).',
].join('\n')

/**
 * Build the summary-only payload sent to the assistant. Strips the raw
 * `points` series and `columns` — only stats, units, sampling metadata,
 * and quality flags travel. Returns null when there's nothing to analyze.
 */
export function buildSensorInsightsPayload(sensorData) {
  if (!sensorData || !sensorData.summary || !Array.isArray(sensorData.params) || sensorData.params.length === 0) {
    return null
  }
  const s = sensorData.summary
  return {
    fileName: sensorData.fileName || null,
    params: sensorData.params,
    units: sensorData.units || {},
    summary: {
      count: s.count,
      start: s.start,
      end: s.end,
      intervalSec: s.intervalSec,
      emptyRows: s.emptyRows,
      missing: s.missing || {},
      stats: s.stats || {},
    },
    quality: sensorData.quality
      ? { level: sensorData.quality.level, status: sensorData.quality.status, flags: sensorData.quality.flags || [] }
      : null,
    instructions: SENSOR_INSIGHTS_INSTRUCTIONS,
  }
}
