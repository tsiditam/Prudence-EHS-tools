/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * MonitoringReportSheet — generate the Indoor Environmental Monitoring Report
 * from Logger Studio.
 *
 * This is the standalone deliverable: a report built from logger data alone,
 * with no assessment, no engine run and no composite score behind it. The
 * sheet collects the things the data cannot know — where the instrument sat,
 * who ran it, who it is for, and which screening reference each parameter
 * should be judged against — and hands a MonitoringSession to the generator.
 *
 * ── What this component does and does not decide ───────────────────────
 * It decides nothing about the report's contents. Section order, wording,
 * statistics and status all live in `monitoringReportModel.js`; the figures
 * live in `monitoringChart.js`. This file is an intake form and a button.
 * Keeping it that way is what lets the report be tested without a DOM.
 *
 * ── Autofill ───────────────────────────────────────────────────────────
 * Assessor and instrument prefill from the active local profile, stay fully
 * editable, and offer to remember an edit. A consultant runs the same meter
 * for a year; retyping its serial on every report is how serial numbers end
 * up wrong in client deliverables.
 */

import { useEffect, useMemo, useState } from 'react'
import BottomSheet from '../ui/BottomSheet'
import TactileButton from '../ui/TactileButton'
import GhostButton from '../ui/GhostButton'
import Select from '../ui/Select'
import InlineError from '../ui/InlineError'
import SegmentedControl from '../ui/SegmentedControl'
import Profiles from '../../utils/profiles'
import { createMonitoringSession, occupiedWindows } from '../../utils/monitoringSession'
import { profilesFor, defaultProfileId } from '../../utils/referenceProfiles'
import { parseCalibrationGas } from '../../utils/vocConversion'
import { generateMonitoringReport } from '../docx/monitoring-report'
import { hashDataset, shortHash } from '../../utils/datasetHash'
import { proseName } from '../../utils/monitoringInsights'
import { APP_VERSION } from '../../version'

const LBL = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px',
  color: 'var(--dim)', marginBottom: 8,
}
const INPUT = {
  width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
}
const SEL = { width: '100%', fontSize: 14, padding: '10px 12px' }
const ROW = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }

function Field({ label, value, onChange, placeholder, multiline }) {
  return (
    <div>
      <div style={LBL}>{label}</div>
      {multiline ? (
        <textarea
          value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4}
          style={{ ...INPUT, resize: 'vertical', lineHeight: 1.5 }}
        />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={INPUT} />
      )}
    </div>
  )
}

/**
 * The site's UTC offset, in minutes, as the browser reports it for the moment
 * the data was logged.
 *
 * Taken at the dataset's own start rather than "now" so a report generated in
 * January about a July campaign still buckets July's hours the way the site
 * experienced them. Every downstream timestamp is rendered from this one
 * number, which is what keeps the tables, the prose and the figure axes
 * agreeing with each other.
 */
export function siteOffsetMinutes(startMs) {
  const at = Number.isFinite(startMs) ? new Date(startMs) : new Date()
  // getTimezoneOffset is minutes WEST of UTC; the model wants minutes east.
  return -at.getTimezoneOffset()
}

/**
 * The MonitoringSession this sheet hands to the generator.
 *
 * Extracted from the component because it is the only logic on this surface:
 * everything else is inputs and a button. Pure, so the whole Logger Studio →
 * report path can be exercised against the real model without a DOM.
 */
export function buildSessionFromLogger({ data, form, occupancyWindows = [], events = [] }) {
  const f = form || {}
  return createMonitoringSession({
    utcOffsetMin: siteOffsetMinutes(data && data.summary ? data.summary.start : null),
    objective: String(f.objective || '').trim(),
    location: f.location,
    instrument: f.instrument,
    calibration: {
      date: String(f.calibrationDate || '').trim(),
      gas: String(f.calibrationGas || '').trim(),
    },
    assessor: f.assessor,
    client: f.client,
    referenceProfiles: f.referenceProfiles,
    // Only the windows the assessor marked OCCUPIED — an unoccupied one
    // entered here would invert every occupied/unoccupied statistic.
    occupancySchedule: occupiedWindows(occupancyWindows),
    events,
    datasets: data ? [{ ...data, role: data.role || 'indoor' }] : [],
  })
}

