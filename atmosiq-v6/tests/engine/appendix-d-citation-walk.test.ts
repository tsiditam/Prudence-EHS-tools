/**
 * v2.5 §2 acceptance — Appendix D citation walker.
 *
 * Validates:
 *   1. Walking a structure with at least 5 distinct Citation
 *      references produces at least 5 entries.
 *   2. Duplicate Citations across zones / findings dedupe.
 *   3. Output is alphabetized by organization-display, then by source.
 *   4. Authority codes are expanded per the §2 lookup table.
 *   5. The engine version footer references atmosflow-engine-2.6.0.
 */

import { describe, it, expect } from 'vitest'
import {
  collectCitations,
  formatCitation,
  inferOrganization,
  ORGANIZATION_DISPLAY,
  ENGINE_VERSION_FOOTER,
} from '../../src/engine/report/appendix-d'
import type { Citation } from '../../src/engine/types/citation'

describe('v2.5 §2 — Appendix D citation walker', () => {
  it('walks a nested structure and collects every Citation', () => {
    const tree = {
      a: {
        applicableStandards: [
          { source: 'ASHRAE Standard 62.1', authority: 'consensus' } as Citation,
          { source: '29 CFR 1910.1000 Table Z-1 — CO PEL', authority: 'regulatory' } as Citation,
        ],
      },
      b: [
        {
          applicableStandards: [
            { source: 'NIOSH REL — CO 35 ppm', authority: 'consensus' } as Citation,
            { source: 'EPA NAAQS — PM2.5', authority: 'regulatory' } as Citation,
          ],
        },
      ],
      c: {
        nested: {
          deeper: { source: 'WHO Global Air Quality Guidelines', authority: 'consensus' } as Citation,
        },
      },
    }
    const result = collectCitations(tree)
    expect(result.length).toBeGreaterThanOrEqual(5)
  })

  it('dedupes the same citation appearing under multiple zones', () => {
    const sameSource = { source: 'ASHRAE Standard 62.1', authority: 'consensus' } as Citation
    const tree = {
      zoneA: { findings: [{ applicableStandards: [sameSource] }] },
      zoneB: { findings: [{ applicableStandards: [sameSource] }] },
      zoneC: { findings: [{ applicableStandards: [{ ...sameSource }] }] },
    }
    const result = collectCitations(tree)
    expect(result).toHaveLength(1)
    expect(result[0].source).toContain('ASHRAE Standard 62.1')
  })

  it('promotes RecommendedAction.standardReference strings to citations', () => {
    const tree = {
      actions: [
        {
          priority: 'short_term',
          timeframe: '7–30 days',
          action: 'Verify outdoor air damper position',
          standardReference: 'ASHRAE 62.1-2025',
        },
        {
          priority: 'immediate',
          timeframe: '0–7 days',
          action: 'Arrest active water intrusion',
          standardReference: 'IICRC S500',
        },
      ],
    }
    const result = collectCitations(tree)
    const sources = result.map(c => c.source)
    expect(sources.some(s => s.includes('ASHRAE 62.1-2025'))).toBe(true)
    expect(sources.some(s => s.includes('IICRC S500'))).toBe(true)
  })

  it('sorts entries by organization-display name then by source', () => {
    const tree = {
      misc: [
        { source: 'WHO Global Air Quality Guidelines', authority: 'consensus' } as Citation,
        { source: 'ASHRAE Standard 62.1', authority: 'consensus' } as Citation,
        { source: '29 CFR 1910.1000 Table Z-1 — CO PEL', authority: 'regulatory' } as Citation,
        { source: 'NIOSH REL — CO 35 ppm', authority: 'consensus' } as Citation,
      ],
    }
    const result = collectCitations(tree)
    const orgs = result.map(c => c.organizationDisplay)
    // Sort order: ASHRAE → National Institute for OSH → Occupational SHA → WHO
    expect(orgs).toEqual([...orgs].sort())
  })

  it('expands authority abbreviations per the §2 lookup table', () => {
    expect(ORGANIZATION_DISPLAY.OSHA).toBe('Occupational Safety and Health Administration')
    expect(ORGANIZATION_DISPLAY.NIOSH).toBe('National Institute for Occupational Safety and Health')
    expect(ORGANIZATION_DISPLAY.ACGIH).toBe('American Conference of Governmental Industrial Hygienists')
    expect(ORGANIZATION_DISPLAY.EPA).toBe('U.S. Environmental Protection Agency')
    expect(ORGANIZATION_DISPLAY.WHO).toBe('World Health Organization')
  })

  it('infers organization from source string heuristically', () => {
    expect(inferOrganization('29 CFR 1910.1000 Table Z-1 — CO PEL')).toBe('OSHA')
    expect(inferOrganization('NIOSH Method 2016')).toBe('NIOSH')
    expect(inferOrganization('ACGIH Threshold Limit Value')).toBe('ACGIH')
    expect(inferOrganization('EPA NAAQS — PM2.5')).toBe('EPA')
    expect(inferOrganization('ASHRAE Standard 62.1')).toBe('ASHRAE')
    expect(inferOrganization('WHO Global Air Quality Guidelines')).toBe('WHO')
    expect(inferOrganization('IICRC S500')).toBe('IICRC')
    expect(inferOrganization('ASTM D7338')).toBe('ASTM')
  })

  it('formats a citation with the organization expanded', () => {
    const formatted = formatCitation({
      source: '29 CFR 1910.1000 Table Z-1 — CO PEL',
      organization: 'OSHA',
      organizationDisplay: 'Occupational Safety and Health Administration',
      authority: 'regulatory',
    })
    expect(formatted).toContain('29 CFR 1910.1000 Table Z-1')
    expect(formatted).toContain('Occupational Safety and Health Administration')
  })

  it('engine version footer references the canonical engine version', () => {
    // v2.8.0 — sourced from src/version.js's ENGINE_VERSION_TAG so
    // this pin moves with the engine and stays in sync with the rest
    // of the version assertions across the test suite.
    expect(ENGINE_VERSION_FOOTER).toContain('atmosflow-engine-2.8.0')
  })
})
