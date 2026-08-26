/**
 * A condensate drain pan is a hygiene finding. It is not an ASHRAE 188 trigger.
 *
 * The finding fired on ONE intake field — `dp`, the four-option "Condensate
 * drain pan?" picker — and appended "Evaluate for Legionella risk per ASHRAE
 * Standard 188 if building lacks a Water Management Program", citing
 * `std: 'ASHRAE 188'`. Nothing else was consulted: no water system, no
 * aerosol-generating equipment, no water temperature, no occupant symptom, no
 * building type. Answering a dropdown produced a Legionella escalation.
 *
 * ASHRAE 188 scopes itself to building water systems with a recognised aerosol
 * transmission risk — cooling towers, evaporative condensers, domestic hot
 * water, decorative fountains, misters. A low-temperature condensate pan is
 * not one of those, and a visual observation of one does not establish an
 * exposure pathway.
 *
 * ── Why nothing caught this for four months ───────────────────────────────
 * It HAD been caught, one layer over. `phrases/hvac.ts` retired the
 * escalation deliberately and wrote down why: "a soiled condensate pan does
 * not by itself establish a recognized Legionella exposure pathway...
 * Legionella evaluation belongs only where system characteristics actually
 * warrant it." Its replacement recommendation is clean the pan, fix the slope.
 *
 * But that phrase entry only governs `renderClientReport` / PrintReport. The
 * AtmosFlow DOCX — the ONLY client deliverable since 2026-08 — takes
 * `text: r.t` straight off the engine finding (`reportModel.collectFindings`).
 * So the sentence one layer had retired was the sentence still reaching
 * clients, and the layer that fixed it had no way to know.
 *
 * That is the same shape as the 67–82 °F comfort band: two layers, two
 * answers, and the one nobody audited is the one that shipped. Hence the two
 * halves of this file — the engine assertions, and a cross-layer assertion on
 * what `collectFindings` actually hands the deliverable.
 *
 * ASHRAE 188 was also absent from STANDARDS_MANIFEST, `criteria.js` and
 * `standards-corpus.js` alike, so the double-entry reconciliation landed in
 * 2026-08 could not see it at all.
 *
 * ── The recommendation, removed second ────────────────────────────────────
 * `genRecs` kept emitting the `legionella_188` RECOMMENDATION for one commit
 * after the finding lost its escalation — fired by any finding whose text
 * contained "Drain pan", nothing more:
 *
 *     "Evaluate drain pan for Legionella risk per ASHRAE Standard 188. If
 *      building lacks a Water Management Program, consider Legionella
 *      sampling given active occupant respiratory symptoms."
 *
 * That closing clause is the worse half. It ASSERTS active respiratory
 * symptoms as established fact, inside an `if (hasDrainPan)` block with
 * nothing anywhere checking that a single symptom had been recorded. A
 * recommendation may not state a fact the assessment did not observe. Both
 * halves are now asserted here.
 *
 * `drainpan_immediate` and `drainpan_clean` still fire, so the condition is
 * left with two actions rather than none — which is the property the last
 * describe block pins, because a guard that only checks for absence would be
 * equally happy with a drain-pan condition that recommended nothing at all.
 */
import { describe, it, expect } from 'vitest'
import { scoreZone, genRecs } from '../../src/engines/scoring'
import { collectFindings } from '../../src/report/reportModel'
import { classifyCondition } from '../../src/engine/bridge/classify'

const BLDG = { hm: 'Within 6 months', assessmentDate: '2026-07-15' }

const zoneScoreFor = (dp: string) =>
  scoreZone({ zn: 'Z', su: 'office', dp } as never, BLDG as never) as never as any

const hvacCat = (dp: string) =>
  zoneScoreFor(dp).cats.find((c: any) => c.l === 'HVAC')

const drainPanFinding = (dp: string) =>
  hvacCat(dp).r.find((r: any) => r.t.includes('Drain pan'))

/** Both intake values that trip the condition. */
const TRIPPING = ['Standing water', 'Bio growth observed']

describe('the drain-pan finding states a condition, not an escalation', () => {
  it.each(TRIPPING)('%s names neither Legionella nor ASHRAE 188', (dp) => {
    const f = drainPanFinding(dp)
    expect(f, `${dp} produced no drain-pan finding`).toBeTruthy()
    expect(f.t).not.toMatch(/legionella/i)
    expect(f.t).not.toMatch(/\b188\b/)
    expect(f.t).not.toMatch(/water management program/i)
  })

  it.each(TRIPPING)('%s cites no standard at all', (dp) => {
    // Not a placeholder for a citation yet to be found. The corpus documents
    // no drain-pan threshold, so there is nothing to cite, and 43 of the 57
    // findings this engine emits already carry no `std` — including both of
    // this one's neighbours (no filtration, no supply airflow). A finding
    // with no citation is honest; an invented one is not.
    expect(drainPanFinding(dp).std ?? null).toBeNull()
  })

  it.each(TRIPPING)('%s still describes the condition it observed', (dp) => {
    // The removal must not hollow out the finding. It has to keep saying what
    // was seen and why it matters, or the escalation was load-bearing prose.
    const t = drainPanFinding(dp).t
    expect(t).toContain('Drain pan')
    expect(t).toContain(dp.toLowerCase())
    expect(t).toMatch(/microbial reservoir/i)
  })
})

