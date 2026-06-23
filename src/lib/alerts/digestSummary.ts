// src/lib/alerts/digestSummary.ts
// Pure shaping of a location's matched events into the dashboard email's
// data: headline counts, a 12-bucket activity histogram, and time-of-day
// blocks. Timezone-locked to SF (the cron runs UTC). Tested directly.
import type { NormalizedEvent, DatasetId } from '@/types/last48'
import { classifySignificant } from './significance.js'
import { humanizeCallType, humanizeStreamName } from '../../utils/humanizeCivic.js'

const SF_TZ = 'America/Los_Angeles'

export interface Summary {
  total: number
  byStream: Record<DatasetId, number>
  significant: number
  busiestLabel: string | null
}

export interface DigestRow {
  id: string
  clock: string
  streamLabel: string
  what: string
  neighborhood: string
  significant: boolean
  receivedAt: number
}

export interface TimeBlock {
  key: 'overnight' | 'morning' | 'afternoon' | 'evening'
  label: string
  rows: DigestRow[]
}

/** Local SF hour 0–23 for a unix-ms instant. */
export function sfHour(ms: number): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: SF_TZ,
    hour: 'numeric',
    hour12: false,
  }).format(new Date(ms))
  return Number(h) % 24 // some ICU builds render midnight as '24'
}

/** AP-style SF local time: "7:05 a.m." / "12:00 p.m." */
export function clockText(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SF_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(ms))
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? ''
  const period = get('dayPeriod').toLowerCase().startsWith('p') ? 'p.m.' : 'a.m.'
  return `${get('hour')}:${get('minute')} ${period}`
}

const EMPTY_BY_STREAM: Record<DatasetId, number> = {
  '911-realtime': 0,
  'fire-ems-dispatch': 0,
  '311-cases': 0,
}

/** Event counts per two-hour SF-local bucket (length 12; index 0 = 0:00–1:59). */
export function busiestBuckets(events: NormalizedEvent[]): number[] {
  const buckets = new Array(12).fill(0)
  for (const e of events) buckets[Math.floor(sfHour(e.receivedAt) / 2)]++
  return buckets
}

function peakBucketIndex(buckets: number[]): number | null {
  let peak = 0
  let idx: number | null = null
  buckets.forEach((c, i) => {
    if (c > peak) {
      peak = c
      idx = i
    }
  })
  return idx
}

/** "2–3 p.m." for a two-hour bucket index. */
function twoHourLabel(idx: number): string {
  const fmt = (h24: number) => {
    const period = h24 >= 12 ? 'p.m.' : 'a.m.'
    const h = h24 % 12 === 0 ? 12 : h24 % 12
    return { h, period }
  }
  const start = idx * 2
  const a = fmt(start)
  const b = fmt((start + 1) % 24)
  return a.period === b.period
    ? `${a.h}–${b.h} ${a.period}`
    : `${a.h} ${a.period}–${b.h} ${b.period}`
}

export function summarize(events: NormalizedEvent[]): Summary {
  const byStream: Record<DatasetId, number> = { ...EMPTY_BY_STREAM }
  let significant = 0
  for (const e of events) {
    byStream[e.datasetId] = (byStream[e.datasetId] ?? 0) + 1
    if (classifySignificant(e)) significant++
  }
  const peak = peakBucketIndex(busiestBuckets(events))
  return {
    total: events.length,
    byStream,
    significant,
    busiestLabel: peak == null ? null : twoHourLabel(peak),
  }
}

const BLOCKS: Array<{ key: TimeBlock['key']; label: string; from: number; to: number }> = [
  { key: 'overnight', label: 'OVERNIGHT', from: 0, to: 5 },
  { key: 'morning', label: 'MORNING', from: 6, to: 11 },
  { key: 'afternoon', label: 'AFTERNOON', from: 12, to: 17 },
  { key: 'evening', label: 'EVENING', from: 18, to: 23 },
]

export function bucketByTimeOfDay(events: NormalizedEvent[]): TimeBlock[] {
  const ordered = [...events].sort((a, b) => b.receivedAt - a.receivedAt)
  const blocks: TimeBlock[] = BLOCKS.map((b) => ({ key: b.key, label: b.label, rows: [] }))
  for (const e of ordered) {
    const h = sfHour(e.receivedAt)
    const bi = BLOCKS.findIndex((b) => h >= b.from && h <= b.to)
    if (bi < 0) continue
    blocks[bi].rows.push({
      id: e.id,
      clock: clockText(e.receivedAt),
      streamLabel: humanizeStreamName(e.datasetId),
      what: humanizeCallType(e.callType) || e.headline || 'Incident',
      neighborhood: e.neighborhood ?? '',
      significant: classifySignificant(e) != null,
      receivedAt: e.receivedAt,
    })
  }
  return blocks.filter((b) => b.rows.length > 0)
}

const RADIUS_FRACTION: Record<string, string> = {
  '0.125': '⅛',
  '0.25': '¼',
  '0.5': '½',
}

/** "⅛ mi" / "½ mi" / "2 mi" — radius vocabulary for alt text + captions. */
export function radiusLabelText(miles: number): string {
  return `${RADIUS_FRACTION[String(miles)] ?? String(miles)} mi`
}
