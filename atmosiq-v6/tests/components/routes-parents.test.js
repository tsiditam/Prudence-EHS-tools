/**
 * Route hierarchy guard — the `parent` / `short` fields in
 * src/constants/routes.js are what the navigation stack falls back to
 * (useNavStack.backTarget) and what the header back pill prints, so:
 *   1. every parent is a registered route,
 *   2. following parents always reaches a top-level home (no cycles,
 *      no route that is its own parent),
 *   3. every route has a short name for the pill,
 *   4. the dock's top-level destinations are roots or one hop from one.
 */
import { describe, it, expect } from 'vitest'
import { ROUTES } from '../../src/constants/routes.js'

const ids = Object.keys(ROUTES)

describe('route parents', () => {
  it('every declared parent is a registered route', () => {
    const bad = ids.filter((id) => ROUTES[id].parent !== null && !ROUTES[ROUTES[id].parent])
    expect(bad, `parent points at an unregistered route: ${bad.join(', ')}`).toEqual([])
  })

  it('following parents always terminates at a root (acyclic)', () => {
    for (const id of ids) {
      const seen = new Set()
      let cur = id
      while (cur !== null) {
        expect(seen.has(cur), `cycle through ${cur} starting at ${id}`).toBe(false)
        seen.add(cur)
        cur = ROUTES[cur].parent
        expect(seen.size).toBeLessThanOrEqual(ids.length)
      }
    }
  })

  it('the two homes are roots', () => {
    expect(ROUTES.projects.parent).toBeNull()
    expect(ROUTES.dash.parent).toBeNull()
  })

  it('every route has a short name for the back pill', () => {
    const missing = ids.filter((id) => typeof ROUTES[id].short !== 'string' || !ROUTES[id].short.trim())
    expect(missing, `routes without a short name: ${missing.join(', ')}`).toEqual([])
  })

  it('tools sit under the Tools hub; the hub sits under Projects', () => {
    for (const t of ['sensor-data', 'sampling-forms', 'ventilation', 'incident-log', 'search']) {
      expect(ROUTES[t].parent, t).toBe('tools')
    }
    expect(ROUTES.tools.parent).toBe('projects')
    expect(ROUTES.tools.reachedBy).toContain('bottom-nav')
  })
})
