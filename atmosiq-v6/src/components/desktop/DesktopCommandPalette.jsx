/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * DesktopCommandPalette — the Ctrl/⌘ + K launcher for the desktop layout.
 *
 * Every current AI workspace (Claude, ChatGPT, Grok, Linear, Notion, Raycast)
 * puts one text field between the keyboard and the whole product: type a
 * few letters, arrow to the match, Enter. It removes the read-the-list step
 * from navigation (Hick's law: decision time grows with the number of
 * visible alternatives, and a filter collapses them to one) and it is the
 * affordance a desktop user expects first when they press ⌘K.
 *
 *   <DesktopCommandPalette
 *     commands={[{ id, label, group, icon?, renderIcon?, hint?, keywords?, onSelect }]}
 *     openNonce={n}          // increment to open programmatically (the rail's Search row)
 *   />
 *
 * The palette owns its open state and the global shortcut. `commands` is a
 * flat list; `group` is the section label the list is rendered under, in
 * first-seen order. Nothing here knows about views — MobileApp maps its
 * side-menu destinations, saved reports and drafts, and a few actions onto
 * this shape.
 *
 * Desktop-only by construction: MobileApp mounts it behind isDesktop.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { I } from '../Icons'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { MOD_LABEL } from './DesktopSidebar'

const MAX_RESULTS = 40

/**
 * Filter + rank. Every whitespace-separated token of the query must occur
 * in the label, keywords, or group (case-insensitive). Matches that start
 * the label sort first, then label matches, then the rest — so "rep" ranks
 * "Reports" above "Send for peer review". Pure; unit-tested.
 */
export function matchCommands(commands, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return commands.slice(0, MAX_RESULTS)
  const tokens = q.split(/\s+/)
  const scored = []
  for (const c of commands) {
    const label = (c.label || '').toLowerCase()
    const hay = `${label} ${(c.keywords || []).join(' ').toLowerCase()} ${(c.group || '').toLowerCase()}`
    if (!tokens.every((t) => hay.includes(t))) continue
    let score = 2
    if (label.startsWith(q)) score = 0
    else if (label.includes(q)) score = 1
    scored.push({ c, score })
  }
  scored.sort((a, b) => a.score - b.score)
  return scored.slice(0, MAX_RESULTS).map((s) => s.c)
}

// Injected once: hover on rows (pointer devices only) and the reduced-motion
// fallback for the enter animation.
if (typeof document !== 'undefined' && !document.getElementById('afcp-style')) {
  const s = document.createElement('style')
  s.id = 'afcp-style'
  s.textContent = `
    @keyframes afcpIn { from { opacity: 0; transform: translateY(-6px) scale(0.985); } to { opacity: 1; transform: none; } }
    @keyframes afcpScrim { from { opacity: 0; } to { opacity: 1; } }
    .af-cp-panel { animation: afcpIn 160ms cubic-bezier(.22,1,.36,1) both; }
    .af-cp-scrim { animation: afcpScrim 160ms ease both; }
    @media (prefers-reduced-motion: reduce) { .af-cp-panel, .af-cp-scrim { animation: none !important; } }
    .af-cp-row { transition: background 100ms ease; }
    .af-cp-row[data-active="true"] { background: var(--raised); }
  `
  document.head.appendChild(s)
}

