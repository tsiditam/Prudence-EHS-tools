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
 * Desktop pass (2026-09) — the rail now follows the shape every current AI
 * workspace shares (Claude, ChatGPT, Grok, Linear, Notion):
 *
 *   • It COLLAPSES to an icon rail (68px) and remembers the choice. The
 *     toggle sits in the header; Ctrl/⌘ + B flips it from anywhere, which is
 *     the shortcut those apps settled on. Collapsed rows keep a native
 *     `title` so the label is one hover away.
 *   • A filled "New chat" action leads the rail — the one thing an AI app
 *     puts above navigation — and a "Search" row opens the command palette
 *     (Ctrl/⌘ + K) so a keyboard user never has to find a destination by
 *     reading a list.
 *   • Rows have HOVER states. Mobile has none (no pointer), and their absence
 *     is the single biggest reason a phone layout reads as "old" under a
 *     mouse: nothing acknowledges the cursor. Scoped to (hover: hover) so a
 *     touch device with a wide window is unaffected.
 *
 * Item shape (matches the mobile menu rows): { label, icon, view?, onClick,
 * renderIcon? }. `view` drives the active highlight against `activeView`.
 */
import { useEffect } from 'react'
import { I } from '../Icons'
import { KEYS } from '../../utils/storageKeys'

export const SIDEBAR_W = 240
export const SIDEBAR_W_COLLAPSED = 68

/** Current rail width for the shell's header / content offsets. */
export const sidebarWidth = (collapsed) => (collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W)

// The collapsed preference is read synchronously at mount (like the Jasper
// launcher position): STO is async, and awaiting it would paint the wide
// rail first and snap it shut a frame later.
export function readRailCollapsed() {
  try { return window.localStorage.getItem(KEYS.desktopRailCollapsed) === '1' } catch { return false }
}
export function writeRailCollapsed(v) {
  try { window.localStorage.setItem(KEYS.desktopRailCollapsed, v ? '1' : '0') } catch { /* private mode / quota */ }
}

// Platform-aware modifier label for the shortcut hints. Mac users read ⌘;
// everyone else reads Ctrl. Evaluated once — the platform does not change.
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')
export const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl'

/** True when the keydown should be left to a text field the user is typing in. */
export function isTypingTarget(el) {
  if (!el || !el.tagName) return false
  const t = el.tagName.toLowerCase()
  return t === 'input' || t === 'textarea' || t === 'select' || el.isContentEditable === true
}

// Injected once: the pointer-only hover treatment and the keyboard focus
// ring. Hover lives in CSS (not onMouseEnter state) so a hundred rows cost
// nothing, and it is gated on a real hover-capable pointer.
if (typeof document !== 'undefined' && !document.getElementById('afds-style')) {
  const s = document.createElement('style')
  s.id = 'afds-style'
  s.textContent = `
    @media (hover: hover) and (pointer: fine) {
      .af-rail-row:hover:not([aria-current="page"]) { background: var(--raised) !important; }
      .af-rail-row:hover:not([aria-current="page"]) .af-rail-ink { color: var(--text) !important; }
      .af-rail-cta:hover { filter: brightness(1.06); }
      .af-rail-icon-btn:hover { background: var(--raised) !important; color: var(--text) !important; }
    }
    .af-rail-row:focus-visible, .af-rail-cta:focus-visible, .af-rail-icon-btn:focus-visible {
      outline: 2px solid var(--accent); outline-offset: -2px;
    }
    .af-rail-kbd {
      font-size: 11px; font-weight: 600; letter-spacing: 0.2px; line-height: 1;
      padding: 3px 6px; border-radius: 6px; color: var(--sub);
      border: 1px solid var(--border); background: var(--card);
    }
    @media (prefers-reduced-motion: reduce) { .af-rail, .af-rail-row { transition: none !important; } }
  `
  document.head.appendChild(s)
}

const rowStyle = (active, collapsed) => ({
  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
  padding: collapsed ? '0' : '0 12px',
  justifyContent: collapsed ? 'center' : 'flex-start',
  margin: '2px 0', borderRadius: 12, border: 'none', cursor: 'pointer', textAlign: 'left',
  fontFamily: 'inherit', fontSize: 14, fontWeight: active ? 600 : 500, minHeight: 40, height: 40,
  color: active ? 'var(--text)' : 'var(--text-secondary)',
  // The selected row is a quiet raised tile (the way Claude and ChatGPT mark
  // the open chat), not a tinted accent box — the accent is kept for the
  // one filled action above the list.
  background: active ? 'var(--raised)' : 'transparent',
  WebkitTapHighlightColor: 'transparent',
  transition: 'background 140ms ease, color 140ms ease',
  boxSizing: 'border-box',
})

