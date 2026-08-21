/**
 * v2.6 §3 acceptance — hypothesis engine.
 *
 * Each of the six hypothesis rules has a dedicated trigger test.
 * Confidence tier is asserted explicitly for the indicator-count
 * boundary cases.
 */

import { describe, it, expect } from 'vitest'
import { deriveHypotheses } from '../../src/engine/hypotheses'
import type { Finding, FindingId } from '../../src/engine/types/domain'

const NO_FINDINGS: ReadonlyArray<Finding> = []

// ── Rule 1 — Inadequate outdoor-air ventilation ──────────────

describe('v2.6 §3 — hypothesis Rule 1 (ventilation)', () => {
  it('fires on weak supply airflow', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Lobby', sa: 'Weak / reduced' }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    const h = result.find(x => x.name.includes('ventilation'))
    expect(h).toBeDefined()
    expect(h!.suggestedSampling.length).toBeGreaterThan(0)
    expect(h!.suggestedSampling[0].parameter).toMatch(/CO/)
  })

  it('fires on neurological symptom pattern', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Office', sy: ['Headache', 'Dizziness'] }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    expect(result.some(h => h.name.toLowerCase().includes('ventilation'))).toBe(true)
  })

  it('fires on compromised outdoor-air damper', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Office', od: 'Stuck / inoperable' }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    expect(result.some(h => h.name.toLowerCase().includes('ventilation'))).toBe(true)
  })
})

// ── Rule 2 — Bioaerosol amplification ────────────────────────

describe('v2.6 §3 — hypothesis Rule 2 (bioaerosol)', () => {
  it('fires on visible mold indicator', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Basement', mi: 'Visible growth on wall' }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    const h = result.find(x => x.name === 'Bioaerosol amplification')
    expect(h).toBeDefined()
    expect(h!.suggestedSampling.some(s => s.method.includes('Andersen'))).toBe(true)
  })

  it('fires on water damage', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Basement', wd: 'Active leak' }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    expect(result.some(h => h.name === 'Bioaerosol amplification')).toBe(true)
  })

  it('fires on respiratory symptom pattern', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Office', sy: ['Cough', 'Wheezing'] }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    expect(result.some(h => h.name === 'Bioaerosol amplification')).toBe(true)
  })

  it('fires on building-level drain pan biological growth', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Office' }],
      buildingData: { dp: 'Bio growth observed in drain pan' },
      findings: NO_FINDINGS,
    })
    expect(result.some(h => h.name === 'Bioaerosol amplification')).toBe(true)
  })
})

// ── Rule 3 — VOC source / off-gassing ────────────────────────

