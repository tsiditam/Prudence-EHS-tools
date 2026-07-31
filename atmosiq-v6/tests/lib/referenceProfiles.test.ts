/**
 * referenceProfiles — the selectable screening reference.
 *
 * The property that matters most here is the one at the bottom: choosing a
 * profile must change the ENTIRE downstream chain — the resolved limit, the
 * computed % above, the time above, and the generated sentence. A selector
 * that only re-labels the chart while the statistics keep using the old
 * yardstick would be worse than no selector at all.
 */
import { describe, it, expect } from 'vitest'
import {
  profilesFor,
  defaultProfileId,
  parametersWithProfiles,
  resolveReference,
  resolveReferences,
  referenceTableRows,
} from '../../src/utils/referenceProfiles.js'
import { parameterStats } from '../../src/utils/monitoringStats.js'
import { parameterStatement } from '../../src/utils/monitoringInsights.js'
import { STD } from '../../src/constants/standards.js'

const T0 = Date.UTC(2026, 6, 15)
const MIN = 60_000
const pts = (values: number[], param = 'pm25') =>
  values.map((v, i) => ({ t: T0 + i * 10 * MIN, [param]: v }))

describe('catalogue', () => {
  it('offers the alternatives an assessor actually chooses between', () => {
    expect(profilesFor('pm25').map((p) => p.id)).toEqual(['epa', 'who'])
    expect(profilesFor('co').map((p) => p.id)).toEqual(['epa-naaqs', 'niosh-rel', 'osha-pel'])
    expect(profilesFor('co2').map((p) => p.id)).toContain('outdoor-differential')
    expect(profilesFor('tvoc').map((p) => p.id)).toContain('none')
  })

  it('has a default for every parameter it covers', () => {
    parametersWithProfiles().forEach((p) => {
      expect(defaultProfileId(p), `no default for ${p}`).toBeTruthy()
      expect(profilesFor(p).length).toBeGreaterThan(0)
    })
  })

  it('returns nothing for a parameter with no published value', () => {
    expect(profilesFor('press')).toEqual([])
    expect(resolveReference('press', 'anything')).toBeNull()
  })
})

describe('values come from the standards manifest', () => {
  it('resolves PM2.5 to the EPA and WHO values in STD, not literals here', () => {
    expect(resolveReference('pm25', 'epa', { unit: 'µg/m³' })!.limit).toBe(STD.c.pm25.epa)
    expect(resolveReference('pm25', 'who', { unit: 'µg/m³' })!.limit).toBe(STD.c.pm25.who)
  })

  it('resolves each CO reference to its own manifest entry', () => {
    expect(resolveReference('co', 'osha-pel', { unit: 'ppm' })!.limit).toBe(STD.c.co.osha)
    expect(resolveReference('co', 'niosh-rel', { unit: 'ppm' })!.limit).toBe(STD.c.co.niosh)
    expect(resolveReference('co', 'epa-naaqs', { unit: 'ppm' })!.limit).toBe(STD.c.co.epa)
  })

  it('resolves the RH comfort band from the manifest', () => {
    expect(resolveReference('rh', 'ashrae-comfort', { unit: '%' })!.band).toEqual([STD.t.rh.min, STD.t.rh.max])
  })
})

describe('unit projection', () => {
  it('projects the TVOC advisory into the unit the data was logged in', () => {
    const ugm3 = resolveReference('tvoc', 'molhave', { unit: 'µg/m³' })!
    expect(ugm3.limit).toBe(STD.c.tvoc.con)
    // A ppb-logging instrument must not be compared against a µg/m³ number.
    const ppb = resolveReference('tvoc', 'molhave', { unit: 'ppb' })!
    expect(ppb.limit).toBeGreaterThan(0)
    expect(ppb.limit).not.toBe(ugm3.limit)
  })

  it('keeps the action tier above the advisory tier in every unit', () => {
    ;['µg/m³', 'ppb', 'ppm'].forEach((unit) => {
      const a = resolveReference('tvoc', 'molhave', { unit })!.limit as number
      const b = resolveReference('tvoc', 'molhave-action', { unit })!.limit as number
      expect(b, `action tier not above advisory in ${unit}`).toBeGreaterThan(a)
    })
  })

  it('delegates the season- and unit-dependent temperature band', () => {
    const f = resolveReference('temp', 'ashrae-comfort', { unit: '°F', ts: T0 })!
    const c = resolveReference('temp', 'ashrae-comfort', { unit: '°C', ts: T0 })!
    expect(f.band).toBeTruthy()
    expect(c.band).toBeTruthy()
    // °F↔°C is affine, so the Celsius band is not a scalar multiple.
    expect(c.band![0]).toBeLessThan(f.band![0])
  })
})

