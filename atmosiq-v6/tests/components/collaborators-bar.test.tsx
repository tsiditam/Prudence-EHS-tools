// @vitest-environment jsdom
/**
 * <CollaboratorsBar> — presence chips for the in-progress hero card.
 *
 * Pins:
 *   • Renders nothing when there are no other collaborators (solo)
 *   • Renders one chip per peer with title="<name> — viewing <zone>"
 *   • Collapses past MAX_INLINE_AVATARS into "+ N" overflow
 *   • Hides entirely when the hook reports supported=false
 *
 * The hook is mocked so the component test focuses on the render
 * surface, not the channel wiring (that's covered by the
 * useCollaborators tests).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

let _supported = true
let _collaborators: Array<{ id: string; name: string; current_zone?: string | null; avatar_url?: string | null }> = []

vi.mock('../../src/hooks/useCollaborators', () => ({
  useCollaborators: () => ({
    collaborators: _collaborators,
    count: _collaborators.length,
    isOnly: _collaborators.length === 0,
    supported: _supported,
    error: null,
  }),
}))

import CollaboratorsBar from '../../src/components/CollaboratorsBar'

afterEach(() => {
  cleanup()
  _supported = true
  _collaborators = []
})

describe('<CollaboratorsBar>', () => {
  it('renders nothing when there are no other collaborators', () => {
    _collaborators = []
    const { container } = render(
      <CollaboratorsBar assessmentId="a1" me={{ id: 'me' }} currentZone={null} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the realtime channel is unsupported', () => {
    _supported = false
    _collaborators = [{ id: 'p1', name: 'Jane', current_zone: 'Zone A' }]
    const { container } = render(
      <CollaboratorsBar assessmentId="a1" me={{ id: 'me' }} currentZone={null} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders one chip per peer with the descriptive title', () => {
    _collaborators = [
      { id: 'p1', name: 'Jane Smith', current_zone: 'Zone A' },
      { id: 'p2', name: 'Mike Doe', current_zone: 'Zone B' },
    ]
    render(<CollaboratorsBar assessmentId="a1" me={{ id: 'me' }} currentZone={null} />)
    expect(screen.getByText(/2 others here/i)).toBeTruthy()
    // Each chip's wrapper exposes its tooltip via the title attr.
    const tooltips = Array.from(document.querySelectorAll('[title]'))
      .map((el) => el.getAttribute('title'))
      .filter(Boolean) as string[]
    expect(tooltips.some((t) => t.includes('Jane Smith') && t.includes('Zone A'))).toBe(true)
    expect(tooltips.some((t) => t.includes('Mike Doe') && t.includes('Zone B'))).toBe(true)
  })

  it('shows the singular form when there is exactly one peer', () => {
    _collaborators = [{ id: 'p1', name: 'Solo Peer' }]
    render(<CollaboratorsBar assessmentId="a1" me={{ id: 'me' }} currentZone={null} />)
    expect(screen.getByText(/also here/i)).toBeTruthy()
  })

  it('collapses past 4 collaborators into a "+ N" overflow chip', () => {
    _collaborators = [
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
      { id: 'p3', name: 'C' },
      { id: 'p4', name: 'D' },
      { id: 'p5', name: 'E' },
      { id: 'p6', name: 'F' },
    ]
    render(<CollaboratorsBar assessmentId="a1" me={{ id: 'me' }} currentZone={null} />)
    // 6 peers → 4 inline + "+2" overflow chip
    expect(screen.getByLabelText(/2 more/i)).toBeTruthy()
    expect(screen.getByText('+2')).toBeTruthy()
  })

  it('drops the zone segment of the tooltip when current_zone is null', () => {
    _collaborators = [{ id: 'p1', name: 'No-Zone Peer', current_zone: null }]
    render(<CollaboratorsBar assessmentId="a1" me={{ id: 'me' }} currentZone={null} />)
    const tooltips = Array.from(document.querySelectorAll('[title]'))
      .map((el) => el.getAttribute('title'))
      .filter(Boolean) as string[]
    expect(tooltips.some((t) => t === 'No-Zone Peer')).toBe(true)
    expect(tooltips.some((t) => t.includes('viewing'))).toBe(false)
  })
})
