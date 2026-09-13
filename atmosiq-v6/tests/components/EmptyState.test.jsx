// @vitest-environment jsdom
/**
 * EmptyState — a first screen that shows the product.
 *
 * Pins: the ghost preview renders (and is hidden from assistive tech), the
 * title / body / action / secondary link render and fire, and `preview=null`
 * draws no ghost for a filter-with-no-matches state.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import EmptyState from '../../src/components/ui/EmptyState'

afterEach(cleanup)

describe('EmptyState', () => {
  it('renders the ghost list, the copy, the action and the secondary link', () => {
    const onSecondary = vi.fn()
    const { container } = render(
      <EmptyState
        title="Start with a project"
        body="A project keeps a site's assessments together."
        action={<button type="button">New project</button>}
        secondary={{ label: 'Try a sample building', onClick: onSecondary }}
      />,
    )
    expect(screen.getByText('Start with a project')).toBeTruthy()
    expect(screen.getByText(/keeps a site/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New project' })).toBeTruthy()
    // The ghost rows are decoration: present, and hidden from assistive tech.
    const ghost = container.querySelector('[aria-hidden="true"]')
    expect(ghost).toBeTruthy()
    expect(ghost.querySelectorAll('span').length).toBeGreaterThan(6)
    fireEvent.click(screen.getByRole('button', { name: /Try a sample building/ }))
    expect(onSecondary).toHaveBeenCalledTimes(1)
  })

  it('draws no ghost when preview is null', () => {
    const { container } = render(<EmptyState preview={null} title="No closed projects" secondary={{ label: 'Show all', onClick: () => {} }} />)
    expect(screen.getByText('No closed projects')).toBeTruthy()
    expect(container.querySelector('[aria-hidden="true"] span')).toBeNull()
  })
})
