// @vitest-environment jsdom
/**
 * Tests for PeerReviewLanding — the public page reviewers see at
 * /?review_token=... (habit-loop PR 4).
 *
 * Pins:
 *   • Loading state fetches GET /api/peer-review-respond?token=...
 *   • 404 / 410 / 409 produce friendly error copy.
 *   • The three response buttons + notes flow through to POST.
 *   • Done state thanks the reviewer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import PeerReviewLanding from '../../src/components/PeerReviewLanding'

const mockFetch = vi.fn()
beforeEach(() => {
  mockFetch.mockReset()
  ;(globalThis as never as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch
})
afterEach(() => cleanup())

const validView = {
  assessor_name: 'Tsidi Tamakloe',
  facility_name: 'Acme HQ',
  requested_at: '2026-05-29T12:00:00Z',
  expires_at: '2026-06-29T12:00:00Z',
  message: 'See appendix C',
  status: 'pending',
}

describe('PeerReviewLanding', () => {
  it('renders the loading state initially, then the context block', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ view: validView }) })
    render(<PeerReviewLanding token="tok-1" />)
    expect(screen.getByText(/Loading review request/i)).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Tsidi Tamakloe')).toBeTruthy())
    expect(screen.getByText('Acme HQ')).toBeTruthy()
    expect(screen.getByText('See appendix C')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Approve/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Request changes/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Comment only/i })).toBeTruthy()
  })

  it('renders "no longer valid" for 404 invalid_token', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'invalid_token' }) })
    render(<PeerReviewLanding token="bad" />)
    await waitFor(() => expect(screen.getByText(/no longer valid/i)).toBeTruthy())
  })

  it('renders "expired" for 410', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'expired' }) })
    render(<PeerReviewLanding token="t" />)
    await waitFor(() => expect(screen.getByText(/has expired/i)).toBeTruthy())
  })

  it('renders "already recorded" for 409', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'already_reviewed' }) })
    render(<PeerReviewLanding token="t" />)
    await waitFor(() => expect(screen.getByText(/already been recorded/i)).toBeTruthy())
  })

  it('happy path: tapping Approve + Submit fires POST with status + notes', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ view: validView }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, status: 'approved' }) })
    render(<PeerReviewLanding token="tok-1" />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Approve/i })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Approve/i }))
    const textarea = screen.getByPlaceholderText(/Specific feedback/i) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Looks defensible.' } })
    fireEvent.click(screen.getByRole('button', { name: /Submit response/i }))
    await waitFor(() => expect(screen.getByText(/Review recorded/i)).toBeTruthy())
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const post = mockFetch.mock.calls[1]
    expect(post[0]).toBe('/api/peer-review-respond')
    const body = JSON.parse(post[1].body)
    expect(body).toEqual({ token: 'tok-1', status: 'approved', notes: 'Looks defensible.' })
  })

  it('Submit button is disabled until a status is chosen', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ view: validView }) })
    render(<PeerReviewLanding token="t" />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Submit response/i })).toBeTruthy())
    const btn = screen.getByRole('button', { name: /Submit response/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Comment only/i }))
    expect(btn.disabled).toBe(false)
  })
})
