import { useEffect, useRef } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'
import { parseComparison, serializeComparison } from '@/utils/comparisonMode'
import { parseRoute } from '@/cities/routing'
import { getCity } from '@/cities/registry'

/**
 * Syncs appStore date range to/from URL search params.
 * On mount: reads URL params → updates store.
 * On store change: writes store → URL params.
 */
export function useUrlSync() {
  const [searchParams, setSearchParams] = useSearchParams()
  const pathname = useLocation().pathname
  const { cityId, viewId } = parseRoute(pathname)
  const city = getCity(cityId)
  const entry = city.manifest.find((e) => e.viewId === viewId)
  // The Last 48 ignores the global date range (fixed 48h window) — its URL
  // stays clean in EVERY city; the manifest's `dateless` flag is the registry.
  const dateless = entry?.dateless === true
  // Redirect-only locations must not sync — setSearchParams preserves the
  // current pathname, which would clobber a sibling <Navigate>'s pathname
  // change. Three cases: the city's registered redirect slugs ('live-feeds');
  // unknown slugs with no manifest entry (the root catch-all's <Navigate>
  // must win); and DORMANT manifest entries — registered views whose route
  // is still the city catch-all (no dormant entries exist post-stage-3b; the
  // clause guards any future city's dormant slugs). Liveness replaced the
  // old blanket cityId !== 'sf' clause when the first Oakland views went
  // live (stage-3 spec §2).
  const skipSync =
    city.redirects.some((r) => r.from === viewId) || entry === undefined || entry.dormant === true
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
    // On a redirect-only route, don't sync — let <CityRedirect> navigate.
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
