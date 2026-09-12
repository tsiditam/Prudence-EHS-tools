// @vitest-environment jsdom
/**
 * DesktopHome — the desktop landing: the state of the work.
 *
 * Pins: the greeting and counts; the Needs-attention card leads with the
 * active draft (and its census once the body loads), falls back to the
 * report with findings needing attention, and to an empty state; recent
 * projects and the activity feed; and the pure helpers.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import DesktopHome, { greeting, relativeTime, buildActivity, censusOf } from '../../src/components/desktop/DesktopHome'

afterEach(cleanup)

const NOW = new Date('2026-09-12T15:30:00Z').getTime()

describe('DesktopHome helpers', () => {
  it('greets by time of day and first name', () => {
    expect(greeting(new Date('2026-09-12T08:00:00'), 'Tsidi Tamakloe')).toBe('Good morning, Tsidi')
    expect(greeting(new Date('2026-09-12T14:00:00'), '')).toBe('Good afternoon')
    expect(greeting(new Date('2026-09-12T20:00:00'), 'J')).toBe('Good evening, J')
  })

  it('formats relative time compactly', () => {
    expect(relativeTime(NOW - 20 * 1000, NOW)).toBe('now')
    expect(relativeTime(NOW - 14 * 60 * 1000, NOW)).toBe('14m')
    expect(relativeTime(NOW - 3 * 3600 * 1000, NOW)).toBe('3h')
    expect(relativeTime(NOW - 2 * 86400 * 1000, NOW)).toBe('2d')
    expect(relativeTime('not a date', NOW)).toBe('')
  })

  it('counts zones, numeric readings and observations in a draft body', () => {
    const body = { zones: [
      { zn: 'Office', co2: '742', tf: 72.3, rh: '', vd: true, wd: 'no' },
      { zn: 'Conf', co2: '1246', pm: '6', ot: 'musty' },
    ] }
    expect(censusOf(body)).toEqual({ zones: 2, readings: 4, observations: 2 })
    expect(censusOf(null)).toEqual({ zones: 0, readings: 0, observations: 0 })
  })

  it('merges drafts, reports and project activity newest-first', () => {
    const feed = buildActivity({
      drafts: [{ id: 'd1', facility: 'Lakeside', ua: new Date(NOW - 60000).toISOString() }],
      reports: [{ id: 'r1', facility: 'Summani', ts: NOW - 3600000 }],
      projects: [{ id: 'p1', name: 'Billie Young', activity: [{ id: 'a1', ts: new Date(NOW - 120000).toISOString(), text: 'Project created' }] }],
    })
    expect(feed.map((f) => f.subject)).toEqual(['Lakeside', 'Billie Young', 'Summani'])
    expect(feed[0].text).toBe('Draft updated')
    expect(feed[2].text).toBe('Report finalized')
  })
})

describe('DesktopHome', () => {
  const projects = [
    { id: 'p1', name: 'Lakeside Professional Center', client: 'Acme', siteType: 'Office', status: 'active', updatedAt: new Date(NOW).toISOString(), activity: [] },
    { id: 'p2', name: 'Summani Plaza', status: 'closed', updatedAt: new Date(NOW - 86400000).toISOString(), activity: [] },
  ]

  it('leads with the active draft, loads its census, and continues it', async () => {
    const loadDraft = vi.fn(async () => ({ zones: [{ zn: 'A', co2: '700' }, { zn: 'B', tf: 71 }] }))
    const onResumeDraft = vi.fn()
    render(<DesktopHome
      profile={{ name: 'Tsidi Tamakloe' }}
      index={{ drafts: [{ id: 'd1', facility: 'Lakeside Professional Center', ua: new Date(NOW).toISOString() }], reports: [] }}
      projects={projects}
      loadDraft={loadDraft}
      onResumeDraft={onResumeDraft}
    />)
    expect(screen.getByText(/^Good (morning|afternoon|evening), Tsidi$/)).toBeTruthy()
    expect(screen.getByText('Needs attention')).toBeTruthy()
    expect(screen.getByText('Walkthrough in progress')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('2 zones · 2 readings · 0 observations')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Continue investigation/ }))
    expect(onResumeDraft).toHaveBeenCalledWith('d1')
    // Recent projects are listed with their status.
    expect(screen.getByText('Summani Plaza')).toBeTruthy()
    expect(screen.getByText('Active')).toBeTruthy()
  })

  it('falls back to the report needing attention, then to an empty state', () => {
    const onOpenReport = vi.fn()
    const { unmount } = render(<DesktopHome
      profile={{ name: 'J' }}
      index={{ drafts: [], reports: [{ id: 'r1', facility: 'Summani Plaza', ts: NOW, attention: 2, worstSeverity: 'medium' }] }}
      projects={[]}
      onOpenReport={onOpenReport}
    />)
    expect(screen.getByText('2 findings need attention')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Review findings/ }))
    expect(onOpenReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }))
    unmount()

    const onNew = vi.fn()
    render(<DesktopHome profile={{ name: 'J' }} index={{ drafts: [], reports: [] }} projects={[]} onNewInvestigation={onNew} />)
    expect(screen.getByText('Nothing open')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: /New investigation/ })[0])
    expect(onNew).toHaveBeenCalled()
  })

  it('opens a recent project and the projects list', () => {
    const onOpenProject = vi.fn()
    const onOpenProjects = vi.fn()
    render(<DesktopHome profile={{}} index={{ drafts: [], reports: [] }} projects={projects} onOpenProject={onOpenProject} onOpenProjects={onOpenProjects} />)
    fireEvent.click(screen.getByText('Lakeside Professional Center'))
    expect(onOpenProject).toHaveBeenCalledWith('p1')
    fireEvent.click(screen.getByRole('button', { name: /View all/ }))
    expect(onOpenProjects).toHaveBeenCalled()
  })
})
