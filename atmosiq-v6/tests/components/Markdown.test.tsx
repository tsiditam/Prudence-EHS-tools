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

  it('lets a wide table overflow into its scroll container instead of crushing columns', () => {
    // The benchmark table Jasper emits for a finalized report — six
    // columns, one of them long prose. Pinned because `width: 100%` on the
    // table forced all six into the phone's width, and the break-word the
    // chat message style cascades in then wrapped the headers one
    // character per line.
    const md = [
      '| Parameter | Indoor | Outdoor | I/O Ratio | Benchmark | Status |',
      '| --- | --- | --- | --- | --- | --- |',
      '| CO2 (ppm) | 420 | 550 | — | ASHRAE 62.1-2025 §6.4 | Pass |',
      '| PM2.5 (ug/m3) | 45 | 2.3 | 19.57 | EPA NAAQS 24-hr: 35 ug/m3 | Exceeds |',
    ].join('\n')

    const { container } = render(<Markdown>{md}</Markdown>)

    const table = container.querySelector('table') as HTMLElement
    const scroller = table.parentElement as HTMLElement

    // The table sizes to its content and may exceed the surface; the
    // wrapper scrolls. `width: 100%` here is the bug, not the fix.
    expect(table.style.width).toBe('auto')
    expect(table.style.minWidth).toBe('100%')
    expect(scroller.style.overflowX).toBe('auto')

    // Headers hold their column floors and stay whole words.
    const th = container.querySelector('th') as HTMLElement
    expect(th.style.whiteSpace).toBe('nowrap')
    expect(th.style.wordBreak).toBe('normal')

    // Cells break between words, never mid-token.
    const td = container.querySelector('td') as HTMLElement
    expect(td.style.wordBreak).toBe('normal')
    expect(td.style.overflowWrap).toBe('break-word')
  })

  it('accepts the wrapper style prop', () => {
    const { container } = render(<Markdown style={{ color: 'rgb(1, 2, 3)' }}>{'hi'}</Markdown>)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.color).toBe('rgb(1, 2, 3)')
  })
})
