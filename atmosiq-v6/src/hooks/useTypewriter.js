import { useEffect, useState } from 'react'

/**
 * useTypewriter — a looping typewriter state machine.
 *
 *   typing -> holding -> deleting -> pausing -> typing -> ...
 *
 * Scheduling is plain setTimeout; every timer is cleared on unmount and on any
 * dependency change, so there are no leaks. Honors prefers-reduced-motion by
 * rendering the full text once with no animation.
 *
 * Returns the currently-visible substring (the caller renders the cursor).
 *
 * @param {object}  opts
 * @param {string}  opts.text           phrase to type (default "in minutes")
 * @param {number}  opts.typingSpeed    ms per character while typing (default 50)
 * @param {number}  opts.deletingSpeed  ms per character while deleting (default 30)
 * @param {number}  opts.holdDuration   ms to hold the full phrase (default 3000)
 * @param {number}  opts.pauseDuration  ms to pause before retyping (default 500)
 */
export function useTypewriter({
  text = 'in minutes',
  typingSpeed = 50,
  deletingSpeed = 30,
  holdDuration = 3000,
  pauseDuration = 500,
} = {}) {
  const [display, setDisplay] = useState('')
  const [phase, setPhase] = useState('typing')

  // Restart cleanly whenever the text or timing changes.
  useEffect(() => {
    setDisplay('')
    setPhase('typing')
  }, [text, typingSpeed, deletingSpeed, holdDuration, pauseDuration])

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setDisplay(text)
      return undefined
    }

    let timer
    if (phase === 'typing') {
      if (display.length < text.length) {
        timer = setTimeout(() => setDisplay(text.slice(0, display.length + 1)), typingSpeed)
      } else {
        setPhase('holding')
      }
    } else if (phase === 'holding') {
      timer = setTimeout(() => setPhase('deleting'), holdDuration)
    } else if (phase === 'deleting') {
      if (display.length > 0) {
        timer = setTimeout(() => setDisplay(text.slice(0, display.length - 1)), deletingSpeed)
      } else {
        setPhase('pausing')
      }
    } else if (phase === 'pausing') {
      timer = setTimeout(() => setPhase('typing'), pauseDuration)
    }
    return () => clearTimeout(timer)
  }, [display, phase, text, typingSpeed, deletingSpeed, holdDuration, pauseDuration])

  return display
}

export default useTypewriter
