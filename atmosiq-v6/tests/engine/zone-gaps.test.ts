/**
 * The in-walkthrough gap surface.
 *
 * The property that matters most here is NEGATIVE: this module must not
 * decide anything. Every item it returns has to trace to `sufficiency.js` or
 * `defensibility-gaps.js`, because a third opinion about completeness is how
 * the assessor ends up being told two different things on two screens.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { zoneGaps, zoneGapCounts, interruptsZoneCompletion } from '../../src/engines/zone-gaps.js'
import { evaluateCategorySufficiency } from '../../src/engines/sufficiency.js'

/** A zone with every required input captured across all five categories. */
const completeZone = () => ({
  zn: 'Room 214',
  co2: '850', cfm_person: '18',        // Ventilation
  pm: '8', co: '1',                    // Contaminants
  cx: 'No complaints',                 // Complaints (skips its optionals)
  tf: '72', rh: '45',                  // Environment
})

const draft = (zone: any, extra: any = {}) => ({
  zones: [zone], presurvey: {}, bldg: {}, recs: {}, zoneScores: [], ...extra,
})

describe('it surfaces what the sufficiency engine already found', () => {
  it('a bare zone reports its missing required inputs', () => {
    const gaps = zoneGaps(draft({ zn: 'Room 101' }), 0)
    const labels = gaps.map((g) => g.label)
    expect(labels).toContain('CO₂ reading')
    expect(labels).toContain('PM2.5 reading')
    expect(labels).toContain('Temperature')
    expect(gaps.every((g) => g.source === 'sufficiency' || g.source === 'defensibility')).toBe(true)
  })

  it('agrees exactly with evaluateCategorySufficiency — it does not re-derive', () => {
    const zone = { zn: 'Z', co2: '900' }
    const fromEngine = evaluateCategorySufficiency('Environment', zone).missing
    const fromModule = zoneGaps(draft(zone), 0)
      .filter((g) => g.kind === 'required' && g.id.startsWith('req:Environment:'))
      .map((g) => g.label)
    expect(fromModule.sort()).toEqual([...fromEngine].sort())
  })

  it('a complete zone reports no required gaps', () => {
    const required = zoneGaps(draft(completeZone()), 0).filter((g) => g.kind === 'required')
    expect(required).toEqual([])
  })

  it('does not ask for complaint follow-ups when there are no complaints', () => {
    // sufficiency.js suppresses these via skipOptionalWhen, and the question
    // list suppresses them via `cond`. Both must stay in step.
    const labels = zoneGaps(draft(completeZone()), 0).map((g) => g.label)
    expect(labels).not.toContain('Affected occupant count')
    expect(labels).not.toContain('Symptom list')
  })

  it('asks for them once complaints are reported', () => {
    const zone = { ...completeZone(), cx: 'Yes — complaints reported' }
    const labels = zoneGaps(draft(zone), 0).map((g) => g.label)
    expect(labels).toContain('Affected occupant count')
  })
})

