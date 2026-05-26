/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 */

// localStorage wrapper — replaces window.storage (Claude artifact API)
// Drop-in async interface compatible with all STO calls in App.jsx

import { KEYS, COMPLAINTS_PREFIX } from './storageKeys'

const STO = {
  async get(k) {
    try {
      const v = localStorage.getItem(k)
      return v ? JSON.parse(v) : null
    } catch { return null }
  },
  async set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true }
    catch { return false }
  },
  async del(k) {
    try { localStorage.removeItem(k); return true }
    catch { return false }
  },
  async keys(prefix) {
    try {
      return Object.keys(localStorage).filter(k => k.startsWith(prefix))
    } catch { return [] }
  },
  async getIndex() {
    return await this.get(KEYS.index) || { reports: [], drafts: [] }
  },
  async saveIndex(idx) { return await this.set(KEYS.index, idx) },
  async addReportToIndex(meta) {
    const idx = await this.getIndex()
    idx.reports = idx.reports.filter(r => r.id !== meta.id)
    idx.reports.unshift(meta)
    await this.saveIndex(idx)
  },
  async addDraftToIndex(meta) {
    const idx = await this.getIndex()
    idx.drafts = idx.drafts.filter(d => d.id !== meta.id)
    idx.drafts.unshift(meta)
    await this.saveIndex(idx)
  },
  async removeFromIndex(id, type) {
    const idx = await this.getIndex()
    if (type === 'rpt') idx.reports = idx.reports.filter(r => r.id !== id)
    else idx.drafts = idx.drafts.filter(d => d.id !== id)
    await this.saveIndex(idx)
  },
  async hasVisited() { return await this.get(KEYS.visited) },
  async markVisited() { return await this.set(KEYS.visited, true) },

  // ── Incidents ──────────────────────────────────────────────────
  // Single global array under KEYS.incidents. Migrates legacy
  // FM 'atmosflow:complaints:<buildingId>' records on first read,
  // preserving the originals at '<key>:migrated' for recovery.
  async getIncidents() {
    await this._migrateComplaints()
    return (await this.get(KEYS.incidents)) || []
  },
  async saveIncident(incident) {
    const all = (await this.get(KEYS.incidents)) || []
    const now = new Date().toISOString()
    const i = all.findIndex(x => x.id === incident.id)
    if (i >= 0) all[i] = { ...all[i], ...incident, updated_at: now }
    else all.unshift({ ...incident, created_at: incident.created_at || now, updated_at: now })
    await this.set(KEYS.incidents, all)
    return all[i >= 0 ? i : 0]
  },
  async deleteIncident(id) {
    const all = (await this.get(KEYS.incidents)) || []
    await this.set(KEYS.incidents, all.filter(x => x.id !== id))
  },
  async _migrateComplaints() {
    if (await this.get(KEYS.complaintsMigrated)) return
    const keys = await this.keys(COMPLAINTS_PREFIX)
    const fresh = keys.filter(k => !k.endsWith(':migrated'))
    if (fresh.length === 0) {
      await this.set(KEYS.complaintsMigrated, true)
      return
    }
    const existing = (await this.get(KEYS.incidents)) || []
    const sevMap = { mild: 'minor', moderate: 'moderate', severe: 'severe' }
    const statusMap = { open: 'open', investigating: 'in_progress', resolved: 'resolved', referred: 'escalated' }
    const migrated = []
    for (const key of fresh) {
      const list = (await this.get(key)) || []
      for (const c of list) {
        migrated.push({
          id: 'inc-' + (c.id || Date.now().toString(36)),
          building_id: c.buildingId || '',
          building_name: c.buildingId || '',
          reported_at: c.dateReported || c.createdAt || new Date().toISOString(),
          reporter_name: c.reportedBy || 'Anonymous',
          reporter_role: '',
          trigger_type: 'Occupant complaint(s)',
          severity: sevMap[c.severity] || 'moderate',
          location: c.location || '',
          observations: c.notes || '',
          symptoms: c.symptoms || [],
          medical_attention: !!c.medicalAttention,
          actions_taken: [],
          actions_taken_other: '',
          photo_ids: [],
          status: statusMap[c.status] || 'open',
          linked_assessment_ids: c.linkedAssessmentIds || [],
          created_at: c.createdAt || new Date().toISOString(),
          updated_at: c.updatedAt || new Date().toISOString(),
        })
      }
      await this.set(key + ':migrated', list)
      await this.del(key)
    }
    await this.set(KEYS.incidents, [...migrated, ...existing])
    await this.set(KEYS.complaintsMigrated, true)
  },
}

export default STO