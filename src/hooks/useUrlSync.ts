import { useEffect, useRef } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'
import { parseComparison, serializeComparison } from '@/utils/comparisonMode'
import { parseRoute } from '@/cities/routing'

// The Last 48 ignores the global date range (fixed 48h window) — its URL stays
// clean in EVERY city ('/live', later '/oakland/live'), so classification is
// by view identity, not pathname literal.
const DATELESS_VIEWS = new Set(['live'])

// Redirect-only locations must not sync — setSearchParams preserves the current
// pathname, which would clobber a sibling <Navigate>'s pathname change. Two cases:
// the legacy redirect views ('live-feeds'), and — until stage 3 renders real
// non-SF views — every non-SF city path, whose whole route tree is a dormant
// redirect to Home. STAGE 3 CONTRACT: when Oakland views become real, remove the
// cityId clause so /oakland/* carries ?start/?end like any other view.
const REDIRECT_VIEWS = new Set(['live-feeds'])

/**
 * Syncs appStore date range to/from URL search params.
 * On mount: reads URL params → updates store.
 * On store change: writes store → URL params.
 */
export function useUrlSync() {
  const [searchParams, setSearchParams] = useSearchParams()
  const pathname = useLocation().pathname
  const { cityId, viewId } = parseRoute(pathname)
  const dateless = DATELESS_VIEWS.has(viewId)
  const skipSync = REDIRECT_VIEWS.has(viewId) || cityId !== 'sf'
  const {
    dateRange, setDateRange,
    timeOfDayFilter, setTimeOfDayFilter,
    comparisonMode, setComparisonMode,
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

    // Comparison mode — accepts presets, pinned dates, and legacy numeric
    // params (?compare=360 from old shared links → nearest preset).
    const parsed = parseComparison(searchParams.get('compare'))
    if (parsed) setComparisonMode(parsed)

    initialized.current = true
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // On store change: store → URL
  useEffect(() => {
    // On a redirect-only route, don't sync — let <LiveFeedsRedirect> navigate.
    if (!initialized.current || skipSync) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)

      // On date-less routes (The Last 48), strip these params so the URL is
      // just /live. Other params (?event=, ?ambient=, ?nh=, …) are untouched.
      // Navigating away flips `dateless` false and the dates are restored.
      if (dateless) {
        next.delete('start')
        next.delete('end')
        next.delete('tod_start')
        next.delete('tod_end')
        next.delete('compare')
        return next
      }

      next.set('start', dateRange.start)
      next.set('end', dateRange.end)

      if (timeOfDayFilter) {
        next.set('tod_start', String(timeOfDayFilter.startHour))
        next.set('tod_end', String(timeOfDayFilter.endHour))
      } else {
        next.delete('tod_start')
        next.delete('tod_end')
      }

      const compareParam = serializeComparison(comparisonMode)
      if (compareParam !== null) {
        next.set('compare', compareParam)
      } else {
        next.delete('compare')
      }

      return next
    }, { replace: true })
  }, [dateRange.start, dateRange.end, timeOfDayFilter, comparisonMode, setSearchParams, dateless, skipSync])
}