describe('v2.6 §3 — hypothesis Rule 3 (VOC source)', () => {
  it('fires on odor present + intensity ≥ 3', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Office', ot: ['Solvent'], oi: 4 }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    const h = result.find(x => x.name === 'VOC source or off-gassing')
    expect(h).toBeDefined()
    expect(h!.suggestedSampling.some(s => s.parameter.includes('TVOC'))).toBe(true)
  })

  // This previously asserted that a below-3 intensity must NOT fire the
  // rule. That gate never operated: `oi` is not a field in questions.js —
  // the schema records odor strength as `op`, a four-option choice — so
  // `num(z, 'oi')` was null for every real assessment and the rule fired
  // on any odor with a type selected. The assertion held only for a
  // synthetic shape the app cannot produce.
  //
  // Firing on reported odor is therefore the SHIPPED behaviour, and it is
  // preserved here rather than narrowed: narrowing would silently drop the
  // VOC differential out of reports that carry it today. Whether a faint,
  // intermittent odor should drive a speciation recommendation at all is a
  // product call, not one to make inside a defect fix.
  it('fires on a weak odor, and says the strength is below the persistent threshold', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Office', ot: ['Solvent'], oi: 2 }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    const h = result.find(x => x.name === 'VOC source or off-gassing')
    expect(h).toBeDefined()
    expect(h!.basis[0]).toMatch(/below the persistent threshold/)
  })

  it('fires on odor present without strength recorded, and says so', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Office', ot: ['Musty / Earthy'] }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    const h = result.find(x => x.name === 'VOC source or off-gassing')
    expect(h).toBeDefined()
    expect(h!.basis[0]).toMatch(/strength not recorded/)
  })

  // The schema field, which the rule could not previously read.
  it('reads odor strength from `op`, the field the wizard actually writes', () => {
    const strong = deriveHypotheses({
      zonesData: [{ zn: 'Office', op: 'Strong / overpowering', ot: ['Chemical'] }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    const h = strong.find(x => x.name === 'VOC source or off-gassing')!
    expect(h.basis[0]).toMatch(/^Objectionable odor reported/)
    expect(h.basis[0]).not.toMatch(/not recorded/)

    const faint = deriveHypotheses({
      zonesData: [{ zn: 'Office', op: 'Faint / intermittent', ot: ['Chemical'] }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    expect(faint.find(x => x.name === 'VOC source or off-gassing')!.basis[0])
      .toMatch(/below the persistent threshold/)
  })

  // `ot` is a conditional follow-up in the wizard. scoreEnv emits a
  // high-severity finding for a strong odor whether or not the assessor
  // stopped to classify it; the hypothesis rule now agrees.
  it('fires on a strong odor even when no type was classified', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Office', op: 'Strong / overpowering' }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    const h = result.find(x => x.name === 'VOC source or off-gassing')
    expect(h).toBeDefined()
    expect(h!.basis[0]).toMatch(/type not classified/)
  })

  it('stays silent when no odor was reported', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Office', op: 'None' }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    expect(result.some(h => h.name === 'VOC source or off-gassing')).toBe(false)
  })
})

describe('v2.6 §3 — building-level fields reach the rules that read them', () => {
  // sa and od are Q_BUILDING fields. deriveHypotheses is called with raw
  // zonesData everywhere, so reading them off the zone returned '' for
  // every real assessment and the ventilation rule fired on neurological
  // symptoms alone.
  it('fires ventilation on building-level weak supply air', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Suite 200' }],
      buildingData: { sa: 'Weak / reduced' },
      findings: NO_FINDINGS,
    })
    const h = result.find(x => x.name === 'Inadequate outdoor-air ventilation')
    expect(h).toBeDefined()
    expect(h!.basis.join(' ')).toMatch(/Supply air delivery for the building/)
  })

  it('fires ventilation on a building-level compromised damper', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Suite 200' }],
      buildingData: { od: 'Stuck / inoperable' },
      findings: NO_FINDINGS,
    })
    const h = result.find(x => x.name === 'Inadequate outdoor-air ventilation')
    expect(h).toBeDefined()
    expect(h!.basis.join(' ')).toMatch(/damper compromised at the air handler/)
  })

  // One building-level observation is one indicator, however many zones
  // the survey covers. Counting it per zone would let a single damper
  // reading reach provisional_screening_level on its own.
  it('counts a building-level observation once, not once per zone', () => {
    const fiveZones = ['A', 'B', 'C', 'D', 'E'].map(zn => ({ zn }))
    const result = deriveHypotheses({
      zonesData: fiveZones,
      buildingData: { sa: 'Weak / reduced' },
      findings: NO_FINDINGS,
    })
    const h = result.find(x => x.name === 'Inadequate outdoor-air ventilation')!
    expect(h.basis).toHaveLength(1)
    expect(h.cihConfidenceTier).toBe('qualitative_only')
  })

  it('prefers a per-zone value over the building default and scopes it to that zone', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Suite 200', sa: 'No airflow detected' }],
      buildingData: { sa: 'Weak / reduced' },
      findings: NO_FINDINGS,
    })
    const h = result.find(x => x.name === 'Inadequate outdoor-air ventilation')!
    expect(h.basis).toHaveLength(1)
    expect(h.basis[0]).toMatch(/Weak or absent supply airflow observed in Suite 200/)
  })
})

// ── Rule 4 — Particulate amplification or filter failure ─────

describe('v2.6 §3 — hypothesis Rule 4 (particulate / filter)', () => {
  it('fires on visible dust observation', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Office', vd: 'Yes — visible accumulation on surfaces' }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    const h = result.find(x => x.name === 'Particulate amplification or filter failure')
    expect(h).toBeDefined()
    expect(h!.suggestedSampling.some(s => s.parameter.includes('PM'))).toBe(true)
  })

  it('fires on building-level filter loaded', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Office' }],
      buildingData: { fc: 'Heavily loaded' },
      findings: NO_FINDINGS,
    })
    expect(result.some(h => h.name === 'Particulate amplification or filter failure')).toBe(true)
  })
})

// ── Rule 5 — Combustion source / CO infiltration ─────────────

describe('v2.6 §3 — hypothesis Rule 5 (combustion / CO)', () => {
  it('fires on neurological symptom pattern', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Office', sy: ['Headache', 'Nausea'] }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    const h = result.find(x => x.name.includes('carbon monoxide'))
    expect(h).toBeDefined()
    expect(h!.suggestedSampling[0].method).toMatch(/electrochemical/i)
  })

  it('does not fire on non-neurological symptoms only', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Office', sy: ['Cough'] }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    expect(result.some(h => h.name.includes('carbon monoxide'))).toBe(false)
  })
})

// ── Rule 6 — Atmospheric corrosion (data center) ─────────────

