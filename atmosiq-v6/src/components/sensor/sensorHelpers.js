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
