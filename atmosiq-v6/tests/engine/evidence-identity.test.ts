// @vitest-environment node
/**
 * Stable identity for findings and recommendations.
 *
 * ── What this replaces ─────────────────────────────────────────────────
 * `find-<zone-slug>-<i>` where `i` indexed ALL rows across ALL zones, so the
 * zone prefix implied a per-zone scoping it never had — adding a finding in
 * the first zone re-pointed ids in every other zone. And `rec-<i>-<slug>`,
 * positional in the same way.
 *
 * Harmless while nothing referred to them. Actively dangerous the moment
 * anything does: a reference to `find-zone-3` after an unrelated edit
 * resolves SUCCESSFULLY, to the wrong finding. A silent wrong answer is
 * worse than a failed lookup, which is why this landed before the authoring
 * plan that will use it rather than after.
 *
 * ── The uncomfortable cases ────────────────────────────────────────────
 * The easy assertion is "ids are stable". The ones that matter are the
 * cases where a naive scheme looks stable and is not, and the case where
 * identity must NOT be preserved. Both directions are below.
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore js
import { buildEvidencePackage, packageForWriter } from '../../src/report/evidencePackage.js'
// @ts-ignore js
import {
  findingIdentity, recommendationIdentity, assignStableIds, zoneIdentity,
  canonicalText, stableStringify, IDENTITY_VERSION, IDENTITY_ALGORITHM,
// @ts-ignore js
} from '../../src/report/evidenceIdentity.js'
// @ts-ignore js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-ignore js
import { scoreZone } from '../../src/engines/scoring.js'
// @ts-ignore js
import { genRecs } from '../../src/engines/scoring-legacy.js'
// @ts-ignore js
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-ignore js
import { DEMO_FINDINGS_BUILDING as BLDG, DEMO_FINDINGS_ZONES as ZONES, DEMO_FINDINGS_PRESURVEY as PRESURVEY } from '../../src/constants/demoDataFindings'

const AT = { assessmentDate: '2026-06-10' }

/** A real package, with a real recommendation register. */
function build(zones: any[] = ZONES) {
  const zoneScores = zones.map((z: any) => scoreZone(z, { ...BLDG, ...AT }))
  const recs = genRecs(zoneScores, BLDG)
  const causalChains = buildCausalChains(zones, BLDG, zoneScores)
  const model = assembleRenderModel({
    building: BLDG, presurvey: PRESURVEY, zones, zoneScores, causalChains, recs,
    profile: { name: 'John Smith', certs: ['CIH'], firm: 'PSEC' },
    id: 'AIQ-DEMO', ts: '2026-06-10',
  }, { now: new Date('2026-06-11T12:00:00Z') })
  return { model, pkg: buildEvidencePackage(model, { zoneScores, causalChains }) }
}

const idsByZone = (pkg: any) => {
  const out: Record<string, string[]> = {}
  for (const f of pkg.findings) (out[f.zone] = out[f.zone] || []).push(f.id)
  return out
}

describe('the contract is explicit, so a later tidy-up cannot redefine it silently', () => {
  it('names its version and its hash', () => {
    expect(IDENTITY_VERSION).toBe(1)
    expect(IDENTITY_ALGORITHM).toBe('fnv1a-32')
  })

  it('hashes a structured tuple, not a joined string', () => {
    // The delimiter trap: under any separator that can occur in the data,
    // {a: 'x', b: 'y|z'} and {a: 'x|y', b: 'z'} join to the same string.
    // Serializing the structure first makes them distinct by construction.
    expect(stableStringify({ a: 'x', b: 'y|z' })).not.toBe(stableStringify({ a: 'x|y', b: 'z' }))
    expect(findingIdentity({ zone: 'A', parameter: 'B|C', text: 't' }))
      .not.toBe(findingIdentity({ zone: 'A|B', parameter: 'C', text: 't' }))
  })

  it('serializes the same content identically whatever order the keys arrive in', () => {
    expect(stableStringify({ a: 1, b: { c: 2, d: 3 } })).toBe(stableStringify({ b: { d: 3, c: 2 }, a: 1 }))
  })
})

