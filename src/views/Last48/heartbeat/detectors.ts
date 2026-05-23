// src/views/Last48/heartbeat/detectors.ts
//
// Heartbeat detectors — pure functions emitting candidate HeartbeatItems.
// Composed by useLast48Heartbeat. Each is independently testable.

import type { Detector, DetectorContext, HeartbeatItem } from '@/types/heartbeat'
import type { NormalizedEvent } from '@/types/last48'
import { humanizeCallType, humanizeStreamName } from '@/utils/humanizeCivic'
import { BREAKING_WINDOW_MS, classifySignificant, recencyBoost, timeAgo } from './significance'

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

// Tasks 6-7 append more detectors + the DETECTORS registry below.
// (The NormalizedEvent import is consumed by the rate-spike detector in Task 6.)
