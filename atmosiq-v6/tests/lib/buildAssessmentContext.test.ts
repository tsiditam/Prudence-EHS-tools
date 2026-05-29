/**
 * Golden-fixture tests for lib/context/buildAssessmentContext.ts.
 *
 * This is the drift guard for the connectivity layer. The builder is
 * the single seam every downstream consumer will read from; a silent
 * change to its output shape would ripple into Jasper, the report
 * renderer, and (later) server-side revalidation. These tests pin:
 *
 *   • An empty / partial draft produces a valid, fully-populated
 *     skeleton (every section present, nulls not throws).
 *   • A fully-hydrated assessment maps every section correctly:
 *     project / building identity, zone summaries, finding rollup
 *     (severity filter excludes pass/info), photo index (counts, no
 *     bytes), engine_outputs pass-through, readiness verdict, logger
 *     summary.
 *   • The output key set is stable (catches a consumer-breaking
 *     field rename or removal).
 *   • One-way flow: the returned object carries no image bytes and
 *     no functions.
 */

import { describe, it, expect } from 'vitest'
import { buildAssessmentContext } from '../../lib/context/buildAssessmentContext'
import { ENGINE_VERSION } from '../../src/version.js'

// Date-stable inputs (CLAUDE.md pitfall #3): tf '73' satisfies both
// seasonal comfort bands so finding generation is deterministic.
const T0 = Date.UTC(2026, 4, 26, 13, 0, 0)

function fullState() {
  return {
    view: 'results',
    draftId: 'draft-123',
    assessmentMode: 'SCREENING',
    presurvey: {
      ps_recipient_name: 'Jane Owner',
      ps_recipient_firm: 'Acme Property Group',
      ps_recipient_email: 'jane@acme.test',
      ps_recipient_phone: '555-0100',
      ps_site_name: 'Acme HQ',
      ps_site_address: '100 Main St, Anytown',
      ps_facility_type: 'office',
      ps_assessor: 'Tsidi Tamakloe',
    },
    bldg: { fn: 'Acme HQ', address: '100 Main St, Anytown', type: 'office', sqft: '42000' },
    client: { name: 'Jane Owner', organization: 'Acme Property Group' },
    zones: [
      { zid: 'A1', zn: 'Front Office', use: 'Office' },
      { zid: 'A2', zn: 'Conference', use: 'Conference' },
    ],
    curZone: 0,
    photos: {
      'z0-mold': [{ label: 'corner staining' }, { label: 'closeup' }],
      'z1-hvac': [{ caption: 'supply diffuser' }],
      'z0-empty': [],
    },
    zoneScores: [
      {
        cats: [
          {
            l: 'Ventilation',
            r: [
              { t: 'OA delivery 8 cfm/person — below ASHRAE 62.1 minimum (10)', std: 'ASHRAE 62.1-2025', sev: 'high' },
              { t: 'CO₂ 900 ppm (confirmatory ventilation indicator).', std: 'Persily 2021', sev: 'info' },
            ],
          },
          {
            l: 'Contaminants',
            r: [
              { t: 'Visible mold growth on porous substrate', std: 'IICRC S520', sev: 'critical', location: 'NW corner', qualitative_only: true },
              { t: 'Within screening range', sev: 'pass' },
            ],
          },
        ],
      },
      {
        cats: [
          {
            l: 'Comfort',
            r: [{ t: 'Temperature 73°F — within comfort band', sev: 'pass' }],
          },
        ],
      },
    ],
    comp: { tot: 62, band: 'Moderate' },
    recs: { imm: [{ text: 'Isolate Zone A1', zone: 'A1' }] },
    samplingPlan: [{ analyte: 'mold', method: 'Air-O-Cell' }],
    narrative: { summary: 'Screening identified ventilation + moisture indicators.' },
    causalChains: [{ from: 'moisture', to: 'mold' }],
    profile: { name: 'Tsidi Tamakloe', plan: 'pro' },
    sensorData: {
      version: 2,
      datasets: [
        {
          id: 'primary', role: 'indoor', label: 'Indoor',
          fileName: 'aranet4.csv',
          params: ['co2'],
          units: { co2: 'ppm' },
          hasTimestamps: true,
          points: [
            { t: T0, co2: 700 }, { t: T0 + 60000, co2: 900 }, { t: T0 + 120000, co2: 1100 },
          ],
          rawCount: 3,
          summary: {
            count: 3, start: T0, end: T0 + 120000, intervalSec: 60, emptyRows: 0,
            missing: { co2: 0 },
            stats: { co2: { mean: 900, median: 900, min: 700, max: 1100, n: 3 } },
          },
          quality: { level: 'ok', status: 'OK', flags: [] },
        },
      ],
      occupancyWindows: [],
    },
  }
}

const EXPECTED_TOP_KEYS = [
  'meta', 'project', 'building', 'zones', 'walkthrough_findings',
  'logger_data_summary', 'photos', 'engine_outputs',
  'readiness_verdict', 'report_draft_state',
].sort()

