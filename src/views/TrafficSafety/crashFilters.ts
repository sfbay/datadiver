// src/views/TrafficSafety/crashFilters.ts
//
// The Traffic Safety filters a stat card or a severity bar can set (Jesse,
// Sept. 23 2026: "clicking on the 'fatalities' stats box would be a natural
// filter entry point"). ZERO-IMPORT pure leaf — the comparison hook factory
// reads `isPedBikeMode` too, and the SoQL fragments here are the ONE place
// each filter is spelled, so the map sample, the card totals, the ranking and
// the charts cannot disagree about what "fatal" or "ped/bike" means.
//
// Units, stated once: the Fatalities and Injuries cards count PEOPLE
// (SUM(number_killed) / SUM(number_injured)); a severity filter selects
// CRASHES (collision_severity is the crash's worst outcome). One fatal crash
// can kill two people, so the card names both.

/** The dataset's four severity values, worst first (probed Sept. 23 2026). */
export const SEVERITY_ORDER = [
  'Fatal',
  'Injury (Severe)',
  'Injury (Other Visible)',
  'Injury (Complaint of Pain)',
] as const
export type Severity = (typeof SEVERITY_ORDER)[number]

/** Reader-facing names for a filter chip. */
export const SEVERITY_LABEL: Record<Severity, string> = {
  Fatal: 'Fatal',
  'Injury (Severe)': 'Severe injury',
  'Injury (Other Visible)': 'Visible injury',
  'Injury (Complaint of Pain)': 'Complaint of pain',
}

const isSeverity = (s: string): s is Severity => (SEVERITY_ORDER as readonly string[]).includes(s)

/** `?severity=` → the known values, worst first. Unknown values drop. */
export function parseSeverities(raw: string | null): Set<Severity> {
  if (!raw) return new Set()
  const given = new Set(raw.split(',').map((s) => s.trim()))
  return new Set(SEVERITY_ORDER.filter((s) => given.has(s)))
}

/** The URL value, or null when nothing is selected (delete the param). */
export function serializeSeverities(set: ReadonlySet<string>): string | null {
  const vals = SEVERITY_ORDER.filter((s) => set.has(s))
  return vals.length ? vals.join(',') : null
}

export function severityClause(set: ReadonlySet<string>): string {
  const vals = SEVERITY_ORDER.filter((s) => set.has(s))
  return vals.length ? `collision_severity IN (${vals.map((s) => `'${s}'`).join(',')})` : ''
}

/** Fatal crashes are coded late — deaths are added after publication, so a
 *  recent month's fatal count can rise. Shown whenever Fatal is selected. */
export const FATAL_LAG_NOTE = 'Deaths are often added to this data weeks late, so recent months may rise.'

/** Driving under the influence, California Vehicle Code 23152/23153. */
export const DUI_CODES = ['23152(a-g)', '23153(a-g)'] as const
export const DUI_CLAUSE = `vz_pcf_group IN (${DUI_CODES.map((c) => `'${c}'`).join(',')})`
export const isDuiCode = (c: string | null | undefined): boolean => (DUI_CODES as readonly string[]).includes(c ?? '')

/** A pedestrian or bicycle crash. The dataset spells the modes out in full
 *  ("Vehicle-Bicycle", "Bicycle Only", "Vehicle-Pedestrian") — the old test
 *  looked for "Bike", matched nothing, and the Ped/Bike card counted
 *  pedestrian crashes alone (20.7% where the truth was 37.0%, 2025 → Sept.
 *  2026). Match the words the data uses. */
export function isPedBikeMode(mode: string | null | undefined): boolean {
  return /Pedestrian|Bicycle/.test(mode ?? '')
}
export const PED_BIKE_SQL =
  "(dph_col_grp_description like '%Pedestrian%' OR dph_col_grp_description like '%Bicycle%')"

/** The ped/bike modes among the modes the data actually holds — what the
 *  Ped/Bike card writes into the existing `?modes=` filter. */
export function pedBikeModes(modes: readonly string[]): Set<string> {
  return new Set(modes.filter(isPedBikeMode))
}

export function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

/** A card click: select exactly `target`, or clear when it already is. */
export function toggleExactly<T extends string>(current: ReadonlySet<T>, target: ReadonlySet<T>): Set<T> {
  return target.size > 0 && sameSet(current, target) ? new Set() : new Set(target)
}

// ── Neighborhood ranking ────────────────────────────────────────────────

export type RankMetric = 'crashes' | 'killed' | 'injured'
export const RANK_METRICS: readonly RankMetric[] = ['crashes', 'killed', 'injured']

export function parseRankMetric(raw: string | null): RankMetric {
  return raw === 'killed' || raw === 'injured' ? raw : 'crashes'
}

export interface RankEntry {
  neighborhood: string
  crashCount: number
  totalInjured: number
  totalKilled: number
}

export function metricValue(e: RankEntry, m: RankMetric): number {
  return m === 'killed' ? e.totalKilled : m === 'injured' ? e.totalInjured : e.crashCount
}

/** Highest first; ties fall back to crash count, then name, so the order is
 *  stable across polls (most neighborhoods tie at zero deaths). */
export function rankNeighborhoods<E extends RankEntry>(entries: readonly E[], m: RankMetric): E[] {
  return [...entries].sort((a, b) =>
    metricValue(b, m) - metricValue(a, m)
    || b.crashCount - a.crashCount
    || a.neighborhood.localeCompare(b.neighborhood))
}
