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

  const refreshIndex = useCallback(async () => {
    setIndex(await STO.getIndex())
  }, [])

  const deleteItem = useCallback(async (id, name, type) => {
    await Backup.softDelete(id, name, type)
    await refreshIndex()
  }, [refreshIndex])

  const value = useMemo(() => ({
    index, refreshIndex, deleteItem,
  }), [index, refreshIndex, deleteItem])

  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>
}

export function useStorage() {
  const ctx = useContext(StorageContext)
  if (!ctx) throw new Error('useStorage must be used within StorageProvider')
  return ctx
}

export default StorageContext
