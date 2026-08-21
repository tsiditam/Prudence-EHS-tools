/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Observable fields — what Jasper may propose writing into an assessment,
 * and how a proposed value is validated.
 *
 * ── Why this exists ────────────────────────────────────────────────────
 * The chat could propose two things: navigate somewhere, or append a free
 * text note. No engine reads free text, so an accepted note changed
 * nothing — no score, no finding, no differential. An investigation that
 * only advances when the RECORD advances therefore could not advance from
 * a conversation at all. This is the vocabulary that closes that loop.
 *
 * ── The two rules ──────────────────────────────────────────────────────
 * 1. A field is writable only if it exists in `questions.js`. The allowed
 *    values, the label and the unit are read from that schema at module
 *    load — never copied here. A hand-copied option list is how you end up
 *    writing "lots of mold" into a field whose engine matches on
 *    "Extensive", and the write looks like it worked.
 *
 * 2. A field is writable only if an engine actually reads it. Writing a
 *    field nothing consumes is the note problem again with more steps, so
 *    `tests/constants/observable-fields.test.ts` greps the engines and
 *    fails on any entry no engine mentions.
 *
 * ── What this is not ───────────────────────────────────────────────────
 * The numeric bounds below are instrument plausibility — the range a real
 * reading can physically fall in. They are data-entry sanity and carry no
 * interpretive meaning: nothing here decides whether a value is elevated,
 * compliant, or a finding. That judgement belongs to the criterion
 * registry and the scoring engine, and duplicating any part of it here
 * would make this a second opinion.
 */

import { Q_ZONE, Q_BUILDING, Q_DETAILS, SENSOR_FIELDS } from './questions.js'

/**
 * Scope decides which record the value lands in. `zone` writes the active
 * zone; `building` writes the building record, which `scoreZone` merges
 * into every zone. Getting this wrong writes a value the engine reads from
 * the other shape and never sees.
 */
export const SCOPE_ZONE = 'zone'
export const SCOPE_BUILDING = 'building'

/**
 * The allowlist. Ordered by how an assessor would think of them rather
 * than by schema order.
 *
 * Deliberately excluded, and why:
 *   • zn / sf / oc / su — zone identity and geometry. Setup, not
 *     observation, and `oc`/`sf` feed the ventilation calculation, so a
 *     mis-transcribed occupant count moves a number silently.
 *   • meas_* / pid_* — provenance metadata about how a reading was taken.
 *     It has to come from the person who took it.
 *   • znt — free text, which is what this exists to replace.
 */
const WRITABLE = [
  // ── Instrument readings ──────────────────────────────────────────────
  { id: 'co2',  scope: SCOPE_ZONE, min: 0, max: 50000 },
  { id: 'co2o', scope: SCOPE_ZONE, min: 0, max: 50000 },
  { id: 'tf',   scope: SCOPE_ZONE, min: -40, max: 150 },
  { id: 'tfo',  scope: SCOPE_ZONE, min: -60, max: 150 },
  { id: 'rh',   scope: SCOPE_ZONE, min: 0, max: 100 },
  { id: 'rho',  scope: SCOPE_ZONE, min: 0, max: 100 },
  { id: 'pm',   scope: SCOPE_ZONE, min: 0, max: 10000 },
  { id: 'pmo',  scope: SCOPE_ZONE, min: 0, max: 10000 },
  { id: 'co',   scope: SCOPE_ZONE, min: 0, max: 2000 },
  { id: 'tv',   scope: SCOPE_ZONE, min: 0, max: 100000 },
  { id: 'tvo',  scope: SCOPE_ZONE, min: 0, max: 100000 },
  { id: 'hc',   scope: SCOPE_ZONE, min: 0, max: 100 },
  // ── Ventilation quantification ───────────────────────────────────────
  { id: 'cfm_person', scope: SCOPE_ZONE, min: 0, max: 500 },
  { id: 'ach',        scope: SCOPE_ZONE, min: 0, max: 100 },
  // ── Zone observations ────────────────────────────────────────────────
  { id: 'vd', scope: SCOPE_ZONE },
  { id: 'wd', scope: SCOPE_ZONE },
  { id: 'mi', scope: SCOPE_ZONE },
  { id: 'op', scope: SCOPE_ZONE },
  { id: 'ot', scope: SCOPE_ZONE },
  { id: 'tc', scope: SCOPE_ZONE },
  { id: 'hp', scope: SCOPE_ZONE },
  { id: 'path_pressure',  scope: SCOPE_ZONE },
  { id: 'path_crosstalk', scope: SCOPE_ZONE },
  { id: 'src_internal',   scope: SCOPE_ZONE },
  { id: 'src_adjacent',   scope: SCOPE_ZONE },
  // ── Occupant reports ─────────────────────────────────────────────────
  { id: 'cx', scope: SCOPE_ZONE },
  { id: 'sy', scope: SCOPE_ZONE },
  { id: 'sr', scope: SCOPE_ZONE },
  { id: 'ac', scope: SCOPE_ZONE },
  { id: 'cc', scope: SCOPE_ZONE },
  // ── Building systems ─────────────────────────────────────────────────
  { id: 'sa', scope: SCOPE_BUILDING },
  { id: 'od', scope: SCOPE_BUILDING },
  { id: 'fc', scope: SCOPE_BUILDING },
  { id: 'fm', scope: SCOPE_BUILDING },
  { id: 'dp', scope: SCOPE_BUILDING },
  { id: 'hm', scope: SCOPE_BUILDING },
]

