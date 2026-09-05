// @vitest-environment jsdom
/**
 * useScrollEdges — the fade goes on the side that actually has content.
 *
 * The strip is masked so an overflowing tab list stops cutting its last
 * label in half ("Clo", "Assessm"). The property worth pinning is that the
 * fade is CONDITIONAL: a permanent mask would dim the first chip on a strip
 * that fits and dim the last one once you have scrolled to it, both of which
 * promise more content than exists.
 *
 * jsdom performs no layout, so scrollWidth/clientWidth/scrollLeft are stubbed.
 * The assertions read the style object the hook RETURNS rather than the
 * element's computed style: jsdom's CSS engine does not implement
 * `mask-image`, so it silently drops the declaration and every assertion
 * against the DOM would pass vacuously on an empty string.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useScrollEdges } from '../../src/hooks/useScrollEdges'

afterEach(() => { cleanup() })

/** A strip whose overflow and scroll position we control. */
function Strip({ scrollWidth, clientWidth, scrollLeft }: {
  scrollWidth: number; clientWidth: number; scrollLeft: number
}) {
  const { ref, maskStyle } = useScrollEdges()
  return (
    <div
      data-testid="strip"
      ref={(el) => {
        if (el) {
          Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
          Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
          Object.defineProperty(el, 'scrollLeft', { value: scrollLeft, writable: true, configurable: true })
        }
        ref.current = el
      }}
      style={{ overflowX: 'auto', ...maskStyle }}
    >
      <span data-testid="mask">{JSON.stringify(maskStyle)}</span>
    </div>
  )
}

const maskOf = (el: HTMLElement) =>
  (JSON.parse(el.textContent || '{}') as { maskImage?: string }).maskImage || ''

describe('useScrollEdges', () => {
  it('adds no mask when the strip fits', () => {
    const { getByTestId } = render(<Strip scrollWidth={300} clientWidth={300} scrollLeft={0} />)
    expect(maskOf(getByTestId('mask'))).toBe('')
  })

  it('fades only the trailing edge at the start of an overflowing strip', () => {
    const { getByTestId } = render(<Strip scrollWidth={900} clientWidth={353} scrollLeft={0} />)
    const mask = maskOf(getByTestId('mask'))
    // Opaque from 0 (the first chip is flush and must not be dimmed)…
    expect(mask).toMatch(/#000 0/)
    // …fading out before the right edge, where the cut used to be.
    expect(mask).toMatch(/transparent 100%/)
  })

  it('fades both edges mid-scroll', () => {
    const { getByTestId } = render(<Strip scrollWidth={900} clientWidth={353} scrollLeft={200} />)
    const mask = maskOf(getByTestId('mask'))
    expect(mask).toMatch(/transparent 0/)
    expect(mask).toMatch(/transparent 100%/)
  })

  it('fades only the leading edge once scrolled to the end', () => {
    // scrollLeft === scrollWidth - clientWidth: nothing further right.
    const { getByTestId } = render(<Strip scrollWidth={900} clientWidth={353} scrollLeft={547} />)
    const mask = maskOf(getByTestId('mask'))
    expect(mask).toMatch(/transparent 0/)
    expect(mask).toMatch(/#000 100%/)
    expect(mask).not.toMatch(/transparent 100%/)
  })

  it('carries the -webkit- form too, which is what iOS Safari reads', () => {
    const { getByTestId } = render(<Strip scrollWidth={900} clientWidth={353} scrollLeft={0} />)
    const style = JSON.parse(getByTestId('mask').textContent || '{}')
    expect(style.WebkitMaskImage).toBeTruthy()
    expect(style.WebkitMaskImage).toBe(style.maskImage)
  })
})
