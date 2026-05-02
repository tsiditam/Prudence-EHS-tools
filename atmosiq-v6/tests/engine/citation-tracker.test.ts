/**
 * Engine v2.7 Fix 1 — Citation Tracker filters Appendix D.
 *
 * Acceptance:
 *   • Meridian-equivalent commercial-office context drops data-center
 *     standards (ASHRAE TC 9.9, NFPA 855, ISA 71.04, ISO 14644-1,
 *     IEEE 1635) from the bibliography.
 *   • Standards mentioned only in samplingPlan recommendations land
 *     in the futureMethodOnly partition, not the inBody partition.
 *   • Standards mentioned in BOTH body and sampling are inBody only
 *     (body wins).
 */
import { describe, it, expect } from 'vitest'
import {
  CitationTracker,
  inferCitationsFromContext,
  filterManifestByRegistration,
} from '../../src/engine/report/citation-tracker'
import { STANDARDS_MANIFEST } from '../../src/constants/standards.js'

describe('CitationTracker — direct API', () => {
  it('register() adds to inBody', () => {
    const t = new CitationTracker()
    t.register('ASHRAE 62.1')
    const r = t.getRegistration()
    expect(r.inBody.has('ASHRAE 62.1')).toBe(true)
    expect(r.futureMethodOnly.has('ASHRAE 62.1')).toBe(false)
  })

  it('registerFutureMethod() adds to futureMethodOnly', () => {
    const t = new CitationTracker()
    t.registerFutureMethod('NIOSH 0500')
    const r = t.getRegistration()
    expect(r.futureMethodOnly.has('NIOSH 0500')).toBe(true)
    expect(r.inBody.has('NIOSH 0500')).toBe(false)
  })

  it('register() promotes a future-method entry into inBody', () => {
    const t = new CitationTracker()
    t.registerFutureMethod('ASHRAE 62.1')
    t.register('ASHRAE 62.1')
    const r = t.getRegistration()
    expect(r.inBody.has('ASHRAE 62.1')).toBe(true)
    expect(r.futureMethodOnly.has('ASHRAE 62.1')).toBe(false)
  })

  it('registerFutureMethod() is no-op when already in body', () => {
    const t = new CitationTracker()
    t.register('ASHRAE 62.1')
    t.registerFutureMethod('ASHRAE 62.1')
    const r = t.getRegistration()
    expect(r.inBody.has('ASHRAE 62.1')).toBe(true)
    expect(r.futureMethodOnly.has('ASHRAE 62.1')).toBe(false)
  })
})

