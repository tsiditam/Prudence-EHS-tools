// @vitest-environment jsdom
/**
 * OfflineBanner — top-of-app strip that surfaces the offline state.
 *
 * Pins:
 *   • Renders nothing when online + has never been offline
 *   • Renders "Offline — changes will sync…" when offline
 *   • Briefly renders the green "Back online — syncing" affordance
 *     when the network flips from offline → online, then auto-hides
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

import OfflineBanner from '../../src/components/OfflineBanner'
import { __test } from '../../src/hooks/useNetworkStatus'

afterEach(() => {
  cleanup()
  __test.reset()
  vi.useRealTimers()
})

describe('<OfflineBanner>', () => {
  it('renders nothing when online (and never offline)', () => {
    render(<OfflineBanner />)
    expect(screen.queryByTestId('offline-banner')).toBeNull()
  })

  it('renders the offline message when navigator goes offline', () => {
    render(<OfflineBanner />)
    act(() => { __test.setOnline(false) })
    const banner = screen.getByTestId('offline-banner')
    expect(banner).toBeTruthy()
    expect(banner.textContent).toMatch(/offline/i)
  })

  it('renders "Back online — syncing" momentarily after reconnect', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<OfflineBanner />)
    act(() => { __test.setOnline(false) })
    act(() => { __test.setOnline(true) })
    const banner = screen.getByTestId('offline-banner')
    expect(banner.textContent).toMatch(/back online/i)
  })

  it('auto-hides the back-online banner after the linger window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<OfflineBanner />)
    act(() => { __test.setOnline(false) })
    act(() => { __test.setOnline(true) })
    expect(screen.getByTestId('offline-banner').textContent).toMatch(/back online/i)
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(screen.queryByTestId('offline-banner')).toBeNull()
  })
})
