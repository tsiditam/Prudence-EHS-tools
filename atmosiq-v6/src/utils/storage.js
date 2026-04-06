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
    return await this.get('atmosiq-idx') || { reports: [], drafts: [] }
  },
  async saveIndex(idx) { return await this.set('atmosiq-idx', idx) },
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
  async hasVisited() { return await this.get('atmosiq-visited') },
  async markVisited() { return await this.set('atmosiq-visited', true) },
}

export default STO