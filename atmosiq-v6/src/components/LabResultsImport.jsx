/**
 * LabResultsImport — UI for attaching lab CSV results to an existing
 * assessment.
 *
 * Flow:
 *   1. File picker → user selects a CSV.
 *   2. Parser runs synchronously (pure JS, no network) and the
 *      component shows a preview table of detected rows.
 *   3. User picks the target assessment from a dropdown (their
 *      recent assessments listed via Storage.listAssessments).
 *   4. Save → writes assessment.labResults = { laboratory, importedAt,
 *      importedFromFilename, rows }, persists via Storage.saveAssessment.
 *   5. Confirmation toast.
 *
 * Storage shape (per Move 4a):
 *
 *   assessment.labResults = {
 *     laboratory: 'EMSL Analytical, Inc.' | null,
 *     importedAt: '2026-05-19T14:30:00.000Z',
 *     importedFromFilename: 'emsl-12345.csv',
 *     rows: [ { sampleId, sampleType, location, collectedAt,
 *               receivedAt, analyte, result, units, detectionLimit,
 *               analystNotes, extra }, ... ],
 *   }
 *
 * The DOCX renderer (sections-lab-results.js) consumes this and
 * emits Appendix G in the consultant report.
 */

import { useEffect, useRef, useState } from 'react'
import { parseLabResultsCsv } from '../utils/labResultsParser'
import Storage from '../utils/cloudStorage'

const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const ACCENT = 'var(--accent)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const DANGER = 'var(--danger)'
const SUCCESS = 'var(--success)'
const SURFACE = 'var(--surface)'

const PREVIEW_LIMIT = 8

