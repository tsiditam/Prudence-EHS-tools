/**
 * Claim provenance — the layer that makes "it did not make this up" a
 * property of the build rather than something a reviewer notices.
 *
 * The rule under test: every quantity a finding states must be traceable
 * to a value someone collected, a documented derivation of collected
 * values, a published threshold, or the band the engine applied. Anything
 * else is invented.
 *
 * Scoped to UNIT-BEARING quantities on purpose. A report is full of
 * numbers that are not claims about the building — 29 CFR 1910.1000,
 * IICRC S520, R-07, the year in a citation, "Condition 1 or 2" — and a
 * check over every digit would need an exclusion list long enough to
 * guard nothing. `1450 ppm` and `72°F` are assertions; `S520` is a name.
 */
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'

import {
  deriveClaimProvenance, ungroundedQuantities, extractQuantities, groundingSet,
  untaggedQuantitativeClaims, criterionValueById, __testing,
  type ClaimProvenance,
} from '../../src/engine/report/provenance'
import { computeParameterRanges } from '../../src/engine/report/parameter-ranges'
import { getField } from '../../src/constants/field-registry.js'
import { scoreZone, compositeScore } from '../../src/engines/scoring.js'
import { buildCausalChains } from '../../src/engines/causalChains.js'
import { getConsultantDocxBlob } from '../../src/components/DocxReport.js'

type Zone = Record<string, any>

const BUILDING: Zone = {
  fn: 'Provenance Tower', fl: '1 Test St', ft: 'Commercial Office',
  ht: 'Central AHU — VAV', sa: 'Weak / reduced', od: 'Closed / minimum',
  fc: 'Heavily loaded', ba: '1994',
}
const PRESURVEY: Zone = {
  ps_assessor: 'J. Smith, CIH', ps_reason: 'Occupant complaint(s)', ps_survey_date: '2026-08-14',
}

/**
 * Fixtures chosen to exercise every emission path that states a number:
 * every criterion ladder, both comfort bands, the outdoor differential
 * and the I/O ratio, the data-hall profile, and a zone with almost
 * nothing in it.
 */
const FIXTURES: ReadonlyArray<{ name: string; zones: Zone[] }> = [
  {
    name: 'office with findings across every parameter',
    zones: [
      { zn: 'Suite 200', su: 'office', sf: '2400', oc: '18', co2: '1450', co2o: '430', tf: '72',
        rh: '52', pm: '38', pmo: '9', co: '2', tv: '620', hc: '0.02', vd: 'Airborne haze',
        wd: 'Old staining', mi: 'Small (< 10 sq ft)', op: 'Moderate persistent', ot: ['Musty / Earthy'],
        cx: 'Yes — complaints reported', sy: ['Headache', 'Cough'], sr: 'Yes — clear pattern',
        ac: '6-10', cc: 'Yes — this zone' },
      { zn: 'Suite 210', su: 'conference', sf: '600', oc: '8', co2: '980', co2o: '430', tf: '73',
        rh: '51', pm: '11', pmo: '9' },
    ],
  },
  {
    name: 'severe readings at the top of every ladder',
    zones: [
      { zn: 'Boiler Room', su: 'mechanical room', sf: '400', oc: '1', co: '60', co2: '2600',
        co2o: '430', tf: '95', rh: '22', tv: '3200', hc: '0.9', pm: '120', pmo: '11',
        cfm_person: '3', ach: '0.8', mi: 'Extensive (> 100 sq ft)', wd: 'Active leak',
        op: 'Strong / overpowering', ot: ['Chemical', 'Sewage'] },
    ],
  },
  {
    name: 'data hall profile, which overrides the comfort bands',
    zones: [
      { zn: 'Data Hall', zone_subtype: 'data_hall', su: 'data_center', sf: '5000', oc: '2',
        co2: '820', co2o: '430', tf: '68', rh: '68', pm: '14', pmo: '9',
        gaseous_corrosion: 'G3 — Harsh' },
    ],
  },
  {
    name: 'clean office, where nothing should be asserted',
    zones: [
      { zn: 'Open office', su: 'office', sf: '3000', oc: '20', co2: '620', co2o: '430',
        tf: '74', rh: '44', pm: '6', pmo: '9', co: '0.4', tv: '180', cfm_person: '22' },
    ],
  },
  {
    name: 'winter, which selects the other comfort band',
    zones: [{ zn: 'Lobby', su: 'office', sf: '900', oc: '4', tf: '66', rh: '18', co2: '700' }],
  },
  {
    name: 'almost nothing recorded',
    zones: [{ zn: 'Storage', su: 'warehouse', sf: '1200', oc: '1' }],
  },
]

function claimsFor(zones: Zone[], building: Zone = BUILDING): ClaimProvenance[] {
  const zoneScores = zones.map((z) => scoreZone(z, building))
  return deriveClaimProvenance({ zoneScores, zonesData: zones, buildingData: building })
}

// ── The property ──────────────────────────────────────────────────────

