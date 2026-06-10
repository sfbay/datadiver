// api/cron/dispatch-digests.ts — the daily matcher (CRON_SECRET-guarded).
import { timingSafeEqual } from 'node:crypto'
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

// AP-style date+time in SF local time: "June 9, 2:22 p.m." / "Sept. 3, 11:05 a.m."
// Months of five letters or fewer are spelled out; longer months abbreviate with
// a period; meridiem is lowercase with periods. (Can't reuse formatApTime from
// src/utils — it reads the runtime's local clock, which on Vercel is UTC. The
// explicit timeZone here is load-bearing.)
const AP_MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.']

function whenText(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(new Date(ms))
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? ''
  const month = AP_MONTHS[Number(get('month')) - 1] ?? get('month')
  const period = get('dayPeriod').toLowerCase().startsWith('p') ? 'p.m.' : 'a.m.'
  return `${month} ${get('day')}, ${get('hour')}:${get('minute')} ${period}`
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
    const what = humanizeCallType(e.callType) || e.headline || 'Incident'
    const where = e.neighborhood ? ` — ${e.neighborhood}` : ''
    const item: DigestItem = {
      text: `${humanizeStreamName(e.datasetId)}: ${what}${where}`,
      href: `${base}/live-feeds?event=${encodeURIComponent(e.id)}`,
      when: whenText(e.receivedAt),
    }
    // The bucket label promises "within R miles of this place" — so an event
    // lands in EVERY bucket whose radius actually contains it. Nearest-center
    // assignment alone could file an event under a pin that didn't match
    // (closer center, but outside that pin's circle).
    for (const loc of sub.locations) {
      const d = haversineMiles({ lat: e.latitude, lng: e.longitude }, { lat: loc.lat, lng: loc.lng })
      if (d <= sub.radiusMiles) buckets.get(labelFor(loc))!.push(item)
    }
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
      // 90 days, not a year: a fresh token rides in every digest anyway, and
      // tokens are stateless (no revocation) — shorter life bounds how long a
      // leaked/forwarded digest can silently unsubscribe someone.
      const unsubToken = signToken(
        { purpose: 'unsubscribe', subjectId: sub.subscriberId, exp: now + 90 * 24 * 3600_000 },
        tokenSecret,
      )
      await sendDigestEmail(sub.email, sections, unsubToken)
      // reduce, not Math.max(...spread) — spread puts every element on the
      // call stack and throws RangeError on large matched arrays.
      const newWatermark = matched.reduce((max, m) => Math.max(max, m.receivedAt), 0)
      await markDispatched(sub.id, newWatermark, now)
      sent++
    } catch (err) {
      // one bad subscription must not abort the whole run
      console.error('digest failed for subscription', sub.id, err)
    }
  }

  return res.status(200).json({ ok: true, due: due.length, sent })
}
