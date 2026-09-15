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

  it('writes only the two files --out names, and nothing else', () => {
    // writeFileSync is the whole write surface. Anything that creates,
    // appends to or removes a path is a persistence mechanism this tool
    // was explicitly not given.
    const writers = CODE.match(/\b(appendFileSync|rmSync|unlinkSync|mkdirSync|rmdirSync|createWriteStream|copyFileSync|renameSync)\b/g)
    expect(writers, 'the harness grew a second write path').toBeNull()
    // Two, not one: blind mode writes the key beside the scoring
    // document. Both destinations derive from --out, so a run that was
    // not given one still writes nothing.
    const calls = CODE.match(/writeFileSync\(([a-zA-Z]+),/g) || []
    expect(calls.map((c) => c.replace(/writeFileSync\(|,/g, ''))).toEqual(['out', 'keyPath'])
    expect(CODE).toContain('const keyPath = keyPathFor(out)')
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

describe('blind scoring hides which arm is which', () => {
  const { blindAssign, blindCaseBlocks, keyPathFor, sectionsBlock, rubricForm, BLIND_LABELS } = __eval as any

  /**
   * Two arms built to be as revealing as a real run could be: the plan
   * arm carries a plan and a blocked section, the prompts differ in
   * length, the costs differ. If anything identifying survives into the
   * scoring document, it survives here.
   */
  const arm = (tag: string, extra: Record<string, unknown> = {}) => ({
    name: tag,
    model: 'claude-sonnet-4-6',
    usage: { input_tokens: 9000, output_tokens: 800 },
    cost_usd: tag === 'A' ? 0.039 : 0.047,
    sections_present: ['executive_summary', 'discussion'],
    sections_absent: [],
    words: { executive_summary: 8, discussion: 7 },
    words_total: 15,
    repetition: { sentences: 2, duplicate_sentences: 0, shingles: 4, repeated_shingles: 0, repeat_rate: 0 },
    coverage: { register_entries: 3, register_touched: 2, findings_total: 4, findings_touched: 1, zones_total: 1, zones_named: 1 },
    gates: {
      blocked_sections: tag === 'A' ? 0 : 1,
      sections_with_banned_language: 0,
      per_section: {
        executive_summary: { supported: true, blocking: 0, warnings: 0, rules: [], banned_terms: [] },
        discussion: { supported: tag !== 'B', blocking: tag === 'B' ? 1 : 0, warnings: 0, rules: tag === 'B' ? ['pathway-rated'] : [], banned_terms: [] },
      },
    },
    sections: { executive_summary: `${tag} summary prose.`, discussion: `${tag} discussion prose.` },
    ...extra,
  })

  const armA = arm('A')
  const armB = arm('B', {
    plan: { present: true, usable: true, all_references_resolve: false, unresolved: ['primary_findings:find-deadbeef'], fields_used: ['overall_conclusion', 'throughline'] },
  })

  it('assigns both permutations and never the same arm twice', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 400; i++) {
      const a = blindAssign()
      expect([a.X, a.Y].sort()).toEqual(['A', 'B'])
      seen.add(`${a.X}${a.Y}`)
    }
    // 400 draws landing on one permutation would mean the coin is nailed
    // down, which is a blinding that only looks like one.
    expect(seen).toEqual(new Set(['AB', 'BA']))
  })

  it('leaks nothing identifying into the scoring document', () => {
    for (const assign of [{ X: 'A', Y: 'B' }, { X: 'B', Y: 'A' }]) {
      const doc = blindCaseBlocks('messy', 'messy — many zones', armA, armB, assign).scoring.join('\n')
      // Arm identity, the plan that only one arm can produce, the gate
      // verdicts, and the cost that tracks prompt length.
      expect(doc, 'arm label').not.toMatch(/\bArm [AB]\b/)
      expect(doc, 'plan block').not.toMatch(/no plan|\(plan\)|authoring.plan|Plan \(arm/i)
      expect(doc, 'gate verdict').not.toMatch(/BLOCKED BY AUDIT|pathway-rated/)
      expect(doc, 'cost or tokens').not.toMatch(/cost|tokens|usd/i)
      expect(doc, 'hash or commit').not.toMatch(/sha256|[0-9a-f]{16}/)
      expect(doc).toContain('Report X')
      expect(doc).toContain('Report Y')
    }
  })

  it('puts each arm behind the label it was actually drawn for', () => {
    const xIsB = blindCaseBlocks('messy', 'l', armA, armB, { X: 'B', Y: 'A' }).scoring.join('\n')
    expect(xIsB.indexOf('B summary prose.')).toBeGreaterThan(xIsB.indexOf('Report X'))
    expect(xIsB.indexOf('B summary prose.')).toBeLessThan(xIsB.indexOf('Report Y'))

    const xIsA = blindCaseBlocks('messy', 'l', armA, armB, { X: 'A', Y: 'B' }).scoring.join('\n')
    expect(xIsA.indexOf('A summary prose.')).toBeGreaterThan(xIsA.indexOf('Report X'))
    expect(xIsA.indexOf('A summary prose.')).toBeLessThan(xIsA.indexOf('Report Y'))
  })

  it('records the mapping and every withheld signal in the key', () => {
    const key = blindCaseBlocks('messy', 'messy — many zones', armA, armB, { X: 'B', Y: 'A' }).key.join('\n')
    expect(key).toContain('| Report X | B — plan (working tree) |')
    expect(key).toContain('| Report Y | A — no plan (pinned baseline) |')
    // Everything the scoring document refused to show has to land here,
    // or blinding has destroyed the measurement rather than protecting it.
    expect(key).toContain('Plan (arm B only)')
    expect(key).toContain('find-deadbeef')
    expect(key).toContain('BLOCKED BY AUDIT')
    expect(key).toContain('pathway-rated')
    expect(key).toMatch(/cost \(USD\)/)
  })

  it('scores the rubric by label, not by arm', () => {
    const form = rubricForm('messy', BLIND_LABELS)
    expect(form).toContain('| Category | Report X | Report Y |')
    expect(form).not.toMatch(/Arm [AB]/)
    // Same seven categories and the same gap rule either way.
    expect(form.match(/☐ 1 ☐ 2 ☐ 3 ☐ 4 ☐ 5/g) || []).toHaveLength(14)
    expect(form).toContain('Note (required if gap ≥ 2)')
  })

  it('hides the gate findings only when asked', () => {
    expect(sectionsBlock(armB)).toContain('BLOCKED BY AUDIT')
    expect(sectionsBlock(armB, { hideGates: true })).not.toContain('BLOCKED BY AUDIT')
    // The prose itself is untouched either way.
    expect(sectionsBlock(armB, { hideGates: true })).toContain('B discussion prose.')
  })

  it('writes the key beside the scoring document', () => {
    expect(keyPathFor('/tmp/ab.md')).toBe('/tmp/ab.key.md')
    expect(keyPathFor('/tmp/ab')).toBe('/tmp/ab.key.md')
  })

  it('refuses a blind run that would print the key to stdout, or has no prose', () => {
    // --blind without --out would write the key to the same stream as the
    // prose; --blind on a dry run has nothing to score.
    expect(CODE).toContain("if (blind && !out) fail(")
    expect(CODE).toContain("if (blind && dry) fail(")
  })
})
