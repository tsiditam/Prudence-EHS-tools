// @vitest-environment jsdom
/**
 * Markdown — shared on-screen renderer for AI display surfaces.
 *
 * Pins:
 *   • Headings, bold, italic, ordered + unordered lists, and GFM tables
 *     render as real DOM elements (not literal markdown characters).
 *   • Single newlines become <br> (remark-breaks), matching the prior
 *     pre-wrap line-break feel.
 *   • There is NO raw-HTML pass-through — a <script> in the input renders
 *     as visible text, never as a live element (react-markdown builds
 *     React nodes; no dangerouslySetInnerHTML).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Markdown from '../../src/components/Markdown'

afterEach(cleanup)

describe('Markdown', () => {
  it('renders headings, bold, italic, lists, and a GFM table', () => {
    const md = [
      '## Hypotheses',
      '',
      'This is **bold** and this is *italic*.',
      '',
      '- first bullet',
      '- second bullet',
      '',
      '1. step one',
      '2. step two',
      '',
      '| Hypothesis | Increases confidence |',
      '| --- | --- |',
      '| Under-ventilation | CO2 decay test |',
    ].join('\n')

    const { container } = render(<Markdown>{md}</Markdown>)

    expect(screen.getByText('Hypotheses')).toBeTruthy()
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelector('em')?.textContent).toBe('italic')
    expect(container.querySelectorAll('ul li').length).toBe(2)
    expect(container.querySelectorAll('ol li').length).toBe(2)

    const table = container.querySelector('table')
    expect(table).toBeTruthy()
    expect(container.querySelectorAll('th').length).toBe(2)
    expect(container.querySelector('td')?.textContent).toBe('Under-ventilation')
  })

  it('renders single newlines as line breaks (remark-breaks)', () => {
    const { container } = render(<Markdown>{'line one\nline two'}</Markdown>)
    expect(container.querySelector('br')).toBeTruthy()
    expect(container.textContent).toContain('line one')
    expect(container.textContent).toContain('line two')
  })

  it('does not inject raw HTML — a script tag renders as text, not an element', () => {
    const { container } = render(<Markdown>{'before <script>window.__pwned=1</script> after'}</Markdown>)
    expect(container.querySelector('script')).toBeNull()
    expect((window as any).__pwned).toBeUndefined()
    expect(container.textContent).toContain('window.__pwned=1')
  })

  it('accepts the wrapper style prop', () => {
    const { container } = render(<Markdown style={{ color: 'rgb(1, 2, 3)' }}>{'hi'}</Markdown>)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.color).toBe('rgb(1, 2, 3)')
  })
})
