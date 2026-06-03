/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Contact: tsidi@prudenceehs.com
 *
 * App root. Hosts the AuthProvider and gates the app surface (Phase 5):
 *   - Desktop (non-PWA) shows the public marketing landing.
 *   - When Supabase is configured and no user is signed in → AuthScreen.
 *   - Otherwise → the mobile app shell.
 * If Supabase is unconfigured the gate is skipped, so the app still runs
 * standalone with local-only persistence.
 */

import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useMediaQuery } from './hooks/useMediaQuery'
import MobileApp from './components/MobileApp'
import AuthScreen from './components/AuthScreen'
import LandingPage from './components/LandingPage'

function Gate() {
  const { configured, user, loading } = useAuth()
  const { isDesktop, isStandalone } = useMediaQuery()

  // Public marketing landing on desktop browsers.
  if (isDesktop && !isStandalone) return <LandingPage isDesktop={true} />

  if (configured && loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sub)', fontFamily: 'var(--font-sans)' }}>
        Loading…
      </div>
    )
  }
  if (configured && !user) return <AuthScreen />
  return <MobileApp />
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
