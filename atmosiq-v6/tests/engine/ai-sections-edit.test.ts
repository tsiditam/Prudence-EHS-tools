// @vitest-environment node
/**
 * The assessor may rewrite an AI section, and the rewrite is CHECKED.
 *
 * This is the third remedy for a section the evidence check blocked, and the
 * only one that answers the check rather than routing around it:
 *
 *   fall back  — silent, costs the reader a paragraph, decides nothing
 *   override   — keeps the prose by WAIVING the finding, and discloses that
 *   edit       — changes the prose so the finding no longer holds
 *
 * It exists because the first production report to hit this had no third
 * option and, being finalized, no second one either: the panel reported that
 * Discussion & Conclusions was dropped for a missing ventilation limitation —
 * quoting the exact sentence that was absent — and offered no control at all,
 * because every remedy was gated behind `aiSectionsLocked`. The lock's job is
 * to stop REGENERATION so an issued report does not read differently when the
 * model is asked again. It was never meant to strand the assessor.
 *
 * What this file pins:
 *   • a revision goes through the SAME audit the generated text did
 *   • an edit that supplies the missing limitation flips the section to
 *     supported, with no override anywhere
 *   • an edit clears any override on that section
 *   • "restore the AI text" reaches the model's FIRST text, with the verdict
 *     it carried, however many revisions happened in between
 *   • a revised section keeps a provenance label, and it is not the one that
 *     names the model alone
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
// @ts-ignore js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-ignore js
import { scoreZone } from '../../src/engines/scoring.js'
// @ts-ignore js
import { buildEvidencePackage } from '../../src/report/evidencePackage.js'
// @ts-ignore js
import {
  buildAiSectionsRecord, applyEdit, removeEdit, isEdited, sectionText, editedSections,
  applyOverride, isOverridden, applyAiSections, lockAiSections, MIN_SECTION_TEXT,
} from '../../src/report/aiSections.js'
// @ts-ignore js
import { DEMO_FINDINGS_BUILDING as BLDG, DEMO_FINDINGS_ZONES as ZONES, DEMO_FINDINGS_PRESURVEY as PRESURVEY } from '../../src/constants/demoDataFindings'

const AT = { assessmentDate: '2026-06-10' }
const REASON = 'The ventilation wording describes a particle pathway, not an adequacy claim.'

function build() {
  const zoneScores = ZONES.map((z: any) => scoreZone(z, { ...BLDG, ...AT }))
  const data = {
    building: BLDG, presurvey: PRESURVEY, zones: ZONES, zoneScores, causalChains: [],
    recs: { imm: [], eng: [], adm: [], mon: [] }, id: 'AIQ-DEMO', ts: '2026-06-10',
  }
  const model = assembleRenderModel(data, { now: new Date('2026-06-11T12:00:00Z') })
  const pkg = buildEvidencePackage(model, { zoneScores, causalChains: [] })
  return { data, model, pkg }
}

// The exact production failure: a Discussion paragraph that raises ventilation
// and never states the caveat the package requires alongside it.
// It raises "ventilation" and carries none of the phrases that satisfy the
// rule (`indicator`, `inferred`, `was not measured`, `not measured directly`,
// `no measurement of` — evidencePackage.js `lim-ventilation-inferred`).
const MISSING_CAVEAT =
  'Carbon dioxide rose through the occupied day in the busiest areas, and the pattern is '
  + 'consistent with ventilation that does not keep pace with occupancy. The condition warrants '
  + 'investigation by the party responsible for the system.'

// The same paragraph with the sentence the audit named appended — which is
// what an assessor does after reading the message, and what makes the claim
// true rather than waived.
const WITH_CAVEAT =
  MISSING_CAVEAT
  + ' No quantified ventilation-rate measurement was made; ventilation adequacy is inferred from '
  + 'CO2 as an indicator only.'

/** A record whose `discussion` is blocked for exactly that missing limitation. */
function blockedRecord(pkg: any) {
  const rec = buildAiSectionsRecord({
    executive_summary: 'Conditions were mixed across the areas assessed, with the clearest pattern in the busiest zones.',
    discussion: MISSING_CAVEAT,
  }, pkg)
  expect(rec.auditSummary.discussion.supported).toBe(false)
  expect(rec.audit.discussion.map((i: any) => i.id)).toContain('limitation-missing')
  return rec
}

