/**
 * The editorial layer's retirements must actually reach the deliverable.
 *
 * `src/engine/report/phrases/` is where this codebase decides what may and
 * may not be said about a condition. It carries `bannedAlternatives` per
 * entry, and — three times now — a comment recording an over-reaching
 * sentence that was deliberately removed.
 *
 * None of it governed the engine. `phrases/` is read by `renderClientReport`
 * and PrintReport; the AtmosFlow DOCX, which has been the ONLY client
 * deliverable since 2026-08, renders what `reportModel.collectFindings` and
 * `genRecs` produce — raw text off `scoring.js` and `scoring-legacy.js`. So
 * every one of those retirements was written down, believed, and then went on
 * shipping from the engine anyway:
 *
 *   1. `hvac.ts`  — the automatic Legionella / ASHRAE 188 escalation, fired by
 *      one intake dropdown, citing a standard scoped to aerosol-generating
 *      water systems. Live in scoring.js and genRecs.
 *   2. `hvac.ts`  — the automatic EPA-registered-biocide instruction, on the
 *      reasoning that biocide selection is a maintenance decision, not a
 *      screening finding. Live in `drainpan_clean`.
 *   3. `complaints.ts` — the ATSDR occupant-risk-communication action, as
 *      disproportionate to a routine commercial IAQ assessment with no
 *      hazardous release identified. Live at scoring-legacy.js:250.
 *
 * All three are fixed. This file exists because finding them one at a time —
 * each surfacing only when somebody happened to read a screenshot — is not a
 * process, and there was nothing to stop a fourth.
 *
 * ── What is asserted ──────────────────────────────────────────────────────
 * Two properties, and the first is the general one:
 *
 *   A. **The engine honours the phrase library's bans.** Every finding the
 *      engine emits classifies to a condition type; that type's entry lists
 *      what may not be said about it. The engine's own sentence must not say
 *      any of it. This is a machine-checkable cross-layer invariant and it
 *      needs no comment to keep working.
 *
 *   B. **The three named retirements stay retired**, at the engine, at
 *      `collectFindings`, and in `genRecs`. A comment claiming something was
 *      removed is a claim; this is the test that makes it true.
 *
 * The generalisable lesson, recorded in CLAUDE.md: a phrase-library change is
 * not a product change until the engine text it paraphrases says the same
 * thing. Editing `phrases/` alone changes what PrintReport renders and
 * nothing a client receives.
 */
import { describe, it, expect } from 'vitest'
import { scoreZone, genRecs } from '../../src/engines/scoring'
import { collectFindings } from '../../src/report/reportModel'
import { classifyCondition } from '../../src/engine/bridge/classify'
import { PHRASE_LIBRARY } from '../../src/engine/report/phrases'

const BLDG = { assessmentDate: '2026-07-15' }

/**
 * A matrix wide enough that every finding branch in the engine fires at least
 * once. Kept as whole zones rather than single fields because several
 * branches only trip in combination (symptom cluster needs complaints AND
 * severity; the mould chain needs moisture AND odour).
 */
const ZONES: Array<Record<string, unknown>> = [
  { dp: 'Standing water' },
  { dp: 'Bio growth observed' },
  { dp: 'Clean — draining' },
  { dp: 'Not accessible' },
  { fm: 'No filter' },
  { fc: 'Heavily loaded' },
  { fc: 'Damaged / Bypass' },
  { sa: 'No airflow detected' },
  { hm: 'Over 12 months' },
  { hm: 'Unknown' },
  { co2: '1800' }, { co2: '1200' }, { co2: '3000' },
  { co: '60' }, { co: '15' },
  { pm: '60' }, { pm: '20' },
  { tv: '4000' }, { tv: '1200' },
  { hc: '1.0' }, { hc: '0.05' },
  { tf: '95' }, { tf: '45' },
  { rh: '85' }, { rh: '5' },
  { wd: 'Active leak' }, { wd: 'Extensive damage' },
  { mi: 'Visible growth <10 sq ft' }, { mi: 'Suspected discoloration' },
  { ot: ['Musty / Earthy'] },
  { path_crosstalk: 'Odor migration from adjacent suite' },
  { path_pressure: 'Negative (draws in)' },
  // Symptom cluster: complaints at high severity, which is what trips the
  // HEPA / relocation / (formerly) ATSDR block.
  {
    cx: 'Yes — complaints reported', sr: 'Yes — clear pattern', cc: 'Yes — this zone',
    ac: 'More than 10', sy: ['Headache', 'Eye irritation', 'Fatigue', 'Throat irritation'],
  },
  // The kitchen sink — several conditions at once, which is how the real
  // over-reaching combinations arise.
  {
    dp: 'Standing water', fc: 'Heavily loaded', hm: 'Over 12 months',
    co2: '1800', wd: 'Active leak', mi: 'Visible growth <10 sq ft',
    cx: 'Yes — complaints reported', sr: 'Yes — clear pattern', ac: '12',
    sy: ['Headache', 'Cough'], ot: ['Musty / Earthy'],
  },
]

