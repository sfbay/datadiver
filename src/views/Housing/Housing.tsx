import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import CivicTicker from '@/components/ui/CivicTicker'
import { useCivicIndicators } from '@/hooks/useCivicIndicators'
import { useDataset } from '@/hooks/useDataset'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useDataFreshness } from '@/hooks/useDataFreshness'
import { useProgressScope } from '@/hooks/useLoadingProgress'
import { useAppStore } from '@/stores/appStore'
import { eventFlyToOffset } from '@/utils/cameraPadding'
import { extractCoordinates } from '@/utils/geo'
import { formatDate, formatNumber, formatDelta } from '@/utils/time'
import { resolveComparisonStart, comparisonLabel } from '@/utils/comparisonMode'
import { useTrendBaseline } from '@/hooks/useTrendBaseline'
import type { TrendConfig } from '@/types/trends'
import { useEvictionComparisonData } from '@/hooks/useComparisonDataFactory'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useMapCameraPresets } from '@/hooks/useMapCameraPresets'
import type { EvictionNoticeRow, BuyoutRow } from '@/types/datasets'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import MapSidebar from '@/components/layout/MapSidebar'
import ExportButton from '@/components/export/ExportButton'
import DataFreshnessAlert from '@/components/ui/DataFreshnessAlert'
import { ErrorState } from '@/components/ui/ErrorState'
import { MapScanOverlay, MapProgressBar, SkeletonStatCards, SkeletonSidebarRows } from '@/components/ui/Skeleton'
import CardTray, { type CardDef } from '@/components/ui/CardTray'
import EvictionDetailPanel from '@/components/ui/EvictionDetailPanel'
import BuyoutDetailPanel from '@/components/ui/BuyoutDetailPanel'
import EraStrip from './EraStrip'
import { parseYearCounts } from './eraStripMath'
import { ALL_CAUSES, CAUSE_LABELS, buildCauseClause, causeBreakdownSelect, noFaultClause, type CauseColumn } from './causes'
import EvictionCauseFilter from './EvictionCauseFilter'
import { buyoutRadius, parseAmount } from './buyoutScale'

const HOUSING_STREAMS = [
  { id: 'evictions', label: 'Eviction Notices', pigment: '#b85a33',
    datasetKey: 'evictionNotices' as const, dateField: 'file_date',
    neighborhoodField: 'neighborhood' },
  { id: 'buyouts', label: 'Buyouts', pigment: '#d4a435',
    datasetKey: 'buyoutAgreements' as const, dateField: 'buyout_agreement_date',
    neighborhoodField: 'analysis_neighborhood' },
] as const
type StreamId = (typeof HOUSING_STREAMS)[number]['id']

const STREAM_IDS = HOUSING_STREAMS.map((s) => s.id)
const STREAM_TEXT_CLASS: Record<StreamId, string> = {
  evictions: 'text-terracotta-500',
  buyouts: 'text-ochre-500',
}

type MapMode = 'dots' | 'heatmap'

/** useMapLayer's data-update effect ignores `null` (stale layer), so toggle-off
 *  must pass an explicit empty FeatureCollection instead of null to clear the map. */
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] } as const

const EVICTION_SELECT_FIELDS = `eviction_id,address,file_date,neighborhood,supervisor_district,client_location,${ALL_CAUSES.join(',')}`
const BUYOUT_SELECT_FIELDS = 'case_number,buyout_agreement_date,pre_buyout_disclosure_declaration_date,buyout_amount,unknown_amount,number_of_tenants,address,analysis_neighborhood,supervisor_district,point'

interface EvictionNeighborhoodAggRow { neighborhood: string; n: string }
interface BuyoutNeighborhoodAggRow { analysis_neighborhood: string; n: string; total: string }
interface YearAggRow { yr?: string; n: string }
interface NeighborhoodRankRow { neighborhood: string; evictionCount: number; buyoutCount: number; buyoutTotal: number }

