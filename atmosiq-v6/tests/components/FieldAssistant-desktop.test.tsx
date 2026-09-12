// @vitest-environment jsdom
/**
 * FieldAssistant — desktop page mode.
 *
 * On desktop (>= 1024px) the assistant is a page beside the navigation
 * rail, not a phone sheet floating over a scrim: no backdrop, pinned to
 * the content area right of the rail at full width, and a greeting on the
 * empty canvas instead of the watermark. The phone chrome is pinned by
 * FieldAssistant-sheet-chrome.test.tsx; this file pins the divergence and
 * that the default (no `desktop` prop) is still the phone sheet.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

vi.mock('../../src/utils/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'test-token' } } })),
    },
  },
}))

beforeEach(() => {
  window.localStorage.setItem('jasper_intro_v1', new Date().toISOString())
})
afterEach(() => { cleanup() })

import FieldAssistant from '../../src/components/FieldAssistant'

describe('FieldAssistant desktop page mode', () => {
  it('drops the scrim and pins the page to the content area right of the rail', () => {
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} desktop leftInset={240} />)
    expect(container.querySelector('.jasper-backdrop')).toBeNull()
    const sheet = container.querySelector('.jasper-sheet') as HTMLElement
    expect(sheet.style.position).toBe('fixed')
    expect(sheet.style.top).toBe('0px')
    expect(sheet.style.bottom).toBe('0px')
    expect(sheet.style.left).toBe('240px')
    expect(sheet.style.right).toBe('0px')
    expect(sheet.style.maxWidth).toBe('none')
    // The safe-area rule the phone sheet established still holds.
    expect(sheet.style.paddingTop).toContain('safe-area-inset-top')
  })

  it('follows the rail width when it collapses', () => {
    const { container, rerender } = render(<FieldAssistant onClose={() => {}} context={{}} desktop leftInset={240} />)
    rerender(<FieldAssistant onClose={() => {}} context={{}} desktop leftInset={68} />)
    expect((container.querySelector('.jasper-sheet') as HTMLElement).style.left).toBe('68px')
  })

  it('greets on the empty canvas instead of showing the watermark', () => {
    render(<FieldAssistant onClose={() => {}} context={{}} desktop leftInset={240} />)
    expect(screen.getByTestId('jasper-desktop-greeting')).toBeTruthy()
    expect(screen.getByText('What can I help you investigate?')).toBeTruthy()
  })

  it('does not replay a New chat bump on mount (a fresh mount is already a fresh chat)', () => {
    // Mounting with a nonce that was bumped while the page was closed must
    // not touch the surface — it is empty already and stays that way.
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} desktop leftInset={240} newChatNonce={3} />)
    expect(screen.getByTestId('jasper-desktop-greeting')).toBeTruthy()
    expect(container.querySelector('textarea')).toBeTruthy()
  })

  it('is still the phone sheet by default: scrim present, 640px column, no greeting', () => {
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} />)
    expect(container.querySelector('.jasper-backdrop')).toBeTruthy()
    const sheet = container.querySelector('.jasper-sheet') as HTMLElement
    expect(sheet.style.maxWidth).toBe('640px')
    expect(screen.queryByTestId('jasper-desktop-greeting')).toBeNull()
  })
})
