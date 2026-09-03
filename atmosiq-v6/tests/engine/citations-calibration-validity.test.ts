/**
 * Calibration validity is 365 days — one constant, stated once, everywhere.
 *
 * `CAL_VALIDITY_DAYS` (src/utils/instrumentRegistry.js, mirrored in
 * lib/calibration/banner-state.ts) is what the platform enforces. The
 * standards corpus and Jasper's knowledge base said 270, twice and once
 * (AUDIT-2026-09, Medium), and the corpus also claimed instruments past the
 * window "cannot generate signed deliverables" — export is not gated at all;
 * finalization is interrupted and the assessor proceeds with a written
 * justification that the report prints (CLAUDE.md, "Preserve calibration
 * gating").
 *
 * The corpus is a pure data module consumed by the serverless field-assistant
 * path and instrumentRegistry reads localStorage, so the figure is stated as a
 * literal there and pinned to the constant here rather than imported.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CAL_VALIDITY_DAYS } from '../../src/utils/instrumentRegistry'
import { STANDARDS_CORPUS } from '../../src/constants/standards-corpus'
import { lookupSamplingMethod } from '../../src/constants/iaq-knowledge-base'

const root = join(__dirname, '../..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('calibration validity text agrees with the enforced constant', () => {
  it('the constant is 365', () => {
    expect(CAL_VALIDITY_DAYS).toBe(365)
  })

  it('the corpus states the constant, describes the interrupt honestly, and promises no hard block', () => {
    const e = (STANDARDS_CORPUS as any[]).find((x) => x.id === 'instrument-calibration')
    expect(e.text).toContain(`${CAL_VALIDITY_DAYS} days`)
    expect(e.text).not.toMatch(/cannot generate|signed deliverables|calibration gate/i)
    expect(e.text).toMatch(/written justification/)
    expect(e.text).toMatch(/records the exception/)
    expect(e.text).toMatch(/not a hard block/)
    expect(e.text).toMatch(/export is not gated/i)
    const co2 = (STANDARDS_CORPUS as any[]).find((x) => x.id === 'ashrae-621-co2-dcv')
    expect(co2.text).toContain(`${CAL_VALIDITY_DAYS} days`)
  })

  it("Jasper's CO sampling note states the constant", () => {
    const direct = lookupSamplingMethod('carbon monoxide').find((m: any) => /Direct-read/.test(m.method))
    expect(direct.notes).toContain(`${CAL_VALIDITY_DAYS} days`)
  })

  it('no source file puts 270 next to "calibration"', () => {
    for (const rel of ['src/constants/standards-corpus.js', 'src/constants/iaq-knowledge-base.js', 'src/constants/field-assistant-corpus.js', 'src/constants/field-assistant-prompt.js']) {
      const offenders = read(rel)
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /\b270\b/.test(line) && /calibrat/i.test(line))
      expect(offenders.map((o) => `${rel}:${o.n}`)).toEqual([])
    }
  })
})
