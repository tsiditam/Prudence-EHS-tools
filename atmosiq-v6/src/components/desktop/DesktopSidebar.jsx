/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * DesktopSidebar — the persistent left navigation rail for the desktop layout
 * (screens >= 1024px). It replaces the mobile bottom floating dock + slide-in
 * hamburger drawer with an always-visible sidebar.
 *
 * It is fed the SAME destination data the mobile side menu uses
 * (sideMenuPrimary / sideMenuGroups / sideMenuTrash from MobileApp), so the
 * information architecture stays single-source — this component only owns the
 * desktop presentation (fixed rail, wordmark, collapsible groups, account
 * footer). Mobile/tablet (<1024px) never render this; MobileApp gates it on
 * useMediaQuery().isDesktop.
 *
 * Item shape (matches the mobile menu rows): { label, icon, view?, onClick,
 * renderIcon? }. `view` drives the active highlight against `activeView`.
 */
import { I } from '../Icons'

export const SIDEBAR_W = 240

const rowStyle = (active) => ({
  width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px',
  margin: '2px 0', borderRadius: 14, border: 'none', cursor: 'pointer', textAlign: 'left',
  fontFamily: 'inherit', fontSize: 14, fontWeight: active ? 600 : 500, minHeight: 44,
  color: active ? 'var(--accent)' : 'var(--text)',
  background: active ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent',
  boxShadow: active ? 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 26%, transparent)' : 'none',
  WebkitTapHighlightColor: 'transparent',
  transition: 'background 140ms ease, color 140ms ease',
})

function Row({ item, active, onSelect }) {
  return (
    <button type="button" onClick={() => onSelect(item)} aria-current={active ? 'page' : undefined} style={rowStyle(active)}>
      {item.renderIcon ? item.renderIcon() : <I n={item.icon} s={19} c={active ? 'var(--accent)' : 'var(--sub)'} w={1.7} />}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
    </button>
  )
}

function getInitials(profile) {
  const n = (profile?.name || '').trim()
  if (!n) return 'AF'
  const parts = n.split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || 'AF'
}

export default function DesktopSidebar({
  primary = [],
  groups = [],
  trash,
  activeView,
  groupsOpen = {},
  onToggleGroup,
  profile,
  onSelect,
  onAccount,
}) {
  return (
    <nav
      aria-label="Primary"
      style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: SIDEBAR_W, zIndex: 120,
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface-deep, var(--surface))',
        borderRight: '1px solid var(--border)',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
        boxSizing: 'border-box',
      }}
    >
      {/* Wordmark */}
      <div style={{ padding: '0 16px 14px', flexShrink: 0 }}>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)' }}>AtmosFlow</span>
      </div>

      {/* Scrollable destinations */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 10px', scrollbarWidth: 'thin' }}>
        {primary.map((item) => (
          <Row key={item.label} item={item} active={!!item.view && item.view === activeView} onSelect={onSelect} />
        ))}

        {groups.map((g) => {
          const open = !!groupsOpen[g.key]
          return (
            <div key={g.key} style={{ marginTop: 4 }}>
              <button
                type="button"
                onClick={() => onToggleGroup?.(g.key)}
                aria-expanded={open}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 6px', marginTop: 6, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}
              >
                <span style={{ flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--sub)' }}>{g.label}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                  style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 180ms cubic-bezier(.22,1,.36,1)' }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              {open && (g.items || []).map((item) => (
                <Row key={item.label} item={item} active={!!item.view && item.view === activeView} onSelect={onSelect} />
              ))}
            </div>
          )
        })}

        {trash && <div style={{ marginTop: 8 }}><Row item={trash} active={!!trash.view && trash.view === activeView} onSelect={onSelect} /></div>}
      </div>

      {/* Account footer (pinned) */}
      <div style={{ flexShrink: 0, padding: '10px 10px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
        <button
          type="button"
          onClick={onAccount}
          aria-current={activeView === 'account' ? 'page' : undefined}
          aria-label="Account"
          style={{ ...rowStyle(activeView === 'account'), gap: 11 }}
        >
          <span aria-hidden="true" style={{
            width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            background: profile?.avatar_url ? 'transparent' : 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 28%, transparent), color-mix(in srgb, var(--accent) 8%, transparent))',
            color: 'var(--text)', fontSize: 11, fontWeight: 700,
          }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : <span>{getInitials(profile)}</span>}
          </span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.name || 'Account'}</span>
        </button>
      </div>
    </nav>
  )
}