describe('what identity is made of', () => {
  const base = { zone: 'Zone 1', parameter: 'pm25', criterion_id: 'crit-a', basis: 'Measured', text: 'PM2.5 exceeded the criterion.' }

  it('changes when the finding genuinely changes', () => {
    // The direction that is easy to forget: identity must NOT be so stable
    // that a different finding keeps the old id.
    const different = findingIdentity({ ...base, text: 'PM2.5 was within the criterion.' })
    expect(different).not.toBe(findingIdentity(base))
  })

  it('distinguishes two criteria behind the same sentence', () => {
    // "PM2.5 exceeded criterion A" and "…criterion B" are not the same
    // finding merely because the reader-facing sentence happens to match.
    expect(findingIdentity({ ...base, criterion_id: 'crit-b' })).not.toBe(findingIdentity(base))
  })

  it('distinguishes the same sentence in two zones', () => {
    expect(findingIdentity({ ...base, zone: 'Zone 2' })).not.toBe(findingIdentity(base))
  })

  it('distinguishes the same sentence on a different evidence basis', () => {
    expect(findingIdentity({ ...base, basis: 'Observed' })).not.toBe(findingIdentity(base))
  })

  it('ignores severity, because severity can change while the finding does not', () => {
    expect(findingIdentity({ ...base, severity: 'high' })).toBe(findingIdentity({ ...base, severity: 'medium' }))
  })

  it('ignores generation metadata entirely', () => {
    const noisy = {
      ...base,
      generated_at: '2027-01-01T00:00:00Z', provider: 'anthropic', model: 'some-model',
      report_fingerprint: 'deadbeef', index: 41, display_order: 7,
    }
    expect(findingIdentity(noisy)).toBe(findingIdentity(base))
  })

  it('ignores cosmetic reformatting of the text but not its content', () => {
    expect(findingIdentity({ ...base, text: '  PM2.5   exceeded\nthe criterion. ' })).toBe(findingIdentity(base))
    expect(canonicalText(' a  b \n c ')).toBe('a b c')
  })

  it('prefers a real zone id when one exists, and says so when one does not', () => {
    // `scoreZone` drops `zid` today, so the normalized name is the live path.
    // The order is asserted anyway so wiring `zid` through later is a no-op
    // at this end.
    expect(zoneIdentity({ zone_id: 'z-7', zone: 'Fourth Floor' })).toBe('z-7')
    expect(zoneIdentity({ zone: '  Fourth   Floor ' })).toBe('fourth floor')
    const { pkg } = build()
    expect(pkg.findings.every((f: any) => !f.zone_id && !f.zid)).toBe(true)
  })
})

describe('recommendation identity is the action and where it applies', () => {
  const base = { action: 'Clean the condensate pan', location: 'AHU-4', priority: 'Immediate', timeframe: '0–7 days', control: 'Engineering', owner: 'Facilities', evidence: 'Observed condition' }

  it('ignores the register bucket — same action, more urgent, same recommendation', () => {
    expect(recommendationIdentity({ ...base, priority: 'Ongoing', timeframe: 'Continuous' })).toBe(recommendationIdentity(base))
  })

  it('ignores control, owner and evidence, which all derive from one tier field', () => {
    expect(recommendationIdentity({ ...base, control: 'Administrative', owner: 'EHS', evidence: 'x' })).toBe(recommendationIdentity(base))
  })

  it('separates the same action in two places', () => {
    expect(recommendationIdentity({ ...base, location: 'AHU-2' })).not.toBe(recommendationIdentity(base))
  })

  it('separates two actions in the same place', () => {
    expect(recommendationIdentity({ ...base, action: 'Replace the filter' })).not.toBe(recommendationIdentity(base))
  })
})

