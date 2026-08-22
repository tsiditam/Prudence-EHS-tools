/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * buildAssessmentContext — the single normalization seam between raw
 * client/app assessment state and every downstream consumer (Jasper,
 * narrative generation, report rendering, Logger Studio, future
 * server-side revalidation).
 *
 * Pure function: same input → same output, no I/O, no React, no DOM.
 * It COMPOSES existing pure helpers rather than recomputing anything:
 *   • buildReadinessVerdict()      src/engines/readiness-verdict.js
 *   • summarizeLoggerForContext()  lib/jasper/logger-context-summary.ts
 *   • ENGINE_VERSION               src/version.js
 * Engine outputs (composite, zoneScores, recs, narrative, …) pass
 * through unchanged — they are already the engine's contract.
 *
 * Engine-sacred boundary: this builder READS engine outputs and calls
 * the existing readiness inspector. It performs no scoring and writes
 * nothing back. The output type (AssessmentContext) is fully readonly.
 *
 * This is PR A of the connectivity-layer plan: types + builder + test.
 * No consumer is migrated yet — Jasper still hand-builds its literal
 * in MobileApp.jsx. PR B migrates Jasper onto this builder once the
 * golden-fixture test proves the shape is stable.
 */

import { ENGINE_VERSION } from '../../src/version.js'
import { resolveLifecycle } from '../../src/constants/reportLifecycle.js'
import { normalizeAcknowledgement } from '../../src/utils/calibrationAcknowledgement.js'
import { buildReadinessVerdict } from '../../src/engines/readiness-verdict.js'
import {
  deriveInvestigation,
  type CausalChainLike, type InvestigationState, type SamplingPlanLike,
} from '../../src/engine/investigation'
import { summarizeLoggerForContext } from '../jasper/logger-context-summary'
import { parsePhotoKey } from '../../src/utils/photoIndex.js'
import { FIELD_REGISTRY, getField, SCOPE_PRESURVEY } from '../../src/constants/field-registry.js'
import type {
  NarrativeInput, NarrativeInputs, PhotoAnalysisSummary,
  AssessmentContext,
  CalibrationAcknowledgementSummary,
  FindingSummary,
  PhotoIndexEntry,
  RawAssessmentState,
  ReadinessVerdict,
  ZoneSummary,
} from './types'

const SURFACED_SEVERITIES = new Set(['critical', 'high', 'medium', 'low'])

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return null
}

function firstStr(...vals: unknown[]): string | null {
  for (const v of vals) {
    const s = str(v)
    if (s) return s
  }
  return null
}

function zoneLabel(zone: Record<string, unknown> | undefined, index: number): string | null {
  if (!zone) return null
  return firstStr(zone.zn, zone.zid) || `Zone ${index + 1}`
}

/** Roll up the zone-score result tree into a flat finding list. */
function rollUpFindings(
  zoneScores: unknown,
  zones: Array<Record<string, unknown>>,
): FindingSummary[] {
  if (!Array.isArray(zoneScores)) return []
  const out: FindingSummary[] = []
  zoneScores.forEach((zs, i) => {
    const label = zoneLabel(zones[i], i)
    const cats = (zs && typeof zs === 'object' && Array.isArray((zs as { cats?: unknown }).cats))
      ? ((zs as { cats: Array<{ r?: unknown }> }).cats)
      : []
    for (const cat of cats) {
      const results = Array.isArray(cat?.r) ? cat.r : []
      for (const r of results) {
        if (!r || typeof r !== 'object') continue
        const row = r as Record<string, unknown>
        const sev = str(row.sev)?.toLowerCase() || null
        if (!sev || !SURFACED_SEVERITIES.has(sev)) continue
        out.push({
          severity: sev,
          title: firstStr(row.t, row.title, row.label),
          location: firstStr(row.location, row.surface_or_asset),
          zone_label: label,
          qualitative_only:
            row.qualitative_only === true ||
            str(row.confidenceTier) === 'qualitative_only',
        })
      }
    }
  })
  return out
}

