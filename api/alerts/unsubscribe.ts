// api/alerts/unsubscribe.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyToken } from '../../src/lib/alerts/tokens.js'
import { deleteSubscriber } from '../_lib/db.js'
import { renderPage } from '../_lib/pages.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const isPost = req.method === 'POST'
  const sendResult = (status: number, spec: Parameters<typeof renderPage>[0]) => {
    if (isPost) return res.status(status).end()
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(status).send(renderPage(spec))
  }

  const secret = process.env.ALERTS_TOKEN_SECRET
  if (!secret) {
    console.error('[unsubscribe] ALERTS_TOKEN_SECRET is not set')
    return sendResult(500, {
      eyebrow: 'Something went wrong',
      title: 'Please try again.',
      body: 'The server is misconfigured. Try the link again in a few minutes.',
      tone: 'error',
      cta: null,
    })
  }

  const token = String((req.query.token ?? (req.body as Record<string, unknown>)?.token) ?? '')
  const payload = verifyToken(token, 'unsubscribe', secret)
  if (!payload) {
    return sendResult(400, {
      eyebrow: 'Link expired',
      title: 'This link has expired.',
      body: 'This unsubscribe link is invalid or has expired. Use the link in any recent digest — every email carries a fresh one.',
      cta: null,
    })
  }

  try {
    await deleteSubscriber(payload.subjectId)
  } catch (err) {
    console.error('[unsubscribe] db error', err)
    return sendResult(503, {
      eyebrow: 'Something went wrong',
      title: 'Please try again.',
      body: 'We could not process your unsubscribe right now. Please try again shortly.',
      tone: 'error',
      cta: null,
    })
  }

  return sendResult(200, {
    eyebrow: 'All clear',
    title: "You're unsubscribed.",
    body: "Your subscriptions and email address have been deleted. You won't hear from DataDiver again.",
  })
}
