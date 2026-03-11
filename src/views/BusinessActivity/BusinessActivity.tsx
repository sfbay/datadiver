import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import { useDataset } from '@/hooks/useDataset'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useAppStore } from '@/stores/appStore'
import type { BusinessLocationRecord, SectorAggRow, BusinessMonthlyRow } from '@/types/datasets'
import { formatNumber } from '@/utils/time'
import { extractCoordinates } from '@/utils/geo'
import { assignNeighborhoods } from '@/utils/pointInPolygon'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import CardTray, { type CardDef } from '@/components/ui/CardTray'
import ChartTray, { type ChartTileDef } from '@/components/ui/ChartTray'
import SectorFilter from '@/components/filters/SectorFilter'
import NetFormationChart from '@/components/charts/NetFormationChart'
import type { FormationDataPoint } from '@/components/charts/NetFormationChart'
import HorizontalBarChart from '@/components/charts/HorizontalBarChart'
import BusinessDetailPanel from '@/components/ui/BusinessDetailPanel'
import ExportButton from '@/components/export/ExportButton'
import ComparisonToggle from '@/components/filters/ComparisonToggle'
import PeriodBreakdownChart from '@/components/charts/PeriodBreakdownChart'
import { SkeletonStatCards, SkeletonSidebarRows, MapScanOverlay, MapProgressBar } from '@/components/ui/Skeleton'
import DataFreshnessAlert from '@/components/ui/DataFreshnessAlert'
import { useDataFreshness } from '@/hooks/useDataFreshness'
import { useTrendBaseline } from '@/hooks/useTrendBaseline'
import type { TrendConfig } from '@/types/trends'
import { useProgressScope } from '@/hooks/useLoadingProgress'
import InfoTip from '@/components/ui/InfoTip'

type MapMode = 'heatmap' | 'anomaly'
type SidebarTab = 'sectors' | 'neighborhoods'

const SELECT_FIELDS = 'uniqueid,dba_name,ownership_name,full_business_address,city,dba_start_date,dba_end_date,naic_code,naic_code_description,parking_tax,transient_occupancy_tax,location'

const SF_CITY_FILTER = "city = 'San Francisco'"

