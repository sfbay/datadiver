// src/lib/alerts/pulseDigest.ts
// Shapes the digest email's "Neighborhood pulse" section: the elevated
// signals a location's overlapping neighborhoods carry, ranked and capped.
// Pure — shared by api/_lib/digest.ts and scripts/preview-digest.ts.
//
// Busy-only by product decision (Jesse, 2026-07-16): quiet readings need a
// publish-lag freshness gate the server doesn't compute (the Quakebot
// trap — a stream merely behind on publishing must never read as
// "unusually quiet"), so anomalyToWireItem is called with freshnessOk:false
// — which structurally suppresses every quiet item — and rise-only is
// asserted again below. Thresholds and tier words live in pulsePhrase.ts.
import type { AnomalyResult } from '../../types/last48.js'
import type { AlertStreamId } from './streams.js'
import { anomalyToWireItem, rankWire, type WireItem } from '../pulse/pulsePhrase.js'

/** Streams that can carry a pulse SIGNAL — enforced HERE as well as at the
 *  server fetch, so no caller can render a signal for a stream whose data
 *  cannot back a baseline. 911-realtime is deliberately absent: gnap-fj3t
 *  is a rolling recent-window feed (probed live 2026-07-16 — 19 rows older
 *  than 48h across the whole 84-day baseline window), so a 911 "baseline"
 *  would be fabricated from stragglers. api/_lib/pulse.ts imports this
 *  list for its fetch loop — one source of truth. */
export const PULSE_SIGNAL_STREAMS = ['fire-ems-dispatch', '311-cases'] as const

export const PULSE_MAX_ROWS = 4

export interface PulseRow {
  id: string
  /** For STREAM_META pigment/tag lookup in the renderer. */
  datasetId: AlertStreamId
  neighborhood: string
  /** "311 reports" — sentence-grammar stream noun (pulsePhrase). */
  subject: string
  magnitude: 1 | 2 | 3
  /** "≈2.1×" — current ÷ typical; null when no ratio is defensible. */
  ratioLabel: string | null
  count48h: number
  /** "usual ≈ 90" — the dejargoned comparison (pulsePhrase). */
  factLine: string
  /** Relative evidence link (/live?nh=…&fill=anomaly&points=off) — the
   *  renderer prefixes the absolute base. */
  href: string
}

function ratioLabel(ratio: number | undefined): string | null {
  if (ratio === undefined || !Number.isFinite(ratio)) return null
  const rounded = ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10
  return `≈${rounded}×`
}

/** Elevated signals for one location: anomalies whose neighborhood is in
 *  the overlap set, phrased by pulsePhrase (busy-only), ranked, capped. */
export function bucketPulse(
  anomalies: AnomalyResult[],
  neighborhoods: string[],
  nowMs: number,
): PulseRow[] {
  const inArea = new Set(neighborhoods)
  const byWireId = new Map<string, AnomalyResult>()
  const items: WireItem[] = []
  for (const a of anomalies) {
    // The allow-list subsumes the old 'combined' guard.
    if (!(PULSE_SIGNAL_STREAMS as readonly string[]).includes(a.datasetId)) continue
    if (!inArea.has(a.neighborhood)) continue
    const item = anomalyToWireItem(a, { freshnessOk: false, computedAt: nowMs })
    if (!item || item.signalType !== 'rise') continue
    byWireId.set(item.id, a)
    items.push(item)
  }
  return rankWire(items)
    .slice(0, PULSE_MAX_ROWS)
    .map((w) => {
      const a = byWireId.get(w.id)!
      return {
        id: w.id,
        datasetId: a.datasetId as AlertStreamId,
        neighborhood: a.neighborhood,
        subject: w.subject,
        magnitude: w.magnitude,
        ratioLabel: ratioLabel(w.ratio),
        count48h: a.count48h,
        factLine: w.factLine,
        href: w.evidenceHref,
      }
    })
}
