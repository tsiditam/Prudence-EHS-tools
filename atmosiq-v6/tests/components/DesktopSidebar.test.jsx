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
import DesktopSidebar from '../../src/components/desktop/DesktopSidebar'

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
})