function Row({ item, active, onSelect, collapsed }) {
  return (
    <button
      type="button"
      className="af-rail-row"
      onClick={() => onSelect(item)}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      style={rowStyle(active, collapsed)}>
      <span className="af-rail-ink" style={{ display: 'inline-flex', flexShrink: 0, color: active ? 'var(--text)' : 'var(--sub)', transition: 'color 140ms ease' }}>
        {item.renderIcon ? item.renderIcon() : <I n={item.icon} s={19} c="currentColor" w={1.7} />}
      </span>
      {!collapsed && (
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
      )}
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
  collapsed = false,
  onToggleCollapse,
  onNewChat,
  onSearch,
}) {
  // Ctrl/⌘ + B toggles the rail from anywhere except a text field.
  useEffect(() => {
    if (!onToggleCollapse) return undefined
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      if ((e.key || '').toLowerCase() !== 'b') return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      onToggleCollapse()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onToggleCollapse])

  const width = sidebarWidth(collapsed)
  const iconBtn = {
    width: 34, height: 34, borderRadius: 10, border: 'none', background: 'transparent',
    color: 'var(--sub)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0, padding: 0,
    transition: 'background 140ms ease, color 140ms ease', WebkitTapHighlightColor: 'transparent',
  }

  return (
    <nav
      aria-label="Primary"
      className="af-rail"
      data-collapsed={collapsed ? 'true' : undefined}
      style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width, zIndex: 120,
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface-deep, var(--surface))',
        borderRight: '1px solid var(--border)',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        boxSizing: 'border-box',
        transition: 'width 200ms cubic-bezier(.22,1,.36,1)',
        overflow: 'hidden',
      }}
    >
      {/* Header — wordmark + the collapse toggle. Collapsed, only the
          toggle remains, centered, so the rail reads as a column of glyphs. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        padding: collapsed ? '0 0 8px' : '0 10px 8px 16px',
        justifyContent: collapsed ? 'center' : 'space-between', minHeight: 42,
      }}>
        {!collapsed && (
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', whiteSpace: 'nowrap' }}>AtmosFlow</span>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            className="af-rail-icon-btn"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (${MOD_LABEL} B)`}
            style={iconBtn}>
            {/* A panel with its left third divided off — the mark Claude /
                Notion / VS Code use for "collapse the sidebar". */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <line x1="9" y1="4" x2="9" y2="20" />
            </svg>
          </button>
        )}
      </div>

      {/* New chat + Search — the two actions an AI workspace leads with. */}
      {(onNewChat || onSearch) && (
        <div style={{ padding: collapsed ? '0 14px 6px' : '0 10px 6px', flexShrink: 0 }}>
          {onNewChat && (
            <button
              type="button"
              className="af-rail-cta"
              onClick={onNewChat}
              aria-label="New chat with AtmosFlow AI"
              title={collapsed ? 'New chat' : undefined}
              style={{
                width: '100%', height: 40, borderRadius: 12, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10,
                padding: collapsed ? 0 : '0 12px', fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
                background: 'var(--accent-fill)', color: 'var(--on-accent-fill)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.25)', transition: 'filter 140ms ease',
                WebkitTapHighlightColor: 'transparent', boxSizing: 'border-box',
              }}>
              <I n="plus" s={18} c="currentColor" w={2.2} />
              {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>New chat</span>}
            </button>
          )}
          {onSearch && (
            <button
              type="button"
              className="af-rail-row"
              onClick={onSearch}
              aria-label="Search and commands"
              title={collapsed ? `Search (${MOD_LABEL} K)` : undefined}
              style={{ ...rowStyle(false, collapsed), marginTop: 6 }}>
              <span className="af-rail-ink" style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--sub)', transition: 'color 140ms ease' }}>
                <I n="search" s={19} c="currentColor" w={1.7} />
              </span>
              {!collapsed && (
                <>
                  <span style={{ flex: 1, whiteSpace: 'nowrap' }}>Search</span>
                  <span className="af-rail-kbd" aria-hidden="true">{MOD_LABEL} K</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Scrollable destinations */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: collapsed ? '0 14px' : '0 10px', scrollbarWidth: 'thin' }}>
        {!collapsed && (
          <div style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--sub)' }}>Workspace</div>
        )}
        {collapsed && <div aria-hidden="true" style={{ height: 1, background: 'var(--border)', margin: '6px 4px 8px' }} />}
        {primary.map((item) => (
          <Row key={item.label} item={item} active={!!item.view && item.view === activeView} onSelect={onSelect} collapsed={collapsed} />
        ))}

        {groups.map((g) => {
          // Collapsed rail: group headers cannot be read, so every group is
          // shown open behind a hairline — the same list, less chrome.
          const open = collapsed || !!groupsOpen[g.key]
          return (
            <div key={g.key} style={{ marginTop: 4 }}>
              {collapsed ? (
                <div aria-hidden="true" style={{ height: 1, background: 'var(--border)', margin: '8px 4px' }} />
              ) : (
                <button
                  type="button"
                  className="af-rail-row"
                  onClick={() => onToggleGroup?.(g.key)}
                  aria-expanded={open}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 4px', marginTop: 6, borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}
                >
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--sub)' }}>{g.label}</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                    style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 180ms cubic-bezier(.22,1,.36,1)' }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
              {open && (g.items || []).map((item) => (
                <Row key={item.label} item={item} active={!!item.view && item.view === activeView} onSelect={onSelect} collapsed={collapsed} />
              ))}
            </div>
          )
        })}

        {trash && <div style={{ marginTop: 8 }}><Row item={trash} active={!!trash.view && trash.view === activeView} onSelect={onSelect} collapsed={collapsed} /></div>}
      </div>

      {/* Account footer (pinned) */}
      <div style={{ flexShrink: 0, padding: collapsed ? '10px 14px 0' : '10px 10px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
        <button
          type="button"
          className="af-rail-row"
          onClick={onAccount}
          aria-current={activeView === 'account' ? 'page' : undefined}
          aria-label="Account"
          title={collapsed ? (profile?.name || 'Account') : undefined}
          style={{ ...rowStyle(activeView === 'account', collapsed), gap: 11, height: 44, minHeight: 44 }}
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
          {!collapsed && (
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.name || 'Account'}</span>
          )}
        </button>
      </div>
    </nav>
  )
}
