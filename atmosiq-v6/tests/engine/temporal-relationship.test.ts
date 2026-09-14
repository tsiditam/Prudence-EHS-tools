/**
 * Cross-evidence reconciliation: a reported complaint period against when
 * a logger pattern actually occurred.
 *
 * Five properties, in descending order of how badly getting them wrong
 * would matter:
 *
 *   1. IT NEVER GUESSES WHICH ROOM. Nothing in the record joins a zone to a
 *      dataset. A silent wrong join reads as evidence, so anything but one
 *      zone and one indoor dataset stops with a machine-readable reason.
 *   2. IT NEVER ASSERTS CAUSATION, structurally. The type carries no free
 *      text at all, so there is no sentence in which a cause could be
 *      claimed, and the presenter's wording is scanned as well.
 *   3. TEMPORAL AGREEMENT AND RELEVANCE ARE SEPARATE AXES. An overlap is
 *      equally real with no live differential behind it; the difference is
 *      what may be built on it, not whether it happened.
 *   4. INCONCLUSIVE IS AN ANSWER, not a fallback. A near-even split is not
 *      a weak overlap, and every insufficiency names which fix would
 *      resolve it.
 *   5. IT CHANGES NOTHING ELSE. No report, no readiness, no finding.
 */
import { describe, it, expect } from 'vitest'
import {
  detectTemporalRelationships, relationshipsByPattern, resolveAssociation,
  liveDifferentialParameters,
  DETECTOR, COMPLAINTS_REPORTED, TIME_LINKED_PERIODS, EXCLUDED_KINDS,
  MIN_MONITORED_DAYS, MIN_OCCURRENCE_DAYS, MAX_DISCRIMINATING_WINDOW_MS,
} from '../../src/engines/integrity/temporal-relationship.js'
import {
  evidenceRelationship, relationshipIdentity,
  TEMPORAL_RELATIONSHIPS, INSUFFICIENT_REASONS, PARAMETER_RELEVANCE,
} from '../../src/engines/integrity/relationship.js'
import { patternAgreement } from '../../src/utils/forensicPresent.js'
import { buildForensicBundle } from '../../src/utils/forensicBundle.js'
import { buildMonitoringReportModel } from '../../src/utils/monitoringReportModel.js'
import { RULE_PARAMETERS } from '../../src/engine/investigation.js'

const DAY = 86400_000
const T0 = Date.UTC(2026, 2, 2, 0, 0, 0)
const Q = 15 * 60_000

const zone = (over: any = {}) => ({ zid: 'z-1', zn: 'Room 214', cx: COMPLAINTS_REPORTED, sy_time: 'Afternoon', ...over })

/**
 * `days` days of readings whose CO2 peaks at `peakHour`, so the recurring
 * cycle's occurrence windows land in a known part of the day.
 */
const bundleWithCycle = (days: number, peakHour = 14, extraDatasets: any[] = []) => {
  const pts: any[] = []
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < 96; i++) {
      const h = Math.floor((i * 15) / 60)
      pts.push({ t: T0 + d * DAY + i * Q, co2: 500 + 200 * Math.cos(((h - peakHour) / 24) * 2 * Math.PI) })
    }
  }
  return buildForensicBundle({
    sensorData: {
      version: 2,
      datasets: [{
        id: 'primary', role: 'indoor', label: 'Indoor', points: pts, params: ['co2'],
        units: { co2: 'ppm' }, hasTimestamps: true,
        summary: { start: pts[0].t, end: pts[pts.length - 1].t, intervalSec: 900, count: pts.length },
      }, ...extraDatasets],
      occupancyWindows: [], graphs: {}, thresholds: {},
    },
    utcOffsetMin: 0,
  })
}

const outdoorSet = () => {
  const pts: any[] = []
  for (let d = 0; d < 4; d++) for (let i = 0; i < 96; i++) pts.push({ t: T0 + d * DAY + i * Q, co2: 420 + (i % 5) })
  return {
    id: 'ds-out', role: 'outdoor', label: 'Outdoor', points: pts, params: ['co2'],
    units: { co2: 'ppm' }, hasTimestamps: true,
    summary: { start: pts[0].t, end: pts[pts.length - 1].t, intervalSec: 900, count: pts.length },
  }
}

