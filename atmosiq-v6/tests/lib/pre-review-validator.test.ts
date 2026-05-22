/**
 * Pre-Review Validator (Layer 1, deterministic) — pins one test per
 * check so we know exactly which discrepancies the validator catches
 * and which ones it intentionally lets through.
 */
import { describe, it, expect } from 'vitest'
import {
  runPreReviewChecks,
  summarizeIssues,
  checkDuplicateFindings,
  checkPhotoReferences,
  checkLabDateSanity,
  checkCitationAntiPatterns,
  checkFindingsWithoutRecs,
  checkPlaceholderText,
  checkSampleIdDrift,
} from '../../src/utils/preReviewValidator.js'

// ─── checkDuplicateFindings ───────────────────────────────────────

describe('checkDuplicateFindings', () => {
  it('flags two finding rows with ≥70% token overlap inside the same zone+category', () => {
    const ctx = {
      zoneScores: [{
        zoneName: 'Zone A',
        cats: [{
          l: 'Ventilation',
          r: [
            { t: 'Outdoor air damper is closed and supply airflow is weak', sev: 'high' },
            { t: 'Outdoor air damper closed; supply airflow weak in this zone', sev: 'high' },
          ],
        }],
      }],
    }
    const issues = checkDuplicateFindings(ctx)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('warning')
    expect(issues[0].category).toBe('duplicate_finding')
    expect(issues[0].title).toContain('Zone A')
  })

  it('does NOT flag duplicates across different zones', () => {
    const ctx = {
      zoneScores: [
        { zoneName: 'Zone A', cats: [{ l: 'V', r: [{ t: 'CO2 elevated above 1000 ppm in this room' }] }] },
        { zoneName: 'Zone B', cats: [{ l: 'V', r: [{ t: 'CO2 elevated above 1000 ppm in this room' }] }] },
      ],
    }
    expect(checkDuplicateFindings(ctx)).toEqual([])
  })

  it('returns [] when fewer than 2 findings in a category', () => {
    const ctx = { zoneScores: [{ zoneName: 'Z', cats: [{ l: 'X', r: [{ t: 'single finding' }] }] }] }
    expect(checkDuplicateFindings(ctx)).toEqual([])
  })

  it('does not flag below-threshold similarity (different findings)', () => {
    const ctx = {
      zoneScores: [{
        zoneName: 'Zone A',
        cats: [{
          l: 'V',
          r: [
            { t: 'Outdoor air damper closed' },
            { t: 'Particulate accumulation on supply diffuser' },
          ],
        }],
      }],
    }
    expect(checkDuplicateFindings(ctx)).toEqual([])
  })
})

// ─── checkPhotoReferences ─────────────────────────────────────────

describe('checkPhotoReferences', () => {
  it('flags a "Photo N" reference when N exceeds the photo count', () => {
    const ctx = {
      photos: { a: {}, b: {} }, // 2 photos
      narrative: 'See Photo 7 for the suspect surface.',
    }
    const issues = checkPhotoReferences(ctx)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('blocking')
    expect(issues[0].category).toBe('photo_ref_missing')
    expect(issues[0].title).toMatch(/Photo 7/)
  })

  it('handles photos as an array', () => {
    const ctx = {
      photos: [{}, {}, {}], // 3 photos
      recs: { imm: [{ text: 'Re-inspect Photo 5 documented water staining' }] },
    }
    const issues = checkPhotoReferences(ctx)
    expect(issues).toHaveLength(1)
    expect(issues[0].title).toMatch(/Photo 5/)
  })

  it('does not flag references that fit within the photo count', () => {
    const ctx = {
      photos: [{}, {}, {}, {}, {}], // 5 photos
      narrative: 'Photo 3 and Photo 4 document the conditions.',
    }
    expect(checkPhotoReferences(ctx)).toEqual([])
  })

  it('does not crash when photos is null / missing', () => {
    const ctx = { narrative: 'See Photo 1 for the spot.' }
    const issues = checkPhotoReferences(ctx)
    expect(issues).toHaveLength(1)
    expect(issues[0].title).toMatch(/Photo 1/)
  })
})

// ─── checkLabDateSanity ───────────────────────────────────────────

