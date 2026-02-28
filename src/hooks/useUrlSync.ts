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
  const { dateRange, setDateRange } = useAppStore()
  const initialized = useRef(false)

  // On mount: read URL → store
  useEffect(() => {
    const urlStart = searchParams.get('start')
    const urlEnd = searchParams.get('end')
    if (urlStart && urlEnd && /^\d{4}-\d{2}-\d{2}$/.test(urlStart) && /^\d{4}-\d{2}-\d{2}$/.test(urlEnd)) {
      setDateRange(urlStart, urlEnd)
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
      return next
    }, { replace: true })
  }, [dateRange.start, dateRange.end, setSearchParams])
}
