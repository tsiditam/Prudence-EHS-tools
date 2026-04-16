/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 *
 * EarlyAccessPage — Lead capture form for IH/EHS beta access
 */

import { useState, useRef } from 'react'

const C = {
  bg: '#080A0E', card: '#0F1218', border: '#1E293B',
  cyan: '#22D3EE', cyanDark: '#06B6D4', cyanMuted: '#164E63',
  text: '#F1F5F9', sub: '#94A3B8', err: '#F87171',
}

const INVESTIGATION_OPTIONS = ['1–2', '3–5', '6–10', '10+']
const SOURCE_OPTIONS = ['LinkedIn', 'Colleague/Referral', 'AIHA/ASSP', 'Web Search', 'Other']

const FIELDS = [
  { id: 'name', label: 'Full Name', type: 'text', required: true, ph: 'Jane Smith, CIH' },
  { id: 'email', label: 'Email', type: 'email', required: true, ph: 'jane@firm.com' },
  { id: 'company', label: 'Company / Organization', type: 'text', required: true, ph: 'Prudence EHS' },
  { id: 'title', label: 'Title / Role', type: 'text', required: true, ph: 'Senior Industrial Hygienist' },
  { id: 'volume', label: 'IAQ Investigations per Month', type: 'select', required: true, opts: INVESTIGATION_OPTIONS },
  { id: 'painpoint', label: 'Biggest Pain Point in Your Current IAQ Workflow', type: 'textarea', required: false, ph: 'e.g. Report turnaround time, inconsistent scoring...', max: 500 },
  { id: 'source', label: 'How Did You Hear About AtmosFlow?', type: 'select', required: true, opts: SOURCE_OPTIONS },
]

const inputStyle = {
  width: '100%', padding: '14px 16px', background: C.card, border: `1.5px solid ${C.border}`,
  borderRadius: 8, color: C.text, fontSize: 15, fontFamily: "'Outfit', system-ui, sans-serif",
  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
}

const labelStyle = {
  fontSize: 12, fontWeight: 600, color: C.sub, textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: 6, display: 'block',
}

export default function EarlyAccessPage() {
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const formRef = useRef(null)

  const set = (id, val) => setForm(prev => ({ ...prev, [id]: val }))

  const validate = (id, val) => {
    const field = FIELDS.find(f => f.id === id)
    if (!field) return ''
    if (field.required && (!val || !val.trim())) return 'Required'
    if (id === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return 'Invalid email'
    if (field.max && val && val.length > field.max) return `Max ${field.max} characters`
    return ''
  }

  const handleBlur = (id) => {
    setTouched(prev => ({ ...prev, [id]: true }))
    setErrors(prev => ({ ...prev, [id]: validate(id, form[id]) }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const newErrors = {}
    let hasError = false
    FIELDS.forEach(f => {
      const err = validate(f.id, form[f.id])
      if (err) { newErrors[f.id] = err; hasError = true }
    })
    setErrors(newErrors)
    setTouched(Object.fromEntries(FIELDS.map(f => [f.id, true])))
    if (hasError) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setSuccess(true)
      } else {
        const data = await res.json().catch(() => ({}))
        setErrors({ _form: data.error || 'Something went wrong. Please try again.' })
      }
    } catch {
      setErrors({ _form: 'Network error. Please check your connection.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (success) return <SuccessState />

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Outfit', system-ui, sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px 40px' }}>
      {/* Brand */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 4 }}>
          <span style={{ color: '#fff' }}>Atmos</span><span style={{ color: C.cyan }}>Flow</span>
        </div>
        <div style={{ fontSize: 11, color: C.sub }}>by Prudence EHS</div>
      </div>

      {/* Headline */}
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: '0 0 8px', fontFamily: "'Sora', system-ui, sans-serif", letterSpacing: '-0.5px' }}>Early Access</h1>
      <p style={{ fontSize: 14, color: C.sub, lineHeight: 1.6, textAlign: 'center', maxWidth: 460, margin: '0 0 32px' }}>
        AtmosFlow is currently onboarding a limited group of IH/EHS professionals. Request access below.
      </p>

      {/* Form */}
      <form ref={formRef} onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {FIELDS.map(f => (
          <div key={f.id}>
            <label style={labelStyle}>{f.label}{f.required && <span style={{ color: C.cyan }}> *</span>}</label>
            {f.type === 'select' ? (
              <select value={form[f.id] || ''} onChange={e => set(f.id, e.target.value)} onBlur={() => handleBlur(f.id)}
                style={{ ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center', cursor: 'pointer', color: form[f.id] ? C.text : C.sub }}>
                <option value="" style={{ background: C.card }}>Select...</option>
                {f.opts.map(o => <option key={o} value={o} style={{ background: C.card }}>{o}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea value={form[f.id] || ''} onChange={e => set(f.id, e.target.value)} onBlur={() => handleBlur(f.id)}
                placeholder={f.ph} maxLength={f.max} rows={3}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
                onFocus={e => e.target.style.borderColor = C.cyan} onBlur2={e => e.target.style.borderColor = C.border} />
            ) : (
              <input type={f.type} value={form[f.id] || ''} onChange={e => set(f.id, e.target.value)} onBlur={() => handleBlur(f.id)}
                placeholder={f.ph} style={inputStyle}
                onFocus={e => e.target.style.borderColor = C.cyan} />
            )}
            {touched[f.id] && errors[f.id] && <div style={{ fontSize: 12, color: C.err, marginTop: 4 }}>{errors[f.id]}</div>}
          </div>
        ))}

        {errors._form && <div style={{ fontSize: 13, color: C.err, textAlign: 'center', padding: '10px 14px', background: '#EF444412', borderRadius: 8 }}>{errors._form}</div>}

        <button type="submit" disabled={submitting}
          style={{ width: '100%', padding: '16px 20px', background: submitting ? C.cyanMuted : C.cyanDark, border: 'none', borderRadius: 8, color: '#fff', fontSize: 16, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', fontFamily: 'inherit', minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.2s' }}>
          {submitting ? <><Spinner /> Submitting...</> : 'Request Early Access'}
        </button>
      </form>

      {/* Contact */}
      <div style={{ marginTop: 32, fontSize: 12, color: C.sub }}>
        Questions? <a href="mailto:support@prudenceehs.com" style={{ color: C.cyan, textDecoration: 'none' }}>support@prudenceehs.com</a>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 40, fontSize: 10, color: C.sub }}>© 2026 Prudence Safety & Environmental Consulting, LLC</div>
    </div>
  )
}

function SuccessState() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Outfit', system-ui, sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: `${C.cyan}15`, border: `2px solid ${C.cyan}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, animation: 'checkIn 0.5s ease-out' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>You're on the list.</div>
      <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.6, maxWidth: 360 }}>We'll be in touch within 48 hours.</div>
      <div style={{ marginTop: 40 }}>
        <a href="/" style={{ color: C.cyan, fontSize: 13, textDecoration: 'none' }}>← Back to AtmosFlow</a>
      </div>
      <style>{`@keyframes checkIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
