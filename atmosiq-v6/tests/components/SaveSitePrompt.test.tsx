// @vitest-environment jsdom
/**
 * Tests for SaveSitePrompt — the finalize-time BottomSheet that
 * closes the connectivity-layer Hook (PR 1).
 *
 * Pins the contract:
 *   • Hidden when `open` is false
 *   • Pre-fills the name from bldg.fn
 *   • Primary action calls onSave with { name, address, building_type, reassessment_interval_months: 12 }
 *   • Secondary action ("Not now") calls onDismiss
 *   • Name field is editable and the typed value flows through to onSave
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import SaveSitePrompt from '../../src/components/SaveSitePrompt'

afterEach(() => { cleanup() })

describe('SaveSitePrompt', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <SaveSitePrompt open={false} bldg={{ fn: 'Acme HQ' }} onSave={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('renders when open is true with bldg.fn as the placeholder', () => {
    render(
      <SaveSitePrompt open={true} bldg={{ fn: 'Acme HQ', address: '100 Main' }} onSave={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/Save site to your library/i)).toBeTruthy()
    expect(screen.getByText(/every 12 months/i)).toBeTruthy()
  })

  it('pre-fills the name field from bldg.fn after mount', async () => {
    render(
      <SaveSitePrompt open={true} bldg={{ fn: 'Acme HQ' }} onSave={vi.fn()} onDismiss={vi.fn()} />,
    )
    const input = await waitFor(() => {
      const el = screen.getByPlaceholderText('Acme HQ') as HTMLInputElement
      if (!el.value) throw new Error('not yet populated')
      return el
    })
    expect(input.value).toBe('Acme HQ')
  })

  it('primary "Save site" action calls onSave with the typed name + 12-month default', async () => {
    const onSave = vi.fn().mockResolvedValue({ site: { id: 'site-1' } })
    render(
      <SaveSitePrompt open={true} bldg={{ fn: 'Acme HQ', address: '100 Main St', type: 'office' }} onSave={onSave} onDismiss={vi.fn()} />,
    )
    // Wait for name pre-fill
    await waitFor(() => {
      const el = screen.getByPlaceholderText('Acme HQ') as HTMLInputElement
      if (!el.value) throw new Error('not yet populated')
    })
    fireEvent.click(screen.getByRole('button', { name: /save site/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave).toHaveBeenCalledWith({
      name: 'Acme HQ',
      address: '100 Main St',
      building_type: 'office',
      reassessment_interval_months: 12,
    })
  })

  it('flows a user-edited name through to onSave', async () => {
    const onSave = vi.fn().mockResolvedValue({ site: { id: 'site-1' } })
    render(
      <SaveSitePrompt open={true} bldg={{ fn: 'Acme HQ' }} onSave={onSave} onDismiss={vi.fn()} />,
    )
    const input = await waitFor(() => {
      const el = screen.getByPlaceholderText('Acme HQ') as HTMLInputElement
      if (!el.value) throw new Error('not yet populated')
      return el
    })
    fireEvent.change(input, { target: { value: 'Acme HQ — North Tower' } })
    fireEvent.click(screen.getByRole('button', { name: /save site/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const payload = onSave.mock.calls[0][0]
    expect(payload.name).toBe('Acme HQ — North Tower')
  })

  it('secondary "Not now" action calls onDismiss', () => {
    const onDismiss = vi.fn()
    render(
      <SaveSitePrompt open={true} bldg={{ fn: 'Acme HQ' }} onSave={vi.fn()} onDismiss={onDismiss} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /not now/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('shows an error message when onSave throws', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Server is down'))
    render(
      <SaveSitePrompt open={true} bldg={{ fn: 'Acme HQ' }} onSave={onSave} onDismiss={vi.fn()} />,
    )
    await waitFor(() => {
      const el = screen.getByPlaceholderText('Acme HQ') as HTMLInputElement
      if (!el.value) throw new Error('not yet populated')
    })
    fireEvent.click(screen.getByRole('button', { name: /save site/i }))
    await waitFor(() => expect(screen.getByText(/Server is down/i)).toBeTruthy())
  })

  it('rejects empty names with an inline message', async () => {
    const onSave = vi.fn()
    render(
      <SaveSitePrompt open={true} bldg={{ /* no fn */ }} onSave={onSave} onDismiss={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /save site/i }))
    await waitFor(() => expect(screen.getByText(/Site name is required/i)).toBeTruthy())
    expect(onSave).not.toHaveBeenCalled()
  })
})
