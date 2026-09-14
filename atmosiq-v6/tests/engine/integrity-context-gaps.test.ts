/**
 * Phase 1 field integrity: the complaint-period occupancy rule, and the
 * promise that adding it changed nothing else.
 *
 * The rule is narrow on purpose. What is under test is less the rule than
 * the four properties around it:
 *
 *   1. IT HAS A RESOLUTION PATH. The finding names a field that exists,
 *      and recording that field makes the finding stop deriving. A finding
 *      an assessor cannot act on is a nag.
 *   2. "UNKNOWN" IS AN ANSWER. Blank means nobody was asked; `Unknown`
 *      means asked and unavailable. Only blank is an omission.
 *   3. LOGGER DATA IS SUPPORTING, NEVER LOAD-BEARING. Absent forensics
 *      cannot create the finding and cannot strengthen it, because an
 *      assessment with no logger deployed is a normal assessment.
 *   4. NOTHING ELSE MOVED. `deriveStatus`, `can_finalize`, the
 *      finalization blockers and `interruptsZoneCompletion` are all
 *      identical with the finding present and absent.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  detectComplaintContextGaps, asZoneGapLine,
  DETECTOR, COMPLAINTS_REPORTED, TIME_LINKED_PERIODS, RESOLVING_FIELD,
} from '../../src/engines/integrity/context-gaps.js'
import { COMPLAINT_PERIOD_HOURS, forensicEvidenceForPeriod } from '../../src/engines/integrity/forensic-evidence.js'
import { buildReadinessVerdict } from '../../src/engines/readiness-verdict.js'
import { zoneGaps, interruptsZoneCompletion, zoneIntegrityFindings } from '../../src/engines/zone-gaps.js'
import { buildForensicBundle } from '../../src/utils/forensicBundle.js'
import { Q_ZONE } from '../../src/constants/questions.js'
import { getField, SCOPE_ZONE } from '../../src/constants/field-registry.js'

const DAY = 86400_000
const T0 = Date.UTC(2026, 2, 2, 0, 0, 0)
const Q = 15 * 60_000

/** A zone with a time-linked complaint and, by default, no occupancy context. */
const zone = (over: any = {}) => ({
  zid: 'z-1', zn: 'Room 214',
  cx: COMPLAINTS_REPORTED,
  sy_time: 'Afternoon',
  ...over,
})
const assessment = (over: any = {}) => ({ zones: [zone(over)], presurvey: {}, bldg: {} })

/** A four-day CO2 cycle peaking at 14:00, so its occurrences land in the afternoon. */
const cycleBundle = () => {
  const pts: any[] = []
  for (let d = 0; d < 4; d++) {
    for (let i = 0; i < 96; i++) {
      const h = Math.floor((i * 15) / 60)
      pts.push({ t: T0 + d * DAY + i * Q, co2: 500 + 200 * Math.cos(((h - 14) / 24) * 2 * Math.PI) })
    }
  }
  return buildForensicBundle({
    sensorData: {
      version: 2,
      datasets: [{
        id: 'primary', role: 'indoor', label: 'Indoor', points: pts, params: ['co2'],
        units: { co2: 'ppm' }, hasTimestamps: true,
        summary: { start: pts[0].t, end: pts[pts.length - 1].t, intervalSec: 900, count: pts.length },
      }],
      occupancyWindows: [], graphs: {}, thresholds: {},
    },
    utcOffsetMin: 0,
  })
}