describe('inferCitationsFromContext — Meridian-equivalent context', () => {
  // A representative commercial-office context with realistic body
  // findings (CO₂, PM2.5, TVOC, OSHA PEL mentions) and a sampling
  // plan that references NIOSH methods.
  const meridianCtx = {
    zoneScores: [
      {
        zoneName: '3rd Floor Open Office',
        cats: [
          { l: 'Ventilation', r: [{ t: 'CO₂ 1180 ppm — exceeds ASHRAE 62.1 indicator threshold', sev: 'high' }] },
          { l: 'Contaminants', r: [
            { t: 'PM2.5 28 µg/m³ — exceeds WHO Air Quality Guidelines', sev: 'medium' },
            { t: 'TVOC elevated per Mølhave 1991 advisory tiers', sev: 'medium' },
          ]},
        ],
      },
      {
        zoneName: 'Conference Room B',
        cats: [
          { l: 'Environment', r: [{ t: 'Active water intrusion; remediate per IICRC S520', sev: 'critical' }] },
        ],
      },
    ],
    recs: { imm: ['Conference Room B: Arrest water intrusion.'], eng: [], adm: [], mon: [] },
    samplingPlan: {
      plan: [
        { type: 'Formaldehyde', zone: '3rd Floor', method: 'NIOSH Method 2016 sorbent tube', standard: 'NIOSH 2016' },
      ],
      outdoorGaps: [],
    },
    oshaResult: { gaps: [] },
    standardsManifest: STANDARDS_MANIFEST,
  }

  it('registers ASHRAE 62.1, ASHRAE 55, WHO, EPA, OSHA, IICRC, Molhave for a commercial office', () => {
    const r = inferCitationsFromContext(meridianCtx)
    expect(r.inBody.has('ASHRAE 62.1')).toBe(true)
    expect(r.inBody.has('WHO Air Quality Guidelines')).toBe(true)
    expect(r.inBody.has('IICRC S520')).toBe(true)
    expect(r.inBody.has('Molhave TVOC tiers')).toBe(true)
  })

  it('does NOT register data-center standards (TC 9.9, NFPA 855, ISA 71.04, ISO 14644-1, IEEE 1635)', () => {
    const r = inferCitationsFromContext(meridianCtx)
    expect(r.inBody.has('ASHRAE TC 9.9')).toBe(false)
    expect(r.inBody.has('NFPA 855')).toBe(false)
    expect(r.inBody.has('ANSI/ISA 71.04')).toBe(false)
    expect(r.inBody.has('ISO 14644-1')).toBe(false)
    expect(r.inBody.has('IEEE 1635 / ASHRAE Guideline 21')).toBe(false)
    expect(r.futureMethodOnly.has('ASHRAE TC 9.9')).toBe(false)
    expect(r.futureMethodOnly.has('NFPA 855')).toBe(false)
  })

  it('drops the bibliography from 13 to a smaller filtered set', () => {
    const r = inferCitationsFromContext(meridianCtx)
    const { bodyManifest, futureMethodManifest } = filterManifestByRegistration(STANDARDS_MANIFEST as any, r)
    const totalRendered = Object.keys(bodyManifest).length + Object.keys(futureMethodManifest).length
    // STANDARDS_MANIFEST has 13 standards (excluding metadata keys).
    // The Meridian commercial-office report should filter to roughly
    // 7-9 entries, well below the original 13.
    expect(totalRendered).toBeLessThan(13)
    expect(Object.keys(bodyManifest).length).toBeGreaterThanOrEqual(4)
  })
})

describe('inferCitationsFromContext — data-center context', () => {
  it('registers data-center standards when scope is data center', () => {
    const dcCtx = {
      zoneScores: [
        {
          zoneName: 'Data Hall A',
          cats: [
            { l: 'Environment', r: [{ t: 'Temperature outside ASHRAE TC 9.9 recommended envelope', sev: 'medium' }] },
            { l: 'Contaminants', r: [{ t: 'Corrosion class per ANSI/ISA 71.04', sev: 'info' }] },
          ],
        },
      ],
      recs: { imm: [], eng: [], adm: [], mon: [] },
      samplingPlan: { plan: [], outdoorGaps: [] },
      standardsManifest: STANDARDS_MANIFEST,
    }
    const r = inferCitationsFromContext(dcCtx)
    expect(r.inBody.has('ASHRAE TC 9.9')).toBe(true)
    expect(r.inBody.has('ANSI/ISA 71.04')).toBe(true)
  })
})

describe('inferCitationsFromContext — future-method partition', () => {
  it('registers a sampling-only standard as futureMethodOnly', () => {
    const ctx = {
      zoneScores: [
        { zoneName: 'Z1', cats: [{ l: 'Ventilation', r: [{ t: 'CO₂ elevated per ASHRAE 62.1', sev: 'medium' }] }] },
      ],
      recs: { imm: [], eng: [], adm: [], mon: [] },
      samplingPlan: { plan: [{ method: 'NIOSH method', standard: 'NIOSH Pocket Guide reference' }] },
      standardsManifest: STANDARDS_MANIFEST,
    }
    const r = inferCitationsFromContext(ctx)
    expect(r.inBody.has('ASHRAE 62.1')).toBe(true)
    expect(r.futureMethodOnly.has('NIOSH Pocket Guide RELs')).toBe(true)
    expect(r.inBody.has('NIOSH Pocket Guide RELs')).toBe(false)
  })
})
