/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Picker view for AtmosFlow chain-of-custody sampling forms. Listed
 * in the hamburger menu; assessors tap to generate a print-ready PDF
 * with their identity pre-filled and ruled rows for hand-completion
 * during sample collection.
 *
 * Designed to accept additional sampling types (Asbestos, Lead,
 * Allergen, HCHO-specific, etc.) by adding entries to the `FORMS`
 * array. No additional plumbing required.
 */

import { useState } from 'react'
import { I } from './Icons'
import { generateMoldCoCBlob, MOLD_COC_FILENAME_PREFIX } from './forms/MoldCoCForm'
import { generateTvocCoCBlob, TVOC_COC_FILENAME_PREFIX } from './forms/TvocCoCForm'
import { deliverFile } from './forms/deliverFile'

const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const ACCENT = 'var(--accent)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const DANGER = 'var(--danger)'

const FORMS = [
  {
    id: 'mold',
    title: 'Mold Sampling',
    desc:
      'Chain of Custody for spore traps, tape lifts, swabs, bulk, surface dust, and direct-exam samples. Includes lab analyses checklist (direct exam, culturable, PCR/qPCR, ERMI).',
    icon: 'mold',
    prefix: MOLD_COC_FILENAME_PREFIX,
    generate: generateMoldCoCBlob,
  },
  {
    id: 'tvoc',
    title: 'TVOC Sampling',
    desc:
      'Chain of Custody for Summa canisters, sorbent tubes (Tenax, Carbopack), passive badges, and direct-read instruments. Includes EPA TO-15 / TO-17 / aldehyde analyses checklist.',
    icon: 'wind',
    prefix: TVOC_COC_FILENAME_PREFIX,
    generate: generateTvocCoCBlob,
  },
]

function slugify(s, max = 40) {
  return (s || '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'atmosflow'
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function buildFilename(prefix, profile) {
  const who = slugify(profile?.firm || profile?.name || 'atmosflow', 30)
  return `${prefix}-${who}-${todayIso()}.pdf`
}

export default function SamplingFormsView({ profile, onBack }) {
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  const handleGenerate = async (form) => {
    setError('')
    setBusyId(form.id)
    try {
      const blob = form.generate({ profile })
      await deliverFile(blob, buildFilename(form.prefix, profile))
    } catch (err) {
      console.error('[sampling-forms] generate failed', err)
      setError(err?.message || 'Failed to generate the form. Please try again.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 8 }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', color: ACCENT,
            fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
          }}>← Home</button>
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: 0, letterSpacing: '-0.3px' }}>
        Sampling Forms
      </h2>
      <div style={{ fontSize: 12, color: SUB, marginTop: 4, marginBottom: 20, lineHeight: 1.55 }}>
        Print-ready Chain of Custody forms for field sampling. Your assessor identity
        and instrument calibration are pre-filled; sample-specific rows are blank for
        hand-completion at the time of collection.
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: 14,
          background: `${DANGER}12`, border: `1px solid ${DANGER}30`,
          borderRadius: 8, color: DANGER, fontSize: 13,
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {FORMS.map((form) => (
          <div
            key={form.id}
            style={{
              padding: '18px',
              background: CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8,
                background: `color-mix(in srgb, var(--accent) 8%, transparent)`,
                border: `1px solid color-mix(in srgb, var(--accent) 25%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <I n={form.icon} s={20} c={ACCENT} w={1.8} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
                  {form.title}
                </div>
                <div style={{ fontSize: 12, color: SUB, lineHeight: 1.55 }}>
                  {form.desc}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleGenerate(form)}
              disabled={busyId === form.id}
              style={{
                alignSelf: 'flex-start',
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px',
                background: 'var(--accent-fill)',
                border: 'none', borderRadius: 8,
                color: 'var(--on-accent-fill)',
                fontSize: 13, fontWeight: 700,
                cursor: busyId === form.id ? 'wait' : 'pointer',
                fontFamily: 'inherit', minHeight: 40,
                opacity: busyId === form.id ? 0.7 : 1,
              }}>
              <I n="download" s={14} c="var(--on-accent-fill)" w={2} />
              {busyId === form.id ? 'Preparing…' : 'Generate PDF'}
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: DIM, lineHeight: 1.6 }}>
        Forms are versioned and stamped with the generated date. Hand-write sample
        details at collection time; the four-row transfer ladder at the bottom of
        each form is the wet-signature chain that holds up under review.
      </div>
    </div>
  )
}
