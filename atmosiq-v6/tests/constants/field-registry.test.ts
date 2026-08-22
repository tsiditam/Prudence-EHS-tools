/**
 * The field contract layer.
 *
 * The registry beside this file is only data. THIS is the layer: it reads
 * the engine sources and fails the build on the two defect classes that
 * kept getting through, both of which are invisible to a unit test
 * because each layer's own tests pass while the seam between them is
 * wrong.
 *
 *   1. An engine reads a field no schema declares. The read returns
 *      undefined forever and the branch behind it is unreachable.
 *      `hypothesisVoc` read `oi` this way for its whole life.
 *
 *   2. An engine reads a building-scoped field off a raw zone record.
 *      Same outcome, harder to see, because the field exists — just not
 *      on the object being read. `hypothesisVentilation` read `sa` and
 *      `od` this way and fired on symptoms alone.
 *
 * Both are now detectable by reading source, so neither can be added
 * again without someone being told.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

import {
  FIELD_REGISTRY, getField, isDeclaredField, fieldsInScope, BUILDING_SCOPED_IDS,
  KNOWN_UNRESOLVED_READS, INJECTED_KEYS, SCOPE_ZONE, SCOPE_BUILDING, SCOPE_PRESURVEY,
} from '../../src/constants/field-registry.js'
import {
  Q_PRESURVEY, Q_QUICKSTART, Q_DETAILS, Q_BUILDING, Q_ZONE, SENSOR_FIELDS,
} from '../../src/constants/questions.js'
import { OBSERVABLE_FIELDS } from '../../src/constants/observable-fields.js'
import { BUILDING_PROFILES } from '../../src/engines/buildingProfiles.js'
import { __buildRegistryForTest as buildFieldRegistry } from '../../src/constants/field-registry.js'

const SRC = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * Engines that read assessment data, and the SHAPE each one reads.
 *
 * `merged` files build `const d = { ...bldg, ...zone }` before reading,
 * so any scope is legitimate off `d`. `raw` files read the zone record as
 * it is stored, where a building-scoped field is simply not present —
 * that distinction is the whole of check 2, and it cannot be inferred
 * from the field name, only from how the file works.
 */
const ENGINES: ReadonlyArray<{ file: string; shape: 'merged' | 'raw' }> = [
  { file: 'src/engines/scoring.js', shape: 'merged' },
  { file: 'src/engines/causalChains.js', shape: 'merged' },
  // The pressurization module's co-occurrence detectors read the merged
  // record; its capture functions read the building and pre-survey
  // records through their own locals (`b.`, `p.`), which this scan does
  // not reach. Listed anyway so the detector fields — the ones that
  // decide whether the mechanism consolidates — are covered.
  { file: 'src/engines/pressurization.js', shape: 'merged' },
  { file: 'src/engines/sampling.js', shape: 'merged' },
  { file: 'src/engines/escalation.js', shape: 'raw' },
  { file: 'src/engine/hypotheses.ts', shape: 'raw' },
]

/**
 * `parameter-ranges.ts` reads zone data through LEGACY_FIELD / OUTDOOR_FIELD
 * rather than by literal property access, so the scan above finds nothing
 * in it. Those two maps ARE field-name declarations — a seventh place to
 * disagree — so they get checked as data instead.
 */
function parameterRangeFieldIds(): string[] {
  const code = strip(SRC('src/engine/report/parameter-ranges.ts'))
  const ids: string[] = []
  const legacy = code.match(/LEGACY_FIELD[^=]*=\s*\{([\s\S]*?)\n\}/)
  if (legacy) for (const m of legacy[1].matchAll(/\[([^\]]*)\]/g)) {
    for (const lit of m[1].matchAll(/'([a-z][a-zA-Z0-9_]*)'/g)) ids.push(lit[1])
  }
  const outdoor = code.match(/OUTDOOR_FIELD[^=]*=\s*\{([\s\S]*?)\n\}/)
  if (outdoor) for (const m of outdoor[1].matchAll(/:\s*'([a-z][a-zA-Z0-9_]*)'/g)) ids.push(m[1])
  return ids
}

/**
 * Identifiers that look like a field read but are not one — properties of
 * score objects, criterion hits and JS built-ins. Kept explicit: a silent
 * heuristic here would quietly excuse the next real dead read.
 */
