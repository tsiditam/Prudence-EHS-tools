/**
 * @vitest-environment jsdom
 *
 * The report index invariant: ONE id, ONE list.
 *
 * `reports` and `drafts` are disjoint. Nothing asserted that, and the
 * consequence reached the dashboard: tapping "Fix" on a finalized report
 * points draftId at the report's own `rpt-` id, and the autosave 1.2s later
 * indexed it as a draft. Each writer deduplicated only within its own list.
 * One assessment, two cards, counted twice in "N total" and the nav badge.
 *
 * Also covered: a draft is not created for an assessment that was opened
 * and never started — the "Untitled" rows that accumulated for the life of
 * an install because nothing pruned them.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import STO from '../../src/utils/storage'
import { KEYS } from '../../src/utils/storageKeys'
import Backup from '../../src/utils/backup'
import { hasDraftContent, isAbandonedDraft } from '../../src/utils/draftContent'

beforeEach(() => { localStorage.clear() })

const inBoth = (idx: any) => {
  const r = new Set(idx.reports.map((x: any) => x.id))
  return idx.drafts.filter((d: any) => r.has(d.id)).map((d: any) => d.id)
}

describe('one id, one list', () => {
  it('the autosave on a resumed report does not mint a second card', async () => {
    const rid = 'rpt-1'
    await STO.addReportToIndex({ id: rid, ts: '2026-08-22', facility: 'Summani Plaza', findings: 1 })

    // resumeAndFix -> draftId = 'rpt-1' -> autosave fires
    await STO.addDraftToIndex({ id: rid, facility: 'Summani Plaza', ua: '2026-08-22' })

    const idx: any = await STO.getIndex()
    expect(inBoth(idx)).toEqual([])
    expect(idx.drafts).toHaveLength(0)
    // ...and the finalized report is still there. Enforcing the invariant
    // the other way round would have deleted it mid-edit.
    expect(idx.reports.map((r: any) => r.id)).toEqual([rid])
    expect(idx.reports[0].findings).toBe(1)
  })

  it('the WRITER keeps the lists disjoint, not just the reader', async () => {
    // Without this, the suite passes with addDraftToIndex still broken:
    // getIndex()'s self-heal strips the duplicate before any assertion
    // sees it. Defence in depth is right, but it must not be the only
    // defence — read the stored index raw, with no heal in between.
    await STO.addReportToIndex({ id: 'rpt-1', ts: '2026-08-22', facility: 'Summani Plaza', findings: 1 })
    await STO.addDraftToIndex({ id: 'rpt-1', facility: 'Summani Plaza', ua: '2026-08-22' })

    const raw = JSON.parse(localStorage.getItem(KEYS.index) as string)
    expect(raw.drafts.map((d: any) => d.id)).toEqual([])
    expect(raw.reports.map((r: any) => r.id)).toEqual(['rpt-1'])
  })

  it('a rename during the fix reaches the report row', async () => {
    await STO.addReportToIndex({ id: 'rpt-1', ts: '2026-08-22', facility: 'Old Name', findings: 2 })
    await STO.addDraftToIndex({ id: 'rpt-1', facility: 'New Name', ua: '2026-08-22' })
    const idx: any = await STO.getIndex()
    expect(idx.reports[0].facility).toBe('New Name')
    // ts and the census belong to the finalize, not the autosave.
    expect(idx.reports[0].ts).toBe('2026-08-22')
    expect(idx.reports[0].findings).toBe(2)
  })

  it('finalizing promotes a draft rather than leaving one behind', async () => {
    await STO.addDraftToIndex({ id: 'draft-1', facility: 'Summani Plaza', ua: '2026-08-22' })
    await STO.addReportToIndex({ id: 'draft-1', ts: '2026-08-22', facility: 'Summani Plaza', findings: 0 })
    const idx: any = await STO.getIndex()
    expect(idx.drafts).toHaveLength(0)
    expect(idx.reports).toHaveLength(1)
  })

  it('heals an index already corrupted, keeping the report', async () => {
    // Written the way the old code left it — bypassing today's writers.
    await STO.saveIndex({
      reports: [{ id: 'rpt-1', ts: '2026-08-22', facility: 'Summani Plaza', findings: 1 }],
      drafts: [
        { id: 'rpt-1', facility: 'Summani Plaza', ua: '2026-08-22' },
        { id: 'draft-9', facility: 'Other Site', ua: '2026-08-22' },
      ],
    })
    const idx: any = await STO.getIndex()
    expect(inBoth(idx)).toEqual([])
    expect(idx.reports.map((r: any) => r.id)).toEqual(['rpt-1'])
    expect(idx.drafts.map((d: any) => d.id)).toEqual(['draft-9'])   // unrelated draft untouched
    // The heal is persisted, not just returned.
    const raw: any = await STO.get(KEYS.index)
    expect(raw.drafts.map((d: any) => d.id)).toEqual(['draft-9'])
  })

  it('a clean index is not rewritten on every read', async () => {
    await STO.addDraftToIndex({ id: 'draft-1', facility: 'A', ua: '2026-08-22' })
    const before = localStorage.getItem(KEYS.index)
    await STO.getIndex()
    expect(localStorage.getItem(KEYS.index)).toBe(before)
  })
})

describe('an assessment that was opened but never started is not a draft', () => {
  it('the blank state proceedAfterDisclaimer creates is not content', () => {
    // bldg {} and one seeded empty zone is exactly what tapping
    // "New Assessment" produces.
    expect(hasDraftContent({ bldg: {}, zones: [{}], equipment: [], photos: {} })).toBe(false)
  })

  it('presurvey alone is not content — it is pre-filled from the profile', () => {
    expect(hasDraftContent({
      bldg: {}, zones: [{}],
      presurvey: { ps_assessor: 'Tsidi Tamakloe', ps_recipient_name: 'Jane Owner' },
    } as never)).toBe(false)
  })

  it('anything the assessor actually enters IS content', () => {
    expect(hasDraftContent({ bldg: { fn: 'Summani Plaza' }, zones: [{}] })).toBe(true)
    expect(hasDraftContent({ bldg: {}, zones: [{ zn: 'Front Office' }] })).toBe(true)
    expect(hasDraftContent({ bldg: {}, zones: [{}, { co2: '900' }] })).toBe(true)
    expect(hasDraftContent({ bldg: {}, zones: [{}], photos: { 'z0-wd': [{ label: 'stain' }] } })).toBe(true)
    expect(hasDraftContent({ bldg: {}, zones: [{}], equipment: [{ kind: 'AHU' }] })).toBe(true)
    expect(hasDraftContent({ bldg: {}, zones: [{}], sensorData: { graphs: [] } })).toBe(true)
  })

  it('whitespace is not content', () => {
    expect(hasDraftContent({ bldg: { fn: '   ' }, zones: [{ zn: '' }] })).toBe(false)
    expect(isAbandonedDraft({ bldg: { fn: '   ' }, zones: [{ zn: '' }] })).toBe(true)
  })
})

describe('pruning the drafts that already accumulated', () => {
  it('retires the empty ones, keeps the real ones, and is recoverable', async () => {
    await STO.set('draft-empty', { id: 'draft-empty', bldg: {}, zones: [{}] })
    await STO.set('draft-real', { id: 'draft-real', bldg: { fn: 'Summani Plaza' }, zones: [{ zn: 'Lobby' }] })
    await STO.addDraftToIndex({ id: 'draft-empty', facility: 'Untitled', ua: '2026-08-22' })
    await STO.addDraftToIndex({ id: 'draft-real', facility: 'Summani Plaza', ua: '2026-08-22' })

    const pruned = await Backup.pruneAbandonedDrafts()
    expect(pruned).toBe(1)

    const idx: any = await STO.getIndex()
    expect(idx.drafts.map((d: any) => d.id)).toEqual(['draft-real'])
    expect(await STO.get('draft-real')).toBeTruthy()

    // Soft, not hard: 30-day Trash, same as any other delete.
    const trash = await Backup.listTrash()
    expect(trash.map((t: any) => t.id)).toContain('draft-empty')
  })

  it('clears an orphaned index row whose body is gone', async () => {
    await STO.addDraftToIndex({ id: 'draft-orphan', facility: 'Untitled', ua: '2026-08-22' })
    expect(await Backup.pruneAbandonedDrafts()).toBe(1)
    expect((await STO.getIndex()).drafts).toHaveLength(0)
  })

  it('never touches finalized reports', async () => {
    await STO.set('rpt-1', { id: 'rpt-1', building: { fn: 'Summani Plaza' }, zones: [{ zn: 'Lobby' }], zoneScores: [{ cats: [] }] })
    await STO.addReportToIndex({ id: 'rpt-1', ts: '2026-08-22', facility: 'Summani Plaza', findings: 1 })
    expect(await Backup.pruneAbandonedDrafts()).toBe(0)
    expect((await STO.getIndex()).reports).toHaveLength(1)
    expect(await STO.get('rpt-1')).toBeTruthy()
  })
})
