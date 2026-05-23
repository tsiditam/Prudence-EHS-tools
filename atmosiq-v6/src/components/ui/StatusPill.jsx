/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * StatusPill — soft-glass status / severity / confidence chip.
 *
 *   <StatusPill tone={V3.SEVERITY.critical}>Critical</StatusPill>
 *   <StatusPill tone={V3.CONFIDENCE.high} size="lg">High confidence</StatusPill>
 *
 * Color contract:
 *   - V3.SEVERITY.{critical|high|medium|low|pass|info}
 *   - V3.CONFIDENCE.{high|medium|low}
 *   - V3.STATUS.{inProgress|draft|ready|blocked|archived}
 *
 * Visual: the pill picks up the tone's 12% background fill, a 33%
 * border, and an inner highlight so it reads as a soft-glass chip
 * rather than a flat-color block. Letter-spacing + uppercase
 * matches the rest of the V3 micro-label scale.
 */

import { softPill } from '../../styles/soft-glass'

export default function StatusPill({ tone, size = 'sm', children, style, ...rest }) {
  const composed = {
    ...softPill(tone, { lg: size === 'lg' }),
    ...style,
  }
  return <span style={composed} {...rest}>{children}</span>
}
