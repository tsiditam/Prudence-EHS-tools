/**
 * Route registry guard — keeps src/constants/routes.js in sync with the
 * actual `view==='x'` render branches in MobileApp, and prevents orphaned
 * views (rendered but unreachable) from recurring.
 *
 * Cross-checks the registry against the MobileApp source so a drift fails
 * CI instead of silently shipping:
 *   1. every rendered view is registered,
 *   2. every registered route actually renders (no stale entries),
 *   3. every route declares at least one valid entry point.
 *
 * This is the automated backstop for the org-audit finding that removed
 * three orphaned screens (IHDirectory / InterventionTracker /
 * InstrumentManager) — see src/constants/routes.js.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ROUTES, ENTRY_POINTS } from '../../src/constants/routes.js'

const mobileAppSrc = readFileSync(
  fileURLToPath(new URL('../../src/components/MobileApp.jsx', import.meta.url)),
  'utf8',
)

// Collect every view id compared with `view === 'x'` / `view == 'x'`.
// \bview avoids matching subView/viewRpt; `!==` is excluded because the
// `!` breaks the `view\s*==` match.
function renderedViews(src) {
  const set = new Set()
  const re = /\bview\s*===?\s*'([^']+)'/g
  let m
  while ((m = re.exec(src))) set.add(m[1])
  return set
}

describe('route registry ↔ MobileApp', () => {
  const rendered = renderedViews(mobileAppSrc)
  const registered = new Set(Object.keys(ROUTES))

  it('finds a non-trivial set of rendered views (regex sanity)', () => {
    expect(rendered.size).toBeGreaterThan(10)
  })

  it('every rendered view is registered in routes.js', () => {
    const unregistered = [...rendered].filter(v => !registered.has(v)).sort()
    expect(unregistered, `Unregistered view branch(es) — add to src/constants/routes.js: ${unregistered.join(', ')}`).toEqual([])
  })

  it('every registered route has a render branch (no stale entries)', () => {
    const stale = [...registered].filter(v => !rendered.has(v)).sort()
    expect(stale, `routes.js entries with no MobileApp render branch: ${stale.join(', ')}`).toEqual([])
  })

  it('every route declares at least one entry point (no orphans)', () => {
    const orphans = Object.entries(ROUTES)
      .filter(([, r]) => !Array.isArray(r.reachedBy) || r.reachedBy.length === 0)
      .map(([id]) => id)
    expect(orphans, `Orphaned route(s) — registered but unreachable: ${orphans.join(', ')}`).toEqual([])
  })

  it('all reachedBy values are known entry-point kinds', () => {
    const bad = []
    for (const [id, r] of Object.entries(ROUTES)) {
      for (const k of r.reachedBy || []) {
        if (!ENTRY_POINTS.includes(k)) bad.push(`${id}:${k}`)
      }
    }
    expect(bad, `Unknown reachedBy kind(s): ${bad.join(', ')}`).toEqual([])
  })
})
