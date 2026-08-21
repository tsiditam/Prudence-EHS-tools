/**
 * The assessor's prose and the photo analysis reach the model.
 *
 * Before this, `AssessmentContext` carried NO free text at all — every
 * free-narrative field in the questionnaire (`znt`, `ps_complaint_narrative`,
 * `ps_odor_describe`, `ps_prior_notes`, `ps_reno_detail`, `ps_affected_areas`,
 * `wx_notes`) was written by the assessor and read by nothing: no engine, no
 * renderer, and not the one consumer that could actually use prose.
 *
 * Photo analysis was the same shape of loss. `api/photo-analyze.js` runs a
 * vision call, the result is billed, audit-logged and stored on the photo —
 * and surfaced only as a 7px badge on a thumbnail.
 *
 * The field list is DERIVED from FIELD_REGISTRY on `control === 'ta'`, so a
 * new textarea question is carried without editing the builder. These tests
 * assert that derivation, not a hand-kept list.
 */
import { describe, it, expect } from 'vitest'

import { buildAssessmentContext } from '../../lib/context/buildAssessmentContext'
import { FIELD_REGISTRY } from '../../src/constants/field-registry.js'

const stateWithProse = (over: Record<string, unknown> = {}) => ({
  presurvey: {
    ps_complaint_narrative: 'Occupants on the north side report headaches that clear at weekends.',
    ps_prior_notes: 'A 2024 survey found elevated CO2 in the same wing.',
    ps_recipient_name: 'Dana Reed',           // single-line text — identity, not observation
    ps_inst_iaq_serial: 'QT-99812',           // ditto
  },
  building: { fn: 'Test Site', wx_notes: 'Light haze; nearby roadworks upwind.' },
  zones: [
    { zid: 'A1', zn: 'North Office', znt: 'Musty smell strongest by the window wall.' },
    { zid: 'A2', zn: 'Server Room' },
  ],
  ...over,
})

describe('free text reaches the context', () => {
  it('carries the questionnaire prose fields', () => {
    const ni = buildAssessmentContext(stateWithProse() as never).narrative_inputs
    const ids = ni.fields.map((f) => f.field_id)
    expect(ids).toContain('ps_complaint_narrative')
    expect(ids).toContain('ps_prior_notes')
    expect(ids).toContain('wx_notes')
    expect(ni.fields.find((f) => f.field_id === 'ps_complaint_narrative')!.text)
      .toContain('clear at weekends')
  })

  it('labels each field from the question, so the model knows what it is reading', () => {
    const ni = buildAssessmentContext(stateWithProse() as never).narrative_inputs
    for (const f of ni.fields) {
      expect(f.label.length).toBeGreaterThan(3)
      expect(f.label).not.toBe(f.field_id)
    }
  })

  it('excludes single-line text — names and serials are identity, not observation', () => {
    const ni = buildAssessmentContext(stateWithProse() as never).narrative_inputs
    const blob = JSON.stringify(ni)
    expect(blob).not.toContain('Dana Reed')
    expect(blob).not.toContain('QT-99812')
  })

  it('carries zone notes against their zone, and mirrors them on the zone summary', () => {
    const ctx = buildAssessmentContext(stateWithProse() as never)
    expect(ctx.narrative_inputs.zone_notes).toEqual([
      { zone_index: 0, zone_label: 'North Office', text: 'Musty smell strongest by the window wall.' },
    ])
    expect(ctx.zones[0].notes).toContain('Musty smell')
    expect(ctx.zones[1].notes).toBeNull()
  })

  it('derives from FIELD_REGISTRY rather than a fixed list', () => {
    // Guards the guard: if the builder ever hardcodes ids, a `ta` question it
    // does not know about is silently dropped. Every carried field must be a
    // registry field whose control is `ta`.
    const taIds = new Set(
      (FIELD_REGISTRY as ReadonlyArray<{ id: string; control?: string }>)
        .filter((f) => f.control === 'ta').map((f) => f.id),
    )
    expect(taIds.size).toBeGreaterThan(5)
    const ni = buildAssessmentContext(stateWithProse() as never).narrative_inputs
    for (const f of ni.fields) expect(taIds.has(f.field_id), `${f.field_id} is not a textarea field`).toBe(true)
  })
})

describe('the block stays inside its budget, and says when it cut', () => {
  const LONG = 'x'.repeat(5000)

  it('truncates an oversized field and reports it', () => {
    const ctx = buildAssessmentContext(stateWithProse({
      presurvey: { ps_complaint_narrative: LONG },
    }) as never)
    const f = ctx.narrative_inputs.fields.find((x) => x.field_id === 'ps_complaint_narrative')!
    expect(f.text.length).toBeLessThanOrEqual(601)
    expect(ctx.narrative_inputs.truncated).toBe(true)
  })

  it('never exceeds the block budget however much was written', () => {
    const presurvey: Record<string, string> = {}
    for (const f of FIELD_REGISTRY as ReadonlyArray<{ id: string; control?: string; scope: string }>) {
      if (f.control === 'ta') presurvey[f.id] = LONG
    }
    const zones = Array.from({ length: 30 }, (_, i) => ({ zn: `Zone ${i}`, znt: LONG }))
    const ni = buildAssessmentContext({ presurvey, building: {}, zones } as never).narrative_inputs
    const total = ni.fields.reduce((n, f) => n + f.text.length, 0)
      + ni.zone_notes.reduce((n, z) => n + z.text.length, 0)
    expect(total).toBeLessThanOrEqual(4000)
    expect(ni.truncated).toBe(true)
  })

  it('reports truncated=false when nothing was cut', () => {
    expect(buildAssessmentContext(stateWithProse() as never).narrative_inputs.truncated).toBe(false)
  })
})

describe('photo analysis reaches the context', () => {
  const withPhotos = () => stateWithProse({
    photos: {
      'z0-mi': [{
        src: 'data:image/jpeg;base64,AAAA', ts: 1,
        aiAnalysis: {
          observed: 'Dark staining along the window head, roughly 0.5 m across.',
          concerns: ['Possible microbial growth', 'Persistent moisture'],
          probable_iaq_class: 'moisture',
          confidence: 'medium',
          recommended_actions: ['Remediate per IICRC S520'],
          citations: ['IICRC S520'],
        },
      }],
    },
  })

  it('carries what the analysis saw, with zone and question identity', () => {
    const p = buildAssessmentContext(withPhotos() as never).photos[0]
    expect(p.zone_index).toBe(0)
    expect(p.field_id).toBe('mi')
    expect(p.field_label).toBeTruthy()
    expect(p.analysis!.observed).toContain('Dark staining')
    expect(p.analysis!.concerns).toHaveLength(2)
    expect(p.analysis!.probable_iaq_class).toBe('moisture')
  })

  it('drops recommended_actions and citations', () => {
    // A second recommender beside the engine is how a report advises two
    // different things; the citation tracker owns which standards may appear.
    const blob = JSON.stringify(buildAssessmentContext(withPhotos() as never).photos)
    expect(blob).not.toContain('Remediate per IICRC')
    expect(blob).not.toContain('citations')
  })

  it('carries no image bytes', () => {
    const blob = JSON.stringify(buildAssessmentContext(withPhotos() as never).photos)
    expect(blob).not.toContain('base64')
  })
})