/** Character budgets. Free text is carried, not carried wholesale. */
const MAX_NARRATIVE_FIELD_CHARS = 600
const MAX_NARRATIVE_BLOCK_CHARS = 4000
const MAX_PHOTO_OBSERVED_CHARS = 400
const MAX_PHOTO_CONCERNS = 5

/**
 * Truncate on a word boundary, reporting whether anything was cut.
 *
 * The ellipsis counts against `max`. It is emitted text, so a caller
 * decrementing a budget by `text.length` must not be handed `max + 1` — that is
 * a one-character overrun per field, which is how a bounded block quietly stops
 * being bounded.
 */
function clamp(value: unknown, max: number): { text: string; cut: boolean } {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (max <= 0) return { text: '', cut: raw.length > 0 }
  if (raw.length <= max) return { text: raw, cut: false }
  const body = raw.slice(0, max - 1)
  const at = body.lastIndexOf(' ')
  return { text: `${(at > max * 0.6 ? body.slice(0, at) : body).trimEnd()}…`, cut: true }
}

function photoAnalysis(photo: Record<string, unknown> | undefined): PhotoAnalysisSummary | null {
  const a = photo?.aiAnalysis as Record<string, unknown> | undefined
  if (!a || typeof a !== 'object') return null
  const concerns = Array.isArray(a.concerns)
    ? a.concerns.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        .slice(0, MAX_PHOTO_CONCERNS)
    : []
  return {
    observed: clamp(a.observed, MAX_PHOTO_OBSERVED_CHARS).text || null,
    concerns,
    probable_iaq_class: firstStr(a.probable_iaq_class) || null,
    confidence: firstStr(a.confidence) || null,
  }
}

/**
 * Build the photo index — identity + what the analysis saw, never the bytes.
 *
 * The key is `z{zoneIndex}-{fieldId}`, so the group already knows which zone it
 * belongs to and which question prompted it. Both were being discarded: every
 * entry came through as `{id, label: null, count}` because `label` read
 * `arr[0].label ?? arr[0].caption`, and the capture path writes neither.
 */
function buildPhotoIndex(
  photos: Record<string, Array<Record<string, unknown>>> | undefined,
): PhotoIndexEntry[] {
  if (!photos || typeof photos !== 'object') return []
  const out: PhotoIndexEntry[] = []
  for (const key of Object.keys(photos)) {
    const arr = Array.isArray(photos[key]) ? photos[key] : []
    if (arr.length === 0) continue
    const parsed = parsePhotoKey(key)
    const field = parsed ? getField(parsed.fieldId) : null
    out.push({
      id: key,
      label: firstStr(arr[0]?.label, arr[0]?.caption) || null,
      count: arr.length,
      zone_index: parsed ? parsed.zoneIndex : null,
      field_id: parsed ? parsed.fieldId : null,
      field_label: field?.label ?? null,
      analysis: photoAnalysis(arr[0]),
    })
  }
  return out
}

/**
 * Carry the assessor's prose.
 *
 * Every free-narrative field in the questionnaire was previously read by
 * nothing — no engine, no renderer — and `AssessmentContext` carried none of
 * it, so the one consumer that could actually use prose could not see it.
 *
 * The field list is DERIVED from FIELD_REGISTRY on `control === 'ta'`. A new
 * textarea question is picked up without editing this file. Single-line `text`
 * fields are excluded on purpose: they are names, addresses and serial numbers
 * — identity, already carried under `project` and `meta`.
 */
