/**
 * The three demo datasets, verified end to end.
 *
 * This file was golden-value tests over the 100-point score: every
 * describe block asserted a composite, a risk band, and that no category
 * score was NaN or out of range. All of that went with the score.
 *
 * What is re-pinned here is what those assertions were standing in FOR —
 * that each demo produces the assessment it was built to demonstrate. A
 * clean building shows no findings; the FM demo shows an administrative
 * gap and not a physical one; the findings demo fires the HVAC gate and
 * carries occupant complaints. Those are the properties a demo exists to
 * prove, and they survive the score exactly.
 */

import { describe, it, expect } from 'vitest'
import { scoreZone, summarizeAssessment } from '../engines/scoring'
import { countFindings } from '../utils/assessmentVerdict'
import { DEMO_CLEAN_BUILDING, DEMO_CLEAN_ZONES } from '../constants/demoDataClean'
import { DEMO_FM_BUILDING, DEMO_FM_ZONES } from '../constants/demoDataFM'
import { DEMO_FINDINGS_BUILDING, DEMO_FINDINGS_ZONES } from '../constants/demoDataFindings'

const FORBIDDEN = ['SYSTEM FAILURE', 'SYNERGISTIC', 'TOXICITY', 'System Integrity Override', 'emergency']

/** Every finding across every zone, with its category. */
const allFindings = (scores) =>
  scores.flatMap(zs => zs.cats.flatMap(c => (c.r || []).map(r => ({ ...r, cat: c.l }))))

const catIn = (zs, label) => zs.cats.find(c => c.l === label)

describe('Demo A — Lakeside Professional Center (well-run office)', () => {
  const scores = DEMO_CLEAN_ZONES.map(z => scoreZone(z, DEMO_CLEAN_BUILDING))
  const summary = summarizeAssessment(scores)

  it('assesses every zone', () => {
    expect(scores).toHaveLength(DEMO_CLEAN_ZONES.length)
    scores.forEach(zs => {
      expect(zs.cats.map(c => c.l).sort())
        .toEqual(['Complaints', 'Contaminants', 'Environment', 'HVAC', 'Ventilation'])
      expect(zs.zoneName).toBeTruthy()
    })
  })

  it('no forbidden language in any finding', () => {
    for (const f of allFindings(scores)) {
      FORBIDDEN.forEach(word => expect(f.t).not.toContain(word))
    }
  })

  it('clean HVAC: no gate5, and nothing above an informational finding', () => {
    scores.forEach(zs => {
      const hvac = catIn(zs, 'HVAC')
      expect(hvac.gate5).toBeFalsy()
      expect(hvac.r.every(r => r.sev === 'pass' || r.sev === 'info')).toBe(true)
    })
  })

  it('no occupant complaints in either zone', () => {
    scores.forEach(zs => {
      expect(catIn(zs, 'Complaints').r.map(r => r.t)).toEqual(['No complaints'])
    })
  })

  it('the whole demo is clean — this is what makes it the clean demo', () => {
    expect(summary.findings.attention).toBe(0)
    expect(summary.count).toBe(DEMO_CLEAN_ZONES.length)
  })
})

describe('FM Demo — Greenfield Office Park', () => {
  const scores = DEMO_FM_ZONES.map(z => scoreZone(z, DEMO_FM_BUILDING))
  const summary = summarizeAssessment(scores)

  it('assesses every zone', () => {
    expect(scores).toHaveLength(DEMO_FM_ZONES.length)
    scores.forEach(zs => expect(zs.cats).toHaveLength(5))
  })

  it('no forbidden language in any finding', () => {
    for (const f of allFindings(scores)) {
      FORBIDDEN.forEach(word => expect(f.t).not.toContain(word))
    }
  })

  it('Unknown HVAC maintenance → adminGap, and NOT a critical HVAC condition', () => {
    // The point of this demo. An unknown maintenance history is a
    // documentation gap: it lowers confidence, it is not a physical
    // deficiency. The old assertion said the same thing in points
    // ("hvac.s > 3", i.e. not capped at the old 3/20).
    scores.forEach(zs => {
      const hvac = catIn(zs, 'HVAC')
      if (hvac.status) return
      expect(hvac.adminGap).toBe(true)
      expect(hvac.gate5).toBeFalsy()
      expect(hvac.r.some(r => r.sev === 'critical')).toBe(false)
    })
  })

  it('produces a summary carrying the confidence the gap implies', () => {
    expect(summary).not.toBeNull()
    expect(summary.confidence).toBeDefined()
  })
})

describe('Demo B — Harborview Corporate Center (building with findings)', () => {
  const scores = DEMO_FINDINGS_ZONES.map(z => scoreZone(z, DEMO_FINDINGS_BUILDING))
  const summary = summarizeAssessment(scores)

  it('assesses every zone', () => {
    expect(scores).toHaveLength(DEMO_FINDINGS_ZONES.length)
    scores.forEach(zs => expect(zs.cats).toHaveLength(5))
  })

  it('no forbidden language in any finding', () => {
    for (const f of allFindings(scores)) {
      FORBIDDEN.forEach(word => expect(f.t).not.toContain(word))
    }
  })

  it('critical HVAC gate5 fires (standing water in drain pan)', () => {
    const hvac0 = catIn(scores[0], 'HVAC')
    expect(hvac0.gate5).toBe(true)
    // Was `scores[0].tot <= 40`. The gate's observable consequence is a
    // critical finding in that zone, which is what the score was
    // reflecting.
    expect(hvac0.r.some(r => r.sev === 'critical')).toBe(true)
  })

  it('occupant complaints present in both zones', () => {
    scores.forEach(zs => {
      const complaints = catIn(zs, 'Complaints').r
      expect(complaints.some(r => r.sev !== 'pass')).toBe(true)
    })
  })

  it('surfaces findings that warrant attention — this is the findings demo', () => {
    expect(summary.findings.attention).toBeGreaterThan(0)
    expect(summary.findings.bySeverity.critical).toBeGreaterThan(0)
    // And the census agrees with the zones it was built from.
    const direct = countFindings(scores)
    expect(summary.findings).toEqual(direct)
  })
})
