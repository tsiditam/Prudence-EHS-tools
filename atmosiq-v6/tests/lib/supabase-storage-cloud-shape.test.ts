/**
 * supabaseStorage seam: cloud row → app shape normalization.
 *
 * Pins the contract that a report PULLED DOWN from the cloud comes back in
 * the same camelCase shape the in-app report view reads. The `assessments`
 * table stores snake_case columns (zone_scores, composite, recommendations,
 * sampling_plan, causal_chains, osha_evals); without mapping these back,
 * openReport sees `zoneScores === undefined`, renderResults bails on
 * `!zoneScores.length`, and the report view renders nothing (dead tap).
 */
import { describe, it, expect } from 'vitest'
import Storage, { fromCloudRow, toPayload } from '../../src/utils/supabaseStorage.js'

function cloudRow() {
  return {
    id: 'A-1',
    user_id: 'u-1',
    status: 'complete',
    facility_name: 'One Lonely Plaza',
    facility_address: '1 Plaza Way',
    presurvey: { ps_recipient_name: 'Jane' },
    building: { fn: 'One Lonely Plaza' },
    zones: [{ zn: 'Zone A' }],
    photos: { 'z0-dp': [{ src: 'data:image/png;base64,AAAA', ts: '2026-05-27T10:00:00Z' }] },
    zone_scores: [{ zn: 'Zone A', tot: 62 }],
    composite: { tot: 62, risk: 'MODERATE' },
    osha_evals: [{ id: 'co2' }],
    recommendations: [{ id: 'r1' }],
    sampling_plan: { points: 3 },
    causal_chains: [{ id: 'c1' }],
    narrative: { summary: 'x' },
    score: 62,
    risk: 'MODERATE',
    updated_at: '2026-05-27T10:00:00Z',
  }
}

describe('fromCloudRow — cloud snake_case → app camelCase', () => {
  it('remaps the snake_case report columns so the report view can render', () => {
    const out = fromCloudRow(cloudRow())
    // The fields renderResults gates on / openReport reads:
    expect(out.zoneScores).toEqual([{ zn: 'Zone A', tot: 62 }])
    expect(out.zoneScores.length).toBeGreaterThan(0)
    expect(out.comp).toEqual({ tot: 62, risk: 'MODERATE' })
    expect(out.composite).toEqual({ tot: 62, risk: 'MODERATE' })
    expect(out.oshaEvals).toEqual([{ id: 'co2' }])
    expect(out.recs).toEqual([{ id: 'r1' }])
    expect(out.samplingPlan).toEqual({ points: 3 })
    expect(out.causalChains).toEqual([{ id: 'c1' }])
  })

  it('passes through fields that already share the app key', () => {
    const out = fromCloudRow(cloudRow())
    expect(out.id).toBe('A-1')
    expect(out.status).toBe('complete')
    expect(out.presurvey).toEqual({ ps_recipient_name: 'Jane' })
    expect(out.building).toEqual({ fn: 'One Lonely Plaza' })
    expect(out.zones).toEqual([{ zn: 'Zone A' }])
    expect(out.narrative).toEqual({ summary: 'x' })
    expect(out.ts).toBe('2026-05-27T10:00:00Z')
  })

  it('only emits cloud-backed keys, so spreading over a local copy keeps local-only fields', () => {
    const norm = fromCloudRow(cloudRow())
    expect('equipment' in norm).toBe(false)
    expect('floorPlan' in norm).toBe(false)
    const existingLocal = { id: 'A-1', equipment: [{ id: 'ahu-1' }], floorPlan: { url: 'x' } }
    const merged = { ...existingLocal, ...norm }
    expect(merged.equipment).toEqual([{ id: 'ahu-1' }])
    expect(merged.floorPlan).toEqual({ url: 'x' })
    expect(merged.zoneScores.length).toBe(1)
  })

  it('defaults missing collections so consumers never read undefined', () => {
    const out = fromCloudRow({ id: 'B-2', status: 'complete' })
    expect(out.zoneScores).toEqual([])
    expect(out.causalChains).toEqual([])
    expect(out.comp).toBeNull()
    expect(out.recs).toBeNull()
  })

  it('returns the input unchanged when it is not an object', () => {
    expect(fromCloudRow(null)).toBeNull()
    expect(fromCloudRow(undefined)).toBeUndefined()
  })
})

