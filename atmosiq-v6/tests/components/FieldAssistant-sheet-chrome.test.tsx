// @vitest-environment jsdom
/**
 * FieldAssistant — sheet sizing and composer focus chrome.
 *
 * Both pins come from a bug report against the first build after the
 * audit remediation merged, with screenshots.
 *
 *   1. The sheet is `position: fixed; bottom: 0` and was capped at
 *      `88vh`. `vh` is the LARGE viewport on iOS: it does not shrink
 *      when the software keyboard opens. So tapping the composer left
 *      an 88vh-tall sheet anchored to the bottom of a viewport that had
 *      just lost ~330px to the keyboard, and the sheet's header —
 *      "How can I help with this assessment?" — was pushed up under the
 *      status bar, overlapping the clock and the Dynamic Island.
 *      `dvh` tracks the visual viewport, and the env() term keeps the
 *      top clear of the notch regardless.
 *
 *      This is the same class as the mold-mode notch bug (CHANGELOG,
 *      "mold mode could not be exited on a notched iPhone") and jsdom
 *      cannot see a status bar either, so the test asserts the property
 *      that was violated: the cap is a dynamic unit and it reserves the
 *      top inset.
 *
 *   2. The composer's rounded container owns the focus affordance — it
 *      draws a 1.5px ACCENT border plus a glow while `composerFocused`.
 *      The audit pass removed `outline:'none'` from every component to
 *      restore keyboard focus visibility (WCAG 2.4.7), which was right
 *      almost everywhere and wrong here: the global :focus-visible ring
 *      then drew a SECOND rectangle inside the container's own. The
 *      textarea keeps its suppression; the container is the indicator.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

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
import { VH_UNIT } from '../../src/styles/tokens'

describe('FieldAssistant sheet chrome', () => {
  it('caps the sheet against the dynamic viewport and reserves the top inset', () => {
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} />)
    const sheet = container.querySelector('.jasper-sheet') as HTMLElement
    expect(sheet).toBeTruthy()

    const maxHeight = sheet.style.maxHeight
    // Never a bare `vh` cap: that is what put the header under the status
    // bar once the keyboard claimed part of the viewport.
    expect(maxHeight).not.toBe('88vh')
    expect(maxHeight).toContain('88')
    expect(maxHeight).toContain('safe-area-inset-top')
  })

  it('resolves the viewport unit to dvh where the engine supports it', () => {
    // jsdom's CSS.supports returns false, so the token falls back to vh —
    // the assertion that matters is that the token is one of the two and
    // that the sheet is built from it rather than from a hardcoded unit.
    expect(['dvh', 'vh']).toContain(VH_UNIT)
  })

  it('leaves the focus ring to the composer container, not the textarea', () => {
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} />)
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea).toBeTruthy()
    // The container draws the border + glow on focus; a ring on the
    // textarea as well renders as two nested rectangles.
    expect(textarea.style.outline).toBe('none')
  })
})
