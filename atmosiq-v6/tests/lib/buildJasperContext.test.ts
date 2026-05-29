/**
 * Parity + drift guard tests for lib/context/buildJasperContext.ts.
 *
 * These tests answer one question: does buildJasperContext() produce
 * every field the old hand-crafted MobileApp.jsx context literal
 * produced, PLUS the normalized AssessmentContext fields?
 *
 * If any key from the old literal goes missing, the chip strip breaks
 * or the AI loses context it previously relied on. If any
 * AssessmentContext key goes missing, the connectivity layer regresses.
 *
 * The golden fixture is the same fullState() used in
 * buildAssessmentContext.test.ts (date-stable, deterministic).
 */

import { describe, it, expect } from 'vitest'
import { buildJasperContext } from '../../lib/context/buildJasperContext'

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
      { zid: 'A1', zn: 'Front Office', use: 'Office', co2: 950, rh: 55 },
      { zid: 'A2', zn: 'Conference', use: 'Conference' },
    ],
    curZone: 0,
    photos: {
      'z0-mold': [{ label: 'corner staining' }, { label: 'closeup' }],
      'z1-hvac': [{ caption: 'supply diffuser' }],
    },
    zoneScores: [
      {
        cats: [
          {
            l: 'Ventilation',
            r: [
              { t: 'OA delivery 8 cfm/person', std: 'ASHRAE 62.1-2025', sev: 'high' },
              { t: 'CO₂ 900 ppm', std: 'Persily 2021', sev: 'info' },
            ],
          },
        ],
      },
      {
        cats: [
          { l: 'Comfort', r: [{ t: 'Temperature 73°F', sev: 'pass' }] },
        ],
      },
    ],
    comp: { tot: 62, band: 'Moderate' },
    recs: { imm: [{ text: 'Isolate Zone A1', zone: 'A1' }] },
    samplingPlan: [{ analyte: 'mold', method: 'Air-O-Cell' }],
    narrative: { summary: 'Screening identified ventilation indicators.' },
    causalChains: [{ from: 'moisture', to: 'mold' }],
    profile: { name: 'Tsidi Tamakloe', plan: 'pro', certs: ['CIH'], firm: 'Prudence EHS' },
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
    // Jasper runtime fields (not part of the persisted draft)
    incident: { id: 'inc-1', type: 'odor', notes: 'Chemical smell near HVAC' },
    report_review: { directive: 'Check narrative vs data' },
    index: {
      drafts: [{ facility: 'Acme HQ' }],
      reports: [],
    },
  }
}

// Keys the old MobileApp.jsx hand-crafted literal always emitted.
const LEGACY_JASPER_KEYS = [
  'view', 'presurvey', 'bldg', 'current_zone', 'zones_count',
  'active_assessment', 'profile_minimal', 'readiness', 'logger_studio',
  'incident', 'report_review',
].sort()

// Keys from AssessmentContext (must be a superset guarantee).
const ASSESSMENT_CONTEXT_KEYS = [
  'meta', 'project', 'building', 'zones', 'walkthrough_findings',
  'logger_data_summary', 'photos', 'engine_outputs',
  'readiness_verdict', 'report_draft_state',
].sort()

