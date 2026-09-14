/**
 * Every generation_type an API handler writes is allowed by the
 * narrative_generations CHECK constraint — as last defined by ANY migration.
 *
 * Three endpoints once ran with no working rate limit because their type
 * violated the constraint and the ledger insert silently landed nothing
 * (audit §2.5). After the limiter was made to fail closed, the same omission
 * became a hard outage instead: /api/report-sections shipped with
 * generation_type 'report_sections', migration 033's list did not have it,
 * every reservation was refused and every generation returned 500 before
 * reaching the model. The migration-033 test pinned 033's list against the
 * six handlers it knew about; a seventh handler could not fail it.
 *
 * This test is written the other way round: it discovers the handlers and
 * the constraint, so a new handler with a new type fails here until a
 * migration adds it.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const API_DIR = path.resolve('api')
const MIGRATIONS_DIR = path.resolve('supabase/migrations')

/** `{ file: type }` for every handler under api/ that declares a GENERATION_TYPE. */
function handlerTypes() {
  const out: Record<string, string> = {}
  for (const f of readdirSync(API_DIR)) {
    if (!/\.(js|ts)$/.test(f) || f.startsWith('_')) continue
    const src = readFileSync(path.join(API_DIR, f), 'utf8')
    const m = src.match(/const GENERATION_TYPE = '([a-z_]+)'/)
    if (m) out[`api/${f}`] = m[1]
  }
  return out
}

/** The allowed list from the LAST migration (by file order) that defines the constraint. */
function constraintTypes(): { file: string; types: string[] } {
  const files = readdirSync(MIGRATIONS_DIR).filter(f => /^\d{3}_.*\.sql$/.test(f)).sort()
  let last: { file: string; types: string[] } | null = null
  for (const f of files) {
    const code = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8').replace(/^\s*--.*$/gm, '')
    const start = code.indexOf('ADD CONSTRAINT narrative_generations_type_check')
    if (start === -1) continue
    const block = code.slice(start, code.indexOf('));', start))
    const types = [...block.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
    last = { file: f, types }
  }
  if (!last) throw new Error('no migration defines narrative_generations_type_check')
  return last
}

describe('narrative_generations generation_type CHECK covers every handler', () => {
  const handlers = handlerTypes()
  const constraint = constraintTypes()

  it('discovers the handlers it is guarding (not a hand-typed list)', () => {
    expect(Object.keys(handlers).length).toBeGreaterThanOrEqual(7)
    expect(handlers['api/report-sections.js']).toBe('report_sections')
    expect(handlers['api/narrative.js']).toBe('narrative')
  })

  it('the latest constraint definition covers every earlier one', () => {
    // Named by discovery, not by number. The first version of this assertion
    // read `toBe('037_...')` and `toHaveLength(7)`, which is precisely the
    // mistake the file header describes: it had to be hand-edited the moment
    // an eighth handler arrived, and until someone did, the failure it
    // reported was its own staleness rather than a missing migration.
    expect(constraint.file).toMatch(/^\d{3}_.*\.sql$/)
    expect(constraint.types.length).toBeGreaterThanOrEqual(7)
    expect(new Set(constraint.types).size).toBe(constraint.types.length)
    // The list only ever grows: dropping a type would refuse a ledger row for
    // a handler that is still deployed, which is the outage 037 records.
    for (const t of ['narrative', 'field_assistant', 'inline_ai', 'inline_complete', 'pre_review_semantic', 'photo_analysis', 'report_sections']) {
      expect(constraint.types, t).toContain(t)
    }
  })

  for (const [file, type] of Object.entries(handlers)) {
    it(`${file} writes '${type}', which the constraint allows`, () => {
      expect(constraint.types, `${file}: add '${type}' to the CHECK in a new migration`).toContain(type)
    })
  }

  it('the latest definition is guarded the same way 033 is, so a re-run is safe', () => {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, constraint.file), 'utf8')
    const code = sql.replace(/^\s*--.*$/gm, '')
    expect(code).toMatch(/IF to_regclass\('public\.narrative_generations'\) IS NULL THEN\s+RETURN;/)
    expect(code).toMatch(/DROP CONSTRAINT narrative_generations_type_check/)
  })

  it('no two migrations claim the same number', () => {
    const nums = readdirSync(MIGRATIONS_DIR)
      .filter(f => /^\d{3}_.*\.sql$/.test(f))
      .map(f => f.slice(0, 3))
    expect(new Set(nums).size).toBe(nums.length)
  })
})
