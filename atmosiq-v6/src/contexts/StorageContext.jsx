/**
 * AtmosFlow Storage Context
 * Index management, draft/report CRUD, trash operations.
 */

import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react'
import STO from '../utils/storage'
import Backup from '../utils/backup'

const StorageContext = createContext(null)

export function StorageProvider({ children }) {
  const [index, setIndex] = useState({ reports: [], drafts: [] })
  // Site library cache (habit-loop PR 1). Hydrated from
  // localStorage on first refresh; refreshed by the SiteLibraryPanel
  // / SaveSitePrompt after writes to /api/sites.
  const [sites, setSites] = useState([])

  const refreshIndex = useCallback(async () => {
    setIndex(await STO.getIndex())
  }, [])

  // One-time cleanup per session, for installs that already carry the rows
  // two index bugs left behind. `getIndex` self-heals the double-listing
  // (an id in both `reports` and `drafts`); this retires the drafts that
  // were never started. Both are recoverable — the prune soft-deletes.
  // Failure here must never stop the app rendering its report list.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const pruned = await Backup.pruneAbandonedDrafts()
        if (!cancelled && pruned > 0) await refreshIndex()
      } catch (e) {
        console.warn('Draft cleanup skipped:', e && e.message)
      }
    })()
    return () => { cancelled = true }
  }, [refreshIndex])

  const refreshSites = useCallback(async (next) => {
    // Optional `next` arg lets callers atomically pass the just-fetched
    // list from /api/sites without an extra localStorage round-trip.
    if (Array.isArray(next)) {
      await STO.saveSitesCache(next)
      setSites(next)
      return
    }
    setSites(await STO.getSites())
  }, [])

  const deleteItem = useCallback(async (id, name, type) => {
    await Backup.softDelete(id, name, type)
    await refreshIndex()
  }, [refreshIndex])

  const value = useMemo(() => ({
    index, refreshIndex, deleteItem,
    sites, refreshSites,
  }), [index, refreshIndex, deleteItem, sites, refreshSites])

  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>
}

export function useStorage() {
  const ctx = useContext(StorageContext)
  if (!ctx) throw new Error('useStorage must be used within StorageProvider')
  return ctx
}

export default StorageContext
