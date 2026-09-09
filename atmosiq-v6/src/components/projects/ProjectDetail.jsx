/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ProjectDetail — the Project / Site Folder workspace. The site's identity
 * at the top of the page, a text-tab strip across Overview · Building ·
 * Assessments · Logger · Sampling · Photos · Documents · Notes · Activity,
 * and one accent action. Documents and photos upload inline
 * (offline-first data-URL storage with a per-file cap); in-app
 * assessments are linked from the report index; every mutation is logged
 * to the Activity timeline.
 *
 * Restraint pass (2026-09). The workspace used to open on an identity
 * card with a status-coloured rail, an in-body "← Projects" under the
 * header's own back control, three stacked buttons with icons, a Status
 * card of tinted pill chips, a Contents card of four icon tiles, and a
 * "Danger zone" card. Every list beneath was a card per row with an
 * accent icon in a tinted square. All of it is gone: the identity is
 * type on the page; the status is a word in its colour with the text-tab
 * row to change it; sections are micro headings over hairlines; rows part
 * with hairlines; actions are text in the primary ink; the one accent on
 * the screen is "New assessment". Upload lives on the Documents tab, and
 * the AI launcher floats on every screen, so neither needs a button here.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import * as V3 from '../../styles/tokens'
import TactileButton from '../ui/TactileButton'
import BottomSheet from '../ui/BottomSheet'
import { I } from '../Icons'
import STO from '../../utils/storage'
import {
  getProject, updateProject, deleteProject,
  addDocument, removeDocument, addEvidence, removeEvidence,
  addNote, removeNote, linkReport, unlinkReport,
  PROJECT_STATUSES, DOCUMENT_CATEGORIES, MAX_INLINE_FILE_BYTES,
} from '../../utils/projectStore'
import ProjectForm from './ProjectForm'
import AssessmentSegmentedPillNav from '../ui/AssessmentSegmentedPillNav'
import { STATUS_TONE, STATUS_LABEL, fmtBytes, fmtDate, fmtDateTime, fileToDataUrl, downloadDataUrl } from './projectsTheme'

const HAIRLINE = `1px solid ${V3.BORDER_SUBTLE}`
const DIM = V3.TEXT_TERTIARY

// Project workspace sections. The same text-tab row the results screen
// uses; icons are accepted by the control but not drawn.
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'building', label: 'Building' },
  { id: 'assessments', label: 'Assessments' },
  { id: 'logger', label: 'Logger' },
  { id: 'sampling', label: 'Sampling' },
  { id: 'evidence', label: 'Photos' },
  { id: 'documents', label: 'Documents' },
  { id: 'notes', label: 'Notes' },
  { id: 'activity', label: 'Activity' },
]

