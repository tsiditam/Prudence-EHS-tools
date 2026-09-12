/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * DesktopSidebar — the persistent left navigation rail for the desktop layout
 * (screens >= 1024px). It replaces the mobile bottom floating dock + slide-in
 * hamburger drawer with an always-visible sidebar. Mobile/tablet (<1024px)
 * never render this; MobileApp gates it on useMediaQuery().isDesktop.
 *
 * Desktop pro pass (2026-09). The rail is organized around the assessor's
 * WORKFLOW, not the software's feature list — Home / Projects / Sites /
 * Reports, then Analysis, the AI, the Library, and recent work — the way
 * Linear, Notion and Claude lay out a workspace. Its shape:
 *
 *   • Slim. 232px wide, 34px rows, 13.5px labels; it collapses to a 64px
 *     icon rail (header toggle or Ctrl/⌘ B, remembered) and every collapsed
 *     row keeps a `title` and an aria-label.
 *   • Quiet. The selected row is a raised tile in the primary ink; the
 *     brand cyan appears nowhere on the rail except the AI mark. Cyan is
 *     for the primary action, the selected data point and the AI, and it
 *     stays precious by being absent here.
 *   • Search leads (Ctrl/⌘ K), then the sections. A RECENT section lists
 *     the projects touched last, which is what a returning user wants
 *     before any destination.
 *   • Rows have hover states, scoped to (hover: hover) so a touch device
 *     with a wide window is unaffected.
 *
 * Data shape — `sections` is an ordered list of { key, label?, items },
 * `recent` the same with a `label`, `bottom` a flat item list pinned above
 * the account footer. Items: { label, icon, view?, onClick, renderIcon?,
 * active?, hint? }. `view` (or an explicit `active`) drives the highlight
 * against `activeView`.
 */
import { useEffect } from 'react'
import { I } from '../Icons'
import { KEYS } from '../../utils/storageKeys'

