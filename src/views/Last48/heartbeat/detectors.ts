// src/views/Last48/heartbeat/detectors.ts
//
// Heartbeat detectors — pure functions emitting candidate HeartbeatItems.
// Composed by useLast48Heartbeat. Each is independently testable.

import type { Detector, DetectorContext, HeartbeatItem } from '@/types/heartbeat'
import type { NormalizedEvent } from '@/types/last48'
import { humanizeCallType } from '@/utils/humanizeCivic'
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

// Tasks 5-7 append more detectors + the DETECTORS registry below.
// (The NormalizedEvent import is consumed by the rate-spike detector in Task 6.)
