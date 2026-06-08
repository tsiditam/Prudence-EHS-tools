/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * SendToReportSheet — push Logger Studio averages into a zone of an
 * in-progress report the user picks. Indoor means only; outdoor fields,
 * formaldehyde, and measurement metadata stay manual.
 */

import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import BottomSheet from '../ui/BottomSheet'
import TactileButton from '../ui/TactileButton'
import Select from '../ui/Select'
import STO from '../../utils/storage'
import { SENSOR_FIELDS } from '../../constants/questions'
import { SENSOR_PARAMS, sensorAveragesToFields } from '../../utils/sensorParser'
import { mix } from '../../utils/theme'
import { paramLabel } from './sensorHelpers'

const fieldUnit = (id) => SENSOR_FIELDS.find((f) => f.id === id)?.u || ''
const zoneTitle = (z, i) => (z && String(z.zn || '').trim()) || `Zone ${i + 1}`

const LBL = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--dim)', marginBottom: 8 }
const CHIP = { display: 'inline-flex', alignItems: 'baseline', gap: 5, padding: '4px 10px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-mono)' }
const SEL = { width: '100%', fontSize: 14, padding: '10px 12px' }

export default function SendToReportSheet({ sensorData, reports = [], currentReportId = null, currentZones = [], onApply, onClose }) {
  const { fields, details, skipped } = useMemo(
    () => sensorAveragesToFields(sensorData, { stat: 'mean', tvocRef: 'isobutylene' }),
    [sensorData]
  )
  const hasAverages = details.length > 0
  const fieldIds = Object.keys(fields)

  const initialReport = reports.find((r) => r.id === currentReportId)?.id || reports[0]?.id || ''
  const [reportId, setReportId] = useState(initialReport)
  const [zones, setZones] = useState([])
  const [loadingZones, setLoadingZones] = useState(false)
  const [zoneSel, setZoneSel] = useState('new') // zone index (string) or 'new'
  const [newZoneName, setNewZoneName] = useState('')
  const [mode, setMode] = useState('fillBlanks') // 'fillBlanks' | 'overwrite'
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  // Load the chosen report's zones — live state for the current draft,
  // otherwise read the persisted draft from storage.
  useEffect(() => {
    let cancelled = false
    if (!reportId) { setZones([]); return }
    if (reportId === currentReportId) { setZones(currentZones || []); return }
    setLoadingZones(true)
    STO.get(reportId).then((d) => {
      if (cancelled) return
      setZones((d && d.zones) || [])
      setLoadingZones(false)
    })
    return () => { cancelled = true }
  }, [reportId, currentReportId, currentZones])

  // Default to the first existing zone (or "new" when the report has none).
  useEffect(() => { setZoneSel(zones.length ? '0' : 'new') }, [reportId, zones.length])

  const targetZone = zoneSel !== 'new' ? zones[Number(zoneSel)] : null
  const occupied = targetZone ? fieldIds.filter((id) => String(targetZone[id] ?? '').trim() !== '') : []
  const hasConflict = occupied.length > 0
  const willWrite = zoneSel === 'new'
    ? fieldIds.length
    : fieldIds.filter((id) => mode === 'overwrite' || String(targetZone?.[id] ?? '').trim() === '').length

  const apply = async () => {
    if (!reportId || !hasAverages) return
    setBusy(true)
    const res = await onApply({
      reportId,
      zoneIndex: zoneSel === 'new' ? 'new' : Number(zoneSel),
      newZoneName,
      fields,
      mode: hasConflict ? mode : 'fillBlanks',
    })
    setBusy(false)
    if (res && res.ok) setResult(res)
    else onClose?.()
  }

  return (
    <BottomSheet open title="Send averages to a report" onClose={onClose}>
      {result ? (
        <div style={{ padding: '8px 0 4px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            ✓ Filled {result.written} reading{result.written === 1 ? '' : 's'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 16, lineHeight: 1.5 }}>
            {result.zoneName}{result.facility ? ` · ${result.facility}` : ''}. Open that report to review and complete the remaining fields manually.
          </div>
          <TactileButton variant="primary" fullWidth size="md" onClick={onClose}>Done</TactileButton>
        </div>
      ) : !hasAverages ? (
        <div style={{ padding: '8px 0 4px' }}>
          <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 16, lineHeight: 1.5 }}>
            No mappable averages in this log. Map your columns in Overview, then try again.
          </div>
          <TactileButton variant="secondary" fullWidth size="md" onClick={onClose}>Close</TactileButton>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
          {/* Preview of what will fill */}
          <div>
            <div style={LBL}>Will fill</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {details.map((d) => (
                <span key={d.field} style={CHIP}>
                  {paramLabel(d.param)} <strong style={{ fontWeight: 700 }}>{d.value}</strong> {fieldUnit(d.field)}{d.note ? ` ·${d.note}` : ''}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8, lineHeight: 1.5 }}>
              Indoor means from the logger. Outdoor readings, formaldehyde, and measurement metadata stay manual.
              {skipped.length > 0 && ' ' + skipped.map((s) => `${paramLabel(s.param)} skipped (${s.reason})`).join('; ') + '.'}
            </div>
          </div>

          {reports.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.5 }}>
              No in-progress reports yet. Start an assessment first, then send these averages into one of its zones.
            </div>
          ) : (
            <>
              <div>
                <div style={LBL}>Report</div>
                <Select value={reportId} onChange={(e) => setReportId(e.target.value)} style={SEL} aria-label="Choose report">
                  {reports.map((r) => (
                    <option key={r.id} value={r.id}>
                      {(r.facility || 'Untitled') + (r.ua ? ` · ${dayjs(r.ua).format('MMM D, HH:mm')}` : '')}{r.id === currentReportId ? ' (current)' : ''}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <div style={LBL}>Zone</div>
                <Select value={zoneSel} onChange={(e) => setZoneSel(e.target.value)} style={SEL} aria-label="Choose zone" disabled={loadingZones}>
                  {zones.map((z, i) => <option key={i} value={String(i)}>{zoneTitle(z, i)}</option>)}
                  <option value="new">➕ New zone…</option>
                </Select>
                {zoneSel === 'new' && (
                  <input
                    type="text" value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)}
                    placeholder="New zone name (optional)"
                    style={{ width: '100%', marginTop: 8, padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                  />
                )}
              </div>

              {hasConflict && (
                <div>
                  <div style={LBL}>{occupied.length} field{occupied.length === 1 ? '' : 's'} already filled</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[['fillBlanks', 'Fill blanks only'], ['overwrite', 'Overwrite']].map(([val, label]) => {
                      const sel = mode === val
                      return (
                        <button
                          key={val} type="button" onClick={() => setMode(val)}
                          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 40, background: sel ? mix('accent', 12) : 'var(--card)', border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`, color: sel ? 'var(--accent)' : 'var(--text)' }}
                        >{label}</button>
                      )
                    })}
                  </div>
                </div>
              )}

              <TactileButton variant="primary" fullWidth size="lg" disabled={busy || willWrite === 0} onClick={apply}>
                {busy ? 'Filling…' : willWrite === 0 ? 'Nothing to fill' : `Fill ${willWrite} reading${willWrite === 1 ? '' : 's'}`}
              </TactileButton>
            </>
          )}
        </div>
      )}
    </BottomSheet>
  )
}
