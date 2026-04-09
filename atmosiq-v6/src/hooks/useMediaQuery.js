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
    if (typeof window === 'undefined') return { isDesktop: false, isTablet: false, isTabletLand: false, isMobile: true, isStandalone: false }
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    const w = window.innerWidth
    const h = window.innerHeight
    return {
      isDesktop: w >= 1024 && !standalone,
      isTablet: w >= 768,
      isTabletLand: w >= 768 && w > h,
      isMobile: w < 768,
      isStandalone: standalone,
    }
  })

  useEffect(() => {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)')
    const isStandalone = standaloneQuery.matches || window.navigator.standalone === true

    const update = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      setState({
        isDesktop: w >= 1024 && !isStandalone,
        isTablet: w >= 768,
        isTabletLand: w >= 768 && w > h,
        isMobile: w < 768,
        isStandalone,
      })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', () => setTimeout(update, 100))
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', () => {})
    }
  }, [])

  return state
}
