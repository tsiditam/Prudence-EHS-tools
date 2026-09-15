// @vitest-environment node
/**
 * The evidence-package fingerprint represents CLAIM-BEARING ASSESSMENT
 * CONTENT, and nothing else.
 *
 * `fingerprintPackage` decides whether AI-authored sections still describe
 * the assessment. `applyAiSections` compares it at EVERY render, and a
 * mismatch silently drops the generated prose back to deterministic text.
 * That makes the hash input a contract with two halves, and this file pins
 * both:
 *
 *   - An INTERNAL IDENTIFIER must not affect semantic freshness. The report
 *     id names the document. Two packages describing the same readings,
 *     findings and criteria are the same evidence whatever the document is
 *     called, so the id may not enter the hash.
 *   - CLAIM-BEARING CONTENT must. A changed reading, a changed finding, a
 *     different facility, a different survey date, a different assessor of
 *     record — each is something a writer may state and a reader may rely
 *     on, and prose written before the change must go stale.
 *
 * The defect this file was written from: `assembleRenderModel` mints a
 * report id from `Date.now()` when the assessment carries none, so a package
 * built at generation and the same package rebuilt at render disagreed on
 * it. Every AI section was marked stale the instant it was written, and the
 * report fell back to deterministic prose with no explanation of where the
 * credits went. The no-id path is the one production hits on a demo or a
 * preview, so the freshness cases below deliberately run WITHOUT a fixed
 * `now` and WITHOUT an id — the exact real-app shape.
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-ignore js
import { scoreZone } from '../../src/engines/scoring.js'
// @ts-ignore js
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-ignore js
import { buildEvidencePackage, fingerprintPackage } from '../../src/report/evidencePackage.js'
// @ts-ignore js
import { buildAiSectionsRecord, isAiSectionsFresh, withAiSections, evidencePackageFor } from '../../src/report/aiSections.js'
// @ts-ignore js
import { DEMO_FINDINGS_BUILDING as BLDG, DEMO_FINDINGS_ZONES as ZONES, DEMO_FINDINGS_PRESURVEY as PRESURVEY } from '../../src/constants/demoDataFindings'

const AT = { assessmentDate: '2026-06-10' }

/**
 * An assessment in the shape every export site passes.
 *
 * `id` is spread in from the caller so a test can supply a real one, `null`,
 * `''`, or none at all — the four shapes the report-id fallback distinguishes.
 */
function assessment(extra: Record<string, unknown> = {}, zones: any[] = ZONES, bldg: any = BLDG) {
  const zoneScores = zones.map((z: any) => scoreZone(z, { ...bldg, ...AT }))
  const causalChains = buildCausalChains(zones, bldg, zoneScores)
  return {
    building: bldg, presurvey: PRESURVEY, zones, zoneScores, causalChains,
    recs: { imm: [], eng: [], adm: [], mon: [] },
    profile: { name: 'A. Rivera', certs: ['CIH'], firm: 'PSEC' },
    ts: '2026-06-10',
    ...extra,
  }
}

/**
 * The fingerprint of an assessment, built the way production builds it.
 *
 * `opts` is passed through so a test can either PIN `now` (isolating the
 * report id from every other date-derived field) or leave it free (the real
 * app, where each render has its own clock).
 */
function fingerprintOf(data: any, opts: any = {}) {
  const model = assembleRenderModel(data, opts)
  return fingerprintPackage(buildEvidencePackage(model, { zoneScores: data.zoneScores, causalChains: data.causalChains }))
}

/** A clean five-section response, written from the package it is judged against. */
function goodResponse(pkg: any) {
  const co2 = pkg.measurements.find((m: any) => m.parameter === 'co2' && m.kind === 'zone')
  return {
    executive_summary: `Carbon dioxide stood out at this site. In ${co2.zone} it measured ${co2.value} ppm.\n\nThe source was not identified during the assessment.`,
    discussion: 'Carbon dioxide is an indicator of outdoor-air delivery. No ventilation rate was measured directly.',
    conceptual_site_model: 'The evidence points to reduced outdoor-air delivery reaching the flagged zone.',
    recommendations_prose: 'The steps below verify the suspected cause before any corrective work begins.',
    parameter_background: {
      co2: 'Carbon dioxide is a gauge of how much fresh air is reaching a room. No ventilation rate was measured directly; the reading is an indicator only.',
    },
  }
}

describe('fingerprint stability — an internal identifier is not semantic content', () => {
  it('identical assessment content with a real ID produces a stable fingerprint', () => {
    const data = assessment({ id: 'AIQ-REAL-0001' })
    expect(fingerprintOf(data)).toBe(fingerprintOf(data))
  })

  it('identical assessment content with a null ID produces a stable fingerprint', () => {
    // The real-app repro. No id, no pinned clock: the fallback mints
    // `AIQ-<Date.now() base36>` on each call, so this assertion failed on
    // every run before the fix.
    const data = assessment({ id: null })
    expect(fingerprintOf(data)).toBe(fingerprintOf(data))
  })

  it('identical assessment content with an empty-string ID produces a stable fingerprint', () => {
    const data = assessment({ id: '' })
    expect(fingerprintOf(data)).toBe(fingerprintOf(data))
  })

  it('changing only the report ID does not change the fingerprint', () => {
    // `now` is pinned so the ONLY thing differing between these four models
    // is the report id — including the absent case, which must hash the same
    // as a present one rather than merely the same as itself.
    const now = { now: new Date('2026-06-11T12:00:00Z') }
    const withId = fingerprintOf(assessment({ id: 'AIQ-REAL-0001' }), now)
    const otherId = fingerprintOf(assessment({ id: 'AIQ-REAL-0002' }), now)
    const nullId = fingerprintOf(assessment({ id: null }), now)
    const emptyId = fingerprintOf(assessment({ id: '' }), now)
    expect(otherId).toBe(withId)
    expect(nullId).toBe(withId)
    expect(emptyId).toBe(withId)
  })

  it('does not strip the report ID from the package itself — only from the hash', () => {
    // The fix is to the freshness contract, not to the deliverable. The
    // cover row and the package's `report_id` are both still populated: a
    // client quotes that number back when they ring about a document.
    const model: any = assembleRenderModel(assessment({ id: 'AIQ-REAL-0001' }), { now: new Date('2026-06-11T12:00:00Z') })
    const pkg: any = buildEvidencePackage(model, { zoneScores: [], causalChains: [] })
    expect(model.meta.coverRows).toContainEqual(['Report ID', 'AIQ-REAL-0001'])
    expect(pkg.report_id).toBe('AIQ-REAL-0001')
    expect(pkg.facts.find((f: any) => f.id === 'fact-report-id')).toMatchObject({ label: 'Report ID', value: 'AIQ-REAL-0001' })
  })
})

