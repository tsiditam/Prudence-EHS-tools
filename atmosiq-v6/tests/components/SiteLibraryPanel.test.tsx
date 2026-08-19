// @vitest-environment jsdom
/**
 * Site library — the Settings surface for records the app creates on its
 * own behalf.
 *
 * SaveSitePrompt writes a site when an assessment is finalized, and the
 * re-assessment cron emails against it. This panel is the only place a
 * user can rename, pause or delete one. It was built, tested and then left
 * unmounted, so the app could create sites and email about them with no
 * management surface at all — these tests pin both the panel's behaviour
 * and the fact that Settings actually renders it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import SiteLibraryPanel from '../../src/components/settings/SiteLibraryPanel'
import SettingsScreen from '../../src/components/SettingsScreen'
import { StorageProvider } from '../../src/contexts/StorageContext'

const SITES = [
  { id: 's1', name: 'Lakeside Medical', address: '12 Harbor Rd', next_due_at: null, disabled_at: null },
  { id: 's2', name: 'Bell Tower Offices', address: '', next_due_at: null, disabled_at: '2026-05-01T00:00:00.000Z' },
]

// The panel resolves its bearer token through cloudStorage.getSession.
vi.mock('../../src/utils/cloudStorage', () => ({
  default: { getSession: async () => ({ access_token: 'tok' }) },
}))

function mockFetch(handler: (body: any) => { ok?: boolean; json: any }) {
  const spy = vi.fn(async (_url: string, init: any) => {
    const body = JSON.parse(init.body)
    const { ok = true, json } = handler(body)
    return { ok, json: async () => json } as unknown as Response
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

const withProvider = (ui: React.ReactElement) => render(<StorageProvider>{ui}</StorageProvider>)

beforeEach(() => {
  vi.stubGlobal('confirm', () => true)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SiteLibraryPanel', () => {
  it('lists the saved sites returned by /api/sites', async () => {
    mockFetch(() => ({ json: { sites: SITES } }))
    withProvider(<SiteLibraryPanel />)
    expect(await screen.findByText('Lakeside Medical')).toBeTruthy()
    expect(screen.getByText('Bell Tower Offices')).toBeTruthy()
    expect(screen.getByText('12 Harbor Rd')).toBeTruthy()
  })

  it('shows the paused state for a site with reminders disabled', async () => {
    mockFetch(() => ({ json: { sites: SITES } }))
    withProvider(<SiteLibraryPanel />)
    expect(await screen.findByText('Reminders paused')).toBeTruthy()
    expect(screen.getByText('Resume reminders')).toBeTruthy()
  })

  it('renames a site through the save action', async () => {
    const spy = mockFetch(() => ({ json: { sites: SITES } }))
    withProvider(<SiteLibraryPanel />)
    await screen.findByText('Lakeside Medical')

    fireEvent.click(screen.getAllByText('Edit')[0])
    fireEvent.change(screen.getByPlaceholderText('Site name'), { target: { value: 'Lakeside Medical Center' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      const saved = spy.mock.calls.map((c) => JSON.parse((c[1] as any).body)).find((b) => b.action === 'save')
      expect(saved).toBeTruthy()
      expect(saved.site.id).toBe('s1')
      expect(saved.site.name).toBe('Lakeside Medical Center')
    })
  })

  it('deletes a site through the delete action', async () => {
    const spy = mockFetch((b) => (b.action === 'delete' ? { json: { ok: true } } : { json: { sites: SITES } }))
    withProvider(<SiteLibraryPanel />)
    await screen.findByText('Lakeside Medical')

    fireEvent.click(screen.getAllByText('Delete')[0])
    await waitFor(() => {
      const del = spy.mock.calls.map((c) => JSON.parse((c[1] as any).body)).find((b) => b.action === 'delete')
      expect(del).toEqual({ action: 'delete', id: 's1' })
    })
  })

  it('surfaces the empty state rather than a blank panel', async () => {
    mockFetch(() => ({ json: { sites: [] } }))
    withProvider(<SiteLibraryPanel />)
    expect(await screen.findByText('No sites saved yet')).toBeTruthy()
  })

  it('surfaces a server error instead of failing silently', async () => {
    mockFetch(() => ({ ok: false, json: { error: 'query_failed' } }))
    withProvider(<SiteLibraryPanel />)
    expect(await screen.findByText('query_failed')).toBeTruthy()
  })
})

describe('Settings mounts the site library', () => {
  it('renders the Sites group with the panel inside it', async () => {
    mockFetch(() => ({ json: { sites: SITES } }))
    withProvider(<SettingsScreen />)
    expect(screen.getByText('Sites')).toBeTruthy()
    // Panel content, not just the heading — a heading with no panel is the
    // exact state this test exists to prevent.
    expect(await screen.findByText('Lakeside Medical')).toBeTruthy()
  })
})
