// src/lib/alerts/streams.ts
// THE registry for alert digest streams — single source for stream
// vocabulary, Socrata endpoints, fetch windows, tiers, labels, pigments,
// released-tier framing copy, and row normalization. validateDraft, the
// server fetch, and the digest renderer all read from here so the
// vocabulary can never drift (this replaces the LAST48_DATASETS borrow,
// which couldn't name non-Last48 streams).
//
// Ground truth for the two released-tier datasets (probed live 2026-07-16,
// recorded in docs/superpowers/specs/2026-07-16-alerts-stream-expansion-design.md):
// both are FULL-REPLACE pipelines — data_loaded_at and Socrata's :created_at
// are re-stamped dataset-wide on every load, so there is NO per-row
// publication signal. "Newly released" is detected by per-subscription
// sent-id memory (sentIds.ts), never by watermarks.
//
// Runtime imports are relative + .js-suffixed: this module bundles into the
// Vercel API functions (Node ESM resolution).
import type { DatasetId, NormalizedEvent } from '../../types/last48.js'
import { normalizeEvent, cleanStreetLabel, parsePoint } from '../../utils/eventNormalization.js'
import { parseSfLocal, sfLocalCutoff } from '../../utils/sfTime.js'
import { naicsSector, UNCATEGORIZED } from '../../utils/naicsSector.js'

export type AlertStreamId = DatasetId | 'traffic-crashes' | 'business-openings'

/** NormalizedEvent with the stream union widened. Every NormalizedEvent is
 *  structurally assignable to AlertEvent; Last 48's exhaustive switches on
 *  DatasetId stay untouched. */
export type AlertEvent = Omit<NormalizedEvent, 'datasetId'> & { datasetId: AlertStreamId }

const HOUR = 3600_000
const DAY = 24 * HOUR

export interface AlertStreamConfig {
  socrataId: string
  dateField: string
  /** live = event time ≈ publication time (watermark dedup);
   *  released = batch publication on a full-replace pipeline (sent-id dedup). */
  tier: 'live' | 'released'
  /** Fetch window, measured back from "now" on the event-date field. */
  windowMs: number
  /** Sentence-grammar name ("911 calls" — keeps the trailing noun). */
  labelLong: string
  /** Dense-row label, no trailing noun ("911", "Crashes"). */
  labelShort: string
  /** Email stat-header / row tag (uppercase). */
  tag: string
  /** Canonical stream pigment. The live three MUST equal FlowMapLayer
   *  COLORS (pinned by streams.test.ts). */
  hex: string
  /** Reader-facing framing line for the email's "Newly released" section. */
  releasedNote?: string
  /** Extra server-side row filter appended to the fetch $where. */
  extraWhere?: string
  normalize: (row: Record<string, unknown>) => AlertEvent | null
}

/** "Vehicle-pedestrian crash" / "Rear end crash" / "Traffic crash". */
function crashTypeLabel(row: Record<string, unknown>): string {
  const raw = typeof row.type_of_collision === 'string' ? row.type_of_collision : ''
  if (!raw || raw === 'Not Stated' || raw === 'Other') return 'Traffic crash'
  if (raw === 'Vehicle/Pedestrian') return 'Vehicle-pedestrian crash'
  const t = raw.toLowerCase()
  return `${t.charAt(0).toUpperCase()}${t.slice(1)} crash`
}

function crashHeadline(row: Record<string, unknown>): string {
  const label = crashTypeLabel(row)
  const killed = Number(row.number_killed ?? 0)
  const injured = Number(row.number_injured ?? 0)
  if (killed > 0) return `${label} — ${killed === 1 ? 'one person' : `${killed} people`} killed`
  if (row.collision_severity === 'Injury (Severe)') return `${label} — severe injury`
  if (injured > 0) return `${label} — ${injured === 1 ? 'one person' : `${injured} people`} injured`
  return label
}

function normalizeCrash(row: Record<string, unknown>): AlertEvent | null {
  const ts = typeof row.collision_datetime === 'string' ? row.collision_datetime : null
  if (!ts) return null
  const ms = parseSfLocal(ts)
  if (isNaN(ms)) return null
  const pt = parsePoint(row.point)
  const roads = [row.primary_rd, row.secondary_rd]
    .filter((r): r is string => typeof r === 'string' && r.trim() !== '')
    .join(' & ')
  return {
    id: `traffic-crashes:${row.unique_id}`,
    datasetId: 'traffic-crashes',
    timestamp: ts,
    receivedAt: ms,
    neighborhood: row.analysis_neighborhood as string | undefined,
    address: cleanStreetLabel(roads), // ALL-CAPS road names → title case
    longitude: pt?.lon,
    latitude: pt?.lat,
    headline: crashHeadline(row),
    raw: row,
  }
}

