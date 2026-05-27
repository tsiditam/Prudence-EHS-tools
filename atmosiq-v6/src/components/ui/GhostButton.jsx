/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * GhostButton — low-emphasis bordered button (transparent fill, neutral
 * border) for secondary actions: Replace, Remove, Export, "Adjust mapping".
 * Pass `style` to tweak spacing / compact padding / a danger color override.
 * Plain V3 token surface, not soft-glass.
 *
 * Carries the same Claude/Vercel tap+hover spring as TactileButton (it had
 * no press feel before). Visuals are unchanged; see ../../styles/spring-motion.
 */
import { forwardRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { tapFeelProps } from '../../styles/spring-motion'

const BORDER = 'var(--border)', SUB = 'var(--sub)'

export const ghostButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, color: SUB, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 38, WebkitTapHighlightColor: 'transparent' }

const GhostButton = forwardRef(function GhostButton({ onClick, disabled, style, children, ...rest }, ref) {
  const reduced = useReducedMotion()
  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      disabled={disabled}
      style={{ ...ghostButtonStyle, ...style }}
      {...(disabled ? {} : tapFeelProps(reduced))}
      {...rest}
    >
      {children}
    </motion.button>
  )
})

export default GhostButton
