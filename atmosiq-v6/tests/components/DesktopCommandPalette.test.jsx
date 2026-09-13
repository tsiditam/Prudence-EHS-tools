// @vitest-environment jsdom
/**
 * DesktopCommandPalette — the Ctrl/⌘ + K launcher for the desktop layout.
 *
 * Pins: closed by default; the chord opens and closes it; the rail's Search
 * row opens it through openNonce; typing filters and ranks; arrows + Enter
 * run the highlighted command and close; Escape closes without running.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import DesktopCommandPalette, { matchCommands } from '../../src/components/desktop/DesktopCommandPalette'

afterEach(cleanup)

const mk = (overrides = {}) => ({
  projects: vi.fn(), reports: vi.fn(), logger: vi.fn(), review: vi.fn(),
  ...overrides,
})

function commandsFor(spies) {
  return [
    { id: 'projects', label: 'Projects', group: 'Workspace', icon: 'bldg', onSelect: spies.projects },
    { id: 'reports', label: 'Reports', group: 'Workspace', icon: 'report', onSelect: spies.reports },
    { id: 'logger', label: 'Logger Studio', group: 'Tools', icon: 'chartLine', keywords: ['sensor', 'csv'], onSelect: spies.logger },
    { id: 'review', label: 'Send for peer review', group: 'Actions', icon: 'check', onSelect: spies.review },
  ]
}

describe('matchCommands', () => {
  it('returns everything (capped) for an empty query and ranks prefix > substring > keyword', () => {
    const cmds = commandsFor(mk())
    expect(matchCommands(cmds, '')).toHaveLength(4)
    // "Reports" starts with the query; "Send for peer review" only contains it.
    const re = matchCommands(cmds, 're')
    expect(re.map((c) => c.id)).toEqual(['reports', 'review'])
    // Keyword-only match still surfaces, after label matches.
    expect(matchCommands(cmds, 'csv').map((c) => c.id)).toEqual(['logger'])
    // Every token must hit; order of tokens does not matter.
    expect(matchCommands(cmds, 'review peer').map((c) => c.id)).toEqual(['review'])
    expect(matchCommands(cmds, 'zzz')).toEqual([])
  })
})

describe('DesktopCommandPalette', () => {
  it('is closed until Ctrl/⌘ + K, and the chord toggles it', () => {
    render(<DesktopCommandPalette commands={commandsFor(mk())} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByRole('dialog', { name: 'Search and commands' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens when the rail bumps openNonce', () => {
    const { rerender } = render(<DesktopCommandPalette commands={commandsFor(mk())} openNonce={0} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(<DesktopCommandPalette commands={commandsFor(mk())} openNonce={1} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('filters as you type, runs the highlighted command on Enter, and closes', () => {
    const spies = mk()
    render(<DesktopCommandPalette commands={commandsFor(spies)} />)
    act(() => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }) })
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'log' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option', { name: /Logger Studio/ }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(spies.logger).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('arrows through the list and a click also runs a command', () => {
    const spies = mk()
    render(<DesktopCommandPalette commands={commandsFor(spies)} />)
    act(() => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }) })
    const input = screen.getByRole('textbox')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /Reports/ }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'ArrowUp' }) // clamps at the top
    expect(screen.getByRole('option', { name: /Projects/ }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('option', { name: /peer review/ }))
    expect(spies.review).toHaveBeenCalledTimes(1)
    expect(spies.projects).not.toHaveBeenCalled()
  })

  it('Escape closes without running anything, and shows an empty state for no matches', () => {
    const spies = mk()
    render(<DesktopCommandPalette commands={commandsFor(spies)} />)
    act(() => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }) })
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'nothing here' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText(/No matches/)).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter' }) // nothing highlighted → no-op
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    Object.values(spies).forEach((fn) => expect(fn).not.toHaveBeenCalled())
  })
})