describe('fingerprint sensitivity — claim-bearing content still invalidates prose', () => {
  it('changing actual claim-bearing content changes the fingerprint', () => {
    const now = { now: new Date('2026-06-11T12:00:00Z') }
    const base = fingerprintOf(assessment({ id: 'AIQ-REAL-0001' }), now)
    const raised = ZONES.map((z: any, i: number) => (i === 0 ? { ...z, co2: '2400' } : z))
    expect(fingerprintOf(assessment({ id: 'AIQ-REAL-0001' }, raised), now)).not.toBe(base)
  })

  it('preserves every other cover fact, each of which a writer may state', () => {
    // The fix removes ONE fact, and this is the guard against it becoming a
    // general strip of "metadata". Each row below is something the prose can
    // name, so a change to it must go stale.
    const now = { now: new Date('2026-06-11T12:00:00Z') }
    const base = fingerprintOf(assessment({ id: 'AIQ-REAL-0001' }), now)
    const cases: Array<[string, any]> = [
      ['facility', assessment({ id: 'AIQ-REAL-0001' }, ZONES, { ...BLDG, fn: 'Seaview Corporate Center' })],
      ['address', assessment({ id: 'AIQ-REAL-0001' }, ZONES, { ...BLDG, fl: '2 Commercial Street, Portland, ME 04101' })],
      ['assessor of record', assessment({ id: 'AIQ-REAL-0001', profile: { name: 'B. Okafor', certs: ['CIH'], firm: 'PSEC' } })],
      ['preparing firm', assessment({ id: 'AIQ-REAL-0001', profile: { name: 'A. Rivera', certs: ['CIH'], firm: 'Harbor IH' } })],
      ['report profile', assessment({ id: 'AIQ-REAL-0001', reportProfile: 'compliance' })],
      ['report status', assessment({ id: 'AIQ-REAL-0001', reportStatus: 'final' })],
    ]
    for (const [label, data] of cases) expect(fingerprintOf(data, now), label).not.toBe(base)
  })

  it('changing the survey date changes the fingerprint', () => {
    const now = { now: new Date('2026-06-11T12:00:00Z') }
    const base = fingerprintOf(assessment({ id: 'AIQ-REAL-0001' }), now)
    const later = assessment({ id: 'AIQ-REAL-0001', ts: '2026-07-22' })
    expect(fingerprintOf(later, now)).not.toBe(base)
  })
})

describe('freshness through the real generate-then-render path', () => {
  it('a freshly generated AI section is not immediately marked stale', () => {
    // Generation and render are two separate calls with two separate clocks,
    // on an assessment with no id — production's demo path exactly.
    const data: any = assessment({ id: null })
    const pkg = evidencePackageFor(data)
    const rec = buildAiSectionsRecord(goodResponse(pkg), pkg, { model: 'claude-test' })
    expect(isAiSectionsFresh(rec, evidencePackageFor(data))).toBe(true)
  })

  it('the generated AI section remains active in the report instead of falling back to deterministic prose', () => {
    const data: any = assessment({ id: null })
    const pkg = evidencePackageFor(data)
    const rec = buildAiSectionsRecord(goodResponse(pkg), pkg, { model: 'claude-test' })
    const model: any = withAiSections({ ...data, aiSections: rec })
    expect(model.aiSectionsStatus).toBe('active')
    expect(model.aiAuthoredSections).toContain('executive_summary')
    expect(model.aiAuthoredSections).toContain('discussion')
    // And the AI text actually reached the rendered section, rather than the
    // status merely reading 'active' over deterministic paragraphs.
    expect(model.execSummary.paragraphs.join(' ')).toContain('Carbon dioxide stood out at this site')
  })

  it('a meaningful assessment edit still marks the AI section stale', () => {
    const data: any = assessment({ id: null })
    const rec = buildAiSectionsRecord(goodResponse(evidencePackageFor(data)), evidencePackageFor(data), { model: 'claude-test' })
    const edited: any = assessment({ id: null }, ZONES.map((z: any, i: number) => (i === 0 ? { ...z, co2: '2400' } : z)))
    expect(isAiSectionsFresh(rec, evidencePackageFor(edited))).toBe(false)
    const model: any = withAiSections({ ...edited, aiSections: rec })
    expect(model.aiSectionsStatus).toBe('stale')
    expect(model.aiAuthoredSections).toEqual([])
  })
})