const run = (over: any = {}) => detectTemporalRelationships({
  zones: [zone()], forensics: bundleWithCycle(4), ...over,
})
const cycleOf = (rels: any[], bundle: any) => {
  const cycle = bundle.patterns.find((p: any) => p.kind === 'recurring_cycle')
  return relationshipsByPattern(rels).get(cycle.id)
}

describe('it never guesses which room the logger was in', () => {
  it('associates exactly one zone with exactly one indoor dataset, and nothing else', () => {
    const b: any = bundleWithCycle(4)
    expect(resolveAssociation([zone()], b)!.datasetId).toBe('primary')
    // Two zones: which one the logger sat in is not in the record.
    expect(resolveAssociation([zone(), zone({ zid: 'z-2' })], b)).toBeNull()
    expect(resolveAssociation([], b)).toBeNull()
    // Two indoor datasets is the same problem from the other side. An
    // outdoor companion is not a second indoor dataset and does not block.
    const twoIndoor: any = bundleWithCycle(4, 14, [{ ...outdoorSet(), id: 'ds-2', role: 'indoor' }])
    expect(resolveAssociation([zone()], twoIndoor)).toBeNull()
    expect(resolveAssociation([zone()], bundleWithCycle(4, 14, [outdoorSet()]))!.datasetId).toBe('primary')
  })

  it('stops with a machine-readable reason rather than matching on names', () => {
    const b: any = bundleWithCycle(4)
    const rels: any[] = detectTemporalRelationships({ zones: [zone(), zone({ zid: 'z-2', zn: 'Indoor' })], forensics: b })
    expect(rels.length).toBe(b.patterns.length)
    rels.forEach((r) => {
      expect(r.relationship).toBe('insufficient_temporal_evidence')
      expect(r.reason).toBe('no_unambiguous_zone_dataset_association')
      // No zone is named and no period is quoted: doing either beside a
      // pattern we cannot attribute is the guess by other means. Note the
      // second zone is literally called "Indoor", which is what a
      // label match would have seized on.
      expect(r.zone_ids).toEqual([])
      expect(r.reported_period).toBeNull()
    })
  })

  it('has nothing to reconcile when nobody reported a complaint', () => {
    expect(detectTemporalRelationships({ zones: [zone({ cx: 'No complaints' })], forensics: bundleWithCycle(4) })).toEqual([])
    expect(detectTemporalRelationships({ zones: [], forensics: bundleWithCycle(4) })).toEqual([])
    expect(detectTemporalRelationships({ zones: [zone()], forensics: null })).toEqual([])
    expect(detectTemporalRelationships({})).toEqual([])
  })
})