const scored = ZONES.map((z) => ({
  zone: z,
  zs: scoreZone({ zn: 'Z', su: 'office', ...z } as never, BLDG as never) as never as any,
}))

/** Every (finding, category) pair the engine can emit across the matrix. */
const allFindings = scored.flatMap(({ zone, zs }) =>
  (zs.cats as any[]).flatMap((c: any) =>
    (c.r || []).map((r: any) => ({ zone, finding: r, category: c.l }))))

/** Every recommendation the engine can emit, flattened to plain text. */
const allRecTexts = scored.flatMap(({ zs }) => {
  const recs = genRecs([zs] as never, BLDG as never) as Record<string, unknown[]>
  return Object.values(recs)
    .filter(Array.isArray)
    .flat()
    .map((a: any) => (typeof a === 'string' ? a : a?.text || ''))
    .filter(Boolean)
})

describe('the matrix actually exercises the engine', () => {
  // Without this, every assertion below could pass on an empty list — the
  // failure mode where a guard reads as clean because it checked nothing.
  it('produces findings across every category and a broad set of recommendations', () => {
    expect(allFindings.length).toBeGreaterThan(60)
    expect(allRecTexts.length).toBeGreaterThan(30)
    const categories = new Set(allFindings.map((f) => f.category))
    expect(categories).toContain('HVAC')
    expect(categories).toContain('Ventilation')
    expect(categories).toContain('Contaminants')
    expect(categories).toContain('Environment')
    expect(categories).toContain('Complaints')
  })
})

