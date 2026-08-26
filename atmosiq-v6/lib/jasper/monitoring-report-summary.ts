/**
 * The Indoor Environmental Monitoring Report, projected for Jasper.
 *
 * ── Why this is not the document-review path ──────────────────────────────
 * PR #524 taught Jasper to read an attached PDF and review it by quoting and
 * verifying every quotation, because a third-party report is text and nothing
 * else — there is no structured record behind it to consult.
 *
 * This report is ours. `buildMonitoringReportModel(session, opts)` is a pure
 * function, so the session plus its generation options reproduce the issued
 * document exactly. Reading the model beats extracting the DOCX on every axis
 * that matters: it is lossless where extraction drops table structure, exact
 * where a model would have to re-read a rounded number off the page, and
 * cheap where a 40-page parse is not.
 *
 * The rule that follows: this module **re-derives nothing**. Every value here
 * is copied from the model the report was rendered from. If a number appears
 * in this projection that the report does not print, the two layers have begun
 * to disagree — which is the defect class this codebase keeps finding.
 *
 * ── Explain, do not critique ──────────────────────────────────────────────
 * Scope decision (2026-08): Jasper explains this report. It does not review
 * it. So this projection carries the report's own conclusions and prose and
 * adds no judgement of its own — no gap list, no severity, no "should have".
 * The constraint is restated as `usage_rules` on the tool result, because a
 * projection cannot enforce how it is read.
 *
 * The one thing that IS carried, because it is the report's own conclusion
 * and not a criticism of it: when the calibration on record does not cover the
 * monitoring period, `statusFor` withdraws the comparison to "Not Established"
 * and states why. That withdrawal is the most misreadable thing in the
 * document — the statistics still print, so a reader skimming numbers can
 * easily believe a comparison was made. Jasper must be able to say it was not.
 *
 * ── Budget ────────────────────────────────────────────────────────────────
 * This rides the per-turn context, so it is paid on every message whether or
 * not it is used. The knowledge-graph projection was ~33% of the payload for a
 * feature that was gated off (see CLAUDE.md), and that is the mistake to avoid.
 * Numbers are cheap and kept whole; prose is capped and reports its own
 * truncation, mirroring the narrative-block budget in buildAssessmentContext.
 */
import { buildMonitoringReportModel } from '../../src/utils/monitoringReportModel'

/** Prose characters across the whole projection, statements and insights. */
export const MAX_MONITORING_PROSE_CHARS = 3_000
/** Any single prose string. */
export const MAX_MONITORING_FIELD_CHARS = 400
/** Insights carried per parameter, worst-case 9 parameters. */
export const MAX_INSIGHTS_PER_PARAM = 3

export interface MonitoringParameterProjection {
  param: string
  label: string
  unit: string | null
  /** The report's own verdict. `Not Established` when calibration withdrew it. */
  status: { id: string; label: string; reason: string | null } | null
  reference: {
    label: string | null
    value: number | null
    band: [number, number] | null
    source: string | null
    criterion_id: string | null
  } | null
  stats: {
    n: number | null
    mean: number | null
    median: number | null
    min: number | null
    max: number | null
    max_at_iso: string | null
    p95: number | null
    pct_above: number | null
    pct_in_band: number | null
    time_above_seconds: number | null
  }
  occupancy: { mean_occupied: number | null; mean_unoccupied: number | null; delta: number | null } | null
  /** The sentence the report prints for this parameter. */
  statement: string | null
  insights: string[]
}

