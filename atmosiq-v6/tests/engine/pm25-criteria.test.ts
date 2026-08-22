/**
 * PM2.5 evaluates through the criterion registry.
 *
 * It was the last parameter still comparing against literals lifted out
 * of STD, and it showed. CO, formaldehyde and TVOC route through
 * `evaluateCriteria` and carry the averaging caveat the registry attaches
 * to every threshold:
 *
 *   Formaldehyde 0.02 ppm — above the NIOSH REL of 0.016 ppm, which is a
 *   10-hour time-weighted average. A short-duration reading cannot
 *   establish compliance with this averaging period.
 *
 * PM2.5 said, from an instantaneous reading:
 *
 *   PM2.5 38 µg/m³ — exceeds EPA 24-hr standard
 *
 * Comparing a grab reading to a 24-hour standard with no caveat is the
 * category error the registry exists to prevent, and the one parameter
 * off the registry was the one making it.
 */
import { describe, it, expect } from 'vitest'

import { scoreZone } from '../../src/engines/scoring.js'
import { evaluateCriteria, CRITERIA, AVERAGING } from '../../src/constants/criteria.js'
import { STD } from '../../src/constants/standards.js'

type Zone = Record<string, unknown>

/** A zone complete enough for Contaminants to score. */
const BASE: Zone = {
  zn: 'A', su: 'office', sf: '2400', oc: '18', co2: '700', co2o: '430',
  cfm_person: '20', tf: '73', rh: '45', co: '1', tv: '150', hc: '0.005', vd: 'None',
}

function pmFindings(pm: string, outdoor = '9'): Array<Record<string, string>> {
  const zone: Zone = { ...BASE, pm, ...(outdoor ? { pmo: outdoor } : {}) }
  const zs = scoreZone(zone, {}) as unknown as { cats: Array<{ r: Array<Record<string, string>> }> }
  return zs.cats.flatMap((c) => c.r)
    .filter((f) => f.p === 'pm25' && !String(f.t).startsWith('Indoor/outdoor'))
}

const threshold = (pm: string) => pmFindings(pm).find((f) => f.sev !== 'pass' && f.sev !== 'info')

describe('PM2.5 carries the averaging caveat every other analyte gets', () => {
  it('states the criterion, its averaging period, and what a survey cannot settle', () => {
    const f = threshold('38')!
    expect(f.t).toContain('above the EPA 24-hour NAAQS of 35 µg/m³')
    expect(f.t).toContain('which is a 24-hour average')
    expect(f.t).toContain('A short-duration reading cannot establish compliance with this averaging period')
  })

  it('never says "exceeds" a standard a grab reading cannot exceed', () => {
    for (const pm of ['20', '38', '60', '200']) {
      const f = threshold(pm)
      if (!f) continue
      expect(f.t, `a grab reading cannot exceed an averaged standard: ${f.t}`)
        .not.toMatch(/exceeds EPA 24-hr standard|exceeds WHO guideline/)
    }
  })

  it('carries the criterion id and its citation, not a hand-written label', () => {
    const f = threshold('38')!
    expect(f.cid).toBe('pm25_epa_24h')
    expect(f.std).toContain('40 CFR 50.18')
    const medium = threshold('20')!
    expect(medium.cid).toBe('pm25_who_24h')
    expect(medium.std).toMatch(/WHO Global Air Quality Guidelines/)
  })

  it('walks the full ladder in the right order', () => {
    expect(threshold('60')!.cid).toBe('pm25_epa_unhealthy')
    expect(threshold('38')!.cid).toBe('pm25_epa_24h')
    expect(threshold('20')!.cid).toBe('pm25_who_24h')
    expect(threshold('4')).toBeUndefined()
  })

  it('takes severity from the criterion class', () => {
    expect(threshold('60')!.sev).toBe('high')
    expect(threshold('38')!.sev).toBe('high')
    expect(threshold('20')!.sev).toBe('medium')
  })

  it('still distinguishes a reading with a paired outdoor value from one without', () => {
    // Preserved from the literal ladder: a reading with a concurrent
    // outdoor value behind it counts for more, because the comparison is
    // what separates a building source from ambient air.
    // Was: the deduction was two-thirds for a reading with no outdoor
    // comparison, so the zone scored HIGHER without one. With no
    // deduction to weight, the distinction is stated in the finding —
    // where a reader can act on it, rather than inferring it from a
    // number that moved.
    const withOutdoor: any = scoreZone({ ...BASE, pm: '38', pmo: '9' }, {})
    const without: any = scoreZone({ ...BASE, pm: '38' }, {})
    const pmOf = (z: any) => z.cats.find((c: any) => c.l === 'Contaminants').r.find((r: any) => r.p === 'pm25')
    expect(pmOf(without).t).toMatch(/No concurrent outdoor reading was taken/)
    expect(pmOf(withOutdoor).t).not.toMatch(/No concurrent outdoor reading/)
    // The finding itself is the same severity either way — the evidence
    // differs, not the reading.
    expect(pmOf(without).sev).toBe(pmOf(withOutdoor).sev)
  })

  it('moves the FINDING with the reading', () => {
    // Was `at('4') > at('20') > at('38')` on the zone score.
    const sevAt = (pm: string) => {
      const z: any = scoreZone({ ...BASE, pm, pmo: '9' }, {})
      return z.cats.find((c: any) => c.l === 'Contaminants').r.find((r: any) => r.p === 'pm25')?.sev ?? 'pass'
    }
    const rank: Record<string, number> = { pass: 0, info: 0, low: 1, medium: 2, high: 3, critical: 4 }
    expect(rank[sevAt('38')]).toBeGreaterThan(rank[sevAt('20')])
    expect(rank[sevAt('20')]).toBeGreaterThanOrEqual(rank[sevAt('4')])
  })
})