const NOT_FIELDS = new Set([
  // JS / array / string
  'length', 'map', 'filter', 'some', 'every', 'find', 'join', 'push', 'slice',
  'includes', 'split', 'trim', 'replace', 'toLowerCase', 'toUpperCase', 'forEach',
  'reduce', 'concat', 'indexOf', 'keys', 'values', 'entries', 'flat', 'flatMap',
  'sort', 'test', 'match', 'startsWith', 'endsWith', 'padStart', 'toFixed',
  'toString', 'get', 'set', 'has', 'add',
  // Date methods, reached through d.assessmentDate.getTime()
  'getTime', 'getMonth', 'getDate', 'getFullYear',
  // Properties of the ZONE SCORE object, which scoreZone returns and
  // compositeScore then reads. Not intake fields: `zoneSubtype` is the
  // camelCase copy scoreZone makes of the `zone_subtype` field, and
  // reading it off a score is correct.
  'confidence', 'zoneName', 'cats', 'tot', 'band', 'criterion', 'statement',
  'severity', 'sev', 'label', 'value', 'status', 'id', 'name', 'type',
  'zoneSubtype', 'sufficiency', 'normalizedFrom', 'availableMax', 'partialScore',
  'insufficientCats', 'hvacAdminGap', 'weights', 'risk', 'rc',
])

interface Read { field: string; file: string; how: string }

