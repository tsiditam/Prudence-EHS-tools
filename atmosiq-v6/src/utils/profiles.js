/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Profile management — local user profiles for assessor + instrument auto-fill
 */

import STO from './storage'

const PROFILES_KEY = 'atmosiq-profiles'
const ACTIVE_KEY = 'atmosiq-active-profile'

const Profiles = {
  async getAll() {
    return await STO.get(PROFILES_KEY) || []
  },

  async get(id) {
    const all = await this.getAll()
    return all.find(p => p.id === id) || null
  },

  async save(profile) {
    const all = await this.getAll()
    const idx = all.findIndex(p => p.id === profile.id)
    if (idx >= 0) all[idx] = { ...all[idx], ...profile, updatedAt: new Date().toISOString() }
    else all.push({ ...profile, id: profile.id || 'profile-' + Date.now(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    await STO.set(PROFILES_KEY, all)
    return profile
  },

  async delete(id) {
    const all = await this.getAll()
    await STO.set(PROFILES_KEY, all.filter(p => p.id !== id))
    const active = await this.getActive()
    if (active === id) await STO.del(ACTIVE_KEY)
  },

  async setActive(id) {
    await STO.set(ACTIVE_KEY, id)
  },

  async getActive() {
    return await STO.get(ACTIVE_KEY)
  },

  async getActiveProfile() {
    const id = await this.getActive()
    if (!id) return null
    return await this.get(id)
  },

  // Convert profile to pre-survey auto-fill data
  toPresurvey(profile) {
    if (!profile) return {}
    return {
      ps_assessor: profile.name || '',
      ps_assessor_certs: profile.certs || [],
      ps_assessor_exp: profile.experience || '',
      ps_inst_iaq: profile.iaq_meter || '',
      ps_inst_iaq_serial: profile.iaq_serial || '',
      ps_inst_iaq_cal: profile.iaq_cal_date || '',
      ps_inst_iaq_cal_status: profile.iaq_cal_status || '',
      ps_inst_pid: profile.pid_meter || '',
      ps_inst_pid_cal: profile.pid_cal_status || '',
      ps_inst_other: profile.other_instruments || '',
    }
  },
}

export default Profiles
