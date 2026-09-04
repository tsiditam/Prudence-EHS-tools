// @vitest-environment jsdom
/**
 * BottomSheet focus management (audit 2026-09 §6: aria-modal with no
 * focus trap). Pins:
 *   • focus moves into the sheet when it opens
 *   • Tab from the last control wraps to the first; Shift+Tab the reverse
 *   • the opener regains focus when the sheet closes
 *   • Escape still closes it
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
import { useState } from 'react'
import BottomSheet from '../../src/components/ui/BottomSheet'

afterEach(() => cleanup())

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open sheet</button>
      <button>Elsewhere</button>
      {open && (
        <BottomSheet title="Export report" onClose={() => setOpen(false)}>
          <button>Consultant Report</button>
          <button>Technical Report</button>
        </BottomSheet>
      )}
    </div>
  )
}

describe('BottomSheet focus trap', () => {
  it('moves focus in on open, cycles inside, and restores on close', async () => {
    render(<Harness />)
    const opener = screen.getByText('Open sheet')
    opener.focus()
    fireEvent.click(opener)

    const dialog = await screen.findByRole('dialog', { name: 'Export report' })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    const first = screen.getByText('Consultant Report')
    const last = screen.getByText('Technical Report')

    // From the panel itself Tab goes to the first control.
    await act(async () => { fireEvent.keyDown(document.activeElement as Element, { key: 'Tab' }) })
    // (The browser moves focus for a normal Tab; jsdom does not, so
    // simulate the browser's step then the wrap behaviour.)
    last.focus()
    await act(async () => { fireEvent.keyDown(last, { key: 'Tab' }) })
    expect(document.activeElement).toBe(first)
    await act(async () => { fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }) })
    expect(document.activeElement).toBe(last)
    // The page behind the sheet is never reached.
    expect(document.activeElement).not.toBe(screen.getByText('Elsewhere'))

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(opener)
  })
})
