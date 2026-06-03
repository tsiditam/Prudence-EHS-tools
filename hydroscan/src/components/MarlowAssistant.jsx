/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * MarlowAssistant — bottom-sheet chat UI for Marlow, HydroScan's water-quality
 * AI. Streams answers from /api/water-assistant via useWaterAssistant, renders
 * tool activity, and gates the first run behind a screening-only disclaimer.
 * Manifest-grounded: Marlow only quotes values its tools return.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { I } from './Icons'
import { R } from '../styles/tokens'
import { useWaterAssistant } from '../hooks/useWaterAssistant'

const INTRO_FLAG = 'marlow_intro_v1'

const SUGGESTIONS = [
  { icon: 'drop', label: 'MCL for lead?', q: 'What is the MCL or action level for lead, and what does it mean?' },
  { icon: 'flask', label: 'How to sample PFAS', q: 'How should I collect a PFAS sample — method, container, preservative, and hold time?' },
  { icon: 'alert', label: 'Boil-water triggers', q: 'What lab result triggers a boil-water advisory?' },
  { icon: 'chain', label: 'PFAS Hazard Index', q: 'How does the EPA PFAS Hazard Index work?' },
]

const TOOL_LABELS = {
  lookup_water_standard: 'Looking up standard',
  lookup_sampling_method: 'Looking up method',
  lookup_health_effects: 'Looking up health effects',
  lookup_state_limit: 'Checking state limit',
  list_known_parameters: 'Listing parameters',
  search_standards_corpus: 'Searching standards corpus',
}

// Minimal markdown: **bold**, "- " bullets, blank-line spacing. Sufficient
// for Marlow's four-section answers without pulling in a markdown dependency.
function renderInline(text, key) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <strong key={`${key}-${i}`} style={{ color: 'var(--text)', fontWeight: 700 }}>{p.slice(2, -2)}</strong>
    ) : (
      <span key={`${key}-${i}`}>{p}</span>
    ),
  )
}
function Markdown({ text }) {
  const lines = (text || '').split('\n')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {lines.map((ln, i) => {
        const t = ln.trim()
        if (!t) return <div key={i} style={{ height: 6 }} />
        const review = /water professional review required/i.test(t)
        if (t.startsWith('- ') || t.startsWith('• ')) {
          return (
            <div key={i} style={{ display: 'flex', gap: 8, paddingLeft: 2 }}>
              <span style={{ color: 'var(--accent)', flexShrink: 0 }}>•</span>
              <span>{renderInline(t.replace(/^[-•]\s+/, ''), i)}</span>
            </div>
          )
        }
        return (
          <div key={i} style={review ? { marginTop: 6, padding: '8px 10px', borderRadius: R.sm, background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 26%, transparent)', color: 'var(--text)', fontWeight: 700, fontSize: 12.5 } : undefined}>
            {renderInline(t, i)}
          </div>
        )
      })}
    </div>
  )
}

