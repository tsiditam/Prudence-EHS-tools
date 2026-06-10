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
import { getProjects, createProject, PROJECT_STATUSES } from '../../utils/projectStore'
import ProjectForm from './ProjectForm'
import { STATUS_TONE, STATUS_LABEL, fmtDate } from './projectsTheme'

const DIM = V3.TEXT_MUTED

function CountChip({ icon, n, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: V3.TEXT_TERTIARY, fontSize: 12 }}>
      <I n={icon} s={13} c={V3.TEXT_TERTIARY} w={1.8} />
      <span style={{ ...V3.N.sm, color: V3.TEXT_SECONDARY }}>{n}</span>
      <span style={{ color: DIM }}>{label}</span>
    </span>
  )
}

function ProjectCard({ project, onOpen }) {
  const tone = STATUS_TONE[project.status] || V3.STATUS.draft
  const meta = [project.client, project.siteType].filter(Boolean).join(' · ')
  return (
    <GlassCard onClick={() => onOpen(project.id)} style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...V3.T.h3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</div>
          {meta && <div style={{ ...V3.T.captionDim, marginTop: 3 }}>{meta}</div>}
          {project.address && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
              <I n="location" s={12} c={DIM} w={1.8} />
              <span style={{ ...V3.T.caption, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.address}</span>
            </div>
          )}
        </div>
        <StatusPill tone={tone} dim>{STATUS_LABEL[project.status] || project.status}</StatusPill>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${V3.BORDER_SUBTLE}` }}>
        <CountChip icon="findings" n={(project.linkedReportIds || []).length} label="assess." />
        <CountChip icon="paperclip" n={(project.documents || []).length} label="docs" />
        <CountChip icon="image" n={(project.evidence || []).length} label="photos" />
        <CountChip icon="notes" n={(project.notes || []).length} label="notes" />
        <span style={{ marginLeft: 'auto', ...V3.T.caption, color: DIM }}>Updated {fmtDate(project.updatedAt)}</span>
      </div>
    </GlassCard>
  )
}

export default function ProjectsScreen({ onBack, onOpen }) {
  const [projects, setProjects] = useState(null)
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)

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

  const list = projects || []
  const filtered = filter === 'all' ? list : list.filter(p => p.status === filter)

  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 760, margin: '0 auto' }}>
      <div style={{ marginBottom: 8 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>← Home</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <div>
          <h2 style={{ ...V3.T.h1, margin: 0 }}>Projects</h2>
          <div style={{ ...V3.T.h1Sub, marginTop: 4 }}>Site engagement workspaces, one per building, property, or client site.</div>
        </div>
      </div>

      <div style={{ marginTop: 14, marginBottom: 16 }}>
        <TactileButton
          variant="primary"
          size="sm"
          pill
          onClick={() => setShowCreate(true)}
          icon={<I n="bldg" s={14} c="#FFFFFF" />}
          style={{ background: 'var(--success)', color: '#FFFFFF', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 1px 2px rgba(0,0,0,0.20)' }}
        >
          New project / site
        </TactileButton>
      </div>

      {/* Status filter chips */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 14, WebkitOverflowScrolling: 'touch' }}>
        {['all', ...PROJECT_STATUSES].map(s => {
          const active = filter === s
          // Unified glass + cyan pill, matching the app's nav/segmented
          // pills (subtle neutral glass when idle, cyan-tinted glass + cyan
          // text + ring when active) rather than the old per-status tones.
          return (
            <button key={s} onClick={() => setFilter(s)} style={{
              flexShrink: 0, padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12, fontWeight: 600, letterSpacing: '0.2px', border: 'none',
              background: active ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'color-mix(in srgb, var(--text) 8%, transparent)',
              boxShadow: active
                ? 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent), inset 0 1px 0 rgba(255,255,255,0.06)'
                : 'inset 0 1px 0 rgba(255,255,255,0.04)',
              color: active ? 'var(--accent)' : 'var(--sub)',
              WebkitTapHighlightColor: 'transparent',
            }}>
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </button>
          )
        })}
      </div>

      {projects === null ? (
        <div style={{ ...V3.T.bodyDim, textAlign: 'center', padding: '40px 0' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <GlassCard style={{ textAlign: 'center', padding: '36px 24px' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)' }}>
            <I n="bldg" s={24} c="var(--accent)" w={1.8} />
          </div>
          <div style={{ ...V3.T.h3, marginBottom: 6 }}>{list.length === 0 ? 'No projects yet' : 'No projects in this status'}</div>
          <div style={{ ...V3.T.bodyDim, maxWidth: 360, margin: '0 auto' }}>
            {list.length === 0
              ? 'Create a site workspace to keep assessments, documents, photos, and notes for one building in one place.'
              : 'Try a different status filter, or create a new project.'}
          </div>
        </GlassCard>
      ) : (
        <div style={sgStack('base')}>
          {filtered.map(p => <ProjectCard key={p.id} project={p} onOpen={onOpen} />)}
        </div>
      )}

      {showCreate && (
        <BottomSheet title="New project / site" onClose={() => setShowCreate(false)}>
          <ProjectForm submitLabel="Create project" onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
        </BottomSheet>
      )}
    </div>
  )
}