describe('the rule fires only where occupancy would change the reading', () => {
  it('raises one advisory finding for a time-linked complaint with no occupancy context', () => {
    const out: any[] = detectComplaintContextGaps(assessment())
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      issue_type: 'missing_context',
      severity: 'advisory',
      source_layer: 'field_integrity',
      actionability: 'on_site_now',
      zone_ids: ['z-1'],
      resolution_status: 'open',
    })
    expect(out[0].provenance.detector).toBe(DETECTOR)
    expect(out[0].description).toContain('Room 214')
    expect(out[0].description).toContain('afternoon')
    // It cites the two fields it rests on, and no logger evidence exists yet.
    expect(out[0].evidence_ids).toEqual(['fld-z-1-cx', 'fld-z-1-sy_time'])
    expect(out[0].time_window).toBeNull()
  })

  it('fires for each period that names a time of day, and for none that does not', () => {
    for (const period of TIME_LINKED_PERIODS) {
      expect(detectComplaintContextGaps(assessment({ sy_time: period })), period).toHaveLength(1)
    }
    // No period, nothing for occupancy to settle. This is the CONTEXT_RULES
    // discipline: a gap is named where it changes a reading, not everywhere.
    for (const period of ['All day', 'No pattern', 'Unknown', '']) {
      expect(detectComplaintContextGaps(assessment({ sy_time: period })), period).toEqual([])
    }
  })

  it('says nothing about a zone with no complaints, and nothing about an empty draft', () => {
    expect(detectComplaintContextGaps(assessment({ cx: 'No complaints' }))).toEqual([])
    expect(detectComplaintContextGaps(assessment({ cx: '' }))).toEqual([])
    expect(detectComplaintContextGaps({ zones: [] })).toEqual([])
    expect(detectComplaintContextGaps(null as never)).toEqual([])
    expect(detectComplaintContextGaps({} as never)).toEqual([])
  })

  it('reports actionability by where the assessor is, and nothing else', () => {
    expect(detectComplaintContextGaps(assessment())[0].actionability).toBe('on_site_now')
    expect(detectComplaintContextGaps(assessment(), { onSite: false })[0].actionability).toBe('before_signoff')
  })

  it('never asserts causation, and never states a figure', () => {
    const text = JSON.stringify(detectComplaintContextGaps(assessment(), { forensics: cycleBundle() }))
    expect(text).not.toMatch(/caused|because of|due to|explains|responsible for/i)
    expect(text).not.toMatch(/\bppm\b|carbon dioxide/i)
  })
})

describe('the finding has a real resolution path', () => {
  it('names a field the walkthrough actually offers, in the zone questionnaire', () => {
    const q: any = Q_ZONE.find((x: any) => x.id === RESOLVING_FIELD)
    expect(q, 'the resolving field must exist in Q_ZONE').toBeTruthy()
    expect(q.sec).toBe('Complaints')
    // It appears only once complaints are reported, so it never nags a zone
    // the rule could not fire on.
    expect(q.cond).toEqual({ f: 'cx', eq: COMPLAINTS_REPORTED })
    expect(q.opts).toContain('Unknown')
    // The registry DERIVES from questions.js, so declaring the field there
    // is what makes it a real field. Zone-scoped, which is the record the
    // detector reads it off — a building-scoped field would be read from
    // the wrong shape and silently never seen.
    const contract: any = getField(RESOLVING_FIELD)
    expect(contract, 'the resolving field must resolve in the registry').toBeTruthy()
    expect(contract.scope).toBe(SCOPE_ZONE)
  })

  it('disappears deterministically once the context is recorded', () => {
    expect(detectComplaintContextGaps(assessment())).toHaveLength(1)
    for (const answer of ['Yes — normally occupied', 'No — normally unoccupied', 'Varies']) {
      expect(detectComplaintContextGaps(assessment({ [RESOLVING_FIELD]: answer })), answer).toEqual([])
    }
  })

  it('treats "Unknown" as known-unavailable context, not as an unaddressed omission', () => {
    // The assessor asked and could not find out. That is context they
    // established, and continuing to list it would train them to ignore the list.
    expect(detectComplaintContextGaps(assessment({ [RESOLVING_FIELD]: 'Unknown' }))).toEqual([])
    // Whitespace is not an answer.
    expect(detectComplaintContextGaps(assessment({ [RESOLVING_FIELD]: '   ' }))).toHaveLength(1)
  })
})

