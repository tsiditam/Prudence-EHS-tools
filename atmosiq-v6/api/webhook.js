/**
 * Vercel Serverless Function — /api/webhook
 * Handles Stripe webhook events for payment confirmation.
 * Adds credits to user account on successful payment.
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit')

module.exports.config = { api: { bodyParser: false } }

async function buffer(readable) {
  const chunks = []
  for await (const chunk of readable) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks)
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const sig = req.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!sig || !webhookSecret) return res.status(400).json({ error: 'Missing signature or secret' })

  let event
  try {
    const body = await buffer(req)
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return res.status(400).json({ error: 'Invalid signature' })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const userId = session.metadata?.user_id
    const credits = parseInt(session.metadata?.credits || '0', 10)
    const plan = session.metadata?.plan || 'unknown'

    if (!userId || !credits) {
      console.error('Missing metadata:', session.metadata)
      return res.status(200).json({ received: true, warning: 'No user_id or credits in metadata' })
    }

    // Connect to Supabase with service role key (bypasses RLS)
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    try {
      // Get current credits
      const { data: profile } = await supabase.from('profiles').select('credits_remaining').eq('id', userId).single()
      const currentCredits = profile?.credits_remaining || 0
      const newBalance = currentCredits + credits

      // Update credits
      await supabase.from('profiles').update({
        credits_remaining: newBalance,
        plan: plan === 'team' ? 'team' : plan === 'pro' ? 'pro' : 'starter',
        stripe_customer_id: session.customer || null,
        subscription_status: 'active',
      }).eq('id', userId)

      // Log to credits ledger
      await supabase.from('credits_ledger').insert({
        user_id: userId,
        amount: credits,
        reason: 'purchase',
        reference_id: session.payment_intent,
        balance_after: newBalance,
      })

      // Record purchase
      await supabase.from('purchases').insert({
        user_id: userId,
        stripe_payment_intent: session.payment_intent,
        stripe_session_id: session.id,
        amount_cents: session.amount_total,
        credits,
        plan,
        status: 'completed',
      })

      console.log(`Credits added: ${credits} to user ${userId} (new balance: ${newBalance})`)

      await auditLog({
        action: 'credits.grant',
        actor_id: userId,
        target_type: 'user',
        target_id: userId,
        details: {
          amount: credits,
          plan,
          payment_intent: session.payment_intent,
          amount_cents: session.amount_total,
          new_balance: newBalance,
        },
        req,
      })
    } catch (dbErr) {
      console.error('Database error during credit fulfillment:', dbErr)
      return res.status(500).json({ error: 'Credit fulfillment failed' })
    }
  }

  return res.status(200).json({ received: true })
}
