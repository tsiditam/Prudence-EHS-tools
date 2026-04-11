/**
 * Vercel Serverless Function — /api/checkout
 * Creates a Stripe Checkout session for credit purchases.
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

const PLANS = {
  solo: { credits: 50, price: 14900, name: 'Solo — $149/mo', desc: 'For independent assessors' },
  pro: { credits: 200, price: 34900, name: 'Pro — $349/mo', desc: 'For active consulting firms' },
  team: { credits: 500, price: 79900, name: 'Team — $799/mo', desc: 'For teams and enterprise' },
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' })

  try {
    const { plan, userId, userEmail, returnUrl } = req.body
    const tier = PLANS[plan]
    if (!tier) return res.status(400).json({ error: 'Invalid plan' })

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: userEmail || undefined,
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: tier.price,
          product_data: { name: tier.name, description: `${tier.credits} assessment credits for atmosflow` },
        },
        quantity: 1,
      }],
      metadata: { user_id: userId, plan, credits: String(tier.credits) },
      success_url: (returnUrl || 'https://atmosiq.prudenceehs.com') + '?checkout=success',
      cancel_url: (returnUrl || 'https://atmosiq.prudenceehs.com') + '?checkout=cancelled',
    })

    return res.status(200).json({ url: session.url, sessionId: session.id })
  } catch (err) {
    console.error('Checkout error:', err)
    return res.status(500).json({ error: 'Failed to create checkout session' })
  }
}
