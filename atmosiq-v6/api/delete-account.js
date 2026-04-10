/**
 * Vercel Serverless Function — /api/delete-account
 * Self-service account deletion. Removes all user data.
 */

const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server not configured' })

  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' })

  // Verify user
  const client = createClient(supabaseUrl, anonKey || serviceKey)
  const { data: { user }, error: authErr } = await client.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const supabase = createClient(supabaseUrl, serviceKey)

  try {
    // Delete in order: assessments → credits_ledger → purchases → profiles → auth user
    await supabase.from('assessments').delete().eq('user_id', user.id)
    await supabase.from('credits_ledger').delete().eq('user_id', user.id)
    await supabase.from('purchases').delete().eq('user_id', user.id)
    await supabase.from('analytics_events').delete().eq('user_id', user.id)
    await supabase.from('profiles').delete().eq('id', user.id)
    await supabase.auth.admin.deleteUser(user.id)

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Account deletion error:', err)
    return res.status(500).json({ error: 'Deletion failed' })
  }
}
