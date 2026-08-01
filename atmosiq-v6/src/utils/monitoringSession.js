/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * monitoringSession — the root entity for Logger Studio.
 *
 * A consultant does not think in uploaded files; they think in a monitoring
 * CAMPAIGN: "three days in Suite 300, one logger plus an outdoor baseline,
 * these events, this instrument, that calibration." Treating the CSV as the
 * primary object forces every one of those facts to be re-entered per file
 * and makes repeat monitoring of the same space impossible to represent.
 *
 * So the session is the root and the dataset hangs off it:
 *
 *   MonitoringSession
 *     ├── location            building / floor / room / zone / sensor position
 *     ├── objective           why monitoring was performed
 *     ├── instrument          make, serial, interval, firmware, timestamp source
 *     ├── calibration         a SNAPSHOT taken at session time (see below)
 *     ├── assessor / client   who produced it, who it is for
 *     ├── referenceProfiles   the yardstick chosen per parameter
 *     ├── occupancySchedule   marked occupied windows
 *     ├── events              annotated events (Appendix A + chart markers)
 *     ├── datasets            logger dataset(s), incl. the outdoor baseline
 *     ├── notes / photos      documentation
 *     ├── qa                  computed integrity results
 *     └── reports             what was generated, and from which data
 *
 * ── Two decisions that matter later ────────────────────────────────────
 *
 * 1. CALIBRATION IS A SNAPSHOT, not a live lookup. A report issued today must
 *    still show the calibration state as it was when the data was collected,
 *    even after the instrument is recalibrated next month. Re-deriving it at
 *    render time would silently rewrite history in an issued deliverable.
 *
 * 2. RESERVED SLOTS ARE DECLARED NOW. `photos`, `floorPlan`, and multiple
 *    `datasets` are part of the shape from the first version even though the
 *    first report does not populate them, so adding them later is a feature,
 *    not a migration.
 *
 * Pure data + pure helpers: no storage, no network, no React. Persistence is
 * the caller's business.
 */

import { parametersWithProfiles, defaultProfileId } from './referenceProfiles'

/**
 * Schema version for stored sessions. Bump when the shape changes in a way a
 * previously-saved session cannot satisfy; `normalizeMonitoringSession`
 * carries older ones forward.
 */
export const MONITORING_SESSION_VERSION = 1

/**
 * Event types offered when annotating a monitoring period. Deliberately the
 * operational facts an assessor actually records — each is something that
 * happened, observable and datable, never an inference about its effect.
 */
export const MONITORING_EVENT_TYPES = [
  { id: 'hvac_adjusted', label: 'HVAC adjusted' },
  { id: 'windows_opened', label: 'Windows opened' },
  { id: 'windows_closed', label: 'Windows closed' },
  { id: 'cleaning', label: 'Cleaning' },
  { id: 'filter_replaced', label: 'Filter replaced' },
  { id: 'occupancy_start', label: 'Occupancy started' },
  { id: 'occupancy_end', label: 'Occupancy ended' },
  { id: 'complaint', label: 'Complaint received' },
  { id: 'other', label: 'Other' },
]

/** How a dataset participates in the session. */
export const DATASET_ROLES = ['indoor', 'outdoor', 'zone']

const isNum = (v) => v != null && Number.isFinite(v)
const str = (v) => (typeof v === 'string' ? v : '')
const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

export function eventTypeLabel(id) {
  const t = MONITORING_EVENT_TYPES.find((e) => e.id === id)
  return t ? t.label : 'Other'
}

/** Default reference-profile selection: each parameter's first profile. */
export function defaultReferenceProfiles() {
  const out = {}
  parametersWithProfiles().forEach((p) => { out[p] = defaultProfileId(p) })
  return out
}

/**
 * A new, empty session.
 *
 * Everything is present and empty rather than absent, so a consumer never has
 * to distinguish "not captured yet" from "this shape doesn't have that".
 *
 * @param {object} [seed] values to apply over the defaults (e.g. instrument
 *   and assessor autofilled from the user's profile)
 */
export function createMonitoringSession(seed = {}) {
  const base = {
    version: MONITORING_SESSION_VERSION,
    id: str(seed.id) || null,
    createdAt: str(seed.createdAt) || null,
    updatedAt: str(seed.updatedAt) || null,

    objective: str(seed.objective),

    location: {
      building: '', floor: '', room: '', zone: '', sensorPosition: '', elevation: '',
      ...obj(seed.location),
    },

    // Autofilled from the assessor's profile, overridable per session.
    instrument: {
      make: '', model: '', serial: '', firmware: '',
      loggingIntervalSec: null,
      timestampSource: 'device',
      ...obj(seed.instrument),
    },

    // Snapshot — see the header note. Captured, not looked up at render time.
    calibration: {
      date: null, dueDate: null, status: null, capturedAt: null,
      ...obj(seed.calibration),
    },

    assessor: { name: '', company: '', credentials: '', ...obj(seed.assessor) },
    client: { preparedFor: '', ...obj(seed.client) },

    referenceProfiles: { ...defaultReferenceProfiles(), ...obj(seed.referenceProfiles) },
    customRanges: obj(seed.customRanges),

    // Site-local offset from UTC. Explicit so every rendered timestamp and
    // hour-of-day profile is reproducible on any machine.
    utcOffsetMin: isNum(seed.utcOffsetMin) ? seed.utcOffsetMin : 0,

    occupancySchedule: arr(seed.occupancySchedule),
    events: arr(seed.events).map(normalizeEvent).filter(Boolean),

    datasets: arr(seed.datasets),

    // Reserved: declared now so adding them later is additive.
    photos: arr(seed.photos),
    floorPlan: seed.floorPlan || null,

    notes: str(seed.notes),
    qa: obj(seed.qa),
    reports: arr(seed.reports),
  }
  return base
}