describe('v2.6 §3 — hypothesis Rule 6 (atmospheric corrosion)', () => {
  it('fires on data-center zone with G2/G3 indicator', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Data Hall A', zone_subtype: 'data_hall', gaseous_corrosion: 'G2 (moderate)' }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    const h = result.find(x => x.name.includes('Atmospheric corrosion'))
    expect(h).toBeDefined()
    expect(h!.suggestedSampling.some(s => s.method.includes('ANSI/ISA 71.04'))).toBe(true)
  })

  it('does not fire on data-center zone without corrosion indicator', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Data Hall A', zone_subtype: 'data_hall' }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    expect(result.some(h => h.name.includes('Atmospheric corrosion'))).toBe(false)
  })

  it('does not fire on non-data-center zone with corrosion indicator', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Lobby', gaseous_corrosion: 'G2' }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    expect(result.some(h => h.name.includes('Atmospheric corrosion'))).toBe(false)
  })
})

// ── Confidence tiering ───────────────────────────────────────

describe('v2.6 §3 — hypothesis confidence tiering', () => {
  it('single observational indicator → qualitative_only', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Basement', wd: 'Active leak' }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    const h = result.find(x => x.name === 'Bioaerosol amplification')
    expect(h!.cihConfidenceTier).toBe('qualitative_only')
  })

  it('multiple independent indicators → provisional_screening_level', () => {
    const result = deriveHypotheses({
      zonesData: [
        { zn: 'Basement', mi: 'Visible growth', wd: 'Active leak', sy: ['Cough', 'Wheezing'] },
      ],
      buildingData: { dp: 'Standing water in drain pan' },
      findings: NO_FINDINGS,
    })
    const h = result.find(x => x.name === 'Bioaerosol amplification')
    expect(h!.cihConfidenceTier).toBe('provisional_screening_level')
  })
})

// ── Orchestrator-level assertions ────────────────────────────

describe('v2.6 §3 — deriveHypotheses orchestrator', () => {
  it('produces zero hypotheses for a clean assessment', () => {
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Clean Office', co2: '450', tf: '72', rh: '45' }],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    expect(result).toHaveLength(0)
  })

  it('produces multiple distinct hypotheses for multi-trigger inputs', () => {
    const result = deriveHypotheses({
      zonesData: [
        { zn: 'Office', sy: ['Headache', 'Cough'], mi: 'Visible growth', vd: 'Yes — heavy dust' },
      ],
      buildingData: { fc: 'Heavily loaded' },
      findings: NO_FINDINGS,
    })
    const names = result.map(h => h.name)
    // Headache → ventilation + combustion. Cough → bioaerosol.
    // Mold → bioaerosol (already captured). Dust+filter → particulate.
    expect(names).toContain('Inadequate outdoor-air ventilation')
    expect(names).toContain('Bioaerosol amplification')
    expect(names).toContain('Particulate amplification or filter failure')
    expect(names).toContain('Combustion source or carbon monoxide infiltration')
    expect(result.length).toBeGreaterThanOrEqual(4)
  })

  it('every emitted hypothesis has at least one SamplingRecommendation', () => {
    const result = deriveHypotheses({
      zonesData: [
        { zn: 'Office', sy: ['Headache'], mi: 'Visible growth' },
      ],
      buildingData: {},
      findings: NO_FINDINGS,
    })
    expect(result.length).toBeGreaterThan(0)
    for (const h of result) {
      expect(h.suggestedSampling.length).toBeGreaterThan(0)
      for (const s of h.suggestedSampling) {
        expect(s.parameter.length).toBeGreaterThan(0)
        expect(s.method.length).toBeGreaterThan(0)
        expect(s.rationale.length).toBeGreaterThan(0)
      }
    }
  })

  it('relatedFindingIds reference real findings when available', () => {
    const fakeFinding: Finding = {
      id: ('F-test-1' as FindingId),
      category: 'Contaminants',
      zoneId: null,
      scope: 'zone',
      severityInternal: 'medium',
      titleInternal: '',
      observationInternal: '',
      deductionInternal: 5,
      conditionType: 'apparent_microbial_growth',
      confidenceTier: 'qualitative_only',
      definitiveConclusionAllowed: false,
      causationSupported: false,
      regulatoryConclusionAllowed: false,
      approvedNarrativeIntent: '',
      evidenceBasis: { kind: 'visual_olfactory_screening', rationale: '', citationRefs: [] },
      samplingAdequacy: { forConclusion: false, forScreening: true, forHypothesis: true, rationale: [] },
      instrumentAccuracyConsidered: { checked: false, withinNoiseFloor: false },
      limitations: [],
      recommendedActions: [],
      thresholdSource: 'observational',
    }
    const result = deriveHypotheses({
      zonesData: [{ zn: 'Basement', mi: 'Visible growth' }],
      buildingData: {},
      findings: [fakeFinding],
    })
    const h = result.find(x => x.name === 'Bioaerosol amplification')
    expect(h!.relatedFindingIds).toContain('F-test-1')
  })
})
