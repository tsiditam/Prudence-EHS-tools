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
    expect(screen.getByText(/New mold screening/)).toBeTruthy()
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
    fireEvent.click(screen.getByText(/New mold screening/))
    expect(screen.getByText('Assessment context')).toBeTruthy()
    expect(screen.getByText('Area 1')).toBeTruthy()
    fireEvent.click(screen.getByText(/Run screening/))
    expect(screen.getByText(/Edit inputs/)).toBeTruthy() // reached the result stage
  })

  it('exits mold mode via the header control', () => {
    const onExit = vi.fn()
    render(<MoldModeScreen onExit={onExit} />)
    fireEvent.click(screen.getByLabelText('Exit mold mode'))
    expect(onExit).toHaveBeenCalled()
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
