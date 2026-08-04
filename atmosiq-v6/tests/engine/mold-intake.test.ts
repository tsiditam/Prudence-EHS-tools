/**
 * Mold module — intake schema ↔ engine-input mapper drift guard.
 *
 * The declarative question sets (moldQuestions.js), the demo fixture
 * (demoDataMold.js) and the mapper (buildMoldInput) must stay in step: every
 * field the demo/mapper reads has to be a declared question, and the mapper has
 * to produce the shape the engine consumes. This is the "global consistency"
 * guard for the capture layer.
 */
import { describe, it, expect } from 'vitest'
import { Q_MOLD_PRESURVEY, Q_MOLD_ZONE, moldMaterialKey } from '../../src/constants/moldQuestions.js'
import { buildMoldInput } from '../../src/engines/mold/buildInput.js'
import { DEMO_MOLD } from '../../src/constants/demoDataMold.js'

const ids = (qs: Array<{ id: string }>) => qs.map((q) => q.id)

describe('mold question sets', () => {
  it('are well-formed field descriptors with unique ids and the questions.js shape', () => {
    for (const qs of [Q_MOLD_PRESURVEY, Q_MOLD_ZONE]) {
      expect(new Set(ids(qs)).size).toBe(qs.length) // unique ids
      for (const q of qs) {
        expect(typeof q.id).toBe('string')
        expect(typeof (q as { q: string }).q).toBe('string')
        expect(typeof (q as { t: string }).t).toBe('string')
      }
    }
  })
  it('use the documented id prefixes (mps_ / mz_)', () => {
    expect(ids(Q_MOLD_PRESURVEY).every((id) => id.startsWith('mps_'))).toBe(true)
    expect(ids(Q_MOLD_ZONE).every((id) => id.startsWith('mz_'))).toBe(true)
  })
  it('map moisture material labels back to engine keys', () => {
    expect(moldMaterialKey('Wood / wood-based')).toBe('wood')
    expect(moldMaterialKey('Gypsum board / drywall')).toBe('drywall')
    expect(moldMaterialKey('anything else')).toBe('other')
  })
})

describe('demo fixture references only declared fields (no schema drift)', () => {
  it('every mz_ field used in the demo is a declared zone question', () => {
    const declared = new Set(ids(Q_MOLD_ZONE))
    for (const zone of DEMO_MOLD.zones) {
      for (const key of Object.keys(zone)) {
        if (key.startsWith('mz_')) expect(declared.has(key)).toBe(true)
      }
    }
  })
  it('every mps_ field used in the demo presurvey is declared', () => {
    const declared = new Set(ids(Q_MOLD_PRESURVEY))
    for (const key of Object.keys(DEMO_MOLD.presurvey)) {
      if (key.startsWith('mps_')) expect(declared.has(key)).toBe(true)
    }
  })
})

describe('buildMoldInput maps captured state to the engine input', () => {
  const input = buildMoldInput(DEMO_MOLD)
  it('produces zones, water events, moisture, growth, spores and hvac from the demo', () => {
    expect(input.zones).toHaveLength(3)
    expect(input.waterEvents).toHaveLength(2)           // break room + storage
    expect(input.moisture).toHaveLength(2)              // wood + drywall readings
    expect(input.growth).toHaveLength(2)                // break room + storage (lobby clean)
    expect(input.spores).toHaveLength(6)
    expect(input.hvacInvolved).toBe(true)               // derived from mps_hvac_involved
  })
  it('translates a moisture material label to its engine key', () => {
    const wood = input.moisture?.find((m) => m.material === 'wood')
    expect(wood?.value).toBe(22)
  })
})
