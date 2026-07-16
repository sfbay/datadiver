// api/cron/dispatch-digests.ts — the daily matcher (CRON_SECRET-guarded).
import { timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Cadence } from '../../src/lib/alerts/types'
import { isSubscriptionDue } from '../../src/lib/alerts/match.js'
import { signToken } from '../../src/lib/alerts/tokens.js'
import { nextWatermarks } from '../../src/lib/alerts/watermarks.js'
import { nextSentIds } from '../../src/lib/alerts/sentIds.js'
import { getActiveConfirmedSubscriptions, markDispatched, markChecked, pruneStaleRows } from '../_lib/db.js'
import { fetchStreamEvents } from '../_lib/socrata.js'
import { sendDigestEmail } from '../_lib/email.js'
import { buildSubscriptionDigest } from '../_lib/digest.js'

const WINDOW_LABEL: Record<Cadence, string> = {
  hourly: 'past hour',
  daily: 'published since your last digest',
  weekly: 'past 7 days',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron] CRON_SECRET is not set')
    return res.status(500).json({ error: 'server misconfigured' })
  }
  // Constant-time comparison — `!==` short-circuits on the first differing
  // byte, leaking the secret via timing. (tokens.ts already does this for
  // HMAC payloads; the cron guard deserves the same discipline.)
  const provided = Buffer.from(String(req.headers.authorization ?? ''))
  const expected = Buffer.from(`Bearer ${cronSecret}`)
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const tokenSecret = process.env.ALERTS_TOKEN_SECRET
  if (!tokenSecret) {
    console.error('[cron] ALERTS_TOKEN_SECRET is not set')
    return res.status(500).json({ error: 'server misconfigured' })
  }

  try {
    await pruneStaleRows()
  } catch (err) {
    console.error('[cron] prune failed', err)
  }

  const now = Date.now()
  const due = (await getActiveConfirmedSubscriptions()).filter((s) => isSubscriptionDue(s, now))
  let sent = 0

  // One fetch per unique stream per run — not per subscription.
  const uniqueStreams = [...new Set(due.flatMap((s) => s.filters.streams))]
  const fetched = due.length > 0 ? await fetchStreamEvents(uniqueStreams, now) : {}

  for (const sub of due) {
    try {
      const result = buildSubscriptionDigest(sub, fetched, now, {
        windowLabel: WINDOW_LABEL[sub.cadence],
        useWatermarks: true,
      })
      if (result.okStreams.length === 0) {
        // Every stream this subscription reads failed to fetch. Leave ALL
        // clocks alone so the next run retries in full.
        console.error('[cron] all streams failed for subscription', sub.id)
        continue
      }
      if (result.payload.locations.length === 0) {
        await markChecked(sub.id, now)
        continue
      }
      // 90 days, not a year: a fresh token rides in every digest anyway, and
      // tokens are stateless (no revocation) — shorter life bounds how long a
      // leaked/forwarded digest can silently unsubscribe someone.
      const unsubToken = signToken(
        { purpose: 'unsubscribe', subjectId: sub.subscriberId, exp: now + 90 * 24 * 3600_000 },
        tokenSecret,
      )
      await sendDigestEmail(sub.email, result.payload, unsubToken)
      await markDispatched(
        sub.id,
        nextWatermarks(sub, result.matchedLive),
        nextSentIds(sub.sentEventIds, result.matchedReleased, now),
        now,
      )
      sent++
    } catch (err) {
      // one bad subscription must not abort the whole run
      console.error('digest failed for subscription', sub.id, err)
    }
  }

  return res.status(200).json({ ok: true, due: due.length, sent })
}