export interface MonitoringReportProjection {
  present: true
  generated_at: string | null
  file_name: string | null
  edition: string
  report_version: string
  dataset_hash: string | null
  site: string | null
  prepared_for: string | null
  period: string | null
  duration: string | null
  /** True when the report withheld every reference comparison. */
  qualitative_only: boolean
  calibration: { status: string | null; note: string | null }
  parameters: MonitoringParameterProjection[]
  highlights: string[]
  data_quality: Array<{ label: string; value: string }>
  limitations: string[]
  /** Prose was cut to fit the budget. Numbers are never cut. */
  truncated: boolean
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const num = (v: unknown): number | null => (isNum(v) ? v : null)

/**
 * Re-derives nothing: rebuilds the exact model the report was rendered from
 * and copies out of it. Returns null when no report has been issued.
 */
export function summarizeMonitoringReportForContext(
  record: unknown,
): MonitoringReportProjection | null {
  const r = record && typeof record === 'object' ? (record as Record<string, unknown>) : null
  if (!r || !r.session || typeof r.session !== 'object') return null

  let model: Record<string, unknown>
  try {
    // Same call the renderer makes, with the options the report was issued
    // under — so the projection is the issued document, not a fresh reading of
    // the data under today's defaults.
    model = buildMonitoringReportModel(r.session, (r.opts as object) || {}) as Record<string, unknown>
  } catch {
    // A malformed stored session must not take the whole Jasper context down
    // with it. The report simply reads as absent.
    return null
  }
  if (!model || typeof model !== 'object') return null

  let budget = MAX_MONITORING_PROSE_CHARS
  let truncated = false

  /** Spend from the shared prose budget. Returns null once it is exhausted. */
  const prose = (value: unknown): string | null => {
    const text = str(value).trim()
    if (!text) return null
    if (budget <= 0) { truncated = true; return null }
    const room = Math.min(MAX_MONITORING_FIELD_CHARS, budget)
    if (text.length > room) {
      truncated = true
      budget = 0
      return `${text.slice(0, room).trimEnd()}…`
    }
    budget -= text.length
    return text
  }

  const cover = (model.cover && typeof model.cover === 'object' ? model.cover : {}) as Record<string, unknown>

  const parameters = arr<Record<string, unknown>>(model.parameters).map((p) => {
    const stats = (p.stats && typeof p.stats === 'object' ? p.stats : {}) as Record<string, unknown>
    const ref = (p.reference && typeof p.reference === 'object' ? p.reference : null) as Record<string, unknown> | null
    const status = (p.status && typeof p.status === 'object' ? p.status : null) as Record<string, unknown> | null
    const occ = (stats.occupancy && typeof stats.occupancy === 'object' ? stats.occupancy : null) as Record<string, unknown> | null
    const band = Array.isArray(ref?.band) && (ref!.band as unknown[]).length === 2
      ? ([num((ref!.band as unknown[])[0]), num((ref!.band as unknown[])[1])] as [number | null, number | null])
      : null

    return {
      param: str(p.param),
      label: str(p.label) || str(p.titleLabel) || str(p.param),
      unit: str(p.unit) || null,
      status: status
        ? {
            id: str(status.id),
            label: str(status.label),
            // Carried verbatim. This is the sentence the report itself uses to
            // explain a withheld comparison, and it is rendered NOWHERE in the
            // document today — the badge says "Not Established" and the reason
            // never reaches the page. Jasper is currently the only surface that
            // can give a reader the why.
            reason: str(status.reason) || null,
          }
        : null,
      reference: ref
        ? {
            label: str(ref.label) || null,
            value: num(ref.limit),
            band: band && isNum(band[0]) && isNum(band[1]) ? ([band[0], band[1]] as [number, number]) : null,
            source: str(ref.source) || null,
            criterion_id: str(ref.criterionId) || null,
          }
        : null,
      stats: {
        n: num(stats.n),
        mean: num(stats.mean),
        median: num(stats.median),
        min: num(stats.min),
        max: num(stats.max),
        max_at_iso: isNum(stats.maxAt) ? new Date(stats.maxAt as number).toISOString() : null,
        p95: num(stats.p95),
        pct_above: num(stats.pctAbove),
        pct_in_band: num(stats.pctInBand),
        time_above_seconds: num(stats.timeAboveSec),
      },
      occupancy: occ
        ? {
            mean_occupied: num(occ.meanOccupied),
            mean_unoccupied: num(occ.meanUnoccupied),
            delta: num(occ.delta),
          }
        : null,
      statement: prose(p.statement),
      insights: arr<Record<string, unknown>>(p.insights)
        .slice(0, MAX_INSIGHTS_PER_PARAM)
        .map((i) => prose(i && i.text))
        .filter((t): t is string => !!t),
    }
  })

  return {
    present: true,
    generated_at: str(r.generatedAt) || null,
    file_name: str(r.fileName) || null,
    edition: str(model.edition) || 'client',
    report_version: str(model.version),
    dataset_hash: str((r.opts as Record<string, unknown> | undefined)?.datasetHash) || null,
    site: str(cover.site) || null,
    prepared_for: str(cover.preparedFor) || null,
    period: str(cover.period) || null,
    duration: str(cover.duration) || null,
    qualitative_only: model.qualitativeOnly === true,
    calibration: {
      status: str(model.calibrationStatus) || null,
      note: prose(model.calibrationNote),
    },
    parameters,
    highlights: arr<unknown>(model.highlights)
      .map((h) => prose(typeof h === 'string' ? h : (h as Record<string, unknown>)?.text))
      .filter((t): t is string => !!t),
    data_quality: arr<Record<string, unknown>>(model.dataQuality).map((d) => ({
      label: str(d.label),
      value: str(d.value),
    })),
    // Carried in full and never budgeted away: the limitations are what the
    // report says about the boundaries of its own data, and a reader asking
    // Jasper what the report means is exactly the reader who needs them.
    limitations: arr<unknown>(model.limitations).map((l) => str(l)).filter(Boolean),
    truncated,
  }
}
