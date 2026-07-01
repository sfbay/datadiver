// src/utils/sfTime.ts — SF-local ("floating") timestamp handling.
//
// DataSF publishes datetimes as FLOATING wall-clock strings in
// America/Los_Angeles with no offset: '2026-07-01T16:10:21.000'. Verified
// empirically (2026-07-01): the 911 Realtime feed's MAX(received_datetime)
// reads ~16 minutes old against the SF clock — and "7 hours old" against UTC.
//
// Treating those strings as UTC (Date.parse on a UTC host, or building a
// $where cutoff from toISOString()) skews every epoch by 7–8 hours: digest
// emails filed evening events under AFTERNOON, every "last 48h" query really
// covered ~41h, and the 911 tonal age ramp gained a phantom 7h latency floor.
//
// This module is the ONE place that conversion lives, shared by the client
// hooks and the alerts cron (api/_lib imports from src/utils). Both
// directions are DST-correct via Intl:
//
//   parseSfLocal('2026-07-01T16:10:21') → true epoch ms (23:10:21Z in July)
//   sfLocalCutoff(epochMs)              → 'YYYY-MM-DDTHH:MM:SS' SF wall digits
//                                          (the only form SoQL date comparison
//                                          accepts — no trailing Z / offset)

const SF_TZ = 'America/Los_Angeles'

// Construction of Intl.DateTimeFormat is the expensive part (~100µs);
// parseSfLocal runs per row on ~6,000-row Last 48 loads, so cache it.
const sfWallDigits = new Intl.DateTimeFormat('en-CA', {
  timeZone: SF_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

type WallParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

function sfWallPartsAt(epochMs: number): WallParts {
  const parts: Partial<Record<string, number>> = {}
  for (const p of sfWallDigits.formatToParts(epochMs)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  return parts as WallParts
}

/** UTC-minus-SF offset (ms) in effect at `epochMs`: -7h during PDT, -8h PST. */
function sfOffsetAt(epochMs: number): number {
  const w = sfWallPartsAt(epochMs)
  const wallAsUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return wallAsUtc - Math.floor(epochMs / 1000) * 1000
}

const FLOATING = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/

/**
 * Parse a floating SF-local timestamp into true epoch ms. Strings that carry
 * their own offset/Z (or any other shape) fall through to standard parsing.
 * Returns NaN for unparseable input (mirrors Date.parse).
 */
export function parseSfLocal(s: string): number {
  const m = FLOATING.exec(s)
  if (!m) return Date.parse(s)
  const ms = m[7] ? Number(m[7].padEnd(3, '0')) : 0
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms)
  // Two passes so the offset is sampled at (approximately) the answer, which
  // keeps epochs correct on the days the offset itself changes. Nonexistent
  // spring-forward wall times and ambiguous fall-back ones resolve to a
  // deterministic adjacent instant.
  const epoch = asUtc - sfOffsetAt(asUtc)
  return asUtc - sfOffsetAt(epoch)
}

/**
 * Format an epoch as the SF wall-clock digits SoQL date comparison expects:
 * 'YYYY-MM-DDTHH:MM:SS' — no offset, no trailing Z, matching how DataSF
 * stores the field. Use this (never toISOString) to build $where cutoffs.
 */
export function sfLocalCutoff(epochMs: number): string {
  const w = sfWallPartsAt(epochMs)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${w.year}-${p2(w.month)}-${p2(w.day)}T${p2(w.hour)}:${p2(w.minute)}:${p2(w.second)}`
}
