/**
 * A finding states what was found. It does not say what to do about it.
 *
 * The app's Findings detail and the report's zone sections both list
 * findings, and both have a separate place for what to do — the actions
 * list and the Recommendations Register. Advice carried inside the finding
 * text printed twice and buried the result:
 *
 *   "TVOCs 560 µg/m³ — elevated. Consider TO-17 speciation if source
 *    investigation warranted. TVOC is a screening indicator only — no
 *    regulatory limit exists … TO-17 speciation (thermal desorption GC/MS)
 *    is the appropriate analytical method for compound identification.
 *    Mølhave (1991) tiers are advisory."
 *
 * `buildStatement` no longer appends the criterion's `action`. The action
 * still exists on the criterion and still drives recommendations.
 *
 * What a finding MAY still carry is the evidentiary caveat — "a
 * short-duration reading cannot establish compliance with this averaging
 * period". That is a property of the measurement, not advice: it changes how
 * the finding itself should be read.
 */
import { describe, it, expect } from 'vitest'
import { allCriteria, evaluateCriteria } from '../../src/constants/criteria.js'
import { scoreZone } from '../../src/engines/scoring.js'
import { buildCausalChains } from '../../src/engines/causalChains.js'

// Imperatives and method prescriptions. Deliberately not a blanket ban on
// the word "sampling": a finding may legitimately say a value cannot be
// established WITHOUT sampling, which is a limitation, not an instruction.
const ADVICE = [
  /\bconsider\b/i,
  // "recommended" as ADVICE, not as an adjective on the criterion itself.
  // "outside the 30–60% recommended range" names the band; it does not tell
  // the reader to do anything.
  /\brecommend(s|ed)\b(?!\s+(range|limit|exposure|level|value|band))/i,
  /\bis recommended\b/i,
  /\bshould be (collected|performed|deployed|conducted)\b/i,
  /\bidentify the\b/i,
  /\bcompare against\b/i,
  /\bevaluate\b/i,
  /\brequires? \d+-day\b/i,
  /\bdeployment\b/i,
  /\bcontractor\b/i,
  /\bPPE\b/,
  /\bTO-1[57]\b/,
  /\bNIOSH Method\b/i,
]

describe('criterion statements', () => {
  it('never carry the criterion action', () => {
    for (const c of allCriteria() as any[]) {
      // A band is missed from either side, so the probe that trips a limit
      // (well above it) has to become "well outside" for a band. Using
      // resolve() here would multiply an object.
      const probe = c.band ? c.band.max + 10 : c.midpoint * 1.5 + 1
      const hit: any = evaluateCriteria(c.parameter, probe, 'screening_grab')
      if (!hit) continue
      expect(hit.statement, `${hit.criterion.id} leaks its action`).not.toContain(hit.criterion.action)
      for (const re of ADVICE) {
        expect(hit.statement, `${hit.criterion.id} statement matches ${re}`).not.toMatch(re)
      }
    }
  })

  it('still state the value, the criterion and its averaging period', () => {
    const hit: any = evaluateCriteria('co', 60, 'screening_grab')
    expect(hit.statement).toMatch(/60 ppm/)
    expect(hit.statement).toMatch(/OSHA PEL of 50 ppm/)
    expect(hit.statement).toMatch(/8-hour time-weighted average/)
  })

  it('keep the evidentiary caveat, which is not advice', () => {
    const hit: any = evaluateCriteria('co', 60, 'screening_grab')
    expect(hit.statement).toMatch(/cannot establish compliance with this averaging period/)
  })

  it('every criterion still carries its action for the recommendations layer', () => {
    for (const c of allCriteria() as any[]) {
      expect(c.action, `${c.id} lost its action`).toBeTruthy()
    }
  })
})

describe('engine finding text', () => {
  // A zone that trips as many branches as possible.
  const ZONE = {
    zn: 'Z1', su: 'office', tf: '90', rh: '80', co2: '1600', co2o: '420',
    co: '60', pm: '60', pmo: '6', tv: '4000', hc: '1',
    mi: 'Moderate (10-30 sq ft)', wd: 'Active leak', oc: '10',
  }

  it('carries no recommendation in any finding', () => {
    const zs: any = scoreZone(ZONE, { assessmentDate: '2026-08-19' })
    const findings = zs.cats.flatMap((c: any) => c.r).filter((f: any) => f.sev !== 'pass' && f.sev !== 'info')
    expect(findings.length).toBeGreaterThan(3)
    for (const f of findings) {
      // Hydrogen is the one deliberate exception and is not in this fixture:
      // "Immediate evacuation and ventilation required" at 25% of the lower
      // explosive limit is a life-safety instruction, and demoting it to a
      // recommendation section the reader may not reach would be a safety
      // regression rather than a tidiness win. See the note in scoring.js.
      for (const re of ADVICE) {
        expect(String(f.t), `finding matches ${re}: ${String(f.t).slice(0, 90)}`).not.toMatch(re)
      }
    }
  })

  it('still names the standard and the measured value', () => {
    const zs: any = scoreZone(ZONE, { assessmentDate: '2026-08-19' })
    const all = zs.cats.flatMap((c: any) => c.r).map((f: any) => String(f.t)).join(' | ')
    expect(all).toMatch(/60 µg\/m³|60 ppm/)
    expect(all).toMatch(/IICRC S520/)
  })
})

describe('likely contributing cause', () => {
  // The app renders this in a card under "Likely contributing cause". It used
  // to be sliced at 137 characters with an ellipsis, so a three-sentence
  // cause carrying a recommendation and a scope caveat was cut mid-word:
  //   "...insufficient outdoor-air delivery is a common c…"
  // The clamp is gone; the strings are written short instead.
  const ZONE = {
    zn: 'Z1', su: 'office', ac: '6', sr: 'Yes — clear pattern', cc: 'Yes — this zone',
    sy: ['Headache', 'Fatigue'], cx: 'Yes — complaints reported',
    tf: '90', rh: '80', co2: '1600', co2o: '420', pm: '60', pmo: '6', tv: '4000',
  }
  const chains = (): any[] => {
    const b = { ft: 'Office', assessmentDate: '2026-08-19' }
    return buildCausalChains([ZONE] as never, b as never, [scoreZone(ZONE, b)] as never) || []
  }

  it('states a cause and stops', () => {
    const all = chains()
    expect(all.length).toBeGreaterThan(0)
    for (const c of all) {
      for (const re of ADVICE) {
        expect(String(c.rootCause), `${c.type} matches ${re}`).not.toMatch(re)
      }
    }
  })

  it('reads as one or two sentences, not a paragraph', () => {
    for (const c of chains()) {
      const cause = String(c.rootCause)
      // Two forms are in use and both are fine: a short noun phrase
      // ("Inadequate ventilation rate for occupant load") and one or two
      // full sentences. What must not happen is a paragraph that the card
      // then clips.
      expect(cause.length, `${c.type} is ${cause.length} chars`).toBeLessThanOrEqual(200)
      expect(cause.trim().length, `${c.type} is empty`).toBeGreaterThan(10)
      expect(cause, `${c.type} looks truncated`).not.toMatch(/…|\.\.\.$/)
    }
  })

  it('does not carry the retired "screening" label', () => {
    for (const c of chains()) {
      expect(`${c.type} ${c.rootCause} ${c.confidence || ''} ${c.std || ''}`.toLowerCase())
        .not.toContain('screening')
    }
  })
})