describe('buildJasperContext', () => {
  it('contains all legacy Jasper literal keys (parity guard)', () => {
    const ctx = buildJasperContext(fullState())
    for (const key of LEGACY_JASPER_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(ctx, key), `missing legacy key: ${key}`).toBe(true)
    }
  })

  it('contains all AssessmentContext keys (no connectivity-layer regression)', () => {
    const ctx = buildJasperContext(fullState())
    for (const key of ASSESSMENT_CONTEXT_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(ctx, key), `missing context key: ${key}`).toBe(true)
    }
  })

  it('active_assessment: derives facility from bldg.fn + sets finalized status in results view', () => {
    const ctx = buildJasperContext(fullState())
    expect(ctx.active_assessment).toEqual({
      facility: 'Acme HQ',
      status: 'Finalized report',
    })
  })

  it('active_assessment: falls back to index.drafts[0].facility on the dashboard (bldg not hydrated)', () => {
    const ctx = buildJasperContext({
      view: 'dash',
      index: { drafts: [{ facility: 'Branch Office' }] },
    })
    expect(ctx.active_assessment).toEqual({
      facility: 'Branch Office',
      status: 'Draft assessment',
    })
  })

  it('active_assessment: null when neither bldg nor index has a facility name', () => {
    const ctx = buildJasperContext({ view: 'dash' })
    expect(ctx.active_assessment).toBeNull()
  })

  it('active_assessment: "Draft assessment" status for wizard/zone views', () => {
    const ctx = buildJasperContext({ view: 'wizard', bldg: { fn: 'Site A' } })
    expect(ctx.active_assessment?.status).toBe('Draft assessment')
  })

  it('current_zone: passes the raw zone object (with sensor readings) at curZone index', () => {
    const ctx = buildJasperContext(fullState())
    // The raw zone object, not a ZoneSummary — FieldAssistant.jsx reads
    // zone.co2, zone.rh, zone.zid, zone.n from this object.
    expect(ctx.current_zone).toMatchObject({ zid: 'A1', zn: 'Front Office', co2: 950, rh: 55 })
  })

  it('current_zone: null when curZone is out of range or absent', () => {
    expect(buildJasperContext({}).current_zone).toBeNull()
    expect(buildJasperContext({ zones: [{ zid: 'A1' }], curZone: 5 }).current_zone).toBeNull()
  })

  it('zones_count: matches zones.length', () => {
    const ctx = buildJasperContext(fullState())
    expect(ctx.zones_count).toBe(2)
    expect(buildJasperContext({}).zones_count).toBe(0)
  })

  it('profile_minimal: carries plan, certs, firm fields only', () => {
    const ctx = buildJasperContext(fullState())
    expect(ctx.profile_minimal).toEqual({ plan: 'pro', certs: ['CIH'], firm: 'Prudence EHS' })
  })

  it('profile_minimal: null when profile is absent', () => {
    expect(buildJasperContext({}).profile_minimal).toBeNull()
  })

  it('readiness: is the same object as readiness_verdict (alias, not a copy)', () => {
    const ctx = buildJasperContext(fullState())
    expect(ctx.readiness).toBe(ctx.readiness_verdict)
  })

  it('readiness: null when engine has not scored (no comp)', () => {
    const s = { ...fullState(), comp: undefined, composite: undefined }
    const ctx = buildJasperContext(s)
    expect(ctx.readiness).toBeNull()
    expect(ctx.readiness_verdict).toBeNull()
  })

  it('logger_studio: is the same object as logger_data_summary (alias)', () => {
    const ctx = buildJasperContext(fullState())
    expect(ctx.logger_studio).toBe(ctx.logger_data_summary)
    expect(ctx.logger_studio).not.toBeNull()
  })

  it('logger_studio: null when sensorData is absent', () => {
    const ctx = buildJasperContext({ bldg: { fn: 'X' } })
    expect(ctx.logger_studio).toBeNull()
  })

  it('incident + report_review: passed through unchanged', () => {
    const ctx = buildJasperContext(fullState())
    expect(ctx.incident).toEqual({ id: 'inc-1', type: 'odor', notes: 'Chemical smell near HVAC' })
    expect(ctx.report_review).toEqual({ directive: 'Check narrative vs data' })
  })

  it('incident + report_review: null when absent', () => {
    const ctx = buildJasperContext({})
    expect(ctx.incident).toBeNull()
    expect(ctx.report_review).toBeNull()
  })

  it('presurvey: passes raw presurvey object through', () => {
    const ctx = buildJasperContext(fullState())
    expect(ctx.presurvey).toMatchObject({ ps_recipient_name: 'Jane Owner' })
  })

  it('view: alias for meta.view', () => {
    const ctx = buildJasperContext(fullState())
    expect(ctx.view).toBe(ctx.meta.view)
    expect(ctx.view).toBe('results')
  })

  it('bldg: passes raw bldg object through', () => {
    const ctx = buildJasperContext(fullState())
    expect(ctx.bldg).toMatchObject({ fn: 'Acme HQ', sqft: '42000' })
  })

  it('carries no image bytes and is fully serializable (one-way flow)', () => {
    const ctx = buildJasperContext(fullState())
    const json = JSON.stringify(ctx)
    expect(json).not.toMatch(/data:image\//)
    expect(json).not.toMatch(/base64/)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('degrades gracefully from empty state — no throws, all sections present', () => {
    expect(() => buildJasperContext({})).not.toThrow()
    const ctx = buildJasperContext({})
    expect(ctx.active_assessment).toBeNull()
    expect(ctx.current_zone).toBeNull()
    expect(ctx.zones_count).toBe(0)
    expect(ctx.profile_minimal).toBeNull()
    expect(ctx.readiness).toBeNull()
    expect(ctx.logger_studio).toBeNull()
    expect(ctx.incident).toBeNull()
    expect(ctx.report_review).toBeNull()
  })
})
