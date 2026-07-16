// api/alerts/confirm.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyToken } from '../../src/lib/alerts/tokens.js'
import { confirmSubscription } from '../_lib/db.js'
import { renderPage } from '../_lib/pages.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')

  const secret = process.env.ALERTS_TOKEN_SECRET
  if (!secret) {
    console.error('[confirm] ALERTS_TOKEN_SECRET is not set')
    return res.status(500).send(renderPage({
      eyebrow: 'Something went wrong',
      title: 'Please try again.',
      body: 'The server is misconfigured. Try the link again in a few minutes.',
      tone: 'error',
      cta: null,
    }))
  }

  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
  const token = String(req.query.token ?? '')
  const payload = verifyToken(token, 'confirm', secret)
  if (!payload) {
    return res.status(400).send(renderPage({
      eyebrow: 'Link expired',
      title: 'This link has expired.',
      body: 'Confirmation links last seven days and work once. Subscribe again from DataDiver to get a fresh one.',
      cta: { href: base + '/alerts', label: 'Back to Alerts →' },
    }))
  }

  try {
    // verifyToken is stateless (signature + purpose + exp only), so a token
    // whose subscription no longer exists — pruned, unsubscribed, or an old
    // subscriber-scoped token from before the July 2026 per-subscription
    // migration — still verifies. The boolean is the DB's verdict; honoring
    // it is what makes this page's claim true.
    const ok = await confirmSubscription(payload.subjectId)
    if (!ok) {
      return res.status(400).send(renderPage({
        eyebrow: 'Link expired',
        title: 'This link has expired.',
        body: 'Confirmation links last seven days and work once. Subscribe again from DataDiver to get a fresh one.',
        cta: { href: base + '/alerts', label: 'Back to Alerts →' },
      }))
    }
  } catch (err) {
    console.error('[confirm] db error', err)
    return res.status(503).send(renderPage({
      eyebrow: 'Something went wrong',
      title: 'Please try again.',
      body: 'We could not confirm your alert right now. Please try the link again shortly.',
      tone: 'error',
      cta: null,
    }))
  }

  return res.status(200).send(renderPage({
    eyebrow: 'Alert active',
    title: "You're in.",
    body: "This alert is confirmed. You'll get a daily email when matching events happen near your locations — quiet days send nothing.",
  }))
}