export default function MonitoringReportSheet({ data, occupancyWindows = [], events = [], onClose, onGenerated }) {
  const params = useMemo(() => (data && Array.isArray(data.params) ? data.params : []), [data])

  const [objective, setObjective] = useState(
    'Continuous environmental monitoring was conducted to document indoor environmental conditions during the stated monitoring period.',
  )
  const [loc, setLoc] = useState({ building: '', address: '', floor: '', room: '', zone: '', sensorPosition: '' })
  const [inst, setInst] = useState({ make: '', model: '', serial: '', timestampSource: 'Device (local)' })
  const [calDate, setCalDate] = useState('')
  const [calGas, setCalGas] = useState('')
  const [assessor, setAssessor] = useState({ name: '', credentials: '', firm: '' })
  const [client, setClient] = useState({ preparedFor: '' })
  const [refs, setRefs] = useState({})
  const [edition, setEdition] = useState('client')
  const [remember, setRemember] = useState(false)
  const [profile, setProfile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  // Parameters that actually offer a choice of yardstick. One that offers a
  // single profile is still resolved — it just isn't worth a picker.
  // The span gas only bears on TVOC, so the field only appears when TVOC was
  // logged — an instrument spec nobody can act on is noise on every other
  // report.
  const hasTvoc = params.includes('tvoc')
  const calGasParse = useMemo(() => parseCalibrationGas(calGas), [calGas])

  const choosable = useMemo(
    () => params.map((p) => ({ param: p, options: profilesFor(p) })).filter((x) => x.options.length > 1),
    [params],
  )

  useEffect(() => {
    const next = {}
    params.forEach((p) => { next[p] = defaultProfileId(p) })
    setRefs(next)
  }, [params])

  // Autofill from the active profile, without clobbering anything typed.
  useEffect(() => {
    let cancelled = false
    Profiles.getActiveProfile().then((p) => {
      if (cancelled || !p) return
      setProfile(p)
      setAssessor((a) => (a.name || a.credentials || a.firm ? a : {
        name: p.name || '',
        credentials: Array.isArray(p.certs) ? p.certs.join(', ') : (p.certs || ''),
        firm: p.firm || p.company || '',
      }))
      setInst((i) => (i.make || i.model || i.serial ? i : {
        ...i,
        make: '',
        model: p.iaq_meter || '',
        serial: p.iaq_serial || '',
      }))
      setCalDate((c) => c || p.iaq_cal_date || '')
      setCalGas((g) => g || p.pid_cal_gas || '')
    })
    return () => { cancelled = true }
  }, [])

  const dirtyVsProfile =
    !!profile && (
      (inst.model || '') !== (profile.iaq_meter || '') ||
      (inst.serial || '') !== (profile.iaq_serial || '') ||
      (calDate || '') !== (profile.iaq_cal_date || '') ||
      (calGas || '') !== (profile.pid_cal_gas || '')
    )

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      // The fingerprint covers the readings only, so re-issuing with a
      // corrected client name yields the same hash — which is the point.
      const hash = await hashDataset(data)

      const session = buildSessionFromLogger({
        data,
        occupancyWindows,
        events,
        form: {
          objective,
          location: loc,
          instrument: inst,
          calibrationDate: calDate,
          calibrationGas: calGas,
          assessor,
          client,
          referenceProfiles: refs,
        },
      })

      const opts = {
        edition,
        generatedAt: new Date().toISOString(),
        // The zone the report is generated in, so its date/time stamp reads in
        // the local clock (e.g. "9:16 PM EST") rather than UTC.
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        datasetHash: shortHash(hash),
        softwareVersion: APP_VERSION,
        firm: assessor.firm || undefined,
        clientName: client.preparedFor || undefined,
      }

      const { fileName } = await generateMonitoringReport(session, opts)

      // Hand the session upward so it persists on the sensorData envelope.
      // Everything on this sheet except the readings — the location, the
      // client, the instrument, and above all WHICH reference profile was
      // chosen per parameter — is typed here and otherwise discarded when the
      // sheet closes. Without it the issued report cannot be re-derived, and
      // anything reading it later would have to assume defaults the assessor
      // may never have picked.
      //
      // Stored only after generateMonitoringReport resolves: a session that
      // never produced a document is not a report, and recording one would
      // claim a deliverable that does not exist.
      if (typeof onGenerated === 'function') {
        onGenerated({ session, opts, fileName, generatedAt: opts.generatedAt })
      }

      if (remember && dirtyVsProfile && profile) {
        await Profiles.save({
          ...profile,
          iaq_meter: inst.model || profile.iaq_meter,
          iaq_serial: inst.serial || profile.iaq_serial,
          iaq_cal_date: calDate || profile.iaq_cal_date,
          pid_cal_gas: calGas || profile.pid_cal_gas,
        })
      }
      setDone({ fileName })
    } catch (e) {
      // A failed generation must say so. Silently closing the sheet would
      // read as success and leave the user hunting a file that never landed.
      setError(e && e.message ? e.message : 'Report generation failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!data) return null

  return (
    <BottomSheet open title="Indoor Environmental Monitoring Report" onClose={onClose}>
      {done ? (
        <div style={{ padding: '8px 0 4px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>✓ Report generated</div>
          <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 16, lineHeight: 1.5, wordBreak: 'break-all' }}>
            {done.fileName}
          </div>
          <TactileButton variant="primary" fullWidth size="md" onClick={onClose}>Done</TactileButton>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
          <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.5 }}>
            A standalone report from this logger data — no assessment or score. Screening and documentation only.
          </div>

          {error && <InlineError>{error}</InlineError>}

          <div>
            <div style={LBL}>Edition</div>
            <SegmentedControl
              ariaLabel="Report edition" value={edition} onChange={setEdition}
              options={[{ value: 'client', label: 'Client' }, { value: 'technical', label: 'Technical' }]}
            />
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 6, lineHeight: 1.5 }}>
              {edition === 'technical'
                ? 'Adds an appendix of full descriptive statistics for each parameter.'
                : 'The client deliverable: summary, figures and the event log.'}
            </div>
          </div>

          <Field label="Monitoring objective" value={objective} onChange={setObjective} multiline
            placeholder="Why monitoring was performed" />

          <div>
            <div style={LBL}>Monitoring location</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input type="text" value={loc.building} onChange={(e) => setLoc({ ...loc, building: e.target.value })} placeholder="Building" style={INPUT} />
              <input type="text" value={loc.address} onChange={(e) => setLoc({ ...loc, address: e.target.value })} placeholder="Street address" style={INPUT} />
              <div style={ROW}>
                <input type="text" value={loc.floor} onChange={(e) => setLoc({ ...loc, floor: e.target.value })} placeholder="Floor" style={INPUT} />
                <input type="text" value={loc.room} onChange={(e) => setLoc({ ...loc, room: e.target.value })} placeholder="Room / suite" style={INPUT} />
              </div>
              <div style={ROW}>
                <input type="text" value={loc.zone} onChange={(e) => setLoc({ ...loc, zone: e.target.value })} placeholder="Zone" style={INPUT} />
                <input type="text" value={loc.sensorPosition} onChange={(e) => setLoc({ ...loc, sensorPosition: e.target.value })} placeholder="Sensor position" style={INPUT} />
              </div>
            </div>
          </div>

          <div>
            <div style={LBL}>Instrument</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={ROW}>
                <input type="text" value={inst.make} onChange={(e) => setInst({ ...inst, make: e.target.value })} placeholder="Make" style={INPUT} />
                <input type="text" value={inst.model} onChange={(e) => setInst({ ...inst, model: e.target.value })} placeholder="Model" style={INPUT} />
              </div>
              <div style={ROW}>
                <input type="text" value={inst.serial} onChange={(e) => setInst({ ...inst, serial: e.target.value })} placeholder="Serial" style={INPUT} />
                <input type="text" value={calDate} onChange={(e) => setCalDate(e.target.value)} placeholder="Calibration date" style={INPUT} />
              </div>
              {/* The PID span gas. Not cosmetic provenance: when TVOC was
                  logged in ppb, this compound's molecular weight is what the
                  µg/m³ advisory tier is restated through, so a meter spanned
                  to toluene and one spanned to isobutylene get different
                  reference lines from the same readings. */}
              {hasTvoc && (
                <input type="text" value={calGas} onChange={(e) => setCalGas(e.target.value)} placeholder="PID calibration gas (e.g. Isobutylene 100 ppm)" style={INPUT} />
              )}
            </div>
            {hasTvoc && (
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 6, lineHeight: 1.5 }}>
                {calGasParse.recognised
                  ? `TVOC references will be stated as ${calGasParse.reference.label.toLowerCase()}-equivalent (MW ${calGasParse.reference.mw}).`
                  : calGasParse.recorded
                    ? `"${calGasParse.stated}" is not a compound this conversion carries a molecular weight for — TVOC references will fall back to isobutylene and the report will say so.`
                    : 'Left blank, TVOC references fall back to isobutylene and the report states that the calibration gas was not recorded.'}
              </div>
            )}
            {/* Calibration is never silently absent: if it is left blank the
                report says so rather than letting a reader assume it was
                verified. Stated here so that is a choice, not a surprise. */}
            {!calDate.trim() && (
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 6, lineHeight: 1.5 }}>
                Left blank, the report will state that calibration was not documented for this session.
              </div>
            )}
            {dirtyVsProfile && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: 'var(--sub)', cursor: 'pointer' }}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember this instrument on my profile
              </label>
            )}
          </div>

          <div>
            <div style={LBL}>Prepared by</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={ROW}>
                <input type="text" value={assessor.name} onChange={(e) => setAssessor({ ...assessor, name: e.target.value })} placeholder="Name" style={INPUT} />
                <input type="text" value={assessor.credentials} onChange={(e) => setAssessor({ ...assessor, credentials: e.target.value })} placeholder="Credentials" style={INPUT} />
              </div>
              <input type="text" value={assessor.firm} onChange={(e) => setAssessor({ ...assessor, firm: e.target.value })} placeholder="Firm" style={INPUT} />
            </div>
          </div>

          <Field label="Prepared for" value={client.preparedFor} onChange={(v) => setClient({ preparedFor: v })} placeholder="Client name" />

          {choosable.length > 0 && (
            <div>
              <div style={LBL}>References</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10, lineHeight: 1.5 }}>
                The yardstick each parameter is measured against. This choice drives the reference line, the percentage above, and the wording.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {choosable.map(({ param, options }) => (
                  <div key={param}>
                    <div style={{ fontSize: 12, color: 'var(--sub)', marginBottom: 4 }}>{proseName(param)}</div>
                    <Select
                      value={refs[param] || ''} onChange={(e) => setRefs({ ...refs, [param]: e.target.value })}
                      style={SEL} aria-label={`Reference for ${proseName(param)}`}
                    >
                      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <TactileButton variant="primary" fullWidth size="lg" disabled={busy} onClick={generate}>
            {busy ? 'Generating…' : 'Generate report (.docx)'}
          </TactileButton>
          <GhostButton onClick={onClose} style={{ justifyContent: 'center' }}>Cancel</GhostButton>
        </div>
      )}
    </BottomSheet>
  )
}
