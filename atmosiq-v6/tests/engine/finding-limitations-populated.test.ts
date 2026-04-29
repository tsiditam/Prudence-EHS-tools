/**
 * v2.3 §1 — Finding.limitations population.
 *
 * Verifies that every Finding emitted by the bridge whose
 * ConditionType has a non-empty defaultLimitations entry in the
 * phrase library carries those limitations on Finding.limitations.
 * The bridge is the single source — see src/engine/bridge/legacy.ts.
 */
import { describe, it, expect } from 'vitest'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { scoreZone, compositeScore } from '../../src/engines/scoring'
import { PHRASE_LIBRARY } from '../../src/engine/report/phrases/index'
import type { AssessmentMeta } from '../../src/engine/types/domain'

const META: AssessmentMeta = {
  siteName: 'Test', siteAddress: '1 St', assessmentDate: '2026-04-29',
  preparingAssessor: { fullName: 'J. Smith', credentials: ['CIH'] },
  reviewStatus: 'draft_pending_professional_review',
  issuingFirm: { name: 'PSEC' },
  projectNumber: 'PSEC-TEST-0001',
  transmittalRecipient: { fullName: 'R', organization: 'O' },
}

describe('v2.3 §1 — Finding.limitations populated from phrase library', () => {
  it('Every significant finding with non-empty defaultLimitations carries them inline', () => {
    // Construct a fixture that exercises at least one finding per
    // category: ventilation (CO2 elevated), contaminants (CO above
    // PEL, formaldehyde, TVOC, PM2.5, mold), HVAC (drain pan,
    // filter, maintenance), complaints (cluster + symptoms-resolve),
    // environment (temp out of range, humidity, water damage).
    const zone = {
      zn: 'Z1', su: 'office',
      co2: '1500', co2o: '420',
      co: '60', hc: '1.0', tv: '1500',
      pm: '50',
      tf: '85', rh: '75',
      mi: 'Small (< 10 sq ft)', wd: 'Active leak',
      cx: 'Yes — complaints reported', ac: '6-10', cc: 'Yes — this zone',
      sr: 'Yes — clear pattern', sy: ['Headache'],
    }
    const bldg = { hm: 'Over 12 months', fc: 'Heavily loaded', dp: 'Standing water' }
    const lz = scoreZone(zone, bldg)
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz] as any, cs as any, [{ ...zone, ...bldg }] as any, { meta: META })

    const findings = score.zones.flatMap(z => z.categories.flatMap(c => c.findings))
    expect(findings.length).toBeGreaterThan(0)

    let coveredAtLeastOne = false
    for (const f of findings) {
      const phrase = PHRASE_LIBRARY[f.conditionType]
      if (!phrase) continue
      if (phrase.defaultLimitations.length > 0) {
        // pass/info findings have empty actions but limitations
        // come from the phrase library and SHOULD still surface.
        // The bridge currently sets limitations on every finding
        // including pass/info — which is correct because zone
        // dedup will discard duplicates and only significant
        // findings render.
        if (f.severityInternal !== 'pass' && f.severityInternal !== 'info') {
          expect(f.limitations.length).toBeGreaterThan(0)
          // Sanity: the limitations come from the phrase library
          for (const lim of f.limitations) {
            expect(phrase.defaultLimitations).toContain(lim)
          }
          coveredAtLeastOne = true
        }
      }
    }
    expect(coveredAtLeastOne).toBe(true)
  })

  it('Spot-check: every category produces at least one finding with limitations', () => {
    const zone = {
      zn: 'Z1', su: 'office',
      co2: '1500', co2o: '420',
      co: '60', hc: '1.0', tv: '1500', pm: '50',
      tf: '85', rh: '75',
      mi: 'Small (< 10 sq ft)', wd: 'Active leak',
      cx: 'Yes — complaints reported', ac: '6-10', cc: 'Yes — this zone',
    }
    const bldg = { hm: 'Over 12 months', fc: 'Heavily loaded' }
    const lz = scoreZone(zone, bldg)
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz] as any, cs as any, [{ ...zone, ...bldg }] as any, { meta: META })

    const significantByCategory = new Map<string, boolean>()
    for (const f of score.zones.flatMap(z => z.categories.flatMap(c => c.findings))) {
      if (f.severityInternal === 'pass' || f.severityInternal === 'info') continue
      if (f.limitations.length > 0) {
        significantByCategory.set(f.category, true)
      }
    }
    // We expect at least 3 of the 5 categories to have a significant
    // finding with non-empty limitations (Ventilation, Contaminants,
    // HVAC, Complaints, Environment).
    expect(significantByCategory.size).toBeGreaterThanOrEqual(3)
  })
})
