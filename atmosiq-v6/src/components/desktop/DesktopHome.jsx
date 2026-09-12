/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * DesktopHome — the desktop landing (>= 1024px): the state of the work.
 *
 * The phone lands on Projects, which on a 1440px window put an icon and two
 * words in the middle of an empty plane: "here are the places you can go".
 * A professional workspace opens on "here is the state of your work" — a
 * greeting, the counts, the one thing that needs attention, recent projects
 * and recent activity — the way Linear, Notion and every mature SaaS
 * dashboard open. Nothing here is a new data source: it reads the report /
 * draft index the Reports screen reads, the project store the Projects
 * screen reads, and (for the census line) the active draft's own body.
 *
 * Pure helpers (greeting, relativeTime, buildActivity, censusOf) are
 * exported for the unit tests; the component is desktop-only by
 * construction — MobileApp mounts it behind isDesktop.
 */
import { useEffect, useState } from 'react'
import * as V3 from '../../styles/tokens'
import { I } from '../Icons'
import TactileButton from '../ui/TactileButton'
import StatusPill from '../ui/StatusPill'
import { STATUS_LABEL, STATUS_TONE } from '../projects/projectsTheme'
import { formatDate } from '../../utils/formatDate'

const HAIRLINE = `1px solid ${V3.BORDER_SUBTLE}`

// Zone measurement fields (src/constants/questions.js Q_ZONE): a reading is
// any of these with a numeric value. Kept as a list here rather than read
// off the question registry so the count is stable across question copy.
const READING_FIELDS = ['co2', 'co2o', 'tf', 'tfo', 'rh', 'rho', 'pm', 'pmo', 'co', 'tv', 'tvo', 'hc']
// Observation fields — checkbox / select answers about the space itself.
const OBSERVATION_FIELDS = ['vd', 'wd', 'wl', 'mi', 'op', 'ot', 'hp', 'ac', 'cc', 'tc', 'src_adjacent', 'src_internal', 'path_pressure', 'path_crosstalk']

export function greeting(now = new Date(), name = '') {
  const h = now.getHours()
  const part = h < 5 ? 'evening' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  const first = (name || '').trim().split(/\s+/)[0]
  return first ? `Good ${part}, ${first}` : `Good ${part}`
}

export function relativeTime(ts, now = Date.now()) {
  const t = typeof ts === 'number' ? ts : Date.parse(ts)
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return 'now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d`
  return formatDate(t)
}

/** Zones / readings / observations in a draft body, for the census line. */
export function censusOf(body) {
  const zones = Array.isArray(body?.zones) ? body.zones : []
  let readings = 0
  let observations = 0
  for (const z of zones) {
    for (const k of READING_FIELDS) {
      const v = z?.[k]
      if (v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))) readings += 1
    }
    for (const k of OBSERVATION_FIELDS) {
      const v = z?.[k]
      if (v === true || (typeof v === 'string' && v.trim() !== '' && v !== 'no' && v !== 'none')) observations += 1
    }
  }
  return { zones: zones.length, readings, observations }
}

/** Merge drafts, reports and project activity into one recency-sorted feed. */
export function buildActivity({ drafts = [], reports = [], projects = [] } = {}, limit = 6) {
  const rows = []
  for (const d of drafts) {
    const ts = Date.parse(d.ua || d.ts || '')
    if (Number.isFinite(ts)) rows.push({ id: `d-${d.id}`, ts, text: 'Draft updated', subject: d.facility || 'Untitled assessment', kind: 'draft', ref: d })
  }
  for (const r of reports) {
    const ts = typeof r.ts === 'number' ? r.ts : Date.parse(r.ts || '')
    if (Number.isFinite(ts)) rows.push({ id: `r-${r.id}`, ts, text: 'Report finalized', subject: r.facility || 'Untitled report', kind: 'report', ref: r })
  }
  for (const p of projects) {
    for (const a of (p.activity || []).slice(0, 3)) {
      const ts = Date.parse(a.ts || '')
      if (Number.isFinite(ts)) rows.push({ id: `p-${a.id}`, ts, text: a.text, subject: p.name, kind: 'project', ref: p })
    }
  }
  rows.sort((a, b) => b.ts - a.ts)
  return rows.slice(0, limit)
}

