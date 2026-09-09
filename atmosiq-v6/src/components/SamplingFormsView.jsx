/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Picker view for AtmosFlow chain-of-custody sampling forms. Assessors
 * tap to generate a print-ready PDF with their identity pre-filled and
 * ruled rows for hand-completion during sample collection.
 *
 * Restraint pass (2026-09): the four-line subtitle, the three cards with
 * accent icon tiles and an accent-filled button in each are gone. Each
 * form is a row — its name, one line on what it covers, the action as
 * text in the primary ink — parting from the next with a hairline. The
 * lab-results import is the last row; the versioning note is a caption.
 *
 * Designed to accept additional sampling types (Asbestos, Lead,
 * Allergen, HCHO-specific, etc.) by adding entries to the `FORMS`
 * array. No additional plumbing required.
 */

import { useState, Suspense } from 'react'
import * as V3 from '../styles/tokens'
import { generateMoldCoCBlob, MOLD_COC_FILENAME_PREFIX } from './forms/MoldCoCForm'
import { generateTvocCoCBlob, TVOC_COC_FILENAME_PREFIX } from './forms/TvocCoCForm'
import { deliverFile } from './forms/deliverFile'
import { lazySafe } from './ui/lazySafe'
import { LazyPlaceholder } from './LaunchFrame'
// Lazy: the CSV importer (parser + templates) only loads when opened.
const LabResultsImport = lazySafe(() => import('./LabResultsImport'))

const HAIRLINE = `1px solid ${V3.BORDER_SUBTLE}`
const TEXT_ACTION = { background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: V3.TEXT_PRIMARY, cursor: 'pointer', whiteSpace: 'nowrap', WebkitTapHighlightColor: 'transparent', flexShrink: 0 }

const FORMS = [
  {
    id: 'mold',
    title: 'Mold sampling',
    desc: 'Spore traps, tape lifts, swabs, bulk and surface dust, with the lab analyses checklist.',
    prefix: MOLD_COC_FILENAME_PREFIX,
    generate: generateMoldCoCBlob,
  },
  {
    id: 'tvoc',
    title: 'TVOC sampling',
    desc: 'Summa canisters, sorbent tubes, passive badges and direct-read instruments, with the TO-15 / TO-17 checklist.',
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

function FormRow({ title, desc, action, first }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: first ? 'none' : HAIRLINE }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={V3.T.h3}>{title}</div>
        <div style={{ ...V3.T.caption, marginTop: 2, fontWeight: 400, lineHeight: 1.5 }}>{desc}</div>
      </div>
      {action}
    </div>
  )
}

// `onBack` is still passed by the shell; the header back control handles
// it, so the view renders none of its own.
export default function SamplingFormsView({ profile }) {
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [subView, setSubView] = useState('picker') // 'picker' | 'lab-import'

  if (subView === 'lab-import') {
    return <Suspense fallback={<LazyPlaceholder />}><LabResultsImport onBack={() => setSubView('picker')} /></Suspense>
  }

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
      <h2 style={{ ...V3.T.h1, margin: '0 0 12px' }}>Sampling forms</h2>

      {error && (
        <div style={{ ...V3.T.caption, color: 'var(--danger)', padding: '4px 0 8px', lineHeight: 1.5 }}>{error}</div>
      )}

      <div>
        {FORMS.map((form, i) => (
          <FormRow
            key={form.id}
            first={i === 0}
            title={form.title}
            desc={form.desc}
            action={
              <button onClick={() => handleGenerate(form)} disabled={busyId === form.id} style={{ ...TEXT_ACTION, opacity: busyId === form.id ? 0.5 : 1, cursor: busyId === form.id ? 'wait' : 'pointer' }}>
                {busyId === form.id ? 'Preparing…' : 'Generate PDF'}
              </button>
            }
          />
        ))}
        {/* Lab results import — closes the chain-of-custody loop: forms go
            out above, lab CSVs come back and attach to the originating
            assessment here. */}
        <FormRow
          title="Lab results"
          desc="Import a CSV from EMSL, EMLab P&K, Eurofins or a generic lab; results attach to an assessment as an appendix."
          action={<button onClick={() => setSubView('lab-import')} style={TEXT_ACTION}>Import CSV <span aria-hidden="true">›</span></button>}
        />
        <div style={{ borderTop: HAIRLINE }} />
      </div>

      <div style={{ ...V3.T.captionDim, marginTop: 16, lineHeight: 1.6 }}>
        Your identity and instrument calibration are pre-filled; sample rows are left blank for
        hand-completion at collection. Forms are versioned and stamped with the generated date.
      </div>
    </div>
  )
}
