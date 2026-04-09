/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 */

import { useState, useEffect } from 'react'

export function useMediaQuery() {
  const [state, setState] = useState(() => {
    if (typeof window === 'undefined') return { isDesktop: false, isTablet: false, isMobile: true, isStandalone: false }
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    const w = window.innerWidth
    return {
      isDesktop: w >= 1024,
      isTablet: w >= 768 && w < 1024,
      isMobile: w < 768,
      isStandalone: standalone,
    }
  })

  useEffect(() => {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)')
    const isStandalone = standaloneQuery.matches || window.navigator.standalone === true
    const desktop = window.matchMedia('(min-width: 1024px)')
    const tablet = window.matchMedia('(min-width: 768px) and (max-width: 1023px)')

    const update = () => {
      setState({
        isDesktop: desktop.matches,
        isTablet: tablet.matches,
        isMobile: !desktop.matches && !tablet.matches,
        isStandalone,
      })
    }

    update()
    desktop.addEventListener('change', update)
    tablet.addEventListener('change', update)
    return () => {
      desktop.removeEventListener('change', update)
      tablet.removeEventListener('change', update)
    }
  }, [])

  return state
}
