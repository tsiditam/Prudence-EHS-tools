/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ProjectsScreen — the Project / Site Folder index. Lists every site
 * workspace as a scannable card (name, client, status, counts, last
 * updated), with status filtering and a create flow. Tapping a card
 * opens the ProjectDetail workspace.
 */

import { useState, useEffect, useCallback } from 'react'
import * as V3 from '../../styles/tokens'
import { RHYTHM, stack as sgStack } from '../../styles/soft-glass'
import GlassCard from '../ui/GlassCard'
import StatusPill from '../ui/StatusPill'
import TactileButton from '../ui/TactileButton'
import BottomSheet from '../ui/BottomSheet'
import { I } from '../Icons'
import { getProjects, createProject, deleteProject, PROJECT_STATUSES } from '../../utils/projectStore'
import ProjectForm from './ProjectForm'
import { STATUS_TONE, STATUS_LABEL, fmtDate } from './projectsTheme'

const DIM = V3.TEXT_MUTED

// "New project" uses the standard cyan primary bubble (TactileButton
// variant="primary" bubble — BUBBLE_TINT.primary). Brand-token discipline:
// the CTA is differentiated by fill and weight, not by hue. Green is off the
// table for chrome — it's reserved for the safe / severity scale (ANSI Z535).

// Filter pills carry a lighter shadow than a full CTA so the chip row doesn't
// read as a row of floating buttons.
const FILTER_BUBBLE_BASE = { '--bubble-shadow': '0 2px 8px rgba(0,0,0,0.20)', '--bubble-inset': 'inset 0 1px 0 rgba(255,255,255,0.10)' }

function CountChip({ icon, n, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: V3.TEXT_TERTIARY, fontSize: 12 }}>
      <I n={icon} s={13} c={V3.TEXT_TERTIARY} w={1.8} />
      <span style={{ ...V3.N.sm, color: V3.TEXT_SECONDARY }}>{n}</span>
      {/* Contrast floor (Rule 5): meaningful labels use --sub (~5.6:1 on the
          app bg), not --dim (~3.6:1, fails AA 4.5 for small text). */}
      <span style={{ color: V3.TEXT_TERTIARY }}>{label}</span>
    </span>
  )
}

