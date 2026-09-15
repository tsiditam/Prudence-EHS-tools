// @vitest-environment node
/**
 * Two repairs for a blocked section, and the invariant each one rests on.
 *
 * A section the evidence check could not support has three answers, and they
 * are not interchangeable: falling back is silent and costs the reader a
 * paragraph; an override keeps the prose by WAIVING the finding and
 * disclosing that in the report's QA notes; changing the prose so the finding
 * no longer holds is the only one that answers the check. Until now the third
 * was reachable only by the assessor typing it, so the waiver sat beside the
 * real fix as an equal.
 *
 *   deterministic  `withRequiredLimitations` — for `limitation-missing`, much
 *                  the most common blocker. The rule fires per entry in the
 *                  package's `required_limitations` and the finding carries
 *                  that entry's id, so the missing sentence is a lookup. No
 *                  model, exact words, and it always works.
 *   AI repair      `repairReportSection` — for everything else. The section,
 *                  the exact findings and the same closed package go to the
 *                  model with "change what the findings name and nothing
 *                  else".
 *
 * Both return a PROPOSAL that lands in the section editor. `applyEdit`
 * re-audits it against the same package, so neither can put unreviewed prose
 * into the client's report.
 *
 * The invariant the deterministic fix rests on: every required limitation's
 * own `text` satisfies its own `must_mention` tokens. Asserted over every
 * limitation the package builder produces rather than trusted, because a
 * limitation whose prose drifted from its tokens would give the assessor a
 * fix button that silently does not fix anything.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
// @ts-ignore js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-ignore js
import { scoreZone } from '../../src/engines/scoring.js'
// @ts-ignore js
import { buildEvidencePackage } from '../../src/report/evidencePackage.js'
// @ts-ignore js
import { auditNarrative } from '../../src/report/narrativeAudit.js'
// @ts-ignore js
import {
  buildAiSectionsRecord, applyEdit, applyOverride, isOverridden, removeEdit,
  missingLimitations, withRequiredLimitations, sectionText,
  canRepairSection, recordRepairAttempt, repairAttempts, MAX_REPAIRS_PER_SECTION, needsModelRepair,
} from '../../src/report/aiSections.js'
// @ts-ignore js
import { repairReportSection } from '../../src/engines/reportSections.js'
// @ts-ignore js
import { DEMO_FINDINGS_BUILDING as BLDG, DEMO_FINDINGS_ZONES as ZONES, DEMO_FINDINGS_PRESURVEY as PRESURVEY } from '../../src/constants/demoDataFindings'

const AT = { assessmentDate: '2026-06-10' }

function build() {
  const zoneScores = ZONES.map((z: any) => scoreZone(z, { ...BLDG, ...AT }))
  const data = {
    building: BLDG, presurvey: PRESURVEY, zones: ZONES, zoneScores, causalChains: [],
    recs: { imm: [], eng: [], adm: [], mon: [] }, id: 'AIQ-DEMO', ts: '2026-06-10',
  }
  const model = assembleRenderModel(data, { now: new Date('2026-06-11T12:00:00Z') })
  const pkg: any = buildEvidencePackage(model, { zoneScores, causalChains: [] })
  return { data, pkg }
}

// Names TVOC and says nothing about it not having been judged — the exact
// shape of the Executive Summary blocker a production report hit, which
// raises both the parameter-specific and the TVOC limitation at once.
const TVOC_PROSE =
  'Total VOCs (TVOC) were logged in every zone during the walkthrough.\n\n'
  + 'The readings are carried here so the record of what was collected is complete.'

const blockedOn = (pkg: any) => buildAiSectionsRecord({ discussion: TVOC_PROSE }, pkg)

describe('the invariant the deterministic fix rests on', () => {
  it('every required limitation states the words its own check looks for', () => {
    const { pkg } = build()
    expect(pkg.required_limitations.length).toBeGreaterThan(3)
    for (const lim of pkg.required_limitations) {
      expect(lim.must_mention, `${lim.id} declares no tokens`).toBeTruthy()
      expect(lim.must_mention.length, `${lim.id} declares no tokens`).toBeGreaterThan(0)
      // The tokens, directly: at least one alternative is fully present.
      const lower = String(lim.text).toLowerCase()
      const satisfied = lim.must_mention.some((tokens: string[]) =>
        tokens.every((t) => lower.includes(String(t).toLowerCase())))
      expect(satisfied, `${lim.id}: "${lim.text}" does not state its own tokens`).toBe(true)
      // And through the real rule, so this cannot pass on a re-implementation
      // of a check that has since changed.
      const raised = auditNarrative(lim.text, pkg)
        .filter((i: any) => i.id === 'limitation-missing' && i.where === lim.id)
      expect(raised, `${lim.id} is still reported missing from its own text`).toEqual([])
    }
  })
})

describe('the deterministic fix for a missing limitation', () => {
  it('names the exact sentences the check found absent', () => {
    const { pkg } = build()
    const rec = blockedOn(pkg)
    expect(rec.auditSummary.discussion.supported).toBe(false)
    const missing = missingLimitations(rec, 'discussion', pkg)
    expect(missing.length).toBeGreaterThan(0)
    for (const m of missing) {
      expect(pkg.required_limitations.some((l: any) => l.id === m.id && l.text === m.text)).toBe(true)
    }
  })

  it('clears the finding when the assessor saves it, with no waiver anywhere', () => {
    const { pkg } = build()
    const rec = blockedOn(pkg)
    const proposed = withRequiredLimitations(rec, 'discussion', pkg)
    expect(proposed).toBeTruthy()
    // A proposal only — nothing is written until the edit path takes it.
    expect(sectionText(rec, 'discussion')).toBe(TVOC_PROSE)

    const saved = applyEdit(rec, 'discussion', { text: proposed as string }, pkg)
    expect(saved.auditSummary.discussion.supported).toBe(true)
    expect(saved.audit.discussion.filter((i: any) => i.id === 'limitation-missing')).toEqual([])
    expect(isOverridden(saved, 'discussion')).toBe(false)
  })

  it('keeps the prose it was given and closes on the limitation', () => {
    const { pkg } = build()
    const proposed = withRequiredLimitations(blockedOn(pkg), 'discussion', pkg) as string
    expect(proposed.startsWith('Total VOCs (TVOC) were logged in every zone')).toBe(true)
    // Appended to the closing paragraph, not bolted on as a stub beneath it.
    expect(proposed.split(/\n\s*\n/).length).toBe(2)
  })

  it('offers nothing when no limitation is missing', () => {
    const { pkg } = build()
    const rec = blockedOn(pkg)
    const fixed = applyEdit(rec, 'discussion', { text: withRequiredLimitations(rec, 'discussion', pkg) as string }, pkg)
    expect(missingLimitations(fixed, 'discussion', pkg)).toEqual([])
    expect(withRequiredLimitations(fixed, 'discussion', pkg)).toBeNull()
  })

  it('drops a waiver written about the text it replaces', () => {
    const { pkg } = build()
    const rec = blockedOn(pkg)
    const waived = applyOverride(rec, 'discussion', { justification: 'The limitation is stated in the report already.' })
    expect(isOverridden(waived, 'discussion')).toBe(true)
    const repaired = applyEdit(waived, 'discussion', { text: withRequiredLimitations(waived, 'discussion', pkg) as string }, pkg)
    expect(isOverridden(repaired, 'discussion')).toBe(false)
  })
})

describe('the AI repair', () => {
  let calls: any[] = []
  beforeEach(() => { calls = [] })
  afterEach(() => { vi.unstubAllGlobals() })

  const respond = (body: any, ok = true, status = 200) => {
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      calls.push({ url, body: JSON.parse(init.body) })
      return { ok, status, json: async () => body }
    })
  }

  it('sends the section, its findings and the closed package, and returns the revision', async () => {
    const { data, pkg } = build()
    respond({ section: 'Repaired prose that states the limitation.', language_review: 'passed' })
    const out = await repairReportSection(data, { aiSections: blockedOn(pkg), key: 'discussion' })
    expect(out.error).toBeNull()
    expect(out.text).toBe('Repaired prose that states the limitation.')
    expect(calls.length).toBe(1)
    const sent = calls[0].body.payload
    expect(calls[0].url).toBe('/api/report-sections')
    expect(sent.repair.section).toBe('discussion')
    expect(sent.repair.current_text).toBe(TVOC_PROSE)
    expect(sent.repair.findings.length).toBeGreaterThan(0)
    expect(sent.repair.findings.every((f: any) => f.message)).toBe(true)
    // The same closed universe the section was written from.
    expect(sent.evidence).toBeTruthy()
    expect(sent.evidence.measurements).toBeTruthy()
  })

  it('refuses a section with nothing to answer, without calling the service', async () => {
    const { data, pkg } = build()
    respond({ section: 'anything' })
    const rec = blockedOn(pkg)
    const fixed = applyEdit(rec, 'discussion', { text: withRequiredLimitations(rec, 'discussion', pkg) as string }, pkg)
    const out = await repairReportSection(data, { aiSections: fixed, key: 'discussion' })
    expect(out.text).toBeNull()
    expect(out.error).toMatch(/no finding/i)
    expect(calls.length).toBe(0)
  })

  it('discards a repair the banned-language floor rejected', async () => {
    const { data, pkg } = build()
    respond({ section: 'text', language_review: 'failed' })
    const out = await repairReportSection(data, { aiSections: blockedOn(pkg), key: 'discussion' })
    expect(out.text).toBeNull()
    expect(out.error).toMatch(/language the report may not carry/i)
  })

  it('changes nothing when the repair comes back empty or the call fails', async () => {
    const { data, pkg } = build()
    respond({ section: '   ', language_review: 'passed' })
    expect((await repairReportSection(data, { aiSections: blockedOn(pkg), key: 'discussion' })).text).toBeNull()
    respond({ message: 'The AI service account needs attention.' }, false, 402)
    const out = await repairReportSection(data, { aiSections: blockedOn(pkg), key: 'discussion' })
    expect(out.text).toBeNull()
    expect(out.error).toBe('The AI service account needs attention.')
  })
})

describe('a repair is free, and capped instead of priced', () => {
  it('offers an attempt on a freshly generated section', () => {
    const { pkg } = build()
    const rec = blockedOn(pkg)
    expect(rec.repairs).toBeUndefined()
    expect(repairAttempts(rec, 'discussion')).toBe(0)
    expect(canRepairSection(rec, 'discussion')).toBe(true)
  })

  it('spends the attempt once and does not offer another', () => {
    const { pkg } = build()
    const spent = recordRepairAttempt(blockedOn(pkg), 'discussion')
    expect(repairAttempts(spent, 'discussion')).toBe(MAX_REPAIRS_PER_SECTION)
    expect(canRepairSection(spent, 'discussion')).toBe(false)
    // Per section, not per record: the others are untouched.
    expect(canRepairSection(spent, 'executive_summary')).toBe(true)
  })

  it('never hands an attempt back through an edit, a revert or a waiver', () => {
    const { pkg } = build()
    const rec = blockedOn(pkg)
    const spent = recordRepairAttempt(rec, 'discussion')
    const edited = applyEdit(spent, 'discussion', { text: withRequiredLimitations(spent, 'discussion', pkg) as string }, pkg)
    expect(canRepairSection(edited, 'discussion')).toBe(false)
    expect(canRepairSection(removeEdit(edited, 'discussion'), 'discussion')).toBe(false)
    expect(canRepairSection(applyOverride(spent, 'discussion', { justification: 'Stated in the report already, in the limitations section.' }), 'discussion')).toBe(false)
  })

  it('restores the attempt when the sections are generated again', () => {
    const { pkg } = build()
    const spent = recordRepairAttempt(blockedOn(pkg), 'discussion')
    expect(canRepairSection(spent, 'discussion')).toBe(false)
    // Regeneration builds a fresh record, which carries no spent attempts —
    // the prose the attempt applied to is gone with it.
    const regenerated = blockedOn(pkg)
    expect(canRepairSection(regenerated, 'discussion')).toBe(true)
  })

  it('leaves the record untouched when there is nothing to spend it on', () => {
    const { pkg } = build()
    const rec = blockedOn(pkg)
    expect(recordRepairAttempt(rec, null as any)).toBe(rec)
    expect(recordRepairAttempt(null as any, 'discussion')).toBeNull()
  })
})

describe('the two repairs are not alternatives', () => {
  it('asks for no model call when the exact fix answers every blocker', () => {
    const { pkg } = build()
    const rec = blockedOn(pkg)
    // The screenshot's case: both blockers are missing limitations, so the
    // deterministic repair covers the row completely.
    const blockers = rec.audit.discussion.filter((i: any) => i.severity === 'blocking')
    expect(blockers.length).toBeGreaterThan(0)
    expect(blockers.every((i: any) => i.id === 'limitation-missing')).toBe(true)
    expect(needsModelRepair(rec, 'discussion')).toBe(false)
  })

  it('asks for one when a blocker the exact fix cannot answer is present', () => {
    const { pkg } = build()
    const rec = blockedOn(pkg)
    const withFigure = applyEdit(rec, 'discussion', {
      text: `${TVOC_PROSE}\n\nCarbon dioxide reached 4242 ppm, a figure this assessment never recorded.`,
    }, pkg)
    const ids = withFigure.audit.discussion.map((i: any) => i.id)
    expect(ids).toContain('figure-unsupported')
    expect(needsModelRepair(withFigure, 'discussion')).toBe(true)
  })

  it('counts blockers only — a warning beside a limitation does not summon one', () => {
    const rec: any = {
      audit: { discussion: [
        { id: 'limitation-missing', severity: 'blocking', message: 'x' },
        { id: 'style-note', severity: 'warning', message: 'y' },
      ] },
    }
    expect(needsModelRepair(rec, 'discussion')).toBe(false)
  })

  it('offers nothing for a section with no findings at all', () => {
    expect(needsModelRepair({ audit: { discussion: [] } } as any, 'discussion')).toBe(false)
    expect(needsModelRepair(null as any, 'discussion')).toBe(false)
  })
})