describe('every quantity a finding states is grounded', () => {
  for (const fixture of FIXTURES) {
    it(fixture.name, () => {
      const claims = claimsFor(fixture.zones)
      const offenders = claims
        .map((c) => ({ c, u: ungroundedQuantities(c) }))
        .filter((x) => x.u.length > 0)
        .map((x) =>
          `${x.c.claimId}: states ${x.u.map((q) => `"${q.matched}"`).join(', ')} — `
          + `inputs [${x.c.inputs.map((i) => `${i.field}=${i.value}`).join(', ') || 'none'}], `
          + `criterion ${x.c.criterionId ?? 'none'}, band ${x.c.band ? x.c.band.join('–') : 'none'}\n`
          + `    "${x.c.text.slice(0, 160)}"`)
      expect(offenders, 'a finding states a quantity nothing entitles it to').toEqual([])
    })
  }

  it('checked a meaningful number of claims — a silent pass guards nothing', () => {
    const all = FIXTURES.flatMap((f) => claimsFor(f.zones))
    expect(all.length).toBeGreaterThan(40)
    const withQuantities = all.filter((c) => extractQuantities(c.text).length > 0)
    expect(withQuantities.length, 'no quantitative claims were found to check').toBeGreaterThan(15)
  })

  it('would catch a fabricated quantity', () => {
    // Guards the guard by replaying the defect class: a number in the
    // sentence that no input, criterion or band supports.
    const [real] = claimsFor(FIXTURES[0].zones).filter((c) => c.parameter === 'co2')
    expect(real).toBeDefined()
    const fabricated: ClaimProvenance = { ...real, text: `${real.text} Measured 9137 ppm at the diffuser.` }
    expect(ungroundedQuantities(fabricated).map((q) => q.value)).toContain(9137)
  })

  it('would catch a silent unit conversion', () => {
    // The TVOC defect: 500 µg/m³ was rendered as 218 after an unrequested
    // conversion to ppb. The converted figure is grounded in nothing.
    const [tvoc] = claimsFor(FIXTURES[0].zones).filter((c) => c.parameter === 'tvoc')
    expect(tvoc).toBeDefined()
    const converted: ClaimProvenance = { ...tvoc, text: 'TVOCs 218 ppb — above the advisory tier.' }
    expect(ungroundedQuantities(converted).map((q) => q.value)).toContain(218)
  })

  it('would catch a band the engine did not apply', () => {
    // The 72°F defect: a renderer compared against a hardcoded 68–78 that
    // knew nothing about the season the engine had selected.
    const [temp] = claimsFor(FIXTURES[0].zones).filter((c) => c.parameter === 'temperature')
    expect(temp).toBeDefined()
    expect(temp.band, 'the temperature finding should carry the band it applied').toBeTruthy()
    const invented: ClaimProvenance = {
      ...temp, band: null, text: 'Temperature 72°F — outside the 64.5–77.5°F comfort range.',
    }
    const flagged = ungroundedQuantities(invented).map((q) => q.value)
    expect(flagged).toContain(64.5)
    expect(flagged).toContain(77.5)
  })
})

// ── The register of weaker grounding ──────────────────────────────────

describe('claims that state a quantity without declaring a parameter', () => {
  it('are exactly the two known ones', () => {
    // These ground against everything their zone collected rather than
    // against a named field, so the check over them is weaker. Pinned so
    // the weaker path cannot quietly become the norm; a new one means
    // either tagging the finding with its parameter, or deciding the
    // looser grounding is acceptable and saying so here.
    const texts = FIXTURES
      .flatMap((f) => untaggedQuantitativeClaims(claimsFor(f.zones)))
      .map((c) => c.text.replace(/\s+/g, ' ').slice(0, 40))
    const kinds = new Set(texts.map((t) => (t.startsWith('OA delivery') ? 'OA delivery' : t.startsWith('Small area mold') || t.includes('mold') ? 'mold area' : t)))
    expect([...kinds].sort()).toEqual(['OA delivery', 'mold area'])
  })
})

// ── What provenance records ───────────────────────────────────────────

describe('the provenance record', () => {
  const claims = claimsFor(FIXTURES[0].zones)

  it('names input fields that the registry declares, in the right scope', () => {
    for (const c of claims) {
      for (const i of c.inputs) {
        const contract = getField(i.field)
        expect(contract, `${c.claimId} traces to "${i.field}", which no schema declares`).toBeTruthy()
        expect(i.scope).toBe(contract!.scope)
      }
    }
  })

  it('traces a parameter claim to the field that parameter is stored in', () => {
    const co2 = claims.find((c) => c.parameter === 'co2')!
    expect(co2.inputs.map((i) => i.field)).toContain('co2')
    // A differential is a claim about both readings, so both are traced.
    expect(co2.inputs.map((i) => i.field)).toContain('co2o')
    expect(co2.inputs.find((i) => i.field === 'co2')!.value).toBe('1450')
  })

  it('resolves the threshold the criterion names', () => {
    const withCriterion = claims.filter((c) => c.criterionId)
    expect(withCriterion.length).toBeGreaterThan(2)
    for (const c of withCriterion) {
      expect(c.criterionValue, `${c.criterionId} resolves to no value`).not.toBeNull()
    }
    expect(criterionValueById('definitely_not_a_criterion')).toBeNull()
  })

  it('gives every claim a stable id and keeps the engine\'s own sentence', () => {
    const ids = claims.map((c) => c.claimId)
    expect(new Set(ids).size, 'claim ids collide').toBe(ids.length)
    expect(JSON.stringify(claimsFor(FIXTURES[0].zones))).toBe(JSON.stringify(claims))
    for (const c of claims) expect(c.text.length).toBeGreaterThan(0)
  })

  it('carries no claims when there is nothing to claim', () => {
    expect(deriveClaimProvenance({ zoneScores: [], zonesData: [] })).toEqual([])
  })
})

