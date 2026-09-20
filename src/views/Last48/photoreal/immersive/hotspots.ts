// src/views/Last48/photoreal/immersive/hotspots.ts
//
// HOTSPOTS — the computed half of the rail's presets (Round B §2): "places
// the data says are worth seeing". The same 48 h anomaly engine the Last 48
// choropleth and the Pulse read, reduced to the top four neighborhoods.
// Every rule here is borrowed, not invented, so a hotspot tile can only
// appear when the Pulse would say something about that neighborhood:
//   · combine per neighborhood with Stouffer (Σz/√k) — anomalyRamp.combineZ;
//   · the line is the Pulse's first tier, z ≥ 1.5;
//   · the freshness gate is the Pulse's — a stream behind on publishing
//     contributes nothing (busy OR quiet: with no fresh count there is no
//     reading, and a stale "busy" would be yesterday's news);
//   · a QUIET reading never surfaces (negative z) — a hotspot is a place to
//     go look at, and there is nothing to look at in an absence;
//   · the tier word is the phrase layer's, never a figure.
// Fly-to = the centroid of the neighborhood's events in the current window
// (the events are the story, not the polygon); a neighborhood with no
// located events is skipped — there would be nothing to fly to.
import { combineZ } from '../../modes/anomalyRamp'
import { combinedDeviation } from '@/lib/pulse/pulsePhrase'
import { FRESH_MAX_MS } from '@/lib/pulse/anomalyStats'
import type { AnomalyResult, DatasetId, FreshnessMap, NormalizedEvent } from '@/types/last48'

export const HOTSPOT_MIN_Z = 1.5
export const HOTSPOT_LIMIT = 4
/** Camera distance for a hotspot detour — a neighborhood, not a doorway. */
export const HOTSPOT_RANGE_M = 700
/** The ramp's three warm stops (ochre / terracotta / brick) — the tile's
 *  colour block says the tier the caption says. */
export const HOTSPOT_TIER_COLOR: Record<1 | 2 | 3, string> = { 1: '#d4a435', 2: '#b85a33', 3: '#963e30' }

export interface Hotspot {
  neighborhood: string
  /** Combined z (Σz/√k over the FRESH streams). */
  z: number
  tier: 1 | 2 | 3
  /** The Pulse tier word — "above usual", "well above usual", "far above usual". */
  caption: string
  /** Centroid of the neighborhood's located events in the window. */
  lng: number
  lat: number
  /** How many located events fed the centroid. */
  count: number
}

function streamFresh(freshness: FreshnessMap, id: DatasetId): boolean {
  const lag = freshness[id]?.eventLagMs
  return lag != null && lag < FRESH_MAX_MS
}

export function selectHotspots(
  anomalies: readonly AnomalyResult[],
  freshness: FreshnessMap,
  events: readonly NormalizedEvent[],
  limit: number = HOTSPOT_LIMIT,
): Hotspot[] {
  const zsByNh = new Map<string, number[]>()
  for (const a of anomalies) {
    if (a.datasetId === 'combined') continue
    if (!streamFresh(freshness, a.datasetId)) continue
    const zs = zsByNh.get(a.neighborhood) ?? []
    zs.push(a.zScore)
    zsByNh.set(a.neighborhood, zs)
  }

  const sums = new Map<string, { lng: number; lat: number; n: number }>()
  for (const e of events) {
    if (!e.neighborhood || e.longitude == null || e.latitude == null) continue
    const s = sums.get(e.neighborhood) ?? { lng: 0, lat: 0, n: 0 }
    s.lng += e.longitude; s.lat += e.latitude; s.n += 1
    sums.set(e.neighborhood, s)
  }

  const out: Hotspot[] = []
  for (const [neighborhood, zs] of zsByNh) {
    const z = combineZ(zs)
    if (z < HOTSPOT_MIN_Z) continue
    const s = sums.get(neighborhood)
    if (!s || s.n === 0) continue
    const d = combinedDeviation(z)
    out.push({ neighborhood, z, tier: d.magnitude, caption: d.short, lng: s.lng / s.n, lat: s.lat / s.n, count: s.n })
  }
  out.sort((a, b) => b.z - a.z || a.neighborhood.localeCompare(b.neighborhood))
  return out.slice(0, limit)
}
