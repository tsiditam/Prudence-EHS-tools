/**
 * Where the 30–60% relative-humidity band comes from.
 *
 * It was cited to ASHRAE 55-2023 across eleven surfaces — the engine finding,
 * the Logger Studio chart band and its legend, the DOCX criteria table, the
 * print report's standards table, Jasper's corpus, the live advisor, the
 * pressurization detail line, the report model's parameter basis, the
 * narrative library, and a recommendation's `standardReference`. The
 * attribution was wrong twice over:
 *
 *   * ASHRAE 55 expresses its upper humidity limit as a HUMIDITY RATIO
 *     (0.012 kg water per kg dry air), not as a relative-humidity percentage.
 *     60% RH is a rough equivalent at comfort temperatures, not the figure
 *     the standard states.
 *   * ASHRAE 55 sets NO lower humidity limit. It dropped one in 55-2013. So
 *     the 30% floor was attributed to a standard that does not contain it.
 *
 * The band is real and stays; it is US EPA moisture-control guidance — keep
 * indoor RH below 60%, ideally 30–50%. This project's own standards corpus
 * already recorded all of that while every rendering surface said otherwise,
 * which is the specific failure these tests exist to prevent: nothing
 * asserted the citation, so nothing noticed when it was wrong.
 *
 * The mechanism behind the spread is worth keeping in view — `STD.t.rh` sat
 * inside `STD.t`, whose `ref` is ASHRAE 55, and six of those surfaces simply
 * read `STD.t.ref`. One wrong inheritance, eleven wrong claims.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STD } from '../../src/constants/standards'
import { scoreZone } from '../../src/engines/scoring'
import { resolveReference } from '../../src/utils/referenceProfiles'

const root = join(__dirname, '../..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const rhFinding = (rh: string) =>
  ((scoreZone({ zn: 'Z', su: 'office', rh } as never, { assessmentDate: '2026-07-15' } as never) as never as any)
    .cats.find((c: any) => c.l === 'Environment')?.r || [])
    .find((f: any) => String(f.t).startsWith('RH '))

describe('the band carries its own citation', () => {
  it('does not inherit the temperature standard', () => {
    expect(STD.t.rh.ref).toBeTruthy()
    expect(STD.t.rh.ref).not.toBe(STD.t.ref)
    expect(STD.t.rh.ref).not.toMatch(/ASHRAE/i)
    expect(STD.t.rh.ref).toMatch(/EPA/)
  })

  it('keeps the band itself — only the source was wrong', () => {
    expect(STD.t.rh).toMatchObject({ min: 30, max: 60 })
  })

  it('is registered in the standards manifest under its own name', () => {
    // A citation the manifest does not know is a citation nobody can check.
    const manifest = read('src/constants/standards.js')
    expect(manifest).toContain("'EPA Mold, Moisture and Your Home'")
  })
})

describe('every surface that states the band states the right source', () => {
  it('the engine finding cites EPA, not ASHRAE 55', () => {
    for (const rh of ['20', '75']) {
      const f = rhFinding(rh)
      expect(f, `${rh}%`).toBeTruthy()
      expect(f.std).toBe(STD.t.rh.ref)
      expect(String(f.std)).not.toMatch(/ASHRAE/i)
      expect(String(f.bandLabel)).not.toMatch(/ASHRAE/i)
    }
  })

  it('the Logger Studio / monitoring reference cites EPA and explains the split basis', () => {
    const ref = resolveReference('rh', 'ashrae-comfort', { unit: '%' })!
    expect(ref.band).toEqual([30, 60])
    expect(ref.source).toBe(STD.t.rh.ref)
    expect(ref.label).not.toMatch(/ASHRAE/i)
    // The two bounds have different rationales, and a reader who is told only
    // "30–60%" cannot tell that the upper one is about condensation.
    expect(ref.note).toMatch(/microbial/i)
    expect(ref.note).toMatch(/ASHRAE 55 sets only an upper humidity limit/i)
  })

  it('the profile id is unchanged, so a saved report still resolves', () => {
    // Only the label and source were wrong. Renaming the id would silently
    // fall back to the first profile for every report that stored a selection.
    expect(resolveReference('rh', 'ashrae-comfort', { unit: '%' })!.profileId).toBe('ashrae-comfort')
  })
})

describe('no source file claims ASHRAE 55 for humidity again', () => {
  // The sweep that would have caught the original defect. Any line that names
  // ASHRAE alongside humidity must be saying what ASHRAE 55 does NOT do.
  const FILES = [
    'src/constants/standards.js',
    'src/constants/field-assistant-corpus.js',
    'src/engines/scoring.js',
    'src/engines/liveAdvisor.js',
    'src/engines/pressurization.js',
    'src/utils/referenceProfiles.js',
    'src/components/sensor/SensorCharts.jsx',
    'src/components/docx/canonical-content.js',
    'src/components/PrintReport.jsx',
    'src/report/reportModel.js',
    'src/report/narrativeLibrary.js',
    'src/engine/report/phrases/environment.ts',
    'src/engine/report/parameter-prose/thermal.ts',
    // Added 2026-09 (AUDIT-2026-09 C1/C2/C4): nine building profiles, the
    // Logger card, the intake hints, the print report's parameter table, the
    // Jasper knowledge base and the DOCX narrative all stated the band under
    // ASHRAE 55 (or 62.1) and none of them was in this list.
    'src/engines/buildingProfiles.js',
    'src/utils/sensorThresholds.js',
    'src/constants/questions.js',
    'src/constants/fm-questions.js',
    'src/constants/iaq-knowledge-base.js',
    'src/constants/field-assistant-corpus.js',
    'src/report/narrativeLibrary.js',
  ]

  // Phrases that DISCLAIM the attribution rather than make it. A line
  // containing one of these is allowed to mention ASHRAE next to humidity.
  const DISCLAIMERS = [
    /not (the source|an ASHRAE)/i,
    /no lower humidity/i,
    /sets no lower/i,
    /only an upper humidity limit/i,
    /does not (specify|set) a (lower|minimum) humidity/i,
    /dropped (its own|one|its lower)/i,
    /humidity ratio/i,
    /cited separately/i,
    /was wrong/i,
    /Was 'ASHRAE/i,
    // A line may legitimately name both standards — a threshold summary
    // citing ASHRAE 55 for temperature AND EPA for humidity is correct, and
    // that is the shape a reader most needs. It qualifies only when the
    // humidity figure carries its own citation on the same line.
    /humidity \(US EPA|RH [^·]*\(US EPA/i,
  ]

  // Comment lines are exempt, and deliberately so. The account of what the
  // citation used to be and why it was wrong is the removal record — the same
  // reason NO-COMPOSITE-SCORE scopes its patterns to code shapes. What this
  // sweep is for is what the PRODUCT asserts, so it reads the lines that
  // reach a page: string literals, JSX text, table cells.
  const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line)

  for (const rel of FILES) {
    it(`${rel} attributes the band correctly`, () => {
      const offenders = read(rel)
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => !isComment(line))
        .filter(({ line }) => /ASHRAE/i.test(line) && /humid|\bRH\b/i.test(line))
        .filter(({ line }) => !DISCLAIMERS.some((d) => d.test(line)))
      expect(offenders.map((o) => `${rel}:${o.n} ${o.line.trim()}`)).toEqual([])
    })

    // The phrasing-independent form. The profiles stated the band as
    // `{ min: 30, max: 60, label: 'ASHRAE 55' }` — no "humidity", no "RH" —
    // and the Logger card as `${STD.v.ref}: ${STD.t.rh.min}–${STD.t.rh.max}%`,
    // which names neither number in source. So: the two figures within 40
    // characters of "ASHRAE 55" or "62.1" on a non-comment line fails, and
    // a reference to the temperature/ventilation ref BESIDE the rh band
    // constants fails too, however it is worded.
    it(`${rel} does not put 30 and 60 beside ASHRAE 55 or 62.1`, () => {
      const NEAR = /(ASHRAE\s*55|62\.1)[^\n]{0,40}\b30\b[^\n]{0,10}\b60\b|\b30\b[^\n]{0,10}\b60\b[^\n]{0,40}(ASHRAE\s*55|62\.1)/i
      const INHERITED = /STD\.(t|v)\.ref[^\n]{0,40}STD\.t\.rh\.(min|max)|STD\.t\.rh\.(min|max)[^\n]{0,40}STD\.(t|v)\.ref/
      const offenders = read(rel)
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => !isComment(line))
        .filter(({ line }) => NEAR.test(line) || INHERITED.test(line))
        .filter(({ line }) => !DISCLAIMERS.some((d) => d.test(line)))
      expect(offenders.map((o) => `${rel}:${o.n} ${o.line.trim()}`)).toEqual([])
    })
  }
})
