// @vitest-environment jsdom
/**
 * ConfirmDialog / useConfirm — the accessible replacement for
 * window.confirm (audit 2026-09 §6 Accessibility).
 *
 * Pins:
 *   • role="alertdialog" + aria-modal, labelled by the title
 *   • focus moves into the dialog on open and returns to the opener on close
 *   • Tab / Shift+Tab cycle inside the dialog (focus trap)
 *   • Escape resolves false; the confirm button resolves true
 *   • destructive confirms start focus on the safe (Cancel) button
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { useState } from 'react'
import ConfirmDialog, { useConfirm } from '../../src/components/ui/ConfirmDialog'

afterEach(() => cleanup())

function Harness({ destructive = false }: { destructive?: boolean }) {
  const [confirm, dialog] = useConfirm()
  const [answer, setAnswer] = useState<string>('none')
  return (
    <div>
      <button onClick={async () => {
        const ok = await confirm({ title: 'Delete this?', message: 'Gone for good.', confirmLabel: 'Delete', destructive })
        setAnswer(ok ? 'yes' : 'no')
      }}>Open</button>
      <span data-testid="answer">{answer}</span>
      {dialog}
    </div>
  )
}

describe('ConfirmDialog', () => {
  it('renders an alertdialog labelled by its title and described by its message', () => {
    render(<ConfirmDialog title="Overwrite?" message="Existing values will be replaced." confirmLabel="Overwrite" onConfirm={() => {}} onCancel={() => {}} />)
    const dialog = screen.getByRole('alertdialog', { name: 'Overwrite?' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Overwrite' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it('moves focus into the dialog and restores it to the opener on close', async () => {
    render(<Harness />)
    const opener = screen.getByText('Open')
    opener.focus()
    expect(document.activeElement).toBe(opener)

    fireEvent.click(opener)
    const dialog = await screen.findByRole('alertdialog')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    // Non-destructive: the affirmative button takes focus.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.getByTestId('answer').textContent).toBe('yes'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('starts on the safe button for destructive confirms', async () => {
    render(<Harness destructive />)
    fireEvent.click(screen.getByText('Open'))
    await screen.findByRole('alertdialog')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' })))
  })

  it('traps Tab inside the dialog', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Open'))
    await screen.findByRole('alertdialog')
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const del = screen.getByRole('button', { name: 'Delete' })
    await waitFor(() => expect(document.activeElement).toBe(del))

    // Tab from the last tabbable wraps to the first.
    await act(async () => { fireEvent.keyDown(document.activeElement as Element, { key: 'Tab' }) })
    expect(document.activeElement).toBe(cancel)
    // Shift+Tab from the first wraps to the last.
    await act(async () => { fireEvent.keyDown(document.activeElement as Element, { key: 'Tab', shiftKey: true }) })
    expect(document.activeElement).toBe(del)
    // The opener behind the dialog is never reached.
    expect(document.activeElement).not.toBe(screen.getByText('Open'))
  })

  it('Escape cancels and resolves false', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Open'))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.getByTestId('answer').textContent).toBe('no'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