describe('checkLabDateSanity', () => {
  it('flags a sample collected AFTER it was received (date inversion)', () => {
    const ctx = {
      labResults: {
        rows: [
          { sampleId: 'AF-001', collectedAt: '2026-04-15', receivedAt: '2026-04-10' },
        ],
      },
    }
    const issues = checkLabDateSanity(ctx)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('warning')
    expect(issues[0].category).toBe('lab_date_inversion')
    expect(issues[0].title).toMatch(/AF-001/)
  })

  it('flags long holding times (>60 days collected → received) as suggestion', () => {
    const ctx = {
      labResults: {
        rows: [
          { sampleId: 'AF-002', collectedAt: '2026-01-01', receivedAt: '2026-04-01' },
        ],
      },
    }
    const issues = checkLabDateSanity(ctx)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('suggestion')
    expect(issues[0].category).toBe('lab_date_holding_time')
  })

  it('does not flag normal turn-around (1-3 days)', () => {
    const ctx = {
      labResults: {
        rows: [
          { sampleId: 'AF-003', collectedAt: '2026-04-15', receivedAt: '2026-04-17' },
        ],
      },
    }
    expect(checkLabDateSanity(ctx)).toEqual([])
  })

  it('skips rows with missing dates', () => {
    const ctx = {
      labResults: {
        rows: [
          { sampleId: 'AF-004', collectedAt: '', receivedAt: '2026-04-17' },
          { sampleId: 'AF-005' },
        ],
      },
    }
    expect(checkLabDateSanity(ctx)).toEqual([])
  })
})

// ─── checkCitationAntiPatterns ────────────────────────────────────

describe('checkCitationAntiPatterns', () => {
  it('flags ASHRAE 62.1 cited as a CO₂ contaminant limit', () => {
    const ctx = {
      narrative: 'CO2 readings exceed the ASHRAE 62.1 CO2 contaminant limit of 1000 ppm.',
    }
    const issues = checkCitationAntiPatterns(ctx)
    expect(issues.some((i) => i.category === 'anti_pattern_ashrae-62-1-as-co2-limit')).toBe(true)
  })

  it('flags spore counts framed as health proof', () => {
    const ctx = {
      narrative: 'The elevated spore count proves health harm to building occupants.',
    }
    const issues = checkCitationAntiPatterns(ctx)
    expect(issues.some((i) => i.category === 'anti_pattern_spore-count-as-health-proof')).toBe(true)
  })

  it('does not flag a properly-framed ASHRAE 62.1 ventilation reference', () => {
    const ctx = {
      narrative: 'Outdoor air delivery rates were compared to ASHRAE 62.1-2022 minimums for office occupancy.',
    }
    expect(checkCitationAntiPatterns(ctx)).toEqual([])
  })
})

// ─── checkFindingsWithoutRecs ─────────────────────────────────────

describe('checkFindingsWithoutRecs', () => {
  it('flags a critical finding with no matching immediate recommendation', () => {
    const ctx = {
      zoneScores: [{
        zoneName: 'Zone B',
        cats: [{ l: 'HVAC', r: [{ t: 'Active water intrusion in chiller plenum visible during walkthrough', sev: 'critical' }] }],
      }],
      recs: { imm: [{ text: 'Replace HEPA filter cartridge in unit AHU-3' }] },
    }
    const issues = checkFindingsWithoutRecs(ctx)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('warning')
    expect(issues[0].title).toMatch(/Critical/)
    expect(issues[0].title).toMatch(/Zone B/)
  })

  it('does not flag a critical finding that has a clearly matching rec', () => {
    const ctx = {
      zoneScores: [{
        zoneName: 'Zone B',
        cats: [{ l: 'HVAC', r: [{ t: 'Active water intrusion chiller plenum visible walkthrough', sev: 'critical' }] }],
      }],
      recs: { imm: [{ text: 'Arrest active water intrusion in chiller plenum within 48 hours per IICRC S500 walkthrough' }] },
    }
    expect(checkFindingsWithoutRecs(ctx)).toEqual([])
  })

  it('skips low / medium / info findings (only flags critical + high)', () => {
    const ctx = {
      zoneScores: [{
        zoneName: 'Zone C',
        cats: [{ l: 'Vent', r: [{ t: 'Slight breeze felt at return register during walkthrough', sev: 'low' }] }],
      }],
      recs: { imm: [] },
    }
    expect(checkFindingsWithoutRecs(ctx)).toEqual([])
  })
})

// ─── checkPlaceholderText ─────────────────────────────────────────

describe('checkPlaceholderText', () => {
  it('flags empty assessor name as blocking', () => {
    const issues = checkPlaceholderText({ profile: { name: '' } })
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('blocking')
    expect(issues[0].category).toBe('placeholder_name')
  })

  it('flags placeholder names (TBD / TODO / test) as blocking', () => {
    for (const name of ['TBD', 'todo', 'TEST', 'XXX', 'Assessor', 'name']) {
      const issues = checkPlaceholderText({ profile: { name } })
      expect(issues, `expected placeholder for ${name}`).toHaveLength(1)
      expect(issues[0].severity).toBe('blocking')
    }
  })

  it('flags unusually short names as warning', () => {
    const issues = checkPlaceholderText({ profile: { name: 'AB' } })
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('warning')
  })

  it('passes a real assessor name + credentials', () => {
    expect(checkPlaceholderText({ profile: { name: 'J. Smith, CIH, CSP' } })).toEqual([])
  })

  it('falls back to ctx.assessor when profile.name is unset', () => {
    const issues = checkPlaceholderText({ assessor: 'TODO' })
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('blocking')
  })
})

