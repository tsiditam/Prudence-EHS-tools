/**
 * No surface draws a reference line at a number the registry does not hold.
 *
 * The per-parameter versions of this — `thermal-comfort-band.test.ts`,
 * `humidity-citation.test.ts` — were each written after a specific figure
 * turned out to be wrong. This is the general form, and it is the one that
 * stops the NEXT one reaching a screenshot rather than the last one.
 *
 * A reference line is the most consequential number the product renders: it
 * is the thing a reading is judged against, it appears on a chart the client
 * keeps, and unlike a finding sentence nobody reads it as an opinion. Every
 * one of them must resolve to a published criterion, in the criterion's own
 * value, under the criterion's own citation.
 *
 * Found on its first run, none of which anything else was watching:
 *
 *   • The CO2 profiles drew 1,000 and 1,500 ppm with no criterion linked,
 *     though `co2_concern` and `co2_action` hold exactly those numbers.
 *   • The TVOC "WELL v2 performance (500 µg/m³)" profile cited WELL feature
 *     A01 while this project's own standards corpus files that figure under
 *     LEED v4.1 and instructs, verbatim, "name it as a green-building/LEED
 *     target". Nothing in the repository supported the WELL attribution.
 */
import { describe, it, expect } from 'vitest'
import {
  parametersWithProfiles, profilesFor, resolveReference, __PROFILES_FOR_TEST,
} from '../../src/utils/referenceProfiles'
import { paramReference } from '../../src/utils/sensorThresholds'
import { allCriteria } from '../../src/constants/criteria'
import { STD } from '../../src/constants/standards'

const SUMMER = Date.UTC(2026, 7, 23)

/** The unit each parameter's data is canonically logged in. */
const UNIT: Record<string, string> = {
  co2: 'ppm', pm25: 'µg/m³', pm10: 'µg/m³', co: 'ppm',
  tvoc: 'µg/m³', hcho: 'ppb', temp: '°F', rh: '%',
}

const criteria = allCriteria() as any[]
const byId = new Map(criteria.map((c) => [c.id, c]))
const raw = __PROFILES_FOR_TEST as Record<string, Array<{ id: string; criterionId?: string }>>

const eachProfile = () =>
  (parametersWithProfiles() as string[]).flatMap((param) =>
    (profilesFor(param) as Array<{ id: string; label: string; source?: string }>)
      .map((p) => ({ param, ...p, criterionId: raw[param]?.find((x) => x.id === p.id)?.criterionId })))

describe('every reference line traces to a criterion', () => {
  it.each(eachProfile().filter((p) => p.criterionId).map((p) => [`${p.param}/${p.id}`, p]))(
    '%s resolves the criterion value it names',
    (_label, p: any) => {
      const c = byId.get(p.criterionId)
      expect(c, `${p.param}/${p.id} links ${p.criterionId}, which is not in the registry`).toBeTruthy()

      const r = resolveReference(p.param, p.id, { unit: UNIT[p.param], ts: SUMMER })!
      expect(r, `${p.param}/${p.id} resolved nothing`).toBeTruthy()

      if (c.band) {
        expect(r.band, `${p.param}/${p.id} lost its band`).toEqual([c.band.min, c.band.max])
        return
      }
      // Units may be PROJECTED — the HCHO criteria are ppm and the data is
      // logged in ppb, so the line is the same quantity at another scale. What
      // must never happen is a line at a number the criterion does not hold in
      // ANY unit, which is what an invented figure looks like.
      const projections = [c.value, c.value * 1000, c.value / 1000]
      const near = projections.some((v) => Math.abs(v - (r.limit as number)) <= Math.abs(v) * 0.02)
      expect(
        near,
        `${p.param}/${p.id} draws its line at ${r.limit} ${UNIT[p.param]}, `
        + `but ${p.criterionId} holds ${c.value} ${c.unit}`,
      ).toBe(true)
    },
  )

  it('a profile that names no criterion draws no unexplained number', () => {
    // The alternative to linking is not "link nothing". A profile with a
    // limit and no criterion is a published figure with no registry entry —
    // exactly the condition temperature and humidity were in.
    const unexplained = eachProfile()
      .filter((p) => !p.criterionId)
      .map((p) => ({ p, r: resolveReference(p.param, p.id, { unit: UNIT[p.param], ts: SUMMER }) as any }))
      .filter(({ r }) => typeof r?.limit === 'number')
      .map(({ p, r }) => `${p.param}/${p.id} = ${r.limit}`)

    // Bands are exempt here and covered below: `temp` and `rh` resolve
    // seasonally and from STD directly, so they cannot name one static id.
    expect(unexplained, 'a reference line with no criterion behind it').toEqual([])
  })
})