export default function BusinessActivity() {
  const { dateRange, setDateRange, selectedBusiness, setSelectedBusiness } = useAppStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('sectors')
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapHandleRef = useRef<MapHandle>(null)

  // Widen to 12-month range if current range is < 90 days (business data is sparse at 30d)
  useEffect(() => {
    const start = new Date(dateRange.start)
    const end = new Date(dateRange.end)
    const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    if (days < 90) {
      const twelveMonthsAgo = new Date(end)
      twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)
      setDateRange(twelveMonthsAgo.toISOString().split('T')[0], end.toISOString().split('T')[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Deep-link: detail panel
  useEffect(() => {
    const detailParam = searchParams.get('detail')
    if (detailParam) setSelectedBusiness(detailParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (selectedBusiness) next.set('detail', selectedBusiness)
      else next.delete('detail')
      return next
    }, { replace: true })
  }, [selectedBusiness, setSearchParams])

  const mapMode = (searchParams.get('map_mode') as MapMode) || 'heatmap'
  const selectedSectors = useMemo(() => {
    const param = searchParams.get('sectors')
    if (!param) return new Set<string>()
    return new Set(param.split(',').map(decodeURIComponent))
  }, [searchParams])
  const selectedNeighborhood = searchParams.get('neighborhood') || null

  const setMapMode = useCallback((mode: MapMode) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (mode === 'heatmap') next.delete('map_mode')
      else next.set('map_mode', mode)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setSelectedSectors = useCallback((sectors: Set<string>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (sectors.size === 0) next.delete('sectors')
      else next.set('sectors', Array.from(sectors).map(encodeURIComponent).join(','))
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
  const sectorClause = useMemo(() => {
    if (selectedSectors.size === 0) return ''
    const hasUncat = selectedSectors.has('Uncategorized')
    const named = Array.from(selectedSectors).filter((c) => c !== 'Uncategorized')
    const parts: string[] = []
    if (named.length > 0) {
      const escaped = named.map((c) => `'${c.replace(/'/g, "''")}'`)
      parts.push(`naic_code_description IN (${escaped.join(',')})`)
    }
    if (hasUncat) parts.push('naic_code_description IS NULL')
    return parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`
  }, [selectedSectors])

  const whereClause = useMemo(() => {
    const conditions: string[] = [SF_CITY_FILTER]
    conditions.push(`(dba_start_date >= '${dateRange.start}T00:00:00' AND dba_start_date <= '${dateRange.end}T23:59:59') OR (dba_end_date >= '${dateRange.start}T00:00:00' AND dba_end_date <= '${dateRange.end}T23:59:59')`)
    if (sectorClause) conditions.push(sectorClause)
    return conditions.map((c, i) => i === 0 ? c : `(${c})`).join(' AND ')
  }, [dateRange, sectorClause])

  // Openings clause: businesses that opened in the date range (with optional sector filter)
  const openingsClause = useMemo(() => {
    const base = `${SF_CITY_FILTER} AND dba_start_date >= '${dateRange.start}T00:00:00' AND dba_start_date <= '${dateRange.end}T23:59:59'`
    return sectorClause ? `${base} AND ${sectorClause}` : base
  }, [dateRange, sectorClause])

  const closuresClause = useMemo(() => {
    const base = `${SF_CITY_FILTER} AND dba_end_date >= '${dateRange.start}T00:00:00' AND dba_end_date <= '${dateRange.end}T23:59:59'`
    return sectorClause ? `${base} AND ${sectorClause}` : base
  }, [dateRange, sectorClause])

  // Date-only clauses for sector aggregation (no sector filter, so all sectors visible)
  const openingsDateOnlyClause = useMemo(() => {
    return `${SF_CITY_FILTER} AND dba_start_date >= '${dateRange.start}T00:00:00' AND dba_start_date <= '${dateRange.end}T23:59:59'`
  }, [dateRange])

  const closuresDateOnlyClause = useMemo(() => {
    return `${SF_CITY_FILTER} AND dba_end_date >= '${dateRange.start}T00:00:00' AND dba_end_date <= '${dateRange.end}T23:59:59'`
  }, [dateRange])

  // Data freshness detection
  const freshness = useDataFreshness('businessLocations', 'dba_start_date', dateRange)

  const trendConfig = useMemo((): TrendConfig => ({
    datasetKey: 'businessLocations',
    dateField: 'dba_start_date',
    baseWhere: SF_CITY_FILTER,
  }), [])
  const trend = useTrendBaseline(trendConfig, dateRange, sectorClause || undefined)

  // --- Primary data: split into openings + closures to avoid sort bias ---
  const openingsWhere = useMemo(() => {
    const base = `${SF_CITY_FILTER} AND dba_start_date >= '${dateRange.start}T00:00:00' AND dba_start_date <= '${dateRange.end}T23:59:59'`
    return sectorClause ? `${base} AND ${sectorClause}` : base
  }, [dateRange, sectorClause])

  const closuresWhere = useMemo(() => {
    const base = `${SF_CITY_FILTER} AND dba_end_date >= '${dateRange.start}T00:00:00' AND dba_end_date <= '${dateRange.end}T23:59:59'`
    return sectorClause ? `${base} AND ${sectorClause}` : base
  }, [dateRange, sectorClause])

  const { data: openingsRaw, isLoading: openingsLoading } = useDataset<BusinessLocationRecord>(
    'businessLocations',
    { $where: openingsWhere, $limit: 5000, $select: SELECT_FIELDS, $order: 'dba_start_date DESC' },
    [openingsWhere]
  )
  const { data: closuresRaw, isLoading: closuresLoading } = useDataset<BusinessLocationRecord>(
    'businessLocations',
    { $where: closuresWhere, $limit: 5000, $select: SELECT_FIELDS, $order: 'dba_end_date DESC' },
    [closuresWhere]
  )
  // Merge and deduplicate (a business can appear in both if it opened AND closed in the range)
  const rawData = useMemo(() => {
    const seen = new Set<string>()
    const merged: BusinessLocationRecord[] = []
    for (const r of openingsRaw) {
      seen.add(r.uniqueid)
      merged.push(r)
    }
    for (const r of closuresRaw) {
      if (!seen.has(r.uniqueid)) merged.push(r)
    }
    return merged
  }, [openingsRaw, closuresRaw])
  const isLoading = openingsLoading || closuresLoading
  const error = null as string | null
  const hitLimit = rawData.length >= 10000

  // Server-side counts
  const { data: openingsCountRows } = useDataset<{ count: string }>(
    'businessLocations',
    { $select: 'count(*) as count', $where: openingsClause },
    [openingsClause]
  )
  const openingsCount = openingsCountRows[0] ? parseInt(openingsCountRows[0].count, 10) : null

  const { data: closuresCountRows } = useDataset<{ count: string }>(
    'businessLocations',
    { $select: 'count(*) as count', $where: closuresClause },
    [closuresClause]
  )
  const closuresCount = closuresCountRows[0] ? parseInt(closuresCountRows[0].count, 10) : null

  const { data: activeCountRows } = useDataset<{ count: string }>(
    'businessLocations',
    { $select: 'count(*) as count', $where: `${SF_CITY_FILTER} AND dba_end_date IS NULL` },
    [SF_CITY_FILTER]
  )
  const activeCount = activeCountRows[0] ? parseInt(activeCountRows[0].count, 10) : null

  const { data: totalCountRows } = useDataset<{ count: string }>(
    'businessLocations',
    { $select: 'count(*) as count', $where: whereClause },
    [whereClause]
  )
  const totalCount = totalCountRows[0] ? parseInt(totalCountRows[0].count, 10) : null

  // Sector aggregation: openings by sector
  const { data: sectorOpeningRows } = useDataset<SectorAggRow>(
    'businessLocations',
    {
      $select: 'naic_code_description, count(*) as cnt',
      $group: 'naic_code_description',
      $where: openingsDateOnlyClause,
      $order: 'cnt DESC',
      $limit: 30,
    },
    [openingsDateOnlyClause]
  )

  // Sector aggregation: closures by sector
  const { data: sectorClosureRows } = useDataset<SectorAggRow>(
    'businessLocations',
    {
      $select: 'naic_code_description, count(*) as cnt',
      $group: 'naic_code_description',
      $where: closuresDateOnlyClause,
      $order: 'cnt DESC',
      $limit: 30,
    },
    [closuresDateOnlyClause]
  )

  // Annual totals for spark context on stat cards (2019-2024, 6 years)
  const { data: annualOpeningRows } = useDataset<{ yr: string; cnt: string }>(
    'businessLocations',
    {
      $select: 'date_trunc_y(dba_start_date) as yr, count(*) as cnt',
      $group: 'yr',
      $where: `${SF_CITY_FILTER} AND dba_start_date >= '2019-01-01T00:00:00' AND dba_start_date < '2025-01-01T00:00:00'`,
      $order: 'yr',
      $limit: 10,
    },
    []
  )

  const { data: annualClosureRows } = useDataset<{ yr: string; cnt: string }>(
    'businessLocations',
    {
      $select: 'date_trunc_y(dba_end_date) as yr, count(*) as cnt',
      $group: 'yr',
      $where: `${SF_CITY_FILTER} AND dba_end_date >= '2019-01-01T00:00:00' AND dba_end_date < '2025-01-01T00:00:00'`,
      $order: 'yr',
      $limit: 10,
    },
    []
  )

  // Compute annual spark data
  const annualSparks = useMemo(() => {
    const openings = annualOpeningRows.map((r) => parseInt(r.cnt, 10) || 0)
    const closures = annualClosureRows.map((r) => parseInt(r.cnt, 10) || 0)
    const labels = annualOpeningRows.map((r) => "'" + (r.yr?.slice(2, 4) || ''))
    // Append current period values
    const currentOpen = openingsCount ?? 0
    const currentClose = closuresCount ?? 0
    return {
      openings: { values: [...openings, currentOpen], labels: [...labels, 'now'] },
      closures: { values: [...closures, currentClose], labels: [...labels, 'now'] },
    }
  }, [annualOpeningRows, annualClosureRows, openingsCount, closuresCount])

  // Historical closure baseline: closures by sector by year (2019-2023) for z-score computation
  const { data: historicalClosureRows } = useDataset<{ naic_code_description: string; yr: string; cnt: string }>(
    'businessLocations',
    {
      $select: 'naic_code_description, date_trunc_y(dba_end_date) as yr, count(*) as cnt',
      $group: 'naic_code_description, yr',
      $where: `${SF_CITY_FILTER} AND dba_end_date >= '2019-01-01T00:00:00' AND dba_end_date < '2024-01-01T00:00:00'`,
      $limit: 500,
    },
    []
  )

  // Compute per-sector closure z-scores: current period vs 2019-2023 annual baseline
  const sectorZScores = useMemo(() => {
    if (historicalClosureRows.length === 0) return new Map<string, number>()

    // Build per-sector annual closure counts from baseline period
    const sectorYears = new Map<string, number[]>()
    for (const r of historicalClosureRows) {
      const key = r.naic_code_description || 'Uncategorized'
      if (!sectorYears.has(key)) sectorYears.set(key, [])
      sectorYears.get(key)!.push(parseInt(r.cnt, 10) || 0)
    }

    // Current period closures (from sectorClosureRows), annualized
    const daySpan = Math.max(1, (new Date(dateRange.end).getTime() - new Date(dateRange.start).getTime()) / (1000 * 60 * 60 * 24))
    const annualizeFactor = 365 / daySpan

    const currentClosures = new Map<string, number>()
    for (const r of sectorClosureRows) {
      const key = r.naic_code_description || 'Uncategorized'
      currentClosures.set(key, (parseInt(r.cnt, 10) || 0) * annualizeFactor)
    }

    const result = new Map<string, number>()
    for (const [sector, years] of sectorYears) {
      if (years.length < 3) continue // need enough data for meaningful stats
      // Pad to 5 years if missing (zero-closure years don't appear in GROUP BY results)
      while (years.length < 5) years.push(0)
      const mean = years.reduce((a, b) => a + b, 0) / years.length
      const std = Math.sqrt(years.reduce((sum, v) => sum + (v - mean) ** 2, 0) / years.length)
      if (std === 0) continue
      const current = currentClosures.get(sector) ?? 0
      result.set(sector, (current - mean) / std)
    }
    return result
  }, [historicalClosureRows, sectorClosureRows, dateRange])

  // Monthly openings
  const { data: monthlyOpeningRows } = useDataset<BusinessMonthlyRow>(
    'businessLocations',
    {
      $select: 'date_trunc_ym(dba_start_date) as month, count(*) as cnt',
      $group: 'month',
      $where: openingsClause,
      $order: 'month',
      $limit: 50,
    },
    [openingsClause]
  )

  // Monthly closures
  const { data: monthlyClosureRows } = useDataset<BusinessMonthlyRow>(
    'businessLocations',
    {
      $select: 'date_trunc_ym(dba_end_date) as month, count(*) as cnt',
      $group: 'month',
      $where: closuresClause,
      $order: 'month',
      $limit: 50,
    },
    [closuresClause]
  )

  // Prior-year openings for ghost bars
  const priorOpeningsClause = useMemo(() => {
    const start = new Date(dateRange.start)
    const end = new Date(dateRange.end)
    start.setFullYear(start.getFullYear() - 1)
    end.setFullYear(end.getFullYear() - 1)
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    return `${SF_CITY_FILTER} AND dba_start_date >= '${fmt(start)}T00:00:00' AND dba_start_date <= '${fmt(end)}T23:59:59'`
  }, [dateRange])

  const { data: priorOpeningRows } = useDataset<BusinessMonthlyRow>(
    'businessLocations',
    {
      $select: 'date_trunc_ym(dba_start_date) as month, count(*) as cnt',
      $group: 'month',
      $where: priorOpeningsClause,
      $order: 'month',
      $limit: 50,
    },
    [priorOpeningsClause]
  )

  // Prior-year closures for ghost bars
  const priorClosuresClause = useMemo(() => {
    const start = new Date(dateRange.start)
    const end = new Date(dateRange.end)
    start.setFullYear(start.getFullYear() - 1)
    end.setFullYear(end.getFullYear() - 1)
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    return `${SF_CITY_FILTER} AND dba_end_date >= '${fmt(start)}T00:00:00' AND dba_end_date <= '${fmt(end)}T23:59:59'`
  }, [dateRange])

  const { data: priorClosureRows } = useDataset<BusinessMonthlyRow>(
    'businessLocations',
    {
      $select: 'date_trunc_ym(dba_end_date) as month, count(*) as cnt',
      $group: 'month',
      $where: priorClosuresClause,
      $order: 'month',
      $limit: 50,
    },
    [priorClosuresClause]
  )

  // Prior-year counts for YoY (reuse prior-year clause definitions from above)
  const { data: priorOpeningsCountRows } = useDataset<{ count: string }>(
    'businessLocations',
    { $select: 'count(*) as count', $where: priorOpeningsClause },
    [priorOpeningsClause]
  )
  const priorOpeningsCount = priorOpeningsCountRows[0] ? parseInt(priorOpeningsCountRows[0].count, 10) : null

  const { data: priorClosuresCountRows } = useDataset<{ count: string }>(
    'businessLocations',
    { $select: 'count(*) as count', $where: priorClosuresClause },
    [priorClosuresClause]
  )
  const priorClosuresCount = priorClosuresCountRows[0] ? parseInt(priorClosuresCountRows[0].count, 10) : null

  const { boundaries: neighborhoodBoundaries } = useNeighborhoodBoundaries()

  // --- Computed data ---
  const parsedData = useMemo(() => {
    const rangeStart = new Date(dateRange.start)
    const rangeEnd = new Date(dateRange.end)
    return rawData
      .map((record) => {
        const coords = extractCoordinates(record.location)
        if (!coords) return null
        const startDate = new Date(record.dba_start_date)
        const endDate = record.dba_end_date ? new Date(record.dba_end_date) : null
        const status: 'opened' | 'closed' | 'active' =
          startDate >= rangeStart && startDate <= rangeEnd ? 'opened'
          : endDate && endDate >= rangeStart && endDate <= rangeEnd ? 'closed'
          : 'active'
        return {
          uniqueId: record.uniqueid,
          dbaName: record.dba_name || 'Unknown',
          ownerName: record.ownership_name || '',
          address: record.full_business_address || '',
          sector: record.naic_code_description || 'Uncategorized',
          status,
          startDate: record.dba_start_date,
          endDate: record.dba_end_date,
          lat: coords.lat,
          lng: coords.lng,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [rawData, dateRange])

  // Assign neighborhoods via point-in-polygon
  const dataWithNeighborhoods = useMemo(() => {
    if (!neighborhoodBoundaries || parsedData.length === 0) return parsedData.map((d) => ({ ...d, neighborhood: 'Unknown' }))
    return assignNeighborhoods(parsedData, neighborhoodBoundaries)
  }, [parsedData, neighborhoodBoundaries])

  // Apply client-side neighborhood filter
  const filteredData = useMemo(() => {
    if (!selectedNeighborhood) return dataWithNeighborhoods
    return dataWithNeighborhoods.filter((d) => d.neighborhood === selectedNeighborhood)
  }, [dataWithNeighborhoods, selectedNeighborhood])

  // Neighborhood aggregation (client-side)
  const neighborhoodEntries = useMemo(() => {
    const map = new Map<string, { openings: number; closures: number; total: number }>()
    for (const d of dataWithNeighborhoods) {
      const entry = map.get(d.neighborhood) || { openings: 0, closures: 0, total: 0 }
      entry.total++
      if (d.status === 'opened') entry.openings++
      if (d.status === 'closed') entry.closures++
      map.set(d.neighborhood, entry)
    }
    return Array.from(map.entries())
      .map(([neighborhood, stats]) => ({
        neighborhood,
        openings: stats.openings,
        closures: stats.closures,
        total: stats.total,
        netChange: stats.openings - stats.closures,
      }))
      .filter((r) => r.neighborhood && r.neighborhood !== 'Unknown')
      .sort((a, b) => b.total - a.total)
  }, [dataWithNeighborhoods])

  const neighborhoodAnomalies = useMemo(() => {
    if (neighborhoodEntries.length === 0) return new Map<string, number>()
    const values = neighborhoodEntries.map((n) => n.netChange)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const stdDev = Math.sqrt(values.reduce((sum, c) => sum + (c - mean) ** 2, 0) / values.length)
    if (stdDev === 0) return new Map<string, number>()
    const map = new Map<string, number>()
    for (const n of neighborhoodEntries) {
      map.set(n.neighborhood, (n.netChange - mean) / stdDev)
    }
    return map
  }, [neighborhoodEntries])

  // Stats
  const netChange = useMemo(() => {
    if (openingsCount === null || closuresCount === null) return null
    return openingsCount - closuresCount
  }, [openingsCount, closuresCount])

  const priorNetChange = useMemo(() => {
    if (priorOpeningsCount === null || priorClosuresCount === null) return null
    return priorOpeningsCount - priorClosuresCount
  }, [priorOpeningsCount, priorClosuresCount])

  const netYoY = useMemo(() => {
    if (netChange === null || priorNetChange === null || priorNetChange === 0) return null
    return ((netChange - priorNetChange) / Math.abs(priorNetChange)) * 100
  }, [netChange, priorNetChange])

  const openingsYoY = useMemo(() => {
    if (openingsCount === null || priorOpeningsCount === null || priorOpeningsCount === 0) return null
    return ((openingsCount - priorOpeningsCount) / priorOpeningsCount) * 100
  }, [openingsCount, priorOpeningsCount])

  const closuresYoY = useMemo(() => {
    if (closuresCount === null || priorClosuresCount === null || priorClosuresCount === 0) return null
    return ((closuresCount - priorClosuresCount) / priorClosuresCount) * 100
  }, [closuresCount, priorClosuresCount])

  const topSector = useMemo(() => {
    if (sectorOpeningRows.length === 0) return null
    const top = sectorOpeningRows.find((r) => r.naic_code_description)
    return top ? top.naic_code_description : null
  }, [sectorOpeningRows])

  // Sector entries for sidebar — merge openings + closures per sector
  const sectorEntries = useMemo(() => {
    const map = new Map<string, { openings: number; closures: number }>()
    for (const r of sectorOpeningRows) {
      const key = r.naic_code_description || ''
      const entry = map.get(key) || { openings: 0, closures: 0 }
      entry.openings = parseInt(r.cnt, 10) || 0
      map.set(key, entry)
    }
    for (const r of sectorClosureRows) {
      const key = r.naic_code_description || ''
      const entry = map.get(key) || { openings: 0, closures: 0 }
      entry.closures = parseInt(r.cnt, 10) || 0
      map.set(key, entry)
    }
    return Array.from(map.entries())
      .map(([sector, stats]) => ({
        sector: sector || 'Uncategorized',
        count: stats.openings + stats.closures,
        openings: stats.openings,
        closures: stats.closures,
        net: stats.openings - stats.closures,
      }))
      .sort((a, b) => b.count - a.count)
  }, [sectorOpeningRows, sectorClosureRows])

  // Sector bars for chart tile (categorized sectors only)
  const sectorBars = useMemo(() => {
    return sectorEntries
      .filter((s) => s.sector !== 'Uncategorized')
      .slice(0, 8)
      .map((s) => ({
        label: s.sector,
        value: s.openings,
      }))
  }, [sectorEntries])

  // Monthly formation data for NetFormationChart
  const monthlyFormation = useMemo((): FormationDataPoint[] => {
    const openMap = new Map<string, number>()
    for (const r of monthlyOpeningRows) {
      if (r.month) openMap.set(r.month, parseInt(r.cnt, 10) || 0)
    }
    const closeMap = new Map<string, number>()
    for (const r of monthlyClosureRows) {
      if (r.month) closeMap.set(r.month, parseInt(r.cnt, 10) || 0)
    }
    const allMonths = new Set([...openMap.keys(), ...closeMap.keys()])
    return Array.from(allMonths)
      .sort()
      .map((month) => ({
        month,
        openings: openMap.get(month) || 0,
        closures: closeMap.get(month) || 0,
      }))
  }, [monthlyOpeningRows, monthlyClosureRows])

  // Prior-year formation data for ghost bars
  const priorFormation = useMemo((): FormationDataPoint[] => {
    const openMap = new Map<string, number>()
    for (const r of priorOpeningRows) {
      if (r.month) openMap.set(r.month, parseInt(r.cnt, 10) || 0)
    }
    const closeMap = new Map<string, number>()
    for (const r of priorClosureRows) {
      if (r.month) closeMap.set(r.month, parseInt(r.cnt, 10) || 0)
    }
    const allMonths = new Set([...openMap.keys(), ...closeMap.keys()])
    return Array.from(allMonths)
      .sort()
      .map((month) => ({
        month,
        openings: openMap.get(month) || 0,
        closures: closeMap.get(month) || 0,
      }))
  }, [priorOpeningRows, priorClosureRows])

  // Card definitions
  const cardDefs = useMemo((): CardDef[] => [
    {
      id: 'net-change',
      label: 'Net Change',
      shortLabel: 'Net',
      value: netChange !== null ? (netChange >= 0 ? `+${formatNumber(netChange)}` : `${formatNumber(netChange)}`) : '...',
      color: netChange !== null && netChange >= 0 ? '#10b981' : '#ef4444',
      delay: 0,
      info: 'net-change',
      defaultExpanded: true,
      yoyDelta: netYoY,
    },
    {
      id: 'openings',
      label: 'Openings',
      shortLabel: 'Open',
      value: openingsCount !== null ? formatNumber(openingsCount) : '...',
      color: '#10b981',
      delay: 80,
      info: 'openings',
      defaultExpanded: true,
      yoyDelta: openingsYoY,
      sparkData: annualSparks.openings.values.length > 1 ? annualSparks.openings : undefined,
    },
    {
      id: 'closures',
      label: 'Closures',
      shortLabel: 'Close',
      value: closuresCount !== null ? formatNumber(closuresCount) : '...',
      color: '#ef4444',
      delay: 160,
      info: 'closures',
      defaultExpanded: true,
      yoyDelta: closuresYoY,
      sparkData: annualSparks.closures.values.length > 1 ? annualSparks.closures : undefined,
    },
    {
      id: 'active',
      label: 'Active Businesses',
      shortLabel: 'Active',
      value: activeCount !== null ? formatNumber(activeCount) : '...',
      color: '#64748b',
      delay: 240,
      info: 'active-businesses',
      defaultExpanded: false,
    },
    {
      id: 'top-sector',
      label: 'Top Sector',
      shortLabel: 'Sector',
      value: topSector || '...',
      color: '#64748b',
      delay: 320,
      info: 'top-sector',
      defaultExpanded: false,
    },
  ], [netChange, netYoY, openingsCount, openingsYoY, closuresCount, closuresYoY, activeCount, topSector, annualSparks])

  // Chart tiles
  const chartTiles = useMemo<ChartTileDef[]>(() => {
    const tiles: ChartTileDef[] = []
    if (monthlyFormation.length > 0) {
      tiles.push({
        id: 'net-formation',
        label: 'Net Formation',
        shortLabel: 'Formation',
        color: '#10b981',
        defaultExpanded: true,
        render: () => (
          <NetFormationChart
            data={monthlyFormation}
            priorYear={priorFormation.length > 0 ? priorFormation : undefined}
            width={320}
            height={140}
          />
        ),
      })
    }
    if (sectorBars.length > 0) {
      tiles.push({
        id: 'top-sectors',
        label: 'Top Sectors (coded)',
        shortLabel: 'Sectors',
        color: '#8b5cf6',
        defaultExpanded: true,
        render: () => <HorizontalBarChart data={sectorBars} width={320} height={120} maxBars={6} />,
      })
    }
    return tiles
  }, [monthlyFormation, priorFormation, sectorBars])

  // --- Map GeoJSON: dual heatmap (openings green, closures red) ---
  const buildFeatures = (records: typeof filteredData) =>
    records.map((r) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
      properties: {
        uniqueId: r.uniqueId,
        dbaName: r.dbaName,
        sector: r.sector,
        status: r.status,
        address: r.address,
        neighborhood: r.neighborhood,
        startDate: r.startDate,
        endDate: r.endDate,
      },
    }))

  const openingsGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'heatmap') return null
    const opened = filteredData.filter((r) => r.status === 'opened')
    if (opened.length === 0) return null
    return { type: 'FeatureCollection', features: buildFeatures(opened) }
  }, [filteredData, mapMode])

  const closuresGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'heatmap') return null
    const closed = filteredData.filter((r) => r.status === 'closed')
    if (closed.length === 0) return null
    return { type: 'FeatureCollection', features: buildFeatures(closed) }
  }, [filteredData, mapMode])

  // All points for circle layer (visible at high zoom)
  const allPointsGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'heatmap' || filteredData.length === 0) return null
    return { type: 'FeatureCollection', features: buildFeatures(filteredData) }
  }, [filteredData, mapMode])

  const openingsHeatLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'business-heat-openings',
      type: 'heatmap',
      source: 'business-openings',
      maxzoom: 15,
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 0.6, 15, 1],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.1, 'rgba(16, 185, 129, 0.12)',
          0.25, 'rgba(16, 185, 129, 0.25)',
          0.5, 'rgba(16, 185, 129, 0.45)',
          0.8, 'rgba(5, 150, 105, 0.65)',
          1, 'rgba(4, 120, 87, 0.8)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 25],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.4, 16, 0.15],
      },
    } as mapboxgl.AnyLayer,
  ], [])

  const closuresHeatLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'business-heat-closures',
      type: 'heatmap',
      source: 'business-closures',
      maxzoom: 15,
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 0.6, 15, 1],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.1, 'rgba(239, 68, 68, 0.12)',
          0.25, 'rgba(239, 68, 68, 0.25)',
          0.5, 'rgba(239, 68, 68, 0.45)',
          0.8, 'rgba(220, 38, 38, 0.65)',
          1, 'rgba(185, 28, 28, 0.8)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 25],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.4, 16, 0.15],
      },
    } as mapboxgl.AnyLayer,
  ], [])

  const pointsLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'business-points',
      type: 'circle',
      source: 'business-all-points',
      minzoom: 13,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 16, 10],
        'circle-color': [
          'match', ['get', 'status'],
          'opened', '#10b981',
          'closed', '#ef4444',
          'active', '#64748b',
          '#64748b',
        ],
        'circle-opacity': 0.8,
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.2)',
      },
    } as mapboxgl.AnyLayer,
  ], [])

  // Anomaly choropleth
  const anomalyGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'anomaly' || !neighborhoodBoundaries || neighborhoodAnomalies.size === 0) return null
    return {
      type: 'FeatureCollection',
      features: neighborhoodBoundaries.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          zScore: neighborhoodAnomalies.get(f.properties?.nhood ?? '') ?? 0,
          businessCount: neighborhoodEntries.find((n) => n.neighborhood === f.properties?.nhood)?.total ?? 0,
          openings: neighborhoodEntries.find((n) => n.neighborhood === f.properties?.nhood)?.openings ?? 0,
          closures: neighborhoodEntries.find((n) => n.neighborhood === f.properties?.nhood)?.closures ?? 0,
        },
      })),
    }
  }, [mapMode, neighborhoodBoundaries, neighborhoodAnomalies, neighborhoodEntries])

  const anomalyLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'neighborhood-fill',
      type: 'fill',
      source: 'neighborhood-anomaly',
      paint: {
        'fill-color': [
          'interpolate', ['linear'], ['get', 'zScore'],
          -2, '#3b82f6',
          -1, '#93c5fd',
          0, '#e2e8f0',
          1, '#fbbf24',
          2, '#ef4444',
          3, '#7f1d1d',
        ],
        'fill-opacity': 0.55,
      },
    } as mapboxgl.AnyLayer,
    {
      id: 'neighborhood-outline',
      type: 'line',
      source: 'neighborhood-anomaly',
      paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.4 },
    } as mapboxgl.AnyLayer,
  ], [])

  // Bind layers
  useMapLayer(mapInstance, 'business-openings', openingsGeojson, openingsHeatLayers)
  useMapLayer(mapInstance, 'business-closures', closuresGeojson, closuresHeatLayers)
  useMapLayer(mapInstance, 'business-all-points', allPointsGeojson, pointsLayers)
  useMapLayer(mapInstance, 'neighborhood-anomaly', anomalyGeojson, anomalyLayers)

  // Tooltips
  useMapTooltip(mapInstance, 'business-points', (props) => {
    const startFormatted = props.startDate
      ? new Date(String(props.startDate)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null
    const statusColor = props.status === 'opened' ? '#10b981' : props.status === 'closed' ? '#ef4444' : '#64748b'
    const statusLabel = String(props.status).charAt(0).toUpperCase() + String(props.status).slice(1)
    return `
      <div class="tooltip-value">${props.dbaName || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Status</div>
      <div style="color:${statusColor};font-weight:600">${statusLabel}</div>
      <div class="tooltip-label" style="margin-top:6px">Sector</div>
      <div style="color:#e2e8f0">${props.sector || 'Uncategorized'}</div>
      <div class="tooltip-label" style="margin-top:4px">Address</div>
      <div style="color:#94a3b8">${props.address || 'Unknown'}</div>
      <div style="color:#94a3b8">${props.neighborhood || 'Unknown'}</div>
      ${startFormatted ? `<div class="tooltip-label" style="margin-top:6px">Opened</div><div style="color:#94a3b8">${startFormatted}</div>` : ''}
      ${props.endDate ? `<div class="tooltip-label" style="margin-top:4px">Closed</div><div style="color:#ef4444">${new Date(String(props.endDate)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>` : ''}
    `
  })

  useMapTooltip(mapInstance, 'neighborhood-fill', (props) => {
    const zScore = Number(props.zScore).toFixed(1)
    const sign = Number(props.zScore) >= 0 ? '+' : ''
    return `
      <div class="tooltip-label">Neighborhood</div>
      <div class="tooltip-value">${props.nhood || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Business Anomaly</div>
      <div class="tooltip-value">${sign}${zScore}\u03C3</div>
      <div class="tooltip-label" style="margin-top:6px">Businesses</div>
      <div style="color:#94a3b8">${Number(props.businessCount).toLocaleString()}</div>
      <div class="tooltip-label" style="margin-top:4px">Openings / Closures</div>
      <div style="color:#94a3b8">
        <span style="color:#10b981">${Number(props.openings).toLocaleString()}</span>
        /
        <span style="color:#ef4444">${Number(props.closures).toLocaleString()}</span>
      </div>
    `
  })

  // Click handlers
  useEffect(() => {
    if (!mapInstance || mapMode !== 'anomaly') return

    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const nhood = e.features[0].properties?.nhood
      if (nhood) setSelectedNeighborhood(selectedNeighborhood === nhood ? null : nhood)
    }

    const tryAttach = () => {
      try {
        if (mapInstance.getLayer('neighborhood-fill')) {
          mapInstance.on('click', 'neighborhood-fill', handleClick)
          return true
        }
      } catch { /* */ }
      return false
    }

    if (!tryAttach()) {
      const interval = setInterval(() => { if (tryAttach()) clearInterval(interval) }, 500)
      return () => { clearInterval(interval); try { mapInstance.off('click', 'neighborhood-fill', handleClick) } catch { /* */ } }
    }

    return () => { try { mapInstance.off('click', 'neighborhood-fill', handleClick) } catch { /* */ } }
  }, [mapInstance, mapMode, selectedNeighborhood, setSelectedNeighborhood])

  useEffect(() => {
    if (!mapInstance) return

    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const uniqueId = e.features[0].properties?.uniqueId
      if (!uniqueId) return
      setSelectedBusiness(String(uniqueId))
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates
      mapInstance.flyTo({ center: [coords[0], coords[1]], zoom: 17, duration: 800 })
    }

    const tryAttach = () => {
      try {
        if (mapInstance.getLayer('business-points')) {
          mapInstance.on('click', 'business-points', handleClick)
          return true
        }
      } catch { /* */ }
      return false
    }

    if (!tryAttach()) {
      const interval = setInterval(() => { if (tryAttach()) clearInterval(interval) }, 500)
      return () => { clearInterval(interval); try { mapInstance.off('click', 'business-points', handleClick) } catch { /* */ } }
    }

    return () => { try { mapInstance.off('click', 'business-points', handleClick) } catch { /* */ } }
  }, [mapInstance, setSelectedBusiness])

  const handleMapReady = useCallback((map: mapboxgl.Map) => { setMapInstance(map) }, [])

  const handleNeighborhoodClick = useCallback((neighborhood: string) => {
    setSelectedNeighborhood(selectedNeighborhood === neighborhood ? null : neighborhood)
    const nhoodItems = dataWithNeighborhoods.filter((d) => d.neighborhood === neighborhood)
    if (nhoodItems.length > 0 && mapInstance) {
      const avgLat = nhoodItems.reduce((s, d) => s + d.lat, 0) / nhoodItems.length
      const avgLng = nhoodItems.reduce((s, d) => s + d.lng, 0) / nhoodItems.length
      mapInstance.flyTo({ center: [avgLng, avgLat], zoom: 14, duration: 1200 })
    }
  }, [dataWithNeighborhoods, mapInstance, selectedNeighborhood, setSelectedNeighborhood])

  useProgressScope()

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                Business Activity
              </h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                Registered Businesses &middot; Openings & Closures
              </p>
            </div>
            {!isLoading && filteredData.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-emerald-500/80 bg-emerald-500/10 px-2 py-1 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-emerald-500 pulse-live" />
                  {formatNumber(filteredData.length)} records
                </span>
                {hitLimit && totalCount !== null && (
                  <span className="text-[10px] font-mono text-amber-500/80 bg-amber-500/10 px-2 py-1 rounded-full">
                    of {formatNumber(totalCount)} total
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
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

            <ComparisonToggle />
            <ExportButton targetSelector="#ba-capture" filename="business-activity" />
          </div>
        </div>
      </header>

      {/* Content */}
      <div id="ba-capture" className="flex-1 overflow-hidden flex">
        <div className="flex-1 relative">
          <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
            {isLoading && <MapScanOverlay label="Scanning businesses" color="#10b981" />}
            <MapProgressBar color="#10b981" />

            {error && (
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="glass-card rounded-xl p-6 max-w-sm">
                  <p className="text-sm font-medium text-signal-red mb-1">Data Error</p>
                  <p className="text-xs text-slate-400">{error}</p>
                </div>
              </div>
            )}

            {!isLoading && !freshness.isLoading && !freshness.hasDataInRange && (
              <DataFreshnessAlert
                latestDate={freshness.latestDate}
                suggestedRange={freshness.suggestedRange}
                accentColor="#10b981"
              />
            )}

            {/* Stat cards */}
            {isLoading && <SkeletonStatCards count={4} />}
            {!isLoading && filteredData.length > 0 && (
              <CardTray viewId="businessActivity" cards={cardDefs} />
            )}

            {/* Charts */}
            {!isLoading && filteredData.length > 0 && chartTiles.length > 0 && (
              <ChartTray viewId="businessActivity" tiles={chartTiles} />
            )}

            {/* Anomaly legend */}
            {mapMode === 'anomaly' && neighborhoodAnomalies.size > 0 && (
              <div className="absolute bottom-6 right-5 z-10 glass-card rounded-xl p-3">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                  Business Anomaly<InfoTip term="anomaly-map" size={10} />
                </p>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono text-blue-400">-2{'\u03C3'}</span>
                  <div className="flex h-2.5 rounded-full overflow-hidden" style={{ width: 100 }}>
                    {['#3b82f6', '#93c5fd', '#e2e8f0', '#fbbf24', '#ef4444', '#7f1d1d'].map((c, i) => (
                      <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <span className="text-[9px] font-mono text-red-400">+3{'\u03C3'}</span>
                </div>
                <p className="text-[9px] text-slate-500 mt-1">below avg {'\u2192'} above avg</p>
              </div>
            )}

            <BusinessDetailPanel />
          </MapView>
        </div>

        {/* Sidebar */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] overflow-y-auto bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl flex flex-col">
          <div className="flex border-b border-slate-200/50 dark:border-white/[0.04] flex-shrink-0">
            {([['sectors', 'Sectors'], ['neighborhoods', 'Neighborhoods']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSidebarTab(key)}
                className={`flex-1 py-2.5 text-[10px] font-mono uppercase tracking-[0.15em] transition-all duration-200 ${
                  sidebarTab === key
                    ? 'text-ink dark:text-white border-b-2 border-emerald-500'
                    : 'text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            {sidebarTab === 'sectors' && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                    Industry Sectors
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                </div>
                {isLoading && <SkeletonSidebarRows count={8} />}
                {!isLoading && (
                  <SectorFilter
                    categories={sectorEntries}
                    selected={selectedSectors}
                    onChange={setSelectedSectors}
                    zScores={sectorZScores}
                  />
                )}
              </>
            )}

            {sidebarTab === 'neighborhoods' && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                    By Neighborhood
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                </div>

                {selectedNeighborhood && (
                  <button
                    onClick={() => setSelectedNeighborhood(null)}
                    className="mb-3 text-[10px] font-mono text-emerald-500 hover:text-emerald-400 transition-colors"
                  >
                    {'\u2190'} Clear filter: {selectedNeighborhood}
                  </button>
                )}

                {!trend.isLoading && trend.currentPeriods.length > 0 && (
                  <div className="mb-4">
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 mb-2">
                      Volume Trend
                    </p>
                    <PeriodBreakdownChart
                      current={trend.currentPeriods}
                      priorYear={trend.priorYearPeriods}
                      granularity={trend.granularity}
                      accentColor="#10b981"
                      width={264}
                      height={130}
                    />
                  </div>
                )}

                {isLoading && <SkeletonSidebarRows count={8} />}
                <div className="space-y-0.5 stagger-in">
                  {neighborhoodEntries.slice(0, 30).map((ns) => {
                    const maxCount = neighborhoodEntries[0]?.total || 1
                    const barWidth = (ns.total / maxCount) * 100
                    const isActive = selectedNeighborhood === ns.neighborhood
                    const zScore = neighborhoodAnomalies.get(ns.neighborhood)
                    const nhTrend = trend.neighborhoodMap.get(ns.neighborhood)
                    return (
                      <div
                        key={ns.neighborhood}
                        onClick={() => handleNeighborhoodClick(ns.neighborhood)}
                        className={`relative py-2 px-3 rounded-lg cursor-pointer transition-all duration-200 ${
                          isActive
                            ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30'
                            : 'hover:bg-white/80 dark:hover:bg-white/[0.04]'
                        }`}
                      >
                        <div
                          className="absolute inset-y-0 left-0 rounded-lg opacity-[0.06] bar-grow"
                          style={{ width: `${barWidth}%`, backgroundColor: '#10b981' }}
                        />
                        <div className="relative flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-ink dark:text-slate-200 truncate leading-tight">
                              {ns.neighborhood}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">
                              {nhTrend?.priorYearCount ? (
                                <span className={nhTrend.yoyPct > 0 ? 'text-emerald-400' : nhTrend.yoyPct < 0 ? 'text-red-400' : ''}>
                                  {nhTrend.yoyPct >= 0 ? '+' : ''}{nhTrend.yoyPct.toFixed(0)}%{' · '}
                                </span>
                              ) : null}
                              {ns.total.toLocaleString()} businesses
                              {ns.openings > 0 && <span className="text-emerald-400"> · {ns.openings} opened</span>}
                              {ns.closures > 0 && <span className="text-red-400"> · {ns.closures} closed</span>}
                              {' · net '}
                              <span className={ns.netChange >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                {ns.netChange >= 0 ? '+' : ''}{ns.netChange}
                              </span>
                              {zScore !== undefined && (
                                <span className={zScore > 1 ? 'text-red-400' : zScore < -1 ? 'text-blue-400' : ''}>
                                  {' · '}{zScore >= 0 ? '+' : ''}{zScore.toFixed(1)}{'\u03C3'}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