describe('the condition survives at full weight', () => {
  it.each(TRIPPING)('%s remains critical and trips gate5', (dp) => {
    // The observation is real and unchanged. Only the ASHRAE 188 escalation
    // went; nothing about how seriously the condition is treated moved with
    // it. `gate5` is the structural flag `sections-core.js` reads.
    expect(drainPanFinding(dp).sev).toBe('critical')
    expect(hvacCat(dp).gate5).toBe(true)
    expect(hvacCat(dp).r.some((r: any) => r.t.includes('Critical HVAC Condition Identified')))
      .toBe(true)
  })

  it('a clean pan still produces nothing', () => {
    // The negative control. A guard that only checks the finding's WORDING
    // would still pass if the branch had been deleted outright.
    expect(drainPanFinding('Clean — draining')).toBeUndefined()
    expect(hvacCat('Clean — draining').gate5).toBe(false)
  })
})

describe('dropping the citation did not change how the finding classifies', () => {
  // CLAUDE.md rule 2: `classify` routes on severity and structured fields,
  // never on finding prose. Rewording a finding — or removing its citation —
  // must not move it to a different condition type. This is the assertion
  // that proves the rule held through this edit rather than assuming it.
  it.each(TRIPPING)('%s still routes to hvac_drain_pan_microbial_reservoir', (dp) => {
    const f = drainPanFinding(dp)
    expect(classifyCondition(f as never, 'HVAC', { dp } as never))
      .toBe('hvac_drain_pan_microbial_reservoir')
  })
})

describe('the deliverable gets the corrected sentence', () => {
  // The layer that actually reaches a client. `sections-atmosflow.js` renders
  // what `collectFindings` returns, and `collectFindings` copies `r.t`
  // verbatim — which is precisely how the retired phrase-library wording was
  // bypassed for four months. Asserting the engine alone would not have
  // caught it, so assert here too.
  it.each(TRIPPING)('%s carries no Legionella text into the report model', (dp) => {
    const rows = collectFindings([zoneScoreFor(dp)] as never) as Array<{ text: string; std: string | null }>
    const row = rows.find((r) => r.text.includes('Drain pan'))
    expect(row, `${dp} did not reach the report model`).toBeTruthy()
    expect(row!.text).not.toMatch(/legionella/i)
    expect(row!.std).toBeNull()
  })
})

/** Every recommendation `genRecs` produces, flattened to plain text. */
const recTextsFor = (dp: string) => {
  const recs = genRecs([zoneScoreFor(dp)] as never, BLDG as never) as Record<string, unknown[]>
  return Object.values(recs)
    .filter(Array.isArray)
    .flat()
    .map((a: any) => (typeof a === 'string' ? a : a?.text || ''))
}

describe('the recommendations do not escalate either', () => {
  it.each(TRIPPING)('%s recommends nothing about Legionella or ASHRAE 188', (dp) => {
    for (const text of recTextsFor(dp)) {
      expect(text, dp).not.toMatch(/legionella/i)
      expect(text, dp).not.toMatch(/\b188\b/)
      expect(text, dp).not.toMatch(/water management program/i)
    }
  })

  it.each(TRIPPING)('%s asserts no symptom the assessment never recorded', (dp) => {
    // The specific defect, stated as its own property because it is the more
    // dangerous half and would survive a fix that only deleted the standard
    // name. The zone here has NO symptom fields at all; nothing the engine
    // emits may claim otherwise.
    for (const text of recTextsFor(dp)) {
      expect(text, dp).not.toMatch(/active occupant respiratory symptoms/i)
    }
  })

  it.each(TRIPPING)('%s still recommends cleaning the pan', (dp) => {
    // The counterweight. Removing an over-reaching recommendation must not
    // leave a critical condition with no action attached — that would be a
    // worse defect than the one being fixed, and an absence-only guard would
    // not notice.
    const texts = recTextsFor(dp)
    expect(texts.some((t) => /drain pan/i.test(t)), `${dp} lost every drain-pan action`).toBe(true)
    expect(texts.some((t) => /clean drain pan/i.test(t))).toBe(true)
    expect(texts.some((t) => /immediately/i.test(t))).toBe(true)
  })
})

describe('nothing the engine emits cites ASHRAE 188', () => {
  it('across every drain-pan intake value, in findings and recommendations alike', () => {
    // The sweep. If this fails, a citation with no manifest entry, no
    // criterion and no corpus prose behind it has come back somewhere.
    for (const dp of [...TRIPPING, 'Clean — draining', 'Not accessible']) {
      for (const f of zoneScoreFor(dp).cats.flatMap((c: any) => c.r || [])) {
        expect(String(f.std ?? ''), `${dp}: ${f.t}`).not.toMatch(/188/)
        expect(String(f.t), dp).not.toMatch(/legionella/i)
      }
      for (const text of recTextsFor(dp)) {
        expect(text, dp).not.toMatch(/legionella/i)
        expect(text, dp).not.toMatch(/\b188\b/)
      }
    }
  })
})
