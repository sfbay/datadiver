import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import CivicTicker from '@/components/ui/CivicTicker'
import { useCivicIndicators } from '@/hooks/useCivicIndicators'
import type { CensusVariable } from '@/types/census'
import { eventFlyToOffset } from '@/utils/cameraPadding'
import { useCensusData } from '@/hooks/useCensusData'
import { useDemographicUnderlay } from '@/components/maps/DemographicUnderlay'
import UnderlayPicker from '@/components/maps/UnderlayPicker'
import UnderlayLegend from '@/components/maps/UnderlayLegend'
import NeighborhoodCensusContext from '@/components/ui/NeighborhoodCensusContext'
import { useViewEntry, useActiveCity } from '@/cities/useActiveCity'
import { censusMatchesAreas } from '@/cities/registry'
import { composeAreaLabel } from '@/cities/areaLabel'
import { AreaRowLabel } from '@/components/ui/AreaLabel'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import { useCrimeEraData } from './useCrimeEraData'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { usePoliceHourlyPattern, useOaklandPoliceHourlyPattern } from '@/hooks/useHourlyPatternFactory'
import { usePoliceComparisonData, useOaklandPoliceComparisonData, countDistinctCases, type OaklandCrimeComparisonRow } from '@/hooks/useComparisonDataFactory'
import { CRIME_EYEBROWS, OAKLAND_CRIME_GROUPS, OAKLAND_CRIME_QUERY_FLOOR, titleCaseCrimetype, oaklandCategoryExpr, classifyOaklandCategory } from './crimeDialect'
import { splitPairKey, parseSubParam, formatSubParam } from './subcategoryWatch'
import { useSubcategoryMovers } from './useSubcategoryMovers'
import SubcategoryStrip from './SubcategoryStrip'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useMapCameraPresets } from '@/hooks/useMapCameraPresets'
import { useAppStore } from '@/stores/appStore'
import { resolveComparisonStart, comparisonLabel } from '@/utils/comparisonMode'
import type { PoliceIncident, IncidentCategoryAggRow, NeighborhoodAggRowPolice, ResolutionAggRow } from '@/types/datasets'
import { formatDelta, formatNumber, formatHour } from '@/utils/time'
import { coordsFromFields, extractCoordinates } from '@/utils/geo'
import { resolutionColor } from '@/utils/colors'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import MapSidebar from '@/components/layout/MapSidebar'
import CardTray, { type CardDef } from '@/components/ui/CardTray'
import ChartTray, { type ChartTileDef } from '@/components/ui/ChartTray'
import HorizontalBarChart, { type BarDatum } from '@/components/charts/HorizontalBarChart'
import ExportButton from '@/components/export/ExportButton'
import TimeOfDayFilter from '@/components/filters/TimeOfDayFilter'
import HourlyHeatgrid from '@/components/charts/HourlyHeatgrid'
import TrendChart from '@/components/charts/TrendChart'
import IncidentCategoryFilter from '@/components/filters/IncidentCategoryFilter'
import CrimeDetailPanel from '@/components/ui/CrimeDetailPanel'
import DataFreshnessAlert from '@/components/ui/DataFreshnessAlert'
import { ErrorState } from '@/components/ui/ErrorState'
import { SkeletonStatCards, SkeletonSidebarRows, MapScanOverlay, MapProgressBar } from '@/components/ui/Skeleton'
import PeriodBreakdownChart from '@/components/charts/PeriodBreakdownChart'
import { useDataFreshness } from '@/hooks/useDataFreshness'
import { useTrendBaseline } from '@/hooks/useTrendBaseline'
import { SF_CRIME_COUNT } from './crimeCount'
import type { TrendConfig } from '@/types/trends'
import { useProgressScope } from '@/hooks/useLoadingProgress'
import InfoTip from '@/components/ui/InfoTip'
import ScannerFeedChips from '@/components/ui/ScannerFeedChips'

type MapMode = 'heatmap' | 'anomaly'
type SidebarTab = 'categories' | 'neighborhoods'

