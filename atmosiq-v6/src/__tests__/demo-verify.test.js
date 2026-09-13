/**
 * The four demo datasets, verified end to end.
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
import { DEMO_HCHO_BUILDING, DEMO_HCHO_ZONES, DEMO_HCHO_PRESURVEY, DEMO_HCHO_LOGGER_ROWS, buildDemoHchoSensorData } from '../constants/demoDataHcho'
import { STD } from '../constants/standards'

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

describe('Demo C — Larkin Hall (post-renovation formaldehyde, with logger data)', () => {
  const bldg = { ...DEMO_HCHO_BUILDING, assessmentDate: DEMO_HCHO_PRESURVEY.ps_survey_date }
  const scores = DEMO_HCHO_ZONES.map(z => scoreZone(z, bldg))
  const summary = summarizeAssessment(scores)
  const [room214, room108] = scores

  it('assesses every zone', () => {
    expect(scores).toHaveLength(DEMO_HCHO_ZONES.length)
    scores.forEach(zs => expect(zs.cats).toHaveLength(5))
  })

  it('no forbidden language in any finding', () => {
    for (const f of allFindings(scores)) {
      FORBIDDEN.forEach(word => expect(f.t).not.toContain(word))
    }
  })

  it('formaldehyde is the contaminant finding, and it is an indicative one', () => {
    // The point of this demo: a spot reading above the NIOSH REL, which is a
    // 10-hour TWA a walkthrough cannot settle — the finding says so, cites
    // the REL, and never reaches the regulatory tiers.
    const hcho = catIn(room214, 'Contaminants').r.find(r => r.p === 'hcho')
    expect(hcho).toBeTruthy()
    expect(hcho.cid).toBe('hcho_niosh_rel')
    expect(hcho.sev).toBe('medium')
    expect(hcho.determinative).toBe(false)
    expect(hcho.t).toContain('NIOSH REL')
    expect(hcho.t).not.toMatch(/OSHA|exceeds the PEL|noncompliant/)
  })

  it('the comparison room is clean — the difference is the contents, not the ventilation', () => {
    expect(catIn(room108, 'Contaminants').r.every(r => r.sev === 'pass')).toBe(true)
    expect(catIn(room108, 'Complaints').r.map(r => r.t)).toEqual(['No complaints'])
    scores.forEach(zs => expect(catIn(zs, 'Ventilation').r.every(r => r.sev === 'pass')).toBe(true))
  })

  it('clean HVAC in both rooms: the renovation is the story, not the equipment', () => {
    scores.forEach(zs => {
      const hvac = catIn(zs, 'HVAC')
      expect(hvac.gate5).toBeFalsy()
      expect(hvac.r.some(r => r.sev === 'critical')).toBe(false)
    })
  })

  it('surfaces findings, none of them critical', () => {
    expect(summary.findings.attention).toBeGreaterThan(0)
    expect(summary.findings.bySeverity.critical).toBe(0)
    expect(summary.findings).toEqual(countFindings(scores))
  })

  it('the walkthrough agrees with the logger it was taken beside', () => {
    // hc is ppm; the logger row for 31 May 14:00 reads 0.040 mg/m³, which is
    // 0.0326 ppm at 24.45 L/mol — so the spot reading is the logger's own
    // afternoon value, not a number chosen to make a point.
    const row = DEMO_HCHO_LOGGER_ROWS.find(r => r[0] === '2026-05-31 14:00')
    expect(row).toBeTruthy()
    const loggerPpm = row[5] * 24.45 / 30.03
    expect(Math.abs(+DEMO_HCHO_ZONES[0].hc - loggerPpm)).toBeLessThan(0.002)
    expect(Math.abs(+DEMO_HCHO_ZONES[0].co2 - row[3])).toBeLessThan(40)
  })

  it('the logger record parses like an uploaded file: 168 hourly rows, formaldehyde in ppb', () => {
    const sd = buildDemoHchoSensorData()
    const ds = sd.datasets[0]
    expect(ds.role).toBe('indoor')
    expect(ds.points).toHaveLength(168)
    expect(ds.hasTimestamps).toBe(true)
    expect(ds.params).toEqual(['temp', 'rh', 'co2', 'tvoc', 'hcho', 'pm25'])
    expect(ds.units.hcho).toBe('ppb')
    expect(ds.units.hchoSource).toBe('mg/m³')
    expect(ds.units.temp).toBe('°C')
    expect(ds.quality.level).toBe('ok')
    // The 27 May excursion: above the WHO 30-minute guideline (0.081 ppm =
    // 81 ppb) for a full day, and back to baseline after it.
    const ppb = ds.points.map(p => p.hcho)
    expect(Math.max(...ppb)).toBeGreaterThan(STD.c.hcho.who * 1000)
    expect(ppb.filter(v => v > STD.c.hcho.who * 1000)).toHaveLength(25)
    expect(ds.summary.stats.co2.max).toBeLessThan(STD.v.co2.con)
    // Four timelines are flagged for the report; the images are rasterized
    // at export, as for any assessment.
    expect(Object.entries(sd.graphs).filter(([, g]) => g.include).map(([id]) => id).sort()).toEqual(['co2', 'hcho', 'pm', 'tvoc'])
    expect(sd.occupancyWindows).toHaveLength(8)
  })
})
