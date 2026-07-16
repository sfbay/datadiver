// api/alerts/confirm.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyToken } from '../../src/lib/alerts/tokens.js'
import { confirmSubscription } from '../_lib/db.js'
import { escapeHtml } from '../_lib/email.js'

// All current callers pass static strings, but escape anyway — the day
// someone interpolates an email or label here, it must not become XSS.
function page(title: string, body: string): string {
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
  <body style="margin:0;background:#f5ecd9;font-family:Georgia,serif;color:#1e140d">
    <div style="max-width:480px;margin:12vh auto;padding:0 24px;text-align:center">
      <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#b85a33">The Last 48</div>
      <h1 style="font-size:24px;margin:10px 0 14px">${escapeHtml(title)}</h1>
      <p style="font-size:16px;line-height:1.6">${escapeHtml(body)}</p>
      <p style="margin-top:24px"><a href="${base}/live-feeds" style="color:#b85a33">Open DataDiver →</a></p>
    </div></body></html>`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')

  const secret = process.env.ALERTS_TOKEN_SECRET
  if (!secret) {
    console.error('[confirm] ALERTS_TOKEN_SECRET is not set')
    return res.status(500).send(page('Something went wrong', 'Please try again later.'))
  }

  const token = String(req.query.token ?? '')
  const payload = verifyToken(token, 'confirm', secret)
  if (!payload) {
    return res.status(400).send(page('Link expired', 'This confirmation link is invalid or has expired. Please subscribe again from DataDiver.'))
  }

  try {
    await confirmSubscription(payload.subjectId)
  } catch (err) {
    console.error('[confirm] db error', err)
    return res.status(503).send(page('Something went wrong', 'We could not confirm your subscription right now. Please try the link again shortly.'))
  }

  return res.status(200).send(page("You're subscribed", "This alert is confirmed and active. You'll get a daily email when matching events happen near your locations. Quiet days send nothing."))
}
