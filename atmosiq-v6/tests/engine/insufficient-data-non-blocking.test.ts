/**
 * Insufficient-data finalization behavior.
 *
 * Pins the contract that per-category data sufficiency does NOT hard-
 * block report finalization. The IH can still generate the report; the
 * insufficient categories surface as warnings (rendered into the audit
 * trail) and propagate through `qualitative_only` / `insufficientCats`
 * into the DOCX + PrintReport outputs.
 *
 * The bulk-insufficiency case (>50% cells insufficient) is still
 * intercepted upstream by the pre-assessment-memo refusal trigger in
 * `src/engine/report/pre-assessment-memo.ts` — that is the appropriate
 * place for a refuse-to-issue gate, not the finalization validator.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without TS types
import { validateAssessment } from '../../src/engines/validation.js'

function baseAssessment(overrides: Record<string, any> = {}) {
  return {
    assessmentMode: 'FULL_ASSESSMENT',
    presurvey: {
      ps_inst_iaq: 'TSI Q-Trak 7575',
      ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec',
      ps_assessor: 'J. Smith, CIH, CSP',
    },
    building: { fn: 'Meridian Commerce Tower', client_name: 'Meridian Property Holdings LLC' },
    client: {
      name: 'Meridian Property Holdings LLC',
      contact_name: 'Pat Doe',
      contact_role: 'Facility Manager',
      requested_by: 'Pat Doe',
    },
    // No instrument readings / occupant survey — sufficiency will fall short.
    zones: [{ zn: 'Zone 1', total_count: 12, affected_count: 0 }],
    zoneScores: [{
      zoneName: 'Zone 1',
      cats: [{ l: 'Ventilation', r: [{ t: 'Visual inspection only — no instrument data', sev: 'low' }] }],
    }],
    photos: { 'Zone 1': [{ id: 'p1' }] },
    recs: { imm: [], eng: [], adm: [], mon: [] },
    confidence: 'Medium',
    ...overrides,
  }
}

describe('finalization gate — insufficient-data is non-blocking', () => {
  it('does NOT block finalization when a zone has insufficient category data', () => {
    const r = validateAssessment(baseAssessment())
    expect(r.canFinalize).toBe(true)
    expect(r.blockers).toEqual([])
  })

  it('surfaces the insufficient-data condition as a WARNING (not a blocker)', () => {
    const r = validateAssessment(baseAssessment())
    const hasInsuffWarning = r.warnings.some((w: string) => /insufficient data/i.test(w))
    expect(hasInsuffWarning).toBe(true)
    const hasInsuffBlocker = r.blockers.some((b: string) => /insufficient data/i.test(b))
    expect(hasInsuffBlocker).toBe(false)
  })

  it('warning mentions the report still renders and the audit trail will flag affected categories', () => {
    const r = validateAssessment(baseAssessment())
    const w = r.warnings.find((x: string) => /insufficient data/i.test(x)) || ''
    expect(/audit trail|reduced confidence/i.test(w)).toBe(true)
  })

  it('finalization still blocks for the canonical six (client/contact/photos/etc.) even when sufficiency is fine', () => {
    // Strip the client + contact so the canonical blockers fire while
    // sufficiency is irrelevant. This proves we only relaxed the
    // sufficiency gate — not the rest of the finalization contract.
    const r = validateAssessment(baseAssessment({
      client: {},
      building: { fn: 'X' },
    }))
    expect(r.canFinalize).toBe(false)
    expect(r.blockers.some((b: string) => /Client name/i.test(b))).toBe(true)
    expect(r.blockers.some((b: string) => /Site contact name/i.test(b))).toBe(true)
  })
})
