/**
 * storageKeys — pinned key strings.
 *
 * These constants address LIVE user data in localStorage (reports index,
 * profile, cached auth session, etc.). Changing any value would orphan
 * existing installs' data without a migration, so each string is pinned
 * here. If a key legitimately changes, update this test AND ship a
 * copy-forward migration.
 */
import { describe, it, expect } from 'vitest'
import { KEYS, complaintsKey, COMPLAINTS_PREFIX } from '../../src/utils/storageKeys.js'

describe('storageKeys', () => {
  it('pins the legacy (atmosiq-*) key strings', () => {
    expect(KEYS.index).toBe('atmosiq-idx')
    expect(KEYS.visited).toBe('atmosiq-visited')
    expect(KEYS.profile).toBe('atmosiq-profile')
    expect(KEYS.cachedSession).toBe('atmosiq-cached-session')
    expect(KEYS.trash).toBe('atmosiq-trash')
    expect(KEYS.profiles).toBe('atmosiq-profiles')
    expect(KEYS.activeProfile).toBe('atmosiq-active-profile')
    expect(KEYS.syncQueue).toBe('atmosiq-sync-queue')
    expect(KEYS.syncState).toBe('atmosiq-sync-state')
  })

  it('pins the feature (atmosflow:*) key strings', () => {
    expect(KEYS.incidents).toBe('atmosflow:incidents')
    expect(KEYS.complaintsMigrated).toBe('atmosflow:complaints-migrated')
    expect(KEYS.userMode).toBe('atmosflow:userMode')
    expect(KEYS.buildings).toBe('atmosflow:buildings')
    expect(KEYS.projects).toBe('atmosflow:projects')
    expect(KEYS.premiumOverride).toBe('atmosflow:premiumOverride')
    expect(KEYS.instruments).toBe('atmosflow:instruments')
    expect(KEYS.labCsvTemplates).toBe('atmosflow:lab_csv_templates')
  })

  it('builds the building-scoped complaints key', () => {
    expect(COMPLAINTS_PREFIX).toBe('atmosflow:complaints:')
    expect(complaintsKey('bld-1')).toBe('atmosflow:complaints:bld-1')
  })
})