describe('it evaluates the same record scoring does', () => {
  // scoring.js:91 — `const d = { ...bldg, ...z }` — then evaluateAllSufficiency(d).
  // Several inputs sufficiency asks for are building-scoped: `od` satisfies
  // Ventilation's altRequired, `sa` is a Ventilation optional, and `hm` / `fc`
  // are the whole of HVAC. Reading the bare zone made all of them look absent.
  const merged = (bldg: any, zone: any) => ({ ...bldg, ...zone })

  it('a building-level OA damper status satisfies the gap surface exactly as it satisfies scoring', () => {
    const bldg = { od: 'Open — verified at unit' }
    const zone = { zn: 'Room 214', co2: '900', pm: '8', co: '1', cx: 'No complaints', tf: '72', rh: '45' }

    // What scoring concludes about this zone's Ventilation completeness.
    const scoringView = evaluateCategorySufficiency('Ventilation', merged(bldg, zone))
    // What the walkthrough panel shows.
    const panel = zoneGaps({ zones: [zone], presurvey: {}, bldg, recs: {}, zoneScores: [] }, 0)
    const panelVentRequired = panel
      .filter((g) => g.id.startsWith('req:Ventilation:'))
      .map((g) => g.label)

    expect(scoringView.missing).toEqual([])
    expect(panelVentRequired).toEqual([])
    expect(panelVentRequired.sort()).toEqual([...scoringView.missing].sort())
  })

  it('without the building value, both agree it is missing', () => {
    const zone = { zn: 'Room 214', co2: '900', pm: '8', co: '1', cx: 'No complaints', tf: '72', rh: '45' }
    const scoringView = evaluateCategorySufficiency('Ventilation', merged({}, zone))
    const panel = zoneGaps({ zones: [zone], presurvey: {}, bldg: {}, recs: {}, zoneScores: [] }, 0)
      .filter((g) => g.id.startsWith('req:Ventilation:'))
      .map((g) => g.label)

    expect(scoringView.missing.length).toBeGreaterThan(0)
    expect(panel.sort()).toEqual([...scoringView.missing].sort())
  })

  it('building-scoped HVAC and airflow inputs are not reported missing when the building holds them', () => {
    const bldg = { hm: '2026-03-01', fc: 'Clean', sa: 'Yes — supply airflow confirmed' }
    const zone = { ...completeZone() }
    const labels = zoneGaps({ zones: [zone], presurvey: {}, bldg, recs: {}, zoneScores: [] }, 0).map((g) => g.label)
    expect(labels).not.toContain('Last HVAC maintenance')
    expect(labels).not.toContain('Filter condition')
    expect(labels).not.toContain('Supply airflow')
  })

  it('every category agrees with the scoring merge, not just Ventilation', () => {
    const bldg = { od: 'Open — verified at unit', hm: '2026-03-01', fc: 'Clean' }
    const zone = { zn: 'Z', co2: '900', tf: '72' }
    const d = { zones: [zone], presurvey: {}, bldg, recs: {}, zoneScores: [] }
    for (const category of ['Ventilation', 'Contaminants', 'HVAC', 'Complaints', 'Environment']) {
      const fromEngine = evaluateCategorySufficiency(category, merged(bldg, zone)).missing
      const fromPanel = zoneGaps(d, 0)
        .filter((g) => g.id.startsWith(`req:${category}:`))
        .map((g) => g.label)
      expect(fromPanel.sort(), `${category} disagrees with the scoring merge`).toEqual([...fromEngine].sort())
    }
  })

  it('the zone still wins over the building, as the spread order requires', () => {
    // `{ ...bldg, ...zone }` — a zone value overrides a building one. If this
    // inverted, a stale building default would mask a zone's own answer.
    const bldg = { fc: 'Clean' }
    const zone = { ...completeZone(), fc: '' }
    const labels = zoneGaps({ zones: [zone], presurvey: {}, bldg, recs: {}, zoneScores: [] }, 0).map((g) => g.label)
    expect(labels).toContain('Filter condition')
  })
})

describe('it tolerates both record shapes', () => {
  it('accepts the draft `bldg` and the finalized `building` alike', () => {
    // The live walkthrough draft carries `bldg`; the finalized report renames
    // it to `building`. The rules read `assessment.building`, so a caller
    // passing the draft would otherwise have the HVAC-status rule evaluated
    // against an empty building record.
    const b = { od: 'Open — verified at unit' }
    const zone = { zn: 'Z', co2: '900', pm: '8', co: '1', cx: 'No complaints', tf: '72', rh: '45' }
    const asDraft = zoneGaps({ zones: [zone], presurvey: {}, bldg: b, recs: {}, zoneScores: [] }, 0)
    const asReport = zoneGaps({ zones: [zone], presurvey: {}, building: b, recs: {}, zoneScores: [] }, 0)
    expect(JSON.stringify(asDraft)).toBe(JSON.stringify(asReport))
  })
})

describe('it surfaces defensibility rules, scoped to the zone', () => {
  it('flags a zone with indoor CO₂ and no outdoor baseline', () => {
    const zone = { ...completeZone(), co2: '1200', co2o: '' }
    const gaps = zoneGaps(draft(zone), 0)
    const g = gaps.find((x) => x.id === 'gap:missing_outdoor_co2')
    expect(g, 'the outdoor-CO₂ rule should reach the walkthrough').toBeTruthy()
    expect(g!.source).toBe('defensibility')
    expect(g!.label).toBe('Outdoor CO₂ baseline not recorded')
    expect(g!.why.length).toBeGreaterThan(20)
  })

  it('does not attribute another zone\'s gap to this one', () => {
    const a = { ...completeZone(), zn: 'Room A', co2: '1200', co2o: '420' }
    const b = { ...completeZone(), zn: 'Room B', co2: '1300', co2o: '' }
    const d = { zones: [a, b], presurvey: {}, bldg: {}, recs: {}, zoneScores: [] }
    expect(zoneGaps(d, 0).some((g) => g.id === 'gap:missing_outdoor_co2')).toBe(false)
    expect(zoneGaps(d, 1).some((g) => g.id === 'gap:missing_outdoor_co2')).toBe(true)
  })

  it('works before scoring has run — zoneScores-dependent rules just stay quiet', () => {
    // Mid-walkthrough there are no zoneScores. That must not throw, and must
    // not invent a substitute for the rules that need them.
    const gaps = zoneGaps({ zones: [completeZone()], presurvey: {}, bldg: {} } as any, 0)
    expect(Array.isArray(gaps)).toBe(true)
    expect(gaps.some((g) => g.id === 'gap:recommendation_without_location')).toBe(false)
  })
})