export default function CrimeIncidents() {
  const { dateRange, timeOfDayFilter, comparisonMode, selectedCrimeIncident, setSelectedCrimeIncident } = useAppStore()
  const city = useActiveCity()
  const isSF = city.id === 'sf'
  // Composed reader-facing beat labels ('Rockridge & Shafter · 12Y'); identity for SF.
  const areaLabel = useCallback(
    (name: string) => composeAreaLabel(city.areas, name),
    [city]
  )
  // TWO-part gate: `enabled` stops the ~10-query SF fetch battery (a render
  // gate alone would still fire it on Oakland routes and fail the network
  // assertion in the verification gate); the render gate below hides the row.
  const civicIndicators = useCivicIndicators({ enabled: isSF })
  const underlayPreset = useViewEntry()?.underlayPreset ?? []
  const [searchParams, setSearchParams] = useSearchParams()
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('categories')
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapHandleRef = useRef<MapHandle>(null)

  // Deep-link: rehydrate detail panel from URL on mount.
  // Supports both ?detail= (internal share links) and ?incident= (Last48EventPeek deep links).
  useEffect(() => {
    const detailParam = searchParams.get('detail') || searchParams.get('incident')
    if (detailParam) setSelectedCrimeIncident(detailParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync detail selection → URL param
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (selectedCrimeIncident) next.set('detail', selectedCrimeIncident)
      else next.delete('detail')
      return next
    }, { replace: true })
  }, [selectedCrimeIncident, setSearchParams])

  // View-local state from URL params
  const mapMode = (searchParams.get('map_mode') as MapMode) || 'heatmap'
  const selectedCategories = useMemo(() => {
    const param = searchParams.get('categories')
    if (!param) return new Set<string>()
    return new Set(param.split(',').map(decodeURIComponent))
  }, [searchParams])
  const selectedNeighborhood = searchParams.get('neighborhood') || null

  /** Subcategory selection. A subcategory's identity is the PAIR
   *  `category|subcategory` — `Vandalism` exists under both `Malicious
   *  Mischief` and `Vandalism`, so the string alone would merge two different
   *  things. Parse/serialise go through the shared codec in
   *  subcategoryWatch.ts so the memo and every setter agree byte-for-byte. */
  const selectedSubs = useMemo(() => parseSubParam(searchParams.get('sub')), [searchParams])

  const setSelectedSubs = useCallback((subs: Set<string>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (subs.size === 0) next.delete('sub')
      else next.set('sub', formatSubParam(subs))
      return next
    }, { replace: true })
  }, [setSearchParams])

  /** Toggle one pair, used by both the sidebar rows and the strip chips.
   *  Reads the CURRENT `sub` set from `prev` inside the updater — never the
   *  closed-over `selectedSubs` — so this setter and `setSelectedCategories`
   *  firing in the same synchronous burst (a category check + a subcategory
   *  click, which Tasks 5/6 make ordinary) each build on the other's
   *  in-flight change instead of the second navigate clobbering the first. */
  const toggleSub = useCallback((keys: string[]) => {
    setSearchParams((prev) => {
      const current = parseSubParam(prev.get('sub'))
      const allOn = keys.every((k) => current.has(k))
      for (const k of keys) { if (allOn) current.delete(k); else current.add(k) }
      const next = new URLSearchParams(prev)
      if (current.size === 0) next.delete('sub')
      else next.set('sub', formatSubParam(current))
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setMapMode = useCallback((mode: MapMode) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (mode === 'heatmap') next.delete('map_mode')
      else next.set('map_mode', mode)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setSelectedCategories = useCallback((cats: Set<string>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (cats.size === 0) next.delete('categories')
      else next.set('categories', Array.from(cats).map(encodeURIComponent).join(','))
      // Checking a whole category makes its own subcategory picks redundant;
      // leaving them would OR a subset into a superset for no visible reason.
      // Reads the CURRENT `sub` set from `prev`, not the closed-over
      // `selectedSubs` — see toggleSub's comment for why that matters.
      const currentSubs = parseSubParam(prev.get('sub'))
      const keptSubs = Array.from(currentSubs)
        .filter((k) => !cats.has(splitPairKey(k).category))
      if (keptSubs.length === 0) next.delete('sub')
      else next.set('sub', formatSubParam(keptSubs))
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setSelectedNeighborhood = useCallback((n: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (!n) next.delete('neighborhood')
      else next.set('neighborhood', n)
      return next
    }, { replace: true })
  }, [setSearchParams])

  // --- WHERE clause construction ---
  // Two grains, ONE selection, OR'd: check a whole category, check a single
  // subcategory, or mix. An AND would return the empty set whenever the two
  // picks did not overlap — plausible, silent, and wrong.
  const categoryClause = useMemo(() => {
    const esc = (v: string) => v.replace(/'/g, "''")
    const parts: string[] = []
    if (selectedCategories.size > 0) {
      const escaped = Array.from(selectedCategories).map((c) => `'${esc(c)}'`)
      // Oakland's category is the DERIVED CASE expr (the HOMICIDE split), not
      // raw crimetype — filtering on the same expr the count groups by keeps
      // the sidebar row and its own filter in agreement.
      const lhs = isSF ? 'incident_category' : `(${oaklandCategoryExpr()})`
      parts.push(`${lhs} IN (${escaped.join(',')})`)
    }
    if (isSF && selectedSubs.size > 0) {
      const pairs = Array.from(selectedSubs).map((k) => {
        const { category, subcategory } = splitPairKey(k)
        return `(incident_category = '${esc(category)}' AND incident_subcategory = '${esc(subcategory)}')`
      })
      parts.push(`(${pairs.join(' OR ')})`)
    }
    if (parts.length === 0) return ''
    return parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`
  }, [selectedCategories, selectedSubs, isSF])

  // SFPD publishes 2003–May 2018 and 2018–present as two differently-shaped
  // datasets that overlap by 4.5 months. useCrimeEraData owns the seam: it
  // routes each query to whichever extract covers the selected range, cuts the
  // overlap at 2018-01-01 so nothing double-counts, and returns modern-shaped
  // results either way. See crimeEra.ts for why the category vocabularies are
  // NOT reconciled.
  const era = useCrimeEraData({
    dateRange,
    categoryClause,
    selectedNeighborhood,
    timeOfDayFilter,
  })
  const whereClause = era.modernWhere
  /** True while any pre-2018 rows are in range — gates the modern-only
   *  affordances (category filter, 911 linkage, year-over-year). */
  const hasHistorical = era.plan.era !== 'current'

  const freshness = useDataFreshness(
    'policeIncidents',
    isSF ? 'incident_datetime' : 'datetime',
    dateRange,
    { cityId: city.id },
  )

  // SF only; withheld on any range that touches the pre-2018 historical
  // extract (it publishes no incident_subcategory at all). Feeds both the
  // sidebar turn-down (byCategory) and the movers strips (Task 6+).
  const subcats = useSubcategoryMovers({
    enabled: isSF && !hasHistorical,
    dateRange,
    comparisonMode,
    latestDate: freshness.latestDate,
    selectedNeighborhood,
    timeOfDayFilter,
  })

  const trendConfig = useMemo((): TrendConfig => isSF
    ? {
        datasetKey: 'policeIncidents', dateField: 'incident_datetime',
        neighborhoodField: 'analysis_neighborhood', countExpr: SF_CRIME_COUNT,
      }
    : {
        datasetKey: 'policeIncidents', dateField: 'datetime', neighborhoodField: 'policebeat',
        cityId: 'oakland', countExpr: 'count(distinct casenumber)',
      }, [isSF])
  const trendExtraWhere = useMemo(() => {
    const parts: string[] = []
    if (categoryClause) parts.push(categoryClause)
    if (selectedNeighborhood) parts.push(`${isSF ? 'analysis_neighborhood' : 'policebeat'} = '${selectedNeighborhood.replace(/'/g, "''")}'`)
    return parts.length > 0 ? parts.join(' AND ') : undefined
  }, [categoryClause, selectedNeighborhood, isSF])
  const trend = useTrendBaseline(trendConfig, dateRange, trendExtraWhere)

  // --- Data queries (era-routed; see useCrimeEraData) ---
  const {
    incidents: rawData,
    isLoading,
    error,
    hitLimit,
    refetch,
    totalCount,
    linked,
    categoryRows,
    neighborhoodRows,
    resolutionRows,
  } = era

  // Hourly pattern
  const extraWhere = useMemo(() => {
    const parts: string[] = []
    if (categoryClause) parts.push(categoryClause)
    if (selectedNeighborhood) parts.push(`${isSF ? 'analysis_neighborhood' : 'policebeat'} = '${selectedNeighborhood.replace(/'/g, "''")}'`)
    return parts.length > 0 ? parts.join(' AND ') : undefined
  }, [categoryClause, selectedNeighborhood, isSF])

  // Both cities' instances run unconditionally; the inactive one is inert
  // (enabled:false / compStart:null). NEVER select between hook FUNCTIONS
  // conditionally — the route-level key={cityId} remount is defense in
  // depth, not a license (stage-3 spec §1).
  const sfHourly = usePoliceHourlyPattern(dateRange, extraWhere, isSF)
  const oakHourly = useOaklandPoliceHourlyPattern(dateRange, extraWhere, !isSF)
  const hourlyPattern = isSF ? sfHourly : oakHourly

  // Comparison data
  const compStart = useMemo(() => resolveComparisonStart(comparisonMode, dateRange), [comparisonMode, dateRange])
  // Oakland's WHERE clamps its lower bound at the query floor, which breaks
  // the factory's literal string-replace below the floor AND means no honest
  // comparison exists there — null the comparison start instead of clamping.
  const effCompStart = !isSF && dateRange.start < OAKLAND_CRIME_QUERY_FLOOR ? null : compStart
  const sfComparison = usePoliceComparisonData(dateRange, whereClause, isSF ? effCompStart : null, rawData, hitLimit)
  // Adapted rows carry `casenumber` but their date lives in
  // `incident_datetime`, not `datetime` — the factory's extractDate would
  // return undefined and silently collapse the current trend into one
  // bucket. Remap into the shape useOaklandPoliceComparisonData expects.
  const oakCompRows = useMemo<OaklandCrimeComparisonRow[]>(
    () => (isSF ? [] : rawData.map((r) => ({
      casenumber: (r as unknown as { casenumber?: string }).casenumber,
      datetime: r.incident_datetime,
    }))),
    [isSF, rawData],
  )
  const oakComparison = useOaklandPoliceComparisonData(dateRange, whereClause, isSF ? null : effCompStart, oakCompRows, hitLimit)
  const comparison = isSF ? sfComparison : oakComparison
  const compLabel = comparisonLabel(comparisonMode, dateRange)

  // Neighborhood boundaries for anomaly mode
  const { boundaries: neighborhoodBoundaries } = useNeighborhoodBoundaries()
  useMapCameraPresets(mapInstance, { selectedNeighborhood, neighborhoodBoundaries })

  // Census demographic underlay
  const [underlayVariable, setUnderlayVariable] = useState<CensusVariable | null>(null)
  const { neighborhoods: censusNeighborhoods } = useCensusData()

  useDemographicUnderlay({
    map: mapInstance,
    variable: underlayVariable,
    censusData: censusNeighborhoods,
    boundaries: neighborhoodBoundaries,
    geoIdProperty: 'nhood',
    opacity: 0.2,
    beforeLayerId: 'crime-heat',
  })

  const cityAvg = useMemo(() => {
    if (!censusMatchesAreas(city)) return undefined
    if (censusNeighborhoods.length === 0) return undefined
    const totalPop = censusNeighborhoods.reduce((s, n) => s + n.population, 0)
    if (totalPop === 0) return undefined
    const avg: Record<string, number> = {}
    for (const key of ['medianIncome', 'povertyRate', 'rentBurden', 'lepRate', 'renterPct'] as const) {
      const vals = censusNeighborhoods.filter(n => (n as any)[key] !== undefined)
      if (vals.length > 0) {
        avg[key] = vals.reduce((s, n) => s + ((n as any)[key] as number) * n.population, 0) / totalPop
      }
    }
    return avg as any
  }, [censusNeighborhoods, city])

  // --- Computed data ---
  const incidentData = useMemo(() => {
    return rawData
      .map((record) => {
        const coords = coordsFromFields(record.latitude, record.longitude) || extractCoordinates(record.point)
        if (!coords) return null
        return {
          incidentId: record.incident_id,
          incidentNumber: record.incident_number,
          cadNumber: record.cad_number || null,
          incidentAt: record.incident_datetime,
          reportAt: record.report_datetime || null,
          // Oakland: derive the display category per charge row (the HOMICIDE
          // split), so a coroner probe dot never reads as "Homicide". SF keeps
          // its published category. (A multi-charge case's headline can be
          // ranked via classifyOaklandCase where the full charge list exists.)
          category: (isSF
            ? record.incident_category
            : classifyOaklandCategory(record.incident_category || '', record.incident_description || '')
          ) || 'Unknown',
          subcategory: record.incident_subcategory || '',
          description: record.incident_description || '',
          resolution: record.resolution || 'Unknown',
          intersection: record.intersection || '',
          neighborhood: record.analysis_neighborhood || 'Unknown',
          policeDistrict: record.police_district || '',
          lat: coords.lat,
          lng: coords.lng,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [rawData, isSF])

  const stats = useMemo(() => {
    if (incidentData.length === 0) return { total: 0, topCategory: 'N/A', linkedPct: 0, peakHour: 0 }

    // Top category from aggregation
    const topCategory = categoryRows.length > 0 ? categoryRows[0].incident_category : 'N/A'

    // 911 linked percentage — server-side counts; the 5K-sample ratio is
    // only an immediate-render fallback while the aggregate loads.
    // null (not 0) once pre-2018 rows are in range: cad_number did not exist
    // in the historical extract, so counting its absence as "unlinked" would
    // report a real-looking 0% for a field that was never collected.
    const linkedPct = !era.plan.cadLinkAvailable
      ? null
      : linked && linked.total > 0
        ? (linked.linked / linked.total) * 100
        : (countDistinctCases(incidentData.filter((i) => i.cadNumber), (i) => i.incidentNumber)
            / countDistinctCases(incidentData, (i) => i.incidentNumber)) * 100

    return {
      // Case-level, like every server aggregate on this view: the 5K sample is
      // charge-level, so its raw length would flash a ~30% high figure before
      // the server count lands and silently correct it.
      total: countDistinctCases(incidentData, (i) => i.incidentNumber),
      topCategory,
      linkedPct,
      peakHour: hourlyPattern.peakHour,
    }
  }, [incidentData, categoryRows, linked, era.plan.cadLinkAvailable, hourlyPattern.peakHour])

  // Resolution bar data
  const resolutionBarData = useMemo((): BarDatum[] => {
    return resolutionRows.slice(0, 8).map((r) => ({
      label: r.resolution,
      value: parseInt(r.incident_count, 10) || 0,
      color: resolutionColor(r.resolution),
    }))
  }, [resolutionRows])

  // Card tray definitions
  const cardDefs = useMemo((): CardDef[] => {
    const totalVal = totalCount ?? stats.total
    const cards: CardDef[] = [
      {
        id: 'total',
        label: 'Total Incidents',
        shortLabel: 'Total',
        value: formatNumber(totalVal),
        color: '#b85545',
        delay: 0,
        info: 'total-incidents',
        defaultExpanded: true,
        // Compare and year-over-year both read the 2018+ dataset, which holds
        // nothing before the seam — running them on a historical range would
        // return zero rows and render a confident, fabricated decline. They
        // are withheld, and the card says which archive is on screen instead.
        subtitle: hasHistorical
          ? (era.plan.era === 'straddle'
              ? 'Spans SFPD’s 2003–2017 archive and the 2018+ dataset'
              : 'SFPD’s 2003–2017 archive — categories as published then')
          : comparison.deltas
            ? `${formatDelta(comparison.deltas.total)} ${compLabel}`
            : comparison.suppressed && comparisonMode !== null
              ? 'Compare needs a narrower date range'
              : 'Multi-charge cases counted once',
        wrapSubtitle: true,
        trend: !hasHistorical && comparison.deltas
          ? (comparison.deltas.total > 0 ? 'up' : comparison.deltas.total < 0 ? 'down' : 'neutral')
          : undefined,
        yoyDelta: !hasHistorical && !comparison.deltas && trend.cityWideYoY ? trend.cityWideYoY.pct : null,
      },
      {
        id: 'top-category',
        label: 'Top Category',
        shortLabel: 'Top Cat',
        value: isSF ? stats.topCategory : titleCaseCrimetype(stats.topCategory),
        color: '#d4a435',
        delay: 80,
        info: 'top-category',
        defaultExpanded: true,
      },
      {
        id: '911-linked',
        label: '911 Linked',
        shortLabel: '911%',
        // SFPD's pre-2018 extract has no cad_number at all, so there is no
        // linkage rate to report — an em dash, not a fabricated 0%.
        value: stats.linkedPct === null ? '—' : `${stats.linkedPct.toFixed(0)}%`,
        subtitle: stats.linkedPct === null ? 'Not recorded before 2018' : undefined,
        wrapSubtitle: stats.linkedPct === null,
        color: '#8b6282',
        delay: 160,
        info: '911-linked',
        defaultExpanded: true,
      },
      {
        id: 'peak-hour',
        label: 'Peak Hour',
        shortLabel: 'Peak',
        // usePoliceHourlyPattern queries the 2018+ dataset. On a historical
        // range it returns no rows and peakHour falls back to 0, which renders
        // as a confident "12am" for a window it never read. Withhold it.
        // (The heatgrid and time-of-day filter already self-suppress on an
        // all-zero grid, which is why they vanish instead of lying.)
        value: hasHistorical ? '—' : formatHour(stats.peakHour),
        subtitle: hasHistorical ? 'Hour-of-day not available before 2018' : undefined,
        wrapSubtitle: hasHistorical,
        color: '#5c9693',
        delay: 240,
        info: 'peak-hour',
        defaultExpanded: false,
      },
    ]
    // 911 card hidden (not "—") for Oakland: no such dataset exists, so the
    // SF subtitle 'Not recorded before 2018' would be a lie where the field
    // never existed.
    return isSF ? cards : cards.filter((c) => c.id !== '911-linked')
  }, [stats, totalCount, comparison.deltas, comparison.suppressed, compLabel, comparisonMode, trend.cityWideYoY, isSF])

  // Chart tray definitions (bottom-left overlay)
  const chartTiles = useMemo((): ChartTileDef[] => {
    const tiles: ChartTileDef[] = []
    // Belt: Oakland's resolutionRows is always []. Suspenders: era.plan.resolutionAvailable
    // documents WHY (ppgh-7dqv has no resolution/disposition column at all).
    if (era.plan.resolutionAvailable && resolutionBarData.length > 0) {
      tiles.push({
        id: 'resolution',
        label: 'Resolution Breakdown',
        shortLabel: 'Resolution',
        color: '#8b6282',
        defaultExpanded: true,
        render: () => (
          <HorizontalBarChart
            data={resolutionBarData}
            width={320}
            height={resolutionBarData.length * 20 + 8}
            maxBars={8}
            valueFormatter={(v) => v.toLocaleString()}
          />
        ),
      })
    }
    // Same reason as the card above: the comparison series is 2018+ only.
    if (!hasHistorical && comparisonMode !== null && comparison.currentTrend.length > 0) {
      tiles.push({
        id: 'daily-trend',
        label: `Daily Trend${comparison.isLoading ? ' (loading\u2026)' : ''}`,
        shortLabel: 'Trend',
        color: '#b85545',
        defaultExpanded: true,
        render: () => (
          <TrendChart
            current={comparison.currentTrend}
            comparison={comparison.comparisonTrend.length > 0 ? comparison.comparisonTrend : undefined}
            accentColor="#b85545"
            width={320}
            height={110}
          />
        ),
      })
    }
    return tiles
  }, [resolutionBarData, comparisonMode, comparison, isSF, era.plan])

  // Sidebar data
  const categoryEntries = useMemo(
    () => categoryRows.map((r) => ({ category: r.incident_category, count: parseInt(r.incident_count, 10) || 0 })),
    [categoryRows]
  )

  const neighborhoodEntries = useMemo(() => {
    return neighborhoodRows
      .map((r) => ({
        neighborhood: r.analysis_neighborhood,
        incidentCount: parseInt(r.incident_count, 10) || 0,
      }))
      .filter((r) => r.neighborhood)
  }, [neighborhoodRows])

  // Z-score computation for anomaly mode
  const neighborhoodAnomalies = useMemo(() => {
    if (neighborhoodEntries.length === 0) return new Map<string, number>()
    const counts = neighborhoodEntries.map((n) => n.incidentCount)
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length
    const stdDev = Math.sqrt(counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length)
    if (stdDev === 0) return new Map<string, number>()
    const map = new Map<string, number>()
    for (const n of neighborhoodEntries) {
      map.set(n.neighborhood, (n.incidentCount - mean) / stdDev)
    }
    return map
  }, [neighborhoodEntries])

  // --- Map layers ---
  // Heatmap GeoJSON
  const heatmapGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'heatmap' || incidentData.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: incidentData.map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
        properties: {
          incidentId: r.incidentId,
          category: r.category,
          description: r.description,
          resolution: r.resolution,
          neighborhood: r.neighborhood,
          incidentAt: r.incidentAt,
          cadNumber: r.cadNumber,
        },
      })),
    }
  }, [incidentData, mapMode])

  const heatmapLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'crime-heat',
      type: 'heatmap',
      source: 'crime-heatmap-data',
      maxzoom: 15,
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 0.6, 15, 1],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.1, 'rgba(239, 68, 68, 0.15)',
          0.25, 'rgba(239, 68, 68, 0.35)',
          0.4, 'rgba(245, 158, 11, 0.5)',
          0.6, 'rgba(251, 191, 36, 0.6)',
          0.8, 'rgba(253, 224, 71, 0.7)',
          1, 'rgba(254, 249, 195, 0.8)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 25],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.4, 16, 0.15],
      },
    } as mapboxgl.AnyLayer,
    {
      id: 'crime-points',
      type: 'circle',
      source: 'crime-heatmap-data',
      minzoom: 13,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 6],
        'circle-color': '#b85545',
        'circle-opacity': 0.7,
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.15)',
      },
    } as mapboxgl.AnyLayer,
  ], [])

  // Anomaly choropleth GeoJSON
  const anomalyGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'anomaly' || !neighborhoodBoundaries || neighborhoodAnomalies.size === 0) return null
    return {
      type: 'FeatureCollection',
      features: neighborhoodBoundaries.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          zScore: neighborhoodAnomalies.get(f.properties?.nhood ?? '') ?? 0,
          incidentCount: neighborhoodEntries.find((n) => n.neighborhood === f.properties?.nhood)?.incidentCount ?? 0,
        },
      })),
    }
  }, [mapMode, neighborhoodBoundaries, neighborhoodAnomalies, neighborhoodEntries])

  const anomalyLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'crime-neighborhood-fill',
      type: 'fill',
      source: 'neighborhood-crime-anomaly',
      paint: {
        'fill-color': [
          'interpolate', ['linear'], ['get', 'zScore'],
          -2, '#3f7573',
          -1, '#8bb5b2',
          0, '#e2e8f0',
          1, '#e8c06b',
          2, '#b85545',
          3, '#6f2b20',
        ],
        'fill-opacity': 0.55,
      },
    } as mapboxgl.AnyLayer,
    {
      id: 'crime-neighborhood-outline',
      type: 'line',
      source: 'neighborhood-crime-anomaly',
      paint: {
        'line-color': '#ffffff',
        'line-width': 1,
        'line-opacity': 0.4,
      },
    } as mapboxgl.AnyLayer,
  ], [])

  // Bind layers reactively
  useMapLayer(mapInstance, 'crime-heatmap-data', heatmapGeojson, heatmapLayers)
  useMapLayer(mapInstance, 'neighborhood-crime-anomaly', anomalyGeojson, anomalyLayers)

  // Heatmap tooltip
  useMapTooltip(mapInstance, 'crime-points', (props) => {
    const dt = props.incidentAt ? new Date(String(props.incidentAt)) : null
    const dateStr = dt
      ? dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null
    const timeStr = dt
      ? dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : null
    if (!isSF) {
      // Hover is a PEEK — just enough to decide whether to click: when + what.
      // The charge list, address, and beat are the click panel's job; showing
      // them here made the tooltip a duplicate detail card (the panel owns them).
      return `
      ${dateStr ? `<div style="color:#e2e8f0">${dateStr} · ${timeStr}</div>` : ''}
      <div class="tooltip-label" style="margin-top:6px">Category</div>
      <div style="color:#e2e8f0">${titleCaseCrimetype(String(props.category ?? '')) || 'Unknown'}</div>
    `
    }
    const linked = props.cadNumber ? '<span style="color:#8b6282;font-size:0.5625rem;margin-left:4px">911 LINKED</span>' : ''
    return `
      ${dateStr ? `<div style="color:#e2e8f0">${dateStr} · ${timeStr}${linked}</div>` : ''}
      <div class="tooltip-label" style="margin-top:6px">Category</div>
      <div style="color:#e2e8f0">${props.category || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Description</div>
      <div style="color:#94a3b8">${props.description || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Resolution</div>
      <div style="color:#94a3b8">${props.resolution || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Neighborhood</div>
      <div style="color:#94a3b8">${props.neighborhood || 'Unknown'}</div>
    `
  })

  // Anomaly tooltip
  useMapTooltip(mapInstance, 'crime-neighborhood-fill', (props) => {
    const zScore = Number(props.zScore).toFixed(1)
    const sign = Number(props.zScore) >= 0 ? '+' : ''
    return `
      <div class="tooltip-label">${city.areas.noun[0].toUpperCase()}${city.areas.noun.slice(1)}</div>
      <div class="tooltip-value">${props.nhood ? areaLabel(String(props.nhood)) : 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Crime Anomaly</div>
      <div class="tooltip-value">${sign}${zScore}\u03C3</div>
      <div class="tooltip-label" style="margin-top:6px">Incidents</div>
      <div style="color:#94a3b8">${Number(props.incidentCount).toLocaleString()}</div>
    `
  })

  // Neighborhood click in anomaly mode
  useEffect(() => {
    if (!mapInstance || mapMode !== 'anomaly') return

    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const nhood = e.features[0].properties?.nhood
      if (nhood) {
        setSelectedNeighborhood(selectedNeighborhood === nhood ? null : nhood)
      }
    }

    const tryAttach = () => {
      try {
        if (mapInstance.getLayer('crime-neighborhood-fill')) {
          mapInstance.on('click', 'crime-neighborhood-fill', handleClick)
          return true
        }
      } catch { /* layer not ready */ }
      return false
    }

    if (!tryAttach()) {
      const interval = setInterval(() => {
        if (tryAttach()) clearInterval(interval)
      }, 500)
      return () => {
        clearInterval(interval)
        try { mapInstance.off('click', 'crime-neighborhood-fill', handleClick) } catch { /* */ }
      }
    }

    return () => {
      try { mapInstance.off('click', 'crime-neighborhood-fill', handleClick) } catch { /* */ }
    }
  }, [mapInstance, mapMode, selectedNeighborhood, setSelectedNeighborhood])

  // Click handler on crime points for detail panel
  useEffect(() => {
    if (!mapInstance) return

    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const feature = e.features[0]
      const incidentId = feature.properties?.incidentId
      if (!incidentId) return
      setSelectedCrimeIncident(String(incidentId))
      const coords = (feature.geometry as GeoJSON.Point).coordinates
      // Offset so the incident lands clear of its own top-right detail card (w-80 = 320px).
      mapInstance.flyTo({ center: [coords[0], coords[1]], zoom: 17, duration: 800, offset: eventFlyToOffset(mapInstance, 320) })
    }

    const tryAttach = () => {
      try {
        if (mapInstance.getLayer('crime-points')) {
          mapInstance.on('click', 'crime-points', handleClick)
          return true
        }
      } catch { /* layer not ready */ }
      return false
    }

    if (!tryAttach()) {
      const interval = setInterval(() => {
        if (tryAttach()) clearInterval(interval)
      }, 500)
      return () => {
        clearInterval(interval)
        try { mapInstance.off('click', 'crime-points', handleClick) } catch { /* */ }
      }
    }

    return () => {
      try { mapInstance.off('click', 'crime-points', handleClick) } catch { /* */ }
    }
  }, [mapInstance, setSelectedCrimeIncident])

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    setMapInstance(map)
  }, [])

  const handleNeighborhoodClick = useCallback((neighborhood: string) => {
    setSelectedNeighborhood(selectedNeighborhood === neighborhood ? null : neighborhood)
    const nhoodIncidents = incidentData.filter((c) => c.neighborhood === neighborhood)
    if (nhoodIncidents.length > 0 && mapInstance) {
      const avgLat = nhoodIncidents.reduce((s, c) => s + c.lat, 0) / nhoodIncidents.length
      const avgLng = nhoodIncidents.reduce((s, c) => s + c.lng, 0) / nhoodIncidents.length
      mapInstance.flyTo({ center: [avgLng, avgLat], zoom: 14, duration: 1200 })
    }
  }, [incidentData, mapInstance, selectedNeighborhood, setSelectedNeighborhood])

  useProgressScope()

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-20">
        {/* items-start on mobile so the title can wrap on the left while the
            controls flow from the top-right (no empty well); md restores the
            centered single row. */}
        <div className="flex flex-wrap items-start justify-between gap-3 desk:items-center">
          <div className="flex flex-wrap items-center gap-4 min-w-0">
            <div className="min-w-0">
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                Crime Incidents
              </h1>
              <p className="hidden sm:block truncate text-micro font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                {CRIME_EYEBROWS[city.id as keyof typeof CRIME_EYEBROWS] ?? CRIME_EYEBROWS.sf}
              </p>
            </div>
            {/* Records count hidden on mobile — keeps the title column clean on a
                phone; the same count surfaces on the map stat overlay. */}
            {!isLoading && incidentData.length > 0 && (
              <div className="hidden sm:flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-micro font-mono text-brick-500/80 bg-brick-500/10 px-2 py-1 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-brick-500 pulse-live" />
                  {formatNumber(incidentData.length)} records
                </span>
                {hitLimit && totalCount !== null && (
                  <span className="text-micro font-mono text-ochre-500/80 bg-ochre-500/10 px-2 py-1 rounded-full">
                    of {formatNumber(totalCount)} total
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 flex-shrink-0">
            {/* Map mode toggle */}
            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
              {(['heatmap', 'anomaly'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setMapMode(mode)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                    mapMode === mode
                      ? 'bg-white dark:bg-white/[0.08] text-ink dark:text-white shadow-sm'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {mode === 'heatmap' ? 'Heatmap' : 'Anomaly'}
                </button>
              ))}
            </div>
              <UnderlayPicker
                presets={underlayPreset}
                activeVariable={underlayVariable}
                onSelect={setUnderlayVariable}
              />
            <ExportButton targetSelector="#crime-capture" filename="crime-incidents" />
          </div>
        </div>
      </header>

      {/* Cross-view ticker — signals from other datasets */}
      {isSF && (
        <div className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-1 bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl z-10">
          <CivicTicker
            items={civicIndicators.items.filter(i => i.source.view !== '/crime-incidents')}
            size="compact"
          />
        </div>
      )}

      {/* Time-of-day filter sub-header */}
      {!hourlyPattern.isLoading && hourlyPattern.hourTotals.some((t) => t > 0) && (
        <div className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-2 bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl z-10">
          <div className="flex items-center gap-3">
            <p
              className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 whitespace-nowrap"
              title={isSF ? undefined : '~3% of Oakland reports carry no clock time and file as midnight — hour 0 is inflated'}
            >
              Time of Day
            </p>
            <div className="flex-1">
              <TimeOfDayFilter hourTotals={hourlyPattern.hourTotals} />
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div id="crime-capture" className="flex-1 overflow-hidden flex">
        {/* Map hero */}
        <div className="flex-1 relative">
          <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
            {isLoading && <MapScanOverlay label="Scanning incidents" color="#d17566" />}
            <MapProgressBar color="#d17566" />
            <UnderlayLegend variable={underlayVariable} data={censusNeighborhoods} />

            {error && (
              <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 w-full max-w-md rounded-[14px] backdrop-blur-xl bg-white/60 dark:bg-slate-900/60">
                <ErrorState message={error} onRetry={refetch} what="crime reports" />
              </div>
            )}

            {/* Freshness is measured against the 2018+ dataset, so a
                deliberately historical range would always look "stale" and
                offer to yank the user back to last month. Suppressed there. */}
            {!hasHistorical && !isLoading && !freshness.isLoading && !freshness.hasDataInRange && (
              <DataFreshnessAlert
                latestDate={freshness.latestDate}
                suggestedRange={freshness.suggestedRange}
                accentColor="#b85545"
              />
            )}

            {/* Stat cards — top left */}
            {isLoading && <SkeletonStatCards count={3} />}
            {!isLoading && incidentData.length > 0 && (
              <CardTray viewId="crimeIncidents" cards={cardDefs} />
            )}

            {/* Charts — bottom left */}
            {!isLoading && chartTiles.length > 0 && (
              <ChartTray viewId="crimeIncidents" tiles={chartTiles} />
            )}

            {/* Anomaly legend */}
            {mapMode === 'anomaly' && neighborhoodAnomalies.size > 0 && (
              <div className="absolute bottom-6 right-5 z-10 glass-card rounded-xl p-3">
                <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                  Crime Anomaly<InfoTip term="anomaly-map" size={10} />
                </p>
                <div className="flex items-center gap-1">
                  <span className="text-nano font-mono text-teal-500">{'\u2212'}2\u03C3</span>
                  <div className="flex h-2.5 rounded-full overflow-hidden" style={{ width: 100 }}>
                    {['#3f7573', '#8bb5b2', '#e2e8f0', '#e8c06b', '#b85545', '#6f2b20'].map((c, i) => (
                      <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <span className="text-nano font-mono text-brick-400">+3\u03C3</span>
                </div>
                <p className="text-nano text-slate-500 mt-1">below avg {'\u2192'} above avg</p>
                {!isSF && era.unmappedShare != null && era.unmappedShare > 0.001 && (
                  <p className="text-nano text-slate-500 mt-1">
                    excludes {(era.unmappedShare * 100).toFixed(1)}% unmapped incidents
                  </p>
                )}
              </div>
            )}

            {/* Crime detail panel */}
            <CrimeDetailPanel />
          </MapView>
        </div>

        {/* Sidebar */}
        <MapSidebar>
          {/* Tab bar */}
          <div className="flex border-b border-slate-200/50 dark:border-white/[0.04] flex-shrink-0">
            {([['categories', 'Categories'], ['neighborhoods', isSF ? 'Neighborhoods' : 'Beats']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSidebarTab(key)}
                className={`flex-1 py-2.5 text-micro font-mono uppercase tracking-[0.15em] transition-all duration-200 ${
                  sidebarTab === key
                    ? 'text-ink dark:text-white border-b-2 border-brick-500'
                    : 'text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            {sidebarTab === 'categories' && (
              <>
                {isSF && !hasHistorical && (
                  <>
                    <SubcategoryStrip
                      eyebrow="What's moving"
                      movers={subcats.crimeMovers}
                      comparisonLabel={subcats.comparisonLabel}
                      compared={subcats.compared}
                      selectedSubs={selectedSubs}
                      onSelect={toggleSub}
                      emptyNote="Too few incidents in this range to rank movers."
                    />
                    {subcats.enforcementMovers.length > 0 && (
                      <SubcategoryStrip
                        eyebrow="Enforcement activity · what police chose to act on"
                        movers={subcats.enforcementMovers}
                        comparisonLabel={subcats.comparisonLabel}
                        compared={subcats.compared}
                        selectedSubs={selectedSubs}
                        onSelect={toggleSub}
                        emptyNote=""
                      />
                    )}
                  </>
                )}
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                    Incident Categories
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                </div>
                {/* The violent / property / quality-of-life groups are built
                    on the 2018+ category names. SFPD used a different system
                    before 2018 ('LARCENY/THEFT', 'OTHER OFFENSES'), so the
                    filter would match nothing on a historical range. The rail
                    still LISTS whatever each era published — only the filter
                    is withheld, and it says why. */}
                {hasHistorical ? (
                  <p className="text-micro font-mono uppercase tracking-[0.18em] text-ink/45 dark:text-paper-100/45 leading-relaxed">
                    Filtering unavailable — SFPD changed its category system in
                    2018, and these counts are shown as each era published them.
                  </p>
                ) : (
                  <IncidentCategoryFilter
                    categories={categoryEntries}
                    selected={selectedCategories}
                    onChange={setSelectedCategories}
                    groups={isSF ? undefined : OAKLAND_CRIME_GROUPS}
                    formatLabel={isSF ? undefined : titleCaseCrimetype}
                    subcategories={isSF ? subcats.byCategory : undefined}
                    selectedSubs={isSF ? selectedSubs : undefined}
                    onToggleSub={isSF ? toggleSub : undefined}
                  />
                )}
                {/* Oakland only: OPD files coroner death probes under its
                    homicide code (~92% of that bucket). We split it; this
                    discloses what each half means and why Homicide is a floor. */}
                {!isSF && (
                  <div className="mt-4 pt-3 border-t border-slate-200/50 dark:border-white/[0.06]">
                    <p className="text-micro text-ink/60 dark:text-paper-100/55 leading-relaxed">
                      <span className="font-semibold text-ink/80 dark:text-paper-100/75">Homicide</span>{' '}
                      counts charged murder and manslaughter cases, not Oakland&rsquo;s official toll. Many
                      killings are coded as death investigations until the Coroner rules, so this figure runs
                      below the official count.{' '}
                      <span className="font-semibold text-ink/80 dark:text-paper-100/75">Death Investigations</span>{' '}
                      are coroner probes of sudden or unexplained deaths, not crimes.
                    </p>
                  </div>
                )}
              </>
            )}

            {sidebarTab === 'neighborhoods' && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                    {isSF ? 'By Neighborhood' : 'By Beat'}
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                </div>

                {selectedNeighborhood && (
                  <button
                    onClick={() => setSelectedNeighborhood(null)}
                    className="mb-3 text-micro font-mono text-brick-500 hover:text-brick-400 transition-colors"
                  >
                    {'\u2190'} Clear filter: {areaLabel(selectedNeighborhood)}
                  </button>
                )}

                {selectedNeighborhood && (
                  <>
                    {censusMatchesAreas(city) && (
                      <NeighborhoodCensusContext
                        neighborhood={selectedNeighborhood}
                        censusData={censusNeighborhoods.find(n => n.name === selectedNeighborhood)}
                        cityAverages={cityAvg}
                        civicCount={neighborhoodEntries.find(n => n.neighborhood === selectedNeighborhood)?.incidentCount}
                        civicLabel="Incidents"
                      />
                    )}
                    <ScannerFeedChips neighborhood={selectedNeighborhood} serviceFilter="police" />
                  </>
                )}

                {/* Heatgrid in sidebar */}
                {!hourlyPattern.isLoading && hourlyPattern.grid.some((row) => row.some((v) => v > 0)) && (
                  <div className="mb-4">
                    <HourlyHeatgrid grid={hourlyPattern.grid} width={264} height={160} />
                    <p className="text-micro text-slate-400 dark:text-slate-500 mt-2 font-mono">
                      Peak: <span className="text-brick-500">{formatHour(hourlyPattern.peakHour)}</span>
                      {' \u00B7 '}Quiet: <span className="text-slate-500">{formatHour(hourlyPattern.quietestHour)}</span>
                    </p>
                    {!isSF && (
                      <p className="text-nano text-slate-400/70 dark:text-slate-600 mt-1 leading-relaxed">
                        ~3% of reports carry no clock time and file as midnight — hour 0 is inflated
                      </p>
                    )}
                  </div>
                )}

                {!trend.isLoading && trend.currentPeriods.length > 0 && (
                  <div className="mb-4">
                    <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 mb-2">
                      Volume Trend
                    </p>
                    <PeriodBreakdownChart
                      current={trend.currentPeriods}
                      priorYear={trend.priorYearPeriods}
                      granularity={trend.granularity}
                      accentColor="#b85545"
                      width={264}
                      height={130}
                    />
                  </div>
                )}

                {isLoading && <SkeletonSidebarRows count={8} />}
                <div className="space-y-0.5 stagger-in">
                  {neighborhoodEntries.slice(0, 30).map((ns) => {
                    const maxCount = neighborhoodEntries[0]?.incidentCount || 1
                    const barWidth = (ns.incidentCount / maxCount) * 100
                    const isActive = selectedNeighborhood === ns.neighborhood
                    const zScore = neighborhoodAnomalies.get(ns.neighborhood)
                    return (
                      <div
                        key={ns.neighborhood}
                        onClick={() => handleNeighborhoodClick(ns.neighborhood)}
                        className={`relative py-2 px-3 rounded-lg cursor-pointer transition-all duration-200 ${
                          isActive
                            ? 'bg-brick-500/10 ring-1 ring-brick-500/30'
                            : 'hover:bg-white/80 dark:hover:bg-white/[0.04]'
                        }`}
                      >
                        <div
                          className="absolute inset-y-0 left-0 rounded-lg opacity-[0.06] bar-grow"
                          style={{ width: `${barWidth}%`, backgroundColor: '#b85545' }}
                        />
                        <div className="relative flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-ink dark:text-slate-200 leading-tight flex items-baseline gap-1.5 min-w-0">
                              <AreaRowLabel areas={city.areas} id={ns.neighborhood} />
                            </p>
                            <p className="text-micro text-slate-400 dark:text-slate-600 font-mono italic">
                              {(() => {
                                const nhTrend = trend.neighborhoodMap.get(ns.neighborhood)
                                if (nhTrend?.priorYearCount) {
                                  return (
                                    <span className={nhTrend.yoyPct > 0 ? 'text-brick-400' : nhTrend.yoyPct < 0 ? 'text-moss-400' : ''}>
                                      {nhTrend.yoyPct >= 0 ? '+' : ''}{nhTrend.yoyPct.toFixed(0)}%{' \u00B7 '}
                                    </span>
                                  )
                                }
                                return null
                              })()}
                              {ns.incidentCount.toLocaleString()} incidents
                              {zScore !== undefined && (
                                <span className={zScore > 1 ? 'text-brick-400' : zScore < -1 ? 'text-teal-500' : ''}>
                                  {' \u00B7 '}{zScore >= 0 ? '+' : ''}{zScore.toFixed(1)}{'\u03C3'}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {!isSF && era.unmappedShare != null && era.unmappedShare > 0.001 && (
                  <p className="mt-3 text-nano font-mono uppercase tracking-[0.15em] text-slate-400/70 dark:text-slate-500 leading-relaxed">
                    {(era.unmappedShare * 100).toFixed(1)}% of incidents carry no mappable beat —
                    counted in citywide totals, absent from this ranking and the map
                  </p>
                )}
              </>
            )}
          </div>
        </MapSidebar>
      </div>
    </div>
  )
}
