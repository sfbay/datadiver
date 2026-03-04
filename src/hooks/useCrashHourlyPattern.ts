import { useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
import type { HourlyAggRow } from '@/types/datasets'

interface CrashHourlyPatternResult {
  /** 7x24 grid: grid[dow][hour] = crash count */
  grid: number[][]
  /** Total crashes per hour across all days */
  hourTotals: number[]
  /** Hour with most crashes (0-23) */
  peakHour: number
  /** Hour with fewest crashes (0-23) */
  quietestHour: number
  isLoading: boolean
  error: string | null
}

/**
 * Fetches hourly crash pattern data for Traffic Crashes dataset.
 * Uses collision_datetime for server-side aggregation.
 */
export function useCrashHourlyPattern(
  dateRange: { start: string; end: string },
  extraWhereClause?: string
): CrashHourlyPatternResult {
  const whereConditions: string[] = []
  whereConditions.push(`collision_datetime >= '${dateRange.start}T00:00:00'`)
  whereConditions.push(`collision_datetime <= '${dateRange.end}T23:59:59'`)
  if (extraWhereClause) whereConditions.push(extraWhereClause)

  const where = whereConditions.join(' AND ')

  const { data: rows, isLoading, error } = useDataset<HourlyAggRow>(
    'trafficCrashes',
    {
      $select: 'date_extract_hh(collision_datetime) as hour, date_extract_dow(collision_datetime) as dow, count(*) as call_count',
      $group: 'hour, dow',
      $where: where,
      $order: 'call_count DESC',
      $limit: 200,
    },
    [where]
  )

  const result = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    const hourTotals = Array(24).fill(0) as number[]

    for (const row of rows) {
      const hour = parseInt(row.hour, 10)
      const dow = parseInt(row.dow, 10)
      const count = parseInt(row.call_count, 10)
      if (!isNaN(hour) && !isNaN(dow) && !isNaN(count) && hour >= 0 && hour < 24 && dow >= 0 && dow < 7) {
        grid[dow][hour] = count
        hourTotals[hour] += count
      }
    }

    let peakHour = 0
    let quietestHour = 0
    for (let h = 1; h < 24; h++) {
      if (hourTotals[h] > hourTotals[peakHour]) peakHour = h
      if (hourTotals[h] < hourTotals[quietestHour]) quietestHour = h
    }

    return { grid, hourTotals, peakHour, quietestHour }
  }, [rows])

  return { ...result, isLoading, error }
}