function buildNarrativeInputs(
  presurvey: Record<string, unknown>,
  building: Record<string, unknown>,
  zones: Array<Record<string, unknown>>,
): NarrativeInputs {
  const fields: NarrativeInput[] = []
  const zone_notes: Array<{ zone_index: number; zone_label: string | null; text: string }> = []
  let truncated = false
  let budget = MAX_NARRATIVE_BLOCK_CHARS

  const take = (value: unknown): string | null => {
    if (budget <= 0) { if (firstStr(value)) truncated = true; return null }
    const { text, cut } = clamp(value, Math.min(MAX_NARRATIVE_FIELD_CHARS, budget))
    if (cut) truncated = true
    if (!text) return null
    budget -= text.length
    return text
  }

  // Zone notes first: they are the most specific thing the assessor wrote, and
  // a budget spent on building-level prose should not crowd them out.
  zones.forEach((z, i) => {
    const text = take(z?.znt)
    if (text) zone_notes.push({ zone_index: i, zone_label: zoneLabel(z, i), text })
  })

  for (const contract of FIELD_REGISTRY as ReadonlyArray<{
    id: string; label: string; scope: string; control?: string
  }>) {
    if (contract.control !== 'ta') continue
    if (contract.id === 'znt') continue // carried per-zone above
    const source = contract.scope === SCOPE_PRESURVEY ? presurvey : building
    const text = take(source?.[contract.id])
    if (!text) continue
    fields.push({ field_id: contract.id, label: contract.label, scope: contract.scope, text })
  }

  return { fields, zone_notes, truncated }
}

function buildZoneSummaries(
  zones: Array<Record<string, unknown>>,
  curZone: number,
): ZoneSummary[] {
  return zones.map((z, i) => ({
    index: i,
    id: firstStr(z?.zid),
    label: zoneLabel(z, i),
    use: firstStr(z?.use, z?.zoneType, z?.zt),
    is_current: i === curZone,
    notes: clamp(z?.znt, MAX_NARRATIVE_FIELD_CHARS).text || null,
  }))
}

/**
 * Build the canonical AssessmentContext from raw app state. Defensive
 * against partial drafts: every section degrades to null / empty
 * rather than throwing, so the builder is safe to call on the
 * dashboard before a draft is hydrated.
 */