// ── Quantity extraction ───────────────────────────────────────────────

describe('what counts as a quantity', () => {
  it('reads a number that carries a unit', () => {
    expect(extractQuantities('CO₂ 1450 ppm (Δ1020 ppm above outdoor)').map((q) => q.value))
      .toEqual([1450, 1020])
    expect(extractQuantities('PM2.5 38 µg/m³').map((q) => q.value)).toEqual([38])
    expect(extractQuantities('Temperature 72°F — outside optimal 73–79°F').map((q) => q.value))
      .toEqual([72, 73, 79])
    expect(extractQuantities('1,450 ppm').map((q) => q.value)).toEqual([1450])
  })

  it('ignores a number that is part of a name', () => {
    // Every one of these appears in a shipped report and none is a claim.
    for (const text of [
      '29 CFR 1910.1000 Table Z-1', 'ASHRAE 55-2023', 'IICRC S520 Condition 1 or 2',
      'See Recommendation R-07', 'NIOSH Method 0800', 'ASTM D7338',
      'Persily, ASHRAE Journal 63(2):74–75 (2021)', 'EPA NAAQS 24-hr standard',
    ]) {
      expect(extractQuantities(text), `"${text}" should state no quantity`).toEqual([])
    }
  })

  it('grounds a figure quoted from the input value itself', () => {
    // "Small (< 10 sq ft)" is the option string the assessor selected; a
    // finding repeating it is quoting its input.
    const claim = claimsFor(FIXTURES[0].zones).find((c) => c.text.includes('Small area mold'))!
    expect(ungroundedQuantities(claim)).toEqual([])
  })

  it('grounds published thresholds without needing them restated', () => {
    const grounded = groundingSet({
      claimId: 'x', zone: 'z', zoneIndex: 0, parameter: null, severity: 'info',
      text: '', inputs: [], criterionId: null, criterionValue: null, source: null, band: null,
    })
    // STD.v.co2.diff — the 700 ppm differential the CO₂ caveat cites.
    expect(grounded.has(700)).toBe(true)
    // A number that is in no published table.
    expect(grounded.has(9137)).toBe(false)
  })

  it('collected every published value it could, rather than a handful', () => {
    expect(__testing.publishedValues().size).toBeGreaterThan(25)
  })
})

// ── The rendered artifact ─────────────────────────────────────────────

describe('the report states the measurements it was given', () => {
  it('parameter prose agrees with computeParameterRanges, figure for figure', async () => {
    // Where the 72°F contradiction lived. The prose is generated from the
    // ranges; this asserts the document actually says what they hold, so
    // a renderer cannot drift back to computing its own.
    const zones = FIXTURES[0].zones
    const zoneScores = zones.map((z) => scoreZone(z, BUILDING))
    const { blob } = await getConsultantDocxBlob({
      building: BUILDING, presurvey: PRESURVEY, zones, zoneScores,
      comp: compositeScore(zoneScores),
      causalChains: buildCausalChains(zones, BUILDING, zoneScores),
      profile: { name: 'J. Smith, CIH' }, photos: {}, version: '6.0.0', userMode: 'ih',
    })
    const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()))
    const xml = await zip.file('word/document.xml')!.async('string')
    const text = xml.split('</w:p>')
      .map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join(''))
      .filter(Boolean).join('\n')

    const ranges = computeParameterRanges(zones, zoneScores)
    const PROSE_LABEL: Record<string, string> = {
      co2: 'Carbon dioxide', pm25: 'PM2.5', tvoc: 'Total VOCs',
      hcho: 'Formaldehyde', temperature: 'Temperature', rh: 'Relative humidity',
    }
    let checked = 0
    for (const [param, label] of Object.entries(PROSE_LABEL)) {
      const range = (ranges as any)[param]
      if (!range) continue
      const line = text.split('\n').find((l) => l.startsWith(`${label} ranged from`))
      if (!line) continue
      checked += 1
      const stated = (line.match(/\d+(?:\.\d+)?/g) || []).map(Number)
      for (const figure of [range.low, range.high, range.average]) {
        expect(stated, `${label}: the report does not state ${figure}, which the ranges hold`)
          .toContain(figure)
      }
      if (range.outdoorReference !== undefined) {
        expect(line, `${label}: outdoor reference missing from the prose`)
          .toContain(String(range.outdoorReference))
      }
    }
    expect(checked, 'no parameter prose was found to check').toBeGreaterThan(3)
  }, 60000)
})