describe('the comparison is distributional, and inconclusive is an answer', () => {
  it('calls a majority of occurrence days in the reported period an overlap', () => {
    const b: any = bundleWithCycle(4, 14)
    const r: any = cycleOf(detectTemporalRelationships({ zones: [zone({ sy_time: 'Afternoon' })], forensics: b }), b)
    expect(r.relationship).toBe('temporal_overlap')
    expect(r.reason).toBeNull()
    expect(r.reported_period).toBe('Afternoon')
    expect(r.observed_days.inPeriod).toBeGreaterThan(r.observed_days.withOccurrence / 2)
    expect(r.observed_days.monitored).toBeGreaterThanOrEqual(MIN_MONITORED_DAYS)
  })

  it('calls none of them a mismatch, which takes zero rather than few', () => {
    // The same cycle, reported as worst in the morning.
    const b: any = bundleWithCycle(4, 14)
    const r: any = cycleOf(detectTemporalRelationships({ zones: [zone({ sy_time: 'Morning' })], forensics: b }), b)
    expect(r.relationship).toBe('temporal_mismatch')
    expect(r.observed_days.inPeriod).toBe(0)
    expect(r.observed_days.withOccurrence).toBeGreaterThan(0)
  })

  it('refuses to round a near-even split toward either answer', () => {
    // Two occurrence days, one of them in the period. Not a majority, not
    // zero. Built directly because the detectors do not readily produce a
    // tie, and a tie is exactly the case worth pinning.
    const b: any = bundleWithCycle(4, 14)
    const cycle = b.patterns.find((p: any) => p.kind === 'recurring_cycle')
    const forged = {
      ...b,
      patterns: [{
        ...cycle,
        occurrenceWindows: [
          { id: 'occ-a', start: T0 + 14 * 3600_000, end: T0 + 15 * 3600_000, eventIds: [], datasetIds: ['primary'] },
          { id: 'occ-b', start: T0 + DAY + 8 * 3600_000, end: T0 + DAY + 9 * 3600_000, eventIds: [], datasetIds: ['primary'] },
        ],
      }],
    }
    const r: any = detectTemporalRelationships({ zones: [zone({ sy_time: 'Afternoon' })], forensics: forged })[0]
    expect(r.relationship).toBe('insufficient_temporal_evidence')
    expect(r.reason).toBe('indeterminate_period_distribution')
    expect(r.observed_days).toMatchObject({ withOccurrence: 2, inPeriod: 1 })
  })

  it('names the specific insufficiency, so a consumer never infers it', () => {
    // No period named: there is a complaint but nothing to compare against.
    for (const sy_time of ['All day', 'No pattern', 'Unknown', '']) {
      const b: any = bundleWithCycle(4)
      const r: any = cycleOf(detectTemporalRelationships({ zones: [zone({ sy_time })], forensics: b }), b)
      expect(r.reason, sy_time).toBe('complaint_has_no_specific_period')
      expect(r.reported_period).toBeNull()
    }
    // Too short a deployment to say when anything usually happens.
    const short: any = bundleWithCycle(1)
    detectTemporalRelationships({ zones: [zone()], forensics: short }).forEach((r: any) => {
      expect(['insufficient_monitored_days', 'insufficient_occurrence_days', 'no_eligible_occurrences']).toContain(r.reason)
    })
    // Every reason the module can emit is in the published vocabulary.
    const all = [
      ...detectTemporalRelationships({ zones: [zone(), zone({ zid: 'z-2' })], forensics: bundleWithCycle(4) }),
      ...detectTemporalRelationships({ zones: [zone({ sy_time: 'All day' })], forensics: bundleWithCycle(4) }),
      ...detectTemporalRelationships({ zones: [zone()], forensics: bundleWithCycle(4) }),
      ...detectTemporalRelationships({ zones: [zone()], forensics: short }),
    ]
    all.forEach((r: any) => {
      expect(TEMPORAL_RELATIONSHIPS).toContain(r.relationship)
      if (r.relationship === 'insufficient_temporal_evidence') expect(INSUFFICIENT_REASONS).toContain(r.reason)
      else expect(r.reason).toBeNull()
    })
  })
})

describe('eligibility is a property of the occurrences', () => {
  it('drops a window that spans a whole day, which agrees with every period', () => {
    const b: any = bundleWithCycle(4)
    const forged = {
      ...b,
      patterns: [{
        ...b.patterns[0],
        kind: 'indoor_outdoor_comparison',
        occurrenceWindows: [{ id: 'occ-run', start: T0, end: T0 + 4 * DAY, eventIds: [], datasetIds: ['primary'] }],
      }],
    }
    const r: any = detectTemporalRelationships({ zones: [zone()], forensics: forged })[0]
    expect(r.relationship).toBe('insufficient_temporal_evidence')
    expect(r.reason).toBe('no_eligible_occurrences')
    expect(MAX_DISCRIMINATING_WINDOW_MS).toBe(24 * 3600_000)
  })

  it('excludes the occupancy comparison by kind, because its windows are the schedule', () => {
    const b: any = bundleWithCycle(4)
    const forged = {
      ...b,
      patterns: [{
        ...b.patterns[0],
        kind: 'occupancy_comparison',
        occurrenceWindows: [
          { id: 'occ-1', start: T0 + 13 * 3600_000, end: T0 + 16 * 3600_000, eventIds: [], datasetIds: ['primary'] },
          { id: 'occ-2', start: T0 + DAY + 13 * 3600_000, end: T0 + DAY + 16 * 3600_000, eventIds: [], datasetIds: ['primary'] },
        ],
      }],
    }
    const r: any = detectTemporalRelationships({ zones: [zone()], forensics: forged })[0]
    expect(r.reason).toBe('no_eligible_occurrences')
    expect(EXCLUDED_KINDS).toContain('occupancy_comparison')
  })

  it('counts distinct days, not windows — two peaks in one afternoon are one day', () => {
    const b: any = bundleWithCycle(4)
    const forged = {
      ...b,
      patterns: [{
        ...b.patterns[0],
        kind: 'recurring_cycle',
        occurrenceWindows: [
          { id: 'occ-a', start: T0 + 13 * 3600_000, end: T0 + 14 * 3600_000, eventIds: [], datasetIds: ['primary'] },
          { id: 'occ-b', start: T0 + 15 * 3600_000, end: T0 + 16 * 3600_000, eventIds: [], datasetIds: ['primary'] },
        ],
      }],
    }
    const r: any = detectTemporalRelationships({ zones: [zone()], forensics: forged })[0]
    expect(r.observed_days.withOccurrence).toBe(1)
    expect(r.reason).toBe('insufficient_occurrence_days')
    expect(MIN_OCCURRENCE_DAYS).toBeGreaterThan(1)
  })
})

