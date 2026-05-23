// @vitest-environment jsdom
/**
 * Unit tests for the voice-transcription primitives:
 *
 *   - `appendWithSpace` (VoiceInputButton helper) — covers the
 *     boundary cases that matter when piping dictated fragments
 *     into a text input value.
 *   - `useVoiceTranscription` (hook) — feature detection +
 *     unsupported-browser path + start/stop lifecycle with a
 *     stubbed window.SpeechRecognition.
 *
 * The hook tests use a tiny SpeechRecognition stub rather than the
 * native API (jsdom doesn't ship one). The stub exposes the same
 * surface — onstart/onresult/onerror/onend handlers + start/stop/
 * abort methods — and we drive it by calling those handlers
 * directly to simulate browser events.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { appendWithSpace } from '../../src/components/VoiceInputButton'
import {
  useVoiceTranscription,
  isVoiceTranscriptionSupported,
} from '../../src/hooks/useVoiceTranscription'

describe('appendWithSpace', () => {
  it('returns the fragment when the current value is empty', () => {
    expect(appendWithSpace('', 'hello')).toBe('hello')
    expect(appendWithSpace(null as unknown as string, 'hello')).toBe('hello')
    expect(appendWithSpace(undefined as unknown as string, 'hello')).toBe('hello')
  })

  it('returns the current value when the fragment is empty', () => {
    expect(appendWithSpace('existing text', '')).toBe('existing text')
    expect(appendWithSpace('existing text', '   ')).toBe('existing text')
  })

  it('inserts a single space between value and fragment when value lacks trailing whitespace', () => {
    expect(appendWithSpace('first phrase', 'second phrase')).toBe('first phrase second phrase')
  })

  it('does not double-space when the value already ends with whitespace', () => {
    expect(appendWithSpace('first phrase ', 'second')).toBe('first phrase second')
    expect(appendWithSpace('first phrase\n', 'second')).toBe('first phrase\nsecond')
  })

  it('trims surrounding whitespace from the fragment', () => {
    expect(appendWithSpace('one', '  two  ')).toBe('one two')
  })
})

// ─── Hook tests ────────────────────────────────────────────────────

interface RecognitionHandlers {
  onstart: (() => void) | null
  onresult: ((ev: { resultIndex: number; results: Array<Array<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((ev: { error: string }) => void) | null
  onend: (() => void) | null
}

class FakeSpeechRecognition implements RecognitionHandlers {
  static instances: FakeSpeechRecognition[] = []
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onstart: (() => void) | null = null
  onresult: RecognitionHandlers['onresult'] = null
  onerror: RecognitionHandlers['onerror'] = null
  onend: (() => void) | null = null
  started = false
  aborted = false
  stopped = false
  constructor() {
    FakeSpeechRecognition.instances.push(this)
  }
  start() {
    this.started = true
    this.onstart?.()
  }
  stop() {
    this.stopped = true
    this.onend?.()
  }
  abort() {
    this.aborted = true
    this.onend?.()
  }
}

function makeFinalResult(text: string) {
  const result = [{ transcript: text }] as Array<{ transcript: string }> & { isFinal: boolean }
  result.isFinal = true
  return { resultIndex: 0, results: [result] }
}

function makeInterimResult(text: string) {
  const result = [{ transcript: text }] as Array<{ transcript: string }> & { isFinal: boolean }
  result.isFinal = false
  return { resultIndex: 0, results: [result] }
}

describe('isVoiceTranscriptionSupported', () => {
  const originalWebkit = (window as any).webkitSpeechRecognition
  const originalStd = (window as any).SpeechRecognition

  afterEach(() => {
    ;(window as any).webkitSpeechRecognition = originalWebkit
    ;(window as any).SpeechRecognition = originalStd
  })

  it('returns false when no recognition class is available', () => {
    delete (window as any).webkitSpeechRecognition
    delete (window as any).SpeechRecognition
    expect(isVoiceTranscriptionSupported()).toBe(false)
  })

  it('returns true when webkitSpeechRecognition is available', () => {
    delete (window as any).SpeechRecognition
    ;(window as any).webkitSpeechRecognition = FakeSpeechRecognition
    expect(isVoiceTranscriptionSupported()).toBe(true)
  })

  it('returns true when SpeechRecognition is available', () => {
    delete (window as any).webkitSpeechRecognition
    ;(window as any).SpeechRecognition = FakeSpeechRecognition
    expect(isVoiceTranscriptionSupported()).toBe(true)
  })
})

describe('useVoiceTranscription', () => {
  const originalWebkit = (window as any).webkitSpeechRecognition
  const originalStd = (window as any).SpeechRecognition

  beforeEach(() => {
    FakeSpeechRecognition.instances = []
    ;(window as any).SpeechRecognition = FakeSpeechRecognition
    delete (window as any).webkitSpeechRecognition
  })
  afterEach(() => {
    ;(window as any).webkitSpeechRecognition = originalWebkit
    ;(window as any).SpeechRecognition = originalStd
  })

  it('exposes supported=false when no recognition class is available', () => {
    delete (window as any).SpeechRecognition
    const { result } = renderHook(() => useVoiceTranscription())
    expect(result.current.supported).toBe(false)
  })

  it('exposes supported=true and starts listening on start()', () => {
    const { result } = renderHook(() => useVoiceTranscription())
    expect(result.current.supported).toBe(true)
    expect(result.current.listening).toBe(false)
    act(() => { result.current.start() })
    expect(result.current.listening).toBe(true)
    expect(FakeSpeechRecognition.instances).toHaveLength(1)
    expect(FakeSpeechRecognition.instances[0].started).toBe(true)
  })

  it('emits final transcripts via onResult and clears interim afterward', () => {
    const onResult = vi.fn()
    const { result } = renderHook(() => useVoiceTranscription({ onResult }))
    act(() => { result.current.start() })
    const recog = FakeSpeechRecognition.instances[0]

    act(() => { recog.onresult?.(makeInterimResult('hello wor')) })
    expect(result.current.interim).toBe('hello wor')
    expect(onResult).not.toHaveBeenCalled()

    act(() => { recog.onresult?.(makeFinalResult('hello world')) })
    expect(onResult).toHaveBeenCalledWith('hello world')
    expect(result.current.interim).toBe('')
  })

  it('clears state on stop() and marks listening false', () => {
    const { result } = renderHook(() => useVoiceTranscription())
    act(() => { result.current.start() })
    expect(result.current.listening).toBe(true)
    act(() => { result.current.stop() })
    expect(result.current.listening).toBe(false)
    expect(result.current.interim).toBe('')
  })

  it('surfaces permission errors and stops listening', () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useVoiceTranscription({ onError }))
    act(() => { result.current.start() })
    const recog = FakeSpeechRecognition.instances[0]
    act(() => { recog.onerror?.({ error: 'not-allowed' }) })
    expect(result.current.error).toBe('not-allowed')
    expect(result.current.listening).toBe(false)
    expect(onError).toHaveBeenCalledWith('not-allowed')
  })

  it('calls onError with "unsupported" when start() runs on an unsupported browser', () => {
    delete (window as any).SpeechRecognition
    const onError = vi.fn()
    const { result } = renderHook(() => useVoiceTranscription({ onError }))
    act(() => { result.current.start() })
    expect(result.current.error).toBe('unsupported')
    expect(onError).toHaveBeenCalledWith('unsupported')
  })

  it('auto-restarts on browser-initiated end if continuous and user has not stopped', () => {
    const { result } = renderHook(() => useVoiceTranscription({ continuous: true }))
    act(() => { result.current.start() })
    const recog = FakeSpeechRecognition.instances[0]
    // Browser fires onend (e.g. iOS Safari 30s silence timeout).
    // The hook should call start() again on the same instance.
    recog.started = false
    act(() => { recog.onend?.() })
    expect(recog.started).toBe(true)
  })

  it('does NOT auto-restart after user-initiated stop()', () => {
    const { result } = renderHook(() => useVoiceTranscription({ continuous: true }))
    act(() => { result.current.start() })
    const recog = FakeSpeechRecognition.instances[0]
    act(() => { result.current.stop() })
    // stop() should mark the user-stopped flag; subsequent onend
    // should NOT restart.
    recog.started = false
    act(() => { recog.onend?.() })
    expect(recog.started).toBe(false)
  })
})