describe('an assessor revision is audited like generated text', () => {
  it('supplying the missing limitation makes the section pass, with no override', () => {
    const { pkg } = build()
    const rec = blockedRecord(pkg)
    const next = applyEdit(rec, 'discussion', { text: WITH_CAVEAT, by: 'T. Tamakloe' }, pkg)

    expect(next).not.toBe(rec)
    expect(next.auditSummary.discussion.supported).toBe(true)
    expect(next.audit.discussion).toEqual([])
    // The point of the remedy: no waiver was needed.
    expect(isOverridden(next, 'discussion')).toBe(false)
    expect(sectionText(next, 'discussion')).toBe(WITH_CAVEAT)
  })

  it('a revision that introduces a bad figure is caught exactly like a generated one', () => {
    const { pkg } = build()
    const rec = blockedRecord(pkg)
    const bad = `${WITH_CAVEAT} Carbon dioxide reached 4242 ppm, a figure this assessment never recorded.`
    const next = applyEdit(rec, 'discussion', { text: bad }, pkg)
    expect(next.auditSummary.discussion.supported).toBe(false)
    expect(next.audit.discussion.map((i: any) => i.id)).toContain('figure-unsupported')
  })

  it('records who revised it and when', () => {
    const { pkg } = build()
    const next = applyEdit(blockedRecord(pkg), 'discussion', { text: WITH_CAVEAT, by: 'T. Tamakloe', at: new Date('2026-09-12T15:00:00Z') }, pkg)
    expect(next.edits.discussion.by).toBe('T. Tamakloe')
    expect(next.edits.discussion.at).toBe('2026-09-12T15:00:00.000Z')
  })

  it('fails closed without a package — an unchecked revision is never stored', () => {
    const { pkg } = build()
    const rec = blockedRecord(pkg)
    expect(applyEdit(rec, 'discussion', { text: WITH_CAVEAT }, null as any)).toBe(rec)
    expect(applyEdit(rec, 'discussion', { text: WITH_CAVEAT }, undefined as any)).toBe(rec)
  })

  it('refuses an empty, too-short or unchanged revision', () => {
    const { pkg } = build()
    const rec = blockedRecord(pkg)
    expect(applyEdit(rec, 'discussion', { text: '' }, pkg)).toBe(rec)
    expect(applyEdit(rec, 'discussion', { text: 'x'.repeat(MIN_SECTION_TEXT - 1) }, pkg)).toBe(rec)
    expect(applyEdit(rec, 'discussion', { text: MISSING_CAVEAT }, pkg)).toBe(rec)
  })

  it('refuses a section the model never wrote — this edits AI prose, it is not a report editor', () => {
    const { pkg } = build()
    const rec = blockedRecord(pkg)
    // Absent from `sections`: dropped by the banned-language gate, or never
    // returned. An edit may not conjure one into existence.
    expect(applyEdit(rec, 'conceptual_site_model', { text: WITH_CAVEAT }, pkg)).toBe(rec)
    expect(applyEdit(rec, 'parameter_background.co2', { text: WITH_CAVEAT }, pkg)).toBe(rec)
  })

  it('edits a parameter-background entry through its dotted key', () => {
    const { pkg } = build()
    const rec = buildAiSectionsRecord({
      parameter_background: { co2: 'Carbon dioxide is a proxy for how well outdoor air keeps up with the people in a space.' },
    }, pkg)
    const revised = 'Carbon dioxide indicates how well outdoor air keeps pace with occupancy. It is not itself a contaminant at these levels.'
    const next = applyEdit(rec, 'parameter_background.co2', { text: revised }, pkg)
    expect(sectionText(next, 'parameter_background.co2')).toBe(revised)
    expect(isEdited(next, 'parameter_background.co2')).toBe(true)
  })
})

describe('an edit and an override do not stack', () => {
  it('editing clears an override recorded about the old wording', () => {
    const { pkg } = build()
    const kept = applyOverride(blockedRecord(pkg), 'discussion', { justification: REASON, by: 'T. Tamakloe' })
    expect(isOverridden(kept, 'discussion')).toBe(true)

    // The justification was written about prose that no longer exists.
    // Carrying it forward would disclose an approval of words nobody approved
    // — the same rule that drops an override on regeneration.
    const next = applyEdit(kept, 'discussion', { text: WITH_CAVEAT }, pkg)
    expect(isOverridden(next, 'discussion')).toBe(false)
  })

  it('a revision that still fails can be overridden on its own terms', () => {
    const { pkg } = build()
    const rec = blockedRecord(pkg)
    const stillBad = `${MISSING_CAVEAT} The airflow was not quantified in any of the areas visited.`
    const edited = applyEdit(rec, 'discussion', { text: stillBad }, pkg)
    expect(edited.auditSummary.discussion.supported).toBe(false)

    const kept = applyOverride(edited, 'discussion', { justification: REASON })
    expect(isOverridden(kept, 'discussion')).toBe(true)
    // And the override freezes the CURRENT findings, not the ones the
    // generated text produced.
    expect(kept.overrides.discussion.issues).toEqual(edited.audit.discussion)
  })
})

