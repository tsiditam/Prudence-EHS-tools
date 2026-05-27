/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * BouncyButton — drop-in button wrapper that adds the Claude/Vercel
 * true-physics spring on tap + hover. Visual styling is entirely yours
 * (pass `style`/`className`/children); this only adds the feel.
 *
 *   <BouncyButton onClick={...} style={...}>Continue</BouncyButton>
 *   <BouncyButton as={MyButton} haptic>Save</BouncyButton>   // wrap a component
 *
 * The feel spec (spring + scales) lives in ../../styles/spring-motion.js
 * — see its FEEL NOTES block for how to dial it bouncier/snappier.
 *
 * Notes:
 *   • Vite SPA, so no "use client" is needed (no React Server Components).
 *   • Pass `as` to wrap an arbitrary element/component; it's adapted with
 *     motion.create() (the Motion v12 replacement for motion()) so the
 *     wrapped component's styles/props/ref survive. Defaults to <button>.
 *   • useReducedMotion() → renders with no animation props when the user
 *     prefers reduced motion.
 */

import { forwardRef, useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { tapFeelProps, tapHaptic } from '../../styles/spring-motion'

const BouncyButton = forwardRef(function BouncyButton(
  { as, hover = true, haptic = false, onPointerDown, children, ...rest },
  ref,
) {
  const reduced = useReducedMotion()
  // motion.button for the default case; motion.create(as) to adapt a
  // custom component/element while preserving its styles + ref.
  const MotionEl = useMemo(() => (as ? motion.create(as) : motion.button), [as])

  const handlePointerDown = (e) => {
    if (haptic) tapHaptic()
    onPointerDown?.(e)
  }

  return (
    <MotionEl ref={ref} onPointerDown={handlePointerDown} {...tapFeelProps(reduced, { hover })} {...rest}>
      {children}
    </MotionEl>
  )
})

export default BouncyButton
