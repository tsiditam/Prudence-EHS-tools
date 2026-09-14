/**
 * Shared Logger Studio helpers. `paramLabel` and `fmtRange` were defined
 * byte-identically across SensorCharts, LoggerGraphsTab, SensorDataPage,
 * and SendToReportSheet; this is the single canonical copy.
 *
 * (The resolved-palette selector `currentPalette` lives in SensorCharts,
 * which owns the LIGHT_PALETTE / DARK_PALETTE definitions.)
 */
import dayjs from 'dayjs'
import { SENSOR_PARAMS } from '../../utils/sensorParser'

export const paramLabel = (k) => SENSOR_PARAMS.find((p) => p.key === k)?.label || k

export const fmtRange = (s, e) => (s && e ? `${dayjs(s).format('MMM D, HH:mm')} – ${dayjs(e).format('MMM D, HH:mm')}` : 'Row order (no timestamps)')

/**
 * Which Analysis chart a forensic navigation request lands on.
 *
 * Pure, so the choice is testable without a page: the request carries the
 * pattern's parameters and datasets, the page supplies the chart tabs it can
 * actually show and the datasets it holds. In order of relevance:
 *   1. a pattern on a zone dataset → the zone-comparison overlay, on that
 *      parameter, because the point of the pattern is what the other zones
 *      did (or did not do) at the same time;
 *   2. an indoor/outdoor CO₂ pattern → the differential chart, where both
 *      traces already share one axis;
 *   3. a two-parameter pattern (a coincidence) → the multi-parameter chart
 *      with exactly those parameters selected;
 *   4. otherwise the parameter's own timeline; failing that, the first tab.
 *
 * @param {{params?:string[], datasetIds?:string[]}} req
 * @param {{chartTabs?:Array<{key:string,kind:string,def?:object}>, datasets?:object[]}} ctx
 * @returns {{key:string, zoneParam?:string|null, multiParams?:string[]}|null}
 */
export function chartForNavigation(req, ctx = {}) {
  const tabs = Array.isArray(ctx.chartTabs) ? ctx.chartTabs : []
  if (!tabs.length || !req || typeof req !== 'object') return null
  const params = Array.isArray(req.params) ? req.params.filter((p) => typeof p === 'string') : []
  const dsIds = Array.isArray(req.datasetIds) ? req.datasetIds : []
  const datasets = Array.isArray(ctx.datasets) ? ctx.datasets : []
  const has = (key) => tabs.some((t) => t.key === key)
  const roles = dsIds.map((id) => ((datasets.find((d) => d && d.id === id) || {}).role))
  if (has('zones') && roles.includes('zone')) return { key: 'zones', zoneParam: params[0] || null }
  if (has('co2-diff') && params.includes('co2') && roles.includes('outdoor')) return { key: 'co2-diff' }
  if (params.length >= 2 && has('multi')) return { key: 'multi', multiParams: params.slice(0, 3) }
  const own = tabs.find((t) => t.kind === 'graph' && t.def && typeof t.def.needs === 'function' && params.some((p) => t.def.needs([p])))
  return { key: own ? own.key : tabs[0].key }
}

/**
 * Dataset roles that may be associated with a walkthrough zone.
 *
 * Duplicated from the integrity layer's `LINKABLE_ROLES` on purpose, and
 * pinned to it by test. Logger Studio runs standalone — no assessment, no
 * zones, no investigation — so the page that offers the association must not
 * import the engine that consumes it, or a logger-only session would carry
 * the investigation engine for a control it never shows.
 *
 * An outdoor baseline is absent because it is not a room in the building.
 */
export const ZONE_LINKABLE_ROLES = Object.freeze(['indoor', 'zone'])

/** The zone's display name, matching how every other Logger Studio surface names one. */
export const zoneTitleAt = (z, i) => (z && String(z.zn || '').trim()) || `Zone ${i + 1}`

/**
 * The zones a dataset may be associated with: those carrying a stable id.
 *
 * The id is the join key — a display name is not, because renaming a zone
 * must not move a logger to a different room. A zone without one cannot be
 * linked to safely, so it is not offered. An empty result is the standalone
 * case, and the caller renders no association control at all.
 */
export function linkableZones(zones) {
  return (Array.isArray(zones) ? zones : [])
    .map((z, i) => ({ zid: z && typeof z.zid === 'string' ? z.zid.trim() : '', name: zoneTitleAt(z, i) }))
    .filter((z) => z.zid)
}
