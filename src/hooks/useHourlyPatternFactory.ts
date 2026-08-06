import { useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
import type { DatasetKey } from '@/api/datasets'
import type { HourlyAggRow } from '@/types/datasets'
import type { CityId } from '@/cities/routing'

export interface HourlyPatternResult {
  /** 7x24 grid: grid[dow][hour] = count */
  grid: number[][]
  /** Total per hour across all days */
  hourTotals: number[]
  /** Hour with most records (0-23) */
  peakHour: number
  /** Hour with fewest records (0-23) */
  quietestHour: number
  /** Rows whose bucket didn't map to a valid hour 0-23 (excluded from grid/hourTotals). */
  unparsedCount: number
  isLoading: boolean
  error: string | null
}

interface HourlyPatternConfig {
  datasetKey: DatasetKey
  dateField: string
  /** Route city for the fetch. Default 'sf'. */
  cityId?: CityId
  /** Count expression. Default count(*). Oakland crime: count(distinct casenumber). */
  countExpr?: string
  /** Skip hour 0 as a Peak Hour candidate. Oakland crime files a date-only
   *  cohort (~2.9% of rows) at midnight, making hour 0 the literal max — an
   *  undoctored card would confidently read "12 AM". The grid still renders
   *  all 24 hours; only the peak computation skips 0. */
  excludePeakHour0?: boolean
  /** Replaces `date_extract_hh(dateField)` in the $select. Oakland citations
   *  passes OAK_HOUR_EXPR (the dialect's mixed-format bucket expression). */
  hourExpr?: string
  /** Maps the raw grouped hour value → 0–23, or null → unparsedCount.
   *  `string | undefined` is load-bearing: Socrata OMITS the aliased field
   *  for a NULL-expression group, so the residual arrives as a missing key. */
  mapHourValue?: (raw: string | undefined) => number | null
  /** $limit for the GROUP BY (default 200). Oakland citations needs 800 —
   *  ~58 buckets × 7 days ≈ 406 rows would silently truncate at 200. */
  limit?: number
}

/** Pure core — node-testable. Builds the `$select` string for the hourly
 *  GROUP BY query; verifies a custom `countExpr` (e.g. Oakland crime's
 *  `count(distinct casenumber)`) actually reaches the select. */
export function hourlySelect(dateField: string, countExpr?: string, hourExpr?: string): string {
  return `${hourExpr ?? `date_extract_hh(${dateField})`} as hour, date_extract_dow(${dateField}) as dow, ${countExpr ?? 'count(*)'} as call_count`
}

function defaultMapHour(raw: string | undefined): number | null {
  if (raw == null) return null
  const h = parseInt(raw, 10)
  return Number.isNaN(h) ? null : h
}

/** Pure core — node-testable. `+=` (not `=`) so several buckets can fold
 *  into one hour; SF's GROUP BY makes (hour,dow) unique, so this is
 *  behavior-identical there. */
export function computeHourlyResult(
  rows: HourlyAggRow[],
  excludePeakHour0 = false,
  mapHourValue: (raw: string | undefined) => number | null = defaultMapHour
): { grid: number[][]; hourTotals: number[]; peakHour: number; quietestHour: number; unparsedCount: number } {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  const hourTotals = Array(24).fill(0) as number[]
  let unparsedCount = 0
  for (const row of rows) {
    const dow = parseInt(row.dow, 10)
    const count = parseInt(row.call_count, 10)
    if (isNaN(dow) || isNaN(count) || dow < 0 || dow >= 7) continue
    const hour = mapHourValue(row.hour)
    if (hour === null || hour < 0 || hour >= 24) {
      unparsedCount += count
      continue
    }
    grid[dow][hour] += count
    hourTotals[hour] += count
  }
  const firstCandidate = excludePeakHour0 ? 1 : 0
  let peakHour = firstCandidate
  let quietestHour = 0
  for (let h = 1; h < 24; h++) {
    if (h > firstCandidate && hourTotals[h] > hourTotals[peakHour]) peakHour = h
    if (hourTotals[h] < hourTotals[quietestHour]) quietestHour = h
  }
  return { grid, hourTotals, peakHour, quietestHour, unparsedCount }
}

/**
 * Factory that produces a dataset-specific useXxxHourlyPattern hook.
 * All 6 hourly hooks share identical logic — only the dataset key
 * and date field differ.
 */
export function createHourlyPatternHook(
  config: HourlyPatternConfig,
  name: string
) {
  const { datasetKey, dateField } = config

  const hook = (
    dateRange: { start: string; end: string },
    extraWhereClause?: string,
    enabled = true
  ): HourlyPatternResult => {
    const whereConditions: string[] = []
    whereConditions.push(`${dateField} >= '${dateRange.start}T00:00:00'`)
    whereConditions.push(`${dateField} <= '${dateRange.end}T23:59:59'`)
    if (extraWhereClause) whereConditions.push(extraWhereClause)

    const where = whereConditions.join(' AND ')

    const { data: rows, isLoading, error } = useDataset<HourlyAggRow>(
      datasetKey,
      {
        $select: hourlySelect(dateField, config.countExpr, config.hourExpr),
        $group: 'hour, dow',
        $where: where,
        $order: 'call_count DESC',
        $limit: config.limit ?? 200,
      },
      [where],
      { enabled, cityId: config.cityId }
    )

    const result = useMemo(
      () => computeHourlyResult(rows, config.excludePeakHour0 ?? false, config.mapHourValue),
      [rows]
    )

    return { ...result, isLoading, error }
  }

  Object.defineProperty(hook, 'name', { value: name })
  return hook
}

// ── Concrete hooks ────────────────────────────────────────────────

export const useFireHourlyPattern = createHourlyPatternHook(
  { datasetKey: 'fireEMSDispatch', dateField: 'received_dttm' },
  'useFireHourlyPattern'
)

export const use311HourlyPattern = createHourlyPatternHook(
  { datasetKey: 'cases311', dateField: 'requested_datetime' },
  'use311HourlyPattern'
)

export const useOakland311HourlyPattern = createHourlyPatternHook(
  { datasetKey: 'cases311', dateField: 'datetimeinit', cityId: 'oakland' },
  'useOakland311HourlyPattern'
)

export const useDispatchHourlyPattern = createHourlyPatternHook(
  { datasetKey: 'dispatch911Historical', dateField: 'received_datetime' },
  'useDispatchHourlyPattern'
)

export const usePoliceHourlyPattern = createHourlyPatternHook(
  { datasetKey: 'policeIncidents', dateField: 'incident_datetime' },
  'usePoliceHourlyPattern'
)

export const useCrashHourlyPattern = createHourlyPatternHook(
  { datasetKey: 'trafficCrashes', dateField: 'collision_datetime' },
  'useCrashHourlyPattern'
)

export const useCitationHourlyPattern = createHourlyPatternHook(
  { datasetKey: 'parkingCitations', dateField: 'citation_issued_datetime' },
  'useCitationHourlyPattern'
)

export const useOaklandPoliceHourlyPattern = createHourlyPatternHook(
  {
    datasetKey: 'policeIncidents', dateField: 'datetime', cityId: 'oakland',
    countExpr: 'count(distinct casenumber)', excludePeakHour0: true,
  },
  'useOaklandPoliceHourlyPattern'
)
