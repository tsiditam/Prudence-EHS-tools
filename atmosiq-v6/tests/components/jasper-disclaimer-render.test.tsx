// @vitest-environment jsdom
/**
 * The Jasper chat renders the closing AI-assistance disclaimer as a
 * distinct footnote — italic and smaller than the answer body — so it
 * reads apart from the response. Pins:
 *   1. The disclaimer text appears exactly once, in its own element.
 *   2. That element is italic and a smaller font size than the body.
 *   3. The answer body renders without the raw disclaimer trailing it.
 *   4. A user message is untouched (plain, no peeling).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MessageBubble } from '../../src/components/FieldAssistant'
import { AI_DISCLAIMER_LINE } from '../../src/constants/field-assistant-prompt.js'

afterEach(cleanup)

describe('Jasper closing disclaimer rendering', () => {
  it('renders the disclaimer italic + smaller, split from the body', () => {
    const body = 'Elevated CO₂ points to under-ventilation.'
    render(<MessageBubble role="assistant" content={`${body}\n\n${AI_DISCLAIMER_LINE}`} />)

    const el = screen.getByText(AI_DISCLAIMER_LINE)
    expect(el).toBeTruthy()
    expect(el.style.fontStyle).toBe('italic')

    // Smaller than the assistant body (15px). getComputedStyle reads the
    // inline style; the disclaimer is 12px.
    const size = parseFloat(el.style.fontSize)
    expect(size).toBeGreaterThan(0)
    expect(size).toBeLessThan(15)

    // The disclaimer lives in its own node, not concatenated into the body text.
    expect(el.textContent).toBe(AI_DISCLAIMER_LINE)
  })

  it('leaves a user message plain (no disclaimer peeling)', () => {
    const text = `What is the ASHRAE 62.1 CO₂ guidance? ${AI_DISCLAIMER_LINE}`
    render(<MessageBubble role="user" content={text} />)
    // User content is not split; it renders as the typed text.
    expect(screen.getByText(text)).toBeTruthy()
  })
})
