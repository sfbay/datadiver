// api/alerts/confirm.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { signToken, verifyToken } from '../../src/lib/alerts/tokens.js'
import { confirmSubscription, getConfirmedSubscription, markWelcomeSent } from '../_lib/db.js'
import { fetchStreamEvents } from '../_lib/socrata.js'
import { buildSubscriptionDigest } from '../_lib/digest.js'
import { fetchPulseContext } from '../_lib/pulse.js'
import { nextSentIds } from '../../src/lib/alerts/sentIds.js'
import { isLiveStream } from '../../src/lib/alerts/streams.js'
import { sendDigestEmail } from '../_lib/email.js'
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

  // First edition — best-effort, never blocks the confirmation. Covers the
  // trailing 24h of live streams (window override) plus the released-tier
  // catch-up at full registry windows. Watermarks were seeded at confirm
  // (pre-confirm live events appear here and ONLY here); sent-id memory is
  // written after the send so the catch-up self-heals into the first cron
  // digest if this fails. last_sent_at stays null — the regular cadence
  // starts with the next cron.
  let welcomeSent = false
  try {
    const sub = await getConfirmedSubscription(payload.subjectId)
    if (sub) {
      const now = Date.now()
      const liveOverrides = Object.fromEntries(
        sub.filters.streams.filter(isLiveStream).map((s) => [s, 24 * 3600_000]),
      )
      const fetched = await fetchStreamEvents(sub.filters.streams, now, liveOverrides)
      const pulseCtx = sub.filters.pulse !== false ? await fetchPulseContext(now) : null
      const result = buildSubscriptionDigest(sub, fetched, now, {
        windowLabel: 'your first edition — the last 24 hours',
        useWatermarks: false,
        pulseCtx,
      })
      if (result.payload.locations.length > 0) {
        const unsubToken = signToken(
          { purpose: 'unsubscribe', subjectId: sub.subscriberId, exp: now + 90 * 24 * 3600_000 },
          secret,
        )
        await sendDigestEmail(sub.email, result.payload, unsubToken)
        await markWelcomeSent(sub.id, nextSentIds(sub.sentEventIds, result.matchedReleased, now))
        welcomeSent = true
      }
    }
  } catch (err) {
    console.error('[confirm] first edition failed (non-fatal)', err)
  }

  return res.status(200).send(renderPage({
    eyebrow: 'Alert active',
    title: "You're in.",
    body: welcomeSent
      ? "This alert is confirmed, and your first edition is on its way — a snapshot of the last 24 hours near your places. After this, you'll get a daily email when matching events happen; quiet days send nothing."
      : "This alert is confirmed. You'll get a daily email when matching events happen near your locations — quiet days send nothing.",
  }))
}