describe('ordering and shape', () => {
  it('required inputs rank above optional ones', () => {
    const gaps = zoneGaps(draft({ zn: 'Z' }), 0)
    const firstOptional = gaps.findIndex((g) => g.kind === 'optional')
    const lastRequired = gaps.map((g) => g.kind).lastIndexOf('required')
    if (firstOptional >= 0 && lastRequired >= 0) expect(lastRequired).toBeLessThan(firstOptional)
  })

  it('required items read as advisory, not as blockers', () => {
    // This surface gates nothing — the assessor decides when a zone is done.
    // Blocker language on a screen that blocks nothing trains people to
    // dismiss it.
    const whys = zoneGaps(draft({ zn: 'Z' }), 0).filter((g) => g.kind === 'required').map((g) => g.why)
    expect(whys.length).toBeGreaterThan(0)
    for (const why of whys) {
      expect(why).toMatch(/^Needed for a complete /)
      expect(why).not.toMatch(/cannot|must|required|blocked/i)
    }
  })

  it('every item carries a label, a why and a traceable source', () => {
    for (const g of zoneGaps(draft({ zn: 'Z', co2: '1200' }), 0)) {
      expect(g.label, g.id).toBeTruthy()
      expect(g.why, g.id).toBeTruthy()
      expect(['sufficiency', 'defensibility']).toContain(g.source)
    }
  })

  it('ids are unique within a zone', () => {
    const ids = zoneGaps(draft({ zn: 'Z' }), 0).map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is deterministic — the same record gives the same list', () => {
    const z = { ...completeZone(), co2: '1400', co2o: '' }
    expect(JSON.stringify(zoneGaps(draft(z), 0))).toBe(JSON.stringify(zoneGaps(draft(z), 0)))
  })

  it('an absent zone yields nothing rather than throwing', () => {
    expect(zoneGaps(draft(completeZone()), 7)).toEqual([])
    expect(zoneGaps(null as never, 0)).toEqual([])
  })

  it('zoneGapCounts returns one count per zone', () => {
    const d = { zones: [completeZone(), { zn: 'Bare' }], presurvey: {}, bldg: {}, recs: {}, zoneScores: [] }
    const counts = zoneGapCounts(d)
    expect(counts).toHaveLength(2)
    expect(counts[1]).toBeGreaterThan(counts[0])
  })
})

