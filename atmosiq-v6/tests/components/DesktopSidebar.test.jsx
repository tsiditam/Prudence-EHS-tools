// @vitest-environment jsdom
/**
 * DesktopSidebar — persistent desktop left navigation rail.
 *
 * Pins: it renders the wordmark, every section's destinations, the recent
 * list and the bottom items; marks the active view (by `view` or an explicit
 * `active`); fires onSelect with the chosen item; shows the account footer;
 * collapses to an icon rail (labels gone, accessible names kept) from its
 * header toggle or Ctrl/⌘ B; and remembers the collapsed preference.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import DesktopSidebar, { SIDEBAR_W, SIDEBAR_W_COLLAPSED, readRailCollapsed, writeRailCollapsed } from '../../src/components/desktop/DesktopSidebar'
import { KEYS } from '../../src/utils/storageKeys'

afterEach(cleanup)

const sections = [
  { key: 'work', items: [
    { label: 'Home', icon: 'home', view: 'home', onClick: () => {} },
    { label: 'Projects', icon: 'bldg', view: 'projects', onClick: () => {} },
    { label: 'Reports', icon: 'report', view: 'history', onClick: () => {} },
  ] },
  { key: 'analysis', label: 'Analysis', items: [
    { label: 'Logger Studio', icon: 'chartLine', view: 'sensor-data', onClick: () => {} },
  ] },
  { key: 'ai', items: [
    { label: 'AtmosFlow AI', icon: 'sparkle', active: true, hint: '⌘ J', onClick: () => {} },
  ] },
]
const recent = { label: 'Recent', items: [{ key: 'p1', label: 'Lakeside Professional Center', onClick: () => {} }] }
const bottom = [
  { label: 'Settings', icon: 'gear', view: 'settings', onClick: () => {} },
  { label: 'Trash', icon: 'trash', view: 'trash', onClick: () => {} },
]

const base = {
  sections, recent, bottom, profile: { name: 'J. Smith' },
  onSelect: () => {}, onAccount: () => {},
}

describe('DesktopSidebar', () => {
  it('renders the wordmark, every section, the recent list, the bottom items and the account', () => {
    render(<DesktopSidebar {...base} activeView="projects" />)
    expect(screen.getByText('AtmosFlow')).toBeTruthy()
    expect(screen.getByText('Home')).toBeTruthy()
    expect(screen.getByText('Projects')).toBeTruthy()
    expect(screen.getByText('Analysis')).toBeTruthy()
    expect(screen.getByText('Logger Studio')).toBeTruthy()
    expect(screen.getByText('AtmosFlow AI')).toBeTruthy()
    expect(screen.getByText('Recent')).toBeTruthy()
    expect(screen.getByText('Lakeside Professional Center')).toBeTruthy()
    expect(screen.getByText('Settings')).toBeTruthy()
    expect(screen.getByText('Trash')).toBeTruthy()
    expect(screen.getByText('J. Smith')).toBeTruthy()
  })

  it('marks the active destination by view, and an explicit active flag, with aria-current=page', () => {
    render(<DesktopSidebar {...base} activeView="history" />)
    expect(screen.getByText('Reports').closest('button').getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('Projects').closest('button').getAttribute('aria-current')).toBeNull()
    // The AI row is active by its own flag (the panel is open), not by view.
    expect(screen.getByText('AtmosFlow AI').closest('button').getAttribute('aria-current')).toBe('page')
  })

  it('fires onSelect with the chosen item, including recent and bottom rows', () => {
    const onSelect = vi.fn()
    render(<DesktopSidebar {...base} activeView="projects" onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Reports'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ view: 'history' }))
    fireEvent.click(screen.getByText('Lakeside Professional Center'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: 'p1' }))
    fireEvent.click(screen.getByText('Trash'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ view: 'trash' }))
  })

  it('opens the account view from the footer', () => {
    const onAccount = vi.fn()
    render(<DesktopSidebar {...base} activeView="projects" onAccount={onAccount} />)
    fireEvent.click(screen.getByText('J. Smith'))
    expect(onAccount).toHaveBeenCalled()
  })

  it('shows the Search row with its shortcut when the shell provides it', () => {
    const onSearch = vi.fn()
    render(<DesktopSidebar {...base} activeView="projects" onSearch={onSearch} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search and commands' }))
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('collapses to an icon rail: labels and the recent list go, every destination keeps an accessible name', () => {
    render(<DesktopSidebar {...base} activeView="projects" collapsed onToggleCollapse={() => {}} />)
    expect(screen.queryByText('AtmosFlow')).toBeNull()
    expect(screen.queryByText('J. Smith')).toBeNull()
    expect(screen.queryByText('Analysis')).toBeNull()
    expect(screen.queryByText('Lakeside Professional Center')).toBeNull()
    // Labels are gone as text but survive as the button's accessible name.
    expect(screen.getByRole('button', { name: 'Projects' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Logger Studio' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Expand sidebar' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('navigation', { name: 'Primary' }).style.width).toBe(`${SIDEBAR_W_COLLAPSED}px`)
  })

  it('toggles from the header button and from Ctrl/⌘ + B, but not while typing', () => {
    const onToggleCollapse = vi.fn()
    render(
      <>
        <DesktopSidebar {...base} activeView="projects" onToggleCollapse={onToggleCollapse} />
        <textarea aria-label="notes" />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    expect(onToggleCollapse).toHaveBeenCalledTimes(2)
    fireEvent.keyDown(window, { key: 'b', metaKey: true })
    expect(onToggleCollapse).toHaveBeenCalledTimes(3)
    // A bare "b" is typing, not a shortcut.
    fireEvent.keyDown(window, { key: 'b' })
    expect(onToggleCollapse).toHaveBeenCalledTimes(3)
    // Inside a text field the chord is left to the field.
    fireEvent.keyDown(screen.getByLabelText('notes'), { key: 'b', ctrlKey: true })
    expect(onToggleCollapse).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('navigation', { name: 'Primary' }).style.width).toBe(`${SIDEBAR_W}px`)
  })

  it('remembers the collapsed preference', () => {
    window.localStorage.removeItem(KEYS.desktopRailCollapsed)
    expect(readRailCollapsed()).toBe(false)
    writeRailCollapsed(true)
    expect(readRailCollapsed()).toBe(true)
    writeRailCollapsed(false)
    expect(readRailCollapsed()).toBe(false)
  })
})
