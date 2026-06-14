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

import { useState } from 'react'
import { useMediaQuery } from './hooks/useMediaQuery'
import LandingPage from './components/LandingPage'
import MobileApp from './components/MobileApp'
import PeerReviewLanding, { PEER_REVIEW_TOKEN_PARAM } from './components/PeerReviewLanding'
import { AssessmentProvider } from './contexts/AssessmentContext.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { StorageProvider } from './contexts/StorageContext.jsx'

// ── Root router ─────────────────────────────────────────────────────────────
// AtmosFlow is one responsive web app: the modern MobileApp shell serves BOTH
// mobile and desktop. At >=1024 it renders the persistent desktop sidebar (see
// useMediaQuery().isDesktop + components/desktop/DesktopSidebar); below that,
// the mobile bottom dock. This router only decides the ENTRY point: a
// peer-review magic link, the desktop marketing landing (first visit), or the
// app itself.
//
// (The previous desktop-only assessment wizard that lived here — together with
// HistoryView / ReportView / components/DesktopSidebar — was superseded by
// routing desktop into MobileApp and has been removed.)
export default function App() {
  const { isDesktop, isStandalone } = useMediaQuery()
  // Desktop shows the marketing landing on first visit; its CTAs enter the
  // app. Sticky (localStorage) so returning desktop visitors go straight in.
  // Mobile never reaches this. Declared before any return (hooks-safe).
  const [enterApp, setEnterApp] = useState(() => {
    try { return localStorage.getItem('af_desktop_entered') === '1' } catch { return false }
  })
  const goToApp = () => {
    try { localStorage.setItem('af_desktop_entered', '1') } catch { /* private mode */ }
    setEnterApp(true)
  }

  // Peer-review magic link — resolved before auth so an un-authenticated
  // reviewer (the colleague the assessor sent the report to) can record their
  // response without an AtmosFlow account. Server-validated UUID.
  const reviewToken = (typeof window !== 'undefined')
    ? new URLSearchParams(window.location.search).get(PEER_REVIEW_TOKEN_PARAM)
    : null
  if (reviewToken) return <PeerReviewLanding token={reviewToken} />

  // Desktop browser, first visit → marketing landing; its CTAs enter the app.
  // Installed desktop PWA (standalone) skips straight in.
  if (isDesktop && !isStandalone && !enterApp) {
    return <LandingPage onStartNew={goToApp} onStartDemo={goToApp} isDesktop={true} />
  }

  // The app — single responsive shell for mobile and desktop.
  return (
    <AuthProvider>
      <StorageProvider>
        <AssessmentProvider>
          <MobileApp />
        </AssessmentProvider>
      </StorageProvider>
    </AuthProvider>
  )
}