describe('relevance is a second axis, and does not gate the first', () => {
  const ventilationLive = { hypotheses: [{ ruleKey: 'hyp_ventilation', status: 'untested' }] }
  const nothingLive = { hypotheses: [{ ruleKey: 'hyp_ventilation', status: 'not_supported_by_measurement' }] }

  it('reports the same overlap whether or not a differential is live', () => {
    const b: any = bundleWithCycle(4, 14)
    const withLive: any = cycleOf(detectTemporalRelationships({ zones: [zone()], forensics: b, investigation: ventilationLive }), b)
    const without: any = cycleOf(detectTemporalRelationships({ zones: [zone()], forensics: b, investigation: nothingLive }), b)
    // The temporal fact is identical. Only the second axis moves.
    expect(withLive.relationship).toBe('temporal_overlap')
    expect(without.relationship).toBe('temporal_overlap')
    expect(withLive.observed_days).toEqual(without.observed_days)
    expect(withLive.relevance).toBe('linked_to_live_differential')
    expect(without.relevance).toBe('not_linked_to_live_differential')
    // Identity is the question, not the answer, so both are the same row.
    expect(withLive.id).toBe(without.id)
  })

  it('says unknown when there is no investigation state to ask', () => {
    const b: any = bundleWithCycle(4)
    expect(cycleOf(detectTemporalRelationships({ zones: [zone()], forensics: b }), b).relevance).toBe('unknown')
    expect(liveDifferentialParameters(null)).toBeNull()
    expect(liveDifferentialParameters({})).toBeNull()
  })

  it('reads the engine’s own rule-to-parameter map rather than a symptom table', () => {
    const params = liveDifferentialParameters({ hypotheses: [{ ruleKey: 'hyp_ventilation', status: 'untested' }] })!
    expect([...params]).toEqual([...RULE_PARAMETERS.hyp_ventilation])
    expect(params.has('co2')).toBe(true)
    // A dead differential contributes nothing.
    expect([...liveDifferentialParameters(nothingLive)!]).toEqual([])
    for (const v of PARAMETER_RELEVANCE) expect(typeof v).toBe('string')
  })
})

