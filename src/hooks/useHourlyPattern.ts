import { useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
import type { HourlyAggRow } from '@/types/datasets'

interface HourlyPatternResult {
  /** 7x24 grid: grid[dow][hour] = call count */
  grid: number[][]
  /** Total calls per hour across all days */
  hourTotals: number[]
  /** Hour with most calls (0-23) */
  peakHour: number
  /** Hour with fewest calls (0-23) */
  quietestHour: number
  isLoading: boolean
  error: string | null
}

/**
 * Fetches hourly call pattern data using Socrata server-side aggregation.
 * Groups by hour-of-day and day-of-week for the given date range.
 */
export function useHourlyPattern(
  dateRange: { start: string; end: string },
  serviceWhereClause?: string
): HourlyPatternResult {
  const whereConditions: string[] = []
  whereConditions.push(`received_dttm >= '${dateRange.start}T00:00:00'`)
  whereConditions.push(`received_dttm <= '${dateRange.end}T23:59:59'`)
  if (serviceWhereClause) whereConditions.push(serviceWhereClause)

  const where = whereConditions.join(' AND ')

  const { data: rows, isLoading, error } = useDataset<HourlyAggRow>(
    'fireEMSDispatch',
    {
      $select: 'date_extract_hh(received_dttm) as hour, date_extract_dow(received_dttm) as dow, count(*) as call_count',
      $group: 'hour, dow',
      $where: where,
      $order: 'call_count DESC',
      $limit: 200,
    },
    [where]
  )

  const result = useMemo(() => {
    // Initialize 7x24 grid (0=Sun through 6=Sat)
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
