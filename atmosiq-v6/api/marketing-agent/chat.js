/**
 * Vercel Serverless Function — /api/marketing-agent/chat
 *
 * Backend for the landing-page marketing conversion agent (the floating chat
 * widget). The conversation itself is a deterministic, scripted flow driven by
 * the client (public/marketing-agent.js) — there is no LLM here, which is the
 * primary safeguard: the agent cannot produce medical, legal, or compliance
 * determinations, and it cannot claim AtmosFlow replaces a CIH or professional
 * judgment. It only ever positions AtmosFlow as a screening + reporting
 * acceleration tool requiring professional review.
 *
 * Actions (POST body { action }):
 *   - "message" / "event": lightweight ack for chat turns / analytics beacons.
 *   - "lead": validates + scores + persists a captured lead to Postgres
 *     (marketing_agent_leads) and notifies via Resend.
 *
 * Rate limiting: DB-backed (rows by IP within a rolling hour). Fails open.
 */

const { createClient } = require('@supabase/supabase-js')

const MAX_PER_IP_PER_HOUR = 6
const WINDOW_MS = 60 * 60 * 1000

let _supabaseClient = null
function getSupabase() {
  if (_supabaseClient) return _supabaseClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function sanitize(str) {
  if (typeof str !== 'string') return ''
  return str.trim().replace(/[<>]/g, '').slice(0, 2000)
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Simple 1–100 intent score from the qualification answers. Higher = warmer
 * lead (role fit + current friction + wants beta). Deterministic and explainable.
 */
function computeIntentScore(answers = {}) {
  let s = 0
  const role = String(answers.role || '').toLowerCase()
  if (role.includes('consultant')) s += 25
  else if (role.includes('ehs')) s += 22
  else if (role.includes('facilit')) s += 16
  else if (role.includes('school')) s += 14
  else if (role.includes('explor')) s += 5

  const method = String(answers.reportsMethod || '').toLowerCase()
  if (method.includes('manual') || method.includes('word') || method.includes('excel')) s += 16
  else if (method.includes('template')) s += 11
  else if (method.includes('consultant') || method.includes('outsource')) s += 9
  else if (method) s += 5

  const logger = String(answers.usesLoggerData || '').toLowerCase()
  if (logger.startsWith('y')) s += 15
  else if (logger.includes('some')) s += 10
  else if (logger.startsWith('n')) s += 3

  if (answers.biggestPain) s += String(answers.biggestPain).toLowerCase().includes('other') ? 5 : 10

  const beta = String(answers.wantsBeta || '').toLowerCase()
  if (beta.startsWith('y')) s += 25
  else if (beta.includes('maybe') || beta.includes('later')) s += 12

  return Math.max(1, Math.min(100, s))
}

async function isRateLimited(supabase, ip) {
  if (!ip || !supabase) return false
  try {
    const since = new Date(Date.now() - WINDOW_MS).toISOString()
    const { count, error } = await supabase
      .from('marketing_agent_leads')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', since)
    if (error) return false // fail open
    return (count || 0) >= MAX_PER_IP_PER_HOUR
  } catch {
    return false
  }
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = req.body || {}
  const action = body.action

  // Chat turns and analytics beacons: acknowledge cheaply. The transcript is
  // attached to the lead on capture; we don't persist anonymous turns.
  if (action === 'message' || action === 'event') {
    return res.status(200).json({ ok: true })
  }

  if (action !== 'lead') {
    return res.status(400).json({ error: 'Unknown action' })
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    null

  const supabase = getSupabase()

  if (await isRateLimited(supabase, ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' })
  }

  const lead = body.lead || {}
  const answers = body.answers || {}
  const name = sanitize(lead.name)
  const email = sanitize(lead.email).toLowerCase()
  const company = sanitize(lead.company)
  const role = sanitize(lead.role || answers.role)
  const useCase = sanitize(lead.useCase)

  const errors = []
  if (!name) errors.push('Name is required')
  if (!email || !validateEmail(email)) errors.push('Valid email is required')
  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join('. ') })
  }

  const intentScore = computeIntentScore(answers)

  const row = {
    id: `MA-${Date.now().toString(36).toUpperCase()}`,
    session_id: sanitize(body.sessionId),
    name,
    email,
    company,
    role,
    use_case: useCase,
    reports_method: sanitize(answers.reportsMethod),
    uses_logger_data: sanitize(answers.usesLoggerData),
    biggest_pain: sanitize(answers.biggestPain),
    wants_beta: sanitize(answers.wantsBeta),
    intent_score: intentScore,
    transcript: Array.isArray(body.transcript) ? body.transcript.slice(0, 100) : null,
    source: 'landing-marketing-agent',
    user_agent: sanitize(req.headers['user-agent'] || '').slice(0, 300),
    ip: ip || null,
  }

  let stored = false
  if (supabase) {
    try {
      await supabase.from('marketing_agent_leads').insert(row)
      stored = true
    } catch (err) {
      console.error('[marketing-agent] lead storage failed:', err && err.message)
    }
  }
  if (!stored) {
    console.log('[marketing-agent] lead (not stored in DB):', JSON.stringify(row))
  }

  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'AtmosFlow <noreply@prudenceehs.com>',
          to: 'support@prudenceehs.com',
          subject: `Marketing lead (${intentScore}/100) — ${row.name}${row.company ? ` (${row.company})` : ''}`,
          html: `
            <h2>New marketing-agent lead</h2>
            <p><b>Intent score:</b> ${intentScore}/100</p>
            <table style="border-collapse:collapse;font-family:sans-serif;">
              <tr><td style="padding:4px 12px 4px 0;color:#666;">Name</td><td>${row.name}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#666;">Email</td><td>${row.email}</td></tr>
              ${row.company ? `<tr><td style="padding:4px 12px 4px 0;color:#666;">Company</td><td>${row.company}</td></tr>` : ''}
              ${row.role ? `<tr><td style="padding:4px 12px 4px 0;color:#666;">Role</td><td>${row.role}</td></tr>` : ''}
              ${row.use_case ? `<tr><td style="padding:4px 12px 4px 0;color:#666;">Use case</td><td>${row.use_case}</td></tr>` : ''}
              ${row.reports_method ? `<tr><td style="padding:4px 12px 4px 0;color:#666;">Reports today</td><td>${row.reports_method}</td></tr>` : ''}
              ${row.uses_logger_data ? `<tr><td style="padding:4px 12px 4px 0;color:#666;">Logger data</td><td>${row.uses_logger_data}</td></tr>` : ''}
              ${row.biggest_pain ? `<tr><td style="padding:4px 12px 4px 0;color:#666;">Biggest pain</td><td>${row.biggest_pain}</td></tr>` : ''}
              ${row.wants_beta ? `<tr><td style="padding:4px 12px 4px 0;color:#666;">Beta interest</td><td>${row.wants_beta}</td></tr>` : ''}
            </table>
          `,
        }),
      })
    } catch (err) {
      console.error('[marketing-agent] email notification failed:', err && err.message)
    }
  }

  return res.status(200).json({ ok: true, leadId: row.id, intentScore })
}

module.exports = handler
module.exports.__test = {
  MAX_PER_IP_PER_HOUR,
  WINDOW_MS,
  computeIntentScore,
  validateEmail,
  sanitize,
  isRateLimited,
  setSupabase(mock) { _supabaseClient = mock },
  resetSupabase() { _supabaseClient = null },
}
