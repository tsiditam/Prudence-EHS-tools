/**
 * The report lifecycle.
 *
 * Three properties are worth defending here, and only one of them is
 * obvious from reading the module:
 *
 *   1. A SCREENING report can be finished. That is the whole point of the
 *      refactor — no watermark, no "pending", no language implying the
 *      document is incomplete.
 *   2. The legacy `status` vocabulary survives. Six call sites in
 *      supabaseStorage.js split drafts from reports on 'complete', so a
 *      broken round-trip breaks the dashboard, the history view and the
 *      full-sync index at once.
 *   3. The compliance gate blocks the SHORTCUT, not the path. A
 *      compliance report must reach Final through a reviewer; it must not
 *      be prevented from reaching Final at all.
 */
import { describe, it, expect } from 'vitest'
import {
  REPORT_PROFILES,
  REPORT_STATUS,
  REPORT_PROFILE_VALUES,
  REPORT_STATUS_VALUES,
  TRANSITIONS,
  canTransition,
  requiresApproval,
  statusLabel,
  profileLabel,
  statusTone,
  reportChrome,
  limitationStatement,
  SCREENING_LIMITATION,
  toLegacyStatus,
  fromLegacyStatus,
  resolveLifecycle,
  buildApprovedVersion,
  DEFAULT_PROFILE,
  DEFAULT_STATUS,
} from '../../src/constants/reportLifecycle'

const { SCREENING, PROFESSIONAL, COMPLIANCE } = REPORT_PROFILES
const { DRAFT, IN_REVIEW, REVIEWED, FINAL } = REPORT_STATUS

describe('shape', () => {
  it('defaults a new report to a screening draft', () => {
    expect(DEFAULT_PROFILE).toBe(SCREENING)
    expect(DEFAULT_STATUS).toBe(DRAFT)
  })

  it('gives every status a transition entry, so no state is a dead end by omission', () => {
    for (const s of REPORT_STATUS_VALUES) {
      expect(TRANSITIONS[s], `no transitions declared for ${s}`).toBeDefined()
    }
    // Final is terminal on purpose — reissuing is a new report.
    expect(TRANSITIONS[FINAL]).toEqual([])
  })
})

describe('canTransition', () => {
  it('walks the happy path for a professional report', () => {
    expect(canTransition(PROFESSIONAL, DRAFT, IN_REVIEW).ok).toBe(true)
    expect(canTransition(PROFESSIONAL, IN_REVIEW, REVIEWED).ok).toBe(true)
    expect(canTransition(PROFESSIONAL, REVIEWED, FINAL).ok).toBe(true)
  })

  it('lets a screening report go straight to Final without a reviewer', () => {
    // A screening assessment never had a reviewer, so requiring one to
    // finish it is exactly the bug being fixed.
    expect(canTransition(SCREENING, DRAFT, FINAL).ok).toBe(true)
  })

  it('lets a reviewer send a report back to Draft', () => {
    expect(canTransition(PROFESSIONAL, IN_REVIEW, DRAFT).ok).toBe(true)
    expect(canTransition(PROFESSIONAL, REVIEWED, DRAFT).ok).toBe(true)
  })

  it('refuses to skip review states', () => {
    const r = canTransition(PROFESSIONAL, DRAFT, REVIEWED)
    expect(r.ok).toBe(false)
    expect((r as { reason: string }).reason).toMatch(/cannot move directly/i)
  })

  it('treats Final as terminal', () => {
    for (const to of REPORT_STATUS_VALUES) {
      expect(canTransition(PROFESSIONAL, FINAL, to).ok).toBe(false)
    }
  })

  it('rejects a no-op and unknown values rather than silently allowing them', () => {
    expect(canTransition(PROFESSIONAL, DRAFT, DRAFT).ok).toBe(false)
    expect(canTransition('bogus', DRAFT, FINAL).ok).toBe(false)
    expect(canTransition(PROFESSIONAL, 'bogus', FINAL).ok).toBe(false)
    expect(canTransition(PROFESSIONAL, DRAFT, 'bogus').ok).toBe(false)
  })
})