describe('framing that must survive selection', () => {
  it('carries the CO₂ ventilation-indicator note on every CO₂ profile', () => {
    profilesFor('co2').forEach((p) => {
      expect(p.note, `missing note on co2/${p.id}`).toMatch(/not a health limit/i)
    })
  })

  it('carries the Mølhave advisory caveat on every TVOC profile, including "none"', () => {
    profilesFor('tvoc').forEach((p) => {
      expect(p.note, `missing note on tvoc/${p.id}`).toMatch(/no consensus health limit/i)
    })
  })

  it('names a citable source for every profile that sets a value', () => {
    parametersWithProfiles().forEach((param) => {
      profilesFor(param)
        .filter((p) => p.id !== 'none')
        .forEach((p) => expect(p.source, `no source for ${param}/${p.id}`).toBeTruthy())
    })
  })
})

describe('profiles that need data the session may not have', () => {
  it('resolves the CO₂ outdoor differential against the measured baseline', () => {
    const r = resolveReference('co2', 'outdoor-differential', { unit: 'ppm', outdoorBaseline: 430 })!
    expect(r.limit).toBe(430 + STD.v.co2.diff)
    expect(r.unavailable).toBeNull()
  })

  it('reports WHY it cannot resolve rather than inventing a reference', () => {
    const r = resolveReference('co2', 'outdoor-differential', { unit: 'ppm' })!
    expect(r.limit).toBeNull()
    expect(r.unavailable).toBe('outdoorBaseline')
  })

  it('honours an explicit "no reference line" choice', () => {
    const r = resolveReference('tvoc', 'none', { unit: 'ppb' })!
    expect(r.limit).toBeNull()
    expect(r.band).toBeNull()
    expect(r.unavailable).toBeNull() // a choice, not a missing input
  })

  it('accepts a custom comfort range', () => {
    const r = resolveReference('rh', 'custom', { unit: '%', custom: [40, 55] })!
    expect(r.band).toEqual([40, 55])
  })

  it('falls back to the default profile for an unknown id', () => {
    expect(resolveReference('pm25', 'not-a-profile', { unit: 'µg/m³' })!.profileId).toBe('epa')
  })
})

describe('resolveReferences + table rows', () => {
  const resolved = resolveReferences(['co2', 'pm25', 'rh'], { pm25: 'who' }, {
    units: { co2: 'ppm', pm25: 'µg/m³', rh: '%' },
  })

  it('resolves each parameter with its own selection and unit', () => {
    expect(resolved.pm25.limit).toBe(STD.c.pm25.who)
    expect(resolved.co2.profileId).toBe(defaultProfileId('co2'))
    expect(resolved.rh.band).toEqual([STD.t.rh.min, STD.t.rh.max])
  })

  it('builds one consolidated table so figure captions can point back to it', () => {
    const rows = referenceTableRows(resolved)
    expect(rows.map((r) => r.param).sort()).toEqual(['co2', 'pm25', 'rh'])
    expect(rows.find((r) => r.param === 'pm25')!.value).toBe(`${STD.c.pm25.who} µg/m³`)
    expect(rows.find((r) => r.param === 'rh')!.value).toBe(`${STD.t.rh.min}–${STD.t.rh.max} %`)
    expect(rows.find((r) => r.param === 'co2')!.note).toMatch(/not a health limit/i)
  })

  it('omits a parameter whose reference could not be resolved', () => {
    const r = resolveReferences(['co2'], { co2: 'outdoor-differential' }, { units: { co2: 'ppm' } })
    expect(referenceTableRows(r)).toEqual([])
  })
})

describe('the selection drives the whole chain (not just the label)', () => {
  // 10 readings between the WHO (15) and EPA (35) µg/m³ values, so the two
  // profiles must produce genuinely different statistics and prose.
  const data = pts([20, 22, 25, 18, 30, 16, 24, 21, 19, 23])

  it('changes the limit, the % above, the time above, AND the sentence', () => {
    const epa = resolveReference('pm25', 'epa', { unit: 'µg/m³' })!
    const who = resolveReference('pm25', 'who', { unit: 'µg/m³' })!

    const underEpa = parameterStats(data, 'pm25', { reference: { limit: epa.limit } })!
    const underWho = parameterStats(data, 'pm25', { reference: { limit: who.limit } })!

    // EPA (35): never exceeded. WHO (15): exceeded throughout.
    expect(underEpa.pctAbove).toBe(0)
    expect(underWho.pctAbove).toBe(100)
    expect(underEpa.timeAboveSec).toBe(0)
    expect(underWho.timeAboveSec).toBeGreaterThan(0)

    const sEpa = parameterStatement('pm25', underEpa, { limit: epa.limit })!
    const sWho = parameterStatement('pm25', underWho, { limit: who.limit })!
    expect(sEpa).toContain(`${STD.c.pm25.epa} µg/m³`)
    expect(sWho).toContain(`${STD.c.pm25.who} µg/m³`)
    expect(sEpa).toMatch(/throughout the monitoring period\.$/)
    expect(sWho).not.toMatch(/throughout the monitoring period\.$/)
  })
})