describe('restoring the AI text', () => {
  it('reaches the model\'s first wording and the verdict it carried', () => {
    const { pkg } = build()
    const rec = blockedRecord(pkg)
    const once = applyEdit(rec, 'discussion', { text: WITH_CAVEAT }, pkg)
    const twice = applyEdit(once, 'discussion', { text: `${WITH_CAVEAT} The pattern was clearest mid-afternoon.` }, pkg)

    const back = removeEdit(twice, 'discussion')
    expect(isEdited(back, 'discussion')).toBe(false)
    expect(sectionText(back, 'discussion')).toBe(MISSING_CAVEAT)
    // The verdict comes back too: a revert must not land the assessor on a
    // different answer than the one they were first shown.
    expect(back.auditSummary.discussion).toEqual(rec.auditSummary.discussion)
    expect(back.audit.discussion).toEqual(rec.audit.discussion)
  })

  it('is a no-op on a section that was never revised', () => {
    const { pkg } = build()
    const rec = blockedRecord(pkg)
    expect(removeEdit(rec, 'discussion')).toBe(rec)
  })
})

describe('a revision reaches the deliverable, and says who wrote it', () => {
  it('renders the assessor\'s text, not the model\'s', () => {
    const { model, pkg } = build()
    const rec = applyEdit(blockedRecord(pkg), 'discussion', { text: WITH_CAVEAT }, pkg)
    const out = applyAiSections(model, rec, pkg)
    expect(out.discussion.paragraphs.join(' ')).toContain('inferred from')
    expect(out.aiAuthoredSections).toContain('discussion')
  })

  it('marks the section edited, so the DOCX cannot caption it as the model alone', () => {
    const { model, pkg } = build()
    const rec = applyEdit(blockedRecord(pkg), 'discussion', { text: WITH_CAVEAT }, pkg)
    const out = applyAiSections(model, rec, pkg)
    // The provenance label states WHO WROTE the text (CLAUDE.md anti-patterns).
    // A paragraph with two authors may not print the one that names one.
    expect(out.aiEditedSections).toEqual(['discussion'])
    expect(editedSections(rec)).toEqual(['discussion'])
  })

  it('never reports an edit on a section that did not render', () => {
    const { model, pkg } = build()
    const rec = blockedRecord(pkg)
    // Revised, but still blocked and not overridden: the section falls back,
    // so disclosing an edit to it would describe text the document does not
    // contain.
    const stillBad = `${MISSING_CAVEAT} Ventilation remains the open question here.`
    const out = applyAiSections(model, applyEdit(rec, 'discussion', { text: stillBad }, pkg), pkg)
    expect(out.aiAuthoredSections).not.toContain('discussion')
    expect(out.aiEditedSections).toEqual([])
  })

  it('a stale record discloses nothing, edits included', () => {
    const { model, pkg } = build()
    const rec = applyEdit(blockedRecord(pkg), 'discussion', { text: WITH_CAVEAT }, pkg)
    const out = applyAiSections(model, { ...rec, fingerprint: 'not-this-assessment' }, pkg)
    expect(out.aiSectionsStatus).toBe('stale')
    expect(out.aiEditedSections).toEqual([])
  })
})

describe('the lock stops regeneration, not the assessor', () => {
  it('the Report tab gates regeneration on the lock, and no remedy', () => {
    // The defect this whole file exists for was in the UI, not the model:
    // `applyOverride` worked on a locked record the entire time, and the
    // button was hidden. Read the source rather than trusting the comment.
    const app = readFileSync(path.join(__dirname, '../../src/components/MobileApp.jsx'), 'utf8')
    const panel = app.slice(app.indexOf('Checked against the assessment record —'))
    const remedies = [
      'Use this section anyway…',   // record an override
      'Edit this section…',          // revise the prose
      'Restore the AI text',         // drop a revision
      'Withdraw override',           // drop a waiver
    ]
    for (const label of remedies) {
      const at = panel.indexOf(label)
      expect(at, `${label} is gone from the Report tab`).toBeGreaterThan(-1)
      // Nothing within the control's own conditional may consult the lock.
      const guard = panel.slice(Math.max(0, at - 400), at)
      expect(guard.includes('aiSectionsLocked'), `${label} is gated on the lock again`).toBe(false)
    }
    // Regeneration, on the other hand, must stay locked.
    expect(app).toMatch(/!aiSectionsLocked[\s\S]{0,200}Regenerate report sections|Regenerate report sections[\s\S]{0,200}/)
    expect(app).toMatch(/!reportSectionsLoading && !aiSectionsLocked/)
  })

  it('a finalized report can still be edited and overridden', () => {
    const { pkg } = build()
    const locked = lockAiSections(blockedRecord(pkg))
    expect(locked.locked).toBe(true)

    // This is the production case: the panel showed a blocked section on an
    // issued report and every control was hidden behind `locked`.
    const edited = applyEdit(locked, 'discussion', { text: WITH_CAVEAT }, pkg)
    expect(edited.auditSummary.discussion.supported).toBe(true)
    expect(edited.locked).toBe(true)

    const kept = applyOverride(locked, 'discussion', { justification: REASON })
    expect(isOverridden(kept, 'discussion')).toBe(true)
    expect(kept.locked).toBe(true)
  })
})