describe('buildAssessmentContext', () => {
  it('produces a valid skeleton from empty state (no throws, every section present)', () => {
    const ctx = buildAssessmentContext({})
    expect(Object.keys(ctx).sort()).toEqual(EXPECTED_TOP_KEYS)
    expect(ctx.meta.mode).toBe('SCREENING')
    expect(ctx.meta.engine_version).toBe(ENGINE_VERSION)
    expect(ctx.meta.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(ctx.zones).toEqual([])
    expect(ctx.walkthrough_findings).toEqual([])
    expect(ctx.photos).toEqual([])
    expect(ctx.engine_outputs).toBeNull()
    expect(ctx.readiness_verdict).toBeNull()
    expect(ctx.logger_data_summary).toBeNull()
    expect(ctx.report_draft_state).toBeNull()
  })

  it('maps project + building identity from presurvey / bldg / client', () => {
    const ctx = buildAssessmentContext(fullState())
    expect(ctx.project.client).toBe('Jane Owner')
    expect(ctx.project.recipient).toEqual({
      name: 'Jane Owner',
      firm: 'Acme Property Group',
      email: 'jane@acme.test',
      phone: '555-0100',
    })
    expect(ctx.building).toEqual({
      name: 'Acme HQ',
      address: '100 Main St, Anytown',
      type: 'office',
      sqft: '42000',
      profile: null,
    })
    expect(ctx.meta.draft_id).toBe('draft-123')
    expect(ctx.meta.view).toBe('results')
  })

  it('summarizes zones with current-zone flag', () => {
    const ctx = buildAssessmentContext(fullState())
    expect(ctx.zones).toEqual([
      { index: 0, id: 'A1', label: 'Front Office', use: 'Office', is_current: true },
      { index: 1, id: 'A2', label: 'Conference', use: 'Conference', is_current: false },
    ])
  })

  it('rolls up findings, excluding pass/info severities, tagging qualitative_only + zone', () => {
    const ctx = buildAssessmentContext(fullState())
    // 2 surfaced (high + critical); the info + 2 pass results are dropped.
    expect(ctx.walkthrough_findings).toHaveLength(2)
    const critical = ctx.walkthrough_findings.find((f) => f.severity === 'critical')!
    expect(critical).toMatchObject({
      severity: 'critical',
      title: 'Visible mold growth on porous substrate',
      location: 'NW corner',
      zone_label: 'Front Office',
      qualitative_only: true,
    })
    const high = ctx.walkthrough_findings.find((f) => f.severity === 'high')!
    expect(high.zone_label).toBe('Front Office')
    expect(high.qualitative_only).toBe(false)
  })

  it('builds a photo index of {id, label, count} with no bytes, skipping empty groups', () => {
    const ctx = buildAssessmentContext(fullState())
    expect(ctx.photos).toEqual([
      { id: 'z0-mold', label: 'corner staining', count: 2 },
      { id: 'z1-hvac', label: 'supply diffuser', count: 1 },
    ])
    // The 'z0-empty' group (length 0) is omitted.
    expect(ctx.photos.find((p) => p.id === 'z0-empty')).toBeUndefined()
  })

  it('passes engine outputs through unchanged', () => {
    const ctx = buildAssessmentContext(fullState())
    expect(ctx.engine_outputs).not.toBeNull()
    expect(ctx.engine_outputs!.composite).toEqual({ tot: 62, band: 'Moderate' })
    expect(ctx.engine_outputs!.recommendations).toEqual({ imm: [{ text: 'Isolate Zone A1', zone: 'A1' }] })
    expect(ctx.engine_outputs!.sampling_plan).toEqual([{ analyte: 'mold', method: 'Air-O-Cell' }])
    expect(ctx.engine_outputs!.narrative).toEqual({ summary: 'Screening identified ventilation + moisture indicators.' })
    expect(ctx.engine_outputs!.causal_chains).toEqual([{ from: 'moisture', to: 'mold' }])
  })

  it('attaches the readiness verdict (engine outputs present) with the verdict shape', () => {
    const ctx = buildAssessmentContext(fullState())
    expect(ctx.readiness_verdict).not.toBeNull()
    const v = ctx.readiness_verdict!
    expect(typeof v.status).toBe('string')
    expect(['ready', 'gaps', 'blocked']).toContain(v.status)
    expect(typeof v.can_finalize).toBe('boolean')
    expect(Array.isArray(v.finalization_blockers)).toBe(true)
    expect(v.confidence).toHaveProperty('qualitative_only')
  })

  it('omits the readiness verdict when the engine has not scored yet', () => {
    const draftOnly = { ...fullState(), comp: undefined, composite: undefined }
    const ctx = buildAssessmentContext(draftOnly)
    expect(ctx.readiness_verdict).toBeNull()
    expect(ctx.engine_outputs).toBeNull()
  })

  it('attaches the Logger Studio summary when sensorData is loaded', () => {
    const ctx = buildAssessmentContext(fullState())
    expect(ctx.logger_data_summary).not.toBeNull()
    expect(ctx.logger_data_summary!.loaded).toBe(true)
    expect(ctx.logger_data_summary!.parameters_seen).toContain('co2')
  })

  it('carries no image bytes and no functions (one-way, serializable)', () => {
    const ctx = buildAssessmentContext(fullState())
    const serialized = JSON.stringify(ctx)
    // No base64 image payloads leaked into the context.
    expect(serialized).not.toMatch(/data:image\//)
    expect(serialized).not.toMatch(/base64/)
    // Round-trips cleanly → no functions / circular refs.
    expect(() => JSON.parse(serialized)).not.toThrow()
  })

  it('produces a stable top-level key set (drift guard)', () => {
    const full = buildAssessmentContext(fullState())
    const empty = buildAssessmentContext({})
    expect(Object.keys(full).sort()).toEqual(EXPECTED_TOP_KEYS)
    expect(Object.keys(empty).sort()).toEqual(EXPECTED_TOP_KEYS)
  })
})