function ProjectCard({ project, onOpen, onRequestDelete }) {
  const tone = STATUS_TONE[project.status] || V3.STATUS.draft
  const meta = [project.client, project.siteType].filter(Boolean).join(' · ')
  // Stop propagation so the destructive control never triggers the card's
  // open-on-tap; the actual delete still goes through the confirm sheet.
  const requestDelete = (e) => { e.stopPropagation(); onRequestDelete(project) }
  return (
    <GlassCard onClick={() => onOpen(project.id)} style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...V3.T.h3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</div>
          {meta && <div style={{ ...V3.T.captionDim, marginTop: 3 }}>{meta}</div>}
          {project.address && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
              <I n="location" s={12} c={DIM} w={1.8} />
              <span style={{ ...V3.T.caption, color: V3.TEXT_TERTIARY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.address}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <StatusPill tone={tone} dim>{STATUS_LABEL[project.status] || project.status}</StatusPill>
          <button
            type="button"
            onClick={requestDelete}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Delete ${project.name || 'project'}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            <I n="trash" s={15} c="var(--danger)" w={1.8} />
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${V3.BORDER_SUBTLE}` }}>
        <CountChip icon="findings" n={(project.linkedReportIds || []).length} label="assess." />
        <CountChip icon="paperclip" n={(project.documents || []).length} label="docs" />
        <CountChip icon="image" n={(project.evidence || []).length} label="photos" />
        <CountChip icon="notes" n={(project.notes || []).length} label="notes" />
        <span style={{ marginLeft: 'auto', ...V3.T.caption, color: V3.TEXT_TERTIARY }}>Updated {fmtDate(project.updatedAt)}</span>
      </div>
    </GlassCard>
  )
}

export default function ProjectsScreen({ onBack, onOpen, onReportIncident }) {
  const [projects, setProjects] = useState(null)
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null) // the project awaiting delete confirmation

  const load = useCallback(async () => {
    setProjects(await getProjects())
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async (fields) => {
    const project = await createProject(fields)
    setShowCreate(false)
    await load()
    onOpen?.(project.id)
  }

  const handleDelete = async () => {
    const target = pendingDelete
    setPendingDelete(null)
    if (!target) return
    await deleteProject(target.id)
    await load()
  }

  const list = projects || []
  const filtered = filter === 'all' ? list : list.filter(p => p.status === filter)

  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 760, margin: '0 auto' }}>
      {onBack && (
        <div style={{ marginBottom: 8 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>← Home</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <div>
          <h2 style={{ ...V3.T.h1, margin: 0 }}>Projects</h2>
          <div style={{ ...V3.T.h1Sub, marginTop: 4 }}>Site engagement workspaces, one per building, property, or client site.</div>
        </div>
      </div>

      {/* Action row — AtmosFlow is project-centric: every engagement begins
          with a Project, so "New project" is the single primary (cyan) CTA.
          Assessment creation has moved into the project workspace; it is no
          longer offered globally here. "Report an incident" stays as a glass
          secondary for the off-workflow safety action. */}
      <div style={{ marginTop: 14, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <TactileButton
          variant="primary"
          size="sm"
          pill
          bubble
          haptic="success"
          onClick={() => setShowCreate(true)}
          icon={<I n="bldg" s={14} c="var(--on-accent-fill)" />}
        >
          New project
        </TactileButton>
        {onReportIncident && (
          <TactileButton
            variant="secondary"
            size="sm"
            pill
            bubble
            onClick={onReportIncident}
            icon={<I n="alert" s={14} c="var(--accent)" />}
            style={{ color: 'var(--accent)' }}
          >
            Report an incident
          </TactileButton>
        )}
      </div>

      {/* Status filter chips */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 14, WebkitOverflowScrolling: 'touch' }}>
        {['all', ...PROJECT_STATUSES].map(s => {
          const active = filter === s
          // Unified glass + cyan pill, matching the app's nav/segmented
          // pills (subtle neutral glass when idle, cyan-tinted glass + cyan
          // text + ring when active) rather than the old per-status tones.
          return (
            <button key={s} onClick={() => setFilter(s)} className="bubble-btn" aria-pressed={active} style={{
              flexShrink: 0, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12, fontWeight: 600, letterSpacing: '0.2px',
              color: active ? 'var(--accent)' : 'var(--sub)',
              ...FILTER_BUBBLE_BASE,
              ...(active
                ? {
                    '--bubble-bg': 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--accent) 8%, transparent))',
                    '--bubble-border': 'color-mix(in srgb, var(--accent) 36%, transparent)',
                    '--bubble-glow': 'rgba(57,192,217,0.34)',
                  }
                : {
                    '--bubble-bg': 'linear-gradient(180deg, color-mix(in srgb, var(--text) 9%, transparent), color-mix(in srgb, var(--text) 3%, transparent))',
                    '--bubble-border': 'color-mix(in srgb, var(--text) 12%, transparent)',
                  }),
            }}>
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </button>
          )
        })}
      </div>

      {projects === null ? (
        <div style={{ ...V3.T.bodyDim, textAlign: 'center', padding: '40px 0' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <GlassCard style={{ textAlign: 'center', padding: '36px 24px', ...(list.length === 0 ? { border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)' } : null) }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)' }}>
            <I n="bldg" s={24} c="var(--accent)" w={1.8} />
          </div>
          <div style={{ ...V3.T.h3, marginBottom: 6 }}>{list.length === 0 ? 'Start with a project' : 'No projects in this status'}</div>
          <div style={{ ...V3.T.bodyDim, maxWidth: 360, margin: '0 auto' }}>
            {list.length === 0
              ? 'Every engagement begins with a project. Create one to hold its assessments, logger data, sampling forms, findings, reports, and photos in one place.'
              : 'Try a different status filter, or create a new project.'}
          </div>
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>
            <TactileButton
              variant="primary"
              size="sm"
              pill
              bubble
              haptic="success"
              onClick={() => setShowCreate(true)}
              icon={<I n="bldg" s={14} c="var(--on-accent-fill)" />}
            >
              New project
            </TactileButton>
          </div>
        </GlassCard>
      ) : (
        <div style={sgStack('base')}>
          {filtered.map(p => <ProjectCard key={p.id} project={p} onOpen={onOpen} onRequestDelete={setPendingDelete} />)}
        </div>
      )}

      {showCreate && (
        <BottomSheet title="New project / site" tone="deep" onClose={() => setShowCreate(false)}>
          <ProjectForm submitLabel="Create project" onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
        </BottomSheet>
      )}

      {pendingDelete && (
        <BottomSheet title={`Delete ${pendingDelete.name || 'project'}?`} onClose={() => setPendingDelete(null)}>
          <div style={{ ...V3.T.bodyDim, marginBottom: 16 }}>This permanently removes the site workspace and all documents, photos, notes, and links stored in it. Linked assessments themselves are not deleted.</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <TactileButton variant="danger" size="lg" fullWidth haptic="heavy" onClick={handleDelete}>Delete project</TactileButton>
            <TactileButton variant="ghost" size="lg" onClick={() => setPendingDelete(null)}>Cancel</TactileButton>
          </div>
        </BottomSheet>
      )}
    </div>
  )
}