function normalizeBusiness(row: Record<string, unknown>): AlertEvent | null {
  const ts = typeof row.location_start_date === 'string' ? row.location_start_date : null
  if (!ts) return null
  const ms = parseSfLocal(ts)
  if (isNaN(ms)) return null
  const pt = parsePoint(row.location)
  const name =
    typeof row.dba_name === 'string' && row.dba_name.trim() !== '' ? row.dba_name.trim() : 'Business'
  // dba_name + full_business_address arrive already title-cased from the
  // registry (probed 2026-07-16) — do NOT run cleanStreetLabel here, its
  // lowercase-first pass would mangle acronyms ("SF" → "Sf").
  const address =
    typeof row.full_business_address === 'string'
      ? row.full_business_address.split(',')[0].trim() || undefined
      : undefined
  const sector = naicsSector(
    typeof row.self_reported_naics_code === 'string' ? row.self_reported_naics_code : undefined,
  )
  return {
    id: `business-openings:${row.uniqueid}`,
    datasetId: 'business-openings',
    timestamp: ts,
    receivedAt: ms,
    neighborhood: row.neighborhoods_analysis_boundaries as string | undefined,
    address,
    longitude: pt?.lon,
    latitude: pt?.lat,
    callType: sector === UNCATEGORIZED ? undefined : sector,
    headline: `New business — ${name}`,
    raw: row,
  }
}

export const ALERT_STREAMS: Record<AlertStreamId, AlertStreamConfig> = {
  '911-realtime': {
    socrataId: 'gnap-fj3t',
    dateField: 'received_datetime',
    tier: 'live',
    windowMs: 48 * HOUR,
    labelLong: '911 calls',
    labelShort: '911',
    tag: '911',
    hex: '#616a96',
    normalize: (row) => normalizeEvent('911-realtime', row),
  },
  'fire-ems-dispatch': {
    socrataId: 'nuek-vuh3',
    dateField: 'received_dttm',
    tier: 'live',
    windowMs: 48 * HOUR,
    labelLong: 'Fire & EMS responses',
    labelShort: 'Fire/EMS',
    tag: 'FIRE/EMS',
    hex: '#b85a33',
    normalize: (row) => normalizeEvent('fire-ems-dispatch', row),
  },
  '311-cases': {
    socrataId: 'vw6y-z8j6',
    dateField: 'requested_datetime',
    tier: 'live',
    windowMs: 48 * HOUR,
    labelLong: '311 reports',
    labelShort: '311',
    tag: '311',
    hex: '#7a9954',
    normalize: (row) => normalizeEvent('311-cases', row),
  },
  'traffic-crashes': {
    socrataId: 'ubvf-ztfx',
    dateField: 'collision_datetime',
    tier: 'released',
    // Crashes publish ~6 weeks behind in roughly monthly batches; 120d
    // covers a batch's full event-date span with margin (~1,100 rows
    // citywide — one page).
    windowMs: 120 * DAY,
    labelLong: 'crash reports',
    labelShort: 'Crashes',
    tag: 'CRASH',
    hex: '#963e30',
    releasedNote:
      'The city releases serious traffic collision data in batches, roughly 4–6 weeks behind — these reports appeared in the latest release.',
    normalize: normalizeCrash,
  },
  'business-openings': {
    socrataId: 'g8m3-pdis',
    dateField: 'location_start_date',
    tier: 'released',
    // Start dates are routinely backdated; 90d catches late registrations
    // on their first appearance (~1,600 geo rows citywide — one page).
    windowMs: 90 * DAY,
    labelLong: 'business openings',
    labelShort: 'New business',
    tag: 'BUSINESS',
    hex: '#5c9693',
    releasedNote:
      'Newly registered business locations near you, from city data — refreshed nightly.',
    // Geo-tagged, currently-open, inside the SF box (the registry includes
    // out-of-town locations of SF-registered businesses).
    extraWhere:
      "location IS NOT NULL AND location_end_date IS NULL AND administratively_closed IS NULL AND within_box(location, 37.85, -123.0, 37.6, -122.3)",
    normalize: normalizeBusiness,
  },
}

export const ALERT_STREAM_IDS = Object.keys(ALERT_STREAMS) as AlertStreamId[]

export function isLiveStream(id: string): boolean {
  return ALERT_STREAMS[id as AlertStreamId]?.tier === 'live'
}

export function isReleasedStream(id: string): boolean {
  return ALERT_STREAMS[id as AlertStreamId]?.tier === 'released'
}

/** The $where clause for one stream's fetch. Released streams are bounded
 *  at BOTH ends — the upper bound excludes future-dated business rows,
 *  which would otherwise ride every digest until their start date. */
export function streamWhere(id: AlertStreamId, nowMs: number, windowOverrideMs?: number): string {
  const cfg = ALERT_STREAMS[id]
  const windowMs = windowOverrideMs ?? cfg.windowMs
  let where = `${cfg.dateField} >= '${sfLocalCutoff(nowMs - windowMs)}'`
  if (cfg.tier === 'released') where += ` AND ${cfg.dateField} <= '${sfLocalCutoff(nowMs)}'`
  if (cfg.extraWhere) where += ` AND ${cfg.extraWhere}`
  return where
}
