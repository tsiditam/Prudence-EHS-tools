// @vitest-environment jsdom
/**
 * Project / Site Folder screens — render smoke tests.
 *   • ProjectsScreen shows the empty state when no projects exist.
 *   • ProjectDetail loads a stored project and renders its header +
 *     default Overview tab.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import ProjectsScreen from '../../src/components/projects/ProjectsScreen'
import ProjectDetail from '../../src/components/projects/ProjectDetail'
import { createProject } from '../../src/utils/projectStore'

beforeEach(() => { localStorage.clear() })
afterEach(() => cleanup())

describe('ProjectsScreen', () => {
  it('renders the heading and empty state with no projects', async () => {
    render(<ProjectsScreen onBack={() => {}} onOpen={() => {}} />)
    expect(screen.getByText('Projects')).toBeTruthy()
    await waitFor(() => expect(screen.getByText(/No projects yet/i)).toBeTruthy())
  })
})

describe('ProjectDetail', () => {
  it('loads a stored project and renders its header + Overview', async () => {
    const p = await createProject({ name: 'Meridian Tower', client: 'Demo LLC', siteType: 'Office', status: 'active' })
    render(<ProjectDetail id={p.id} profile={{ name: 'J. Smith' }} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('Meridian Tower')).toBeTruthy())
    // Client appears in both the header and the Overview metadata row.
    expect(screen.getAllByText('Demo LLC').length).toBeGreaterThan(0)
    // Overview tab default — site details section is present
    expect(screen.getByText(/Site details/i)).toBeTruthy()
    expect(screen.getAllByText(/Active/i).length).toBeGreaterThan(0)
  })

  it('shows a not-found message for a missing project id', async () => {
    render(<ProjectDetail id="nope" onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText(/could not be found/i)).toBeTruthy())
  })
})
