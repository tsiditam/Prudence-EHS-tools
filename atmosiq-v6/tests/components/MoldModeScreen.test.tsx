// @vitest-environment jsdom
/**
 * MoldModeScreen — the self-contained in-app mold mode (userMode: 'mold').
 * Pins the home → intake → result flow: screening-only framing on the home, the
 * demo path running the real engine into the result surface, an intake
 * assessment reaching a result end-to-end, and exiting the mode.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import MoldModeScreen from '../../src/components/MoldModeScreen'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

describe('MoldModeScreen', () => {
  it('renders the mold home with screening-only framing and entry points', () => {
    render(<MoldModeScreen onExit={() => {}} />)
    expect(screen.getByText('Mold Assessment')).toBeTruthy()
    expect(screen.getByText(/New mold assessment/)).toBeTruthy()
    expect(screen.getByText(/Open the demo assessment/)).toBeTruthy()
    expect(screen.getByText(/Method — IICRC S520/)).toBeTruthy()
  })

  it('opens the demo through the real engine and shows the result surface', () => {
    render(<MoldModeScreen onExit={() => {}} />)
    fireEvent.click(screen.getByText(/Open the demo assessment/))
    // MoldScreeningView surface — per-finding review flags (no banner).
    expect(screen.getAllByText('Professional review recommended').length).toBeGreaterThan(0)
  })

  it('runs an intake assessment end to end', () => {
    render(<MoldModeScreen onExit={() => {}} />)
    fireEvent.click(screen.getByText(/New mold assessment/))
    expect(screen.getByText('Assessment context')).toBeTruthy()
    expect(screen.getByText('Area 1')).toBeTruthy()
    fireEvent.click(screen.getByText(/Run assessment/))
    expect(screen.getByText(/Edit inputs/)).toBeTruthy() // reached the result stage
  })

  it('exits mold mode via the header control', () => {
    const onExit = vi.fn()
    render(<MoldModeScreen onExit={onExit} />)
    fireEvent.click(screen.getByLabelText('Exit mold mode'))
    expect(onExit).toHaveBeenCalled()
  })

  // ── The exit has to be REACHABLE, not merely wired ───────────────────────
  //
  // The test above passed the whole time a user was trapped in mold mode on a
  // real iPhone. It proves the button calls its handler; it cannot see that
  // the button was rendered underneath the iOS status bar, where taps go to
  // the system instead of the page.
  //
  // Mold mode is early-returned by MobileApp OUTSIDE the IAQ shell — the point
  // being that the shell and its nav never mount — so it inherits none of the
  // shell's `env(safe-area-inset-top)` handling and had a flat
  // `paddingTop: 16`. With a ~47-59px top inset the header sat under the
  // status bar. `userMode` persists in localStorage, which a Safari cache
  // clear does not touch, so every launch returned to a screen whose only exit
  // could not be pressed.
  //
  // (`?mold=0` still recovers it — the flag goes off, and MobileApp's
  // `persisted mold + flag off → fall back to IH` branch fires. That is the
  // documented escape hatch and it is not discoverable, which is why the exit
  // being physically reachable is the thing that matters.)

  const stageRoot = (c: HTMLElement) => c.firstElementChild as HTMLElement

  it('reserves the top safe-area inset on every stage', () => {
    const { container } = render(<MoldModeScreen onExit={() => {}} />)

    // Home.
    expect(stageRoot(container).style.paddingTop).toContain('safe-area-inset-top')

    // Intake.
    fireEvent.click(screen.getByText(/New mold assessment/))
    expect(stageRoot(container).style.paddingTop).toContain('safe-area-inset-top')

    // Result.
    fireEvent.click(screen.getByText(/Run assessment/))
    expect(stageRoot(container).style.paddingTop).toContain('safe-area-inset-top')
  })

  it('gives the exit a 44px tap target — it is the only way out of the mode', () => {
    const { container } = render(<MoldModeScreen onExit={() => {}} />)
    const btn = screen.getByLabelText('Exit mold mode') as HTMLButtonElement
    expect(btn.style.width).toBe('44px')
    expect(btn.style.height).toBe('44px')
    void container
  })

  it('offers the exit from every stage, not just home', () => {
    // A stage that renders no exit is the same trap by a different route.
    const onExit = vi.fn()
    render(<MoldModeScreen onExit={onExit} />)

    fireEvent.click(screen.getByText(/New mold assessment/))
    fireEvent.click(screen.getByLabelText('Exit mold mode'))
    expect(onExit, 'intake stage has no exit').toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText(/Run assessment/))
    fireEvent.click(screen.getByLabelText('Exit mold mode'))
    expect(onExit, 'result stage has no exit').toHaveBeenCalledTimes(2)
  })

  it('saves an assessment, lists it on home, reopens it, and deletes it', async () => {
    render(<MoldModeScreen onExit={() => {}} />)
    fireEvent.click(screen.getByText(/Open the demo assessment/)) // → result
    fireEvent.click(screen.getByText(/Save assessment/))
    await screen.findByText('Saved')                              // persisted + list refreshed
    fireEvent.click(screen.getByText('Home'))
    // Saved list shows the record (title derived from the first area).
    expect(await screen.findByText(/Mold — Break Room/)).toBeTruthy()
    // Reopen → recomputed result surface.
    fireEvent.click(screen.getByLabelText(/Open Mold — Break Room/))
    expect(screen.getAllByText('Professional review recommended').length).toBeGreaterThan(0)
    // Home → delete.
    fireEvent.click(screen.getByText('Home'))
    fireEvent.click(screen.getByLabelText(/Delete Mold — Break Room/))
    await waitFor(() => expect(screen.queryByText(/Mold — Break Room/)).toBeNull())
  })

  it('persists across a remount (reads back from storage)', async () => {
    const { unmount } = render(<MoldModeScreen onExit={() => {}} />)
    fireEvent.click(screen.getByText(/Open the demo assessment/))
    fireEvent.click(screen.getByText(/Save assessment/))
    await screen.findByText('Saved')
    unmount()
    render(<MoldModeScreen onExit={() => {}} />) // fresh mount → loads from storage
    expect(await screen.findByText(/Saved assessments/)).toBeTruthy()
    expect(screen.getByText(/Mold — Break Room/)).toBeTruthy()
  })
})
