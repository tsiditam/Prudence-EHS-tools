/**
 * v2.5 §5 acceptance — Appendix C deterministic builder.
 *
 * Validates:
 *   1. Empty photos array produces the deterministic
 *      "No photo documentation collected" sentence.
 *   2. A populated set produces a captioned list.
 *   3. Building-level photos (zoneName === null) sort first.
 *   4. Zone-scoped photos sort by zone name.
 *   5. Captions follow "Photo N: <Building or zoneName> — <text>" format.
 */

import { describe, it, expect } from 'vitest'
import { buildAppendixC } from '../../src/engine/report/appendix-c'
import type { AssessmentPhoto } from '../../src/engine/report/appendix-c'

describe('v2.5 §5 — Appendix C deterministic builder', () => {
  it('returns the deterministic no-photo sentence when no photos exist', () => {
    const result = buildAppendixC([])
    expect(result.photos).toHaveLength(0)
    expect(result.description).toContain('No photo documentation was collected during this assessment')
    // Anti-regression: hedging language must NOT appear
    expect(result.description).not.toContain('referenced inline within the relevant zone-by-zone')
  })

  it('produces three captioned entries for three photos', () => {
    const photos: AssessmentPhoto[] = [
      { caption: 'Loaded supply air filter at AHU-3', zoneName: '3rd Floor Open Office' },
      { caption: 'Visible water staining at southwest corner of mechanical room ceiling', zoneName: null },
      { caption: 'Apparent fungal growth on wall behind cubicle 3F-12', zoneName: 'Conference Room B' },
    ]
    const result = buildAppendixC(photos)
    expect(result.photos).toHaveLength(3)
    expect(result.description).toMatch(/3 photographs were documented/)
  })

  it('sorts building-level photos first, then zones alphabetically', () => {
    const photos: AssessmentPhoto[] = [
      { caption: 'Zone B photo', zoneName: 'Zone B' },
      { caption: 'Building photo', zoneName: null },
      { caption: 'Zone A photo', zoneName: 'Zone A' },
    ]
    const result = buildAppendixC(photos)
    expect(result.photos[0].caption).toContain('Building — Building photo')
    expect(result.photos[1].caption).toContain('Zone A — Zone A photo')
    expect(result.photos[2].caption).toContain('Zone B — Zone B photo')
  })

  it('captions building-level photos with the literal label "Building"', () => {
    const photos: AssessmentPhoto[] = [
      { caption: 'Roof inspection', zoneName: null },
    ]
    const result = buildAppendixC(photos)
    expect(result.photos[0].caption).toBe('Photo 1: Building — Roof inspection')
    expect(result.photos[0].zoneName).toBe('Building')
  })

  it('captions zone-scoped photos with the zone name', () => {
    const photos: AssessmentPhoto[] = [
      { caption: 'Filter image', zoneName: 'Mechanical Room' },
    ]
    const result = buildAppendixC(photos)
    expect(result.photos[0].caption).toBe('Photo 1: Mechanical Room — Filter image')
    expect(result.photos[0].zoneName).toBe('Mechanical Room')
  })

  it('uses singular "photograph was documented" for one photo', () => {
    const photos: AssessmentPhoto[] = [
      { caption: 'Single photo', zoneName: null },
    ]
    const result = buildAppendixC(photos)
    expect(result.description).toMatch(/1 photograph was documented/)
  })
})