describe('a criterion no survey can speak to does not produce a finding', () => {
  it('a clean office is not told it is above the WHO annual guideline', () => {
    // PM2.5 6 µg/m³ is above the WHO annual guideline of 5 µg/m³. It is
    // also an ANNUAL MEAN, which `AVERAGING.annual` declares evaluable
    // from no evidence basis at all — and whose own action text reads "An
    // annual mean cannot be evaluated from a short survey."
    expect(STD.c.pm25.whoAnnual).toBe(5)
    expect(threshold('6'), 'a two-minute reading cannot speak to an annual mean').toBeUndefined()
    expect(threshold('11'), 'nor to the EPA annual NAAQS').toBeUndefined()
  })

  it('applies to every parameter, not just PM2.5', () => {
    // hcho_epa_rfc is an annual criterion too. The rule is general and
    // reads the registry's own declaration rather than naming parameters.
    expect(evaluateCriteria('hcho', 0.008, 'screening_grab')).toBeNull()
    for (const [param, list] of Object.entries(CRITERIA as Record<string, Array<Record<string, string>>>)) {
      for (const c of list) {
        const avg = (AVERAGING as Record<string, { determinativeFrom: string[]; indicativeFrom: string[] }>)[c.averaging]
        if (!avg || avg.determinativeFrom.length > 0 || avg.indicativeFrom.length > 0) continue
        // Above this criterion but below every evaluable one: nothing fires.
        const hit = evaluateCriteria(param, Number(c.value) + 0.0001, 'screening_grab')
        expect(hit?.criterion?.id, `${param}/${c.id} is not evaluable from a survey and must not fire`).not.toBe(c.id)
      }
    }
  })

  it('leaves the criteria in the registry for citation', () => {
    // They are real published values. They cannot produce a survey
    // finding; they are still part of the reference set.
    const ids = (CRITERIA.pm25 as Array<{ id: string }>).map((c) => c.id)
    expect(ids).toContain('pm25_epa_annual')
    expect(ids).toContain('pm25_who_annual')
  })

  it('still evaluates criteria a survey CAN speak to', () => {
    expect(evaluateCriteria('pm25', 38, 'screening_grab')?.criterion.id).toBe('pm25_epa_24h')
    expect(evaluateCriteria('co', 60, 'screening_grab')?.criterion.id).toBeTruthy()
    expect(evaluateCriteria('hcho', 0.9, 'screening_grab')?.criterion.id).toBeTruthy()
  })
})