describe('A — the engine never says what its own phrase entry forbids', () => {
  it('no finding contains a banned alternative for the condition it classifies to', () => {
    const violations: string[] = []
    for (const { zone, finding, category } of allFindings) {
      const conditionType = classifyCondition(finding as never, category as never, zone as never)
      const entry = (PHRASE_LIBRARY as any)[conditionType]
      if (!entry) continue
      for (const banned of entry.bannedAlternatives || []) {
        if (String(finding.t).toLowerCase().includes(String(banned).toLowerCase())) {
          violations.push(`${conditionType} bans "${banned}" — finding says "${finding.t}"`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('and no recommendation contains one either', () => {
    // Recommendations are not condition-typed, so the whole ban list applies.
    // Every entry in it is an over-claim ("mold confirmed", "unsafe CO
    // levels", "exceeds OSHA PEL") that is wrong wherever it appears, which
    // is what makes the union the right scope here rather than a shortcut.
    const allBanned = Object.values(PHRASE_LIBRARY as Record<string, any>)
      .flatMap((e: any) => e.bannedAlternatives || [])
      .map((b: string) => b.toLowerCase())
    const violations: string[] = []
    for (const text of allRecTexts) {
      for (const banned of allBanned) {
        if (text.toLowerCase().includes(banned)) violations.push(`"${banned}" in "${text}"`)
      }
    }
    expect([...new Set(violations)]).toEqual([])
  })

  it('the ban lists are non-empty, so this is checking something', () => {
    const total = Object.values(PHRASE_LIBRARY as Record<string, any>)
      .flatMap((e: any) => e.bannedAlternatives || []).length
    expect(total).toBeGreaterThan(30)
  })
})

describe('B — the three named retirements stay retired', () => {
  const findingTexts = allFindings.map((f) => String(f.finding.t))
  const citations = allFindings.map((f) => String(f.finding.std ?? ''))
  const everything = [...findingTexts, ...allRecTexts]

  it('1. no Legionella escalation, in a finding, a citation or a recommendation', () => {
    for (const text of everything) {
      expect(text).not.toMatch(/legionella/i)
      expect(text).not.toMatch(/\b188\b/)
      expect(text).not.toMatch(/water management program/i)
    }
    for (const std of citations) expect(std).not.toMatch(/188/)
  })

  it('1b. and nothing asserts a symptom the assessment did not record', () => {
    // The worse half of the Legionella recommendation, which deleting the
    // standard name alone would have left standing.
    for (const text of everything) {
      expect(text).not.toMatch(/given active occupant respiratory symptoms/i)
    }
  })

  it('2. no biocide is prescribed', () => {
    for (const text of everything) {
      expect(text).not.toMatch(/biocide/i)
      expect(text).not.toMatch(/epa-registered/i)
    }
  })

  it('3. no ATSDR risk-communication action', () => {
    for (const text of everything) {
      expect(text).not.toMatch(/atsdr/i)
      expect(text).not.toMatch(/risk communication plan/i)
    }
  })

  it('and the deliverable layer agrees — collectFindings carries none of it', () => {
    // The layer that actually reaches a client, and the one whose existence
    // is why all three survived. Asserting the engine alone is what missed
    // them; `sections-atmosflow.js` renders exactly this.
    const rows = collectFindings(scored.map((s) => s.zs) as never) as Array<{ text: string; std: string | null }>
    expect(rows.length).toBeGreaterThan(20)
    for (const row of rows) {
      expect(row.text).not.toMatch(/legionella|biocide|atsdr/i)
      expect(String(row.std ?? '')).not.toMatch(/188/)
    }
  })
})

describe('what must REMAIN — removals must not hollow out the advice', () => {
  // The counterweight to every assertion above. A guard that only checks for
  // absence is satisfied by an engine that recommends nothing at all, which
  // would be a worse defect than any of the three being removed.
  const recsFor = (zone: Record<string, unknown>) => {
    const zs = scoreZone({ zn: 'Z', su: 'office', ...zone } as never, BLDG as never)
    const recs = genRecs([zs] as never, BLDG as never) as Record<string, unknown[]>
    return Object.values(recs).filter(Array.isArray).flat()
      .map((a: any) => (typeof a === 'string' ? a : a?.text || ''))
  }

  it('a fouled drain pan still gets cleaned, immediately, with drainage corrected', () => {
    const texts = recsFor({ dp: 'Standing water' })
    expect(texts.some((t) => /clean the drain pan/i.test(t))).toBe(true)
    expect(texts.some((t) => /immediately/i.test(t))).toBe(true)
    expect(texts.some((t) => /slope|drainage/i.test(t))).toBe(true)
    // And the replacement names an authority for HOW, in place of naming a
    // product class the assessor never selected.
    expect(texts.some((t) => /manufacturer recommendations/i.test(t))).toBe(true)
  })

  // A symptom cluster is `Complaints` with a CRITICAL or HIGH finding, and
  // the NIOSH structured-instrument action reaches those two severities by
  // different branches — critical via the evacuate/document block, high via
  // the medium/high block. The ATSDR action was removed on the reasoning that
  // a structured survey is the proportionate step, so BOTH paths have to
  // actually produce one. This first failed on a fixture using `ac: '12'`,
  // which is not one of the field's options ('1-2' | '3-5' | '6-10' | 'More
  // than 10' | 'Unknown') and silently fell through to medium — where there
  // is no cluster at all, and the block under test never ran.
  it.each([
    ['More than 10', 'critical'],
    ['6-10', 'critical'],
    ['3-5', 'high'],
  ])('a %s-occupant cluster still gets a structured survey and interim controls', (ac) => {
    const texts = recsFor({
      cx: 'Yes — complaints reported', sr: 'Yes — clear pattern', cc: 'Yes — this zone',
      ac, sy: ['Headache', 'Eye irritation', 'Fatigue', 'Throat irritation'],
    })
    expect(texts.some((t) => /NIOSH IEQ questionnaire/i.test(t)), 'no structured symptom instrument').toBe(true)
    // The interim control for a symptom cluster is relocation. Portable HEPA
    // units used to be offered here too, on a symptom-only fixture with no
    // particulate finding — a recommendation stating a condition the
    // assessment had not observed (audit 2026-09, M5). They are still
    // offered when a particulate finding exists; asserted below.
    expect(texts.some((t) => /temporary relocation/i.test(t)), 'no interim control').toBe(true)
    expect(texts.some((t) => /HEPA/i.test(t)), 'HEPA offered with no particulate finding').toBe(false)
    const withPm = recsFor({
      cx: 'Yes — complaints reported', sr: 'Yes — clear pattern', cc: 'Yes — this zone',
      ac, sy: ['Headache', 'Eye irritation', 'Fatigue', 'Throat irritation'], pm: '40',
    })
    expect(withPm.some((t) => /HEPA/i.test(t)), 'HEPA withheld despite a particulate finding').toBe(true)
    expect(texts.some((t) => /relocation/i.test(t)), 'no relocation evaluation').toBe(true)
  })

  it('and a 1–2 occupant report is not a cluster, so that block never ran anyway', () => {
    // The boundary. Removing ATSDR changes nothing here because the whole
    // HEPA / relocation / risk-communication block is gated on a critical or
    // high complaints finding, and '1-2' is medium.
    const texts = recsFor({ cx: 'Yes — complaints reported', ac: '1-2' })
    expect(texts.some((t) => /HEPA/i.test(t))).toBe(false)
  })

  it('every zone with a critical or high finding gets at least one action', () => {
    // The broadest form of the same property: no severe condition may end up
    // with nothing recommended.
    for (const { zone, zs } of scored) {
      const severe = (zs.cats as any[]).flatMap((c: any) => c.r || [])
        .filter((r: any) => r.sev === 'critical' || r.sev === 'high')
      if (!severe.length) continue
      expect(recsFor(zone).length, `${JSON.stringify(zone)} has severe findings and no actions`)
        .toBeGreaterThan(0)
    }
  })
})
