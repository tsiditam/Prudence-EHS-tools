/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * useCollaborators — real-time presence for an assessment session.
 * Wraps Supabase Realtime's presence channel so multiple IHs working
 * the same building know who else is in the assessment and which
 * zone each person is currently on.
 *
 *   const { collaborators, count, isOnly, supported } = useCollaborators({
 *     assessmentId,
 *     me: { id, name, avatar_url },
 *     currentZone,            // optional, updates when the assessor changes zones
 *     enabled: true,
 *   })
 *
 * Behavior:
 *   - When assessmentId + me.id are both set and supported is true,
 *     joins the channel `assessment:<id>` and tracks the local
 *     presence as { id, name, avatar_url, current_zone, joined_at }.
 *   - Presence state syncs automatically via Supabase Realtime;
 *     the hook re-renders whenever another collaborator joins,
 *     leaves, or updates their current_zone.
 *   - `collaborators` is the list of OTHER users (own presence
 *     filtered out) — UI renders just this. `count` excludes self.
 *   - When the assessor changes zones, the hook re-tracks the
 *     updated state so peers see the new zone in real time.
 *
 * Multi-presence handling: a single user_id may appear with multiple
 * presence refs (e.g. one IH on phone + tablet). The hook collapses
 * them into a single entry per user_id with the most-recent
 * current_zone winning.
 *
 * Graceful degradation: when supabase or realtime is unavailable
 * (no env vars, or older browser), supported=false and the hook
 * returns an empty list. UI either hides the bar or shows a "solo"
 * indicator — caller's choice.
 */

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../utils/supabaseClient'

/**
 * @param {Object} [options]
 * @param {string} [options.assessmentId]
 * @param {{ id?: string, name?: string, avatar_url?: string|null }} [options.me]
 * @param {string|null} [options.currentZone]
 * @param {boolean} [options.enabled]
 */
export function useCollaborators({
  assessmentId,
  me,
  currentZone = null,
  enabled = true,
} = {}) {
  const [collaborators, setCollaborators] = useState([])
  const [error, setError] = useState(null)
  const channelRef = useRef(null)
  // Track the latest tracked-state values via refs so the
  // currentZone effect can update the channel without re-creating
  // it on every zone change.
  const meRef = useRef(me)
  meRef.current = me
  const zoneRef = useRef(currentZone)
  zoneRef.current = currentZone

  const supported = !!supabase && typeof supabase.channel === 'function'

  // Channel lifecycle — keyed on assessmentId so navigating between
  // assessments creates a fresh channel cleanly.
  useEffect(() => {
    if (!enabled || !supported || !assessmentId || !me || !me.id) {
      setCollaborators([])
      return undefined
    }

    let active = true
    const channelName = `assessment:${assessmentId}`
    const channel = supabase.channel(channelName, {
      config: { presence: { key: me.id } },
    })

    const updateFromChannel = () => {
      if (!active) return
      let raw
      try { raw = channel.presenceState() } catch { return }
      const flat = []
      for (const list of Object.values(raw || {})) {
        if (!Array.isArray(list)) continue
        for (const entry of list) flat.push(entry)
      }
      // Collapse multi-device presence: most-recent joined_at wins
      // per user_id. Drop our own presence so the UI only shows
      // OTHER collaborators.
      const dedup = new Map()
      for (const e of flat) {
        if (!e || !e.id) continue
        if (e.id === me.id) continue
        const prev = dedup.get(e.id)
        const prevTs = prev && prev.joined_at ? Date.parse(prev.joined_at) : 0
        const nextTs = e.joined_at ? Date.parse(e.joined_at) : 0
        if (!prev || nextTs >= prevTs) dedup.set(e.id, e)
      }
      setCollaborators(Array.from(dedup.values()))
    }

    channel.on('presence', { event: 'sync' }, updateFromChannel)
    channel.on('presence', { event: 'join' }, updateFromChannel)
    channel.on('presence', { event: 'leave' }, updateFromChannel)

    channel.subscribe(async (status) => {
      if (!active) return
      if (status === 'SUBSCRIBED') {
        try {
          await channel.track({
            id: meRef.current.id,
            name: meRef.current.name || 'Assessor',
            avatar_url: meRef.current.avatar_url || null,
            current_zone: zoneRef.current,
            joined_at: new Date().toISOString(),
          })
        } catch (err) {
          if (active) setError((err && err.message) || 'presence_track_failed')
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        if (active) setError(status.toLowerCase())
      }
    })

    channelRef.current = channel
    return () => {
      active = false
      channelRef.current = null
      try {
        channel.untrack?.()
      } catch { /* untrack on a closing channel is best-effort */ }
      try {
        supabase.removeChannel(channel)
      } catch { /* same */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId, enabled, supported, me && me.id])

  // Update the tracked state when currentZone changes WITHOUT
  // re-creating the channel. The presence layer broadcasts the new
  // state to other clients.
  useEffect(() => {
    const channel = channelRef.current
    if (!channel || !meRef.current) return
    if (!enabled || !supported) return
    try {
      channel.track({
        id: meRef.current.id,
        name: meRef.current.name || 'Assessor',
        avatar_url: meRef.current.avatar_url || null,
        current_zone: currentZone,
        joined_at: new Date().toISOString(),
      })
    } catch { /* swallow — next sync will reconcile */ }
  }, [currentZone, enabled, supported])

  return {
    collaborators,
    count: collaborators.length,
    isOnly: collaborators.length === 0,
    supported,
    error,
  }
}
