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
import { buildReadinessVerdict } from '../../src/engines/readiness-verdict.js'
import { summarizeLoggerForContext } from '../jasper/logger-context-summary'
import type {
  AssessmentContext,
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

/** Build the photo index — {id, label, count} per photo group, no bytes. */
function buildPhotoIndex(
  photos: Record<string, Array<Record<string, unknown>>> | undefined,
): PhotoIndexEntry[] {
  if (!photos || typeof photos !== 'object') return []
  const out: PhotoIndexEntry[] = []
  for (const key of Object.keys(photos)) {
    const arr = Array.isArray(photos[key]) ? photos[key] : []
    if (arr.length === 0) continue
    const label = firstStr(arr[0]?.label, arr[0]?.caption) || null
    out.push({ id: key, label, count: arr.length })
  }
  return out
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
  const hasEngineOutputs = composite != null

  // Readiness verdict — only meaningful once the engine has scored.
  // Mirrors the gating MobileApp.jsx applies today (comp present).
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

  return {
    meta: {
      id: firstStr((s as { id?: unknown }).id),
      draft_id: firstStr(s.draftId),
      mode: s.assessmentMode || 'SCREENING',
      engine_version: ENGINE_VERSION,
      generated_at: new Date().toISOString(),
      view: firstStr(s.view),
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
      type: firstStr(building.type, building.facilityType, presurvey.ps_facility_type),
      sqft: firstStr(building.sqft, building.area, presurvey.ps_sqft),
      profile: firstStr(building.profile, building.buildingProfile),
    },
    zones: buildZoneSummaries(zones, curZone),
    walkthrough_findings: rollUpFindings(s.zoneScores, zones),
    logger_data_summary,
    photos: buildPhotoIndex(s.photos),
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
  }
}
