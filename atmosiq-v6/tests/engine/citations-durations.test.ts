/**
 * A NIOSH REL is a time-weighted average for up to a 10-hour workday
 * (NIOSH Pocket Guide to Chemical Hazards, "REL" definition). It is not an
 * 8-hour figure; the 8-hour TWA is OSHA's.
 *
 * AUDIT-2026-09 C6 found "8-hour" attached to NIOSH RELs in Jasper's
 * exposure-limits table (returned to the assessor verbatim) and in the CO
 * and formaldehyde parameter prose, while the criteria registry itself said
 * `hour10`. Two ledgers disagreeing about an averaging period is exactly the
 * defect the registry exists to prevent — a criterion travels with its
 * period or it is not a criterion.
 *
 * This is a class guard over the whole shipped tree, not a list of the three
 * places it was wrong: any file under src/ that puts "8-hour" or "8-hr"
 * beside a NIOSH REL fails.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { allCriteria } from '../../src/constants/criteria'
import { lookupExposureLimit } from '../../src/constants/iaq-knowledge-base'
import { CO_PROSE } from '../../src/engine/report/parameter-prose/gases-co'
import { HCHO_PROSE } from '../../src/engine/report/parameter-prose/gases-hcho'

const ROOT = join(__dirname, '../..')
const EXT = /\.(js|jsx|ts|tsx)$/
const SKIP = /node_modules|\.test\.|__snapshots__/

const walk = (dir: string): string[] => {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (SKIP.test(p)) continue
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (EXT.test(p)) out.push(p)
  }
  return out
}

const stripComments = (src: string) =>
  src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * A NIOSH REL, then an 8-hour duration within the same sentence-ish window;
 * or the duration, then "NIOSH REL" shortly after. The KB rows are
 * `niosh: { ... duration: '8-hour' ...}` on one line, so the object key is
 * matched as well as the prose forms.
 */
const NIOSH_REL = /\b(?:NIOSH (?:REL|Recommended Exposure Limit)|Recommended Exposure Limit|niosh:\s*\{)/i
const EIGHT = /\b8[- ]?(?:hour|hr)\b/i
const FORWARD = new RegExp(`${NIOSH_REL.source}[^\\n.;]{0,160}?${EIGHT.source}`, 'i')
const BACKWARD = new RegExp(`${EIGHT.source}[^\\n.;]{0,60}?\\b(?:NIOSH (?:REL|Recommended Exposure Limit))\\b`, 'i')

describe('no NIOSH REL is labelled 8-hour anywhere under src/', () => {
  const files = walk(join(ROOT, 'src'))

  it('sweeps a non-trivial tree', () => {
    expect(files.length).toBeGreaterThan(150)
  })

  it('attaches no 8-hour duration to a NIOSH REL', () => {
    const bad: string[] = []
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'))
      for (const line of code.split('\n')) {
        // A sentence that says what a REL is NOT is allowed to name the figure
        // it denies.
        if (/not (?:an )?8[- ]?(?:hour|hr)|are not 8[- ]?(?:hour|hr)/i.test(line)) continue
        if (FORWARD.test(line) || BACKWARD.test(line)) bad.push(`${relative(ROOT, f)}: ${line.trim().slice(0, 140)}`)
      }
    }
    expect(bad, '"8-hour" attached to a NIOSH REL').toEqual([])
  })
})

describe('the three surfaces the audit named agree with the registry', () => {
  const byId = new Map((allCriteria() as any[]).map((c) => [c.id, c]))

  it('the registry itself says hour10 for the NIOSH RELs', () => {
    expect(byId.get('co_niosh_rel').averaging).toBe('hour10')
    expect(byId.get('hcho_niosh_rel').averaging).toBe('hour10')
  })

  it("Jasper's exposure-limits table says 10-hour for every NIOSH TWA REL", () => {
    for (const analyte of ['carbon monoxide', 'formaldehyde', 'carbon dioxide', 'sulfur dioxide', 'benzene', 'toluene']) {
      const row = lookupExposureLimit(analyte)
      if (!row?.niosh || row.niosh.type !== 'TWA') continue
      expect(row.niosh.duration, analyte).toMatch(/^10-hour/)
    }
  })

  it('the CO and formaldehyde prose say 10-hour for the REL and 8-hour for the PEL', () => {
    for (const prose of [CO_PROSE, HCHO_PROSE]) {
      const rel = prose.applicableStandards.find((s) => /NIOSH (REL|Recommended)/.test(s.source))!
      expect(rel.source).toMatch(/10-hour/)
      expect(rel.source).not.toMatch(/8-h/)
      const pel = prose.applicableStandards.find((s) => /1910\.10/.test(s.source))!
      expect(pel.source).toMatch(/8-hr|8-hour/)
      expect(prose.standardsBackground).toMatch(/Recommended Exposure Limit is [\d.]+ parts per million as a Time Weighted Average for up to a 10-hour workday/)
    }
  })
})

describe('formaldehyde attributions (AUDIT C6)', () => {
  const hcho = lookupExposureLimit('formaldehyde')

  it('ACGIH is TLV-TWA 0.1 ppm / STEL 0.3 ppm, A1 — not the pre-2017 ceiling / A2', () => {
    expect(hcho.acgih).toMatchObject({ value: 0.1, type: 'TWA', duration: '8-hour' })
    expect(hcho.acgih.note).toMatch(/STEL 0\.3 ppm/)
    expect(hcho.acgih.note).toMatch(/\bA1\b/)
    expect(hcho.acgih.note).not.toMatch(/\bA2\b/)
    expect(hcho.acgih.citation).toMatch(/current edition/)
  })

  it('the 0.5 ppm action level is OSHA\'s (29 CFR 1910.1048(b)), not NIOSH\'s', () => {
    const al = hcho.other.find((o: any) => o.type === 'AL')
    expect(al).toBeTruthy()
    expect(al.agency).toMatch(/OSHA/)
    expect(al.agency).not.toMatch(/NIOSH/)
    expect(al.citation).toBe('29 CFR 1910.1048(b)')
  })
})
