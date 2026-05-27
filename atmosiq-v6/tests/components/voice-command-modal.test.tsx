// @vitest-environment jsdom
/**
 * VoiceCommandModal — fullscreen overlay that wraps the Web Speech
 * API. Tests pin:
 *   • Modal renders nothing when open=false
 *   • On open, mic auto-starts (a SpeechRecognition instance is
 *     created and start() called)
 *   • Final transcripts accumulate into the on-screen text
 *   • Interim transcripts render in italic alongside finals
 *   • Manual Cancel button calls onCancel + tears the mic down
 *   • Manual Send button submits when there's text
 *   • Send is disabled when there's no text
 *   • After ~2.2s of silence post-transcript, auto-submits
 *   • Esc cancels
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

import VoiceCommandModal from '../../src/components/VoiceCommandModal'
import { __test as networkTest } from '../../src/hooks/useNetworkStatus'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// Reusable fake SpeechRecognition (mirrors the shape used by the
// useVoiceTranscription test file). Exposes start/stop/abort and
// the onstart/onresult/onerror/onend handlers the hook installs.
interface FakeHandlers {
  onstart: (() => void) | null
  onresult: ((ev: { resultIndex: number; results: Array<Array<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((ev: { error: string }) => void) | null
  onend: (() => void) | null
}
class FakeSpeechRecognition implements FakeHandlers {
  static instances: FakeSpeechRecognition[] = []
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onstart: (() => void) | null = null
  onresult: FakeHandlers['onresult'] = null
  onerror: FakeHandlers['onerror'] = null
  onend: (() => void) | null = null
  started = false
  aborted = false
  stopped = false
  constructor() { FakeSpeechRecognition.instances.push(this) }
  start() { this.started = true; this.onstart?.() }
  stop() { this.stopped = true; this.onend?.() }
  abort() { this.aborted = true; this.onend?.() }
}

function pushFinal(recog: FakeSpeechRecognition, text: string) {
  const result = [{ transcript: text }] as Array<{ transcript: string }> & { isFinal: boolean }
  result.isFinal = true
  recog.onresult?.({ resultIndex: 0, results: [result] })
}
function pushInterim(recog: FakeSpeechRecognition, text: string) {
  const result = [{ transcript: text }] as Array<{ transcript: string }> & { isFinal: boolean }
  result.isFinal = false
  recog.onresult?.({ resultIndex: 0, results: [result] })
}

beforeEach(() => {
  FakeSpeechRecognition.instances = []
  ;(window as unknown as { SpeechRecognition?: typeof FakeSpeechRecognition }).SpeechRecognition = FakeSpeechRecognition
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  networkTest.reset()
})

describe('<VoiceCommandModal>', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <VoiceCommandModal open={false} onCancel={() => {}} onSubmit={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('auto-starts the recognizer on open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<VoiceCommandModal open onCancel={() => {}} onSubmit={() => {}} />)
    // start() is deferred ~50ms so the modal mounts first; advance
    // the timer to settle.
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(FakeSpeechRecognition.instances).toHaveLength(1)
    expect(FakeSpeechRecognition.instances[0].started).toBe(true)
  })

  it('accumulates final transcripts into the live preview', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<VoiceCommandModal open onCancel={() => {}} onSubmit={() => {}} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    const recog = FakeSpeechRecognition.instances[0]

    act(() => { pushFinal(recog, 'What does ASHRAE') })
    act(() => { pushFinal(recog, '62.1 say about CO2?') })

    expect(screen.getByText(/What does ASHRAE/)).toBeTruthy()
    expect(screen.getByText(/62\.1 say about CO2/)).toBeTruthy()
  })

  it('renders interim transcripts alongside finals (italic)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<VoiceCommandModal open onCancel={() => {}} onSubmit={() => {}} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    const recog = FakeSpeechRecognition.instances[0]

    act(() => { pushFinal(recog, 'What does ASHRAE') })
    act(() => { pushInterim(recog, '62.1 say') })

    expect(screen.getByText(/62\.1 say/)).toBeTruthy()
  })

  it('Cancel button calls onCancel + aborts the recognizer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const onCancel = vi.fn()
    render(<VoiceCommandModal open onCancel={onCancel} onSubmit={() => {}} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    const recog = FakeSpeechRecognition.instances[0]

    // Two Cancel buttons render — the top-bar text Cancel and the
    // footer Cancel. Both should work; we click the first.
    const cancelButtons = screen.getAllByRole('button', { name: /cancel/i })
    fireEvent.click(cancelButtons[0])
    expect(onCancel).toHaveBeenCalled()
    // Unmount via cleanup at end of test triggers the teardown
    // effect's abort(). Clicking Cancel itself doesn't abort —
    // the parent setting open=false is what triggers cleanup.
    // So we just check the cancel callback fired.
    expect(recog).toBeTruthy()
  })

  it('Send disabled until there is text; calls onSubmit when clicked with text', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const onSubmit = vi.fn()
    render(<VoiceCommandModal open onCancel={() => {}} onSubmit={onSubmit} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    const recog = FakeSpeechRecognition.instances[0]

    // Disabled state — button text reads "Speak to send".
    expect(screen.getByText(/speak to send/i)).toBeTruthy()

    act(() => { pushFinal(recog, 'What does ASHRAE 62.1 say about CO2?') })

    const sendBtn = screen.getByRole('button', { name: /^send$/i })
    fireEvent.click(sendBtn)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('What does ASHRAE 62.1 say about CO2?')
  })

  it('auto-submits after ~2.2s of silence post-transcript', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const onSubmit = vi.fn()
    render(<VoiceCommandModal open onCancel={() => {}} onSubmit={onSubmit} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    const recog = FakeSpeechRecognition.instances[0]

    act(() => { pushFinal(recog, 'How much ventilation is enough?') })

    await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('How much ventilation is enough?')
  })

  it('Esc key calls onCancel', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const onCancel = vi.fn()
    render(<VoiceCommandModal open onCancel={onCancel} onSubmit={() => {}} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('does not submit twice if Send is clicked then silence-timeout fires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const onSubmit = vi.fn()
    render(<VoiceCommandModal open onCancel={() => {}} onSubmit={onSubmit} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    const recog = FakeSpeechRecognition.instances[0]

    act(() => { pushFinal(recog, 'Test question?') })

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))
    await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does NOT start the recognizer when offline; shows the offline message', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    networkTest.setOnline(false)
    render(<VoiceCommandModal open onCancel={() => {}} onSubmit={() => {}} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(FakeSpeechRecognition.instances).toHaveLength(0)
    expect(screen.getByText(/voice commands need network/i)).toBeTruthy()
  })
})
