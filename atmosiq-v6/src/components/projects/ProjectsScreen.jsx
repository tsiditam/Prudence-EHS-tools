/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ProjectsScreen — the Project / Site Folder index: one heading, a row
 * of text filters, and the projects as rows. Tapping a row opens the
 * ProjectDetail workspace.
 *
 * Restraint pass (2026-09): the screen used to explain itself under
 * the heading, box every project in a card with an icon-per-count
 * strip and a tinted status pill, and open on an icon-tile empty state
 * with two paragraphs. All of that is gone. Hierarchy comes from
 * weight and color; rows part with a hairline; the one accent on the
 * screen is the action.
 */

import { useState, useEffect, useCallback } from 'react'
import * as V3 from '../../styles/tokens'
import TactileButton from '../ui/TactileButton'
import StatusPill from '../ui/StatusPill'
import EmptyState from '../ui/EmptyState'
import { SkeletonRows } from '../ui/Skeleton'
import BottomSheet from '../ui/BottomSheet'
import { I } from '../Icons'
import { getProjects, createProject, deleteProject, PROJECT_STATUSES } from '../../utils/projectStore'
import ProjectForm from './ProjectForm'
import { STATUS_LABEL, STATUS_TONE, fmtDate } from './projectsTheme'
import AssessmentSegmentedPillNav from '../ui/AssessmentSegmentedPillNav'

const HAIRLINE = `1px solid ${V3.BORDER_SUBTLE}`

// The one count a row carries is assessments — the workspace is where
// its documents, photos and notes are inventoried. A project with none
// says nothing rather than "0 assessments".
function countsLine(project) {
  const n = (project.linkedReportIds || []).length
  return n > 0 ? `${n} assessment${n === 1 ? '' : 's'}` : ''
}

function ProjectRow({ project, first, onOpen, onRequestDelete }) {
  const meta = [project.client, project.siteType].filter(Boolean).join(' · ')
  const counts = countsLine(project)
  const status = STATUS_LABEL[project.status] || project.status
  // Stop propagation so the destructive control never triggers the row's
  // open-on-tap; the actual delete still goes through the confirm sheet.
  const requestDelete = (e) => { e.stopPropagation(); onRequestDelete(project) }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(project.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(project.id) } }}
      // The row carries its state at a glance — a status dot, the name, one
      // caption line (client · type · assessments · updated), a status pill
      // — in fixed columns so a list scans vertically.
      style={{ display: 'grid', gridTemplateColumns: '8px minmax(0, 1fr) auto', alignItems: 'center', columnGap: 12, padding: '13px 0', borderTop: first ? 'none' : HAIRLINE, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: STATUS_TONE[project.status] || V3.STATUS.draft, justifySelf: 'center' }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ ...V3.T.h3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</div>
        <div style={{ ...V3.T.captionDim, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[meta, counts, `Updated ${fmtDate(project.updatedAt)}`].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {/* Follow-up is the one status that asks for something, so it keeps
            its full tone; the rest sit dim. */}
        <StatusPill tone={STATUS_TONE[project.status] || V3.STATUS.draft} dim={project.status !== 'follow-up'}>{status}</StatusPill>
        <button
          type="button"
          onClick={requestDelete}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Delete ${project.name || 'project'}`}
          title="Delete project"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, marginRight: -10, border: 'none', background: 'transparent', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
        >
          <I n="trash" s={15} c={V3.TEXT_TERTIARY} w={1.8} />
        </button>
      </div>
    </div>
  )
}

export default function ProjectsScreen({ onBack, onOpen, onReportIncident, onTryDemo }) {
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

  // One action, two places it can live. In the list header it is the
  // small pill beside the heading; in the empty state it is the only
  // thing to tap, so it takes the full-size pill with room around the
  // label (48px tall, the tap-target floor on a phone).
  const newProjectButton = (
    <TactileButton
      variant="neutral"
      pill
      haptic="success"
      onClick={() => setShowCreate(true)}
      // Grok's capsule, measured: 37pt tall, a 17pt semibold label, ~22pt
      // of side padding. The same in both placements.
      style={{ height: 37, minHeight: 37, padding: '0 22px', fontSize: 17, letterSpacing: 0 }}
    >
      New project
    </TactileButton>
  )

  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 760, margin: '0 auto' }}>
      {onBack && (
        <div style={{ marginBottom: 8 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: V3.TEXT_PRIMARY, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>‹ Home</button>
        </div>
      )}

      {/* Heading and the one action. No subtitle: the list is the
          explanation. On a first run the action lives in the empty state
          instead, so it is never on the screen twice — and the heading
          goes with it: with nothing to head, a title in the top-left
          corner only pulled the eye off the centered group below. The
          empty state names the screen itself. */}
      {(projects === null || list.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
          <h2 style={{ ...V3.T.h1, margin: 0 }}>Projects</h2>
          {list.length > 0 && newProjectButton}
        </div>
      )}

      {/* Status filters as text tabs — the active one in the primary ink
          with a rule beneath it that glides between tabs. The same strip
          the result screen and Logger Studio use, so the three move the
          same way; it scrolls past the frame on a narrow phone and fades
          on whichever side still has tabs. */}
      {list.length > 0 && (
        <AssessmentSegmentedPillNav
          ariaLabel="Filter by status"
          tabs={['all', ...PROJECT_STATUSES].map((s) => ({ id: s, label: s === 'all' ? 'All' : STATUS_LABEL[s] }))}
          active={filter}
          onChange={setFilter}
          style={{ marginBottom: 4 }}
        />
      )}

      {projects === null ? (
        // The list's own shape while it loads, never a "Loading…" word.
        <SkeletonRows rows={4} label="Loading projects" />
      ) : list.length === 0 ? (
        // First run: a ghost of the list above the outcome, one action (the
        // same pill the populated screen shows) and, where the app has a
        // sample building, one quiet link to it. Centered in the open page
        // — the min-height subtracts the chrome above and the dock below.
        <EmptyState
          title="Start with a project"
          body="A project keeps a site's assessments, documents and photos together, with its history in one place."
          action={newProjectButton}
          secondary={onTryDemo ? { label: 'Try a sample building', onClick: onTryDemo } : undefined}
          minHeight={`calc(${V3.FULL_VH} - 250px)`}
        />
      ) : filtered.length === 0 ? (
        // A filter with nothing in it: the layout is already on screen, so
        // no ghost — the fact and the way back.
        <EmptyState
          preview={null}
          title={`No ${filter === 'all' ? '' : STATUS_LABEL[filter].toLowerCase() + ' '}projects`}
          secondary={{ label: 'Show all', onClick: () => setFilter('all') }}
          minHeight={`calc(${V3.FULL_VH} - 300px)`}
        />
      ) : (
        <div>
          {filtered.map((p, i) => <ProjectRow key={p.id} project={p} first={i === 0} onOpen={onOpen} onRequestDelete={setPendingDelete} />)}
          <div style={{ borderTop: HAIRLINE }} />
        </div>
      )}

      {/* Off-workflow safety action, kept one tap away without competing
          with the screen's one CTA. */}
      {onReportIncident && list.length > 0 && (
        <button type="button" onClick={onReportIncident} style={{ display: 'block', marginTop: 20, background: 'transparent', border: 'none', padding: 0, ...V3.T.caption, color: V3.TEXT_SECONDARY, fontFamily: 'inherit', cursor: 'pointer' }}>
          Report an incident ›
        </button>
      )}

      {showCreate && (
        <BottomSheet title="New project" tone="deep" onClose={() => setShowCreate(false)}>
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