export function buildAssessmentContext(state: RawAssessmentState): AssessmentContext {
  const s = state || {}
  const presurvey = (s.presurvey || {}) as Record<string, unknown>
  const building = (s.bldg || s.building || {}) as Record<string, unknown>
  const client = (s.client || {}) as Record<string, unknown>
  const zones = Array.isArray(s.zones) ? s.zones : []
  const curZone = typeof s.curZone === 'number' ? s.curZone : -1
  const composite = s.comp ?? s.composite ?? null
  // Has the engine run? This used to be `composite != null`, which made a
  // computed composite the proxy for "the engine produced outputs". With
  // no composite computed, that proxy answers `false` forever — and the
  // readiness verdict below, plus the `engine_outputs` flag every
  // downstream consumer reads, would silently switch off. Zone
  // assessments are the actual evidence that the engine ran.
  const hasEngineOutputs = Array.isArray(s.zoneScores) && s.zoneScores.length > 0

  // Where the investigation stands. Derived BEFORE the readiness verdict
  // because the verdict reads it: an explanation left live and never
  // measured against is a defensibility gap, and only this state knows
  // which those are. See the note at the original derivation site below —
  // moved up here, unchanged, purely for ordering.
  let investigation: InvestigationState | null = null
  if (zones.length > 0) {
    try {
      investigation = deriveInvestigation({
        zonesData: zones,
        buildingData: building,
        zoneScores: Array.isArray(s.zoneScores) ? s.zoneScores : undefined,
        samplingPlan: (s.samplingPlan as SamplingPlanLike | null | undefined) ?? null,
        causalChains: Array.isArray(s.causalChains)
          ? (s.causalChains as ReadonlyArray<CausalChainLike>)
          : null,
      })
    } catch {
      investigation = null
    }
  }

  // Readiness verdict — only meaningful once the engine has assessed the
  // zones. Mirrors the gating MobileApp.jsx applies today.
  let readiness_verdict: ReadinessVerdict | null = null
  if (hasEngineOutputs) {
    try {
      readiness_verdict = buildReadinessVerdict({
        assessmentMode: s.assessmentMode || 'SCREENING',
        presurvey,
        building,
        client: client && Object.keys(client).length ? client : (building.client || {}),
        zones,
        zoneScores: s.zoneScores,
        recs: s.recs,
        photos: s.photos,
        photoOverrides: s.photoOverrides,
        confidence: s.confidence,
        profile: s.profile ? { name: (s.profile as Record<string, unknown>).name } : null,
        investigation,
      }) as ReadinessVerdict
    } catch {
      readiness_verdict = null
    }
  }

  // Logger Studio summary — reuse the already-capped summarizer.
  let logger_data_summary = null
  try {
    logger_data_summary = summarizeLoggerForContext(s.sensorData as never)
  } catch {
    logger_data_summary = null
  }

  const lifecycle = resolveLifecycle(s as Record<string, unknown>)

  // snake_case here, camelCase in the storage shape: the context is a
  // published contract read by Jasper and the report path, and every
  // other field in it is snake_case. Renaming at this seam is cheaper
  // than one inconsistent key forever.
  const ack = normalizeAcknowledgement(s.calibrationAcknowledgement) as {
    version: number
    items: string[]
    justification: string
    assessorName: string | null
    assessorCredentials: string | null
    acknowledgedAt: string | null
  } | null
  const calibration_acknowledgement: CalibrationAcknowledgementSummary | null = ack
    ? {
        version: ack.version,
        items: ack.items,
        justification: ack.justification,
        assessor_name: ack.assessorName,
        assessor_credentials: ack.assessorCredentials,
        acknowledged_at: ack.acknowledgedAt,
      }
    : null

  return {
    meta: {
      id: firstStr((s as { id?: unknown }).id),
      draft_id: firstStr(s.draftId),
      mode: s.assessmentMode || 'SCREENING',
      engine_version: ENGINE_VERSION,
      generated_at: new Date().toISOString(),
      view: firstStr(s.view),
      // Tolerant of records predating the lifecycle: resolveLifecycle
      // derives the state from the legacy `status` column when the
      // explicit fields are absent.
      report_profile: lifecycle.profile,
      report_status: lifecycle.status,
    },
    project: {
      client:
        firstStr(client.name, client.organization, building.client_name,
          presurvey.ps_recipient_organization, presurvey.ps_recipient_firm),
      requested_by: firstStr(presurvey.ps_requested_by, presurvey.ps_requestor),
      recipient: {
        name: firstStr(presurvey.ps_recipient_name, client.name),
        firm: firstStr(presurvey.ps_recipient_firm, presurvey.ps_recipient_organization, client.organization),
        email: firstStr(presurvey.ps_recipient_email, client.email),
        phone: firstStr(presurvey.ps_recipient_phone, client.phone),
      },
    },
    building: {
      name: firstStr(building.fn, building.name, presurvey.ps_site_name),
      address: firstStr(building.address, building.addr, presurvey.ps_site_address),
      type: firstStr(building.type, building.facilityType, building.ft, presurvey.ps_facility_type),
      sqft: firstStr(building.sqft, building.area, presurvey.ps_sqft),
      profile: firstStr(building.profile, building.buildingProfile),
    },
    zones: buildZoneSummaries(zones, curZone),
    walkthrough_findings: rollUpFindings(s.zoneScores, zones),
    logger_data_summary,
    photos: buildPhotoIndex(s.photos),
    narrative_inputs: buildNarrativeInputs(presurvey, building, zones),
    engine_outputs: hasEngineOutputs
      ? {
          zone_scores: s.zoneScores ?? null,
          composite,
          recommendations: s.recs ?? null,
          sampling_plan: s.samplingPlan ?? null,
          narrative: s.narrative ?? null,
          causal_chains: s.causalChains ?? null,
        }
      : null,
    readiness_verdict,
    report_draft_state: s.reportDraftState
      ? {
          format: firstStr(s.reportDraftState.format),
          options: s.reportDraftState.options || null,
          last_exported_at: firstStr(s.reportDraftState.last_exported_at),
        }
      : null,
    calibration_acknowledgement,
    investigation,
  }
}