export const SIDEBAR_W = 232
export const SIDEBAR_W_COLLAPSED = 64
/** Width of the docked AtmosFlow AI panel on the right (Ctrl/⌘ J). */
export const AI_PANEL_W = 420

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
      .af-rail-row:hover:not([aria-current="page"]) .af-rail-label { color: var(--text) !important; }
      .af-rail-icon-btn:hover { background: var(--raised) !important; color: var(--text) !important; }
    }
    .af-rail-row:focus-visible, .af-rail-icon-btn:focus-visible {
      outline: 2px solid var(--accent); outline-offset: -2px;
    }
    .af-rail-kbd {
      font-size: 11px; font-weight: 500; letter-spacing: 0.2px; line-height: 1;
      padding: 3px 6px; border-radius: 5px; color: var(--dim);
      border: 1px solid var(--border); background: transparent;
    }
    @media (prefers-reduced-motion: reduce) { .af-rail, .af-rail-row { transition: none !important; } }
  `
  document.head.appendChild(s)
}

const rowStyle = (active, collapsed) => ({
  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
  padding: collapsed ? '0' : '0 10px',
  justifyContent: collapsed ? 'center' : 'flex-start',
  margin: '1px 0', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
  fontFamily: 'inherit', fontSize: 13.5, fontWeight: active ? 600 : 500, minHeight: 34, height: 34,
  color: active ? 'var(--text)' : 'var(--text-secondary)',
  // The selected row is a quiet raised tile in the primary ink — not a
  // tinted accent box. Cyan is reserved (see the header comment).
  background: active ? 'var(--raised)' : 'transparent',
  WebkitTapHighlightColor: 'transparent',
  transition: 'background 120ms ease, color 120ms ease',
  boxSizing: 'border-box',
})

const isActive = (item, activeView) => (typeof item.active === 'boolean' ? item.active : !!item.view && item.view === activeView)

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
      <span className="af-rail-ink" style={{ display: 'inline-flex', flexShrink: 0, width: 18, justifyContent: 'center', color: active ? 'var(--text)' : 'var(--sub)', transition: 'color 120ms ease' }}>
        {item.renderIcon ? item.renderIcon(active) : <I n={item.icon} s={17} c="currentColor" w={1.7} />}
      </span>
      {!collapsed && (
        <>
          <span className="af-rail-label" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
          {item.hint && <span className="af-rail-kbd" aria-hidden="true">{item.hint}</span>}
        </>
      )}
    </button>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{ padding: '14px 10px 4px', fontSize: 11, fontWeight: 500, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--dim)', whiteSpace: 'nowrap' }}>{children}</div>
  )
}

function Divider() {
  return <div aria-hidden="true" style={{ height: 1, background: 'var(--border)', margin: '8px 6px' }} />
}

function getInitials(profile) {
  const n = (profile?.name || '').trim()
  if (!n) return 'AF'
  const parts = n.split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || 'AF'
}

export default function DesktopSidebar({
  sections = [],
  recent,
  bottom = [],
  activeView,
  profile,
  onSelect,
  onAccount,
  collapsed = false,
  onToggleCollapse,
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
    width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent',
    color: 'var(--sub)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0, padding: 0,
    transition: 'background 120ms ease, color 120ms ease', WebkitTapHighlightColor: 'transparent',
  }
  const sidePad = collapsed ? '0 12px' : '0 10px'
  const renderItems = (items) => (items || []).map((item) => (
    <Row key={item.key || item.label} item={item} active={isActive(item, activeView)} onSelect={onSelect} collapsed={collapsed} />
  ))

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
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
        boxSizing: 'border-box',
        transition: 'width 200ms cubic-bezier(.22,1,.36,1)',
        overflow: 'hidden',
      }}
    >
      {/* Header — wordmark + the collapse toggle. Collapsed, only the
          toggle remains, centered, so the rail reads as a column of glyphs. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        padding: collapsed ? '0 0 6px' : '0 8px 6px 18px',
        justifyContent: collapsed ? 'center' : 'space-between', minHeight: 36,
      }}>
        {!collapsed && (
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)', whiteSpace: 'nowrap' }}>AtmosFlow</span>
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
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <line x1="9" y1="4" x2="9" y2="20" />
            </svg>
          </button>
        )}
      </div>

      {/* Search — the one row above navigation. */}
      {onSearch && (
        <div style={{ padding: sidePad, flexShrink: 0 }}>
          <button
            type="button"
            className="af-rail-row"
            onClick={onSearch}
            aria-label="Search and commands"
            title={collapsed ? `Search (${MOD_LABEL} K)` : undefined}
            style={{ ...rowStyle(false, collapsed), border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--sub)', fontWeight: 500 }}>
            <span className="af-rail-ink" style={{ display: 'inline-flex', flexShrink: 0, width: 18, justifyContent: 'center', color: 'var(--sub)' }}>
              <I n="search" s={16} c="currentColor" w={1.8} />
            </span>
            {!collapsed && (
              <>
                <span className="af-rail-label" style={{ flex: 1, whiteSpace: 'nowrap' }}>Search</span>
                <span className="af-rail-kbd" aria-hidden="true">{MOD_LABEL} K</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Scrollable sections */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: sidePad, scrollbarWidth: 'thin', marginTop: 6 }}>
        {sections.map((sec, i) => (
          <div key={sec.key || i}>
            {sec.label
              ? (collapsed ? <Divider /> : <SectionLabel>{sec.label}</SectionLabel>)
              : (i > 0 && <Divider />)}
            {renderItems(sec.items)}
          </div>
        ))}

        {recent && (recent.items || []).length > 0 && !collapsed && (
          <div>
            <SectionLabel>{recent.label || 'Recent'}</SectionLabel>
            {(recent.items || []).map((item) => (
              <button
                key={item.key || item.label}
                type="button"
                className="af-rail-row"
                onClick={() => onSelect(item)}
                aria-current={isActive(item, activeView) ? 'page' : undefined}
                title={item.label}
                style={{ ...rowStyle(isActive(item, activeView), false), height: 30, minHeight: 30, fontSize: 13, fontWeight: 400, color: isActive(item, activeView) ? 'var(--text)' : 'var(--text-secondary)' }}>
                <span className="af-rail-label" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 2 }}>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom — Settings / Help / Trash, then the account footer. */}
      <div style={{ flexShrink: 0, padding: sidePad, paddingTop: 6, borderTop: '1px solid var(--border)', marginTop: 6 }}>
        {renderItems(bottom)}
        <button
          type="button"
          className="af-rail-row"
          onClick={onAccount}
          aria-current={activeView === 'account' ? 'page' : undefined}
          aria-label="Account"
          title={collapsed ? (profile?.name || 'Account') : undefined}
          style={{ ...rowStyle(activeView === 'account', collapsed), gap: 10, height: 40, minHeight: 40, marginTop: 4 }}
        >
          <span aria-hidden="true" style={{
            width: 24, height: 24, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border-strong)',
            background: profile?.avatar_url ? 'transparent' : 'var(--raised)',
            color: 'var(--text)', fontSize: 10, fontWeight: 600,
          }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : <span>{getInitials(profile)}</span>}
          </span>
          {!collapsed && (
            <span className="af-rail-label" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.name || 'Account'}</span>
          )}
        </button>
      </div>
    </nav>
  )
}
