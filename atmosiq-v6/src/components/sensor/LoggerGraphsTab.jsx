/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * LoggerGraphsTab — read-only results-screen view of the logger timelines
 * the assessor flagged "Include in report" in Logger Studio. The standard
 * per-parameter timelines and the multi-parameter comparison are re-rendered
 * live from the primary dataset (interactive), honouring the same occupancy
 * shading and advisory reference-line toggles as Logger Studio. The
 * cross-dataset overlays (indoor/outdoor differential, zone comparison) are
 * derived in Logger Studio from aligned datasets, so the captured report
 * figure is shown for those rather than re-deriving that pipeline here.
 *
 * Screening / documentation only — interpretation belongs to a qualified IAQ
 * professional; the timelines never assert a compliance verdict.
 */

import * as V3 from '../../styles/tokens'
import GlassCard from '../ui/GlassCard'
import dayjs from 'dayjs'
import { SENSOR_PARAMS, normalizeSensorData, primaryDataset } from '../../utils/sensorParser'
import { GRAPH_DEFS, MultiParameterChart, DARK_PALETTE, LIGHT_PALETTE } from './SensorCharts'

// Charts pass resolved hex (Recharts emits SVG attributes where var() won't
// resolve), so pick the palette from the live theme — same as Logger Studio.
const currentPalette = () => (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light' ? LIGHT_PALETTE : DARK_PALETTE)

const fmtRange = (s, e) => (s && e ? `${dayjs(s).format('MMM D, HH:mm')} – ${dayjs(e).format('MMM D, HH:mm')}` : 'Row order (no timestamps)')
const paramLabel = (k) => SENSOR_PARAMS.find((p) => p.key === k)?.label || k

const CARD = 'var(--card)', BORDER = 'var(--border)'

function EmptyNote() {
  return (
    <GlassCard style={{ textAlign: 'center', padding: '28px 20px' }}>
      <div style={V3.T.bodyDim}>No logger graphs were included for this report.</div>
    </GlassCard>
  )
}

export default function LoggerGraphsTab({ sensorData }) {
  const env = normalizeSensorData(sensorData)
  if (!env || !env.graphs) return <EmptyNote />

  const ds = primaryDataset(env)
  const graphsState = env.graphs || {}
  const refs = env.thresholds || { co2: true }
  const occupancy = Array.isArray(env.occupancyWindows) ? env.occupancyWindows : []
  const pal = currentPalette()
  const range = fmtRange(ds?.summary?.start, ds?.summary?.end)
  const hasPoints = Array.isArray(ds?.points) && ds.points.length > 0

  const cards = []

  // Standard single-parameter timelines + the multi-parameter comparison are
  // re-rendered live from the primary dataset.
  if (hasPoints) {
    GRAPH_DEFS
      .filter((g) => g.needs(ds.params || []) && graphsState[g.id]?.include)
      .forEach((g) => {
        const Chart = g.Chart
        cards.push({
          id: g.id, title: g.title, series: g.series, caption: graphsState[g.id]?.caption,
          node: <Chart data={ds.points} hasTs={ds.hasTimestamps} units={ds.units} palette={pal} showRefs={!!refs[g.refKey]} occupancy={occupancy} />,
        })
      })

    if (graphsState.multi?.include) {
      const params = (graphsState.multi.params && graphsState.multi.params.length)
        ? graphsState.multi.params
        : (ds.params || []).slice(0, 3)
      cards.push({
        id: 'multi', title: 'Multi-Parameter Comparison', series: params.map(paramLabel), caption: graphsState.multi.caption,
        node: <MultiParameterChart data={ds.points} params={params} hasTs={ds.hasTimestamps} units={ds.units} palette={pal} occupancy={occupancy} />,
      })
    }
  }

  // Cross-dataset overlays (co2-diff, zones-*) — show the captured report
  // figure; re-deriving aligned datasets + ventilation here would duplicate
  // Logger Studio. Any included graph not handled above falls through here.
  const handled = new Set(cards.map((c) => c.id))
  Object.entries(graphsState).forEach(([id, s]) => {
    if (!s || !s.include || handled.has(id) || !s.imageDataUrl) return
    cards.push({
      id, title: s.title || 'Logger graph', series: s.series, caption: s.caption,
      node: <img src={s.imageDataUrl} alt={s.title || 'Logger graph'} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }} />,
    })
  })

  if (!cards.length) return <EmptyNote />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {cards.map(({ id, title, series, caption, node }) => (
        <GlassCard key={id} style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px 8px' }}>
            <div style={V3.T.bodyStrong}>{title}</div>
            <div style={{ ...V3.T.captionDim, marginTop: 2 }}>
              {range}{series && series.length > 1 ? ` · ${series.join(' / ')}` : ''}
            </div>
          </div>
          <div style={{ padding: '4px 8px 12px', background: CARD }}>{node}</div>
          {caption && (
            <div style={{ ...V3.T.captionDim, padding: '0 18px 14px', lineHeight: 1.5 }}>{caption}</div>
          )}
        </GlassCard>
      ))}
      <div style={{ ...V3.T.captionDim, padding: '12px 4px 2px', lineHeight: 1.5, borderTop: `1px solid ${BORDER}` }}>
        Graphs are provided for screening and documentation purposes. Interpretation should be reviewed by a qualified IAQ professional. AtmosFlow does not make compliance determinations.
      </div>
    </div>
  )
}