// ─── checkSampleIdDrift ───────────────────────────────────────────

describe('checkSampleIdDrift', () => {
  it('flags lab CSV sample IDs that aren\'t in the field registry', () => {
    const ctx = {
      labResults: { rows: [
        { sampleId: 'AF-001' }, { sampleId: 'AF-002' }, { sampleId: 'UNKNOWN-X' },
      ] },
      zones: [{ samples: [{ id: 'AF-001' }, { id: 'AF-002' }] }],
    }
    const issues = checkSampleIdDrift(ctx)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('suggestion')
    expect(issues[0].title).toMatch(/1 lab sample ID/)
    expect(issues[0].detail).toMatch(/UNKNOWN-X/)
  })

  it('returns [] when every lab ID maps to a field sample', () => {
    const ctx = {
      labResults: { rows: [{ sampleId: 'AF-001' }, { sampleId: 'AF-002' }] },
      zones: [{ samples: [{ id: 'AF-001' }, { id: 'AF-002' }] }],
    }
    expect(checkSampleIdDrift(ctx)).toEqual([])
  })

  it('skips the check when the field registry is empty', () => {
    const ctx = { labResults: { rows: [{ sampleId: 'AF-001' }] } }
    expect(checkSampleIdDrift(ctx)).toEqual([])
  })

  it('matches case-insensitively', () => {
    const ctx = {
      labResults: { rows: [{ sampleId: 'af-001' }] },
      zones: [{ samples: [{ id: 'AF-001' }] }],
    }
    expect(checkSampleIdDrift(ctx)).toEqual([])
  })
})

// ─── runPreReviewChecks + summarizeIssues ────────────────────────

describe('runPreReviewChecks', () => {
  it('composes all checks + sorts by severity (blocking → warning → suggestion)', () => {
    const ctx = {
      profile: { name: 'TBD' },                                     // blocking
      photos: [],                                                    // for photo ref check below
      narrative: 'See Photo 4 for spore growth.',                    // blocking (no photos)
      zoneScores: [{
        zoneName: 'Zone A',
        cats: [{
          l: 'V',
          r: [
            { t: 'Outdoor air damper closed and supply airflow weak', sev: 'high' },
            { t: 'Outdoor air damper closed; supply airflow weak now', sev: 'high' },
          ],
        }],
      }],
      recs: { imm: [] },
      labResults: { rows: [{ sampleId: 'X-1', collectedAt: '2026-04-15', receivedAt: '2026-04-10' }] },
    }
    const issues = runPreReviewChecks(ctx)
    const severities = issues.map((i) => i.severity)
    // Sorted: all blocking first, then warning, then suggestion.
    let lastRank = -1
    for (const s of severities) {
      const rank = s === 'blocking' ? 0 : s === 'warning' ? 1 : 2
      expect(rank).toBeGreaterThanOrEqual(lastRank)
      lastRank = rank
    }
    // We touched 4 checks, expect at least one blocking + one warning.
    expect(severities).toContain('blocking')
    expect(severities).toContain('warning')
  })

  it('returns [] on a clean assessment', () => {
    const ctx = {
      profile: { name: 'Jane Smith, CIH' },
      photos: [{}],
      narrative: 'Outdoor air delivery rates were compared to ASHRAE 62.1-2022 minimums.',
      zoneScores: [],
      recs: { imm: [] },
    }
    expect(runPreReviewChecks(ctx)).toEqual([])
  })
})

describe('summarizeIssues', () => {
  it('counts by severity and exposes hasBlockers', () => {
    const issues = [
      { id: 'a', severity: 'blocking', category: 'x', title: '', detail: '', anchor: {} },
      { id: 'b', severity: 'warning', category: 'x', title: '', detail: '', anchor: {} },
      { id: 'c', severity: 'warning', category: 'x', title: '', detail: '', anchor: {} },
      { id: 'd', severity: 'suggestion', category: 'x', title: '', detail: '', anchor: {} },
    ]
    const s = summarizeIssues(issues)
    expect(s.blockingCount).toBe(1)
    expect(s.warningCount).toBe(2)
    expect(s.suggestionCount).toBe(1)
    expect(s.totalCount).toBe(4)
    expect(s.hasBlockers).toBe(true)
  })

  it('handles empty input', () => {
    const s = summarizeIssues([])
    expect(s.totalCount).toBe(0)
    expect(s.hasBlockers).toBe(false)
  })
})