describe('Logger Forensics is supporting evidence and never a reason', () => {
  it('attaches overlapping occurrences, with a window read off the record', () => {
    const bundle: any = cycleBundle()
    const out: any[] = detectComplaintContextGaps(assessment(), { forensics: bundle })
    expect(out).toHaveLength(1)
    const f = out[0]
    expect(f.evidence_ids.some((id: string) => id.startsWith('pat-'))).toBe(true)
    expect(f.evidence_ids.some((id: string) => id.startsWith('occ-'))).toBe(true)
    expect(f.parameter_ids.length).toBeGreaterThan(0)
    expect(f.time_window.basis).toBe('forensic_occurrence')
    // Real instants from the record, not a synthesized part-of-day interval.
    expect(f.time_window.start).toBeGreaterThanOrEqual(T0)
    expect(f.time_window.end).toBeGreaterThan(f.time_window.start)
    expect(f.provenance.inputs_fingerprint).toBe(bundle.fingerprint)
  })

  it('keeps the same id whether or not a logger was ever uploaded', () => {
    const bare = detectComplaintContextGaps(assessment())[0]
    const rich = detectComplaintContextGaps(assessment(), { forensics: cycleBundle() })[0]
    expect(rich.id).toBe(bare.id)
  })

  it('does not create or strengthen the finding when there is no logger at all', () => {
    // Constraint: missing logger coverage is not a defect. A walkthrough with
    // no logger deployed is a normal assessment.
    const none: any[] = detectComplaintContextGaps(assessment(), { forensics: null })
    expect(none).toHaveLength(1)
    expect(none[0].severity).toBe('advisory')
    expect(none[0].time_window).toBeNull()
    expect(none[0].parameter_ids).toEqual([])
    // And a logger with nothing in the period adds nothing either.
    expect(forensicEvidenceForPeriod(cycleBundle(), 'Morning')).toBeNull()
    const morning: any[] = detectComplaintContextGaps(assessment({ sy_time: 'Morning' }), { forensics: cycleBundle() })
    expect(morning).toHaveLength(1)
    expect(morning[0].time_window).toBeNull()
  })

  it('returns nothing for a missing bundle or an unknown period, rather than guessing', () => {
    expect(forensicEvidenceForPeriod(null, 'Afternoon')).toBeNull()
    expect(forensicEvidenceForPeriod(cycleBundle(), 'Whenever')).toBeNull()
    expect(forensicEvidenceForPeriod({ patterns: [] }, 'Afternoon')).toBeNull()
  })

  it('states its part-of-day vocabulary rather than hiding it, wrap included', () => {
    expect(Object.keys(COMPLAINT_PERIOD_HOURS).sort()).toEqual([...TIME_LINKED_PERIODS].sort())
    expect(COMPLAINT_PERIOD_HOURS.Afternoon).toEqual([12, 17])
    // Evening wraps past midnight, which is why the matcher cannot compare
    // two hours with a single `<`.
    const [from, to] = COMPLAINT_PERIOD_HOURS['Evening / night']
    expect(from).toBeGreaterThan(to)
  })
})