function Stat({ value, label, first }) {
  return (
    <div style={{ padding: first ? '0 24px 0 0' : '0 24px', borderLeft: first ? 'none' : HAIRLINE, minWidth: 0 }}>
      <div style={{ ...V3.N.lg, fontSize: 28, lineHeight: '32px' }}>{value}</div>
      <div style={{ ...V3.T.caption, marginTop: 4 }}>{label}</div>
    </div>
  )
}

function SectionHead({ children, action, onAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
      <div style={V3.T.h2}>{children}</div>
      {action && (
        <button type="button" onClick={onAction} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', ...V3.T.caption, color: V3.TEXT_SECONDARY }}>
          {action} <span aria-hidden="true">›</span>
        </button>
      )}
    </div>
  )
}

const linkBtn = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--text)' }

export default function DesktopHome({
  profile,
  index,
  projects = [],
  loadDraft,
  onNewInvestigation,
  onResumeDraft,
  onOpenReport,
  onOpenProject,
  onOpenProjects,
  onOpenReports,
}) {
  const drafts = index?.drafts || []
  const reports = index?.reports || []
  const activeDraft = drafts[0] || null
  const attentionReports = reports.filter((r) => (r.attention || 0) > 0)
  const attentionReport = !activeDraft ? attentionReports[0] || null : null

  // Census of the active draft — zones / readings / observations — read
  // from its stored body once. Absent until it loads; the card renders the
  // line only when there is something to say.
  const [census, setCensus] = useState(null)
  useEffect(() => {
    let alive = true
    setCensus(null)
    if (!activeDraft || typeof loadDraft !== 'function') return undefined
    Promise.resolve(loadDraft(activeDraft.id)).then((body) => { if (alive && body) setCensus(censusOf(body)) }).catch(() => {})
    return () => { alive = false }
  }, [activeDraft?.id, loadDraft]) // eslint-disable-line react-hooks/exhaustive-deps

  const activity = buildActivity({ drafts, reports, projects })
  const recentProjects = projects.slice(0, 5)
  const now = new Date()

  return (
    <div style={{ paddingTop: 28, paddingBottom: 80, maxWidth: 1040 }}>
      {/* Greeting + the one primary action. The only filled control on the
          page — where the brand cyan is allowed to appear. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 28 }}>
        <div>
          <div style={V3.T.h1}>{greeting(now, profile?.name)}</div>
          <div style={{ ...V3.T.bodyDim, marginTop: 4 }}>{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
        <TactileButton variant="primary" size="sm" icon={<I n="plus" s={16} c="currentColor" w={2.2} />} onClick={onNewInvestigation}>New investigation</TactileButton>
      </div>

      {/* Your investigations — four counts, hairline-separated, no boxes. */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ ...V3.T.micro, marginBottom: 12 }}>Your investigations</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', maxWidth: 760 }}>
          <Stat first value={drafts.length} label={drafts.length === 1 ? 'Active investigation' : 'Active investigations'} />
          <Stat value={reports.length} label={reports.length === 1 ? 'Report issued' : 'Reports issued'} />
          <Stat value={attentionReports.length} label="Needing attention" />
          <Stat value={projects.length} label={projects.length === 1 ? 'Project' : 'Projects'} />
        </div>
      </div>

      {/* Needs attention — one card, the thing to do next. */}
      <div style={{ marginBottom: 32 }}>
        <SectionHead>Needs attention</SectionHead>
        {activeDraft ? (
          <div style={{ ...V3.panel(), padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: V3.STATUS.inProgress, marginTop: 8, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={V3.T.h2}>{activeDraft.facility || 'Untitled assessment'}</div>
                <div style={{ ...V3.T.captionDim, marginTop: 2 }}>IAQ investigation · last touched {relativeTime(activeDraft.ua || activeDraft.ts)} ago</div>
                <div style={{ ...V3.T.body, marginTop: 14 }}>Walkthrough in progress</div>
                {census && (
                  <div style={{ ...V3.T.captionDim, marginTop: 4 }}>
                    {census.zones} {census.zones === 1 ? 'zone' : 'zones'} · {census.readings} {census.readings === 1 ? 'reading' : 'readings'} · {census.observations} {census.observations === 1 ? 'observation' : 'observations'}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => onResumeDraft?.(activeDraft.id)} style={{ ...linkBtn, alignSelf: 'flex-end', flexShrink: 0 }}>Continue investigation <span aria-hidden="true">→</span></button>
            </div>
          </div>
        ) : attentionReport ? (
          <div style={{ ...V3.panel(), padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: V3.SEVERITY[attentionReport.worstSeverity] || V3.SEVERITY.medium, marginTop: 8, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={V3.T.h2}>{attentionReport.facility || 'Untitled report'}</div>
                <div style={{ ...V3.T.captionDim, marginTop: 2 }}>Report issued {formatDate(attentionReport.ts)}</div>
                <div style={{ ...V3.T.body, marginTop: 14 }}>{attentionReport.attention} {attentionReport.attention === 1 ? 'finding needs' : 'findings need'} attention</div>
              </div>
              <button type="button" onClick={() => onOpenReport?.(attentionReport)} style={{ ...linkBtn, alignSelf: 'flex-end', flexShrink: 0 }}>Review findings <span aria-hidden="true">→</span></button>
            </div>
          </div>
        ) : (
          <div style={{ ...V3.panel(), padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={V3.T.h2}>Nothing open</div>
              <div style={{ ...V3.T.bodyDim, marginTop: 4 }}>Start a walkthrough and AtmosFlow organizes the readings, observations and photos into a report.</div>
            </div>
            <TactileButton variant="secondary" size="sm" onClick={onNewInvestigation}>New investigation</TactileButton>
          </div>
        )}
      </div>

      {/* Two columns: recent projects (or recent work) and recent activity. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 40 }}>
        <div>
          {recentProjects.length > 0 ? (
            <>
              <SectionHead action="View all" onAction={onOpenProjects}>Recent projects</SectionHead>
              <div>
                {recentProjects.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    className="af-home-row"
                    onClick={() => onOpenProject?.(p.id)}
                    style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px 92px', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '11px 6px', margin: '0 -6px', boxSizing: 'content-box', background: 'transparent', border: 'none', borderTop: i === 0 ? 'none' : HAIRLINE, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)', borderRadius: 6 }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ ...V3.T.body, fontWeight: 500, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={{ ...V3.T.captionDim, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[p.client, p.siteType].filter(Boolean).join(' · ') || 'IAQ'}</span>
                    </span>
                    <span style={{ ...V3.T.captionDim }}>{formatDate(p.updatedAt)}</span>
                    <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <StatusPill tone={STATUS_TONE[p.status] || V3.STATUS.draft} dim>{STATUS_LABEL[p.status] || p.status}</StatusPill>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <SectionHead action="View all" onAction={onOpenReports}>Recent work</SectionHead>
              {drafts.length === 0 && reports.length === 0 ? (
                <div style={{ ...V3.T.bodyDim, padding: '12px 0' }}>Your drafts and issued reports will appear here.</div>
              ) : (
                <div>
                  {[...drafts.slice(0, 3).map((d) => ({ ...d, kind: 'draft' })), ...reports.slice(0, 3).map((r) => ({ ...r, kind: 'report' }))].map((row, i) => (
                    <button
                      key={`${row.kind}-${row.id}`}
                      type="button"
                      className="af-home-row"
                      onClick={() => (row.kind === 'draft' ? onResumeDraft?.(row.id) : onOpenReport?.(row))}
                      style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px 92px', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '11px 6px', margin: '0 -6px', boxSizing: 'content-box', background: 'transparent', border: 'none', borderTop: i === 0 ? 'none' : HAIRLINE, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)', borderRadius: 6 }}>
                      <span style={{ ...V3.T.body, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.facility || 'Untitled'}</span>
                      <span style={V3.T.captionDim}>{formatDate(row.kind === 'draft' ? (row.ua || row.ts) : row.ts)}</span>
                      <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <StatusPill tone={row.kind === 'draft' ? V3.STATUS.inProgress : V3.STATUS.draft} dim>{row.kind === 'draft' ? 'In progress' : 'Issued'}</StatusPill>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <SectionHead>Recent activity</SectionHead>
          {activity.length === 0 ? (
            <div style={{ ...V3.T.bodyDim, padding: '12px 0' }}>Activity from your investigations will appear here.</div>
          ) : (
            <div>
              {activity.map((a, i) => (
                <div key={a.id} style={{ display: 'flex', gap: 14, padding: '9px 0', borderTop: i === 0 ? 'none' : HAIRLINE, alignItems: 'baseline' }}>
                  <span style={{ ...V3.T.captionDim, width: 40, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{relativeTime(a.ts, now.getTime())}</span>
                  <span style={{ ...V3.T.body, minWidth: 0, flex: 1 }}>
                    {a.text} <span style={{ color: V3.TEXT_TERTIARY }}>—</span> <span style={{ color: V3.TEXT_SECONDARY }}>{a.subject}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
