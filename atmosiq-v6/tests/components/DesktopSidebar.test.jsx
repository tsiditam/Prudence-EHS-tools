// @vitest-environment jsdom
/**
 * DesktopSidebar — persistent desktop left navigation rail.
 *
 * Pins: it renders the wordmark + all primary/group/trash destinations,
 * marks the active view, fires onSelect with the chosen item, shows the
 * account footer, and collapses groups (items hidden + header toggles).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import DesktopSidebar, { SIDEBAR_W, SIDEBAR_W_COLLAPSED, readRailCollapsed, writeRailCollapsed } from '../../src/components/desktop/DesktopSidebar'
import { KEYS } from '../../src/utils/storageKeys'

afterEach(cleanup)

const primary = [
  { label: 'Projects', icon: 'bldg', view: 'projects', onClick: () => {} },
  { label: 'Reports', icon: 'report', view: 'history', onClick: () => {} },
  { label: 'AtmosFlow AI', icon: 'jasper', onClick: () => {} },
]
const groups = [
  { key: 'tools', label: 'Tools', items: [
    { label: 'Logger Studio', icon: 'chartLine', view: 'sensor-data', onClick: () => {} },
    { label: 'Search', icon: 'search', view: 'search', onClick: () => {} },
  ] },
]
const trash = { label: 'Trash', icon: 'trash', view: 'trash', onClick: () => {} }

const base = {
  primary, groups, trash, profile: { name: 'J. Smith' },
  onToggleGroup: () => {}, onSelect: () => {}, onAccount: () => {},
}

describe('DesktopSidebar', () => {
  it('renders the wordmark, primary destinations, open-group items, trash, and account', () => {
    render(<DesktopSidebar {...base} activeView="projects" groupsOpen={{ tools: true }} />)
    expect(screen.getByText('AtmosFlow')).toBeTruthy()
    expect(screen.getByText('Projects')).toBeTruthy()
    expect(screen.getByText('Reports')).toBeTruthy()
    expect(screen.getByText('Logger Studio')).toBeTruthy() // group is open
    expect(screen.getByText('Trash')).toBeTruthy()
    expect(screen.getByText('J. Smith')).toBeTruthy()
  })

  it('marks the active destination with aria-current=page', () => {
    render(<DesktopSidebar {...base} activeView="history" groupsOpen={{ tools: true }} />)
    expect(screen.getByText('Reports').closest('button').getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('Projects').closest('button').getAttribute('aria-current')).toBeNull()
  })

  it('fires onSelect with the chosen item', () => {
    const onSelect = vi.fn()
    render(<DesktopSidebar {...base} activeView="projects" groupsOpen={{ tools: true }} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Reports'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ view: 'history' }))
  })

  it('hides group items when the group is collapsed', () => {
    render(<DesktopSidebar {...base} activeView="projects" groupsOpen={{ tools: false }} />)
    expect(screen.queryByText('Logger Studio')).toBeNull()
  })

  it('toggles a group via its header', () => {
    const onToggleGroup = vi.fn()
    render(<DesktopSidebar {...base} activeView="projects" groupsOpen={{ tools: false }} onToggleGroup={onToggleGroup} />)
    fireEvent.click(screen.getByText('Tools'))
    expect(onToggleGroup).toHaveBeenCalledWith('tools')
  })

  it('opens the account view from the footer', () => {
    const onAccount = vi.fn()
    render(<DesktopSidebar {...base} activeView="projects" groupsOpen={{ tools: true }} onAccount={onAccount} />)
    fireEvent.click(screen.getByText('J. Smith'))
    expect(onAccount).toHaveBeenCalled()
  })

  // ── Desktop pass (2026-09): collapse, New chat, Search, shortcuts ──

  it('leads with New chat and Search when the shell provides them', () => {
    const onNewChat = vi.fn()
    const onSearch = vi.fn()
    render(<DesktopSidebar {...base} activeView="projects" groupsOpen={{ tools: true }} onNewChat={onNewChat} onSearch={onSearch} />)
    fireEvent.click(screen.getByRole('button', { name: 'New chat with AtmosFlow AI' }))
    expect(onNewChat).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Search and commands' }))
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('collapses to an icon rail: labels go, every destination keeps an accessible name', () => {
    render(<DesktopSidebar {...base} activeView="projects" groupsOpen={{ tools: false }} collapsed onToggleCollapse={() => {}} onNewChat={() => {}} />)
    expect(screen.queryByText('AtmosFlow')).toBeNull()
    expect(screen.queryByText('J. Smith')).toBeNull()
    // Labels are gone as text but survive as the button's accessible name.
    expect(screen.getByRole('button', { name: 'Projects' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reports' })).toBeTruthy()
    // Group items are always shown on the icon rail (their headers cannot be read).
    expect(screen.getByRole('button', { name: 'Logger Studio' })).toBeTruthy()
    expect(screen.queryByText('Tools')).toBeNull()
    expect(screen.getByRole('button', { name: 'Expand sidebar' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('navigation', { name: 'Primary' }).style.width).toBe(`${SIDEBAR_W_COLLAPSED}px`)
  })

  it('toggles from the header button and from Ctrl/⌘ + B, but not while typing', () => {
    const onToggleCollapse = vi.fn()
    render(
      <>
        <DesktopSidebar {...base} activeView="projects" groupsOpen={{ tools: true }} onToggleCollapse={onToggleCollapse} />
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
