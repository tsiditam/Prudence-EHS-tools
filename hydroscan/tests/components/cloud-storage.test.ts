/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Phase 5 — storage facade tests. With Supabase unconfigured (no env in the
 * test environment), the cloud layer must degrade gracefully to local storage
 * so the app keeps working standalone.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import storage from '../../src/utils/storage'
import { persistAssessment, loadHistory, cloudEnabled } from '../../src/utils/cloudStorage'
import { saveAssessment, listAssessments } from '../../src/utils/supabaseStorage'
import { getProfile } from '../../src/utils/profiles'

beforeEach(() => {
  try { localStorage.clear() } catch { /* ignore */ }
})

describe('local storage wrapper', () => {
  it('round-trips JSON values and namespaces keys', async () => {
    await storage.set('k', { a: 1 })
    expect(await storage.get('k')).toEqual({ a: 1 })
    expect(localStorage.getItem('hydroscan:k')).toBe('{"a":1}')
    await storage.del('k')
    expect(await storage.get('k')).toBeNull()
  })
})

describe('cloud facade — graceful degradation (Supabase unconfigured)', () => {
  it('cloud is disabled without configuration', async () => {
    expect(await cloudEnabled()).toBe(false)
  })

  it('persistAssessment writes to local history; loadHistory reads it back', async () => {
    const entry = { ts: '2026-06-03T00:00:00Z', tier: 'immediate', sourceId: 'well' }
    await persistAssessment(entry, { mode: 'lab', source: {}, building: {}, labResults: [] })
    const hist = await loadHistory()
    expect(hist.length).toBe(1)
    expect(hist[0].tier).toBe('immediate')
  })

  it('supabaseStorage + profiles return null/empty when unconfigured', async () => {
    expect(await saveAssessment({ labResults: [] })).toBeNull()
    expect(await listAssessments()).toEqual([])
    expect(await getProfile('abc')).toBeNull()
  })
})