describe('position cannot reach an id', () => {
  it('adding an unrelated finding in one zone leaves every other zone untouched', () => {
    // The exact defect the old scheme had: the index ran across all zones, so
    // this shifted ids in zones the edit never touched.
    const { pkg: before } = build()
    const nudged = ZONES.map((z: any, i: number) =>
      (i === 0 ? { ...z, co: '12' } : z))
    const { pkg: after } = build(nudged)

    const a = idsByZone(before)
    const b = idsByZone(after)
    const firstZone = ZONES[0].zn
    const otherZones = Object.keys(a).filter((z) => z !== firstZone)
    expect(otherZones.length).toBeGreaterThan(0)
    for (const zone of otherZones) {
      expect(b[zone], zone).toEqual(a[zone])
    }
  })

  it('reordering findings does not change any id', () => {
    const { pkg } = build()
    const rows = pkg.findings
    const forward = assignStableIds(rows, findingIdentity).map((r: any) => r.id).sort()
    const backward = assignStableIds([...rows].reverse(), findingIdentity).map((r: any) => r.id).sort()
    expect(backward).toEqual(forward)
  })

  it('reordering zones does not change any id', () => {
    const { pkg: forward } = build(ZONES)
    const { pkg: backward } = build([...ZONES].reverse())
    expect(backward.findings.map((f: any) => f.id).sort()).toEqual(forward.findings.map((f: any) => f.id).sort())
  })

  it('adding a recommendation does not change the other recommendation ids', () => {
    const { pkg } = build()
    const reg = pkg.recommendation_options
    expect(reg.length).toBeGreaterThan(1)
    const extra = { action: 'A brand new action nobody proposed before', location: 'Building-wide' }
    const withExtra = assignStableIds([extra, ...reg], recommendationIdentity)
    // Inserted at the FRONT, which under the old positional scheme shifted
    // every id after it.
    //
    // Keyed by action AND location: the demo register really does propose
    // the same action at two different locations, and a map keyed on action
    // alone silently compares the first row against the second row's id.
    const key = (r: any) => `${r.action}@@${r.location}`
    const byKey = new Map(withExtra.map((r: any) => [key(r), r.id]))
    for (const r of reg) expect(byKey.get(key(r)), key(r)).toBe(r.id)
  })

  it('no id in a real package carries an index', () => {
    const { pkg } = build()
    for (const f of pkg.findings) expect(f.id, f.id).toMatch(/^find-[0-9a-f]{8}$/)
    for (const r of pkg.recommendation_options) expect(r.id, r.id).toMatch(/^rec-[0-9a-f]{8}$/)
  })

  it('ids are unique across a real assessment', () => {
    const { pkg } = build()
    for (const list of [pkg.findings, pkg.recommendation_options]) {
      const ids = list.map((x: any) => x.id)
      expect(new Set(ids).size, JSON.stringify(ids)).toBe(ids.length)
    }
  })

  it('a genuine duplicate gets a suffix, and which one gets it does not depend on order', () => {
    // Two entries can only collide by being identical in every identity
    // field, so swapping them is not an observable change — the suffix is
    // order-independent for exactly that reason.
    const dup = { action: 'Same action', location: 'Same place' }
    const forward = assignStableIds([dup, { ...dup }], recommendationIdentity).map((r: any) => r.id)
    const backward = assignStableIds([{ ...dup }, dup], recommendationIdentity).map((r: any) => r.id)
    expect(forward).toEqual(backward)
    expect(new Set(forward).size).toBe(2)
  })
})

describe('the writer can name a finding', () => {
  it('finding ids reach the wire, and every one resolves back to the package', () => {
    const { pkg } = build()
    const wire = packageForWriter(pkg)
    const known = new Set(pkg.findings.map((f: any) => f.id))
    expect(wire.findings.length).toBe(pkg.findings.length)
    for (const f of wire.findings) {
      expect(f.id, JSON.stringify(f)).toBeTruthy()
      expect(known.has(f.id), f.id).toBe(true)
    }
  })

  it('recommendation ids reach the wire too', () => {
    const { pkg } = build()
    const wire = packageForWriter(pkg)
    expect(wire.recommendation_options.map((r: any) => r.id)).toEqual(pkg.recommendation_options.map((r: any) => r.id))
  })

  it('the same assessment built twice produces the same ids', () => {
    expect(build().pkg.findings.map((f: any) => f.id)).toEqual(build().pkg.findings.map((f: any) => f.id))
  })
})
