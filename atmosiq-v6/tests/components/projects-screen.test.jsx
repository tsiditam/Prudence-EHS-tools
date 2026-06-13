// @vitest-environment jsdom
/**
 * Project / Site Folder screens — render smoke tests.
 *   • ProjectsScreen shows the empty state when no projects exist.
 *   • ProjectDetail loads a stored project and renders its header +
 *     default Overview tab.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import ProjectsScreen from '../../src/components/projects/ProjectsScreen'
import ProjectDetail from '../../src/components/projects/ProjectDetail'
import { createProject } from '../../src/utils/projectStore'

beforeEach(() => { localStorage.clear() })
afterEach(() => cleanup())

describe('ProjectsScreen', () => {
  it('renders the heading and empty state with no projects', async () => {
    render(<ProjectsScreen onBack={() => {}} onOpen={() => {}} />)
    expect(screen.getByText('Projects')).toBeTruthy()
    // Project-centric IA: the empty state recommends creating a project.
    await waitFor(() => expect(screen.getByText(/Start with a project/i)).toBeTruthy())
  })

  it('makes "New project" the primary CTA and offers no Start survey action', async () => {
    render(<ProjectsScreen onBack={() => {}} onOpen={() => {}} />)
    // "New project" is the action; assessment creation has moved into the
    // project workspace, so no global "Start survey" CTA appears here.
    await waitFor(() => expect(screen.getAllByText(/New project/i).length).toBeGreaterThan(0))
    expect(screen.queryByText(/Start survey/i)).toBeNull()
  })

  it('deletes a project from the list via the row trash action (with confirm)', async () => {
    await createProject({ name: 'Trashable Co', status: 'draft' })
    let opened = false
    render(<ProjectsScreen onBack={() => {}} onOpen={() => { opened = true }} />)
    await waitFor(() => expect(screen.getByText('Trashable Co')).toBeTruthy())

    // The row trash control must NOT open the project — it asks first.
    fireEvent.click(screen.getByLabelText('Delete Trashable Co'))
    expect(opened).toBe(false)
    await waitFor(() => expect(screen.getByText(/Linked assessments themselves are not deleted/i)).toBeTruthy())

    // Confirm → project is removed from the list.
    fireEvent.click(screen.getByText('Delete project'))
    await waitFor(() => expect(screen.queryByText('Trashable Co')).toBeNull())
  })
})

describe('ProjectDetail', () => {
  it('loads a stored project and renders its header + Overview', async () => {
    const p = await createProject({ name: 'Meridian Tower', client: 'Demo LLC', siteType: 'Office', status: 'active' })
    render(<ProjectDetail id={p.id} profile={{ name: 'J. Smith' }} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('Meridian Tower')).toBeTruthy())
    // Client appears in both the header and the Overview metadata row.
    expect(screen.getAllByText('Demo LLC').length).toBeGreaterThan(0)
    // Overview tab default — the Status section is present
    expect(screen.getByText(/Status/i)).toBeTruthy()
    expect(screen.getAllByText(/Active/i).length).toBeGreaterThan(0)
  })

  it('surfaces a contextual "New assessment" action when onNewAssessment is provided', async () => {
    const p = await createProject({ name: 'Atlas Plant', client: 'Atlas Co', siteType: 'Industrial', status: 'active' })
    const seeds = []
    render(<ProjectDetail id={p.id} profile={{ name: 'J. Smith' }} onBack={() => {}} onNewAssessment={(s) => seeds.push(s)} />)
    const btn = await screen.findByText('New assessment')
    btn.click()
    // Launching from the workspace seeds the assessment with the site identity.
    expect(seeds[0]).toMatchObject({ name: 'Atlas Plant' })
  })

  it('shows a not-found message for a missing project id', async () => {
    render(<ProjectDetail id="nope" onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText(/could not be found/i)).toBeTruthy())
  })

  it('offers Delete project in the Overview danger zone and confirms', async () => {
    const p = await createProject({ name: 'Closable Site', status: 'active' })
    let backed = false
    render(<ProjectDetail id={p.id} profile={{ name: 'J. Smith' }} onBack={() => { backed = true }} />)
    await waitFor(() => expect(screen.getByText('Closable Site')).toBeTruthy())

    // Discoverable on the default Overview tab now (not buried in Activity).
    expect(screen.getByText('Danger zone')).toBeTruthy()
    fireEvent.click(screen.getByText('Delete project')) // danger-zone button (unique pre-sheet)
    await waitFor(() => expect(screen.getByText(/Linked assessments themselves are not deleted/i)).toBeTruthy())

    // Sheet adds a second "Delete project" — confirm via the last one.
    const confirmBtns = screen.getAllByText('Delete project')
    fireEvent.click(confirmBtns[confirmBtns.length - 1])
    await waitFor(() => expect(backed).toBe(true))
  })
})
