/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Field contract registry — the one place that answers, for any
 * assessment field: does it exist, what may it hold, and which record
 * does it live on.
 *
 * ── Why ────────────────────────────────────────────────────────────────
 * Six places independently decided which field names matter, and none of
 * them reconciled:
 *
 *   1. questions.js            — the wizard schema (117 ids)
 *   2. buildingProfiles.js     — per-subtype additional fields (6 more)
 *   3. sufficiency.js          — CATEGORY_REQUIREMENTS
 *   4. observable-fields.js    — what Jasper may write
 *   5. MobileApp.setQSField    — a literal array routing quick-start
 *                                answers to building vs presurvey
 *   6. the engines themselves  — every `d.co2` and `str(z, 'sa')`
 *
 * Nothing checked them against each other, so a rule could read a field
 * that had never existed and every test still passed. That is not a
 * hypothetical: `hypothesisVoc` spent its whole life reading `oi`, a
 * numeric odor intensity absent from every schema, so its intensity
 * branch was unreachable. `hypothesisVentilation` read `sa` and `od` off
 * the zone when both are building-scoped, so two of its three triggers
 * never fired. `add_zone_note` wrote `nt`, which nothing declares and
 * nothing reads. Three more turned up the first time this registry's
 * scan ran — see KNOWN_UNRESOLVED_READS.
 *
 * ── What this is ───────────────────────────────────────────────────────
 * A DERIVED index, not a new source of truth. It reads questions.js and
 * buildingProfiles.js and adds the one fact neither can express: which
 * record a field is stored on. Scope is not a judgement call — it falls
 * out of which questionnaire declares the field, and
 * `tests/constants/field-registry.test.ts` proves the derivation
 * reproduces the routing the app already performs, id for id.
 *
 * Deriving rather than redeclaring is deliberate. A registry that
 * restated the schema would be a seventh place to disagree with it.
 *
 * ── What it enforces ───────────────────────────────────────────────────
 * The test beside it is the actual layer. It reads the engine sources and
 * fails when an engine reads a field this registry does not declare, or
 * reads a building-scoped field off a raw zone record. Both defect
 * classes above become unshippable rather than undetectable.
 *
 * Browser-safe: pure data, no filesystem, no engine imports. The static
 * analysis lives in the test, where it belongs.
 */

import {
  Q_PRESURVEY, Q_QUICKSTART, Q_DETAILS, Q_BUILDING, Q_ZONE, SENSOR_FIELDS,
} from './questions.js'
import { BUILDING_PROFILES } from '../engines/buildingProfiles.js'

/** Which record the value is stored on. */
export const SCOPE_PRESURVEY = 'presurvey'
export const SCOPE_BUILDING = 'building'
export const SCOPE_ZONE = 'zone'

/** Wizard control type → what the field can hold. */
const KIND_BY_CONTROL = {
  num: 'number',
  ch: 'choice',
  multi: 'multi',
  combo: 'combo',
  text: 'text',
  ta: 'text',
  date: 'date',
  time: 'time',
}

const QUESTIONNAIRES = [
  ['Q_PRESURVEY', Q_PRESURVEY],
  ['Q_QUICKSTART', Q_QUICKSTART],
  ['Q_DETAILS', Q_DETAILS],
  ['Q_BUILDING', Q_BUILDING],
  ['Q_ZONE', Q_ZONE],
]

/**
 * Zone-scoped ids: everything the per-zone panel asks, every instrument
 * reading, and every field a building profile adds to a zone subtype.
 */
function collectZoneIds() {
  const ids = new Set()
  for (const q of Q_ZONE) ids.add(q.id)
  for (const f of SENSOR_FIELDS) ids.add(f.id)
  for (const profile of Object.values(BUILDING_PROFILES || {})) {
    for (const list of Object.values(profile?.additionalFields || {})) {
      for (const f of list || []) if (f && f.id) ids.add(f.id)
    }
  }
  return ids
}

const ZONE_IDS = collectZoneIds()

/**
 * Scope, derived rather than declared.
 *
 * Zone questions and instrument readings are zone-scoped. Of what
 * remains, the `ps_` prefix marks the pre-survey record and everything
 * else lives on the building. No id is claimed by both a zone and a
 * non-zone questionnaire, so the rule is total — the test asserts that
 * absence of conflict rather than trusting it.
 */
function scopeOf(id) {
  if (ZONE_IDS.has(id)) return SCOPE_ZONE
  if (id.startsWith('ps_')) return SCOPE_PRESURVEY
  return SCOPE_BUILDING
}

function contractFromQuestion(q, source) {
  const opts = Array.isArray(q.opts) && q.opts.length ? Object.freeze(q.opts.slice()) : null
  return {
    id: q.id,
    label: (q.q || q.id).replace(/\?$/, ''),
    scope: scopeOf(q.id),
    kind: KIND_BY_CONTROL[q.t] || 'text',
    /**
     * The raw wizard control. `kind` collapses `ta` and `text` into one value,
     * which is right for validation and wrong for anything that needs to tell
     * a paragraph from a name: `ps_complaint_narrative` and
     * `ps_recipient_name` are both `kind: 'text'`. Consumers that carry free
     * narrative to a model filter on `control === 'ta'`, so a new textarea
     * question is picked up without editing them.
     */
    control: q.t || 'text',
    opts,
    unit: q.u || null,
    /**
     * True when the option list is filled in at runtime from the building
     * profile. Its values cannot be validated against this registry.
     */
    dynamicOptions: q.profileDynamic === true,
    conditional: !!q.cond,
    required: q.req === 1,
    outdoor: q.outdoor === true,
    sources: [source],
  }
}