describe('the compliance gate', () => {
  it('applies to compliance only', () => {
    expect(requiresApproval(COMPLIANCE)).toBe(true)
    expect(requiresApproval(PROFESSIONAL)).toBe(false)
    expect(requiresApproval(SCREENING)).toBe(false)
  })

  it('blocks draft → final without a recorded approval', () => {
    const r = canTransition(COMPLIANCE, DRAFT, FINAL)
    expect(r.ok).toBe(false)
    expect((r as { reason: string }).reason).toMatch(/requires a recorded reviewer approval/i)
  })

  it('blocks the path even from Reviewed when no approval is recorded', () => {
    // Being in the reviewed STATE is not the same as having an approval
    // row; the gate checks the record, not the label.
    expect(canTransition(COMPLIANCE, REVIEWED, FINAL).ok).toBe(false)
  })

  it('opens once an approval exists', () => {
    expect(canTransition(COMPLIANCE, REVIEWED, FINAL, { hasApproval: true }).ok).toBe(true)
  })

  it('does not gate screening or professional reports', () => {
    expect(canTransition(SCREENING, DRAFT, FINAL).ok).toBe(true)
    expect(canTransition(PROFESSIONAL, DRAFT, FINAL).ok).toBe(true)
  })
})

describe('legacy status compatibility', () => {
  it('maps the lifecycle onto the two-state column', () => {
    expect(toLegacyStatus(DRAFT)).toBe('draft')
    expect(toLegacyStatus(IN_REVIEW)).toBe('draft')
    expect(toLegacyStatus(REVIEWED)).toBe('complete')
    expect(toLegacyStatus(FINAL)).toBe('complete')
  })

  it('never emits a value the old code cannot read', () => {
    for (const s of REPORT_STATUS_VALUES) {
      expect(['draft', 'complete']).toContain(toLegacyStatus(s))
    }
    // Including junk — the mapping is total.
    expect(['draft', 'complete']).toContain(toLegacyStatus('anything'))
  })

  it('round-trips the two states that legacy storage can represent', () => {
    expect(fromLegacyStatus(toLegacyStatus(DRAFT))).toBe(DRAFT)
    expect(fromLegacyStatus(toLegacyStatus(FINAL))).toBe(FINAL)
  })

  it('does not invent a review that never happened', () => {
    // 'complete' becomes Final, NOT Reviewed. An existing report was
    // issued without a recorded reviewer; claiming otherwise would
    // fabricate an approval in the audit trail.
    expect(fromLegacyStatus('complete')).toBe(FINAL)
    expect(fromLegacyStatus('complete')).not.toBe(REVIEWED)
  })

  it('treats anything unrecognised as a draft', () => {
    expect(fromLegacyStatus(undefined)).toBe(DRAFT)
    expect(fromLegacyStatus('')).toBe(DRAFT)
    expect(fromLegacyStatus('weird')).toBe(DRAFT)
  })
})

describe('resolveLifecycle', () => {
  it('reads a record written before this lifecycle existed', () => {
    expect(resolveLifecycle({ status: 'complete' })).toEqual({ profile: SCREENING, status: FINAL })
    expect(resolveLifecycle({ status: 'draft' })).toEqual({ profile: SCREENING, status: DRAFT })
  })

  it('prefers the explicit lifecycle columns when present', () => {
    expect(resolveLifecycle({ status: 'draft', report_profile: COMPLIANCE, report_status: IN_REVIEW }))
      .toEqual({ profile: COMPLIANCE, status: IN_REVIEW })
  })

  it('accepts the camelCase app shape as well as the snake_case row', () => {
    expect(resolveLifecycle({ reportProfile: PROFESSIONAL, reportStatus: REVIEWED }))
      .toEqual({ profile: PROFESSIONAL, status: REVIEWED })
  })

  it('falls back rather than propagating an invalid stored value', () => {
    expect(resolveLifecycle({ report_profile: 'nonsense', report_status: 'nonsense', status: 'complete' }))
      .toEqual({ profile: SCREENING, status: FINAL })
  })

  it('handles an empty record', () => {
    expect(resolveLifecycle()).toEqual({ profile: SCREENING, status: DRAFT })
  })
})

