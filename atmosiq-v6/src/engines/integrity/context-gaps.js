/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Field integrity — context the walkthrough recorded a question about but
 * never recorded an answer for.
 *
 * One rule in this phase, chosen because it is the narrowest thing that
 * exercises the whole path: a zone reports symptoms worst at a particular
 * time of day, and nothing in the record says whether the zone is normally
 * occupied then.
 *
 * ── Why this one ───────────────────────────────────────────────────────
 * `sy_time` is a time-linked claim about people. Read against an occupied
 * room and an empty one it means different things, and the record cannot
 * currently say which. `oc` is a single occupant count for the zone and
 * carries no time at all, so it does not answer the question. That is a
 * genuine hole, and it is the one hole where a deterministic rule can name
 * exactly the field that fills it.
 *
 * ── The rule this module inherits ──────────────────────────────────────
 * `CONTEXT_RULES` in `forensicPatterns.js`:
 *
 *     a contextual input is only named where it would MATERIALLY CHANGE
 *     the reading of one specific pattern … a session-level checklist
 *     would complain on every analysis ever run, and an assessor would
 *     learn to skip the whole section inside a week.
 *
 * So this fires ONLY on the three answers that name a part of the day.
 * "All day", "No pattern" and "Unknown" describe no period, so knowing
 * who is in the room at 2 PM settles nothing about them and no finding is
 * raised. A zone with no complaints raises nothing at all.
 *
 * ── Blank is an omission; "Unknown" is an answer ───────────────────────
 * The finding exists to get a question asked, so it stops the moment the
 * question has been. Selecting "Unknown" means the assessor asked and the
 * information is not available, which is context they established, and
 * continuing to list it as an unaddressed omission would train them to
 * ignore the list. Whether an unavailable answer becomes a stated
 * limitation in the report is a separate question and a later phase; it
 * is not this detector's to decide.
 *
 * ── What it will not do ────────────────────────────────────────────────
 * It never infers causation between occupancy, carbon dioxide and
 * symptoms. It states that a period was reported and that the occupancy
 * context for it is absent. Logger evidence, when there is any, is
 * attached as SUPPORTING evidence and never as a reason: its absence
 * cannot create this finding and cannot strengthen it, because an
 * assessment with no logger deployed is a normal assessment.
 */

import { integrityFinding, fieldEvidenceId } from './finding.js'
import { forensicEvidenceForPeriod, COMPLAINT_PERIOD_HOURS } from './forensic-evidence.js'

/** Stable detector name. Part of every id this module mints. */
export const DETECTOR = 'complaint_period_occupancy'

/** The `cx` value that means this zone has occupant complaints. */
export const COMPLAINTS_REPORTED = 'Yes — complaints reported'

/**
 * The `sy_time` answers that name a period. Derived from the part-of-day
 * vocabulary rather than restated, so the detector and the forensic
 * matcher cannot disagree about which answers are time-linked.
 */
export const TIME_LINKED_PERIODS = Object.freeze(Object.keys(COMPLAINT_PERIOD_HOURS))

/** The field whose absence raises the finding, and whose presence clears it. */
export const RESOLVING_FIELD = 'sy_occ'

const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const str = (v) => (typeof v === 'string' ? v.trim() : '')

/**
 * A zone's identity for a finding, and its name for a sentence.
 *
 * `zid` is the opaque handle every zone carries, so it is what an id is
 * built from: renaming a zone must not mint a new finding about the same
 * room. The NAME is for the reader, and `zone-gaps.js` is right that a
 * label should never be an id.
 */
const zoneKey = (z, i) => str(obj(z).zid) || `zone-${i + 1}`
const zoneName = (z, i) => str(obj(z).zn) || `Zone ${i + 1}`

/** "Evening / night" reads better mid-sentence in lower case. */
const periodPhrase = (period) => str(period).toLowerCase()

/**
 * Find the zones whose time-linked complaint has no occupancy context.
 *
 * Pure and synchronous. Safe to call on a partial draft: anything it
 * cannot read yields no finding rather than a guess, so adding this
 * detector can never make a previously clean assessment report something
 * it cannot explain.
 *
 * @param {object} assessment the live draft, `{ zones, ... }`
 * @param {object} [opts]
 * @param {object|null} [opts.forensics] a BUILT forensic bundle, or null.
 *   Read-only, optional, and never required for a finding to exist.
 * @param {boolean} [opts.onSite=true] is the assessor still in the
 *   building? Decides actionability and nothing else.
 * @param {string} [opts.generatedAt] ISO. Provenance only, never identity.
 * @returns {object[]} integrity findings, one per affected zone
 */
export function detectComplaintContextGaps(assessment, opts = {}) {
  const zones = arr(obj(assessment).zones)
  if (!zones.length) return []
  const onSite = opts.onSite !== false
  const out = []

  zones.forEach((zone, i) => {
    const z = obj(zone)
    if (str(z.cx) !== COMPLAINTS_REPORTED) return
    const period = str(z.sy_time)
    if (!TIME_LINKED_PERIODS.includes(period)) return
    // Answered, in any way, including "Unknown". The question has been put.
    if (str(z[RESOLVING_FIELD])) return

    const key = zoneKey(z, i)
    const name = zoneName(z, i)
    const evidence = [
      fieldEvidenceId(key, 'cx'),
      fieldEvidenceId(key, 'sy_time'),
    ]

    // Supporting only. Absent forensics changes nothing about whether this
    // finding exists, which is the whole point of computing it afterwards.
    const forensic = forensicEvidenceForPeriod(opts.forensics, period)
    if (forensic) evidence.push(...forensic.patternIds, ...forensic.occurrenceIds)

    out.push(integrityFinding({
      detector: DETECTOR,
      issue_type: 'missing_context',
      severity: 'advisory',
      source_layer: 'field_integrity',
      actionability: onSite ? 'on_site_now' : 'before_signoff',
      zone_ids: [key],
      evidence_ids: evidence,
      parameter_ids: forensic ? forensic.parameterIds : [],
      time_window: forensic
        ? { start: forensic.start, end: forensic.end, basis: 'forensic_occurrence' }
        : null,
      // Identity deliberately excludes the supporting evidence and the
      // window it produces. Uploading a logger file later must not mint a
      // second id for a gap that has not changed. See `integrityFinding`.
      identity: { issue_type: 'missing_context', zone_ids: [key], subject: period },
      title: 'Occupancy not documented for the reported symptom period',
      description: `Symptoms in ${name} are reported as worst in the ${periodPhrase(period)}, and the record does not say whether the zone is normally occupied then.`,
      why_it_matters: 'A time-of-day symptom pattern reads differently depending on whether people are present. Without the occupancy context for that period, the pattern cannot be compared against when the space is in use.',
      inputs_fingerprint: forensic ? forensic.fingerprint : null,
      generated_at: opts.generatedAt || null,
    }))
  })

  return out
}

/**
 * The finding as one line for the "before you leave" list.
 *
 * The Zone-complete sheet renders `{ id, label, why }`, so this is the
 * projection into that shape and nothing more. It carries no `kind`,
 * deliberately: `kind` is what `interruptsZoneCompletion` reads, and an
 * advisory finding must not start gating zone completion.
 */
export function asZoneGapLine(finding) {
  const f = obj(finding)
  return { id: f.id, label: f.title, why: f.description }
}