// Schema lookup. Later sources do not override earlier ones, so a field
// defined in more than one questionnaire keeps its first definition —
// they are the same field, and Q_ZONE / Q_BUILDING are the canonical
// homes. SENSOR_FIELDS is shaped differently (label + u, no opts) and is
// normalised on the way in.
const SCHEMA = new Map()
for (const f of SENSOR_FIELDS) {
  SCHEMA.set(f.id, { label: f.label, kind: 'number', unit: f.u || null, opts: null })
}
for (const q of [...Q_ZONE, ...Q_BUILDING, ...Q_DETAILS]) {
  if (SCHEMA.has(q.id)) continue
  SCHEMA.set(q.id, {
    label: (q.q || q.id).replace(/\?$/, ''),
    kind: q.t === 'num' ? 'number' : q.t === 'multi' ? 'multi' : 'choice',
    unit: q.u || null,
    opts: Array.isArray(q.opts) && q.opts.length ? q.opts.slice() : null,
  })
}

/**
 * The resolved catalog: schema truth joined to the allowlist. Frozen —
 * a consumer that mutates it would be editing the assessment vocabulary
 * for every other consumer in the process.
 */
export const OBSERVABLE_FIELDS = Object.freeze(
  WRITABLE.map((w) => {
    const schema = SCHEMA.get(w.id)
    if (!schema) {
      // A field in the allowlist that questions.js does not define. Left
      // as an explicit marker rather than dropped so the test that pins
      // the catalog against the schema fails loudly instead of the field
      // quietly disappearing from what Jasper can record.
      return Object.freeze({ id: w.id, scope: w.scope, label: w.id, kind: 'unknown', unit: null, opts: null })
    }
    return Object.freeze({
      id: w.id,
      scope: w.scope,
      label: schema.label,
      kind: schema.kind,
      unit: schema.unit,
      opts: schema.opts ? Object.freeze(schema.opts) : null,
      ...(w.min !== undefined ? { min: w.min } : {}),
      ...(w.max !== undefined ? { max: w.max } : {}),
    })
  }),
)

const BY_ID = new Map(OBSERVABLE_FIELDS.map((f) => [f.id, f]))

/** The field descriptor, or null when the id is not writable. */
export function getObservableField(id) {
  return BY_ID.get(String(id || '')) || null
}

/**
 * Render the catalog for a model prompt: one line per field with its
 * allowed values. Generated rather than written out, so the prompt cannot
 * drift from what the validator accepts.
 */
