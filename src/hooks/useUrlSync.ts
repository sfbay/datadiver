import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'

/**
 * Syncs appStore date range to/from URL search params.
 * On mount: reads URL params → updates store.
 * On store change: writes store → URL params.
 */
export function useUrlSync() {
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    dateRange, setDateRange,
    timeOfDayFilter, setTimeOfDayFilter,
    comparisonPeriod, setComparisonPeriod,
  } = useAppStore()
  const initialized = useRef(false)

  // On mount: read URL → store
  useEffect(() => {
    const urlStart = searchParams.get('start')
    const urlEnd = searchParams.get('end')
    if (urlStart && urlEnd && /^\d{4}-\d{2}-\d{2}$/.test(urlStart) && /^\d{4}-\d{2}-\d{2}$/.test(urlEnd)) {
      setDateRange(urlStart, urlEnd)
    }

    // Time-of-day filter
    const todStart = searchParams.get('tod_start')
    const todEnd = searchParams.get('tod_end')
    if (todStart !== null && todEnd !== null) {
      const s = parseInt(todStart, 10)
      const e = parseInt(todEnd, 10)
      if (!isNaN(s) && !isNaN(e) && s >= 0 && s <= 23 && e >= 0 && e <= 23) {
        setTimeOfDayFilter({ startHour: s, endHour: e })
      }
    }

    // Comparison period
    const compare = searchParams.get('compare')
    if (compare !== null) {
      const days = parseInt(compare, 10)
      if (!isNaN(days) && days > 0) {
        setComparisonPeriod(days)
      }
    }

    initialized.current = true
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // On store change: store → URL
  useEffect(() => {
    if (!initialized.current) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('start', dateRange.start)
      next.set('end', dateRange.end)

      if (timeOfDayFilter) {
        next.set('tod_start', String(timeOfDayFilter.startHour))
        next.set('tod_end', String(timeOfDayFilter.endHour))
      } else {
        next.delete('tod_start')
        next.delete('tod_end')
      }

      if (comparisonPeriod !== null) {
        next.set('compare', String(comparisonPeriod))
      } else {
        next.delete('compare')
      }

      return next
    }, { replace: true })
  }, [dateRange.start, dateRange.end, timeOfDayFilter, comparisonPeriod, setSearchParams])
}
