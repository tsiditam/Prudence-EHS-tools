/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ProjectDetail — the Project / Site Folder workspace. A site engagement
 * hub (not a file browser): a header identity card + status, then a
 * horizontally-scrollable tab strip across Overview · Assessments ·
 * Documents · Evidence · Notes · Activity. Documents and evidence upload
 * inline (offline-first data-URL storage with a per-file cap); in-app
 * assessments are linked from the report index; every mutation is logged
 * to the Activity timeline.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import * as V3 from '../../styles/tokens'
import { stack as sgStack } from '../../styles/soft-glass'
import GlassCard from '../ui/GlassCard'
import StatusPill from '../ui/StatusPill'
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
import { STATUS_TONE, STATUS_LABEL, fileIcon, fmtBytes, fmtDate, fmtDateTime, fileToDataUrl, downloadDataUrl } from './projectsTheme'

const DIM = V3.TEXT_MUTED
const TABS = [
  { id: 'overview', label: 'Overview', icon: 'clip' },
  { id: 'assessments', label: 'Assessments', icon: 'findings' },
  { id: 'documents', label: 'Documents', icon: 'paperclip' },
  { id: 'evidence', label: 'Evidence', icon: 'image' },
  { id: 'notes', label: 'Notes', icon: 'notes' },
  { id: 'activity', label: 'Activity', icon: 'clock' },
]

function SectionHead({ title, count, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={V3.T.micro}>{title}</span>
        {typeof count === 'number' && <span style={V3.T.captionDim}>{count}</span>}
      </div>
      {action}
    </div>
  )
}

function EmptyHint({ children }) {
  return <div style={{ ...V3.T.bodyDim, padding: '20px 4px', textAlign: 'center' }}>{children}</div>
}

function MetaRow({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: `1px solid ${V3.BORDER_SUBTLE}` }}>
      <span style={{ ...V3.T.caption, color: DIM, flexShrink: 0 }}>{label}</span>
      <span style={{ ...V3.T.body, textAlign: 'right', minWidth: 0 }}>{children || '—'}</span>
    </div>
  )
}