describe('nothing else moved', () => {
  // The one difference between these two assessments is the new field, which
  // no other engine reads. Everything below must therefore be identical.
  const missing = assessment()
  const recorded = assessment({ [RESOLVING_FIELD]: 'Yes — normally occupied' })

  it('leaves the readiness status, ready flag and finalization behavior untouched', () => {
    const a: any = buildReadinessVerdict(missing)
    const b: any = buildReadinessVerdict(recorded)
    expect(a.status).toBe(b.status)
    expect(a.ready).toBe(b.ready)
    expect(a.can_finalize).toBe(b.can_finalize)
    expect(a.finalization_blockers).toEqual(b.finalization_blockers)
    expect(a.finalization_warnings).toEqual(b.finalization_warnings)
    expect(a.defensibility_gaps).toEqual(b.defensibility_gaps)
    expect(a.summary).toBe(b.summary)
  })

  it('carries the finding beside the verdict, never inside the gaps deriveStatus reads', () => {
    const a: any = buildReadinessVerdict(missing)
    expect(a.integrity_findings).toHaveLength(1)
    expect(a.integrity_findings[0].actionability).toBe('before_signoff')
    // The stream `deriveStatus` reads is untouched by it.
    expect(a.defensibility_gaps.some((g: any) => g.kind === 'missing_context')).toBe(false)
    expect(buildReadinessVerdict(recorded).integrity_findings).toEqual([])
    // A malformed assessment still returns the key, so a consumer never has
    // to test for its existence.
    expect(buildReadinessVerdict(null as never).integrity_findings).toEqual([])
  })

  it('leaves zone completion exactly as it was — the finding never gates it', () => {
    expect(interruptsZoneCompletion(zoneGaps(missing, 0)))
      .toBe(interruptsZoneCompletion(zoneGaps(recorded, 0)))
    expect(zoneGaps(missing, 0)).toEqual(zoneGaps(recorded, 0))
    // And the finding is not in the list that gates it.
    expect(zoneGaps(missing, 0).some((g: any) => g.id.startsWith('intg-'))).toBe(false)
  })

  it('surfaces the finding to the zone sheet as its own list', () => {
    const lines: any[] = zoneIntegrityFindings(missing, 0)
    expect(lines).toHaveLength(1)
    expect(lines[0].id.startsWith('intg-')).toBe(true)
    expect(lines[0].label).toBeTruthy()
    expect(lines[0].why).toContain('Room 214')
    // The sheet renders `{id,label,why}`; a `kind` here would reach
    // `interruptsZoneCompletion` the moment somebody merged the lists.
    expect(Object.keys(lines[0]).sort()).toEqual(['id', 'label', 'why'])
    expect(zoneIntegrityFindings(recorded, 0)).toEqual([])
    expect(zoneIntegrityFindings(missing, 9)).toEqual([])
    expect(asZoneGapLine({} as never)).toEqual({ id: undefined, label: undefined, why: undefined })
  })

  it('emits nothing blocking, from any input this detector accepts', () => {
    const all = [
      ...detectComplaintContextGaps(assessment()),
      ...detectComplaintContextGaps(assessment(), { forensics: cycleBundle() }),
      ...detectComplaintContextGaps(assessment({ sy_time: 'Evening / night' }), { onSite: false }),
    ]
    expect(all.length).toBeGreaterThan(0)
    all.forEach((f: any) => expect(f.severity).toBe('advisory'))
  })

  it('reaches the Zone-complete sheet, as its own list and not as a gap', () => {
    // A source pin, the idiom `ai-sections-edit.test.ts` already uses for
    // wiring: the finding is computed in an engine and rendered in a 6,000
    // line component, and what can silently regress is the join between
    // them. Three things must hold, and each has a failure mode worth a test.
    const src = readFileSync(new URL('../../src/components/MobileApp.jsx', import.meta.url), 'utf8')
    const sheet = src.slice(src.indexOf('<BottomSheet title="Zone complete"'))
    expect(sheet.length).toBeGreaterThan(0)
    // 1. It is fetched at all — otherwise the engine computes into nothing.
    expect(src).toMatch(/import \{[^}]*zoneIntegrityFindings[^}]*\} from '\.\.\/engines\/zone-gaps\.js'/)
    expect(sheet).toMatch(/zoneIntegrityFindings\(/)
    // 2. It can bring the list into existence on its own, or a zone whose
    //    only outstanding item is a finding would show nothing.
    expect(sheet).toMatch(/!stopping && !findings\.length/)
    // 3. It is NOT what stops the assessor. `interruptsZoneCompletion` reads
    //    the gaps and only the gaps; passing it anything else would turn an
    //    advisory finding into a block.
    expect(sheet).toMatch(/interruptsZoneCompletion\(gaps\)/)
    expect(sheet).not.toMatch(/interruptsZoneCompletion\([^)]*findings/)
  })

  it('produces byte-identical findings on repeated runs', () => {
    const a = JSON.stringify(detectComplaintContextGaps(assessment(), { forensics: cycleBundle() }))
    const b = JSON.stringify(detectComplaintContextGaps(assessment(), { forensics: cycleBundle() }))
    expect(a).toBe(b)
  })
})
