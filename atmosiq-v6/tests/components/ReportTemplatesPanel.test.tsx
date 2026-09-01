// @vitest-environment jsdom
/**
 * Report Templates — the Settings surface for user-uploaded .docx templates.
 *
 * The whole feature existed and nobody could reach it. The renderer, the token
 * registry, the upload/list/delete API, the private Storage bucket with its
 * RLS, the Jasper `generate_report` tool and this panel were all built and
 * tested; `SettingsScreen` never imported the panel. So the only way to get a
 * template into an account was to call the API by hand, which means
 * `generate_report` could only ever answer `no_templates_saved` — and its own
 * failure message points the assessor at "Settings → Report Templates", a
 * place that did not exist.
 *
 * Acceptance criterion REPORT-TEMPLATES passed throughout, because every one
 * of its checks asks whether a FILE exists. These tests pin behaviour and the
 * mount, in that order.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import ReportTemplatesPanel from '../../src/components/settings/ReportTemplatesPanel'
import SettingsScreen from '../../src/components/SettingsScreen'
import { StorageProvider } from '../../src/contexts/StorageContext'

const TEMPLATES = [
  {
    id: 't1',
    name: 'Acme Federal IAQ',
    tokens_found: ['client.name', 'findings.total_count'],
    tokens_missing: ['legacy.token'],
    size_bytes: 42_000,
    created_at: '2026-06-01T00:00:00.000Z',
  },
]

// The panel resolves its bearer token through the shared settings helper,
// which reads the session off cloudStorage — same seam SiteLibraryPanel uses.
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
})

describe('ReportTemplatesPanel', () => {
  it('lists saved templates with their token counts', async () => {
    mockFetch(() => ({ json: { templates: TEMPLATES } }))
    withProvider(<ReportTemplatesPanel />)
    expect(await screen.findByText('Acme Federal IAQ')).toBeTruthy()
    // The unknown count is the warning that matters: those tokens render
    // blank, and the assessor has no other way to find out.
    expect(screen.getByText(/1 unknown/)).toBeTruthy()
  })

  it('says so plainly when there is nothing saved yet', async () => {
    mockFetch(() => ({ json: { templates: [] } }))
    withProvider(<ReportTemplatesPanel />)
    expect(await screen.findByText('No templates saved yet.')).toBeTruthy()
  })

  it('surfaces the API error rather than an empty list', async () => {
    mockFetch(() => ({ ok: false, json: { error: 'storage_unavailable' } }))
    withProvider(<ReportTemplatesPanel />)
    expect(await screen.findByText('storage_unavailable')).toBeTruthy()
  })

  it('deletes a template and refreshes', async () => {
    let deleted = false
    const spy = mockFetch((body) => {
      if (body.action === 'delete') { deleted = true; return { json: { ok: true } } }
      return { json: { templates: deleted ? [] : TEMPLATES } }
    })
    withProvider(<ReportTemplatesPanel />)
    fireEvent.click(await screen.findByText('Delete'))
    await waitFor(() => expect(deleted).toBe(true))
    expect(spy.mock.calls.some(([, init]: any) =>
      JSON.parse(init.body).action === 'delete')).toBe(true)
    expect(await screen.findByText('No templates saved yet.')).toBeTruthy()
  })

  it('shows the token reference, including the repeating-section syntax', async () => {
    // A user cannot guess a token name and cannot guess `{{#findings}}` at
    // all. The panel's own header comment claimed this list existed before it
    // did.
    mockFetch(() => ({ json: { templates: [] } }))
    withProvider(<ReportTemplatesPanel />)
    fireEvent.click(await screen.findByText('Available tokens'))
    expect(screen.getByText('{{client.name}}')).toBeTruthy()
    expect(screen.getByText('{{#findings}} … {{/findings}}')).toBeTruthy()
    // And the field that carries the qualitative-only disclosure, since a
    // template that omits it drops a defensibility marking.
    expect(screen.getByText('{{qualitative_note}}')).toBeTruthy()
  })
})

describe('Settings mounts the report templates panel', () => {
  it('renders the Reports group with the panel inside it', async () => {
    mockFetch((body) =>
      body.action === 'list'
        ? { json: { templates: TEMPLATES } }
        : { json: { sites: [] } })
    withProvider(<SettingsScreen />)
    expect(screen.getByText('Reports')).toBeTruthy()
    // Panel content, not just the heading — a heading with no panel is the
    // exact state this test exists to prevent.
    expect(await screen.findByText('Upload a template')).toBeTruthy()
  })
})
