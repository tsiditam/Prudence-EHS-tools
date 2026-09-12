/**
 * "Additional Criteria Considered" stays retired — and its bibliography
 * stays put.
 *
 * `src/engines/contextualStandards.js` held prose for a report section that
 * explained which published criteria were NOT the basis of a finding and why
 * ("EPA lowered PM2.5 to 9 — why 35?"). A CIH review cut that section from
 * the consultant report in 2026-08 as overbuilt, and the consultant report
 * itself was removed later that month. The module survived both, with its own
 * test suite passing, for a year: nothing imported it but that suite, so
 * nothing ever said it had stopped rendering. It was retired in 2026-09.
 *
 * Two failure modes this file guards, in opposite directions.
 *
 * **Coming back.** The section was removed on a review finding, not by
 * accident; re-deriving it is a product decision, not a cleanup.
 *
 * **Being over-retired.** The three manifest entries the module accompanied
 * — ASHRAE 241, the EPA PM2.5 annual NAAQS revision, the ACGIH TLVs — read
 * like residue of the same feature and are not. Each versions something
 * live, so an inventory that reads "named by nothing" would delete a
 * bibliography two live surfaces depend on. That is asserted here, beside
 * the retirement, because the two facts are only confusing apart.
 *
 * Same shape as `no-molhave.test.ts` and the deleted
 * `no-standards-register.test.ts`: a retirement in this codebase gets a
 * guard, not a comment.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { STANDARDS_MANIFEST } from '../../src/constants/standards.js'
import { allCriteria } from '../../src/constants/criteria.js'

const ROOT = join(__dirname, '..', '..')

describe('the retired "Additional Criteria Considered" module stays retired', () => {
  const DIRS = ['src', 'api', 'lib', 'server', 'components', 'pages']
  const EXT = /\.(js|jsx|ts|tsx|mjs)$/
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
  const files = DIRS.flatMap((d) => walk(join(ROOT, d)))

  it('sweeps a non-trivial tree (a walker that finds nothing reads as proof)', () => {
    expect(files.length).toBeGreaterThan(200)
  })

  it('src/engines/contextualStandards.js does not exist', () => {
    expect(existsSync(join(ROOT, 'src/engines/contextualStandards.js'))).toBe(false)
  })

  it('nothing imports or exports its symbols', () => {
    const offenders: string[] = []
    for (const f of files) {
      if (/\b(CONTEXTUAL_STANDARDS|getContextualStandards)\b/.test(readFileSync(f, 'utf8'))) {
        offenders.push(relative(ROOT, f))
      }
    }
    expect(offenders, 'the retired criteria-selection notes are back').toEqual([])
  })
})

describe('its bibliography is NOT residue — each entry versions something live', () => {
  it('keeps the three bibliographic manifest entries', () => {
    // Deleting these is the over-retirement this file exists to stop.
    expect(STANDARDS_MANIFEST['ASHRAE 241']).toBeDefined()
    expect(STANDARDS_MANIFEST['ACGIH TLVs and BEIs']).toBeDefined()
    expect(STANDARDS_MANIFEST['EPA PM2.5 Annual NAAQS Revision']).toBeDefined()
  })

  it('ASHRAE 241 and ACGIH version corpus documents Jasper can return', () => {
    const corpus = readFileSync(join(ROOT, 'src/constants/standards-corpus.js'), 'utf8')
    // `standards-reconciliation.test.ts` maps these document codes to the
    // manifest keys above and fails if a mapped key is missing.
    expect(corpus).toMatch(/document:\s*'ASHRAE-241'/)
    expect(corpus).toMatch(/document:\s*'ACGIH-TLV'/)
  })

  it('the annual-NAAQS entry versions a live opt-in reference line', () => {
    // Never auto-applied — a single visit cannot establish an annual mean —
    // but selectable as a Logger Studio chart line, which prints the figure.
    expect(allCriteria().map((c: { id: string }) => c.id)).toContain('pm25_epa_annual')
    expect(readFileSync(join(ROOT, 'src/utils/referenceProfiles.js'), 'utf8'))
      .toMatch(/criterionId:\s*'pm25_epa_annual'/)
  })
})

describe('what the retired module asserted about the registry, which outlived it', () => {
  // The module's drift guard carried two claims about criteria.js that are
  // still true and still worth failing on: AtmosFlow applies neither of these
  // as the basis of a finding. They were the only assertions in that suite
  // about surviving code, so they move here rather than go with it.
  const sources = allCriteria().map((c: { source: string }) => c.source).join(' | ')

  it('no criterion is evaluated against ASHRAE 241', () => {
    expect(sources).not.toMatch(/ASHRAE\s+(?:Standard\s+)?241/i)
  })

  it('no criterion is evaluated against an ACGIH TLV', () => {
    expect(sources).not.toMatch(/ACGIH|Threshold Limit Value/i)
  })
})