export default function MarlowAssistant({ open, onClose, context }) {
  const { messages, busy, error, send, reset } = useWaterAssistant()
  const [input, setInput] = useState('')
  const [introDone, setIntroDone] = useState(() => {
    try { return !!localStorage.getItem(INTRO_FLAG) } catch { return false }
  })
  const scrollRef = useRef(null)
  const taRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, busy])

  const acceptIntro = () => {
    try { localStorage.setItem(INTRO_FLAG, '1') } catch { /* ignore */ }
    setIntroDone(true)
    setTimeout(() => taRef.current?.focus(), 50)
  }

  const submit = (text) => {
    const q = (text ?? input).trim()
    if (!q || busy) return
    setInput('')
    send(q, context)
  }

  const empty = messages.length === 0
  const ctxChips = useMemo(() => {
    const c = context || {}
    const chips = []
    if (c.source?.src_type) chips.push(c.source.src_type)
    if (c.tier) chips.push(`Tier: ${c.tier}`)
    return chips
  }, [context])

  if (!open) return null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 260, background: '#000000DD', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 640, height: '88vh', display: 'flex', flexDirection: 'column',
          borderRadius: '20px 20px 0 0', border: '1px solid var(--border)', overflow: 'hidden',
          background: 'radial-gradient(140% 80% at 50% 0%, color-mix(in srgb, var(--accent) 8%, var(--card)) 0%, var(--card) 50%)',
          animation: 'slideUp .3s ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: 'color-mix(in srgb, var(--accent) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <I n="pulse" s={20} c="var(--accent)" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-marlow)', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Marlow</div>
              <div style={{ fontSize: 11, color: 'var(--sub)', fontFamily: "'DM Mono'" }}>HydroScan water-quality AI</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!empty && (
              <button onClick={reset} title="New chat" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--sub)', cursor: 'pointer' }}>
                <I n="refresh" s={15} c="var(--sub)" />
              </button>
            )}
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--sub)', fontSize: 16, cursor: 'pointer' }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          {!introDone ? (
            <div style={{ padding: '6px 2px' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Before we start</div>
              {[
                'Marlow is a screening aid. It explains EPA/WHO standards and suggests sampling — it does not make compliance determinations or declare water safe/unsafe.',
                'Every regulatory value Marlow quotes comes from HydroScan’s hardcoded standards manifest. It will not invent a number.',
                'It is not medical advice. Health complaints, litigation, and final calls require a qualified water professional.',
              ].map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 7, background: 'color-mix(in srgb, var(--accent) 14%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I n="check" s={13} c="var(--accent)" /></div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--sub)' }}>{t}</div>
                </div>
              ))}
              <button onClick={acceptIntro} style={{ width: '100%', marginTop: 8, padding: '13px 0', borderRadius: R.md, border: 'none', background: 'var(--accent-fill)', color: 'var(--on-accent-fill)', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Start chatting</button>
            </div>
          ) : empty ? (
            <div>
              <div style={{ fontSize: 14, color: 'var(--sub)', lineHeight: 1.6, marginBottom: 14 }}>
                Ask about standards, sampling methods, or how to read a result. {ctxChips.length > 0 && 'I can see your current assessment context.'}
              </div>
              {ctxChips.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                  {ctxChips.map((c, i) => (
                    <span key={i} style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', padding: '4px 10px', borderRadius: R.pill, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 26%, transparent)' }}>{c}</span>
                  ))}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s.label} onClick={() => submit(s.q)} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px', borderRadius: R.md, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600 }}>
                    <I n={s.icon} s={16} c="var(--accent)" />{s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {messages.map((m) => (
                <div key={m.id} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '88%' }}>
                    {m.role === 'assistant' && m.tools?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                        {m.tools.map((t, i) => (
                          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: t.status === 'done' ? 'var(--accent)' : 'var(--sub)', padding: '3px 8px', borderRadius: R.pill, background: 'color-mix(in srgb, var(--accent) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)' }}>
                            <I n={t.status === 'done' ? 'check' : 'search'} s={11} c={t.status === 'done' ? 'var(--accent)' : 'var(--sub)'} />
                            {TOOL_LABELS[t.name] || t.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div
                      style={{
                        padding: '11px 14px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.6,
                        ...(m.role === 'user'
                          ? { background: 'var(--accent-fill)', color: 'var(--on-accent-fill)', borderBottomRightRadius: 4 }
                          : { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderBottomLeftRadius: 4 }),
                      }}
                    >
                      {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
                      {m.streaming && !m.content && <span style={{ color: 'var(--sub)' }}>Marlow is thinking…</span>}
                      {m.streaming && m.content && <span style={{ opacity: 0.6 }}>▍</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {error && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
        </div>

        {/* Composer */}
        {introDone && (
          <div style={{ padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '6px 6px 6px 12px' }}>
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
                placeholder="Ask Marlow about a standard, method, or result…"
                rows={1}
                style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 16, fontFamily: 'inherit', maxHeight: 120, padding: '8px 0' }}
              />
              <button
                onClick={() => submit()}
                disabled={busy || !input.trim()}
                style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 11, border: 'none', cursor: busy || !input.trim() ? 'default' : 'pointer', background: busy || !input.trim() ? 'var(--border)' : 'var(--accent-fill)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <I n="send" s={17} c={busy || !input.trim() ? 'var(--dim)' : 'var(--on-accent-fill)'} />
              </button>
            </div>
            <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--dim)', marginTop: 6 }}>Screening aid · manifest-grounded · not a compliance determination</div>
          </div>
        )}
      </div>
    </div>
  )
}
