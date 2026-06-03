/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Workspace UI primitives for the project-centered redesign. Built on the v3
 * design tokens (panel / pill / btnPrimary / R) so spacing, radius, and color
 * stay consistent with the rest of the app. Tap feedback comes from the shared
 * `.tap` / `.shim` CSS in MobileApp's global <style>.
 */

import { I } from './Icons'
import { panel, pill, btnPrimary, btnSecondary, R } from '../styles/tokens'
import { WORKFLOW_STEPS, statusMeta } from '../utils/projects'

const siteIcon = (t) => (t === 'Private Well' ? 'well' : t === 'School' || t === 'Childcare' ? 'bldg' : t === 'Healthcare' ? 'shield' : t === 'Municipal' || t === 'Industrial' ? 'pipe' : 'bldg')

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  const d = Math.floor(ms / 86400000)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d}d ago`
  if (d < 30) return `${Math.floor(d / 7)}w ago`
  return `${Math.floor(d / 30)}mo ago`
}

export function StatusChip({ status, pulse = true }) {
  const m = statusMeta(status)
  return (
    <span style={{ ...pill(m.tone), textTransform: 'none', fontWeight: 700, letterSpacing: '0.1px' }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: m.tone, animation: pulse ? 'chipPulse 2.2s ease-in-out infinite' : 'none' }} />
      {m.label}
    </span>
  )
}

export function ReferenceStandardChip({ label, icon, tone = 'var(--accent)' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: R.pill, fontSize: 11.5, color: 'var(--sub)', fontWeight: 500 }}>
      {icon && <I n={icon} s={13} c={tone} />}{label}
    </span>
  )
}

export function QuickActionCard({ icon, title, sub, tone = 'var(--accent)', onClick, primary }) {
  return (
    <button className="tap" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', padding: primary ? '18px' : '15px 16px', borderRadius: R.lg, cursor: 'pointer', fontFamily: 'inherit', background: primary ? 'var(--accent-fill)' : 'var(--card)', border: primary ? 'none' : '1px solid var(--border)' }}>
      <span style={{ width: primary ? 46 : 40, height: primary ? 46 : 40, flexShrink: 0, borderRadius: R.md, display: 'flex', alignItems: 'center', justifyContent: 'center', background: primary ? 'rgba(0,0,0,0.16)' : `${tone}14`, border: primary ? 'none' : `1px solid ${tone}25` }}>
        <I n={icon} s={primary ? 24 : 20} c={primary ? 'var(--on-accent-fill)' : tone} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: primary ? 16 : 14.5, fontWeight: 700, color: primary ? 'var(--on-accent-fill)' : 'var(--text)', letterSpacing: '-0.2px' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, marginTop: 2, color: primary ? 'rgba(0,0,0,0.62)' : 'var(--sub)' }}>{sub}</span>
      </span>
      <span style={{ flexShrink: 0, fontSize: 18, color: primary ? 'rgba(0,0,0,0.5)' : 'var(--dim)' }}>→</span>
    </button>
  )
}

export function WorkflowStepCard({ step, state, onClick }) {
  const done = state === 'done'
  const active = state === 'active'
  const tone = done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--dim)'
  return (
    <button className="tap" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', background: active ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, borderRadius: R.md, cursor: 'pointer', fontFamily: 'inherit' }}>
      <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${tone}1A`, border: `1px solid ${tone}40` }}>
        <I n={done ? 'check' : step.icon} s={14} c={tone} />
      </span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: active ? 700 : 500, color: active ? 'var(--text)' : done ? 'var(--sub)' : 'var(--dim)' }}>{step.label}</span>
      {(done || active) && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: tone }}>{done ? 'Done' : 'Next'}</span>}
    </button>
  )
}

export function ProjectCard({ project, expanded, onToggle, onStep, onDelete }) {
  const m = statusMeta(project.status)
  const stepState = (k) => (project.steps && project.steps[k]) || 'todo'
  const nextStep = WORKFLOW_STEPS.find((s) => stepState(s.key) !== 'done') || WORKFLOW_STEPS[WORKFLOW_STEPS.length - 1]
  return (
    <div style={{ ...panel({ dense: true }), padding: 0, overflow: 'hidden' }}>
      <button className="tap" onClick={onToggle} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '14px 16px', fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.2px' }}>{project.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 12, color: 'var(--sub)' }}>
              <I n={siteIcon(project.siteType)} s={12} c="var(--sub)" />{project.siteType}{project.location ? ` · ${project.location}` : ''}
            </div>
          </div>
          <span style={{ flexShrink: 0, fontSize: 18, lineHeight: 1, color: 'var(--dim)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .2s ease' }}>›</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <StatusChip status={project.status} pulse={!project.seed || project.status !== 'complete'} />
          <span style={{ fontSize: 11, color: 'var(--dim)' }}>{project.samples} sample{project.samples === 1 ? '' : 's'} · {timeAgo(project.updatedAt)}</span>
        </div>
      </button>
      {expanded && (
        <div style={{ padding: '0 16px 16px', animation: 'fadeIn .2s ease' }}>
          <button className="tap" onClick={() => onStep(nextStep.key, project.id)} style={{ ...btnPrimary, width: '100%', marginBottom: 12 }}>
            <I n="bolt" s={15} c="var(--on-accent-fill)" />{m.next}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {WORKFLOW_STEPS.map((s) => <WorkflowStepCard key={s.key} step={s} state={stepState(s.key)} onClick={() => onStep(s.key, project.id)} />)}
          </div>
          {onDelete && <button onClick={onDelete} style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Delete project</button>}
        </div>
      )}
    </div>
  )
}

export function RegulatoryAlertCard({ onDetails }) {
  const tone = 'var(--warn)'
  return (
    <div style={{ ...panel({}), borderTop: `2px solid ${tone}`, padding: '16px 18px' }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: R.md, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${tone}16`, border: `1px solid ${tone}30` }}><I n="alert" s={18} c={tone} w={2} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>PFAS Regulation Active</span>
            <span style={{ ...pill(tone), fontSize: 9 }}>NPDWR 2024</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.55, marginTop: 5 }}>EPA finalized MCLs for six PFAS compounds — PFOA/PFOS at 4 ppt. Compliance by 2031. HydroScan evaluates all six plus the Hazard Index.</div>
          <button className="tap" onClick={onDetails} style={{ ...btnSecondary, marginTop: 10, padding: '7px 14px', minHeight: 0, fontSize: 12.5 }}>View details</button>
        </div>
      </div>
    </div>
  )
}

export function MarlowFloatingButton({ onClick }) {
  return (
    <button aria-label="Ask Marlow" onClick={onClick} className="tap" style={{ position: 'fixed', right: 16, bottom: 'calc(74px + env(safe-area-inset-bottom,0px))', zIndex: 115, width: 56, height: 56, borderRadius: 18, border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)', background: 'var(--accent-fill)', boxShadow: '0 8px 24px rgba(119,178,88,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
      <I n="pulse" s={26} c="var(--on-accent-fill)" />
    </button>
  )
}

export function ProjectsSkeleton({ n = 3 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ ...panel({ dense: true }) }}>
          <div className="shim" style={{ width: '58%', height: 14, borderRadius: 6, marginBottom: 10 }} />
          <div className="shim" style={{ width: '40%', height: 10, borderRadius: 6, marginBottom: 14 }} />
          <div className="shim" style={{ width: 96, height: 18, borderRadius: 999 }} />
        </div>
      ))}
    </div>
  )
}