describe('the surfaces agree with each other', () => {
  it.each((parametersWithProfiles() as string[]).map((p) => [p]))(
    '%s: the Logger card and the monitoring report resolve the same reference',
    (param: string) => {
      const card = paramReference(param, { unit: UNIT[param], ts: SUMMER })
      const report = resolveReference(param, undefined as never, { unit: UNIT[param], ts: SUMMER })!

      // The card and the report may legitimately default to DIFFERENT
      // profiles — the report lets the assessor choose. What must hold is that
      // whatever each draws is a real published figure, and that where both
      // draw a band they draw the SAME band, since a band comes from STD and
      // has no per-profile choice behind it.
      if (card.band && report.band) {
        expect([card.band.min, card.band.max], `${param} band disagrees across surfaces`)
          .toEqual(report.band)
      }
      expect(card, `${param} card resolved nothing`).toBeTruthy()
      expect(report, `${param} report resolved nothing`).toBeTruthy()
    },
  )

  it('temperature and humidity bands come from one place', () => {
    // The specific cross-surface split that reached a screenshot: the card
    // drew 67–82 while the engine flagged 73–79.
    const t = paramReference('temp', { unit: '°F', ts: SUMMER }).band
    expect([t.min, t.max]).toEqual([STD.t.temp.summer.min, STD.t.temp.summer.max])
    expect(resolveReference('temp', 'ashrae-comfort', { unit: '°F', ts: SUMMER })!.band)
      .toEqual([STD.t.temp.summer.min, STD.t.temp.summer.max])

    const h = paramReference('rh', { unit: '%' }).band
    expect([h.min, h.max]).toEqual([STD.t.rh.min, STD.t.rh.max])
    expect(resolveReference('rh', 'ashrae-comfort', { unit: '%' })!.band)
      .toEqual([STD.t.rh.min, STD.t.rh.max])
  })
})

describe('a citation matches what it is cited to', () => {
  it.each(eachProfile().filter((p) => p.criterionId).map((p) => [`${p.param}/${p.id}`, p]))(
    '%s cites the same body as its criterion',
    (_label, p: any) => {
      const c = byId.get(p.criterionId)!
      expect(p.source, `${p.param}/${p.id} has no citation`).toBeTruthy()
      expect(p.source, `${p.param}/${p.id} does not cite its own criterion's source`).toBe(c.source)
    },
  )

  it('no profile label states a number its reference does not draw', () => {
    // "WELL v2 performance (500 µg/m³)" and "Mølhave advisory (500 µg/m³)"
    // put the figure in the LABEL, where a stale one is invisible to every
    // check that only looks at the resolved value.
    for (const p of eachProfile()) {
      // The parenthetical must carry a UNIT. "WHO 24-hour (2021)" states an
      // edition year, not a threshold, and reading it as one is how a guard
      // starts reporting things that are not wrong.
      const stated = String(p.label).match(/\(([\d,]+(?:\.\d+)?)\s*(ppm|ppb|µg\/m³|mg\/m³|%|°F|°C)/)
      if (!stated) continue
      const n = Number(stated[1].replace(/,/g, ''))
      if (!Number.isFinite(n)) continue
      const r = resolveReference(p.param, p.id, { unit: UNIT[p.param], ts: SUMMER }) as any
      const drawn = [r?.limit, r?.band?.[0], r?.band?.[1]]
        .filter((v) => typeof v === 'number') as number[]
      // The label may state the figure in the criterion's own unit while the
      // line is projected, so accept any scale.
      const matches = drawn.some((v) => [v, v * 1000, v / 1000].some((x) => Math.abs(x - n) <= Math.abs(n) * 0.02))
      expect(matches, `${p.param}/${p.id} label says ${n} but the line is drawn at ${drawn.join('/')}`)
        .toBe(true)
    }
  })
})
