// @vitest-environment jsdom
/**
 * JasperMessageActions — pins the Copy / Share contract:
 *   1. Renders a Copy button and a Share button.
 *   2. Copy → writes the response text to the clipboard and the button
 *      flips to "Copied".
 *   3. Share → calls navigator.share with the response text when the
 *      Web Share API is available.
 *   4. Share with no navigator.share → falls back to a clipboard copy.
 *   5. A cancelled share sheet (AbortError) is a no-op (no fallback copy).
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import JasperMessageActions from '../../src/components/ui/JasperMessageActions'

const TEXT = 'CO2 ran high in Room 3, which points to under-ventilation.'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  // Reset the APIs we stub onto navigator between tests.
  // @ts-expect-error - test cleanup
  delete (navigator as any).share
})

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

describe('JasperMessageActions', () => {
  it('renders Copy and Share buttons', () => {
    render(<JasperMessageActions text={TEXT} />)
    expect(screen.getByLabelText('Copy response')).toBeTruthy()
    expect(screen.getByLabelText('Share response')).toBeTruthy()
  })

  it('Copy writes the text to the clipboard and flips to Copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<JasperMessageActions text={TEXT} />)
    fireEvent.click(screen.getByLabelText('Copy response'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TEXT))
    await waitFor(() => expect(screen.getByLabelText('Copied')).toBeTruthy())
  })

  it('Share calls navigator.share with the response text', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    // @ts-expect-error - jsdom has no share by default
    navigator.share = share
    render(<JasperMessageActions text={TEXT} shareTitle="AtmosFlow AI" />)
    fireEvent.click(screen.getByLabelText('Share response'))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    expect(share).toHaveBeenCalledWith({ title: 'AtmosFlow AI', text: TEXT })
  })

  it('Share falls back to clipboard when Web Share API is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    // no navigator.share
    render(<JasperMessageActions text={TEXT} />)
    fireEvent.click(screen.getByLabelText('Share response'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TEXT))
  })

  it('a cancelled share sheet does not fall back to a clipboard copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    // @ts-expect-error - jsdom has no share by default
    navigator.share = vi.fn().mockRejectedValue(abort)
    render(<JasperMessageActions text={TEXT} />)
    fireEvent.click(screen.getByLabelText('Share response'))
    await waitFor(() => expect((navigator as any).share).toHaveBeenCalledTimes(1))
    expect(writeText).not.toHaveBeenCalled()
  })
})
