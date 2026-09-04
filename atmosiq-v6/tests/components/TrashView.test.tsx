// @vitest-environment jsdom
/**
 * TrashView — hoisted out of MobileApp's render (audit 2026-09 §6,
 * Structure).
 *
 * As an inline component it was a new component type on every shell
 * render, so React unmounted and remounted it — refetching the trash
 * list and dropping any local state — every time the parent re-rendered
 * (which a 30-second clock interval did on its own). This pins the
 * property that was violated: a parent re-render keeps the mounted
 * instance, its fetched items, and does not refetch.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, act } from '@testing-library/react'
import { useState } from 'react'

const listTrash = vi.fn()
vi.mock('../../src/utils/backup', () => ({
  default: {
    listTrash: (...a: unknown[]) => listTrash(...a),
    recover: vi.fn(),
    permanentDelete: vi.fn(),
    pruneAbandonedDrafts: vi.fn().mockResolvedValue(0),
  },
}))

import { TrashView } from '../../src/components/MobileApp'

afterEach(() => cleanup())
beforeEach(() => {
  listTrash.mockReset()
  listTrash.mockResolvedValue([
    { id: 'rpt-1', name: 'Acme HQ', deletedAt: '2026-09-01T00:00:00Z', expiresAt: '2026-10-01T00:00:00Z' },
  ])
})

// A parent that re-renders on demand, the way MobileApp does on every
// state change. `tick` is only there to force the render.
function Parent({ onTick }: { onTick: (fn: () => void) => void }) {
  const [tick, setTick] = useState(0)
  onTick(() => setTick(t => t + 1))
  return (
    <div data-tick={tick}>
      <TrashView onRecover={async () => {}} onDelete={async () => {}} />
    </div>
  )
}

describe('TrashView (hoisted)', () => {
  it('is a stable module-scope component, not re-created per render', async () => {
    expect(typeof TrashView).toBe('function')
    let bump: () => void = () => {}
    render(<Parent onTick={(fn) => { bump = fn }} />)
    await waitFor(() => expect(screen.getByText('Acme HQ')).toBeTruthy())
    expect(listTrash).toHaveBeenCalledTimes(1)

    // Re-render the parent three times. A remount would call listTrash
    // again and briefly flash "Trash is empty".
    await act(async () => { bump() })
    await act(async () => { bump() })
    await act(async () => { bump() })

    expect(listTrash).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Acme HQ')).toBeTruthy()
    expect(screen.queryByText('Trash is empty')).toBeNull()
  })

  it('renders the empty state when there is nothing in the trash', async () => {
    listTrash.mockResolvedValueOnce([])
    render(<TrashView onRecover={async () => {}} onDelete={async () => {}} />)
    await waitFor(() => expect(screen.getByText('Trash is empty')).toBeTruthy())
  })
})
