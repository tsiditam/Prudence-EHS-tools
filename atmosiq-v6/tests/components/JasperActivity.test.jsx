// @vitest-environment jsdom
/**
 * JasperActivity — Jasper at work, in place.
 *
 * Pins: the phrases walk the context's progression in order and then cycle
 * only the later ones; a real stage overrides the timer; assistive
 * technology gets one sentence and never the rotating phrases; completion
 * brightens once and hands back after the fade, immediately under reduced
 * motion.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import JasperActivity, {
  JASPER_ACTIVITY_CONTEXTS, JASPER_ACTIVITY_STAGES, JASPER_ACTIVITY_TIMING,
} from '../../src/components/ui/JasperActivity'

const CONTEXTS = Object.keys(JASPER_ACTIVITY_CONTEXTS)
const phrasesOf = (c) => [...c.sequence, ...c.loop, ...Object.values(c.phrases || {})]

const ctx = JASPER_ACTIVITY_CONTEXTS['logger-forensics']
const phrase = () => screen.getByTestId('jasper-activity-phrase').textContent
const tick = (ms) => act(() => { vi.advanceTimersByTime(ms) })

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('what the assessor sees', () => {
  it('starts on the first phrase and walks the progression in order', () => {
    render(<JasperActivity context="logger-forensics" />)
    expect(phrase()).toBe(ctx.sequence[0])
    for (let i = 1; i < ctx.sequence.length; i++) {
      tick(JASPER_ACTIVITY_TIMING.phraseMs)
      expect(phrase()).toBe(ctx.sequence[i])
    }
  })

  it('never restarts from the first phrase on a long run', () => {
    render(<JasperActivity context="logger-forensics" />)
    const seen = []
    for (let i = 0; i < ctx.sequence.length + 3 * ctx.loop.length; i++) {
      tick(JASPER_ACTIVITY_TIMING.phraseMs)
      seen.push(phrase())
    }
    const later = seen.slice(ctx.sequence.length)
    expect(later.length).toBeGreaterThan(0)
    for (const p of later) {
      expect(p).not.toBe(ctx.sequence[0])
      expect(ctx.loop).toContain(p)
    }
    // Consecutive phrases differ: nothing reads as stuck.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1])
  })

  it('follows a real stage instead of the timer when one is supplied', () => {
    const { rerender } = render(<JasperActivity context="logger-forensics" stage="reading" />)
    expect(phrase()).toBe(ctx.phrases.reading)
    tick(JASPER_ACTIVITY_TIMING.phraseMs * 3)
    expect(phrase()).toBe(ctx.phrases.reading)
    rerender(<JasperActivity context="logger-forensics" stage="checking_evidence" />)
    expect(phrase()).toBe(ctx.phrases.checking_evidence)
  })

  it('has a phrase for every stage, none of them generic', () => {
    for (const stage of JASPER_ACTIVITY_STAGES) expect(typeof ctx.phrases[stage]).toBe('string')
    const all = [...ctx.sequence, ...ctx.loop, ...Object.values(ctx.phrases)]
    for (const p of all) expect(p).not.toMatch(/^(Thinking|Working|Doing magic|AI is analyzing|Generating insights)/i)
  })

  it('reserves room for every phrase so a change never moves its neighbors', () => {
    const { container } = render(<JasperActivity context="logger-forensics" />)
    const stack = container.querySelectorAll('.af-ja-phrase')
    const distinct = new Set([...ctx.sequence, ...ctx.loop, ...Object.values(ctx.phrases)])
    expect(stack.length).toBe(distinct.size)
    tick(JASPER_ACTIVITY_TIMING.phraseMs)
    expect(container.querySelectorAll('.af-ja-phrase').length).toBe(distinct.size)
  })
})

describe('assistive technology', () => {
  it('announces one sentence and hides the rotating phrases', () => {
    render(<JasperActivity context="logger-forensics" />)
    const status = screen.getByRole('status')
    expect(status.textContent).toContain(ctx.announce)
    const text = status.querySelector('.af-ja-text')
    expect(text.getAttribute('aria-hidden')).toBe('true')
    expect(status.querySelector('.af-ja-brain').getAttribute('aria-hidden')).toBe('true')
  })
})

describe('completion', () => {
  it('brightens once, then hands back after the fade', () => {
    const onSettled = vi.fn()
    const { rerender } = render(<JasperActivity context="logger-forensics" active onSettled={onSettled} />)
    expect(screen.getByTestId('jasper-activity').className).toMatch(/af-ja-active/)
    rerender(<JasperActivity context="logger-forensics" active={false} onSettled={onSettled} />)
    const el = screen.getByTestId('jasper-activity')
    expect(el.className).toMatch(/af-ja-done/)
    expect(el.className).toMatch(/af-ja-leaving/)
    expect(el.className).not.toMatch(/af-ja-active/)
    tick(JASPER_ACTIVITY_TIMING.settleMs - 1)
    expect(onSettled).not.toHaveBeenCalled()
    tick(1)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('leaves quietly, with no brighten, when told the outcome is not a result', () => {
    const onSettled = vi.fn()
    render(<JasperActivity context="logger-forensics" active={false} brighten={false} onSettled={onSettled} />)
    const el = screen.getByTestId('jasper-activity')
    expect(el.className).not.toMatch(/af-ja-done/)
    expect(el.className).toMatch(/af-ja-quiet/)
    tick(JASPER_ACTIVITY_TIMING.fadeMs)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('stops rotating once finished', () => {
    const { rerender } = render(<JasperActivity context="logger-forensics" active />)
    rerender(<JasperActivity context="logger-forensics" active={false} />)
    const before = phrase()
    tick(JASPER_ACTIVITY_TIMING.phraseMs * 2)
    expect(phrase()).toBe(before)
  })

  it('hands back at once under reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })))
    const onSettled = vi.fn()
    render(<JasperActivity context="logger-forensics" active={false} onSettled={onSettled} />)
    tick(0)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })
})


describe('every registered context', () => {
  it('covers the four Jasper surfaces', () => {
    expect(CONTEXTS).toEqual(
      expect.arrayContaining(['logger-forensics', 'report-narrative', 'report-sections', 'assistant']),
    )
  })

  it('names the work rather than the machine', () => {
    for (const key of CONTEXTS) {
      const c = JASPER_ACTIVITY_CONTEXTS[key]
      expect(c.announce, key).toMatch(/\.$/)
      expect(c.sequence.length, key).toBeGreaterThan(2)
      expect(c.loop.length, key).toBeGreaterThan(1)
      for (const p of phrasesOf(c)) {
        expect(p, `${key}: ${p}`).toMatch(/…$/)
        expect(p, `${key}: ${p}`).not.toMatch(/^(Thinking|Working|Loading|Please wait|Doing magic|AI is analyzing|Generating insights)/i)
      }
    }
  })

  it('never reopens with the first phrase once the sequence is spent', () => {
    for (const key of CONTEXTS) {
      const c = JASPER_ACTIVITY_CONTEXTS[key]
      expect(c.loop, key).not.toContain(c.sequence[0])
    }
  })

  it('walks each context in its own words', () => {
    for (const key of CONTEXTS) {
      const c = JASPER_ACTIVITY_CONTEXTS[key]
      const { unmount } = render(<JasperActivity context={key} />)
      expect(phrase(), key).toBe(c.sequence[0])
      tick(JASPER_ACTIVITY_TIMING.phraseMs)
      expect(phrase(), key).toBe(c.sequence[1])
      unmount()
    }
  })
})

describe('a caller with live status text', () => {
  it('shows the text it is given and runs no timer', () => {
    const { rerender } = render(<JasperActivity context="assistant" phrase="Searching the standards corpus…" />)
    expect(phrase()).toBe('Searching the standards corpus…')
    tick(JASPER_ACTIVITY_TIMING.phraseMs * 3)
    expect(phrase()).toBe('Searching the standards corpus…')
    rerender(<JasperActivity context="assistant" phrase="Analyzing the attached photo…" />)
    expect(phrase()).toBe('Analyzing the attached photo…')
  })

  it('reserves no width, since the set is not knowable', () => {
    const { container } = render(<JasperActivity context="assistant" phrase="Searching the web…" />)
    expect(container.querySelectorAll('.af-ja-phrase').length).toBe(1)
  })

  it('wraps rather than running a long tool description off the screen', () => {
    const { container, rerender } = render(
      <JasperActivity context="assistant" phrase={'Searching standards for "a very long query a phone cannot fit"…'} />,
    )
    expect(container.querySelector('.af-ja-text').className).toContain('af-ja-free')
    // The fixed sets keep their nowrap — that is what stops a swap moving the row.
    rerender(<JasperActivity context="assistant" />)
    expect(container.querySelector('.af-ja-text').className).not.toContain('af-ja-free')
  })

  it('rejoins the timed phrases without rewinding when the stage clears', () => {
    const assistant = JASPER_ACTIVITY_CONTEXTS.assistant
    const { rerender } = render(<JasperActivity context="assistant" phrase="Searching the web…" />)
    rerender(<JasperActivity context="assistant" />)
    expect(phrase()).not.toBe(assistant.sequence[0])
    expect(assistant.loop).toContain(phrase())
  })
})

describe('a surface with its own status face', () => {
  it('keeps the type it passes in', () => {
    const { container } = render(
      <JasperActivity context="assistant" textStyle={{ fontFamily: 'PixelFace', fontWeight: 700 }} />,
    )
    const text = container.querySelector('.af-ja-text')
    expect(text.style.fontFamily).toContain('PixelFace')
    expect(text.style.fontWeight).toBe('700')
  })
})
