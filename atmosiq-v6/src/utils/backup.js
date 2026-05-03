/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Backup & Recovery — export, import, soft delete with 30-day recovery
 */

import STO from './storage'
import { APP_VERSION } from '../version'

const TRASH_KEY = 'atmosiq-trash'
const TRASH_TTL_DAYS = 30

const Backup = {
  // ── Full Data Export ──
  // Creates a downloadable JSON file with ALL user data
  async exportAll() {
    const data = {
      exportedAt: new Date().toISOString(),
      version: APP_VERSION,
      platform: 'atmosiq',
    }

    // Index
    data.index = await STO.getIndex()

    // Profile
    data.profile = await STO.get('atmosiq-profile')

    // All reports
    data.reports = []
    for (const r of (data.index.reports || [])) {
      const rpt = await STO.get(r.id)
      if (rpt) data.reports.push(rpt)
    }

    // All drafts
    data.drafts = []
    for (const d of (data.index.drafts || [])) {
      const draft = await STO.get(d.id)
      if (draft) data.drafts.push(draft)
    }

    // Trash (include for full backup)
    data.trash = await STO.get(TRASH_KEY) || []

    return data
  },

  // Download backup as JSON file
  async downloadBackup() {
    const data = await this.exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    const facility = data.index?.reports?.[0]?.facility || 'backup'
    a.href = url
    a.download = `atmosiq-backup-${facility.replace(/\s+/g, '-').slice(0, 30)}-${date}.json`
    a.click()
    URL.revokeObjectURL(url)
    return true
  },

  // ── Import from backup file ──
  async importBackup(jsonData) {
    if (!jsonData?.platform || jsonData.platform !== 'atmosiq') {
      throw new Error('Invalid backup file — not an AtmosFlow export')
    }

    let imported = { reports: 0, drafts: 0 }

    // Import profile
    if (jsonData.profile) {
      await STO.set('atmosiq-profile', jsonData.profile)
    }

    // Import reports
    for (const rpt of (jsonData.reports || [])) {
      if (rpt.id) {
        await STO.set(rpt.id, rpt)
        await STO.addReportToIndex({
          id: rpt.id,
          ts: rpt.ts || rpt.created_at,
          facility: rpt.building?.fn || rpt.facility_name,
          score: rpt.comp?.tot || rpt.composite?.tot || rpt.score,
        })
        imported.reports++
      }
    }

    // Import drafts
    for (const draft of (jsonData.drafts || [])) {
      if (draft.id) {
        await STO.set(draft.id, draft)
        await STO.addDraftToIndex({
          id: draft.id,
          facility: draft.bldg?.fn || draft.building?.fn || 'Imported',
          ua: draft.ua || draft.updated_at || new Date().toISOString(),
        })
        imported.drafts++
      }
    }

    return imported
  },

  // ── Soft Delete (30-day recovery) ──
  async softDelete(id, name, type) {
    // Get the data before removing
    const data = await STO.get(id)
    if (!data) return false

    // Add to trash with expiration
    const trash = await STO.get(TRASH_KEY) || []
    trash.push({
      id,
      name: name || 'Untitled',
      type, // 'rpt' or 'dft'
      deletedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + TRASH_TTL_DAYS * 86400000).toISOString(),
      data,
    })
    await STO.set(TRASH_KEY, trash)

    // Remove from active storage
    await STO.del(id)
    const idx = await STO.getIndex()
    if (type === 'rpt') idx.reports = (idx.reports || []).filter(r => r.id !== id)
    else idx.drafts = (idx.drafts || []).filter(d => d.id !== id)
    await STO.saveIndex(idx)

    return true
  },

  // List trash items (auto-purge expired)
  async listTrash() {
    const trash = await STO.get(TRASH_KEY) || []
    const now = new Date()
    const active = trash.filter(t => new Date(t.expiresAt) > now)
    // Purge expired
    if (active.length !== trash.length) {
      await STO.set(TRASH_KEY, active)
    }
    return active
  },

  // Recover from trash
  async recover(id) {
    const trash = await STO.get(TRASH_KEY) || []
    const item = trash.find(t => t.id === id)
    if (!item) return false

    // Restore data
    await STO.set(item.id, item.data)

    // Restore to index
    if (item.type === 'rpt') {
      await STO.addReportToIndex({
        id: item.id,
        ts: item.data.ts || item.data.created_at,
        facility: item.data.building?.fn || item.data.facility_name,
        score: item.data.comp?.tot || item.data.composite?.tot,
      })
    } else {
      await STO.addDraftToIndex({
        id: item.id,
        facility: item.data.bldg?.fn || item.data.building?.fn || 'Recovered',
        ua: new Date().toISOString(),
      })
    }

    // Remove from trash
    await STO.set(TRASH_KEY, trash.filter(t => t.id !== id))

    return true
  },

  // Permanently delete from trash
  async permanentDelete(id) {
    const trash = await STO.get(TRASH_KEY) || []
    await STO.set(TRASH_KEY, trash.filter(t => t.id !== id))
    return true
  },

  // Empty entire trash
  async emptyTrash() {
    await STO.set(TRASH_KEY, [])
    return true
  },

  // ── Storage Health Check ──
  async checkHealth() {
    const issues = []

    // Check localStorage usage
    try {
      let totalSize = 0
      for (const key of Object.keys(localStorage)) {
        totalSize += localStorage.getItem(key).length * 2 // UTF-16
      }
      const usedMB = (totalSize / 1024 / 1024).toFixed(2)
      if (totalSize > 4 * 1024 * 1024) {
        issues.push({ level: 'critical', msg: `Storage nearly full: ${usedMB}MB of ~5MB used` })
      } else if (totalSize > 3 * 1024 * 1024) {
        issues.push({ level: 'warning', msg: `Storage at ${usedMB}MB — consider exporting old reports` })
      }
    } catch {
      issues.push({ level: 'critical', msg: 'Cannot access localStorage' })
    }

    // Check index integrity
    const idx = await STO.getIndex()
    for (const r of (idx.reports || [])) {
      const data = await STO.get(r.id)
      if (!data) issues.push({ level: 'warning', msg: `Report "${r.facility}" (${r.id}) — index entry but no data` })
    }
    for (const d of (idx.drafts || [])) {
      const data = await STO.get(d.id)
      if (!data) issues.push({ level: 'warning', msg: `Draft "${d.facility}" (${d.id}) — index entry but no data` })
    }

    return { healthy: issues.length === 0, issues }
  },
}

export default Backup
