/**
 * Parity test for DocxReport.buildContext — connectivity layer PR C.
 *
 * Asserts the two-source pattern works correctly:
 *   1. When `assessmentContext` is present, its normalized identity
 *      fields (building.name, building.address, project.requested_by)
 *      are PREFERRED over the legacy data fields. This is the
 *      connectivity goal — DocxReport reads from the same shape
 *      Jasper reads from.
 *   2. When `assessmentContext` is absent, the function falls back to
 *      the legacy fields (bldg.fn, bldg.fl, profile.name, etc.). This
 *      is the backward-compatibility guarantee — existing call sites
 *      and resumed reports that predate this PR keep working.
 *   3. The two paths produce equivalent identity values when fed the
 *      same underlying state. This catches drift between legacy
 *      derivation and the connectivity layer's precedence rules.
 *
 * Lives in tests/components/ rather than tests/lib/ because
 * DocxReport.js is a React-tree-adjacent component module; the test
 * dependency graph pulls in `docx` via DocxReport's imports.
 */

import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain JS module without types
import { buildContext } from '../../src/components/DocxReport'
import { buildAssessmentContext } from '../../lib/context/buildAssessmentContext'

function baseLegacyData() {
  return {
    building: { fn: 'Acme HQ', fl: '100 Main St, Anytown' },
    presurvey: {
      ps_assessor: 'Jane Assessor',
      ps_recipient_name: 'Owner Name',
      ps_recipient_firm: 'Acme Property Group',
      ps_site_name: 'Acme HQ',
      ps_site_address: '100 Main St, Anytown',
      ps_inst_iaq: 'TSI 7575',
      ps_inst_iaq_cal_status: 'Current',
    },
    zones: [
      { zn: 'Front Office', use: 'Office' },
      { zn: 'Conference', use: 'Conference' },
    ],
    zoneScores: [],
    comp: { tot: 62, band: 'Moderate' },
    profile: { name: 'Tsidi Tamakloe', plan: 'pro', firm: 'Prudence EHS' },
    photos: {},
    standardsManifest: { version: 'test' },
  }
}

describe('DocxReport.buildContext — connectivity layer (PR C)', () => {
  it('legacy-only path: facilityName/address/assessor come from bldg + profile/presurvey', () => {
    const ctx = buildContext(baseLegacyData())
    expect(ctx.facilityName).toBe('Acme HQ')
    expect(ctx.address).toBe('100 Main St, Anytown')
    expect(ctx.assessor).toBe('Tsidi Tamakloe') // profile.name wins
    expect(ctx.assessmentContext).toBeNull()
  })

  it('attaches the normalized context as a passthrough field', () => {
    const data = baseLegacyData()
    const ac = buildAssessmentContext({
      bldg: data.building,
      presurvey: data.presurvey,
      zones: data.zones,
      profile: data.profile,
    })
    const ctx = buildContext({ ...data, assessmentContext: ac })
    expect(ctx.assessmentContext).toBe(ac)
    expect(ctx.assessmentContext.building.name).toBe('Acme HQ')
  })

  it('prefers assessmentContext.building.name over data.building.fn when both present', () => {
    const data = baseLegacyData()
    const ac = buildAssessmentContext({
      bldg: { fn: 'Normalized HQ Name', address: '200 Other St' },
      presurvey: data.presurvey,
    })
    const ctx = buildContext({ ...data, assessmentContext: ac })
    // assessmentContext wins
    expect(ctx.facilityName).toBe('Normalized HQ Name')
    expect(ctx.address).toBe('200 Other St')
  })

  it('falls back to legacy fields when assessmentContext is null or empty', () => {
    const ctx = buildContext({ ...baseLegacyData(), assessmentContext: null })
    expect(ctx.facilityName).toBe('Acme HQ')
    expect(ctx.address).toBe('100 Main St, Anytown')
  })

  it('falls back to legacy fields when assessmentContext.building has nulls', () => {
    const ac = buildAssessmentContext({}) // empty draft → all nulls
    const ctx = buildContext({ ...baseLegacyData(), assessmentContext: ac })
    expect(ctx.facilityName).toBe('Acme HQ') // bldg.fn still wins over null
    expect(ctx.address).toBe('100 Main St, Anytown')
  })

  it('parity: both source paths produce equivalent identity for the same underlying state', () => {
    const data = baseLegacyData()
    const ctxLegacy = buildContext(data)
    const ctxWithCtx = buildContext({
      ...data,
      assessmentContext: buildAssessmentContext({
        bldg: data.building,
        presurvey: data.presurvey,
        zones: data.zones,
        profile: data.profile,
      }),
    })
    // The identity fields the connectivity layer normalizes must
    // match across both paths — drift here means the legacy
    // derivation and the builder disagree, which is the bug the
    // connectivity layer is meant to prevent.
    expect(ctxWithCtx.facilityName).toBe(ctxLegacy.facilityName)
    expect(ctxWithCtx.address).toBe(ctxLegacy.address)
    expect(ctxWithCtx.assessor).toBe(ctxLegacy.assessor)
    expect(ctxWithCtx.zoneCount).toBe(ctxLegacy.zoneCount)
    expect(ctxWithCtx.zoneNames).toEqual(ctxLegacy.zoneNames)
  })

  it('still derives engine-output fields (zoneCount, completeness, recs) the same way regardless of context', () => {
    const data = baseLegacyData()
    const ac = buildAssessmentContext({
      bldg: data.building,
      presurvey: data.presurvey,
      zones: data.zones,
      profile: data.profile,
    })
    const ctx = buildContext({ ...data, assessmentContext: ac })
    expect(ctx.zoneCount).toBe(2)
    expect(ctx.completeness).toBe(100) // both zones have names
    expect(ctx.comp).toEqual({ tot: 62, band: 'Moderate' })
    // Section builders rely on these being the raw engine inputs,
    // not a re-derived shape — pass them through unchanged.
    expect(ctx.zones).toBe(data.zones)
    expect(ctx.zoneScores).toBe(data.zoneScores)
  })

  it('still trims firm-name (regression guard for trailing-space concat bug)', () => {
    const data = { ...baseLegacyData(), profile: { ...baseLegacyData().profile, firm: '  Prudence EHS  ' } }
    const ctx = buildContext(data)
    expect(ctx.firmName).toBe('Prudence EHS')
  })
})
