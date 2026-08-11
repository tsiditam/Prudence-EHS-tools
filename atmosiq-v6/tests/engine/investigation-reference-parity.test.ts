/**
 * AtmosFlow 3.0 — reference-registry drift guard.
 *
 * The typed ReferenceValue registry (lib/investigation/references.ts) mirrors
 * numeric values from the frozen legacy manifest (src/constants/standards.js,
 * STD). This test fails if the two drift apart, so the v3 framework can't
 * silently diverge from the documented thresholds before Stage 4 unifies them.
 */

import { describe, it, expect } from 'vitest'
import { REFERENCES } from '../../lib/investigation/references'
// eslint-disable-next-line import/extensions
import { STD } from '../../src/constants/standards'

describe('investigation reference registry parity with legacy STD', () => {
  it('CO references match', () => {
    expect(REFERENCES.co_osha_pel.value).toBe((STD as any).c.co.osha)
    expect(REFERENCES.co_niosh_rel.value).toBe((STD as any).c.co.niosh)
    expect(REFERENCES.co_epa_naaqs_8h.value).toBe((STD as any).c.co.epa)
  })

  it('formaldehyde references match', () => {
    expect(REFERENCES.hcho_osha_pel.value).toBe((STD as any).c.hcho.osha)
    expect(REFERENCES.hcho_osha_al.value).toBe((STD as any).c.hcho.al)
    expect(REFERENCES.hcho_niosh_rel.value).toBe((STD as any).c.hcho.niosh)
  })

  it('PM2.5 references match', () => {
    expect(REFERENCES.pm25_epa_24h.value).toBe((STD as any).c.pm25.epa)
    expect(REFERENCES.pm25_who_24h.value).toBe((STD as any).c.pm25.who)
  })

  it('TVOC and CO₂ surrogate match', () => {
    expect(REFERENCES.tvoc_molhave_advisory.value).toBe((STD as any).c.tvoc.con)
    expect(REFERENCES.co2_ventilation_surrogate.value).toBe((STD as any).v.co2.diff)
  })
})