export default function ProjectDetail({ id, onBack, profile, onOpenReport }) {
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

  if (missing) {
    return (
      <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 760, margin: '0 auto' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginBottom: 16 }}>← Projects</button>
        <EmptyHint>This project could not be found.</EmptyHint>
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

  const linkedReports = (project.linkedReportIds || [])
    .map(rid => reportsIndex.find(r => r.id === rid) || { id: rid, facility: 'Assessment', ts: null, missing: true })
  const linkable = reportsIndex.filter(r => !(project.linkedReportIds || []).includes(r.id))

  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 760, margin: '0 auto' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginBottom: 12 }}>← Projects</button>

      {/* ── Header identity card ───────────────────────────────────── */}
      <GlassCard accent={tone} style={{ padding: '20px 22px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={V3.T.h1}>{project.name}</div>
            {project.client && <div style={{ ...V3.T.h1Sub, marginTop: 4, color: V3.TEXT_SECONDARY }}>{project.client}</div>}
            {project.address && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <I n="location" s={13} c={DIM} w={1.8} />
                <span style={{ ...V3.T.caption, color: DIM }}>{project.address}</span>
              </div>
            )}
          </div>
          <StatusPill tone={tone}>{STATUS_LABEL[project.status] || project.status}</StatusPill>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
          <TactileButton variant="secondary" size="sm" onClick={() => { setDocCategory(''); docInputRef.current?.click() }} icon={<I n="upload" s={14} c="var(--accent)" />}>Upload</TactileButton>
          <TactileButton variant="ghost" size="sm" onClick={() => setShowEdit(true)} icon={<I n="draft" s={14} c={V3.TEXT_SECONDARY} />}>Edit details</TactileButton>
        </div>
      </GlassCard>

      {/* ── Tab strip ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 16, borderBottom: `1px solid ${V3.BORDER_SUBTLE}`, WebkitOverflowScrolling: 'touch' }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600, color: active ? 'var(--accent)' : V3.TEXT_SECONDARY,
              borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`, marginBottom: -1,
            }}>
              <I n={t.icon} s={15} c={active ? 'var(--accent)' : V3.TEXT_TERTIARY} w={1.8} />
              {t.label}
            </button>
          )
        })}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', marginBottom: 14, background: 'color-mix(in srgb, var(--danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)', borderRadius: V3.R.md, color: 'var(--danger)', fontSize: 13 }}>{error}</div>
      )}

      {/* Hidden upload inputs */}
      <input ref={docInputRef} type="file" multiple accept=".pdf,.doc,.docx,.csv,.xls,.xlsx,.txt,image/*" style={{ display: 'none' }} onChange={e => { handleFiles(e.target.files, 'document'); e.target.value = '' }} />
      <input ref={evInputRef} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={e => { handleFiles(e.target.files, 'evidence'); e.target.value = '' }} />

      {/* ── Overview ───────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div style={sgStack('base')}>
          <GlassCard>
            <SectionHead title="Site details" />
            <MetaRow label="Client">{project.client}</MetaRow>
            <MetaRow label="Site type">{project.siteType}</MetaRow>
            <MetaRow label="Assessor(s)">{(project.assessors || []).join(', ')}</MetaRow>
            <MetaRow label="Created">{fmtDate(project.createdAt)}</MetaRow>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0' }}>
              <span style={{ ...V3.T.caption, color: DIM }}>Last updated</span>
              <span style={{ ...V3.T.body }}>{fmtDate(project.updatedAt)}</span>
            </div>
          </GlassCard>

          <GlassCard>
            <SectionHead title="Status" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PROJECT_STATUSES.map(s => {
                const active = project.status === s
                const st = STATUS_TONE[s]
                return (
                  <button key={s} onClick={() => handleStatus(s)} style={{
                    padding: '7px 14px', borderRadius: V3.R.pill, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                    background: active ? `color-mix(in srgb, ${st} 16%, transparent)` : 'transparent',
                    border: `1px solid ${active ? `color-mix(in srgb, ${st} 45%, transparent)` : V3.BORDER_DEFAULT}`,
                    color: active ? st : V3.TEXT_SECONDARY,
                  }}>{STATUS_LABEL[s]}</button>
                )
              })}
            </div>
          </GlassCard>

          {project.description && (
            <GlassCard>
              <SectionHead title="Description" />
              <div style={{ ...V3.T.body, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{project.description}</div>
            </GlassCard>
          )}

          <GlassCard>
            <SectionHead title="Contents" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
              {[
                ['findings', (project.linkedReportIds || []).length, 'Assessments'],
                ['paperclip', (project.documents || []).length, 'Documents'],
                ['image', (project.evidence || []).length, 'Photos'],
                ['notes', (project.notes || []).length, 'Notes'],
              ].map(([icon, n, label]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <I n={icon} s={16} c={V3.TEXT_TERTIARY} w={1.8} />
                  <span style={{ ...V3.N.md }}>{n}</span>
                  <span style={{ ...V3.T.caption, color: DIM }}>{label}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── Assessments ────────────────────────────────────────────── */}
      {tab === 'assessments' && (
        <div>
          <SectionHead title="Linked assessments" count={linkedReports.length} action={
            <TactileButton variant="secondary" size="sm" onClick={() => setShowLink(true)} icon={<I n="chain" s={14} c="var(--accent)" />}>Link</TactileButton>
          } />
          {linkedReports.length === 0 ? (
            <EmptyHint>No assessments linked yet. Tap “Link” to associate an in-app assessment with this site.</EmptyHint>
          ) : (
            <div style={sgStack('tight')}>
              {linkedReports.map(r => (
                <GlassCard key={r.id} dense onClick={r.missing ? undefined : () => onOpenReport?.(r)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <I n="findings" s={18} c="var(--accent)" w={1.8} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...V3.T.bodyStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.facility || 'Assessment'}</div>
                      <div style={V3.T.captionDim}>{r.missing ? 'Assessment record' : fmtDate(r.ts)}{typeof r.score === 'number' ? ` · score ${r.score}` : ''}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); unlinkReport(id, r.id).then(refresh) }} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 6, fontFamily: 'inherit' }}>
                      <I n="x" s={16} c={DIM} w={2} />
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Documents ──────────────────────────────────────────────── */}
      {tab === 'documents' && (
        <div>
          <SectionHead title="Documents" count={(project.documents || []).length} action={
            <TactileButton variant="secondary" size="sm" onClick={() => { setDocCategory(''); docInputRef.current?.click() }} icon={<I n="upload" s={14} c="var(--accent)" />}>Upload</TactileButton>
          } />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ ...V3.T.caption, color: DIM }}>Tag next upload as</span>
            <select value={docCategory} onChange={e => setDocCategory(e.target.value)} style={{ padding: '6px 10px', background: 'var(--surface)', border: `1px solid ${V3.BORDER_DEFAULT}`, borderRadius: V3.R.md, color: V3.TEXT_PRIMARY, fontSize: 12, fontFamily: 'inherit' }}>
              <option value="">No category</option>
              {DOCUMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {(project.documents || []).length === 0 ? (
            <EmptyHint>No documents yet. Upload PDFs, DOCX, lab results, HVAC docs, building plans, or prior IAQ reports. They stay tied to this site.</EmptyHint>
          ) : (
            <div style={sgStack('tight')}>
              {project.documents.map(d => (
                <GlassCard key={d.id} dense>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)' }}>
                      <I n={fileIcon(d.type, d.name)} s={17} c="var(--accent)" w={1.8} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...V3.T.bodyStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                      <div style={V3.T.captionDim}>
                        {fmtBytes(d.size)} · {fmtDate(d.uploadedAt)}{d.uploadedBy ? ` · ${d.uploadedBy}` : ''}
                      </div>
                      {d.category && <div style={{ marginTop: 6 }}><StatusPill tone={V3.TEXT_TERTIARY} dim>{d.category}</StatusPill></div>}
                    </div>
                    <button onClick={() => downloadDataUrl(d.dataUrl, d.name)} title="Open / download" style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 6, fontFamily: 'inherit' }}>
                      <I n="download" s={17} c="var(--accent)" w={1.8} />
                    </button>
                    <button onClick={() => removeDocument(id, d.id).then(refresh)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, fontFamily: 'inherit' }}>
                      <I n="trash" s={16} c={DIM} w={1.8} />
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Evidence ───────────────────────────────────────────────── */}
      {tab === 'evidence' && (
        <div>
          <SectionHead title="Evidence / photos" count={(project.evidence || []).length} action={
            <TactileButton variant="secondary" size="sm" onClick={() => evInputRef.current?.click()} icon={<I n="upload" s={14} c="var(--accent)" />}>Add photos</TactileButton>
          } />
          {(project.evidence || []).length === 0 ? (
            <EmptyHint>No evidence photos yet. Add site photos (water damage, HVAC conditions, surfaces) kept with this engagement.</EmptyHint>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {project.evidence.map(ev => (
                <div key={ev.id} style={{ position: 'relative', borderRadius: V3.R.md, overflow: 'hidden', border: `1px solid ${V3.BORDER_DEFAULT}`, background: 'var(--surface)' }}>
                  <button onClick={() => downloadDataUrl(ev.dataUrl, ev.name)} style={{ display: 'block', width: '100%', border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}>
                    <img src={ev.dataUrl} alt={ev.caption || ev.name} style={{ display: 'block', width: '100%', height: 120, objectFit: 'cover' }} />
                  </button>
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ ...V3.T.caption, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.caption || ev.name}</div>
                    <div style={{ ...V3.T.captionDim, fontSize: 10 }}>{fmtDate(ev.uploadedAt)}</div>
                  </div>
                  <button onClick={() => removeEvidence(id, ev.id).then(refresh)} style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.55)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <I n="trash" s={14} c="#fff" w={1.8} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Notes ──────────────────────────────────────────────────── */}
      {tab === 'notes' && (
        <div>
          <SectionHead title="Notes" count={(project.notes || []).length} />
          <GlassCard style={{ marginBottom: 14 }}>
            <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Add a note about this site…" style={{ width: '100%', boxSizing: 'border-box', minHeight: 72, resize: 'vertical', padding: '11px 12px', background: 'var(--surface)', border: `1px solid ${V3.BORDER_DEFAULT}`, borderRadius: V3.R.md, color: V3.TEXT_PRIMARY, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
              <TactileButton variant="primary" size="sm" disabled={!noteDraft.trim()} onClick={handleAddNote}>Add note</TactileButton>
            </div>
          </GlassCard>
          {(project.notes || []).length === 0 ? (
            <EmptyHint>No notes yet.</EmptyHint>
          ) : (
            <div style={sgStack('tight')}>
              {project.notes.map(n => (
                <GlassCard key={n.id} dense>
                  <div style={{ ...V3.T.body, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{n.text}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={V3.T.captionDim}>{n.author ? `${n.author} · ` : ''}{fmtDateTime(n.createdAt)}</span>
                    <button onClick={() => removeNote(id, n.id).then(refresh)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 4, fontFamily: 'inherit' }}>
                      <I n="trash" s={14} c={DIM} w={1.8} />
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Activity ───────────────────────────────────────────────── */}
      {tab === 'activity' && (
        <div>
          <SectionHead title="Activity / history" count={(project.activity || []).length} />
          {(project.activity || []).length === 0 ? (
            <EmptyHint>No activity yet.</EmptyHint>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {project.activity.map((a, i) => (
                <div key={a.id} style={{ display: 'flex', gap: 12, paddingBottom: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', marginTop: 4, flexShrink: 0 }} />
                    {i < project.activity.length - 1 && <div style={{ width: 1, flex: 1, background: V3.BORDER_DEFAULT, marginTop: 4 }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
                    <div style={V3.T.body}>{a.text}</div>
                    <div style={V3.T.captionDim}>{fmtDateTime(a.ts)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${V3.BORDER_SUBTLE}` }}>
            <TactileButton variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} icon={<I n="trash" s={14} c="var(--danger)" />} style={{ color: 'var(--danger)' }}>Delete project</TactileButton>
          </div>
        </div>
      )}

      {showEdit && (
        <BottomSheet title="Edit project details" onClose={() => setShowEdit(false)}>
          <ProjectForm initial={project} submitLabel="Save changes" onSubmit={handleEditSave} onCancel={() => setShowEdit(false)} />
        </BottomSheet>
      )}

      {showLink && (
        <BottomSheet title="Link an assessment" onClose={() => setShowLink(false)}>
          {linkable.length === 0 ? (
            <EmptyHint>No more assessments available to link. Finalized assessments appear in your Reports list.</EmptyHint>
          ) : (
            <div style={sgStack('tight')}>
              {linkable.map(r => (
                <GlassCard key={r.id} dense onClick={() => { linkReport(id, r.id, r.facility).then(() => { setShowLink(false); refresh() }) }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <I n="findings" s={18} c="var(--accent)" w={1.8} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...V3.T.bodyStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.facility || 'Assessment'}</div>
                      <div style={V3.T.captionDim}>{fmtDate(r.ts)}{typeof r.score === 'number' ? ` · score ${r.score}` : ''}</div>
                    </div>
                    <I n="chain" s={16} c={DIM} w={1.8} />
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
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
