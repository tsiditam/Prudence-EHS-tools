/**
 * Jasper's grounding surfaces carry their own copies of thresholds, and a
 * copy is a second ledger (AUDIT-2026-09 M3). Two things are pinned here:
 *
 *   1. Every threshold number the field-assistant corpus and the IAQ
 *      knowledge base state equals the registry value in criteria.js — the
 *      same double-entry rule standards-reconciliation.test.ts applies to the
 *      standards corpus.
 *   2. Attribution: the 1,000 / 1,500 ppm CO₂ indicators are NIOSH's and the
 *      Δ700 differential is from a since-removed informative appendix of
 *      earlier ASHRAE 62.1 editions. Neither may sit under an "ASHRAE 62.1"
 *      heading, because a constant nested under another's citation inherits
 *      it — that is how Jasper came to cite them as 62.1 values.
 */
import { describe, it, expect } from 'vitest'
import { allCriteria } from '../../src/constants/criteria'
import { STD } from '../../src/constants/standards'
import { STANDARDS_FOR_AGENT } from '../../src/constants/field-assistant-corpus'
import { lookupExposureLimit } from '../../src/constants/iaq-knowledge-base'
import { STANDARDS_CORPUS } from '../../src/constants/standards-corpus'
import { hchoToUnit } from '../../src/utils/sensorThresholds'

const byId = new Map((allCriteria() as any[]).map((c) => [c.id, c]))
const v = (id: string) => {
  const c = byId.get(id)
  expect(c, `${id} not in registry`).toBeTruthy()
  return c.value as number
}

describe('field-assistant corpus figures equal the registry', () => {
  const text = STANDARDS_FOR_AGENT

  it('CO₂ indicators', () => {
    expect(text).toContain(`Absolute indicators ${v('co2_concern')} ppm (concern) and ${v('co2_action')} ppm (action)`)
    expect(text).toContain(`differential ${STD.v.co2.diff} ppm above outdoor`)
  })
  it('CO', () => {
    expect(text).toContain(`CO ppm: OSHA ${v('co_osha_pel')}, NIOSH ${v('co_niosh_rel')}`)
  })
  it('formaldehyde', () => {
    expect(text).toContain(`HCHO ppm: OSHA ${v('hcho_osha_pel')}, NIOSH ${v('hcho_niosh_rel')}, action ${v('hcho_osha_al')}`)
  })
  it('PM2.5', () => {
    expect(text).toContain(`EPA NAAQS ${v('pm25_epa_24h')}, WHO ${v('pm25_who_24h')}`)
  })
  it('thermal and humidity bands', () => {
    const w = byId.get('temp_ashrae55_winter').band, s = byId.get('temp_ashrae55_summer').band, rh = byId.get('rh_epa_moisture_control').band
    expect(text).toContain(`Summer °F: ${s.min}–${s.max}`)
    expect(text).toContain(`Winter °F: ${w.min}–${w.max}`)
    expect(text).toContain(`${rh.min}–${rh.max}% practice range`)
  })
})

describe('field-assistant corpus attributions', () => {
  const lines = STANDARDS_FOR_AGENT.split('\n')
  const headingOf = (needle: string) => {
    const i = lines.findIndex((l) => l.includes(needle))
    expect(i, `"${needle}" not found`).toBeGreaterThan(-1)
    for (let j = i; j >= 0; j--) if (/^\S.*:$/.test(lines[j])) return lines[j]
    return ''
  }

  it('the 1,000 / 1,500 indicators sit under a NIOSH attribution, not an ASHRAE 62.1 heading', () => {
    const h = headingOf('Absolute indicators')
    expect(h).not.toMatch(/62\.1/)
    expect(h).toMatch(/CO₂ indicators/)
    expect(lines.find((l) => l.includes('Absolute indicators'))).toMatch(/NIOSH/)
  })

  it('the Δ700 differential is attributed to the removed appendix, not to current 62.1', () => {
    const l = lines.find((x) => x.includes('differential'))!
    expect(l).toMatch(/earlier ASHRAE 62\.1 editions, since removed/)
    expect(l).toMatch(/Position Document on Indoor Carbon Dioxide \(2022\)/)
  })

  it('the ASHRAE 62.1 heading says what 62.1 does not set', () => {
    expect(lines.find((l) => l.startsWith('Ventilation — ' + STD.v.ref))).toMatch(/sets no indoor CO₂ limit/)
  })
})

describe('IAQ knowledge base figures equal the registry', () => {
  it('CO', () => {
    const co = lookupExposureLimit('carbon monoxide')
    expect(co.osha.value).toBe(v('co_osha_pel'))
    expect(co.niosh.value).toBe(v('co_niosh_rel'))
    expect(co.niosh.note).toContain(`Ceiling ${v('co_niosh_ceiling')} ppm`)
  })
  it('formaldehyde', () => {
    const h = lookupExposureLimit('formaldehyde')
    expect(h.osha.value).toBe(v('hcho_osha_pel'))
    expect(h.niosh.value).toBe(v('hcho_niosh_rel'))
    expect(h.osha.note).toContain(`STEL ${v('hcho_osha_stel')} ppm`)
    expect(h.other.find((o: any) => o.type === 'AL').value).toBe(v('hcho_osha_al'))
  })
  it('CO₂ differential', () => {
    const co2 = lookupExposureLimit('carbon dioxide')
    const diff = co2.other.find((o: any) => o.type === 'differential')
    expect(diff.value).toBe(STD.v.co2.diff)
    expect(diff.agency).not.toMatch(/62\.1-2025/)
    expect(diff.citation).toMatch(/earlier ASHRAE 62\.1 editions, since removed/)
    expect(diff.citation).toMatch(/Position Document on Indoor Carbon Dioxide \(2022\)/)
  })
  it('PM2.5', () => {
    const pm = lookupExposureLimit('pm2.5')
    expect(pm.epa.value).toBe(v('pm25_epa_annual'))
    expect(pm.epa.note).toContain(`${v('pm25_epa_24h')} µg/m³ 24-hour`)
  })
})

describe('the standards corpus CO₂ entry', () => {
  it('attributes Δ700 to the removed appendix and cites the position document', () => {
    const e = (STANDARDS_CORPUS as any[]).find((x) => x.id === 'ashrae-621-co2-dcv')
    expect(e.citation).not.toMatch(/2025 §6\.4 \+ Appendix C/)
    expect(e.citation).toMatch(/earlier ASHRAE 62\.1 editions, since removed/)
    expect(e.text).toMatch(/informative appendix of earlier 62\.1 editions, since removed/)
    expect(e.text).toContain(`approximately ${STD.v.co2.diff} ppm above outdoor`)
  })
})

describe('the Logger card derives its formaldehyde references from the registry', () => {
  it('EPA RfC is the 2024 IRIS figure, not the stale ~8 ppb', async () => {
    const { paramReference } = await import('../../src/utils/sensorThresholds')
    const refs = paramReference('hcho', { unit: 'ppb' }).refs.join(' ')
    const rfcPpb = hchoToUnit(v('hcho_epa_rfc'), 'ppb')
    expect(rfcPpb).toBeLessThan(6)
    expect(refs).toContain(`EPA RfC: ${Number(rfcPpb.toFixed(1))} ppb`)
    expect(refs).not.toMatch(/~8 ppb/)
    expect(refs).toContain(`NIOSH REL: ${Math.round(hchoToUnit(v('hcho_niosh_rel'), 'ppb'))} ppb`)
  })
})