describe('chrome', () => {
  const NO_GO = /IH Review Required|pending professional review|pending review/i

  it('gives a finished screening report no watermark and no pending language', () => {
    for (const status of [REVIEWED, FINAL]) {
      const c = reportChrome(SCREENING, status, { reportId: 'RPT-1', client: 'Acme' })
      expect(c.watermark, `${status} carried a watermark`).toBeNull()
      expect(c.coverDisclaimer).toBeNull()
      expect(JSON.stringify(c)).not.toMatch(NO_GO)
    }
  })

  it('does not put "pending professional review" on a screening draft', () => {
    // It IS a draft, so it says Draft — but a screening report never had
    // a professional reviewer to be pending on.
    const c = reportChrome(SCREENING, DRAFT, { reportId: 'RPT-1' })
    expect(c.headerLabel).toBe('Draft')
    expect(c.watermark).toBe('DRAFT')
    expect(JSON.stringify(c)).not.toMatch(NO_GO)
  })

  it('does say pending review on a professional draft, where it is true', () => {
    const c = reportChrome(PROFESSIONAL, DRAFT, { reportId: 'RPT-1' })
    expect(c.headerLabel).toBe('Draft — Pending Professional Review')
    expect(c.coverStatusChip).toBe('Draft — Pending Professional Review')
  })

  it('names the reviewer on a professionally reviewed report', () => {
    const c = reportChrome(PROFESSIONAL, REVIEWED, {
      reportId: 'RPT-9',
      reviewer: { name: 'Tsidi Tamakloe', credentials: 'CSP' },
    })
    expect(c.headerLabel).toBe('Professionally Reviewed')
    expect(c.watermark).toBeNull()
    expect(c.footerNote).toContain('Tsidi Tamakloe, CSP')
  })

  it('keeps the reviewed footer clean when no reviewer name is supplied', () => {
    const c = reportChrome(PROFESSIONAL, REVIEWED, { reportId: 'RPT-9' })
    expect(c.footerNote).toContain('Professionally reviewed')
    expect(c.footerNote).not.toContain('—  ')
  })

  it('preserves the final chrome the renderer already shipped', () => {
    const c = reportChrome(SCREENING, FINAL, { reportId: 'RPT-2', client: 'Northgate' })
    expect(c.headerLabel).toBe('Confidential — Final')
    expect(c.coverStatusChip).toBe('Final')
    expect(c.footerNote).toBe('RPT-2  ·  Confidential — prepared for Northgate')
  })

  it('returns the full chrome shape for every profile × status', () => {
    for (const p of REPORT_PROFILE_VALUES) {
      for (const s of REPORT_STATUS_VALUES) {
        const c = reportChrome(p, s, { reportId: 'X' })
        expect(Object.keys(c).sort()).toEqual(
          ['coverDisclaimer', 'coverStatusChip', 'footerNote', 'headerLabel', 'watermark'],
        )
      }
    }
  })
})

describe('labels and limitation text', () => {
  it('labels the lifecycle in the words the product uses', () => {
    expect(statusLabel(PROFESSIONAL, IN_REVIEW)).toBe('In Review')
    expect(statusLabel(PROFESSIONAL, REVIEWED)).toBe('Professionally Reviewed')
    expect(statusLabel(SCREENING, FINAL)).toBe('Final')
    expect(statusLabel(SCREENING, DRAFT)).toBe('Draft')
    expect(profileLabel(COMPLIANCE)).toBe('Compliance Assessment')
    expect(profileLabel(undefined)).toBe('IAQ Assessment')
  })

  it('carries the limitation statement verbatim on screening reports', () => {
    expect(limitationStatement(SCREENING)).toBe(SCREENING_LIMITATION)
    expect(limitationStatement(PROFESSIONAL)).toBeNull()
  })

  it('states scope without claiming a compliance determination', () => {
    // The screening-only positioning now rests on this sentence rather
    // than on a draft watermark, so its content is load-bearing.
    expect(SCREENING_LIMITATION).toContain('measured environmental conditions')
    expect(SCREENING_LIMITATION).toContain('should not be interpreted as a regulatory compliance determination')
    expect(SCREENING_LIMITATION).not.toMatch(/IH Review Required/i)
  })

  it('gives every status a tone the UI can map', () => {
    for (const s of REPORT_STATUS_VALUES) {
      expect(['ok', 'accent', 'notice', 'muted']).toContain(statusTone(s))
    }
  })
})

describe('buildApprovedVersion', () => {
  it('freezes the version set that the audit record needs', () => {
    const v = buildApprovedVersion({
      engineVersion: '2.8.0',
      appVersion: '6.0.0-beta',
      standardsManifestDate: '2026-04-25',
      rulesetVersion: 'rs-1',
    })
    expect(v).toEqual({
      engine_version: '2.8.0',
      app_version: '6.0.0-beta',
      standards_manifest_date: '2026-04-25',
      ruleset_version: 'rs-1',
      calculation_version: '2.8.0',
    })
  })

  it('yields an explicit null rather than an absent key when unknown', () => {
    // A missing key would read as "not captured"; null reads as
    // "captured, and there was nothing" — different claims in an audit.
    const v = buildApprovedVersion()
    expect(Object.keys(v).sort()).toEqual([
      'app_version', 'calculation_version', 'engine_version',
      'ruleset_version', 'standards_manifest_date',
    ])
    expect(Object.values(v).every((x) => x === null)).toBe(true)
  })
})
