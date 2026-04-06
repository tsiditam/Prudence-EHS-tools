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
  const [state, setState] = useState(() => ({
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : false,
    isTablet: typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : true,
  }))

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const tablet = window.matchMedia('(min-width: 768px) and (max-width: 1023px)')

    const update = () => {
      setState({
        isDesktop: desktop.matches,
        isTablet: tablet.matches,
        isMobile: !desktop.matches && !tablet.matches,
      })
    }

    desktop.addEventListener('change', update)
    tablet.addEventListener('change', update)
    return () => {
      desktop.removeEventListener('change', update)
      tablet.removeEventListener('change', update)
    }
  }, [])

  return state
}
