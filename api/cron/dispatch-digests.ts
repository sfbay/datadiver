// api/cron/dispatch-digests.ts — the daily matcher (CRON_SECRET-guarded).
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { NormalizedEvent } from '../../src/types/last48'
import type { DueSubscription } from '../../src/lib/alerts/types'
import { eventMatchesSubscription, isSubscriptionDue, haversineMiles } from '../../src/lib/alerts/match.js'
import { signToken } from '../../src/lib/alerts/tokens.js'
import { humanizeCallType, humanizeStreamName } from '../../src/utils/humanizeCivic.js'
import { getActiveConfirmedSubscriptions, markDispatched, markChecked, pruneSubscribeAttempts } from '../_lib/db.js'
import { fetchRecentEvents } from '../_lib/socrata.js'
import { sendDigestEmail, type DigestSection, type DigestItem } from '../_lib/email.js'

const WINDOW_MS = 48 * 60 * 60_000

function whenText(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function labelFor(loc: { label?: string; lat: number; lng: number }): string {
  return loc.label || `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`
}

function buildSections(sub: DueSubscription, events: NormalizedEvent[]): DigestSection[] {
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
  const buckets = new Map<string, DigestItem[]>()
  for (const loc of sub.locations) buckets.set(labelFor(loc), [])

  // newest first, so each bucket lists most-recent events first (sort on the
  // numeric timestamp, NOT the formatted string, which wouldn't be chronological)
  const ordered = [...events].sort((a, b) => b.receivedAt - a.receivedAt)
  for (const e of ordered) {
    if (e.latitude == null || e.longitude == null) continue
    let bestLabel = ''
    let bestDist = Infinity
    for (const loc of sub.locations) {
      const d = haversineMiles({ lat: e.latitude, lng: e.longitude }, { lat: loc.lat, lng: loc.lng })
      if (d < bestDist) { bestDist = d; bestLabel = labelFor(loc) }
    }
    const what = humanizeCallType(e.callType) || e.headline || 'Incident'
    const where = e.neighborhood ? ` — ${e.neighborhood}` : ''
    buckets.get(bestLabel)!.push({
      text: `${humanizeStreamName(e.datasetId)}: ${what}${where}`,
      href: `${base}/live-feeds?event=${encodeURIComponent(e.id)}`,
      when: whenText(e.receivedAt),
    })
  }

  return [...buckets.entries()]
    .filter(([, items]) => items.length > 0)
    .map(([locationLabel, items]) => ({ locationLabel, items: items.slice(0, 25) }))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron] CRON_SECRET is not set')
    return res.status(500).json({ error: 'server misconfigured' })
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const tokenSecret = process.env.ALERTS_TOKEN_SECRET
  if (!tokenSecret) {
    console.error('[cron] ALERTS_TOKEN_SECRET is not set')
    return res.status(500).json({ error: 'server misconfigured' })
  }

  try {
    await pruneSubscribeAttempts()
  } catch (err) {
    console.error('[cron] prune failed', err)
  }

  const now = Date.now()
  const due = (await getActiveConfirmedSubscriptions()).filter((s) => isSubscriptionDue(s, now))
  let sent = 0

  for (const sub of due) {
    try {
      const events = await fetchRecentEvents(sub.filters.streams, now - WINDOW_MS)
      const matched = events.filter((e) => eventMatchesSubscription(e, sub, sub.lastEventTs))
      if (matched.length === 0) {
        await markChecked(sub.id, now)
        continue
      }

      const sections = buildSections(sub, matched)
      const unsubToken = signToken(
        { purpose: 'unsubscribe', subjectId: sub.subscriberId, exp: now + 365 * 24 * 3600_000 },
        tokenSecret,
      )
      await sendDigestEmail(sub.email, sections, unsubToken)
      await markDispatched(sub.id, Math.max(...matched.map((m) => m.receivedAt)), now)
      sent++
    } catch (err) {
      // one bad subscription must not abort the whole run
      console.error('digest failed for subscription', sub.id, err)
    }
  }

  return res.status(200).json({ ok: true, due: due.length, sent })
}
