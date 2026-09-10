//
// The tonal age ramp, shared by the Mapbox FLOW layer and the photoreal
// marker layer. Pure: (datasetId, ageMs) → colour. Extracted verbatim from
// FlowMapLayer.tsx on 2026-09-09 so both renderers age events identically;
// ageRamp.test.ts byte-pins the pigments, bucket stops and latency floors.
import type { DatasetId } from '@/types/last48'
import { mixHex } from '@/utils/colorMix'

export const COLORS: Record<DatasetId, string> = {
  '911-realtime':      '#616a96',
  'fire-ems-dispatch': '#b85a33',
  '311-cases':         '#7a9954',
}

// ─────────────────────────────────────────────────────────────────────────────
// Tonal age ramp — within each pigment family, events fade toward a paper-tone
// anchor as they age. Preserves the dataset's pigment identity (so the eye
// still reads "this is 911" from a glance) while making age legible as a
// tonal shift. Four discrete buckets across the 48h window for clarity
// (continuous interpolation smears the gradient illegibly on a dark basemap).
// ─────────────────────────────────────────────────────────────────────────────

export const PAPER_ANCHOR        = '#d4c8a8'  // paper-300 — the "drying-out" pigment target

// Effective-age bucket boundaries (hours since each dataset's natural
// freshness floor) and the corresponding mix coefficient. Both the fill
// (toward PAPER_ANCHOR) and the open-event stroke (cream → paper) use the
// same coefficient so they age in lockstep.
//
// Asymmetric curve: most of the tonal motion happens in the first 24 hours
// (where editorial differentiation matters — fresh news vs day-old news);
// the curve flattens in the second 24h so aged events still hold enough
// pigment identity to remain readable as their dataset.
export const AGE_BUCKETS: Array<{ maxHours: number; mix: number }> = [
  { maxHours: 6,  mix: 0    },  // freshness floor → +6h     — fresh
  { maxHours: 18, mix: 0.45 },  // +6h → +18h                — recent
  { maxHours: 30, mix: 0.60 },  // +18h → +30h               — settling
  { maxHours: 48, mix: 0.70 },  // +30h → +48h               — aged
]

// Per-dataset "freshness floor" — SF data publishes with intrinsic lag, so
// the freshest event we ever fetch for each dataset is already several hours
// old. Subtracting the baseline before bucketing means "fresh" tone (0% mix)
// is reserved for events at the freshest end of each dataset's natural
// delivery range — not at literal age 0, which never occurs.
//
// Values are inferred from observed event-lag floors (see brief). These are
// static; if a dataset's typical lag drifts substantially, recalibrate.
//
// The original 7h floor for 911 Realtime was a measurement artifact of the
// SF-local-vs-UTC timestamp bug (exactly the PDT offset). With epochs parsed
// correctly (sfTime.ts) the feed's true floor is ~15–30 min — re-measured
// 2026-07-01: MAX(received_datetime) was 16 min behind the SF clock.
export const LATENCY_BASELINE_MS: Record<DatasetId, number> = {
  '911-realtime':       30 * 60 * 1000,
  'fire-ems-dispatch': 12 * 60 * 60 * 1000,
  '311-cases':         15 * 60 * 60 * 1000,
}

/**
 * Resolve the bucket for an event's effective age — `rawAgeMs` minus the
 * dataset's freshness-floor baseline. An event right at the dataset's floor
 * (the freshest one we can practically see) lands in bucket 0.
 */
export function ageBucket(datasetId: DatasetId, rawAgeMs: number) {
  const effectiveMs = Math.max(0, rawAgeMs - LATENCY_BASELINE_MS[datasetId])
  const hours = effectiveMs / (60 * 60 * 1000)
  return AGE_BUCKETS.find((b) => hours < b.maxHours) ?? AGE_BUCKETS[AGE_BUCKETS.length - 1]
}

/** Resolve the dataset's pigment shifted by age toward the paper anchor. */
export function ageColor(datasetId: DatasetId, rawAgeMs: number): string {
  const base = COLORS[datasetId]
  const bucket = ageBucket(datasetId, rawAgeMs)
  if (bucket.mix === 0) return base
  return mixHex(base, PAPER_ANCHOR, bucket.mix)
}
