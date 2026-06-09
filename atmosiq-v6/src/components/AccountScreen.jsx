/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AccountScreen — the assessor's identity + hardware page. Combines what
 * used to live inside Settings as separate "Account" and "Instruments"
 * sections into a single dedicated page reached from the bottom dock's
 * Account tab. Settings now keeps only app/data/methodology concerns.
 *
 * Sections: Account (profile, subscription, theme, password) ·
 * Instruments (registered meters + calibration) · Bluetooth Sensors
 * (live Web Bluetooth session) · Danger zone (sign out, delete account).
 */
import { useState } from 'react'
import { getSubscriptionRowSubtitle } from '../utils/subscriptionState'
import { useBleSession } from '../hooks/useBleSession'
import { isBleSupported } from '../utils/bleDrivers'
import { useTheme, mix } from '../utils/theme'
import ProfileAvatar from './ProfileAvatar'
import * as V3 from '../styles/tokens'
import { Group, Row, ExceptionPill } from './settings/SettingsList'

const BG = 'var(--bg)'
const BORDER = 'var(--border)'
const ACCENT = 'var(--accent)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const SUCCESS = 'var(--success)'
const DANGER = 'var(--danger)'

export default function AccountScreen({ profile, onEditProfile, onLogout, onNavigate }) {
  const { mode: themeMode, setMode: setThemeMode } = useTheme()
  const bleSession = useBleSession()
  const bleSupported = isBleSupported()
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')

  const calOk = profile?.iaq_cal_status?.includes('within manufacturer')
  const pidOk = profile?.pid_cal_status?.includes('calibrated')

  return (
    <div style={{ paddingTop: 24, paddingBottom: 120 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ ...V3.T.h1, marginBottom: 4 }}>Account</div>
        <div style={V3.T.bodyDim}>Profile, subscription, and instruments</div>
      </div>

      {/* ── Account ── Circular ProfileAvatar = the assessor's identity
          row. Tapping opens the profile editor. */}
      <Group title="Account">
        {profile && (
          <button onClick={onEditProfile} style={{ width: '100%', padding: '16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'inherit', minHeight: 72 }}>
            <ProfileAvatar profile={profile} size={52} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.name || 'Assessor'}</div>
              <div style={{ fontSize: 11, color: DIM, fontFamily: 'var(--font-mono)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(profile.certs || []).slice(0, 3).join(' · ') || 'No certifications on file'}</div>
            </div>
            <span style={{ color: DIM, fontSize: 13, flexShrink: 0 }}>›</span>
          </button>
        )}
        <Row
          label="Manage Subscription"
          sub={getSubscriptionRowSubtitle(profile)}
          action={() => { window.location.href = 'mailto:support@prudenceehs.com?subject=AtmosFlow%20subscription' }}
        />
        {/* Theme — manual dark/light picker. In-app only. */}
        <div style={{ padding: '14px 16px', borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12, minHeight: 52 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>Theme</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2, lineHeight: 1.4 }}>In-app only · landing &amp; install screens stay dark</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {[{ v: 'dark', l: 'Dark' }, { v: 'light', l: 'Light' }].map(o => {
              const sel = themeMode === o.v
              return (
                <button
                  key={o.v}
                  onClick={() => setThemeMode(o.v)}
                  aria-pressed={sel}
                  style={{
                    padding: '6px 12px',
                    background: sel ? mix('accent', 9) : 'transparent',
                    border: `1px solid ${sel ? ACCENT : BORDER}`,
                    borderRadius: 8,
                    color: sel ? ACCENT : SUB,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'all .15s ease',
                  }}>{o.l}</button>
              )
            })}
          </div>
        </div>
        {!showPasswordChange ? (
          <Row label="Change Password" action={() => setShowPasswordChange(true)} />
        ) : (
          <div style={{ padding: '14px 16px', borderTop: `1px solid ${BORDER}` }}>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password (min 8 characters)" style={{ width: '100%', padding: '10px 14px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" style={{ width: '100%', padding: '10px 14px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
            {passwordMsg && <div style={{ fontSize: 11, color: passwordMsg.includes('success') ? SUCCESS : DANGER, marginBottom: 8 }}>{passwordMsg}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowPasswordChange(false); setNewPassword(''); setConfirmPassword(''); setPasswordMsg('') }} style={{ flex: 0, padding: '8px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, color: SUB, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={async () => {
                if (newPassword.length < 8) { setPasswordMsg('Password must be at least 8 characters'); return }
                if (newPassword !== confirmPassword) { setPasswordMsg('Passwords do not match'); return }
                try {
                  const { supabase: sb } = await import('../utils/supabaseClient')
                  if (sb) {
                    const { error } = await sb.auth.updateUser({ password: newPassword })
                    if (error) setPasswordMsg(error.message)
                    else { setPasswordMsg('Password updated successfully'); setNewPassword(''); setConfirmPassword(''); setTimeout(() => { setShowPasswordChange(false); setPasswordMsg('') }, 2000) }
                  }
                } catch { setPasswordMsg('Failed to update password') }
              }} style={{ flex: 1, padding: '8px 16px', background: 'var(--accent-fill)', border: 'none', borderRadius: 8, color: 'var(--on-accent-fill)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Update Password</button>
            </div>
          </div>
        )}
      </Group>

      {/* ── Instruments ── IAQ/PID/Add rows route to the standalone
          instrument editor (view='instrument-edit'). */}
      {(profile?.iaq_meter || profile?.pid_meter) && (
        <Group title="Instruments">
          {profile?.iaq_meter && (
            <Row
              first
              label={profile.iaq_meter}
              sub={profile.iaq_serial ? `S/N ${profile.iaq_serial}${profile.iaq_cal_date ? ' · last cal ' + profile.iaq_cal_date : ''}` : (profile.iaq_cal_date ? `Last cal ${profile.iaq_cal_date}` : null)}
              value={!calOk ? <ExceptionPill text="Cal due" /> : null}
              action={() => onNavigate?.('instrument-edit')}
            />
          )}
          {profile?.pid_meter && (
            <Row
              first={!profile?.iaq_meter}
              label={profile.pid_meter}
              sub="PID / VOC meter"
              value={!pidOk ? <ExceptionPill text="Cal due" /> : null}
              action={() => onNavigate?.('instrument-edit')}
            />
          )}
          <Row label="Edit instruments" action={() => onNavigate?.('instrument-edit')} />
        </Group>
      )}
      {!profile?.iaq_meter && !profile?.pid_meter && (
        <Group title="Instruments">
          <Row label="Add an instrument" sub="Register your IAQ meter and PID for calibration tracking" action={() => onNavigate?.('instrument-edit')} first />
        </Group>
      )}

      {/* ── Bluetooth Sensors ── live Web Bluetooth session. Pairing
          happens from the inline glyph next to a reading field (where
          Web Bluetooth's user-gesture requirement is satisfied). */}
      {(() => {
        if (!bleSupported) {
          return (
            <Group title="Bluetooth Sensors">
              <Row first label="Not available in this browser" sub="Use Chrome on Android, Bluefy on iPhone, or Chrome/Edge on desktop to pair sensors." />
            </Group>
          )
        }
        if (!bleSession.active) {
          return (
            <Group title="Bluetooth Sensors">
              <Row first label="No sensor paired" sub="Tap the Bluetooth glyph next to any CO₂, temperature, or humidity field to pair an Aranet4." />
            </Group>
          )
        }
        const r = bleSession.reading
        const co2 = r && typeof r.co2_ppm === 'number' ? `${r.co2_ppm} ppm` : null
        const temp = r && typeof r.temperature_f === 'number' ? `${r.temperature_f.toFixed(1)}°F` : null
        const rh = r && typeof r.humidity_rh === 'number' ? `${r.humidity_rh}% RH` : null
        const battery = r && typeof r.battery_pct === 'number' ? `${r.battery_pct}%` : null
        const latest = [co2, temp, rh].filter(Boolean).join(' · ') || 'No reading yet'
        const sub = battery ? `${latest} · battery ${battery}` : latest
        return (
          <Group title="Bluetooth Sensors">
            <Row first label={bleSession.deviceName || 'Paired sensor'} sub={sub} value="Live" />
            <Row label="Refresh reading" action={() => { bleSession.refresh() }} />
            <Row label="Disconnect" tone="danger" action={() => { bleSession.disconnect() }} />
          </Group>
        )
      })()}

      {/* ── Danger Zone — sign out is plain (terminal, not destructive);
          delete is red. ── */}
      <Group title="Danger zone">
        <Row first label="Sign out" action={onLogout} />
        {!deleteConfirm ? (
          <Row label="Delete account" tone="danger" action={() => setDeleteConfirm(true)} />
        ) : (
          <div style={{ padding: '14px 16px', borderTop: `1px solid ${BORDER}`, background: mix('danger', 2) }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: DANGER, marginBottom: 6 }}>Permanently delete your account?</div>
            <div style={{ fontSize: 11, color: SUB, marginBottom: 12, lineHeight: 1.5 }}>This removes all assessments, reports, credits, and profile data. This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDeleteConfirm(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, color: SUB, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={async () => {
                try {
                  const session = await (await import('../utils/cloudStorage')).default.getSession()
                  if (session?.access_token) {
                    await fetch('/api/delete-account', { method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` } })
                  }
                } catch {}
                onLogout()
              }} style={{ flex: 1, padding: '10px', background: mix('danger', 8), border: `1px solid ${mix('danger', 19)}`, borderRadius: 8, color: DANGER, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Delete everything</button>
            </div>
          </div>
        )}
      </Group>
    </div>
  )
}