export function describeObservableFields() {
  return OBSERVABLE_FIELDS.map((f) => {
    const where = f.scope === SCOPE_BUILDING ? 'building' : 'zone'
    if (f.kind === 'number') {
      const unit = f.unit ? ` in ${f.unit}` : ''
      return `${f.id} — ${f.label}${unit} (${where}; number ${f.min}–${f.max})`
    }
    const many = f.kind === 'multi' ? '; one or more' : ''
    return `${f.id} — ${f.label} (${where}${many}): ${(f.opts || []).join(' | ')}`
  }).join('\n')
}

/** Case-insensitive, whitespace-tolerant match against the option list. */
function matchOption(opts, raw) {
  const want = String(raw).trim().toLowerCase().replace(/\s+/g, ' ')
  return opts.find((o) => o.toLowerCase().replace(/\s+/g, ' ') === want) || null
}

/**
 * Validate a proposed write.
 *
 * Returns `{ ok: true, field, value }` with the value NORMALISED to the
 * exact schema representation — the canonical option string, or a finite
 * number. Exactness is the point: `scoreZone` matches `mi` with
 * `.includes('Extensive')` and `sampling.js` compares `wd` with `===`, so
 * a value that is merely close is a value the engine will not act on, and
 * the assessor would have no way to tell.
 *
 * Never throws. Failure is `{ ok: false, error, message, ... }` so the
 * caller can hand the model something it can correct.
 */
export function validateObservation(fieldId, rawValue) {
  const field = getObservableField(fieldId)
  if (!field) {
    return {
      ok: false,
      error: 'unknown_field',
      message: `"${fieldId}" is not a field Jasper can record. Use one of the ids listed in the recordable-fields catalog.`,
    }
  }
  if (field.kind === 'unknown') {
    return {
      ok: false,
      error: 'field_not_in_schema',
      message: `"${fieldId}" is listed as recordable but is not defined in the assessment schema, so its allowed values cannot be checked.`,
    }
  }

  if (field.kind === 'number') {
    const n = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue).replace(/,/g, '').trim())
    if (!Number.isFinite(n)) {
      return {
        ok: false, error: 'not_a_number', field,
        message: `${field.label} takes a number${field.unit ? ` in ${field.unit}` : ''}. Received "${rawValue}".`,
      }
    }
    if (n < field.min || n > field.max) {
      return {
        ok: false, error: 'out_of_range', field,
        message: `${n}${field.unit ? ' ' + field.unit : ''} is outside the range a ${field.label} reading can fall in (${field.min}–${field.max}). Check the value with the assessor rather than recording it. This is an instrument-plausibility check, not a threshold — it says nothing about whether the reading is elevated.`,
      }
    }
    // Stored as a string: that is the shape the wizard writes and every
    // engine parses. Writing a raw number here would be a second shape
    // for the same field.
    return { ok: true, field, value: String(n) }
  }

  const opts = field.opts || []
  if (field.kind === 'multi') {
    const list = Array.isArray(rawValue) ? rawValue : [rawValue]
    const matched = []
    const unmatched = []
    for (const item of list) {
      const hit = matchOption(opts, item)
      if (hit) { if (!matched.includes(hit)) matched.push(hit) } else unmatched.push(String(item))
    }
    if (unmatched.length) {
      return {
        ok: false, error: 'invalid_option', field, allowed: opts,
        message: `${field.label} does not accept ${unmatched.map((u) => `"${u}"`).join(', ')}. Allowed values: ${opts.join(' | ')}.`,
      }
    }
    if (!matched.length) {
      return { ok: false, error: 'empty_value', field, allowed: opts, message: `${field.label} needs at least one value.` }
    }
    return { ok: true, field, value: matched }
  }

  const hit = matchOption(opts, rawValue)
  if (!hit) {
    return {
      ok: false, error: 'invalid_option', field, allowed: opts,
      message: `${field.label} does not accept "${rawValue}". Allowed values: ${opts.join(' | ')}.`,
    }
  }
  return { ok: true, field, value: hit }
}

/** Reader-facing rendering of a validated value, for the accept card. */
export function formatObservation(field, value) {
  if (!field) return String(value)
  if (Array.isArray(value)) return value.join(', ')
  if (field.kind === 'number' && field.unit) return `${value} ${field.unit}`
  return String(value)
}
