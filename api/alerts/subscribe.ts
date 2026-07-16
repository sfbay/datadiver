// api/alerts/subscribe.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SubscriptionDraft } from '../../src/lib/alerts/types'
import { signToken } from '../../src/lib/alerts/tokens.js'
import { validateDraft } from '../../src/lib/alerts/validateDraft.js'
import { createPendingSubscription, recordSubscribeAttempt } from '../_lib/db.js'
import { sendConfirmEmail } from '../_lib/email.js'

const MAX_PER_IP_PER_HOUR = 10

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const secret = process.env.ALERTS_TOKEN_SECRET
  if (!secret) {
    console.error('[subscribe] ALERTS_TOKEN_SECRET is not set')
    return res.status(500).json({ error: 'server misconfigured' })
  }

  // validateDraft never throws by contract; the try is defense in depth so a
  // future edit can't turn malformed JSON shapes into unhandled 500s again.
  let draft: SubscriptionDraft | string
  try {
    draft = validateDraft(req.body)
  } catch {
    draft = 'invalid body'
  }
  if (typeof draft === 'string') return res.status(400).json({ error: draft })

  const ip = ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() || 'unknown'
  // Vercel always sets x-forwarded-for; if that ever changes, every caller
  // shares the 'unknown' bucket and the per-IP limit silently becomes a
  // global one. Log loudly so the failure mode is visible.
  if (ip === 'unknown') console.warn('[subscribe] no x-forwarded-for header — rate-limit bucket is global')

  try {
    const attempts = await recordSubscribeAttempt(ip)
    if (attempts > MAX_PER_IP_PER_HOUR) return res.status(429).json({ error: 'too many requests, try later' })

    const { subscriberId } = await createPendingSubscription(draft)
    const token = signToken(
      { purpose: 'confirm', subjectId: subscriberId, exp: Date.now() + 7 * 24 * 3600_000 },
      secret,
    )
    await sendConfirmEmail(draft.email, token)
  } catch (err) {
    console.error('[subscribe] downstream error', err)
    return res.status(503).json({ error: 'service unavailable, try again shortly' })
  }

  // Same response regardless of whether the email was new — no account enumeration.
  return res.status(200).json({ ok: true })
}
