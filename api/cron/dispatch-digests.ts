// api/cron/dispatch-digests.ts — the daily matcher (CRON_SECRET-guarded).
import { timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { NormalizedEvent } from '../../src/types/last48'
import type { Cadence, DueSubscription } from '../../src/lib/alerts/types'
import { eventMatchesSubscription, isSubscriptionDue, haversineMiles } from '../../src/lib/alerts/match.js'
import { classifySignificant } from '../../src/lib/alerts/significance.js'
import { signToken } from '../../src/lib/alerts/tokens.js'
import { buildStaticMapUrl } from '../../src/lib/alerts/staticMap.js'
import { summarize, busiestBuckets, bucketByTimeOfDay, radiusLabelText } from '../../src/lib/alerts/digestSummary.js'
import { mapAltText, type DigestPayload, type LocationDigest } from '../../src/lib/alerts/digestRender.js'
import { getActiveConfirmedSubscriptions, markDispatched, markChecked, pruneStaleRows } from '../_lib/db.js'
import { fetchStreamEvents } from '../_lib/socrata.js'
import { sendDigestEmail } from '../_lib/email.js'
import { watermarkFor, nextWatermarks } from '../../src/lib/alerts/watermarks.js'

const WINDOW_MS = 48 * 60 * 60_000

const WINDOW_LABEL: Record<Cadence, string> = {
  hourly: 'past hour',
  daily: 'past 24 hours',
  weekly: 'past 7 days',
}

function locLabel(loc: { label?: string; lat: number; lng: number }): string {
  return loc.label || `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`
}

function buildPayload(sub: DueSubscription, events: NormalizedEvent[]): DigestPayload {
  const token = process.env.MAPBOX_STATIC_TOKEN || ''
  const radiusLabel = radiusLabelText(sub.radiusMiles)
  const locations: LocationDigest[] = []

  for (const loc of sub.locations) {
    // Per-location subset: every event inside THIS pin's radius (an event can
    // land in more than one pin's circle — that's intended, each map is "within
    // R of this place").
    const inRadius = events.filter(
      (e) =>
        e.latitude != null &&
        e.longitude != null &&
        haversineMiles({ lat: e.latitude, lng: e.longitude }, { lat: loc.lat, lng: loc.lng }) <= sub.radiusMiles,
    )
    if (inRadius.length === 0) continue

    // Map dots are SIGNIFICANT events only (the spec's "impressionistic
    // orientation" — a dot means something serious happened). buildStaticMapUrl
    // caps at 20 on top of this.
    const dots = inRadius
      .filter((e) => classifySignificant(e) && e.latitude != null && e.longitude != null)
      .map((e) => ({ lat: e.latitude as number, lng: e.longitude as number }))
    const summary = summarize(inRadius)
    locations.push({
      label: locLabel(loc),
      mapUrl: buildStaticMapUrl({ center: { lat: loc.lat, lng: loc.lng }, radiusMiles: sub.radiusMiles, dots, token }),
      mapAlt: mapAltText(locLabel(loc), radiusLabel, summary.significant),
      summary,
      buckets: busiestBuckets(inRadius),
      blocks: bucketByTimeOfDay(inRadius),
    })
  }

  return { windowLabel: WINDOW_LABEL[sub.cadence], locations }
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
  const fetched = due.length > 0 ? await fetchStreamEvents(uniqueStreams, now - WINDOW_MS) : {}

  for (const sub of due) {
    try {
      const okStreams = sub.filters.streams.filter((s) => fetched[s]?.ok)
      if (okStreams.length === 0) {
        // Every stream this subscription reads failed to fetch. Leave BOTH
        // clocks alone so the next run retries in full — advancing
        // last_sent_at here would swallow a whole cadence period on an
        // upstream outage.
        console.error('[cron] all streams failed for subscription', sub.id)
        continue
      }
      const events = okStreams.flatMap((s) => fetched[s].events)
      // Per-stream watermarks: a failed stream's mark never advances (its
      // events return next run), so one stream's success can no longer
      // discard another stream's backlog.
      const matched = events.filter((e) => eventMatchesSubscription(e, sub, watermarkFor(sub, e.datasetId)))
      if (matched.length === 0) {
        await markChecked(sub.id, now)
        continue
      }

      const payload = buildPayload(sub, matched)
      if (payload.locations.length === 0) {
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
      await sendDigestEmail(sub.email, payload, unsubToken)
      await markDispatched(sub.id, nextWatermarks(sub, matched), now)
      sent++
    } catch (err) {
      // one bad subscription must not abort the whole run
      console.error('digest failed for subscription', sub.id, err)
    }
  }

  return res.status(200).json({ ok: true, due: due.length, sent })
}
