// api/_lib/digest.ts — one subscription's digest, built from pre-fetched
// stream results. Shared by the cron (regular editions, watermark-gated)
// and the confirm handler (first edition, fixed windows). Pure except for
// the MAPBOX_STATIC_TOKEN read.
import type { NormalizedEvent } from '../../src/types/last48'
import type { AlertEvent } from '../../src/lib/alerts/streams.js'
import { isLiveStream, isReleasedStream } from '../../src/lib/alerts/streams.js'
import type { DueSubscription } from '../../src/lib/alerts/types'
import { eventMatchesSubscription, releasedEventMatches, haversineMiles } from '../../src/lib/alerts/match.js'
import { classifySignificant } from '../../src/lib/alerts/significance.js'
import { watermarkFor } from '../../src/lib/alerts/watermarks.js'
import { unseenEvents, capReleasedPerStream } from '../../src/lib/alerts/sentIds.js'
import { buildStaticMapUrl } from '../../src/lib/alerts/staticMap.js'
import {
  summarize, busiestBuckets, bucketByDay, bucketReleased, radiusLabelText,
} from '../../src/lib/alerts/digestSummary.js'
import { mapAltText, type DigestPayload, type LocationDigest } from '../../src/lib/alerts/digestRender.js'
import type { StreamFetchResult } from './socrata.js'

export interface SubscriptionDigestResult {
  payload: DigestPayload
  /** Streams that fetched successfully this run (Set-deduped). */
  okStreams: string[]
  matchedLive: AlertEvent[]
  matchedReleased: AlertEvent[]
}

function locLabel(loc: { label?: string; lat: number; lng: number }): string {
  return loc.label || `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`
}

export function buildSubscriptionDigest(
  sub: DueSubscription,
  fetched: Record<string, StreamFetchResult>,
  now: number,
  opts: { windowLabel: string; useWatermarks: boolean },
): SubscriptionDigestResult {
  // Set-dedup defends grandfathered rows stored before validateDraft's dedup.
  const okStreams = [...new Set(sub.filters.streams)].filter((s) => fetched[s]?.ok)
  const liveEvents = okStreams.filter(isLiveStream).flatMap((s) => fetched[s].events)
  const releasedEvents = okStreams.filter(isReleasedStream).flatMap((s) => fetched[s].events)

  // Live: the watermark path (the welcome edition passes useWatermarks:false —
  // its fetch window is already the fixed trailing 24h). Released: radius +
  // stream only (categories are a 911/Fire concept), then sent-id memory.
  const matchedLive = liveEvents.filter((e) =>
    eventMatchesSubscription(e, sub, opts.useWatermarks ? watermarkFor(sub, e.datasetId) : 0),
  )
  // Cap AFTER the unseen filter and BEFORE anything renders or records:
  // sent-ids remember only what we actually send, so a dense corridor's
  // 90–120d catch-up drips ~25/stream per edition instead of flooding the
  // welcome email.
  const matchedReleased = capReleasedPerStream(
    unseenEvents(
      sub.sentEventIds,
      releasedEvents.filter((e) => releasedEventMatches(e, sub)),
    ),
  )

  const token = process.env.MAPBOX_STATIC_TOKEN || ''
  const radiusLabel = radiusLabelText(sub.radiusMiles)
  const locations: LocationDigest[] = []

  for (const loc of sub.locations) {
    const within = (e: AlertEvent) =>
      e.latitude != null &&
      e.longitude != null &&
      haversineMiles({ lat: e.latitude, lng: e.longitude }, { lat: loc.lat, lng: loc.lng }) <= sub.radiusMiles
    const liveIn = matchedLive.filter(within)
    const releasedIn = matchedReleased.filter(within)
    if (liveIn.length + releasedIn.length === 0) continue

    // Map dots are SIGNIFICANT events only — severe crashes now qualify via
    // the significance crash branch; business openings never do.
    const all = [...liveIn, ...releasedIn]
    const dots = all
      .filter((e) => classifySignificant(e) && e.latitude != null && e.longitude != null)
      .map((e) => ({ lat: e.latitude as number, lng: e.longitude as number }))
    const summary = summarize(all)
    locations.push({
      label: locLabel(loc),
      mapUrl: buildStaticMapUrl({ center: { lat: loc.lat, lng: loc.lng }, radiusMiles: sub.radiusMiles, dots, token }),
      mapAlt: mapAltText(locLabel(loc), radiusLabel, summary.significant),
      summary,
      // The heat strip + day groups speak the live clock; released events
      // are weeks old and render only in their own section below.
      buckets: busiestBuckets(liveIn),
      days: bucketByDay(liveIn, now),
      released: bucketReleased(releasedIn),
    })
  }

  return {
    payload: { windowLabel: opts.windowLabel, nowMs: now, locations },
    okStreams,
    matchedLive,
    matchedReleased,
  }
}

// Type-level guard that NormalizedEvent stays assignable to AlertEvent (the
// live normalizers return NormalizedEvent through the registry delegates).
const _assign: AlertEvent = null as unknown as NormalizedEvent
void _assign
