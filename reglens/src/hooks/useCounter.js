/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 * Contact: tsidi@prudenceehs.com
 */

import { useState, useEffect, useRef } from 'react'
import { useInView } from './useInView'

export function useCounter(target, duration = 1500) {
  const [ref, isInView] = useInView({ threshold: 0.3 })
  const [value, setValue] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    if (!isInView || started.current) return
    started.current = true

    const num = typeof target === 'string' ? parseFloat(target) || 0 : target
    if (num === 0) { setValue(0); return }

    let start = null
    const step = (ts) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(num * eased))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [isInView, target, duration])

  return [ref, value]
}
