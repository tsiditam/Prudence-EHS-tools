// @vitest-environment node
/**
 * The A/B authoring harness: isolated by construction, and its signals
 * demonstrably move.
 *
 * ── Two separate claims ────────────────────────────────────────────────
 * The first is a NEGATIVE one and can only be checked statically: the
 * harness has no ability to modify production data, persist a result
 * anywhere but the one markdown file it is told to write, or reach the
 * authenticated endpoint. That is a property of what the file contains,
 * so it is checked by reading the file.
 *
 * The second is behavioral. The deterministic table is the half of this
 * exercise that claims to be a measurement, and a signal nobody has
 * watched move is decoration — every number in it gets a case here that
 * makes it change.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// @ts-ignore js
import { __eval } from '../../scripts/ab-authoring.mjs'

const SOURCE = readFileSync(resolve(__dirname, '../../scripts/ab-authoring.mjs'), 'utf8')

/**
 * The harness with its commentary removed.
 *
 * The negative checks below run against this rather than the raw file,
 * for the reason the prompt suite already works this way: the header
 * STATES that the harness imports no Supabase, and a guard that reads its
 * own guarantee as a violation fails on the sentence promising the thing
 * it is checking. Positive assertions still read `SOURCE`.
 */
const CODE = SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

describe('the harness cannot touch what it evaluates', () => {
  it('imports no Supabase and names no table', () => {
    // An evaluation tool with a database client is one bug away from
    // being an evaluation tool that writes to the database.
    expect(CODE).not.toMatch(/supabase/i)
    expect(CODE).not.toMatch(/cloudStorage|supabaseStorage|localStorage|indexedDB/)
  })

  it('never calls the authenticated endpoint, only the provider adapter', () => {
    // Going through /api/report-sections would spend credits against a
    // real account and write to the ledger. The adapter is the layer
    // below that, and it is the one this imports.
    expect(CODE).not.toContain('/api/report-sections')
    expect(CODE).not.toContain('/api/narrative')
    expect(SOURCE).toContain('_report-authoring-provider.js')
  })

  it('writes exactly one file, and only where it is told', () => {
    // writeFileSync for --out is the whole write surface. Anything that
    // creates, appends to or removes a path is a persistence mechanism
    // this tool was explicitly not given.
    const writers = CODE.match(/\b(appendFileSync|rmSync|unlinkSync|mkdirSync|rmdirSync|createWriteStream|copyFileSync|renameSync)\b/g)
    expect(writers, 'the harness grew a second write path').toBeNull()
    expect(CODE.match(/writeFileSync\(/g) || []).toHaveLength(1)
  })

  it('runs no git command that could change the repository', () => {
    // Arm A is read with `git show`. A write verb here would make the
    // pinned baseline something this script could move.
    const gitCalls = [...CODE.matchAll(/execFileSync\('git', \[([^\]]*)\]/g)].map((m) => m[1])
    expect(gitCalls).toHaveLength(1)
    expect(gitCalls[0]).toContain("'show'")
  })

  it('pins arm A to a commit and a hash rather than a file on disk', () => {
    expect(__eval.ARM_A_COMMIT).toMatch(/^[0-9a-f]{7,40}$/)
    expect(__eval.ARM_A_SHA256).toMatch(/^[0-9a-f]{64}$/)
    // Read from git, never from the working tree: there is no copy of
    // the baseline on disk for an edit to reach.
    expect(CODE).not.toMatch(/readFileSync\([^)]*_report-sections-prompt/)
  })

  it('importing it neither boots the engine nor calls anything', () => {
    // The import at the top of this file already proved it: a harness
    // that ran its main() on import would have made provider calls to
    // get here. This states the guard that makes that true.
    expect(SOURCE).toContain('fileURLToPath(import.meta.url) === process.argv[1]')
  })
})

describe('the deterministic signals move', () => {
  const { flatten, repetition, coverage, zoneKey, words } = __eval as any

  const sections = (overrides: Record<string, unknown> = {}) => ({
    executive_summary: 'Carbon dioxide reached 1240 ppm in Room 214.',
    discussion: 'Ventilation does not keep pace with occupancy.',
    conceptual_site_model: 'No pathway has been established.',
    recommendations_prose: 'Verification precedes investment in a fix.',
    parameter_background: { co2: 'An indicator of ventilation effectiveness.', thermal: 'Evaluated as a seasonal band.' },
    ...overrides,
  })

  it('flattens parameter_background into one entry per parameter', () => {
    const flat = flatten(sections())
    expect(flat.map(([k]: [string, string]) => k)).toEqual([
      'executive_summary', 'discussion', 'conceptual_site_model', 'recommendations_prose',
      'parameter_background.co2', 'parameter_background.thermal',
    ])
  })

  it('reports a section as absent rather than empty when the model skipped it', () => {
    const flat = flatten(sections({ discussion: '   ' }))
    expect(flat.some(([k]: [string, string]) => k === 'discussion')).toBe(false)
  })

  it('counts a sentence repeated across sections, and stays at zero without one', () => {
    const line = 'Carbon dioxide reached 1240 ppm in Room 214.'
    expect(repetition(flatten(sections())).duplicate_sentences).toBe(0)
    expect(repetition(flatten(sections({ discussion: line }))).duplicate_sentences).toBe(1)
  })

  it('counts a reworked clause that no sentence check would see', () => {
    // The subtler fault: the same run of words carried into another
    // section inside a different sentence.
    const clean = repetition(flatten(sections()))
    const echoed = repetition(flatten(sections({
      discussion: 'As noted, carbon dioxide reached 1240 ppm in Room 214 during the survey.',
    })))
    expect(clean.repeated_shingles).toBe(0)
    expect(echoed.repeated_shingles).toBeGreaterThan(0)
    expect(echoed.repeat_rate).toBeGreaterThan(0)
  })

  it('cuts a zone label at its qualifier, because no report names a zone that way', () => {
    expect(zoneKey('Room 214 (refurnished — logger location)')).toBe('room 214')
    expect(zoneKey('Open Office — West')).toBe('open office')
    expect(zoneKey('Conference Room B')).toBe('conference room b')
  })

  const wire = {
    findings: [
      { id: 'find-1', zone: 'Room 214 (refurnished — logger location)', text: 'Occupant symptoms resolve away from the building' },
      { id: 'find-2', zone: 'Room 214 (refurnished — logger location)', text: 'Particulate concentrations tracked outdoor conditions' },
    ],
    recommendation_options: [
      { id: 'rec-1', action: 'Verify outdoor air delivery at the terminal unit.' },
      { id: 'rec-2', action: 'Replace the filtration media on the rooftop unit.' },
    ],
  }

  it('counts the zone as named only when the prose names it', () => {
    expect(coverage(flatten(sections()), wire).zones_named).toBe(1)
    expect(coverage(flatten(sections({ executive_summary: 'Carbon dioxide reached 1240 ppm.' })), wire).zones_named).toBe(0)
  })

  it('counts a register entry and a finding as touched when the prose reaches them', () => {
    const bare = coverage(flatten(sections()), wire)
    expect(bare.register_entries).toBe(2)
    expect(bare.findings_total).toBe(2)
    expect(bare.findings_touched).toBe(0)
    expect(bare.register_touched).toBe(0)

    const reaching = coverage(flatten(sections({
      discussion: 'Occupant symptoms were reported, and filtration media on the rooftop unit is overdue.',
    })), wire)
    expect(reaching.findings_touched).toBe(1)
    expect(reaching.register_touched).toBe(1)
  })

  it('counts words the way a reader would', () => {
    expect(words('  one   two three  ')).toBe(3)
    expect(words('')).toBe(0)
  })
})

describe('the rubric is a form, not a score', () => {
  it('offers 1-5 for both arms in all seven categories and demands a note on a gap', () => {
    expect(__eval.RUBRIC).toHaveLength(7)
    const form = __eval.rubricForm('messy')
    for (const [name] of __eval.RUBRIC as Array<[string, string]>) expect(form).toContain(name)
    expect(form).toContain('Note (required if gap ≥ 2)')
    // Seven rows, each offering the scale twice — once per arm.
    expect(form.match(/☐ 1 ☐ 2 ☐ 3 ☐ 4 ☐ 5/g) || []).toHaveLength(14)
  })

  it('scores nothing itself', () => {
    // The whole question being tested is whether a model's opinion about
    // report quality is worth anything. A harness that scored the rubric
    // would be answering it with itself.
    expect(CODE).not.toMatch(/\bscoreSection|autoScore|judgeArm|rateQuality\b/)
  })
})
