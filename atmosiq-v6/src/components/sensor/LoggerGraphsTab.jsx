/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * LoggerGraphsTab — read-only results-screen view of the logger timelines
 * the assessor flagged "Include in report" in Logger Studio. Re-renders the
 * live SensorCharts from the persisted dataset (not the captured PNG) so the
 * tab is interactive, but shows the same graphs that ship in the DOCX.
 *
 * Screening / documentation only — the timelines mirror Logger Studio: no
 * advisory reference lines, and interpretation belongs to a qualified IAQ
 * professional.
 */

import * as V3 from '../../styles/tokens'
import GlassCard from '../ui/GlassCard'
import dayjs from 'dayjs'
import { SENSOR_PARAMS } from '../../utils/sensorParser'
import { GRAPH_DEFS, MultiParameterChart, DARK_PALETTE, LIGHT_PALETTE } from './SensorCharts'

// Charts pass resolved hex (Recharts emits SVG attributes where var() won't
// resolve), so pick the palette from the live theme — same as Logger Studio.
const currentPalette = () => (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light' ? LIGHT_PALETTE : DARK_PALETTE)

const fmtRange = (s, e) => (s && e ? `${dayjs(s).format('MMM D, HH:mm')} – ${dayjs(e).format('MMM D, HH:mm')}` : 'Row order (no timestamps)')
const paramLabel = (k) => SENSOR_PARAMS.find((p) => p.key === k)?.label || k

const CARD = 'var(--card)', BORDER = 'var(--border)'

export default function LoggerGraphsTab({ sensorData }) {
  const sd = sensorData || null
  if (!sd || !sd.graphs || !Array.isArray(sd.points) || !sd.points.length) {
    return (
      <GlassCard style={{ textAlign: 'center', padding: '28px 20px' }}>
        <div style={V3.T.bodyDim}>No logger graphs were included for this report.</div>
      </GlassCard>
    )
  }

  const pal = currentPalette()
  const range = fmtRange(sd.summary?.start, sd.summary?.end)

  // The single-parameter / dual-axis timelines flagged for the report.
  const included = GRAPH_DEFS
    .filter((g) => g.needs(sd.params || []) && sd.graphs?.[g.id]?.include)
    .map((g) => ({ id: g.id, title: g.title, series: g.series, Chart: g.Chart, chartProps: {} }))

  // The multi-parameter comparison is stored separately under id 'multi'.
  const multi = sd.graphs?.multi
  if (multi?.include) {
    const params = (multi.params && multi.params.length) ? multi.params : (sd.params || []).slice(0, 3)
    included.push({
      id: 'multi',
      title: 'Multi-Parameter Comparison',
      series: params.map(paramLabel),
      Chart: MultiParameterChart,
      chartProps: { params },
    })
  }

  if (!included.length) {
    return (
      <GlassCard style={{ textAlign: 'center', padding: '28px 20px' }}>
        <div style={V3.T.bodyDim}>No logger graphs were included for this report.</div>
      </GlassCard>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {included.map(({ id, title, series, Chart, chartProps }) => {
        const caption = sd.graphs?.[id]?.caption
        return (
          <GlassCard key={id} style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px 8px' }}>
              <div style={V3.T.bodyStrong}>{title}</div>
              <div style={{ ...V3.T.captionDim, marginTop: 2 }}>
                {range}{series && series.length > 1 ? ` · ${series.join(' / ')}` : ''}
              </div>
            </div>
            <div style={{ padding: '4px 8px 12px', background: CARD }}>
              <Chart data={sd.points} hasTs={sd.hasTimestamps} units={sd.units} palette={pal} {...chartProps} />
            </div>
            {caption && (
              <div style={{ ...V3.T.captionDim, padding: '0 18px 14px', lineHeight: 1.5 }}>{caption}</div>
            )}
          </GlassCard>
        )
      })}
      <div style={{ ...V3.T.captionDim, padding: '2px 4px', lineHeight: 1.5, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
        Graphs are provided for screening and documentation purposes. Interpretation should be reviewed by a qualified IAQ professional. AtmosFlow does not make compliance determinations.
      </div>
    </div>
  )
}
