// @vitest-environment jsdom
/**
 * AtmosFlowFloatingDock — the bottom tab bar, rebuilt to match Instagram's
 * bottom navigation (flat full-width bar, icon-only, monochrome, no
 * magnification / glide / labels).
 *
 * Pins:
 *  - Rendering + a11y: tablist/tab roles, every tab exposes its name via
 *    aria-label, the active tab carries aria-selected / aria-current.
 *  - Icon-only: NO visible text labels are rendered (Instagram shows none).
 *  - Navigation: a tap fires the tab's onClick.
 *  - aux: an optional extra destination is folded inline into the bar.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import AtmosFlowFloatingDock from '../../src/components/ui/AtmosFlowFloatingDock'

afterEach(cleanup)

const tabs = (active = 'projects') => ([
  { id: 'projects', label: 'Projects', icon: 'bldg', active: active === 'projects', onClick: vi.fn() },
  { id: 'sensor-data', label: 'Logger Studio', icon: 'chartLine', active: active === 'sensor-data', onClick: vi.fn() },
  { id: 'history', label: 'Reports', icon: 'report', active: active === 'history', onClick: vi.fn() },
  { id: 'account', label: 'Account', icon: 'user', active: active === 'account', onClick: vi.fn() },
])

describe('AtmosFlowFloatingDock — rendering & a11y', () => {
  it('renders a tablist with every tab, each named via aria-label', () => {
    render(<AtmosFlowFloatingDock tabs={tabs('projects')} maxWidth={620} />)
    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    expect(screen.getByRole('tab', { name: 'Logger Studio' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Reports' })).toBeTruthy()
  })

  it('is icon-only — renders no visible text labels (Instagram style)', () => {
    render(<AtmosFlowFloatingDock tabs={tabs('projects')} maxWidth={620} />)
    expect(screen.queryByText('Projects')).toBeNull()
    expect(screen.queryByText('Logger Studio')).toBeNull()
  })

  it('marks the active tab with aria-selected and aria-current', () => {
    render(<AtmosFlowFloatingDock tabs={tabs('history')} maxWidth={620} />)
    const active = screen.getByRole('tab', { name: 'Reports' })
    expect(active.getAttribute('aria-selected')).toBe('true')
    expect(active.getAttribute('aria-current')).toBe('page')
    const inactive = screen.getByRole('tab', { name: 'Account' })
    expect(inactive.getAttribute('aria-selected')).toBe('false')
    expect(inactive.getAttribute('aria-current')).toBeNull()
  })
})

describe('AtmosFlowFloatingDock — navigation', () => {
  it('navigates on a tap (click)', () => {
    const t = tabs('projects')
    render(<AtmosFlowFloatingDock tabs={t} maxWidth={620} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Logger Studio' }))
    expect(t[1].onClick).toHaveBeenCalledTimes(1)
  })

  it('folds an optional aux destination inline into the bar', () => {
    const aux = { id: 'jasper', label: 'AtmosFlow AI', icon: 'jasper', onClick: vi.fn() }
    render(<AtmosFlowFloatingDock tabs={tabs('projects')} aux={aux} maxWidth={620} />)
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    fireEvent.click(screen.getByRole('tab', { name: 'AtmosFlow AI' }))
    expect(aux.onClick).toHaveBeenCalledTimes(1)
  })
})
