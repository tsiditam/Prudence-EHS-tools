/**
 * Vercel Serverless Function — /api/early-access
 * Handles early access form submissions.
 * Stores in Supabase, sends notification email via Resend.
 */

const { createClient } = require('@supabase/supabase-js')

// In-memory rate limit (per serverless instance — not perfect but sufficient)
const rateLimits = new Map()

function isRateLimited(ip) {
  const now = Date.now()
  const windowMs = 60 * 60 * 1000 // 1 hour
  const key = ip || 'unknown'
  const entries = rateLimits.get(key) || []
  const recent = entries.filter(ts => now - ts < windowMs)
  if (recent.length >= 3) return true
  recent.push(now)
  rateLimits.set(key, recent)
  return false
}

function sanitize(str) {
  if (typeof str !== 'string') return ''
  return str.trim().replace(/[<>]/g, '').slice(0, 1000)
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Rate limit
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' })
  }

  const { name, email, company, title, volume, painpoint, source } = req.body || {}

  // Validate required fields
  const errors = []
  if (!name || !sanitize(name)) errors.push('Name is required')
  if (!email || !validateEmail(email)) errors.push('Valid email is required')
  if (!company || !sanitize(company)) errors.push('Company is required')
  if (!title || !sanitize(title)) errors.push('Title is required')
  if (!volume) errors.push('Investigation volume is required')
  if (!source) errors.push('Referral source is required')

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

  // Store in Supabase
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  let stored = false

  if (supabaseUrl && serviceKey) {
    try {
      const supabase = createClient(supabaseUrl, serviceKey)
      await supabase.from('early_access_signups').insert(submission)
      stored = true
    } catch (err) {
      console.error('Supabase storage failed:', err.message)
    }
  }

  if (!stored) {
    console.log('Early access submission (not stored in DB):', JSON.stringify(submission))
  }

  // Send notification email via Resend
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
              <tr><td style="padding:4px 12px 4px 0;color:#666;">Volume</td><td>${submission.volume} investigations/month</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#666;">Pain Point</td><td>${submission.painpoint || '—'}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#666;">Source</td><td>${submission.source}</td></tr>
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
