/**
 * AtmosFlow Storage Context
 * Index management, draft/report CRUD, trash operations.
 */

import { createContext, useContext, useState, useCallback, useMemo } from 'react'
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
