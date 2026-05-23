// src/views/Last48/heartbeat/detectors.ts
//
// Heartbeat detectors — pure functions emitting candidate HeartbeatItems.
// Composed by useLast48Heartbeat. Each is independently testable.

import type { Detector, DetectorContext, HeartbeatItem } from '@/types/heartbeat'
import type { NormalizedEvent } from '@/types/last48'
import { humanizeCallType, humanizeStreamName } from '@/utils/humanizeCivic'
import { BREAKING_WINDOW_MS, classifySignificant, recencyBoost, spellNumber, timeAgo } from './significance'

function base(now: number): Pick<HeartbeatItem, 'freshness' | 'computedAt' | 'detail'> {
  return { freshness: 'live', computedAt: new Date(now), detail: undefined }
}

// ── 1. Significant events ──────────────────────────────────────────────────
export const detectSignificantEvents: Detector = (ctx: DetectorContext) => {
  const out: HeartbeatItem[] = []
  for (const e of ctx.events) {
    if (e.datasetId === '311-cases') continue
    const cat = classifySignificant(e)
    const isPriorityA = e.datasetId === '911-realtime' && e.priority === 'A'
    if (!cat && !isPriorityA) continue

    const baseScore = cat ? (cat.key === 'fire' ? 55 : 65) : 60
    const score = baseScore + recencyBoost(e.receivedAt, ctx.now)
    const breaking = ctx.now - e.receivedAt < BREAKING_WINDOW_MS && score >= 60
    const where = e.neighborhood ?? 'San Francisco'
    const what = humanizeCallType(e.callType ?? e.headline) || 'Significant incident'

    out.push({
      id: `hb-event:${e.id}`,
      headline: `${what} — ${where} · ${timeAgo(e.receivedAt, ctx.now)}`,
      category: 'live',
      severity: cat?.key === 'fire' ? 'negative' : 'alert',
      source: { view: '/live-feeds', label: `${what} · ${where}` },
      priority: Math.round(score),
      score,
      breaking,
      intent: { type: 'event', eventId: e.id },
      ...base(ctx.now),
    })
  }
  return out
}

// ── 2. Neighborhood anomaly surge ──────────────────────────────────────────
const Z_THRESHOLD = 2.0
const MIN_SURGE_VOLUME = 8
const MAX_SURGES = 3

export const detectNeighborhoodSurge: Detector = (ctx) => {
  return ctx.anomalies
    .filter((a) => a.zScore >= Z_THRESHOLD && a.count48h >= MIN_SURGE_VOLUME && a.neighborhood)
    .sort((a, b) => b.zScore - a.zScore)
    .slice(0, MAX_SURGES)
    .map((a) => {
      const intensity = a.zScore >= 3 ? 'dramatically' : 'well'
      const stream = humanizeStreamName(a.datasetId)
      const score = 70 + Math.min(25, (a.zScore - 2) * 10)
      return {
        id: `hb-surge:${a.datasetId}:${a.neighborhood}`,
        headline: `${stream} in the ${a.neighborhood} are running ${intensity} above normal today.`,
        category: 'anomaly',
        severity: a.zScore >= 3 ? 'alert' : 'negative',
        source: { view: '/live-feeds', label: `${a.neighborhood} · ${stream}` },
        priority: Math.round(score),
        score,
        intent: { type: 'neighborhood', neighborhood: a.neighborhood },
        ...base(ctx.now),
      } as HeartbeatItem
    })
}

// ── 3. Citywide stream rate spike ──────────────────────────────────────────
// "Recent" is anchored to each stream's NEWEST event, not wall-clock now —
// SF data publishes hours late, so a "last 3h of now" window is always empty.
const RECENT_HOURS = 3
const SPIKE_PCT = 0.30
const MIN_RECENT = 5

export const detectStreamRateSpike: Detector = (ctx) => {
  const byDataset = new Map<NormalizedEvent['datasetId'], NormalizedEvent[]>()
  for (const e of ctx.events) {
    const arr = byDataset.get(e.datasetId) ?? []
    arr.push(e)
    byDataset.set(e.datasetId, arr)
  }

  const out: HeartbeatItem[] = []
  for (const [datasetId, evs] of byDataset) {
    if (evs.length < MIN_RECENT) continue
    const maxT = Math.max(...evs.map((e) => e.receivedAt))
    const recentCutoff = maxT - RECENT_HOURS * 3600_000
    const recent = evs.filter((e) => e.receivedAt >= recentCutoff)
    if (recent.length < MIN_RECENT) continue

    const recentPerHour = recent.length / RECENT_HOURS
    const avgPerHour = evs.length / 48
    if (avgPerHour <= 0 || recentPerHour < avgPerHour * (1 + SPIKE_PCT)) continue

    const pct = recentPerHour / avgPerHour - 1
    const score = 68 + Math.min(20, (pct - SPIKE_PCT) * 40)
    out.push({
      id: `hb-rate:${datasetId}`,
      headline: `${humanizeStreamName(datasetId)} have been coming in faster than usual lately.`,
      category: 'trend',
      severity: 'negative',
      source: { view: '/live-feeds', label: humanizeStreamName(datasetId) },
      priority: Math.round(score),
      score,
      intent: { type: 'none' },
      ...base(ctx.now),
    })
  }
  return out
}

// ── 4. Repeated significant type ───────────────────────────────────────────
const REPEAT_THRESHOLD = 3

export const detectRepeatedType: Detector = (ctx) => {
  const counts = new Map<string, { plural: string; n: number }>()
  for (const e of ctx.events) {
    const cat = classifySignificant(e)
    if (!cat) continue
    const cur = counts.get(cat.key) ?? { plural: cat.plural, n: 0 }
    cur.n += 1
    counts.set(cat.key, cur)
  }

  const out: HeartbeatItem[] = []
  for (const { plural, n } of counts.values()) {
    if (n < REPEAT_THRESHOLD) continue
    const score = 75 + Math.min(20, (n - REPEAT_THRESHOLD) * 3)
    out.push({
      id: `hb-repeat:${plural}`,
      headline: `${spellNumber(n)} ${plural} reported across the city in the last 48 hours.`,
      category: 'anomaly',
      severity: 'alert',
      source: { view: '/live-feeds', label: `${n} ${plural}` },
      priority: Math.round(score),
      score,
      intent: { type: 'none' },
      ...base(ctx.now),
    })
  }
  return out
}

// ── Registry ───────────────────────────────────────────────────────────────
export const DETECTORS: Detector[] = [
  detectSignificantEvents,
  detectNeighborhoodSurge,
  detectStreamRateSpike,
  detectRepeatedType,
]
