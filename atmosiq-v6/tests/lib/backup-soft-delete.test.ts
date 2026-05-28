/**
 * @vitest-environment jsdom
 *
 * Backup.softDelete must always remove an item from the active index —
 * including ORPHANED entries whose body was lost (e.g. an interrupted
 * finalize STO.del'd the body but left the index entry). Previously it
 * returned early on a missing body, leaving an undeletable phantom report.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import Backup from '../../src/utils/backup.js'
import STO from '../../src/utils/storage.js'

beforeEach(() => { localStorage.clear() })

describe('Backup.softDelete', () => {
  it('removes a normal report and stashes it in trash', async () => {
    await STO.set('rpt-1', { id: 'rpt-1', comp: { tot: 40 } })
    await STO.saveIndex({ reports: [{ id: 'rpt-1', facility: 'A' }], drafts: [] })

    const ok = await Backup.softDelete('rpt-1', 'A', 'rpt')
    expect(ok).toBe(true)

    const idx = await STO.getIndex()
    expect(idx.reports.find((r: { id: string }) => r.id === 'rpt-1')).toBeUndefined()
    const trash = await Backup.listTrash()
    expect(trash.some((t: { id: string }) => t.id === 'rpt-1')).toBe(true)
  })

  it('removes an ORPHANED index entry whose body is missing (the bug)', async () => {
    // Index lists rpt-2 but there is no body for it.
    await STO.saveIndex({ reports: [{ id: 'rpt-2', facility: 'Ghost' }], drafts: [] })
    expect(await STO.get('rpt-2')).toBeNull()

    const ok = await Backup.softDelete('rpt-2', 'Ghost', 'rpt')
    expect(ok).toBe(true)

    const idx = await STO.getIndex()
    expect(idx.reports.find((r: { id: string }) => r.id === 'rpt-2')).toBeUndefined()
    // Nothing to recover, so it should not be added to trash.
    const trash = await Backup.listTrash()
    expect(trash.some((t: { id: string }) => t.id === 'rpt-2')).toBe(false)
  })

  it('prunes the id from BOTH lists (duplicate finalize could leave it in each)', async () => {
    await STO.set('rpt-3', { id: 'rpt-3' })
    await STO.saveIndex({ reports: [{ id: 'rpt-3' }], drafts: [{ id: 'rpt-3' }] })

    await Backup.softDelete('rpt-3', 'Dup', 'rpt')

    const idx = await STO.getIndex()
    expect(idx.reports.some((r: { id: string }) => r.id === 'rpt-3')).toBe(false)
    expect(idx.drafts.some((d: { id: string }) => d.id === 'rpt-3')).toBe(false)
  })
})
