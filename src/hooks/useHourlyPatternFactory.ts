import { useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
import type { DatasetKey } from '@/api/datasets'
import type { HourlyAggRow } from '@/types/datasets'

export interface HourlyPatternResult {
  /** 7x24 grid: grid[dow][hour] = count */
  grid: number[][]
  /** Total per hour across all days */
  hourTotals: number[]
  /** Hour with most records (0-23) */
  peakHour: number
  /** Hour with fewest records (0-23) */
  quietestHour: number
  isLoading: boolean
  error: string | null
}

interface HourlyPatternConfig {
  datasetKey: DatasetKey
  dateField: string
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
    extraWhereClause?: string
  ): HourlyPatternResult => {
    const whereConditions: string[] = []
    whereConditions.push(`${dateField} >= '${dateRange.start}T00:00:00'`)
    whereConditions.push(`${dateField} <= '${dateRange.end}T23:59:59'`)
    if (extraWhereClause) whereConditions.push(extraWhereClause)

    const where = whereConditions.join(' AND ')

    const { data: rows, isLoading, error } = useDataset<HourlyAggRow>(
      datasetKey,
      {
        $select: `date_extract_hh(${dateField}) as hour, date_extract_dow(${dateField}) as dow, count(*) as call_count`,
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