/** Every field-shaped read in the engine sources, with how it was read. */
function scanReads(): Read[] {
  const out: Read[] = []
  const push = (field: string, file: string, how: string) => {
    if (NOT_FIELDS.has(field)) return
    if (!/^[a-z][a-zA-Z0-9_]{0,26}$/.test(field)) return
    out.push({ field, file, how })
  }
  for (const { file } of ENGINES) {
    const code = strip(SRC(file))
    // The merged record, and direct zone property access.
    for (const m of code.matchAll(/\bd\.([a-zA-Z][a-zA-Z0-9_]*)/g)) push(m[1], file, 'merged-record')
    for (const m of code.matchAll(/\bd\[\s*['"]([a-zA-Z][a-zA-Z0-9_]*)['"]\s*\]/g)) push(m[1], file, 'merged-record')
    for (const m of code.matchAll(/\bz\.([a-zA-Z][a-zA-Z0-9_]*)/g)) push(m[1], file, 'zone-property')
    // hypotheses.ts accessors, which name the record they read.
    for (const m of code.matchAll(/\b(?:str|arr|num)\(\s*z\s*,\s*'([a-zA-Z][a-zA-Z0-9_]*)'/g)) push(m[1], file, 'zone-accessor')
    for (const m of code.matchAll(/\b(?:str|arr|num)\(\s*(?:input\.)?buildingData\s*,\s*'([a-zA-Z][a-zA-Z0-9_]*)'/g)) push(m[1], file, 'building-accessor')
  }
  return out
}

const READS = scanReads()

describe('the registry reconciles every place a field name is declared', () => {
  it('declares every id in questions.js', () => {
    const ids = [...Q_PRESURVEY, ...Q_QUICKSTART, ...Q_DETAILS, ...Q_BUILDING, ...Q_ZONE]
      .map((q: any) => q.id)
      .filter((id: string) => !id.startsWith('_'))
      .concat(SENSOR_FIELDS.map((f: any) => f.id))
    for (const id of ids) expect(isDeclaredField(id), `${id} is in questions.js but not in the registry`).toBe(true)
  })

  it('declares the fields a building profile adds to a zone', () => {
    // buildingProfiles.js is a SECOND zone schema that questions.js knows
    // nothing about. Missing it is why earlier passes over this codebase
    // concluded `gaseous_corrosion` was an undeclared field.
    //
    // This used to enumerate the six data-center fields by name. That
    // profile was removed in 2026-08 and no profile currently declares
    // any `additionalFields`, so the assertion is made against whatever
    // the profiles actually carry — and the empty case is asserted
    // explicitly rather than passing vacuously. Add a profile field and
    // this starts checking it without being edited; if the derivation
    // ever stops reading buildingProfiles, the empty branch is the only
    // thing standing between that and a silently incomplete registry,
    // which is why `derivesFromBuildingProfiles` below exists too.
    const declared: string[] = []
    for (const profile of Object.values(BUILDING_PROFILES as Record<string, {
      additionalFields?: Record<string, Array<{ id: string }>>
    }>)) {
      for (const list of Object.values(profile?.additionalFields || {})) {
        for (const q of list) declared.push(q.id)
      }
    }
    for (const id of declared) {
      expect(getField(id), `${id} is declared by a building profile`).toBeTruthy()
      expect(getField(id)!.scope).toBe(SCOPE_ZONE)
    }
    if (declared.length === 0) {
      expect(
        Object.keys(BUILDING_PROFILES).length,
        'no profiles at all — the derivation has lost its source',
      ).toBeGreaterThan(0)
    }
  })

  it('derives profile fields from buildingProfiles rather than a fixed list', () => {
    // The guard that keeps the test above from going quietly vacuous now
    // that no profile declares additionalFields: inject one and the
    // registry must pick it up.
    const profiles = BUILDING_PROFILES as Record<string, {
      additionalFields?: Record<string, Array<Record<string, unknown>>>
    }>
    const key = Object.keys(profiles)[0]
    const target = profiles[key]
    const original = target.additionalFields
    try {
      target.additionalFields = {
        __probe: [{ id: '__probe_field', sec: 'Probe', q: 'Probe?', t: 'num' }],
      }
      const rebuilt = buildFieldRegistry()
      expect(
        rebuilt.some((f) => f.id === '__probe_field'),
        'the registry does not read BUILDING_PROFILES.additionalFields',
      ).toBe(true)
    } finally {
      target.additionalFields = original
    }
  })

  it('assigns every field exactly one scope', () => {
    // The derivation is only total because no id is claimed by both a
    // zone and a non-zone questionnaire. Assert that rather than trust it.
    const zoneIds = new Set([...Q_ZONE.map((q: any) => q.id), ...SENSOR_FIELDS.map((f: any) => f.id)])
    for (const list of [Q_PRESURVEY, Q_QUICKSTART, Q_DETAILS, Q_BUILDING]) {
      for (const q of list as any[]) {
        expect(zoneIds.has(q.id), `${q.id} is declared as both zone and non-zone`).toBe(false)
      }
    }
    const scopes = new Set(FIELD_REGISTRY.map((f) => f.scope))
    expect([...scopes].sort()).toEqual([SCOPE_BUILDING, SCOPE_PRESURVEY, SCOPE_ZONE].sort())
  })

  it('reproduces the routing the app performs, id for id', () => {
    // MobileApp.setQSField used to carry this as a literal array. It now
    // reads BUILDING_SCOPED_IDS; this pins the derivation against the
    // routing that shipped, so the refactor cannot have moved a field
    // from one record to the other.
    const shipped = [
      'fn', 'fl', 'ft', 'ht', 'sa', 'ba', 'rn', 'hm', 'fm', 'fc', 'od', 'dp',
      'bld_pressure', 'bld_exhaust', 'bld_intake_proximity',
      // Building pressurization module. Building-scoped for the same
      // reason bld_pressure is: the mechanism is a property of the
      // building, and scoreZone merges the building record into every
      // zone. Note that being IN this record is not the same as being
      // scored — nothing here reaches the composite, which
      // tests/engine/pressurization.test.ts asserts directly.
      'bld_press_door', 'bld_press_method', 'bld_press_door_behavior',
      'bld_press_dp_measured', 'bld_press_dp', 'bld_press_dp_units',
      'bld_press_dp_location',
      'bld_press_design', 'bld_press_design_units', 'bld_press_design_src',
      'wx_temp', 'wx_rh', 'wx_sky', 'wx_precip', 'wx_wind', 'wx_notes',
    ]
    expect([...BUILDING_SCOPED_IDS].sort()).toEqual([...shipped].sort())
  })

  it('no longer leaves that array in MobileApp to drift', () => {
    const src = strip(SRC('src/components/MobileApp.jsx'))
    expect(src, 'setQSField still carries its own copy of the building-field list')
      .toContain('BUILDING_SCOPED_IDS')
    expect(src).not.toMatch(/\['fn','fl','ft','ht','sa'/)
  })

  it('agrees with sufficiency.js about which fields exist and where they live', () => {
    // CATEGORY_REQUIREMENTS names fields in required / optional /
    // altRequired. Every one must be a field that exists, or a category
    // can declare itself insufficient forever on a key nothing writes.
    const code = strip(SRC('src/engines/sufficiency.js'))
    const block = code.slice(code.indexOf('CATEGORY_REQUIREMENTS'))
    const ids = new Set<string>()
    for (const group of block.matchAll(/(?:required|optional|altRequired)\s*:\s*\{([^}]*)\}/g)) {
      for (const m of group[1].matchAll(/([a-z][a-zA-Z0-9_]*)\s*:/g)) ids.add(m[1])
    }
    expect(ids.size, 'no requirement ids were extracted — the parse is wrong, not the data').toBeGreaterThan(5)
    for (const id of ids) {
      expect(isDeclaredField(id), `sufficiency.js requires "${id}", which no schema declares`).toBe(true)
    }
  })

  it('makes observable-fields a view over the registry, not a parallel reader', () => {
    for (const f of OBSERVABLE_FIELDS as any[]) {
      const contract = getField(f.id)
      expect(contract, `${f.id} is writable but not in the registry`).toBeTruthy()
      expect(f.scope, `${f.id} scope diverges from the registry`).toBe(contract!.scope)
      if (contract!.opts) expect([...f.opts]).toEqual([...contract!.opts])
    }
  })
})

// ── The layer ─────────────────────────────────────────────────────────

describe('engines may only read fields that exist', () => {
  it('scanned something — a silent scan would pass vacuously', () => {
    expect(READS.length).toBeGreaterThan(30)
    expect(new Set(READS.map((r) => r.file)).size).toBe(ENGINES.length)
    expect(parameterRangeFieldIds().length).toBeGreaterThan(8)
  })

  it('the field maps in parameter-ranges name fields that exist', () => {
    const excused = new Set(KNOWN_UNRESOLVED_READS.map((k) => k.field))
    for (const id of parameterRangeFieldIds()) {
      if (excused.has(id)) continue
      expect(isDeclaredField(id), `parameter-ranges maps to "${id}", which no schema declares`).toBe(true)
    }
  })

  it('injected runtime keys are declared as such and really are injected', () => {
    for (const k of INJECTED_KEYS) {
      expect(isDeclaredField(k.key), `${k.key} is an intake field, not an injected key`).toBe(false)
      expect(strip(SRC(k.injected_by)), `${k.key} is not injected by ${k.injected_by}`).toContain(k.key)
      expect(READS.some((r) => r.field === k.key), `${k.key} is declared injected but no engine reads it`).toBe(true)
    }
  })

  it('every field an engine reads is declared, or is a known unresolved read', () => {
    const excused = new Set([
      ...KNOWN_UNRESOLVED_READS.map((k) => k.field),
      ...INJECTED_KEYS.map((k) => k.key),
    ])
    const offenders = READS
      .filter((r) => !isDeclaredField(r.field) && !excused.has(r.field))
      .map((r) => `${r.field} (${r.file}, ${r.how})`)
    expect(
      [...new Set(offenders)],
      'these engine reads name a field no schema declares, so they can never return a value',
    ).toEqual([])
  })

  it('the known unresolved reads are exactly the ones still in the source', () => {
    // Pinned in both directions. A NEW dead read fails the check above;
    // a FIXED one fails here until it is removed from the list, so the
    // debt register cannot quietly outlive the debt.
    const injected = new Set(INJECTED_KEYS.map((k) => k.key))
    const undeclared = new Set([
      ...READS.filter((r) => !isDeclaredField(r.field) && !injected.has(r.field)).map((r) => r.field),
      ...parameterRangeFieldIds().filter((id) => !isDeclaredField(id)),
    ])
    const listed = new Set(KNOWN_UNRESOLVED_READS.map((k) => k.field))
    expect([...listed].sort(), 'KNOWN_UNRESOLVED_READS lists a field the source no longer reads')
      .toEqual([...undeclared].sort())
    for (const k of KNOWN_UNRESOLVED_READS) {
      expect(strip(SRC(k.read_by)), `${k.field} is not read by ${k.read_by}`).toContain(k.field)
      expect(k.reason.length, `${k.field} needs a reason someone can act on`).toBeGreaterThan(40)
    }
  })
})

describe('engines may only read a field from the record it lives on', () => {
  it('a raw-zone reader never asks for a building-scoped field WITHOUT also asking the building', () => {
    // The defect this exists for: `sa` and `od` are Q_BUILDING fields, and
    // deriveHypotheses is called with raw zonesData everywhere, so
    // `str(z, 'sa')` returned '' for every real assessment and two of the
    // ventilation rule's three triggers never fired.
    //
    // Reading a building field off a zone is not wrong on its own —
    // scoreZone hands these rules a merged `{...bldg, ...zone}` record in
    // other call paths, and a per-zone override is a real thing to
    // support. What was wrong was reading ONLY the zone, so the value was
    // unreachable on the shape the callers actually pass. The rule is
    // therefore: if a raw-shape file reads a building-scoped field off the
    // zone, it must read it off buildingData too.
    const rawFiles = new Set(ENGINES.filter((e) => e.shape === 'raw').map((e) => e.file))
    const buildingReads = new Set(
      READS.filter((r) => r.how === 'building-accessor').map((r) => `${r.file}::${r.field}`),
    )
    const offenders = READS
      .filter((r) => rawFiles.has(r.file))
      .filter((r) => r.how === 'zone-accessor' || r.how === 'zone-property')
      .filter((r) => getField(r.field)?.scope === SCOPE_BUILDING)
      .filter((r) => !buildingReads.has(`${r.file}::${r.field}`))
      .map((r) => `${r.field} is building-scoped and ${r.file} reads it only off the raw zone, where it is never present`)
    expect([...new Set(offenders)]).toEqual([])
  })

  it('would catch a zone-only read of a building field', () => {
    // Guards the guard, by replaying the original defect. hypotheses.ts
    // reads `sa` off both records today; strip the buildingData half and
    // the rule must object.
    const rawFiles = new Set(ENGINES.filter((e) => e.shape === 'raw').map((e) => e.file))
    const withoutBuildingHalf = READS.filter(
      (r) => !(r.how === 'building-accessor' && r.field === 'sa'),
    )
    const buildingReads = new Set(
      withoutBuildingHalf.filter((r) => r.how === 'building-accessor').map((r) => `${r.file}::${r.field}`),
    )
    const offenders = withoutBuildingHalf
      .filter((r) => rawFiles.has(r.file))
      .filter((r) => r.how === 'zone-accessor' || r.how === 'zone-property')
      .filter((r) => getField(r.field)?.scope === SCOPE_BUILDING)
      .filter((r) => !buildingReads.has(`${r.file}::${r.field}`))
    expect(offenders.map((r) => r.field)).toContain('sa')
  })

  it('a building-accessor read names a building-scoped field', () => {
    const offenders = READS
      .filter((r) => r.how === 'building-accessor')
      .filter((r) => {
        const c = getField(r.field)
        return c && c.scope !== SCOPE_BUILDING
      })
      .map((r) => `${r.field} is ${getField(r.field)!.scope}-scoped but read off buildingData in ${r.file}`)
    expect([...new Set(offenders)]).toEqual([])
  })

  it('is actually looking at something', () => {
    // The checks above pass trivially if the scan finds no raw-zone reads
    // at all, or if scope is never populated.
    const rawFiles = new Set(ENGINES.filter((e) => e.shape === 'raw').map((e) => e.file))
    const rawZoneReads = READS.filter((r) => rawFiles.has(r.file) && r.how === 'zone-accessor')
    expect(rawZoneReads.length, 'no raw-zone accessor reads were found — the pattern must have changed').toBeGreaterThan(3)
    expect(READS.some((r) => r.how === 'building-accessor')).toBe(true)
    expect(fieldsInScope(SCOPE_BUILDING).length).toBeGreaterThan(10)
  })
})

describe('what the registry knows is usable', () => {
  it('every contract is complete enough to validate a value against', () => {
    for (const f of FIELD_REGISTRY) {
      expect(f.id, 'a contract has no id').toBeTruthy()
      expect(f.label.length, `${f.id} has no label`).toBeGreaterThan(0)
      expect([SCOPE_ZONE, SCOPE_BUILDING, SCOPE_PRESURVEY]).toContain(f.scope)
      if (f.kind === 'choice' || f.kind === 'multi') {
        // A choice field with no options can only be one whose options
        // are filled in at runtime from the building profile.
        if (!f.opts) expect(f.dynamicOptions, `${f.id} is a choice with no options`).toBe(true)
      }
    }
  })

  it('is frozen — a consumer cannot edit the vocabulary for everyone else', () => {
    expect(Object.isFrozen(FIELD_REGISTRY)).toBe(true)
    expect(Object.isFrozen(FIELD_REGISTRY[0])).toBe(true)
    expect(() => { (FIELD_REGISTRY as any).push({ id: 'x' }) }).toThrow()
  })

  it('returns null rather than guessing for an unknown id', () => {
    expect(getField('definitely_not_a_field')).toBeNull()
    expect(getField('')).toBeNull()
    expect(getField(undefined as any)).toBeNull()
    expect(isDeclaredField('nt'), 'nt was never a declared field').toBe(false)
  })
})
