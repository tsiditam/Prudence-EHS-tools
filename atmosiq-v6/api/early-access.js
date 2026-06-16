/**
 * Vercel Serverless Function — /api/early-access
 * Handles early access form submissions.
 * Stores in Supabase, sends notification email via Resend.
 *
 * Rate limiting: DB-backed (counts rows in early_access_signups by IP
 * within a rolling 1-hour window). Replaces the in-memory Map that was
 * ineffective across separate serverless instances.
 */

const { createClient } = require('@supabase/supabase-js')

const MAX_PER_IP_PER_HOUR = 3
const WINDOW_MS = 60 * 60 * 1000

let _supabaseClient = null
function getSupabase() {
  if (_supabaseClient) return _supabaseClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function isRateLimited(supabase, ip) {
  if (!ip || !supabase) return false
  try {
    const since = new Date(Date.now() - WINDOW_MS).toISOString()
    const { count, error } = await supabase
      .from('early_access_signups')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('submitted_at', since)
    if (error) {
      console.error('[early-access] rate limit check failed:', error.message)
      return false // fail open — don't block legitimate signups on DB error
    }
    return (count || 0) >= MAX_PER_IP_PER_HOUR
  } catch (err) {
    console.error('[early-access] rate limit check threw:', err && err.message)
    return false
  }
}

function sanitize(str) {
  if (typeof str !== 'string') return ''
  return str.trim().replace(/[<>]/g, '').slice(0, 1000)
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || (req.socket && req.socket.remoteAddress)
    || null

  const supabase = getSupabase()

  if (await isRateLimited(supabase, ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' })
  }

  const { name, email, company, title, volume, painpoint, source } = req.body || {}

  const errors = []
  if (!name || !sanitize(name)) errors.push('Name is required')
  if (!email || !validateEmail(email)) errors.push('Valid email is required')
  if (!company || !sanitize(company)) errors.push('Company is required')
  if (!title || !sanitize(title)) errors.push('Title is required')
  // volume / painpoint / source are optional — captured during onboarding,
  // not required to request access (kept here so existing records still store
  // them if a client ever sends them).

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join('. ') })
  }

  const submission = {
    id: `EA-${Date.now().toString(36).toUpperCase()}`,
    name: sanitize(name),
    email: sanitize(email).toLowerCase(),
    company: sanitize(company),
    title: sanitize(title),
    volume: sanitize(volume),
    painpoint: sanitize(painpoint || '').slice(0, 500),
    source: sanitize(source),
    submitted_at: new Date().toISOString(),
    ip: ip || null,
  }

  let stored = false
  if (supabase) {
    try {
      await supabase.from('early_access_signups').insert(submission)
      stored = true
    } catch (err) {
      console.error('Supabase storage failed:', err.message)
    }
  }

  if (!stored) {
    console.log('Early access submission (not stored in DB):', JSON.stringify(submission))
  }

  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'AtmosFlow <noreply@prudenceehs.com>',
          to: 'support@prudenceehs.com',
          subject: `Early Access Request — ${submission.name} (${submission.company})`,
          html: `
            <h2>New Early Access Request</h2>
            <table style="border-collapse:collapse;font-family:sans-serif;">
              <tr><td style="padding:4px 12px 4px 0;color:#666;">Name</td><td>${submission.name}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#666;">Email</td><td>${submission.email}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#666;">Company</td><td>${submission.company}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#666;">Title</td><td>${submission.title}</td></tr>
              ${submission.volume ? `<tr><td style="padding:4px 12px 4px 0;color:#666;">Volume</td><td>${submission.volume} investigations/month</td></tr>` : ''}
              ${submission.painpoint ? `<tr><td style="padding:4px 12px 4px 0;color:#666;">Pain Point</td><td>${submission.painpoint}</td></tr>` : ''}
              ${submission.source ? `<tr><td style="padding:4px 12px 4px 0;color:#666;">Source</td><td>${submission.source}</td></tr>` : ''}
            </table>
            <p style="color:#999;font-size:12px;margin-top:16px;">Submitted ${submission.submitted_at}</p>
          `,
        }),
      })
    } catch (err) {
      console.error('Email notification failed:', err.message)
    }
  } else {
    console.log('Resend not configured — skipping email notification')
  }

  return res.status(200).json({ success: true, id: submission.id })
}

module.exports = handler
module.exports.__test = {
  MAX_PER_IP_PER_HOUR,
  WINDOW_MS,
  isRateLimited,
  setSupabase(mock) { _supabaseClient = mock },
  resetSupabase() { _supabaseClient = null },
}
