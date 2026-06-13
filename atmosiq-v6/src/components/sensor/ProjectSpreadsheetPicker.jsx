/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ProjectSpreadsheetPicker — choose a CSV/XLSX already stored in a project's
 * Documents to load into Logger Studio (no re-upload). Two-step bottom sheet:
 * pick a project (those holding ≥1 spreadsheet), then pick the file. Selection
 * hands the raw document back to the caller, which decodes + parses it through
 * the same pipeline as a file upload.
 *
 * Read-only over projectStore; renders nothing it doesn't own.
 */
import { useEffect, useMemo, useState } from 'react'
import * as V3 from '../../styles/tokens'
import { I } from '../Icons'
import BottomSheet from '../ui/BottomSheet'
import GhostButton from '../ui/GhostButton'
import { getProjects } from '../../utils/projectStore'
import { isSpreadsheetDoc, fileIcon, fmtBytes, fmtDate } from '../projects/projectsTheme'

const rowBtn = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
  padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
}

export default function ProjectSpreadsheetPicker({ currentProjectId = null, onPick, onClose }) {
  const [projects, setProjects] = useState(null) // null = loading
  const [selId, setSelId] = useState(currentProjectId)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const all = await getProjects().catch(() => [])
      if (!alive) return
      const withSheets = (all || [])
        .map((p) => ({ id: p.id, name: p.name, sheets: (p.documents || []).filter(isSpreadsheetDoc) }))
        .filter((p) => p.sheets.length > 0)
      setProjects(withSheets)
      if (currentProjectId && withSheets.some((p) => p.id === currentProjectId)) setSelId(currentProjectId)
      else if (withSheets.length === 1) setSelId(withSheets[0].id)
    })()
    return () => { alive = false }
  }, [currentProjectId])

  const selected = useMemo(() => (projects || []).find((p) => p.id === selId) || null, [projects, selId])

  return (
    <BottomSheet title="Load from project" onClose={onClose} ariaLabel="Load spreadsheet from project">
      {projects === null && <div style={{ ...V3.T.bodyDim, padding: '12px 0' }}>Loading projects…</div>}

      {projects && projects.length === 0 && (
        <div style={{ ...V3.T.bodyDim, padding: '12px 0', lineHeight: 1.5 }}>
          No projects with spreadsheet files yet. Upload a CSV or XLSX to a project&apos;s Documents tab first, then it will appear here.
        </div>
      )}

      {projects && projects.length > 0 && !selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ ...V3.T.captionDim, marginBottom: 2 }}>Choose a project</div>
          {projects.map((p) => (
            <button key={p.id} type="button" onClick={() => setSelId(p.id)} style={rowBtn}>
              <I n="bldg" s={16} c="var(--accent)" w={1.8} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ ...V3.T.body, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || 'Untitled site'}</div>
                <div style={V3.T.captionDim}>{p.sheets.length} spreadsheet{p.sheets.length === 1 ? '' : 's'}</div>
              </div>
              <span aria-hidden="true" style={{ color: 'var(--dim)', fontSize: 16 }}>›</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            {projects.length > 1 && (
              <GhostButton onClick={() => setSelId(null)} style={{ padding: '4px 8px', minHeight: 28 }}>‹ Projects</GhostButton>
            )}
            <div style={V3.T.captionDim}>{selected.name || 'Untitled site'} · spreadsheets</div>
          </div>
          {selected.sheets.map((d) => (
            <button key={d.id} type="button" onClick={() => onPick(d)} style={rowBtn}>
              <I n={fileIcon(d.type, d.name)} s={16} c="var(--accent)" w={1.8} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ ...V3.T.body, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                <div style={V3.T.captionDim}>{fmtBytes(d.size)}{d.category ? ` · ${d.category}` : ''} · {fmtDate(d.uploadedAt)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  )
}
