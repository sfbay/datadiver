// api/_lib/pulse.ts — the digest's per-run Pulse context: per-neighborhood
// z-scores for the three live streams + the Analysis Neighborhood polygons.
// Fetched ONCE per cron run (the fetchStreamEvents pattern) and shared
// across subscriptions; each subscription then selects the neighborhoods
// its pins overlap (src/lib/alerts/pulseDigest.ts).
//
// ALL-OR-NOTHING: any failure — a baseline query, a current-count query,
// the boundaries asset — returns null and every digest sends WITHOUT the
// section. Pulse is garnish, never the meal, and a partial read (two
// streams of three) would claim a neighborhood picture we don't have.
//
// VOCABULARY: the 41 Analysis Neighborhoods for ALL THREE streams —
// including 311, which the CLIENT hook baselines on the finer
// neighborhoods_sffind_boundaries vocabulary instead. The polygons the pins
// overlap (properties.nhood) speak the 41-name vocabulary, so the server
// groups 311 on analysis_neighborhood (column probed live 2026-07-16); a
// sffind-keyed z could never join the geometry. See the PR E spec.
import type { AnomalyResult, DatasetId } from '../../src/types/last48'
import { ALERT_STREAMS, ALERT_STREAM_IDS, isLiveStream } from '../../src/lib/alerts/streams.js'
import { baselineWindow } from '../../src/hooks/anomalyBaselineWindow.js'
import { bucketDailyCounts, computeAnomalies, type BaselineRow } from '../../src/lib/pulse/anomalyStats.js'
import { sfLocalCutoff } from '../../src/utils/sfTime.js'
import type { BoundaryCollection } from '../../src/utils/polygonRadius.js'

export interface PulseContext {
  anomalies: AnomalyResult[]
  boundaries: BoundaryCollection
}

/** GROUP BY column per live stream — the 41-name vocabulary everywhere
 *  (see module note; NOT the registry's normalizer fields, which for 311
 *  carry sffind). */
const NH_FIELD: Record<string, string> = {
  '911-realtime': 'analysis_neighborhood',
  'fire-ems-dispatch': 'neighborhoods_analysis_boundaries',
  '311-cases': 'analysis_neighborhood',
}

const HOUR = 3600_000

async function fetchRows<T>(socrataId: string, params: Record<string, string>): Promise<T[]> {
  const url = new URL(`https://data.sfgov.org/resource/${socrataId}.json`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const token = process.env.SOCRATA_APP_TOKEN
  const res = await fetch(url, token ? { headers: { 'X-App-Token': token } } : undefined)
  if (!res.ok) throw new Error(`socrata ${socrataId} ${res.status}`)
  return (await res.json()) as T[]
}

// The ~1 MB boundaries asset is our own deployed static file — fetched once
// per warm function instance, never bundled into the function.
let boundariesCache: BoundaryCollection | null = null
async function fetchBoundaries(): Promise<BoundaryCollection> {
  if (boundariesCache) return boundariesCache
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
  if (!base) throw new Error('PUBLIC_BASE_URL is not set')
  const res = await fetch(`${base}/data/geo/sf-analysis-neighborhoods.geojson`)
  if (!res.ok) throw new Error(`boundaries fetch ${res.status}`)
  boundariesCache = (await res.json()) as BoundaryCollection
  return boundariesCache
}

async function fetchStreamAnomalies(id: DatasetId, nowMs: number): Promise<AnomalyResult[]> {
  const cfg = ALERT_STREAMS[id]
  const nhField = NH_FIELD[id]
  const { since, until } = baselineWindow(nowMs)
  const baselineRows = await fetchRows<BaselineRow>(cfg.socrataId, {
    $select: `${nhField} as neighborhood, date_trunc_ymd(${cfg.dateField}) as window_start, COUNT(*) as cnt`,
    $where: `${cfg.dateField} >= '${since}' AND ${cfg.dateField} < '${until}' AND ${nhField} IS NOT NULL`,
    $group: `${nhField}, date_trunc_ymd(${cfg.dateField})`,
    $limit: '50000',
  })
  // Current 48h counts come from their OWN aggregate — server-side truth.
  // The cron's fetched event rows are watermark-scoped and page-capped, so
  // counting them would undercount; the anomaly window is also fixed at 48h
  // regardless of the welcome edition's 24h live override.
  const currentRows = await fetchRows<{ neighborhood?: string; cnt: string }>(cfg.socrataId, {
    $select: `${nhField} as neighborhood, COUNT(*) as cnt`,
    $where: `${cfg.dateField} >= '${sfLocalCutoff(nowMs - 48 * HOUR)}' AND ${nhField} IS NOT NULL`,
    $group: nhField,
    $limit: '200',
  })
  const current: Record<string, number> = {}
  for (const r of currentRows) {
    if (r.neighborhood) current[r.neighborhood] = parseInt(r.cnt, 10)
  }
  return computeAnomalies(bucketDailyCounts(baselineRows), current, id)
}

/** The per-run Pulse context, or null when any piece fails — callers send
 *  the digest without the section; never defer a send for pulse. */
export async function fetchPulseContext(nowMs: number): Promise<PulseContext | null> {
  try {
    const liveIds = ALERT_STREAM_IDS.filter(isLiveStream) as DatasetId[]
    const boundariesP = fetchBoundaries()
    const perStream = await Promise.all(liveIds.map((id) => fetchStreamAnomalies(id, nowMs)))
    const boundaries = await boundariesP
    return { anomalies: perStream.flat(), boundaries }
  } catch (err) {
    console.error('[pulse] context fetch failed — digests send without the pulse section', err)
    return null
  }
}
