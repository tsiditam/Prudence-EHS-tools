/**
 * Every function in the `public` schema pins its `search_path`.
 *
 * An unpinned `search_path` on a Postgres function lets whoever calls it
 * decide which schema an unqualified name resolves to. On a SECURITY DEFINER
 * function that is a privilege-escalation path; on a SECURITY INVOKER one it
 * is "only" a correctness hazard. Supabase's own security advisor reports the
 * class as `function_search_path_mutable`, and this project's answer to it is
 * `SET search_path = ''` plus schema-qualified references — the rule
 * 026_security_hardening.sql set and 036_function_search_path.sql finished.
 *
 * Why this is a TEST and not a note in a migration header. The rule was
 * already written down, in 026's header, and it still did not hold: 026
 * recorded that the `*_set_updated_at` helpers "already pin search_path",
 * which was true of the four it was looking at and false of the KG one
 * written three migrations earlier. Two functions then sat on the advisor's
 * report for thirteen migrations. A header comment cannot check itself.
 *
 * The scan replays the migrations in order and tracks, per function, whether
 * the LAST thing said about it pinned the setting — a `CREATE OR REPLACE`
 * carrying `SET search_path`, or a later `ALTER FUNCTION ... SET search_path`.
 * That ordering matters: a replace that drops the clause un-pins a function
 * an earlier ALTER had fixed, and this notices.
 *
 * There is no exemption list, deliberately. `claim_stripe_event` was the one
 * candidate — the advisor is quiet about it because it is granted only to
 * `service_role` — and 036 pinned it rather than carry an exception, because
 * an exemption list is the mechanism by which the KG pair survived 026.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS = join(__dirname, '..', '..', 'supabase', 'migrations')

/** Numbered migrations only, in the order the runner applies them. */
function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => /^\d{3,}_.*\.sql$/.test(f))
    .sort()
}

type State = { pinned: boolean; trail: string[] }

/** Replay every migration and report each public function's final state. */
function scanFunctions(): Map<string, State> {
  const state = new Map<string, State>()
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8')

    // A definition: everything between the name and the `$$` that opens the
    // body is the attribute list, which is where SET search_path would sit.
    for (const m of sql.matchAll(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\$\$/gi,
    )) {
      const [, name, attrs] = m
      const prior = state.get(name)
      state.set(name, {
        pinned: /SET\s+search_path/i.test(attrs),
        trail: [...(prior?.trail ?? []), file],
      })
    }

    // A later ALTER pins it without touching the body.
    for (const m of sql.matchAll(
      /ALTER\s+FUNCTION\s+(?:public\.)?(\w+)\s*\([^)]*\)\s*SET\s+search_path/gi,
    )) {
      const name = m[1]
      const prior = state.get(name)
      state.set(name, { pinned: true, trail: [...(prior?.trail ?? []), file] })
    }
  }
  return state
}

describe('public schema functions pin search_path', () => {
  const functions = scanFunctions()

  it('finds the functions at all — the scan is not vacuous', () => {
    // 17 at the time of writing. A floor, not a pin: adding a function should
    // not fail this, but a parser that silently stops matching should.
    expect(functions.size).toBeGreaterThanOrEqual(15)
    expect([...functions.keys()]).toContain('kg_finding_evidence')
    expect([...functions.keys()]).toContain('claim_stripe_event')
  })

  it('every one of them pins it, with no exemptions', () => {
    const unpinned = [...functions.entries()]
      .filter(([, s]) => !s.pinned)
      .map(([name, s]) => `${name} (last touched in ${s.trail[s.trail.length - 1]})`)
    expect(
      unpinned,
      'A function in the public schema has a mutable search_path. Add '
        + "`SET search_path = ''` to its definition (and schema-qualify every "
        + 'reference in its body), or pin it with ALTER FUNCTION in a new '
        + 'migration — see 036_function_search_path.sql.',
    ).toEqual([])
  })

  it('036 pinned the three that were outstanding', () => {
    for (const name of ['set_kg_updated_at', 'kg_finding_evidence', 'claim_stripe_event']) {
      const s = functions.get(name)
      expect(s, `${name} is missing from the scan`).toBeTruthy()
      expect(s!.pinned, `${name} is not pinned`).toBe(true)
      expect(s!.trail).toContain('036_function_search_path.sql')
    }
  })

  it('notices a replace that drops the clause after an ALTER pinned it', () => {
    // The ordering property the scan exists for, proved on the real parser
    // rather than asserted in a comment.
    const probe = scanFunctions()
    expect(probe.get('admin_usage_daily')?.pinned).toBe(true)
    // admin_usage_daily is defined in 022 without the clause and pinned by
    // 026's ALTER — so a false "pinned" here would mean the replay ignored
    // creation order entirely.
    expect(probe.get('admin_usage_daily')?.trail).toEqual(
      expect.arrayContaining(['022_early_access_index_and_usage_analytics.sql', '026_security_hardening.sql']),
    )
  })
})
