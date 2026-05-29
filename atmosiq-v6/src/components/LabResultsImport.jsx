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
import { parseLabResultsCsv, getCanonicalFields } from '../utils/labResultsParser'
import { listTemplates, saveTemplate, findTemplateForLab, deleteTemplate } from '../utils/labCsvTemplates'
import Storage from '../utils/cloudStorage'
import { emitEvent } from '../../lib/events/emit'

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

// Friendly labels for the canonical-field dropdown. Maps the internal
// schema field names to wording an IH would recognize.
const CANONICAL_LABELS = {
  sampleId: 'Sample ID',
  sampleType: 'Sample type / media',
  location: 'Location',
  collectedAt: 'Date collected',
  receivedAt: 'Date received',
  analyte: 'Analyte / organism / compound',
  result: 'Result',
  units: 'Units',
  detectionLimit: 'Detection / reporting limit',
  analystNotes: 'Notes / comments',
}

/**
 * Column-mapping wizard panel. Surfaces one dropdown per detected
 * header so the IH can override the auto-detect (or unmap a wrongly-
 * matched column). "Save as template" persists the current overrides
 * to localStorage so the next CSV from the same lab auto-applies.
 *
 * Lifted out of the main component to keep the import flow readable.
 */
function ColumnMappingPanel({
  csvText, parsed, overrides, templates,
  showSaveTemplate, newTemplateName,
  onChangeOverride, onApplyTemplate,
  onOpenSaveTemplate, onCancelSaveTemplate, onChangeTemplateName, onSaveTemplate,
  onDeleteTemplate,
}) {
  const canonicalFields = getCanonicalFields()
  const headers = parsed.rows[0]
    ? Object.keys({
      // Build the headers list from a sample row's `extra` keys
      // plus the canonical fields that are populated. Order matches
      // the CSV's original column order via the auto-detect.
    })
    : []
  // Simpler: parse the CSV text's header row again to keep order.
  const headerLine = csvText.split(/\r\n?|\n/).find((l) => l.split(',').length >= 2 && l.trim().length > 0) || ''
  const detectedHeaders = headerLine.split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
  // Build a map of canonical → rawHeader so we can show ✓ for the
  // canonical fields that are currently filled.
  const currentMapping = {}
  detectedHeaders.forEach((h) => {
    if (Object.prototype.hasOwnProperty.call(overrides, h)) {
      currentMapping[h] = overrides[h] || ''
    } else {
      // Mirror parser auto-detect by checking which canonical key has
      // data in the first parsed row.
      const firstRow = parsed.rows[0] || {}
      let auto = ''
      for (const cf of canonicalFields) {
        if (firstRow[cf] && parsed.rows.some((r) => r.extra && r.extra[h] === r[cf])) {
          // not a great heuristic; the parser doesn't expose its
          // mapping post-parse, so fall back to the "extra" check
          // below.
        }
      }
      if (!auto) {
        // If the column appears in `extra`, it wasn't mapped.
        const inExtra = parsed.rows[0]?.extra && Object.prototype.hasOwnProperty.call(parsed.rows[0].extra, h)
        auto = inExtra ? '' : ''
      }
      currentMapping[h] = ''
    }
  })

  return (
    <div style={{
      marginBottom: 16, padding: 14,
      background: 'color-mix(in srgb, var(--accent) 4%, transparent)',
      border: `1px solid color-mix(in srgb, var(--accent) 22%, transparent)`,
      borderRadius: 10,
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 12, marginBottom: 12,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 2 }}>
            Column mapping
          </div>
          <div style={{ fontSize: 11, color: SUB, lineHeight: 1.5 }}>
            Pick a canonical field for each column. "Auto" keeps the parser's guess; "—" leaves the column unmapped (data preserved in extras).
          </div>
        </div>
      </div>

      {/* Template controls — apply existing, save new */}
      {(templates.length > 0 || parsed.laboratory) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {templates.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return
                const tpl = templates.find((t) => t.id === e.target.value)
                if (tpl) onApplyTemplate(tpl)
                e.target.value = ''
              }}
              style={{
                padding: '6px 10px', background: SURFACE, border: `1px solid ${BORDER}`,
                borderRadius: 8, color: TEXT, fontSize: 12, fontFamily: 'inherit',
              }}>
              <option value="">Apply saved template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.laboratory ? ` · ${t.laboratory}` : ''}
                </option>
              ))}
            </select>
          )}
          {!showSaveTemplate && (
            <button
              type="button"
              onClick={onOpenSaveTemplate}
              style={{
                background: 'transparent', border: `1px solid ${BORDER}`,
                borderRadius: 8, color: ACCENT, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', padding: '6px 10px',
              }}>
              Save as template
            </button>
          )}
          {showSaveTemplate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => onChangeTemplateName(e.target.value)}
                placeholder={parsed.laboratory ? `${parsed.laboratory} mapping` : 'Template name'}
                style={{
                  padding: '6px 10px', background: SURFACE, border: `1px solid ${BORDER}`,
                  borderRadius: 8, color: TEXT, fontSize: 12, fontFamily: 'inherit',
                  minWidth: 180,
                }}
              />
              <button
                type="button"
                onClick={onSaveTemplate}
                disabled={!newTemplateName.trim()}
                style={{
                  background: newTemplateName.trim() ? ACCENT : SURFACE,
                  border: 'none', borderRadius: 8,
                  color: newTemplateName.trim() ? 'var(--on-accent-fill)' : DIM,
                  fontSize: 12, fontWeight: 700, cursor: newTemplateName.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', padding: '6px 12px',
                }}>
                Save
              </button>
              <button
                type="button"
                onClick={onCancelSaveTemplate}
                style={{
                  background: 'transparent', border: 'none',
                  color: SUB, fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit', padding: '6px 8px',
                }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Per-column mapping rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {detectedHeaders.map((h) => (
          <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              flex: 1, minWidth: 0, fontSize: 12, color: TEXT, fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {h}
            </div>
            <select
              value={Object.prototype.hasOwnProperty.call(overrides, h) ? (overrides[h] || '__unmap__') : '__auto__'}
              onChange={(e) => {
                const v = e.target.value
                if (v === '__auto__') onChangeOverride(h, '__auto__')
                else if (v === '__unmap__') onChangeOverride(h, '')
                else onChangeOverride(h, v)
              }}
              style={{
                padding: '6px 10px', background: SURFACE, border: `1px solid ${BORDER}`,
                borderRadius: 8, color: TEXT, fontSize: 12, fontFamily: 'inherit',
                minWidth: 180,
              }}>
              <option value="__auto__">Auto (parser default)</option>
              <option value="__unmap__">— Leave unmapped</option>
              {canonicalFields.map((f) => (
                <option key={f} value={f}>{CANONICAL_LABELS[f] || f}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {templates.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 11, color: DIM, lineHeight: 1.5 }}>
          {templates.length} saved template{templates.length === 1 ? '' : 's'}.{' '}
          {templates.map((t) => (
            <span key={t.id} style={{ marginRight: 6 }}>
              <span style={{ color: SUB }}>{t.name}</span>
              <button
                type="button"
                onClick={() => onDeleteTemplate(t.id)}
                aria-label={`Delete template ${t.name}`}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: DIM, fontSize: 11, padding: '0 4px', fontFamily: 'inherit',
                }}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LabResultsImport({ onBack, onSaved }) {
  const fileRef = useRef(null)
  const [filename, setFilename] = useState('')
  const [parsed, setParsed] = useState(null)
  const [error, setError] = useState('')
  // Column-mapping wizard state. csvText is the raw CSV kept around
  // so we can re-parse with new overrides whenever the user adjusts
  // a column dropdown. overrides is { rawHeader → canonicalField };
  // entries with value === '' explicitly unmap an auto-detected
  // column. mappingOpen toggles the Adjust-mapping panel.
  const [csvText, setCsvText] = useState('')
  const [overrides, setOverrides] = useState({})
  const [mappingOpen, setMappingOpen] = useState(false)
  const [templates, setTemplates] = useState(() => listTemplates())
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
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
    setCsvText('')
    setOverrides({})
    setMappingOpen(false)
    setShowSaveTemplate(false)
    setNewTemplateName('')
    const file = e.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    try {
      const text = await file.text()
      // Auto-apply a saved template when the detected laboratory
      // matches. Templates are saved per-lab so the next CSV from
      // the same lab gets the user's previous mapping for free.
      // Falls through to the bare auto-detect when no template
      // matches.
      const initialPass = parseLabResultsCsv(text)
      const tpl = findTemplateForLab(initialPass.laboratory || '')
      const initialOverrides = tpl ? tpl.mapping : {}
      const result = tpl ? parseLabResultsCsv(text, { overrides: initialOverrides }) : initialPass
      setCsvText(text)
      setOverrides(initialOverrides)
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
      // Habit-loop PR 5: emit lab_results_attached so /api/events
      // can cancel any pending sampling_results.reminder for this
      // report. Best-effort; never blocks the save.
      emitEvent('lab_results_attached', {
        target_id: targetId,
        target_type: 'assessment',
        details: { report_id: targetId, row_count: parsed.rows.length },
      })
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
          {/* Column-mapping affordance. Always visible so the user
              can override a misdetected column even when nothing is
              technically unmapped; default copy nudges them when
              there ARE unmapped columns so they don't lose data. */}
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            gap: 8, marginBottom: 12,
          }}>
            <div style={{ fontSize: 11, color: parsed.unmappedColumns.length > 0 ? 'var(--warn)' : DIM, lineHeight: 1.55 }}>
              {parsed.unmappedColumns.length > 0 ? (
                <>
                  {parsed.unmappedColumns.length} unmapped column{parsed.unmappedColumns.length === 1 ? '' : 's'}:{' '}
                  <em>{parsed.unmappedColumns.join(', ')}</em>
                </>
              ) : (
                <>All columns mapped automatically.</>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMappingOpen((v) => !v)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: ACCENT, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                padding: '4px 6px', flexShrink: 0,
              }}>
              {mappingOpen ? 'Hide mapping' : 'Adjust mapping'}
            </button>
          </div>
          {mappingOpen && csvText && (
            <ColumnMappingPanel
              csvText={csvText}
              parsed={parsed}
              overrides={overrides}
              templates={templates}
              showSaveTemplate={showSaveTemplate}
              newTemplateName={newTemplateName}
              onChangeOverride={(rawHeader, canonical) => {
                const next = { ...overrides }
                if (canonical === '__auto__') {
                  delete next[rawHeader]
                } else {
                  next[rawHeader] = canonical || ''
                }
                setOverrides(next)
                setParsed(parseLabResultsCsv(csvText, { overrides: next }))
              }}
              onApplyTemplate={(tpl) => {
                if (!tpl) return
                setOverrides(tpl.mapping || {})
                setParsed(parseLabResultsCsv(csvText, { overrides: tpl.mapping || {} }))
              }}
              onOpenSaveTemplate={() => setShowSaveTemplate(true)}
              onCancelSaveTemplate={() => { setShowSaveTemplate(false); setNewTemplateName('') }}
              onChangeTemplateName={setNewTemplateName}
              onSaveTemplate={() => {
                if (!newTemplateName.trim()) return
                saveTemplate({
                  name: newTemplateName.trim(),
                  laboratory: parsed.laboratory || null,
                  mapping: overrides,
                })
                setTemplates(listTemplates())
                setShowSaveTemplate(false)
                setNewTemplateName('')
              }}
              onDeleteTemplate={(id) => {
                deleteTemplate(id)
                setTemplates(listTemplates())
              }}
            />
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
