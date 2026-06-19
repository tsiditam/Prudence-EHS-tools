import './TypewriterText.css'
import useTypewriter from '../hooks/useTypewriter'

/**
 * TypewriterText — an inline, looping typewriter for a single phrase, sized to
 * flow inside a headline. Type -> hold -> delete -> pause -> retype, forever,
 * with a CSS-blinking cursor. Honors prefers-reduced-motion (full text, steady).
 *
 * Renders as a <span> so it inherits the headline's font (weight/size). Only the
 * accent color is applied; the default cyan pops against the ink headline text.
 *
 * @example
 *   <h1>From field data to a defensible IAQ draft report{' '}
 *     <TypewriterText text="in minutes" holdDuration={60000} />.
 *   </h1>
 */
export default function TypewriterText({
  text = 'in minutes',
  typingSpeed = 50,
  deletingSpeed = 30,
  holdDuration = 3000,
  pauseDuration = 500,
  color = '#06B6D4',
  className = '',
  ...rest
}) {
  const display = useTypewriter({ text, typingSpeed, deletingSpeed, holdDuration, pauseDuration })

  return (
    <span className={`tw${className ? ` ${className}` : ''}`} style={{ color }} {...rest}>
      {/* Visible, animated text + blinking cursor — hidden from assistive tech. */}
      <span className="tw-anim" aria-hidden="true" data-testid="tw-visible">
        {display}
        <span className="tw-cursor">|</span>
      </span>
      {/* Stable phrase announced once by screen readers. */}
      <span className="tw-sr">{text}</span>
    </span>
  )
}
