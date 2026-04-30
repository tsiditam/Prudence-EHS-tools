/**
 * AtmosFlow Auth Context
 * User profile, credits, authentication state.
 */

import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react'
import STO from '../utils/storage'
import SupaStorage from '../utils/supabaseStorage'
import { supabase, trackEvent } from '../utils/supabaseClient'
import Profiles from '../utils/profiles'

const AuthContext = createContext(null)

async function sendAuditBeacon(action, details) {
  if (!supabase) return
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    await fetch('/api/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, details: details || {} }),
    })
  } catch {}
}

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [profileChecked, setProfileChecked] = useState(false)
  const [credits, setCredits] = useState(5)
  const [adminSecret, setAdminSecret] = useState(null)

  const fetchCredits = useCallback(async () => {
    if (!supabase) return
    try {
      const session = await SupaStorage.getSession()
      if (session?.access_token) {
        const res = await fetch('/api/credits', { headers: { 'Authorization': 'Bearer ' + session.access_token } })
        if (res.ok) { const data = await res.json(); setCredits(data.credits ?? 5) }
      }
    } catch {}
  }, [])

  const consumeCredit = useCallback(async (amount, reason, refId) => {
    setCredits(prev => Math.max(0, prev - amount))
    trackEvent('credit_consumed', { amount, reason, balance: credits - amount })
    if (supabase) {
      try {
        const session = await SupaStorage.getSession()
        if (session?.access_token) {
          const res = await fetch('/api/credits', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, reason, reference_id: refId || '' }) })
          if (res.ok) { const data = await res.json(); setCredits(data.credits) }
        }
      } catch {}
    }
  }, [credits])

  const handleLogin = useCallback(async (userOrProfile) => {
    if (userOrProfile?.email && supabase) {
      trackEvent('login_completed', {})
      sendAuditBeacon('user.signin').catch(() => {})
      const p = await SupaStorage.getProfile()
      if (p) setProfile(p)
      else setProfile({ id: userOrProfile.id, name: userOrProfile.email, isNew: true })
      SupaStorage.fullSync()
      await fetchCredits()
    } else {
      setProfile(userOrProfile)
    }
  }, [fetchCredits])

  const handleLogout = useCallback(async () => {
    if (supabase) {
      // Send audit beacon BEFORE signOut clears the session.
      await sendAuditBeacon('user.signout').catch(() => {})
      await SupaStorage.signOut()
    }
    setProfile(null)
  }, [])

  // Check auth on mount
  useEffect(() => {
    (async () => {
      if (supabase) {
        const user = await SupaStorage.getUser()
        if (user) {
          const p = await SupaStorage.getProfile()
          if (p) setProfile(p)
          else setProfile({ id: user.id, name: user.email, isNew: true })
          SupaStorage.processSyncQueue()
          await fetchCredits()
        }
      } else {
        const activeProfile = await Profiles?.getActiveProfile?.()
        if (activeProfile) setProfile(activeProfile)
      }
      setProfileChecked(true)
    })()
  }, [fetchCredits])

  // Listen for auth changes
  useEffect(() => {
    return SupaStorage.onAuthChange((event) => {
      if (event === 'SIGNED_OUT') { setProfile(null) }
    })
  }, [])

  const value = useMemo(() => ({
    profile, setProfile, profileChecked,
    credits, setCredits, consumeCredit, fetchCredits,
    adminSecret, setAdminSecret,
    handleLogin, handleLogout,
    supabase,
  }), [profile, profileChecked, credits, consumeCredit, fetchCredits, adminSecret, handleLogin, handleLogout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export default AuthContext
