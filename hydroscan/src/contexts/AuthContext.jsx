/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AuthContext — Supabase auth session + profile. Degrades gracefully when
 * Supabase is unconfigured (`configured:false`), so the app still runs
 * standalone (no forced login) in environments without Supabase env vars.
 */

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import { getProfile, upsertProfile } from '../utils/profiles'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext) || { configured: false, user: null, profile: null, loading: false }
}

export function AuthProvider({ children }) {
  const configured = !!supabase
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(configured)

  useEffect(() => {
    if (!configured) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data?.session?.user || null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })
    return () => sub?.subscription?.unsubscribe?.()
  }, [configured])

  useEffect(() => {
    let active = true
    if (user) getProfile(user.id).then((p) => { if (active) setProfile(p) })
    else setProfile(null)
    return () => { active = false }
  }, [user])

  const value = {
    configured,
    user,
    profile,
    loading,
    signUp: (email, password) => supabase.auth.signUp({ email, password }),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signInWithGoogle: () =>
      supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }),
    signOut: async () => { try { await supabase.auth.signOut() } finally { setUser(null); setProfile(null) } },
    saveProfile: async (fields) => {
      if (!user) return null
      const p = await upsertProfile(user.id, user.email, fields)
      setProfile(p)
      return p
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