export default function LabResultsImport({ onBack, onSaved }) {
  const fileRef = useRef(null)
  const [filename, setFilename] = useState('')
  const [parsed, setParsed] = useState(null)
  const [error, setError] = useState('')
  const [assessments, setAssessments] = useState([])
  const [targetId, setTargetId] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const list = await Storage.listAssessments()
        const sortedRecent = (list || []).slice().sort((a, b) => {
          const ta = new Date(b.ts || b.ua || 0).getTime()
          const tb = new Date(a.ts || a.ua || 0).getTime()
          return ta - tb
        })
        setAssessments(sortedRecent)
        if (sortedRecent.length > 0 && !targetId) setTargetId(sortedRecent[0].id)
      } catch (err) {
        console.warn('[lab-import] failed to list assessments', err)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFile = async (e) => {
    setError('')
    setSaved(false)
    setParsed(null)
    const file = e.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    try {
      const text = await file.text()
      const result = parseLabResultsCsv(text)
      setParsed(result)
      if (result.warnings.length > 0 && result.rows.length === 0) {
        setError(result.warnings.join(' '))
      }
    } catch (err) {
      console.error('[lab-import] parse failed', err)
      setError(err?.message || 'Could not read the CSV. Confirm the file is valid UTF-8 text.')
    } finally {
      // Reset the file input so the same file can be re-selected.
      if (e.target) e.target.value = ''
    }
  }

  const handleSave = async () => {
    if (!parsed || parsed.rows.length === 0 || !targetId) return
    setBusy(true)
    setError('')
    try {
      const assessment = await Storage.getAssessment(targetId)
      if (!assessment) {
        setError('Target assessment could not be loaded. It may have been deleted.')
        setBusy(false)
        return
      }
      const labResults = {
        laboratory: parsed.laboratory || null,
        importedAt: new Date().toISOString(),
        importedFromFilename: filename || null,
        rows: parsed.rows,
      }
      await Storage.saveAssessment({ ...assessment, labResults })
      setSaved(true)
      if (onSaved) onSaved({ assessmentId: targetId, rowCount: parsed.rows.length })
    } catch (err) {
      console.error('[lab-import] save failed', err)
      setError(err?.message || 'Could not save lab results to the assessment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 880, margin: '0 auto' }}>
      <div style={{ marginBottom: 8 }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', color: ACCENT,
            fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
          }}>← Sampling Forms</button>
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: 0, letterSpacing: '-0.3px' }}>
        Import Lab Results
      </h2>
      <div style={{ fontSize: 12, color: SUB, marginTop: 4, marginBottom: 20, lineHeight: 1.55 }}>
        Upload a CSV from your analytical lab (EMSL, EMLab P&amp;K, Eurofins, Aerotech, Pace, or any
        generic format). Auto-detected columns get mapped to the canonical fields the consultant
        DOCX renders as Appendix G. Unrecognised columns are preserved verbatim.
      </div>

      <input ref={fileRef} type="file" accept=".csv,text/csv,application/vnd.ms-excel" onChange={handleFile} style={{ display: 'none' }} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            padding: '10px 18px',
            background: 'var(--accent-fill)',
            border: 'none', borderRadius: 8,
            color: 'var(--on-accent-fill)',
            fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', minHeight: 40,
          }}>
          {filename ? 'Choose Different CSV…' : 'Choose CSV File…'}
        </button>
        {filename && (
          <div style={{ alignSelf: 'center', fontSize: 12, color: SUB }}>{filename}</div>
        )}
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: 14,
          background: `${DANGER}12`, border: `1px solid ${DANGER}30`,
          borderRadius: 8, color: DANGER, fontSize: 13,
        }}>{error}</div>
      )}

      {saved && (
        <div style={{
          padding: '10px 14px', marginBottom: 14,
          background: `${SUCCESS}12`, border: `1px solid ${SUCCESS}30`,
          borderRadius: 8, color: SUCCESS, fontSize: 13,
        }}>
          Saved. {parsed?.rows.length} row{parsed?.rows.length === 1 ? '' : 's'} attached to the selected assessment.
          Generate the consultant DOCX to see Appendix G — Laboratory Analytical Results.
        </div>
      )}

      {parsed && parsed.rows.length > 0 && (
        <div style={{
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: 16, marginBottom: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
            Preview · {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'} detected
          </div>
          {parsed.laboratory && (
            <div style={{ fontSize: 12, color: SUB, marginBottom: 8 }}>
              Detected laboratory: <strong style={{ color: TEXT }}>{parsed.laboratory}</strong>
            </div>
          )}
          {parsed.unmappedColumns.length > 0 && (
            <div style={{ fontSize: 11, color: DIM, marginBottom: 12, lineHeight: 1.55 }}>
              Unmapped columns (preserved verbatim, not shown in the report table):{' '}
              <em>{parsed.unmappedColumns.join(', ')}</em>
            </div>
          )}
          <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${BORDER}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: SURFACE }}>
                  {['Sample ID', 'Location', 'Collected', 'Analyte', 'Result', 'Units'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: SUB, fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
                  <tr key={i} style={{ borderBottom: i === parsed.rows.length - 1 ? 'none' : `1px solid ${BORDER}` }}>
                    <td style={{ padding: '6px 10px', color: TEXT }}>{r.sampleId || '—'}</td>
                    <td style={{ padding: '6px 10px', color: TEXT }}>{r.location || '—'}</td>
                    <td style={{ padding: '6px 10px', color: TEXT }}>{r.collectedAt || '—'}</td>
                    <td style={{ padding: '6px 10px', color: TEXT }}>{r.analyte || '—'}</td>
                    <td style={{ padding: '6px 10px', color: TEXT, fontFamily: 'var(--font-mono)' }}>{r.result || '—'}</td>
                    <td style={{ padding: '6px 10px', color: SUB }}>{r.units || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.rows.length > PREVIEW_LIMIT && (
            <div style={{ fontSize: 11, color: DIM, marginTop: 8 }}>
              Showing first {PREVIEW_LIMIT} of {parsed.rows.length} rows. All rows will be saved.
            </div>
          )}
        </div>
      )}

      {parsed && parsed.rows.length > 0 && (
        <div style={{
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
            Attach to assessment
          </div>
          {assessments.length === 0 ? (
            <div style={{ fontSize: 12, color: SUB }}>
              No assessments yet. Create an assessment first, then re-import.
            </div>
          ) : (
            <>
              <select
                value={targetId}
                onChange={e => { setTargetId(e.target.value); setSaved(false) }}
                style={{
                  width: '100%', padding: '10px 12px', marginBottom: 12,
                  background: 'var(--bg)', border: `1px solid ${BORDER}`, borderRadius: 8,
                  color: TEXT, fontSize: 13, fontFamily: 'inherit', appearance: 'auto',
                }}>
                {assessments.map(a => {
                  const label = `${a.facility || 'Untitled'} · ${a.ts ? new Date(a.ts).toLocaleDateString() : (a.ua ? new Date(a.ua).toLocaleDateString() : 'draft')}`
                  return <option key={a.id} value={a.id}>{label}</option>
                })}
              </select>
              <button
                onClick={handleSave}
                disabled={busy || !targetId}
                style={{
                  padding: '10px 18px',
                  background: 'var(--accent-fill)',
                  border: 'none', borderRadius: 8,
                  color: 'var(--on-accent-fill)',
                  fontSize: 13, fontWeight: 700,
                  cursor: busy ? 'wait' : 'pointer',
                  fontFamily: 'inherit', minHeight: 40,
                  opacity: busy ? 0.7 : 1,
                }}>
                {busy ? 'Saving…' : `Attach ${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'} to assessment`}
              </button>
            </>
          )}
        </div>
      )}

      {!parsed && !error && (
        <div style={{ marginTop: 20, fontSize: 11, color: DIM, lineHeight: 1.6 }}>
          The parser recognises common column names (Sample ID, Location, Date Collected, Analyte,
          Result, Units, Detection Limit, Notes). If your CSV uses different headers and rows
          come back blank, contact support — we can add a profile for your lab.
        </div>
      )}
    </div>
  )
}