export default function DesktopCommandPalette({ commands = [], openNonce = 0 }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const panelRef = useRef(null)
  const listRef = useRef(null)
  const lastNonce = useRef(openNonce)

  // Global shortcut. Ctrl/⌘ + K toggles; it is deliberately allowed from
  // inside a text field (the composer, a notes box) because that is where a
  // desktop user is when they reach for it — the field is not consuming ⌘K.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      if ((e.key || '').toLowerCase() !== 'k') return
      e.preventDefault()
      setOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Programmatic open (the rail's Search row bumps the nonce).
  useEffect(() => {
    if (openNonce !== lastNonce.current) { lastNonce.current = openNonce; setOpen(true) }
  }, [openNonce])

  // Reset the field every time the palette opens; the trap puts focus on it.
  useEffect(() => { if (open) { setQuery(''); setActive(0) } }, [open])
  useFocusTrap(panelRef, open, { initialFocus: 'first' })

  const results = useMemo(() => matchCommands(commands, query), [commands, query])
  useEffect(() => { setActive(0) }, [query])

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector(`[data-index="${active}"]`)
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  if (!open) return null

  const close = () => setOpen(false)
  const run = (cmd) => { close(); cmd?.onSelect?.() }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (results[active]) run(results[active])
    }
  }

  // Section headers in first-seen order.
  let lastGroup = null

  return (
    <div
      className="af-cp-scrim"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '14vh' }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search and commands"
        className="af-cp-panel"
        onKeyDown={onKeyDown}
        style={{
          width: 'min(640px, calc(100vw - 32px))', maxHeight: '64vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--card)', color: 'var(--text)',
          border: '1px solid var(--border-strong)', borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25)',
          overflow: 'hidden', fontFamily: 'inherit',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 14px', borderBottom: '1px solid var(--border)' }}>
          <I n="search" s={18} c="var(--sub)" w={1.8} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reports, drafts, tools, or type a command…"
            aria-label="Search reports, drafts, tools, or type a command"
            aria-controls="af-cp-list"
            aria-activedescendant={results[active] ? `af-cp-opt-${results[active].id}` : undefined}
            autoComplete="off"
            spellCheck={false}
            style={{ flex: 1, height: 48, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 16, fontFamily: 'inherit', minWidth: 0 }}
          />
          <span className="af-rail-kbd" aria-hidden="true">esc</span>
        </div>

        <div ref={listRef} id="af-cp-list" role="listbox" aria-label="Results" style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {results.length === 0 && (
            <div style={{ padding: '22px 12px', textAlign: 'center', color: 'var(--sub)', fontSize: 14 }}>No matches for “{query}”.</div>
          )}
          {results.map((cmd, i) => {
            const header = cmd.group && cmd.group !== lastGroup ? cmd.group : null
            if (cmd.group) lastGroup = cmd.group
            const isActive = i === active
            return (
              <div key={cmd.id}>
                {header && (
                  <div style={{ padding: '10px 10px 4px', fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--sub)' }}>{header}</div>
                )}
                <div
                  id={`af-cp-opt-${cmd.id}`}
                  role="option"
                  aria-selected={isActive}
                  data-index={i}
                  data-active={isActive ? 'true' : 'false'}
                  className="af-cp-row"
                  onMouseMove={() => { if (!isActive) setActive(i) }}
                  onClick={() => run(cmd)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 10px', height: 42, borderRadius: 10, cursor: 'pointer', color: 'var(--text)' }}>
                  <span style={{ display: 'inline-flex', width: 20, justifyContent: 'center', flexShrink: 0, color: isActive ? 'var(--text)' : 'var(--sub)' }}>
                    {cmd.renderIcon ? cmd.renderIcon() : <I n={cmd.icon || 'search'} s={18} c="currentColor" w={1.7} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 500 }}>{cmd.label}</span>
                  {cmd.hint && <span style={{ fontSize: 12, color: 'var(--sub)', flexShrink: 0, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cmd.hint}</span>}
                  {isActive && <span className="af-rail-kbd" aria-hidden="true">↵</span>}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 14px', borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--sub)' }}>
          <span><span className="af-rail-kbd">↑</span> <span className="af-rail-kbd">↓</span> navigate</span>
          <span><span className="af-rail-kbd">↵</span> open</span>
          <span style={{ marginLeft: 'auto' }}><span className="af-rail-kbd">{MOD_LABEL} K</span> toggle</span>
        </div>
      </div>
    </div>
  )
}