function buildRegistry() {
  const byId = new Map()
  const remember = (contract) => {
    const existing = byId.get(contract.id)
    if (!existing) { byId.set(contract.id, contract); return }
    // Same field asked on more than one screen. Keep the first definition
    // and record where else it appears; a divergence between the two is a
    // schema bug, and the test reports it rather than this silently
    // picking a winner.
    existing.sources.push(contract.sources[0])
  }

  for (const [source, list] of QUESTIONNAIRES) {
    for (const q of list) {
      // `_sensors` is a layout placeholder for the instrument panel, not
      // a field anything stores.
      if (!q || !q.id || q.id.startsWith('_')) continue
      remember(contractFromQuestion(q, source))
    }
  }
  for (const f of SENSOR_FIELDS) {
    remember({
      id: f.id,
      label: f.label || f.id,
      scope: SCOPE_ZONE,
      kind: 'number',
      opts: null,
      unit: f.u || null,
      dynamicOptions: false,
      conditional: false,
      required: false,
      outdoor: f.outdoor === true,
      sources: ['SENSOR_FIELDS'],
    })
  }
  for (const [profileKey, profile] of Object.entries(BUILDING_PROFILES || {})) {
    for (const [subtype, list] of Object.entries(profile?.additionalFields || {})) {
      for (const q of list || []) {
        if (!q || !q.id) continue
        remember({
          ...contractFromQuestion(q, `BUILDING_PROFILES.${profileKey}.${subtype}`),
          scope: SCOPE_ZONE,
        })
      }
    }
  }

  return Object.freeze(
    [...byId.values()]
      .map((c) => Object.freeze({ ...c, sources: Object.freeze(c.sources) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  )
}

/**
 * The builder, re-exported for the one test that must prove the registry
 * DERIVES from `BUILDING_PROFILES.additionalFields` rather than carrying a
 * fixed list. That test used to assert the six data-center field ids by
 * name; with that profile gone no profile declares any additional fields,
 * so the only way to keep the assertion honest is to inject one and
 * rebuild. Not part of the public surface — consumers read FIELD_REGISTRY.
 */
export const __buildRegistryForTest = buildRegistry

/** Every declared assessment field, sorted by id. */
export const FIELD_REGISTRY = buildRegistry()

const BY_ID = new Map(FIELD_REGISTRY.map((f) => [f.id, f]))

/** The contract for a field, or null when nothing declares it. */
export function getField(id) {
  return BY_ID.get(String(id || '')) || null
}

export function isDeclaredField(id) {
  return BY_ID.has(String(id || ''))
}

export function fieldsInScope(scope) {
  return FIELD_REGISTRY.filter((f) => f.scope === scope)
}

/**
 * Building-scoped ids, for routing an answer to the right record.
 * `MobileApp.setQSField` reads this instead of the literal array it used
 * to carry — the array was a sixth place to get the routing wrong, and a
 * field added to Q_BUILDING but forgotten there would have been written
 * into the pre-survey record and read by nothing.
 */
export const BUILDING_SCOPED_IDS = Object.freeze(
  fieldsInScope(SCOPE_BUILDING).map((f) => f.id),
)

/**
 * Names an engine reads that no schema declares.
 *
 * Every entry is a read that cannot return a value: the engine asks for a
 * key nothing ever writes, so the branch behind it is unreachable. They
 * are enumerated rather than fixed here because each fix is a behaviour
 * change — restoring a dormant critical trigger, or deleting a branch —
 * and those belong in their own change with their own review, not
 * smuggled into the registry that found them.
 *
 * The test asserts the scan finds EXACTLY this set. A new dead read fails
 * the build; removing one from the source means deleting it here too.
 */
/**
 * Keys the APP computes and hands to an engine, which are not fields an
 * assessor ever enters. They are not in any questionnaire and never will
 * be, so the "must be a declared field" check has to know about them —
 * but they are enumerated rather than pattern-matched, because the whole
 * point of this layer is that an unexplained engine read is a defect.
 */
export const INJECTED_KEYS = Object.freeze([
  Object.freeze({
    key: 'assessmentDate',
    injected_by: 'src/components/MobileApp.jsx',
    reason:
      'The survey date rides in on the building object so scoreZone applies the thermal-comfort season of the day the walkthrough happened, not the day the draft was reopened.',
  }),
])

export const KNOWN_UNRESOLVED_READS = Object.freeze([
  Object.freeze({
    field: 'oi',
    read_by: 'src/engine/hypotheses.ts',
    reason:
      'Legacy numeric odor intensity, kept as an accepted alias so fixtures and any caller passing the merged numeric shape keep working. The schema field is `op`, which the rule now reads. Deliberate, not a defect.',
  }),
  Object.freeze({
    field: 'pm10',
    read_by: 'src/engine/report/parameter-ranges.ts',
    reason:
      'LEGACY_FIELD maps a pm10 parameter to a `pm10` zone field. No questionnaire collects one, so the PM10 range is always empty and the parameter never renders. Harmless today, but it is a report parameter with no way to be populated.',
  }),
  Object.freeze({
    field: 'hazard_visible',
    read_by: 'src/engines/escalation.js',
    reason:
      'Guards the `visible_hazard` critical escalation trigger. No schema declares the field, so that trigger has never been able to fire.',
  }),
])