describe('it never asserts causation, structurally', () => {
  const everyOutcome = () => {
    const b4: any = bundleWithCycle(4, 14)
    return [
      ...detectTemporalRelationships({ zones: [zone()], forensics: b4, investigation: { hypotheses: [{ ruleKey: 'hyp_ventilation', status: 'untested' }] } }),
      ...detectTemporalRelationships({ zones: [zone({ sy_time: 'Morning' })], forensics: b4 }),
      ...detectTemporalRelationships({ zones: [zone({ sy_time: 'All day' })], forensics: b4 }),
      ...detectTemporalRelationships({ zones: [zone(), zone({ zid: 'z-2' })], forensics: b4 }),
      ...detectTemporalRelationships({ zones: [zone()], forensics: bundleWithCycle(1) }),
    ]
  }

  it('carries no free-text field at all, which is the strongest form of the guarantee', () => {
    const PROSE_KEYS = ['title', 'description', 'why_it_matters', 'statement', 'summary', 'text', 'note', 'label']
    everyOutcome().forEach((r: any) => {
      PROSE_KEYS.forEach((k) => expect(r, k).not.toHaveProperty(k))
      // Every string it does carry is a value from a frozen vocabulary, an
      // id, or the period verbatim off the questionnaire.
      const vocab = new Set<string>([
        ...TEMPORAL_RELATIONSHIPS, ...INSUFFICIENT_REASONS, ...PARAMETER_RELEVANCE,
        ...TIME_LINKED_PERIODS, DETECTOR,
      ])
      for (const [k, v] of Object.entries(r)) {
        if (typeof v !== 'string' || k === 'id' || k === 'subject' || k === 'param') continue
        expect(vocab.has(v), `${k}=${v}`).toBe(true)
      }
    })
  })

  it('states no cause, no ranking and no confidence, in the object or the line', () => {
    const CAUSAL = /caused|because|due to|explains|responsible|attribut|consistent with|indicat|suggest|likely|confidence|strength|probab/i
    everyOutcome().forEach((r: any) => {
      expect(JSON.stringify(r)).not.toMatch(CAUSAL)
      const line = patternAgreement(r)
      if (line) expect([line.label, ...line.parts].join(' ')).not.toMatch(CAUSAL)
    })
  })

  it('publishes counts of days and never a percentage', () => {
    everyOutcome().forEach((r: any) => {
      expect(JSON.stringify(r)).not.toMatch(/%|percent/i)
      expect(Number.isInteger(r.observed_days.monitored)).toBe(true)
      const line = patternAgreement(r)
      if (line) expect(line.parts.join(' ')).not.toMatch(/%|percent/i)
    })
  })

  it('renders a line only for a conclusive answer, so the common case stays calm', () => {
    const b: any = bundleWithCycle(4, 14)
    const overlap: any = cycleOf(detectTemporalRelationships({ zones: [zone()], forensics: b }), b)
    expect(patternAgreement(overlap)!.parts[0]).toBe('afternoon')
    expect(patternAgreement(overlap)!.parts[1]).toMatch(/^pattern occurred then on \d+ of \d+ days?$/)
    const mismatch: any = cycleOf(detectTemporalRelationships({ zones: [zone({ sy_time: 'Morning' })], forensics: b }), b)
    expect(patternAgreement(mismatch)!.parts[1]).toMatch(/none of them then$/)
    // Insufficient renders nothing rather than "not comparable" on every card.
    const ambiguous: any = detectTemporalRelationships({ zones: [zone(), zone({ zid: 'z-2' })], forensics: b })[0]
    expect(patternAgreement(ambiguous)).toBeNull()
    expect(patternAgreement(null as never)).toBeNull()
  })
})

describe('it changes nothing else', () => {
  it('is derived, stable across runs, and excludes the clock from identity', () => {
    const a = JSON.stringify(run({ generatedAt: '2026-09-14T08:00:00.000Z' }).map((r: any) => relationshipIdentity(r)))
    const b = JSON.stringify(run({ generatedAt: '2027-01-01T00:00:00.000Z' }).map((r: any) => relationshipIdentity(r)))
    expect(a).toBe(b)
    expect(run()[0].provenance.detector).toBe(DETECTOR)
    expect(evidenceRelationship({ detector: 'd', relationship: 'temporal_overlap', reason: 'x' }).reason).toBeNull()
    expect(Object.isFrozen(run()[0])).toBe(true)
  })

  it('reaches no report — the monitoring model is identical either way', () => {
    const session = { datasets: [{ id: 'primary', role: 'indoor', label: 'Indoor', params: ['co2'], points: [], units: { co2: 'ppm' }, summary: { start: T0, end: T0 + DAY } }], utcOffsetMin: 0 }
    const plain: any = buildMonitoringReportModel(session as never, {})
    const withRels: any = buildMonitoringReportModel(session as never, { evidenceRelationships: run() } as never)
    expect(JSON.stringify(withRels)).toBe(JSON.stringify(plain))
    expect(JSON.stringify(plain)).not.toMatch(/temporal_overlap|temporal_mismatch/)
  })

  it('emits one answer per pattern, so a consumer looks up rather than infers silence', () => {
    const b: any = bundleWithCycle(4)
    const rels = detectTemporalRelationships({ zones: [zone()], forensics: b })
    expect(rels).toHaveLength(b.patterns.length)
    expect(relationshipsByPattern(rels).size).toBe(b.patterns.length)
    expect(relationshipsByPattern(null as never).size).toBe(0)
    // Every relationship points at a pattern that exists in this bundle.
    const known = new Set(b.patterns.map((p: any) => p.id))
    rels.forEach((r: any) => expect(known.has(r.subject)).toBe(true))
  })
})
