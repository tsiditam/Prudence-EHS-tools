/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Vercel Serverless Function — proxies narrative generation to Anthropic API.
 * The API key stays server-side; the browser never sees it.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured — missing API key' })
  }

  try {
    const { system, payload } = req.body
    if (!system || !payload) {
      return res.status(400).json({ error: 'Missing system or payload in request body' })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system,
        messages: [{
          role: 'user',
          content: `Based ONLY on this data, write a professional IAQ findings narrative:\n\n${JSON.stringify(payload, null, 2)}`,
        }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return res.status(response.status).json({ error: err })
    }

    const data = await response.json()
    const text = data.content
      ?.map(b => b.type === 'text' ? b.text : '')
      .filter(Boolean)
      .join('\n') || null

    return res.status(200).json({ narrative: text })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