describe('it adds no judgement of its own', () => {
  it('holds no thresholds and no severity logic', () => {
    // Whether a reading is elevated is the criterion registry's answer. A
    // number in this file would be a second, uncitable opinion about it.
    const src = readFileSync(new URL('../../src/engines/zone-gaps.js', import.meta.url), 'utf8')
    const code = src.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/\b\d{3,}\b/)           // no thresholds
    expect(code).not.toMatch(/\bSTD\b|criteria\.js/) // no threshold registry read
    // Reading `g.severity` off a defensibility gap is consumption and is
    // fine; AUTHORING one would be this module forming its own opinion about
    // how bad something is. Only the second is forbidden.
    expect(code).not.toMatch(/severity:\s*['"]/)
    expect(code).not.toMatch(/['"]critical['"]/)
  })

  it('imports only the two engines it composes', () => {
    const src = readFileSync(new URL('../../src/engines/zone-gaps.js', import.meta.url), 'utf8')
    const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
    expect(imports.sort()).toEqual(['./defensibility-gaps.js', './sufficiency.js'])
  })
})

/**
 * Whether the zone-complete sheet interrupts at all.
 *
 * A workflow decision layered ON TOP of the gap list, never inside it:
 * `zoneGaps` still returns the optional items and the Readiness panel still
 * lists them at review. The only question here is whether what is left is
 * worth stopping a walkthrough for.
 */
describe('interruptsZoneCompletion', () => {
  const gap = (kind: string, id = kind) => ({ id, kind, label: id, why: '', rank: 0, source: 'sufficiency' })

  it('shows the panel when a required gap remains, even alongside optional ones', () => {
    expect(interruptsZoneCompletion([gap('required'), gap('optional')])).toBe(true)
  })

  it('shows the panel for an evidentiary gap — warn or info — alongside optional ones', () => {
    expect(interruptsZoneCompletion([gap('warn'), gap('optional')])).toBe(true)
    expect(interruptsZoneCompletion([gap('info'), gap('optional')])).toBe(true)
  })

  it('does not interrupt when every remaining gap is optional', () => {
    expect(interruptsZoneCompletion([gap('optional', 'a'), gap('optional', 'b')])).toBe(false)
  })

  it('does not interrupt when there are no gaps at all', () => {
    expect(interruptsZoneCompletion([])).toBe(false)
    expect(interruptsZoneCompletion(undefined as never)).toBe(false)
  })

  it('an unrecognized kind still interrupts, so a new gap type is seen rather than silenced', () => {
    expect(interruptsZoneCompletion([gap('some_future_kind')])).toBe(true)
  })

  /**
   * Everything a thorough assessor records: the required inputs, the outdoor
   * baselines, and the measurement conditions the defensibility rules ask for.
   * `completeZone()` is deliberately NOT enough here — it satisfies sufficiency
   * but still draws two `warn` gaps (outdoor CO₂ baseline, HVAC operating
   * status), so the panel rightly still interrupts for it.
   */
  const thoroughZone = () => ({
    ...completeZone(),
    co2o: '420', tfo: '80', rho: '50', pmo: '9',
    meas_conditions: 'Occupied, HVAC running', meas_duration: '15 min', meas_occ: '12',
  })
  const thoroughDraft = () => draft(thoroughZone(), {
    presurvey: { ht: 'Packaged rooftop units (RTU)' }, bldg: { ht: 'Packaged rooftop units (RTU)' },
  })

  it('holds on real gaps: a thoroughly recorded zone is left alone, a bare one is not', () => {
    // The case this exists for. A zone with everything captured still yields a
    // handful of `optional` extras, and greeting that assessor with the same
    // panel as one who skipped a required reading is what makes it ignorable.
    const thorough = zoneGaps(thoroughDraft(), 0)
    expect(thorough.length).toBeGreaterThan(0)
    expect(thorough.every((g) => g.kind === 'optional')).toBe(true)
    expect(interruptsZoneCompletion(thorough)).toBe(false)

    const bare = zoneGaps(draft({ zn: 'Room 101' }), 0)
    expect(bare.some((g) => g.kind === 'required')).toBe(true)
    expect(interruptsZoneCompletion(bare)).toBe(true)
  })

  it('still interrupts for an evidentiary gap a merely sufficient zone leaves open', () => {
    // completeZone() satisfies every required input and is still missing the
    // outdoor baseline and the HVAC operating status. Those are warns, so the
    // assessor is still stopped — the gate narrows the panel, it does not
    // silence the defensibility rules.
    const gaps = zoneGaps(draft(completeZone()), 0)
    expect(gaps.filter((g) => g.kind === 'warn').length).toBeGreaterThan(0)
    expect(interruptsZoneCompletion(gaps)).toBe(true)
  })

  it('the optional gaps are not dropped or reclassified — only the interrupt is suppressed', () => {
    const thorough = zoneGaps(thoroughDraft(), 0)
    // Still returned, still marked optional, still carrying their labels for
    // the review surfaces that list them.
    expect(thorough.length).toBeGreaterThan(0)
    expect([...new Set(thorough.map((g) => g.kind))]).toEqual(['optional'])
    expect(thorough.every((g) => typeof g.label === 'string' && g.label.length > 0)).toBe(true)
    expect(thorough.map((g) => g.label)).toContain('Formaldehyde reading')
  })

  it('the zone-complete sheet is gated on this helper, not on gaps.length', () => {
    // A source pin: the gate is one line in a 6,700-line component and is
    // trivially lost in a merge. If it goes, this fails rather than the
    // regression reaching an assessor.
    const src = readFileSync(new URL('../../src/components/MobileApp.jsx', import.meta.url), 'utf8')
    expect(src).toContain('interruptsZoneCompletion(gaps)')
    // The old unconditional gate must not come back alongside it.
    expect(src).not.toContain('if (!gaps.length) return null')
  })
})
