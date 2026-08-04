// @vitest-environment jsdom
/**
 * Mold assessment persistence — storage contract.
 *
 * Pins STO's mold collection (getMoldAssessments / saveMoldAssessment /
 * deleteMoldAssessment): upsert-by-id, newest-first, created/updated stamps,
 * delete — and, critically, that it lives in its OWN key and never touches the
 * IAQ reports/drafts index (KEYS.index).
 */
import { describe, it, expect, beforeEach } from 'vitest'
// storage.js is plain JS; import through the .js path.
import STO from '../../src/utils/storage.js'
import { KEYS } from '../../src/utils/storageKeys.js'

beforeEach(() => localStorage.clear())

describe('STO mold assessments', () => {
  it('starts empty and round-trips a saved record with timestamps', async () => {
    expect(await STO.getMoldAssessments()).toEqual([])
    await STO.saveMoldAssessment({ id: 'a', title: 'A', input: { presurvey: {}, zones: [] } })
    const all = await STO.getMoldAssessments()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('a')
    expect(all[0].created_at).toBeTruthy()
    expect(all[0].updated_at).toBeTruthy()
  })

  it('inserts newest-first and upserts by id (no duplicate)', async () => {
    await STO.saveMoldAssessment({ id: 'a', title: 'A' })
    await STO.saveMoldAssessment({ id: 'b', title: 'B' })
    expect((await STO.getMoldAssessments()).map((r: { id: string }) => r.id)).toEqual(['b', 'a'])
    await STO.saveMoldAssessment({ id: 'a', title: 'A2' })
    const all = await STO.getMoldAssessments()
    expect(all).toHaveLength(2)
    expect(all.find((r: { id: string }) => r.id === 'a')?.title).toBe('A2')
  })

  it('deletes by id', async () => {
    await STO.saveMoldAssessment({ id: 'a', title: 'A' })
    await STO.saveMoldAssessment({ id: 'b', title: 'B' })
    await STO.deleteMoldAssessment('a')
    expect((await STO.getMoldAssessments()).map((r: { id: string }) => r.id)).toEqual(['b'])
  })

  it('never pollutes the IAQ reports/drafts index', async () => {
    await STO.saveMoldAssessment({ id: 'a', title: 'A' })
    expect(await STO.getIndex()).toEqual({ reports: [], drafts: [] })
    expect(localStorage.getItem(KEYS.index)).toBeNull()
    expect(localStorage.getItem(KEYS.moldAssessments)).toBeTruthy()
  })
})
