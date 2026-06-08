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