// A text action: primary ink, no box. The chevron says it goes somewhere;
// without one it does something here.
const TEXT_ACTION = { background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: V3.TEXT_PRIMARY, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', whiteSpace: 'nowrap' }
const ICON_BUTTON = { background: 'none', border: 'none', padding: 6, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', WebkitTapHighlightColor: 'transparent' }

// A section: micro heading (with an optional count and one text action)
// over content, parting from the section above with a hairline.
function Section({ title, count, action, first, children }) {
  return (
    <div style={{ paddingTop: first ? 4 : 18, borderTop: first ? 'none' : HAIRLINE }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={V3.T.micro}>{title}{typeof count === 'number' ? ` · ${count}` : ''}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

// A row in a list: hairline above every row but the first.
function Row({ first, onClick, ariaLabel, children, style }) {
  const base = { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: first ? 'none' : HAIRLINE, ...style }
  if (onClick) {
    return (
      <div role="button" tabIndex={0} aria-label={ariaLabel} onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
        style={{ ...base, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
        {children}
      </div>
    )
  }
  return <div style={base}>{children}</div>
}

function EmptyLine({ children }) {
  return <div style={{ ...V3.T.bodyDim, padding: '12px 0 4px' }}>{children}</div>
}

function MetaRow({ label, first, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderTop: first ? 'none' : HAIRLINE }}>
      <span style={{ ...V3.T.caption, flexShrink: 0 }}>{label}</span>
      <span style={{ ...V3.T.body, textAlign: 'right', minWidth: 0 }}>{children || '—'}</span>
    </div>
  )
}

export default function ProjectDetail({ id, onBack, profile, editSignal, onNewAssessment, onOpenReport, onOpenLogger, onOpenSampling }) {
  const [project, setProject] = useState(null)
  const [missing, setMissing] = useState(false)
  const [tab, setTab] = useState('overview')
  const [reportsIndex, setReportsIndex] = useState([])
  const [error, setError] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [docCategory, setDocCategory] = useState('')

  const docInputRef = useRef(null)
  const evInputRef = useRef(null)
  const uploadedBy = profile?.name || ''

  const refresh = useCallback(async () => {
    const p = await getProject(id)
    if (!p) { setMissing(true); setProject(null) }
    else { setProject(p); setMissing(false) }
  }, [id])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { (async () => { const idx = await STO.getIndex(); setReportsIndex(idx?.reports || []) })() }, [])

  // The header ⋯ overflow's "Edit details" lives in the app shell; it bumps
  // `editSignal` to open the edit sheet here (skip the initial 0/undefined).
  useEffect(() => { if (editSignal) setShowEdit(true) }, [editSignal])

  // Logger tab data — lazily scan the project's linked assessments for
  // attached Logger Studio data (reports persist the whole sensorData
  // object). null = not scanned yet; [] = scanned, none found.
  const [loggerLinked, setLoggerLinked] = useState(null)
  useEffect(() => {
    if (tab !== 'logger' || loggerLinked !== null || !project) return
    let alive = true
    ;(async () => {
      const out = []
      for (const rid of (project.linkedReportIds || [])) {
        try {
          const rec = await STO.get(rid)
          const graphs = rec?.sensorData?.graphs
          const all = graphs ? Object.values(graphs).filter(g => g) : []
          if (all.length > 0) {
            out.push({
              id: rid,
              facility: rec?.building?.fn || 'Assessment',
              ts: rec?.ts || null,
              graphCount: all.length,
              includedCount: all.filter(g => g.include).length,
            })
          }
        } catch { /* unreadable record — skip */ }
      }
      if (alive) setLoggerLinked(out)
    })()
    return () => { alive = false }
  }, [tab, loggerLinked, project])

  if (missing) {
    return (
      <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 760, margin: '0 auto' }}>
        <div style={{ ...V3.T.bodyDim, padding: '40px 0', textAlign: 'center' }}>This project could not be found.</div>
        <div style={{ textAlign: 'center' }}><button onClick={onBack} style={TEXT_ACTION}>Back to projects</button></div>
      </div>
    )
  }
  if (!project) {
    return <div style={{ ...V3.T.bodyDim, textAlign: 'center', padding: '60px 0' }}>Loading…</div>
  }

  const tone = STATUS_TONE[project.status] || V3.STATUS.draft

  const handleEditSave = async (fields) => { await updateProject(id, fields); setShowEdit(false); refresh() }
  const handleStatus = async (status) => { await updateProject(id, { status }); refresh() }

  const handleFiles = async (fileList, kind) => {
    setError('')
    const files = Array.from(fileList || [])
    for (const file of files) {
      if (file.size > MAX_INLINE_FILE_BYTES) {
        setError(`"${file.name}" is too large (${fmtBytes(file.size)}). On-device limit is ${(MAX_INLINE_FILE_BYTES / 1024 / 1024).toFixed(1)} MB; cloud document storage is coming soon.`)
        continue
      }
      try {
        const dataUrl = await fileToDataUrl(file)
        const payload = { name: file.name, type: file.type, size: file.size, dataUrl, uploadedBy }
        const res = kind === 'evidence'
          ? await addEvidence(id, payload)
          : await addDocument(id, { ...payload, category: docCategory })
        if (res?.error) setError(res.error)
      } catch {
        setError(`Could not read "${file.name}".`)
      }
    }
    refresh()
  }

  const handleAddNote = async () => {
    if (!noteDraft.trim()) return
    await addNote(id, { text: noteDraft, author: uploadedBy })
    setNoteDraft('')
    refresh()
  }

  const handleDelete = async () => { await deleteProject(id); onBack?.() }

  // Launch a new assessment seeded with this site's identity so the
  // walkthrough opens pre-bound to the project (and re-links on finalize,
  // matched by name). Keeps assessment creation inside the workspace.
  const startNewAssessment = () => onNewAssessment?.({ name: project.name, address: project.address })

  const linkedReports = (project.linkedReportIds || [])
    .map(rid => reportsIndex.find(r => r.id === rid) || { id: rid, facility: 'Assessment', ts: null, missing: true })
  const linkable = reportsIndex.filter(r => !(project.linkedReportIds || []).includes(r.id))

  const counts = [
    ['Assessments', (project.linkedReportIds || []).length, 'assessments'],
    ['Documents', (project.documents || []).length, 'documents'],
    ['Photos', (project.evidence || []).length, 'evidence'],
    ['Notes', (project.notes || []).length, 'notes'],
  ]

  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 760, margin: '0 auto' }}>
      {/* Identity on the page: the name, the client, the address, and the
          status as a word in its colour. The header's back control is the
          one way back. */}
      <div style={{ marginBottom: 16 }}>
        <div style={V3.T.h1}>{project.name}</div>
        {project.client && <div style={{ ...V3.T.h1Sub, marginTop: 2 }}>{project.client}</div>}
        <div style={{ ...V3.T.caption, marginTop: 6 }}>
          <span style={{ color: tone, fontWeight: 600 }}>{STATUS_LABEL[project.status] || project.status}</span>
          {project.address ? <> · {project.address}</> : null}
        </div>
      </div>

      {onNewAssessment && (
        <div style={{ marginBottom: 6 }}>
          <TactileButton variant="primary" size="lg" pill fullWidth haptic="success" onClick={startNewAssessment}>
            New assessment
          </TactileButton>
        </div>
      )}

      {/* Section nav — these tabs navigate WITHIN this project; the bottom
          dock is global navigation. */}
      <AssessmentSegmentedPillNav
        tabs={TABS}
        active={tab}
        onChange={setTab}
        ariaLabel="Project sections"
        style={{ margin: '10px 0 8px' }}
      />

      {error && (
        <div style={{ ...V3.T.caption, color: 'var(--danger)', padding: '8px 0 4px', lineHeight: 1.5 }}>{error}</div>
      )}

      {/* Hidden upload inputs */}
      <input ref={docInputRef} type="file" multiple accept=".pdf,.doc,.docx,.csv,.xls,.xlsx,.txt,image/*" style={{ display: 'none' }} onChange={e => { handleFiles(e.target.files, 'document'); e.target.value = '' }} />
      <input ref={evInputRef} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={e => { handleFiles(e.target.files, 'evidence'); e.target.value = '' }} />

      {/* ── Overview ───────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div>
          <Section title="Status" first>
            {/* The status is chosen the way every other choice in the app
                is made: a text-tab row. The current status is also the
                coloured word under the name above. */}
            <AssessmentSegmentedPillNav
              tabs={PROJECT_STATUSES.map(s => ({ id: s, label: STATUS_LABEL[s] }))}
              active={project.status}
              onChange={handleStatus}
              ariaLabel="Project status"
              style={{ margin: 0 }}
            />
          </Section>

          {project.description && (
            <Section title="Description">
              <div style={{ ...V3.T.body, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{project.description}</div>
            </Section>
          )}

          <Section title="Contents">
            {counts.map(([label, n, target], i) => (
              <Row key={label} first={i === 0} onClick={() => setTab(target)} ariaLabel={`${label}: ${n}. Open ${label}`} style={{ padding: '11px 0' }}>
                <span style={{ ...V3.T.body, flex: 1 }}>{label}</span>
                <span style={{ ...V3.T.captionDim, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                <span aria-hidden="true" style={{ color: DIM, fontSize: 18, lineHeight: 1 }}>›</span>
              </Row>
            ))}
          </Section>

          {/* Deleting the workspace is a text action in the danger colour at
              the end of the page — not a card with a warning heading. The
              confirmation sheet explains that linked assessments survive. */}
          <div style={{ paddingTop: 18, borderTop: HAIRLINE, marginTop: 18 }}>
            <button onClick={() => setConfirmDelete(true)} style={{ ...TEXT_ACTION, color: 'var(--danger)' }}>Delete project</button>
          </div>
        </div>
      )}

      {/* ── Building ───────────────────────────────────────────────── */}
      {tab === 'building' && (
        <div>
          <Section title="Building information" first action={<button onClick={() => setShowEdit(true)} style={TEXT_ACTION}>Edit</button>}>
            <MetaRow label="Client" first>{project.client}</MetaRow>
            <MetaRow label="Site type">{project.siteType}</MetaRow>
            <MetaRow label="Address">{project.address}</MetaRow>
            <MetaRow label="Assessors">{(project.assessors || []).join(', ')}</MetaRow>
            <MetaRow label="Created">{fmtDate(project.createdAt)}</MetaRow>
            <MetaRow label="Last updated">{fmtDate(project.updatedAt)}</MetaRow>
          </Section>
          <Section title="Building profile">
            <div style={V3.T.bodyDim}>
              The detailed building profile (HVAC, occupancy, envelope) is captured inside each
              assessment walkthrough and pre-fills on a follow-up visit to this site.
            </div>
          </Section>
        </div>
      )}

      {/* ── Logger data ────────────────────────────────────────────── */}
      {tab === 'logger' && (
        <div>
          <Section title="Logger data" count={loggerLinked ? loggerLinked.length : undefined} first
            action={onOpenLogger && <button onClick={onOpenLogger} style={TEXT_ACTION}>Open Logger Studio ›</button>}>
            {loggerLinked === null ? (
              <EmptyLine>Scanning linked assessments for logger data…</EmptyLine>
            ) : loggerLinked.length === 0 ? (
              <EmptyLine>None attached yet. Charts and averages sent from Logger Studio into this site's assessments appear here.</EmptyLine>
            ) : loggerLinked.map((l, i) => {
              const idxEntry = reportsIndex.find(r => r.id === l.id)
              return (
                <Row key={l.id} first={i === 0} onClick={idxEntry ? () => onOpenReport?.(idxEntry) : undefined}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...V3.T.bodyStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.facility}</div>
                    <div style={V3.T.captionDim}>
                      {l.ts ? `${fmtDate(l.ts)} · ` : ''}{l.graphCount} graph{l.graphCount === 1 ? '' : 's'}{l.includedCount ? ` · ${l.includedCount} in report` : ''}
                    </div>
                  </div>
                  <span aria-hidden="true" style={{ color: DIM, fontSize: 18, lineHeight: 1 }}>›</span>
                </Row>
              )
            })}
          </Section>
        </div>
      )}

      {/* ── Sampling forms ─────────────────────────────────────────── */}
      {tab === 'sampling' && (
        <div>
          <Section title="Sampling forms" first
            action={onOpenSampling && <button onClick={onOpenSampling} style={TEXT_ACTION}>Open sampling forms ›</button>}>
            <EmptyLine>Chain-of-custody forms for this site's assessments. Completed forms can be uploaded to Documents to keep them with the engagement.</EmptyLine>
          </Section>
        </div>
      )}

      {/* ── Assessments ────────────────────────────────────────────── */}
      {tab === 'assessments' && (
        <div>
          <Section title="Assessments" count={linkedReports.length} first
            action={<div style={{ display: 'flex', gap: 16 }}>
              <button onClick={() => setShowLink(true)} style={TEXT_ACTION}>Link</button>
              {onNewAssessment && <button onClick={startNewAssessment} style={TEXT_ACTION}>New</button>}
            </div>}>
            {linkedReports.length === 0 ? (
              <EmptyLine>None yet. Start an assessment for this site, or link an existing one.</EmptyLine>
            ) : linkedReports.map((r, i) => (
              <Row key={r.id} first={i === 0} onClick={r.missing ? undefined : () => onOpenReport?.(r)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...V3.T.bodyStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.facility || 'Assessment'}</div>
                  <div style={V3.T.captionDim}>{r.missing ? 'Assessment record' : fmtDate(r.ts)}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); unlinkReport(id, r.id).then(refresh) }} aria-label={`Unlink ${r.facility || 'assessment'}`} style={ICON_BUTTON}>
                  <I n="x" s={16} c={DIM} w={2} />
                </button>
              </Row>
            ))}
          </Section>
        </div>
      )}

      {/* ── Documents ──────────────────────────────────────────────── */}
      {tab === 'documents' && (
        <div>
          <Section title="Documents" count={(project.documents || []).length} first
            action={<button onClick={() => docInputRef.current?.click()} style={TEXT_ACTION}>Upload</button>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 10px' }}>
              <span style={V3.T.caption}>Tag next upload as</span>
              <select value={docCategory} onChange={e => setDocCategory(e.target.value)} style={{ padding: '4px 6px', background: 'transparent', border: 'none', color: V3.TEXT_PRIMARY, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                <option value="">No category</option>
                {DOCUMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {(project.documents || []).length === 0 ? (
              <EmptyLine>None yet. PDFs, Word files, lab results, HVAC documents and prior reports stay tied to this site.</EmptyLine>
            ) : project.documents.map((d, i) => (
              <Row key={d.id} first={i === 0}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...V3.T.bodyStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                  <div style={V3.T.captionDim}>
                    {fmtBytes(d.size)} · {fmtDate(d.uploadedAt)}{d.uploadedBy ? ` · ${d.uploadedBy}` : ''}{d.category ? ` · ${d.category}` : ''}
                  </div>
                </div>
                <button onClick={() => downloadDataUrl(d.dataUrl, d.name)} aria-label={`Download ${d.name}`} style={ICON_BUTTON}>
                  <I n="download" s={17} c={V3.TEXT_SECONDARY} w={1.8} />
                </button>
                <button onClick={() => removeDocument(id, d.id).then(refresh)} aria-label={`Remove ${d.name}`} style={ICON_BUTTON}>
                  <I n="trash" s={16} c={DIM} w={1.8} />
                </button>
              </Row>
            ))}
          </Section>
        </div>
      )}

      {/* ── Photos ─────────────────────────────────────────────────── */}
      {tab === 'evidence' && (
        <div>
          <Section title="Photos" count={(project.evidence || []).length} first
            action={<button onClick={() => evInputRef.current?.click()} style={TEXT_ACTION}>Add photos</button>}>
            {(project.evidence || []).length === 0 ? (
              <EmptyLine>None yet. Site photos (water damage, HVAC conditions, surfaces) stay with this engagement.</EmptyLine>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, paddingTop: 4 }}>
                {project.evidence.map(ev => (
                  <div key={ev.id} style={{ position: 'relative', borderRadius: V3.R.md, overflow: 'hidden', background: 'var(--surface)' }}>
                    <button onClick={() => downloadDataUrl(ev.dataUrl, ev.name)} style={{ display: 'block', width: '100%', border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}>
                      <img src={ev.dataUrl} alt={ev.caption || ev.name} style={{ display: 'block', width: '100%', height: 120, objectFit: 'cover' }} />
                    </button>
                    <div style={{ padding: '8px 10px' }}>
                      <div style={{ ...V3.T.caption, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.caption || ev.name}</div>
                      <div style={{ ...V3.T.captionDim, fontSize: 10 }}>{fmtDate(ev.uploadedAt)}</div>
                    </div>
                    <button onClick={() => removeEvidence(id, ev.id).then(refresh)} aria-label={`Remove ${ev.caption || ev.name}`} style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.55)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <I n="trash" s={14} c="#fff" w={1.8} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {/* ── Notes ──────────────────────────────────────────────────── */}
      {tab === 'notes' && (
        <div>
          <Section title="Notes" count={(project.notes || []).length} first
            action={<button onClick={handleAddNote} disabled={!noteDraft.trim()} style={{ ...TEXT_ACTION, opacity: noteDraft.trim() ? 1 : 0.4, cursor: noteDraft.trim() ? 'pointer' : 'default' }}>Add note</button>}>
            <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Add a note about this site…" aria-label="New note"
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 72, resize: 'none', padding: '11px 12px', background: 'var(--surface)', border: `1px solid ${V3.BORDER_SUBTLE}`, borderRadius: V3.R.md, color: V3.TEXT_PRIMARY, fontSize: 16, fontFamily: 'inherit', marginBottom: 4 }} />
            {(project.notes || []).length === 0 ? (
              <EmptyLine>No notes yet.</EmptyLine>
            ) : project.notes.map((n, i) => (
              <Row key={n.id} first={i === 0} style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...V3.T.body, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{n.text}</div>
                  <div style={{ ...V3.T.captionDim, marginTop: 4 }}>{n.author ? `${n.author} · ` : ''}{fmtDateTime(n.createdAt)}</div>
                </div>
                <button onClick={() => removeNote(id, n.id).then(refresh)} aria-label="Remove note" style={ICON_BUTTON}>
                  <I n="trash" s={14} c={DIM} w={1.8} />
                </button>
              </Row>
            ))}
          </Section>
        </div>
      )}

      {/* ── Activity ───────────────────────────────────────────────── */}
      {tab === 'activity' && (
        <div>
          <Section title="Activity" count={(project.activity || []).length} first>
            {(project.activity || []).length === 0 ? (
              <EmptyLine>No activity yet.</EmptyLine>
            ) : project.activity.map((a, i) => (
              <Row key={a.id} first={i === 0} style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={V3.T.body}>{a.text}</div>
                  <div style={{ ...V3.T.captionDim, marginTop: 2 }}>{fmtDateTime(a.ts)}</div>
                </div>
              </Row>
            ))}
          </Section>
        </div>
      )}

      {showEdit && (
        <BottomSheet title="Edit project" onClose={() => setShowEdit(false)}>
          <ProjectForm initial={project} submitLabel="Save changes" onSubmit={handleEditSave} onCancel={() => setShowEdit(false)} />
        </BottomSheet>
      )}

      {showLink && (
        <BottomSheet title="Link an assessment" onClose={() => setShowLink(false)}>
          {linkable.length === 0 ? (
            <EmptyLine>No more assessments available to link. Finalized assessments appear in your Reports list.</EmptyLine>
          ) : linkable.map((r, i) => (
            <Row key={r.id} first={i === 0} onClick={() => { linkReport(id, r.id, r.facility).then(() => { setShowLink(false); refresh() }) }} ariaLabel={`Link ${r.facility || 'assessment'}`}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...V3.T.bodyStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.facility || 'Assessment'}</div>
                <div style={V3.T.captionDim}>{fmtDate(r.ts)}</div>
              </div>
              <span aria-hidden="true" style={{ color: DIM, fontSize: 18, lineHeight: 1 }}>›</span>
            </Row>
          ))}
        </BottomSheet>
      )}

      {confirmDelete && (
        <BottomSheet title="Delete project?" onClose={() => setConfirmDelete(false)}>
          <div style={{ ...V3.T.bodyDim, marginBottom: 16 }}>This permanently removes the site workspace and all documents, photos, notes, and links stored in it. Linked assessments themselves are not deleted.</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <TactileButton variant="danger" size="lg" fullWidth haptic="heavy" onClick={handleDelete}>Delete project</TactileButton>
            <TactileButton variant="ghost" size="lg" onClick={() => setConfirmDelete(false)}>Cancel</TactileButton>
          </div>
        </BottomSheet>
      )}
    </div>
  )
}