describe('toPayload — app-shape snapshot for the cloud payload column', () => {
  it('keeps every field except photos (which have their own column)', () => {
    const assessment = {
      id: 'A-1', status: 'complete',
      building: { fn: 'X' }, zones: [{ zn: 'Z' }],
      equipment: [{ id: 'ahu-1' }], floorPlan: { url: 'fp' },
      sensorData: { co2: 600 }, labResults: { rows: 2 },
      standardsManifest: { v: '2026-05' }, ver: '6.0.0',
      photos: { 'z0-dp': [{ src: 'data:...', ts: 't' }] },
    }
    const p = toPayload(assessment)
    expect(p.equipment).toEqual([{ id: 'ahu-1' }])
    expect(p.floorPlan).toEqual({ url: 'fp' })
    expect(p.sensorData).toEqual({ co2: 600 })
    expect(p.labResults).toEqual({ rows: 2 })
    expect(p.standardsManifest).toEqual({ v: '2026-05' })
    expect(p.ver).toBe('6.0.0')
    expect('photos' in p).toBe(false)
  })
})

describe('fromCloudRow — payload preference (lossless restore)', () => {
  function payloadRow() {
    return {
      id: 'A-1',
      status: 'complete',
      // Flattened columns are still written, but payload wins:
      zone_scores: [{ zn: 'stale' }],
      photos: { 'z0-dp': [{ src: 'data:img', ts: 't' }] },
      updated_at: '2026-05-27T12:00:00Z',
      payload: {
        id: 'A-1', status: 'complete',
        building: { fn: 'One Lonely Plaza' },
        zones: [{ zn: 'Zone A' }],
        zoneScores: [{ zn: 'Zone A', tot: 62 }],
        comp: { tot: 62, risk: 'MODERATE' },
        recs: [{ id: 'r1' }],
        equipment: [{ id: 'ahu-1' }],
        floorPlan: { url: 'fp' },
        sensorData: { co2: 600 },
        labResults: { rows: 2 },
        standardsManifest: { v: '2026-05' },
        ver: '6.0.0',
      },
    }
  }

  it('restores the full payload, preserving fields the flat columns drop', () => {
    const out = fromCloudRow(payloadRow())
    expect(out.equipment).toEqual([{ id: 'ahu-1' }])
    expect(out.floorPlan).toEqual({ url: 'fp' })
    expect(out.sensorData).toEqual({ co2: 600 })
    expect(out.labResults).toEqual({ rows: 2 })
    expect(out.standardsManifest).toEqual({ v: '2026-05' })
    expect(out.ver).toBe('6.0.0')
    // App-shape fields the report view reads:
    expect(out.zoneScores).toEqual([{ zn: 'Zone A', tot: 62 }])
    expect(out.comp).toEqual({ tot: 62, risk: 'MODERATE' })
  })

  it('overlays the photos column and the row id/status/ts onto the payload', () => {
    const out = fromCloudRow(payloadRow())
    expect(out.photos).toEqual({ 'z0-dp': [{ src: 'data:img', ts: 't' }] })
    expect(out.id).toBe('A-1')
    expect(out.status).toBe('complete')
    expect(out.ts).toBe('2026-05-27T12:00:00Z')
  })

  it('falls back to the snake_case mapping when payload is null (legacy rows)', () => {
    const legacy = { id: 'L-1', status: 'complete', zone_scores: [{ zn: 'Z' }], composite: { tot: 50 }, payload: null }
    const out = fromCloudRow(legacy)
    expect(out.zoneScores).toEqual([{ zn: 'Z' }])
    expect(out.comp).toEqual({ tot: 50 })
  })
})

describe('getRemoteAssessment — cloud-bypass fetch', () => {
  it('is exported and resolves null when no cloud is configured (offline-safe)', async () => {
    // jsdom has no VITE_SUPABASE_URL, so supabase is null → isOnline() false.
    // It must resolve null rather than throw, so openReport can fall through.
    expect(typeof Storage.getRemoteAssessment).toBe('function')
    await expect(Storage.getRemoteAssessment('rpt-x')).resolves.toBeNull()
  })
})