/** One annotated event, or null when it carries no usable timestamp. */
export function normalizeEvent(raw) {
  const e = obj(raw)
  const t = isNum(e.t) ? e.t : (typeof e.t === 'string' && e.t ? Date.parse(e.t) : NaN)
  if (!isNum(t)) return null
  const type = MONITORING_EVENT_TYPES.some((x) => x.id === e.type) ? e.type : 'other'
  return {
    id: str(e.id) || null,
    t,
    type,
    // A custom label wins; otherwise the type's own label, so an event always
    // prints something meaningful in Appendix A and on the chart marker.
    label: str(e.label) || eventTypeLabel(type),
    note: str(e.note),
  }
}

/**
 * Load a stored session defensively.
 *
 * A session may have been saved by an older build, hand-edited, or partially
 * synced. Anything unreadable degrades to its default rather than throwing —
 * a monitoring campaign should never be lost because one field is malformed.
 */
export function normalizeMonitoringSession(raw) {
  const s = obj(raw)
  const session = createMonitoringSession(s)
  session.version = MONITORING_SESSION_VERSION
  session.events = arr(s.events).map(normalizeEvent).filter(Boolean).sort((a, b) => a.t - b.t)
  session.occupancySchedule = arr(s.occupancySchedule)
    .filter((w) => w && isNum(w.start) && isNum(w.end) && w.end > w.start)
    .sort((a, b) => a.start - b.start)
  return session
}

/** Add an event, keeping the list in chronological order. */
export function addEvent(session, event) {
  const e = normalizeEvent(event)
  if (!e) return session
  return { ...session, events: [...arr(session && session.events), e].sort((a, b) => a.t - b.t) }
}

export function removeEvent(session, id) {
  return { ...session, events: arr(session && session.events).filter((e) => e.id !== id) }
}

/** The dataset acting as the outdoor baseline, if one was captured. */
export function outdoorDataset(session) {
  return arr(session && session.datasets).find((d) => d && d.role === 'outdoor') || null
}

/** The primary indoor dataset the report is written about. */
export function primaryDataset(session) {
  const ds = arr(session && session.datasets)
  return ds.find((d) => d && d.role === 'indoor') || ds[0] || null
}

/**
 * Whether the session has what the report needs, and what is missing.
 *
 * Advisory only — it mirrors the platform's standing rule that AtmosFlow
 * surfaces gaps but never hard-blocks a deliverable. The credentialed
 * assessor decides whether to issue.
 *
 * @returns {{ready:boolean, missing:{field:string, label:string}[]}}
 */
export function sessionReadiness(session) {
  const s = obj(session)
  const missing = []
  const need = (cond, field, label) => { if (!cond) missing.push({ field, label }) }

  need(arr(s.datasets).length > 0, 'datasets', 'A logger dataset')
  need(str(s.objective).trim().length > 0, 'objective', 'Monitoring objective')
  need(str(obj(s.location).building).trim().length > 0, 'location.building', 'Building')
  need(str(obj(s.location).room).trim().length > 0, 'location.room', 'Room or area')
  need(str(obj(s.instrument).make).trim().length > 0 || str(obj(s.instrument).model).trim().length > 0,
    'instrument.make', 'Instrument make or model')
  need(!!obj(s.calibration).date, 'calibration.date', 'Instrument calibration date')
  need(str(obj(s.assessor).name).trim().length > 0, 'assessor.name', 'Assessor name')

  return { ready: missing.length === 0, missing }
}

/**
 * Record that a report was generated from this session.
 *
 * Stores the dataset hash and versions alongside the output so a report can
 * later be tied back to the exact data and code that produced it — the
 * traceability the report's own metadata block promises.
 */
export function recordGeneratedReport(session, report) {
  const r = obj(report)
  const entry = {
    id: str(r.id) || null,
    edition: r.edition === 'technical' ? 'technical' : 'client',
    format: str(r.format) || 'docx',
    generatedAt: str(r.generatedAt) || null,
    datasetHash: str(r.datasetHash) || null,
    reportVersion: str(r.reportVersion) || null,
    softwareVersion: str(r.softwareVersion) || null,
  }
  return { ...session, reports: [...arr(session && session.reports), entry] }
}
