// api/alerts/unsubscribe.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyToken } from '../../src/lib/alerts/tokens.js'
import { deleteSubscriber } from '../_lib/db.js'
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
  const isPost = req.method === 'POST'
  const sendResult = (status: number, title: string, body: string) => {
    if (isPost) return res.status(status).end()
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(status).send(page(title, body))
  }

  const secret = process.env.ALERTS_TOKEN_SECRET
  if (!secret) {
    console.error('[unsubscribe] ALERTS_TOKEN_SECRET is not set')
    return sendResult(500, 'Something went wrong', 'Please try again later.')
  }

  const token = String((req.query.token ?? (req.body as Record<string, unknown>)?.token) ?? '')
  const payload = verifyToken(token, 'unsubscribe', secret)
  if (!payload) return sendResult(400, 'Invalid link', 'This unsubscribe link is invalid or has expired.')

  try {
    await deleteSubscriber(payload.subjectId)
  } catch (err) {
    console.error('[unsubscribe] db error', err)
    return sendResult(503, 'Something went wrong', 'We could not process your unsubscribe right now. Please try again shortly.')
  }

  return sendResult(200, "You're unsubscribed", "Your subscriptions and email have been deleted. You won't receive any more DataDiver alerts.")
}