/** Stream toggle chip — TrafficSafety overlay-chip visual: pigment dot + label + count. */
function StreamChip({ label, pigment, textClass, active, count, onClick }: {
  label: string
  pigment: string
  textClass: string
  active: boolean
  count: number | null
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-micro font-mono font-medium transition-all duration-200 ${
        active
          ? `bg-white dark:bg-white/[0.08] shadow-sm ${textClass}`
          : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? '' : 'bg-slate-400 dark:bg-slate-500'}`}
        style={active ? { backgroundColor: pigment } : undefined}
      />
      {label}
      {count !== null && <span className="tabular-nums opacity-70">{formatNumber(count)}</span>}
    </button>
  )
}

export default function Housing() {
  const { dateRange, comparisonMode, selectedHousingEvent, setSelectedHousingEvent, setDateRange } = useAppStore()
  const civicIndicators = useCivicIndicators()
  const [searchParams, setSearchParams] = useSearchParams()
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const [geoGapDismissed, setGeoGapDismissed] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'causes' | 'neighborhoods'>('causes')
  const mapHandleRef = useRef<MapHandle>(null)

  // Deep-link: rehydrate detail panel from URL on mount.
  useEffect(() => {
    const detailParam = searchParams.get('detail')
    if (detailParam) setSelectedHousingEvent(detailParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync detail selection → URL param
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (selectedHousingEvent) next.set('detail', selectedHousingEvent)
      else next.delete('detail')
      return next
    }, { replace: true })
  }, [selectedHousingEvent, setSearchParams])

  // --- View-local state from URL params ---
  const enabledStreams = useMemo(() => {
    const param = searchParams.get('streams')
    if (param === null) return new Set<StreamId>(STREAM_IDS)
    const valid = new Set<string>(STREAM_IDS)
    const parsed = param.split(',').map(decodeURIComponent).filter((s) => valid.has(s))
    return new Set(parsed as StreamId[])
  }, [searchParams])

  const mapMode: MapMode = searchParams.get('map_mode') === 'heatmap' ? 'heatmap' : 'dots'

  const selectedCauses = useMemo(() => {
    const param = searchParams.get('causes')
    if (!param) return new Set<string>()
    return new Set(param.split(',').map(decodeURIComponent))
  }, [searchParams])

  const selectedNeighborhood = searchParams.get('neighborhood') || null

  const toggleStream = useCallback((id: StreamId) => {
    const next = new Set(enabledStreams)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      if (next.size === STREAM_IDS.length) params.delete('streams')
      else params.set('streams', Array.from(next).map(encodeURIComponent).join(','))
      return params
    }, { replace: true })
  }, [enabledStreams, setSearchParams])

  const setMapMode = useCallback((mode: MapMode) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (mode === 'dots') next.delete('map_mode')
      else next.set('map_mode', mode)
      return next
    }, { replace: true })
  }, [setSearchParams])

  // setSelectedCauses / setSelectedNeighborhood: URL-state writers for the
  // EvictionCauseFilter + neighborhood sidebar wiring that lands in a later
  // task. Defined now so the URL contract (?causes=, ?neighborhood=) is
  // complete and round-trips even though no UI calls these setters yet.
  const setSelectedCauses = useCallback((causes: Set<string>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (causes.size === 0) next.delete('causes')
      else next.set('causes', Array.from(causes).map(encodeURIComponent).join(','))
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
  const causeClause = useMemo(() => buildCauseClause(selectedCauses), [selectedCauses])

  const evictionDateOnlyClause = useMemo(() => {
    return `file_date >= '${dateRange.start}' AND file_date <= '${dateRange.end}'`
  }, [dateRange])

  const evictionWhere = useMemo(() => {
    const conditions = [evictionDateOnlyClause]
    if (causeClause) conditions.push(causeClause)
    if (selectedNeighborhood) conditions.push(`neighborhood = '${selectedNeighborhood.replace(/'/g, "''")}'`)
    return conditions.join(' AND ')
  }, [evictionDateOnlyClause, causeClause, selectedNeighborhood])

  // Comparison-hook variant of evictionWhere: the comparison factory locates
  // the current period inside the where string via a literal
  // `${dateField} >= '${start}T00:00:00'` / `<= '${end}T23:59:59'` match (see
  // useComparisonDataFactory.ts) to swap in the comparison window — the plain
  // date-only evictionWhere above has no time suffix and would silently fail
  // that match, leaving the "comparison" query identical to the current one.
  const evictionCompareWhere = useMemo(() => {
    const conditions = [`file_date >= '${dateRange.start}T00:00:00'`, `file_date <= '${dateRange.end}T23:59:59'`]
    if (causeClause) conditions.push(causeClause)
    if (selectedNeighborhood) conditions.push(`neighborhood = '${selectedNeighborhood.replace(/'/g, "''")}'`)
    return conditions.join(' AND ')
  }, [dateRange, causeClause, selectedNeighborhood])

  const buyoutDateOnlyClause = useMemo(() => {
    return `buyout_agreement_date >= '${dateRange.start}' AND buyout_agreement_date <= '${dateRange.end}'`
  }, [dateRange])

  const buyoutWhere = useMemo(() => {
    const conditions = [buyoutDateOnlyClause]
    if (selectedNeighborhood) conditions.push(`analysis_neighborhood = '${selectedNeighborhood.replace(/'/g, "''")}'`)
    return conditions.join(' AND ')
  }, [buyoutDateOnlyClause, selectedNeighborhood])

  // Scope shared by the no-fault numerator and its denominator: date +
  // neighborhood (when selected), deliberately NO cause clause.
  const evictionScopeWhere = useMemo(() => {
    const conditions = [evictionDateOnlyClause]
    if (selectedNeighborhood) conditions.push(`neighborhood = '${selectedNeighborhood.replace(/'/g, "''")}'`)
    return conditions.join(' AND ')
  }, [evictionDateOnlyClause, selectedNeighborhood])

  const noFaultWhere = useMemo(() => `${evictionScopeWhere} AND ${noFaultClause()}`, [evictionScopeWhere])

  // Ranking queries stay citywide (comparison-not-drilldown): date + cause,
  // NO selected-neighborhood clause. Buyouts have no cause filter, so their
  // ranking where is just the date clause.
  const evictionRankingWhere = useMemo(() => {
    const conditions = [evictionDateOnlyClause]
    if (causeClause) conditions.push(causeClause)
    return conditions.join(' AND ')
  }, [evictionDateOnlyClause, causeClause])

  const declarationsWhere = useMemo(() => {
    return `pre_buyout_disclosure_declaration_date >= '${dateRange.start}' AND pre_buyout_disclosure_declaration_date <= '${dateRange.end}'`
  }, [dateRange])

  const freshness = useDataFreshness('evictionNotices', 'file_date', dateRange, { geoField: 'client_location' })

  // --- Data queries (10 total) ---
  // 1. Eviction rows (map dots)
  const { data: evictionRows, isLoading: evictionsLoading, error: evictionsError, hitLimit: evictionsHitLimit, refetch: refetchEvictions } = useDataset<EvictionNoticeRow>(
    'evictionNotices',
    { $where: evictionWhere, $limit: 5000, $select: EVICTION_SELECT_FIELDS, $order: 'file_date DESC' },
    [evictionWhere]
  )

  // 2. Buyout rows (map rings)
  const { data: buyoutRows, isLoading: buyoutsLoading, error: buyoutsError, hitLimit: buyoutsHitLimit, refetch: refetchBuyouts } = useDataset<BuyoutRow>(
    'buyoutAgreements',
    { $where: buyoutWhere, $limit: 5000, $select: BUYOUT_SELECT_FIELDS, $order: 'buyout_agreement_date DESC' },
    [buyoutWhere]
  )

  // 3. Eviction total count
  const { data: evictionCountRows } = useDataset<{ count: string }>(
    'evictionNotices',
    { $select: 'count(*) as count', $where: evictionWhere },
    [evictionWhere]
  )
  const evictionTotal = evictionCountRows[0] ? parseInt(evictionCountRows[0].count, 10) : null

  // 4. Buyout total count
  const { data: buyoutCountRows } = useDataset<{ count: string }>(
    'buyoutAgreements',
    { $select: 'count(*) as count', $where: buyoutWhere },
    [buyoutWhere]
  )
  const buyoutTotal = buyoutCountRows[0] ? parseInt(buyoutCountRows[0].count, 10) : null

  // 5. No-fault count
  const { data: noFaultRows } = useDataset<{ count: string }>(
    'evictionNotices',
    { $select: 'count(*) as count', $where: noFaultWhere },
    [noFaultWhere]
  )
  const noFaultCount = noFaultRows[0] ? parseInt(noFaultRows[0].count, 10) : null

  // 5b. Eviction scope total — denominator for the no-fault share (Task 8):
  // same date+neighborhood scope as noFaultWhere, but NO cause clause.
  const { data: evictionScopeTotalRows } = useDataset<{ count: string }>(
    'evictionNotices',
    { $select: 'count(*) as count', $where: evictionScopeWhere },
    [evictionScopeWhere]
  )
  const evictionScopeTotal = evictionScopeTotalRows[0] ? parseInt(evictionScopeTotalRows[0].count, 10) : null

  // 6. Cause breakdown — one wide row, date-only clause (unfiltered by cause/neighborhood)
  const { data: causeBreakdownRows } = useDataset<Record<CauseColumn, string>>(
    'evictionNotices',
    { $select: causeBreakdownSelect(), $where: evictionDateOnlyClause, $limit: 1 },
    [evictionDateOnlyClause]
  )

  // 7. Median buyout
  const { data: medianBuyoutRows } = useDataset<{ med: string }>(
    'buyoutAgreements',
    { $select: 'median(buyout_amount) as med', $where: buyoutWhere, $limit: 1 },
    [buyoutWhere]
  )
  const medianBuyout = medianBuyoutRows[0]?.med != null ? parseAmount(medianBuyoutRows[0].med) : null

  // 8. Declarations in range — deliberately NO agreement-date clause; counts undated rows.
  const { data: declarationRows } = useDataset<{ count: string }>(
    'buyoutAgreements',
    { $select: 'count(*) as count', $where: declarationsWhere, $limit: 1 },
    [declarationsWhere]
  )
  const declarationsInRange = declarationRows[0] ? parseInt(declarationRows[0].count, 10) : null

  // 9. Per-stream neighborhood GROUP BY — citywide ranking (comparison-not-
  // drilldown): date (+cause for evictions) only, NEVER the selected-
  // neighborhood clause — this is the comparison frame, not a drilldown.
  const { data: evictionNeighborhoodRows } = useDataset<EvictionNeighborhoodAggRow>(
    'evictionNotices',
    { $select: 'neighborhood, count(*) as n', $where: evictionRankingWhere, $group: 'neighborhood', $order: 'n DESC', $limit: 50 },
    [evictionRankingWhere]
  )
  const { data: buyoutNeighborhoodRows } = useDataset<BuyoutNeighborhoodAggRow>(
    'buyoutAgreements',
    { $select: 'analysis_neighborhood, count(*) as n, sum(buyout_amount) as total', $where: buyoutDateOnlyClause, $group: 'analysis_neighborhood', $order: 'n DESC', $limit: 50 },
    [buyoutDateOnlyClause]
  )

  // 10. Era strip years — stable storytelling context, NO date/cause filter (Task 8 mounts EraStrip)
  const { data: evictionYearRows, isLoading: evictionYearsLoading } = useDataset<YearAggRow>(
    'evictionNotices',
    { $select: 'date_extract_y(file_date) as yr, count(*) as n', $group: 'yr', $order: 'yr', $limit: 50 },
    []
  )
  const { data: buyoutYearRows, isLoading: buyoutYearsLoading } = useDataset<YearAggRow>(
    'buyoutAgreements',
    { $select: 'date_extract_y(buyout_agreement_date) as yr, count(*) as n', $group: 'yr', $order: 'yr', $limit: 50 },
    []
  )
  const evictionYearCounts = useMemo(() => parseYearCounts(evictionYearRows), [evictionYearRows])
  const buyoutYearCounts = useMemo(() => parseYearCounts(buyoutYearRows), [buyoutYearRows])
  // evictionYearRows/buyoutYearRows feed EraStrip; causeBreakdownRows feeds
  // EvictionCauseFilter's counts; noFaultCount/declarationsInRange/medianBuyout
  // feed CardTray; evictionNeighborhoodRows/buyoutNeighborhoodRows feed the
  // sidebar ranking below.

  // Cause breakdown row (Socrata aggregates arrive as strings) → typed counts for EvictionCauseFilter.
  const causeCounts = useMemo((): Record<CauseColumn, number> => {
    const row = causeBreakdownRows[0]
    const result = {} as Record<CauseColumn, number>
    for (const c of ALL_CAUSES) result[c] = row ? Number(row[c]) || 0 : 0
    return result
  }, [causeBreakdownRows])

  // Sidebar neighborhood ranking: join the two per-stream GROUP BYs by name.
  // analysis_neighborhood (buyouts, 39 distinct) is an exact-name subset of
  // neighborhood (evictions, 41 Analysis Neighborhoods), so string equality
  // is a safe join key (verified — see docs/superpowers/specs/2026-07-30-
  // housing-view-design.md). Sorted by eviction count per the task brief;
  // both fields stay citywide (comparison-not-drilldown — no selected-
  // neighborhood clause upstream, see query #9 above).
  const neighborhoodRanking = useMemo((): NeighborhoodRankRow[] => {
    const buyoutMap = new Map<string, { n: number; total: number }>()
    for (const r of buyoutNeighborhoodRows) {
      if (!r.analysis_neighborhood) continue
      buyoutMap.set(r.analysis_neighborhood, { n: parseInt(r.n, 10) || 0, total: parseAmount(r.total) ?? 0 })
    }
    return evictionNeighborhoodRows
      .filter((r) => r.neighborhood)
      .map((r) => {
        const b = buyoutMap.get(r.neighborhood)
        return {
          neighborhood: r.neighborhood,
          evictionCount: parseInt(r.n, 10) || 0,
          buyoutCount: b?.n ?? 0,
          buyoutTotal: b?.total ?? 0,
        }
      })
      .sort((a, b) => b.evictionCount - a.evictionCount)
  }, [evictionNeighborhoodRows, buyoutNeighborhoodRows])

  // Neighborhood camera flight — flies to the selected neighborhood's preset
  // or polygon bounds, resets to the citywide default view when cleared.
  const { boundaries: neighborhoodBoundaries } = useNeighborhoodBoundaries()
  useMapCameraPresets(mapInstance, { selectedNeighborhood, neighborhoodBoundaries })

  // --- Trend baseline + period comparison (Task 8: CardTray YoY/compare) ---
  const trendConfig = useMemo((): TrendConfig => ({
    datasetKey: 'evictionNotices',
    dateField: 'file_date',
    neighborhoodField: 'neighborhood',
  }), [])
  const trend = useTrendBaseline(trendConfig, dateRange, causeClause || undefined)

  const compStart = useMemo(() => resolveComparisonStart(comparisonMode, dateRange), [comparisonMode, dateRange])
  const comparison = useEvictionComparisonData(dateRange, evictionCompareWhere, compStart, evictionRows, evictionsHitLimit)
  const compLabel = comparisonLabel(comparisonMode, dateRange)

  const evictionSparkValues = useMemo(() => trend.currentPeriods.map((p) => p.count), [trend.currentPeriods])

  // --- Computed map data ---
  const evictionPoints = useMemo(() => {
    return evictionRows
      .map((r) => {
        const coords = extractCoordinates(r.client_location)
        if (!coords) return null
        const trueCauses = ALL_CAUSES.filter((c) => r[c])
        return {
          id: r.eviction_id,
          lat: coords.lat,
          lng: coords.lng,
          headline: r.address || 'Address unavailable',
          fileDate: r.file_date,
          causesLabel: trueCauses.length > 0 ? trueCauses.map((c) => CAUSE_LABELS[c]).join(', ') : 'Cause not specified',
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [evictionRows])

  const buyoutPoints = useMemo(() => {
    return buyoutRows
      .map((r) => {
        const coords = extractCoordinates(r.point)
        if (!coords) return null
        const amount = parseAmount(r.buyout_amount)
        return {
          id: r.case_number,
          lat: coords.lat,
          lng: coords.lng,
          headline: r.address || 'Address unavailable',
          agreementDate: r.buyout_agreement_date || null,
          amount,
          disclosed: amount != null,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [buyoutRows])

  // Evictions dots geojson (dots mode, stream enabled). Toggle-off must pass
  // EMPTY_FC (not null) — useMapLayer's data effect ignores null, leaving
  // stale dots on the map.
  const evictionDotsGeojson = useMemo((): GeoJSON.FeatureCollection => {
    if (!enabledStreams.has('evictions') || mapMode !== 'dots') return EMPTY_FC
    if (evictionPoints.length === 0) return EMPTY_FC
    return {
      type: 'FeatureCollection',
      features: evictionPoints.map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        properties: { id: p.id, headline: p.headline, causes: p.causesLabel, fileDate: p.fileDate },
      })),
    }
  }, [evictionPoints, enabledStreams, mapMode])

  // Evictions heatmap geojson (heatmap mode, stream enabled) — same rows,
  // different symbology. Toggle-off/mode-off must pass EMPTY_FC (not null) —
  // useMapLayer's data effect ignores null, leaving stale features on the map.
  const evictionHeatGeojson = useMemo((): GeoJSON.FeatureCollection => {
    if (!enabledStreams.has('evictions') || mapMode !== 'heatmap' || evictionPoints.length === 0) return EMPTY_FC
    return {
      type: 'FeatureCollection',
      features: evictionPoints.map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        properties: { id: p.id, headline: p.headline, causes: p.causesLabel, fileDate: p.fileDate },
      })),
    }
  }, [evictionPoints, enabledStreams, mapMode])

  // Buyout rings geojson (stream enabled). Toggle-off must pass EMPTY_FC (not
  // null) — useMapLayer's data effect ignores null, leaving stale rings on the map.
  const buyoutGeojson = useMemo((): GeoJSON.FeatureCollection => {
    if (!enabledStreams.has('buyouts') || buyoutPoints.length === 0) return EMPTY_FC
    return {
      type: 'FeatureCollection',
      features: buyoutPoints.map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id,
          headline: p.headline,
          amount: p.amount,
          disclosed: p.disclosed,
          radius: buyoutRadius(p.amount),
          agreementDate: p.agreementDate,
        },
      })),
    }
  }, [buyoutPoints, enabledStreams])

  // --- Map layers ---
  const evictionDotLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'housing-eviction-points',
      type: 'circle',
      source: 'housing-eviction-dots-data',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 6],
        'circle-color': '#b85a33',
        'circle-opacity': 0.8,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#1e140d',
        'circle-stroke-opacity': 0.6,
      },
    } as mapboxgl.AnyLayer,
  ], [])

  const evictionHeatmapLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'housing-eviction-heat',
      type: 'heatmap',
      source: 'housing-eviction-heatmap-data',
      maxzoom: 15,
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 0.6, 15, 1],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.1, 'rgba(184,90,51,0.15)',
          0.3, 'rgba(184,90,51,0.4)',
          0.5, 'rgba(212,164,53,0.55)',
          0.7, 'rgba(212,164,53,0.75)',
          0.85, 'rgba(245,236,217,0.8)',
          1, 'rgba(245,236,217,0.95)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 25],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.4, 16, 0.15],
      },
    } as mapboxgl.AnyLayer,
    {
      id: 'housing-eviction-heat-points',
      type: 'circle',
      source: 'housing-eviction-heatmap-data',
      minzoom: 13,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 6],
        'circle-color': '#b85a33',
        'circle-opacity': 0.7,
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(245,236,217,0.15)',
      },
    } as mapboxgl.AnyLayer,
  ], [])

  const buyoutLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'housing-buyout-rings',
      type: 'circle',
      source: 'housing-buyout-data',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, ['*', ['get', 'radius'], 0.6], 14, ['get', 'radius']],
        'circle-color': '#d4a435',
        'circle-opacity': 0.12,
        'circle-stroke-color': '#d4a435',
        'circle-stroke-width': ['case', ['get', 'disclosed'], 2, 1],
        'circle-stroke-opacity': ['case', ['get', 'disclosed'], 0.9, 0.45],
      },
    } as mapboxgl.AnyLayer,
  ], [])

  // Eviction sources bound first so buyout rings draw above eviction dots.
  useMapLayer(mapInstance, 'housing-eviction-dots-data', evictionDotsGeojson, evictionDotLayers)
  useMapLayer(mapInstance, 'housing-eviction-heatmap-data', evictionHeatGeojson, evictionHeatmapLayers)
  useMapLayer(mapInstance, 'housing-buyout-data', buyoutGeojson, buyoutLayers)

  // --- Tooltips ---
  useMapTooltip(mapInstance, 'housing-eviction-points', (props) => {
    const dateStr = props.fileDate ? formatDate(String(props.fileDate), 'long') : null
    return `
      ${dateStr ? `<div style="color:#e2e8f0">${dateStr}</div>` : ''}
      <div class="tooltip-label" style="margin-top:6px">Address</div>
      <div style="color:#e2e8f0">${props.headline || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Cause</div>
      <div style="color:#94a3b8">${props.causes || 'Not specified'}</div>
    `
  })

  useMapTooltip(mapInstance, 'housing-eviction-heat-points', (props) => {
    const dateStr = props.fileDate ? formatDate(String(props.fileDate), 'long') : null
    return `
      ${dateStr ? `<div style="color:#e2e8f0">${dateStr}</div>` : ''}
      <div class="tooltip-label" style="margin-top:6px">Address</div>
      <div style="color:#e2e8f0">${props.headline || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Cause</div>
      <div style="color:#94a3b8">${props.causes || 'Not specified'}</div>
    `
  })

  useMapTooltip(mapInstance, 'housing-buyout-rings', (props) => {
    const dateStr = props.agreementDate ? formatDate(String(props.agreementDate), 'long') : null
    const amountVal = props.amount != null ? Number(props.amount) : null
    const amountStr = amountVal != null && Number.isFinite(amountVal)
      ? `$${Math.round(amountVal).toLocaleString()}`
      : 'Amount undisclosed'
    return `
      ${dateStr ? `<div style="color:#e2e8f0">${dateStr}</div>` : ''}
      <div class="tooltip-label" style="margin-top:6px">Amount</div>
      <div style="color:#d4a435;font-weight:600">${amountStr}</div>
      <div class="tooltip-label" style="margin-top:6px">Address</div>
      <div style="color:#94a3b8">${props.headline || 'Unknown'}</div>
    `
  })

  // --- Click → selection (detail panels arrive in a later task) ---
  useEffect(() => {
    if (!mapInstance) return

    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const id = e.features[0].properties?.id
      if (!id) return
      setSelectedHousingEvent(`evictions:${id}`)
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates
      mapInstance.flyTo({ center: [coords[0], coords[1]], zoom: 16, duration: 800, offset: eventFlyToOffset(mapInstance, 320) })
    }

    const layers = ['housing-eviction-points', 'housing-eviction-heat-points']
    const tryAttach = () => {
      try {
        let attached = 0
        for (const layer of layers) {
          if (mapInstance.getLayer(layer)) {
            mapInstance.on('click', layer, handleClick)
            attached++
          }
        }
        return attached === layers.length
      } catch { /* layers not ready */ }
      return false
    }

    if (!tryAttach()) {
      const interval = setInterval(() => { if (tryAttach()) clearInterval(interval) }, 500)
      return () => { clearInterval(interval); layers.forEach((l) => { try { mapInstance.off('click', l, handleClick) } catch { /* */ } }) }
    }

    return () => { layers.forEach((l) => { try { mapInstance.off('click', l, handleClick) } catch { /* */ } }) }
  }, [mapInstance, setSelectedHousingEvent])

  useEffect(() => {
    if (!mapInstance) return

    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const id = e.features[0].properties?.id
      if (!id) return
      setSelectedHousingEvent(`buyouts:${id}`)
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates
      mapInstance.flyTo({ center: [coords[0], coords[1]], zoom: 16, duration: 800, offset: eventFlyToOffset(mapInstance, 320) })
    }

    const tryAttach = () => {
      try {
        if (mapInstance.getLayer('housing-buyout-rings')) {
          mapInstance.on('click', 'housing-buyout-rings', handleClick)
          return true
        }
      } catch { /* layer not ready */ }
      return false
    }

    if (!tryAttach()) {
      const interval = setInterval(() => { if (tryAttach()) clearInterval(interval) }, 500)
      return () => { clearInterval(interval); try { mapInstance.off('click', 'housing-buyout-rings', handleClick) } catch { /* */ } }
    }

    return () => { try { mapInstance.off('click', 'housing-buyout-rings', handleClick) } catch { /* */ } }
  }, [mapInstance, setSelectedHousingEvent])

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    setMapInstance(map)
  }, [])

  useProgressScope()

  const isLoading = evictionsLoading || buyoutsLoading
  const combinedError = evictionsError || buyoutsError
  const totalDisplayed =
    (enabledStreams.has('evictions') ? evictionPoints.length : 0) +
    (enabledStreams.has('buyouts') ? buyoutPoints.length : 0)
  const anyHitLimit = evictionsHitLimit || buyoutsHitLimit

  // --- Stat cards (Task 8) ---
  // Card values describe the current date+cause+neighborhood scope, NOT map
  // visibility — they still render when a stream is toggled off on the map.
  const cardDefs = useMemo((): CardDef[] => {
    const noFaultPct = noFaultCount != null && evictionScopeTotal
      ? Math.round((noFaultCount / evictionScopeTotal) * 100)
      : null

    return [
      {
        id: 'evictions',
        label: 'Eviction notices',
        shortLabel: 'Notices',
        value: evictionTotal != null ? formatNumber(evictionTotal) : '—',
        color: '#b85a33',
        delay: 0,
        defaultExpanded: true,
        subtitle: comparison.deltas
          ? `${formatDelta(comparison.deltas.total)} ${compLabel}`
          : (comparison.suppressed && comparisonMode !== null
            ? 'Compare needs a narrower date range'
            : 'Notices filed with the Rent Board — not completed evictions.'),
        trend: comparison.deltas
          ? (comparison.deltas.total > 0 ? 'up' : comparison.deltas.total < 0 ? 'down' : 'neutral')
          : undefined,
        yoyDelta: !comparison.deltas && trend.cityWideYoY ? trend.cityWideYoY.pct : null,
        sparkData: evictionSparkValues.length > 0 ? { values: evictionSparkValues } : undefined,
      },
      {
        id: 'no-fault-share',
        label: 'No-fault share',
        shortLabel: 'No-fault',
        value: noFaultPct != null ? `${noFaultPct}%` : '—',
        color: '#b85a33',
        delay: 80,
        defaultExpanded: true,
        subtitle: 'Owner move-in, Ellis Act, demolition and other no-fault grounds',
      },
      {
        id: 'buyouts',
        label: 'Buyout agreements',
        shortLabel: 'Buyouts',
        value: buyoutTotal != null ? formatNumber(buyoutTotal) : '—',
        color: '#d4a435',
        delay: 160,
        defaultExpanded: true,
        subtitle: declarationsInRange != null ? `From ${formatNumber(declarationsInRange)} opened negotiations` : undefined,
      },
      {
        id: 'median-buyout',
        label: 'Median buyout',
        shortLabel: 'Median',
        value: buyoutTotal && medianBuyout != null ? `$${formatNumber(Math.round(medianBuyout))}` : '—',
        color: '#d4a435',
        delay: 240,
        defaultExpanded: !!buyoutTotal,
        subtitle: 'Median of disclosed amounts',
      },
    ]
  }, [
    evictionTotal, noFaultCount, evictionScopeTotal, buyoutTotal, declarationsInRange, medianBuyout,
    comparison.deltas, comparison.suppressed, compLabel, comparisonMode, trend.cityWideYoY, evictionSparkValues,
  ])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-20">
        <div className="flex flex-wrap items-start justify-between gap-3 desk:items-center">
          <div className="flex flex-wrap items-center gap-4 min-w-0">
            <div className="min-w-0">
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                Housing
              </h1>
              <p className="hidden sm:block truncate text-micro font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                SF Rent Board &middot; Eviction Notices &amp; Buyouts
              </p>
            </div>
            {!isLoading && totalDisplayed > 0 && (
              <div className="hidden sm:flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-micro font-mono text-terracotta-500/80 bg-terracotta-500/10 px-2 py-1 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-terracotta-500 pulse-live" />
                  {formatNumber(totalDisplayed)} records
                </span>
                {anyHitLimit && (
                  <span className="text-micro font-mono text-ochre-500/80 bg-ochre-500/10 px-2 py-1 rounded-full">
                    sample capped
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 flex-shrink-0">
            {/* Stream toggle chips */}
            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
              {HOUSING_STREAMS.map((stream) => (
                <StreamChip
                  key={stream.id}
                  label={stream.label}
                  pigment={stream.pigment}
                  textClass={STREAM_TEXT_CLASS[stream.id]}
                  active={enabledStreams.has(stream.id)}
                  count={stream.id === 'evictions' ? evictionTotal : buyoutTotal}
                  onClick={() => toggleStream(stream.id)}
                />
              ))}
            </div>

            {/* Map mode toggle — evictions only */}
            {enabledStreams.has('evictions') && (
              <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
                {(['dots', 'heatmap'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setMapMode(mode)}
                    className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                      mapMode === mode
                        ? 'bg-white dark:bg-white/[0.08] text-ink dark:text-white shadow-sm'
                        : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                  >
                    {mode === 'dots' ? 'Dots' : 'Heatmap'}
                  </button>
                ))}
              </div>
            )}

            <ExportButton targetSelector="#housing-capture" filename="housing" />
          </div>
        </div>
      </header>

      {/* Cross-view ticker — signals from other datasets */}
      <div className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-1 bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl z-10">
        <CivicTicker
          items={civicIndicators.items.filter(i => i.source.view !== '/housing')}
          size="compact"
        />
      </div>

      {/* Content — era strip band above the map, both inside the capture div */}
      <div id="housing-capture" className="flex-1 overflow-hidden flex flex-col">
        {/* Era strip — 1997–present annual bars, brush drives the global date range */}
        <div className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-4 py-1 bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl">
          <EraStrip
            evictionYears={evictionYearCounts}
            buyoutYears={buyoutYearCounts}
            range={dateRange}
            onRangeChange={setDateRange}
            isLoading={evictionYearsLoading || buyoutYearsLoading}
          />
        </div>

        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 relative">
            <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
              {isLoading && <MapScanOverlay label="Scanning housing data" color="#b85a33" />}
              <MapProgressBar color="#b85a33" />

              {combinedError && (
                <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 w-full max-w-md rounded-[14px] backdrop-blur-xl bg-white/60 dark:bg-slate-900/60">
                  <ErrorState
                    message={combinedError}
                    onRetry={() => { refetchEvictions(); refetchBuyouts() }}
                    what="housing records"
                  />
                </div>
              )}

              {!isLoading && !freshness.isLoading && (!freshness.hasDataInRange || (!freshness.hasGeoInRange && !geoGapDismissed)) && (
                <DataFreshnessAlert
                  latestDate={freshness.latestDate}
                  latestGeoDate={freshness.latestGeoDate}
                  mode={freshness.hasDataInRange ? 'geo-gap' : 'no-data'}
                  onDismiss={freshness.hasDataInRange ? () => setGeoGapDismissed(true) : undefined}
                  suggestedRange={freshness.hasDataInRange ? freshness.suggestedGeoRange : freshness.suggestedRange}
                  accentColor="#b85a33"
                />
              )}

              {/* Stat cards — top left */}
              {isLoading && <SkeletonStatCards count={4} />}
              {!isLoading && <CardTray viewId="housing" cards={cardDefs} />}

              {/* Detail panels — top right, click-driven from map + sidebar */}
              <EvictionDetailPanel rows={evictionRows} isLoading={evictionsLoading} />
              <BuyoutDetailPanel rows={buyoutRows} isLoading={buyoutsLoading} />
            </MapView>
          </div>

          {/* Sidebar */}
          <MapSidebar>
            {/* Tab bar */}
            <div className="flex border-b border-slate-200/50 dark:border-white/[0.04] flex-shrink-0">
              {([['causes', 'Causes'], ['neighborhoods', 'Neighborhoods']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSidebarTab(key)}
                  className={`flex-1 py-2.5 text-micro font-mono uppercase tracking-[0.15em] transition-all duration-200 ${
                    sidebarTab === key
                      ? 'text-ink dark:text-white border-b-2 border-terracotta-500'
                      : 'text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              {sidebarTab === 'causes' && (
                <>
                  <EvictionCauseFilter counts={causeCounts} selected={selectedCauses} onChange={setSelectedCauses} />
                  <p className="text-nano text-slate-500 dark:text-slate-400 italic mt-3">
                    Cause counts exceed notices — a notice can cite several grounds.
                  </p>
                </>
              )}

              {sidebarTab === 'neighborhoods' && (
                <>
                  {isLoading && <SkeletonSidebarRows count={8} />}
                  <div className="space-y-0.5 stagger-in">
                    {neighborhoodRanking.slice(0, 30).map((ns) => {
                      const maxCount = neighborhoodRanking[0]?.evictionCount || 1
                      const barWidth = (ns.evictionCount / maxCount) * 100
                      const isActive = selectedNeighborhood === ns.neighborhood
                      return (
                        <div
                          key={ns.neighborhood}
                          onClick={() => setSelectedNeighborhood(selectedNeighborhood === ns.neighborhood ? null : ns.neighborhood)}
                          className={`relative py-2 px-3 rounded-lg cursor-pointer transition-all duration-200 ${
                            isActive
                              ? 'bg-terracotta-500/10 ring-1 ring-terracotta-500/30'
                              : 'hover:bg-white/80 dark:hover:bg-white/[0.04]'
                          }`}
                        >
                          <div
                            className="absolute inset-y-0 left-0 rounded-lg opacity-[0.06] bar-grow"
                            style={{ width: `${barWidth}%`, backgroundColor: '#b85a33' }}
                          />
                          <div className="relative flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] font-medium text-ink dark:text-slate-200 truncate leading-tight">
                                {ns.neighborhood}
                              </p>
                              <p className="text-micro text-slate-400 dark:text-slate-600 font-mono">
                                {ns.evictionCount.toLocaleString()} notices
                              </p>
                            </div>
                            {ns.buyoutCount > 0 && (
                              <p className="text-micro font-mono text-ochre-500 flex-shrink-0 tabular-nums text-right">
                                {ns.buyoutCount} &middot; ${formatNumber(Math.round(ns.buyoutTotal))}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </MapSidebar>
        </div>
      </div>
    </div>
  )
}
