import { useMemo } from 'react'
import type { BusinessLocationRecord, SectorAggRow, BusinessMonthlyRow } from '@/types/datasets'
import { extractCoordinates } from '@/utils/geo'
import { assignNeighborhoods } from '@/utils/pointInPolygon'
import { formatNumber } from '@/utils/time'
import type { CardDef } from '@/components/ui/CardTray'
import type { FormationDataPoint } from '@/components/charts/NetFormationChart'

type MapMode = 'heatmap' | 'anomaly'

interface UseBusinessActivityDataParams {
  rawData: BusinessLocationRecord[]
  dateRange: { start: string; end: string }
  mapMode: MapMode
  selectedNeighborhood: string | null
  neighborhoodBoundaries: GeoJSON.FeatureCollection | null
  sectorRows: SectorAggRow[]
  monthlyOpeningRows: BusinessMonthlyRow[]
  monthlyClosureRows: BusinessMonthlyRow[]
  priorOpeningRows: BusinessMonthlyRow[]
  priorClosureRows: BusinessMonthlyRow[]
  openingsCount: number | null
  closuresCount: number | null
  activeCount: number | null
  priorOpeningsCount: number | null
  priorClosuresCount: number | null
}

export function useBusinessActivityData(params: UseBusinessActivityDataParams) {
  const {
    rawData,
    dateRange,
    mapMode,
    selectedNeighborhood,
    neighborhoodBoundaries,
    sectorRows,
    monthlyOpeningRows,
    monthlyClosureRows,
    priorOpeningRows,
    priorClosureRows,
    openingsCount,
    closuresCount,
    activeCount,
    priorOpeningsCount,
    priorClosuresCount,
  } = params

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
    if (sectorRows.length === 0) return null
    const top = sectorRows.find((r) => r.naic_code_description)
    return top ? top.naic_code_description : null
  }, [sectorRows])

  // Sector entries for sidebar (enrich server-side counts with client-side openings/closures/net)
  const sectorEntries = useMemo(() => {
    // Build per-sector openings/closures from client-side data
    const sectorStats = new Map<string, { openings: number; closures: number }>()
    for (const d of dataWithNeighborhoods) {
      if (!d.sector || d.sector === 'Uncategorized') continue
      const entry = sectorStats.get(d.sector) || { openings: 0, closures: 0 }
      if (d.status === 'opened') entry.openings++
      if (d.status === 'closed') entry.closures++
      sectorStats.set(d.sector, entry)
    }

    return sectorRows
      .filter((r) => r.naic_code_description)
      .map((r) => {
        const stats = sectorStats.get(r.naic_code_description) || { openings: 0, closures: 0 }
        return {
          sector: r.naic_code_description,
          count: parseInt(r.cnt, 10) || 0,
          openings: stats.openings,
          closures: stats.closures,
          net: stats.openings - stats.closures,
        }
      })
  }, [sectorRows, dataWithNeighborhoods])

  // Sector bars for chart tile
  const sectorBars = useMemo(() => {
    return sectorEntries.slice(0, 8).map((s) => ({
      label: s.sector,
      value: s.count,
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
  ], [netChange, netYoY, openingsCount, openingsYoY, closuresCount, closuresYoY, activeCount, topSector])

  // --- Map GeoJSON ---
  const heatmapGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'heatmap' || filteredData.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: filteredData.map((r) => ({
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
      })),
    }
  }, [filteredData, mapMode])

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

  return {
    parsedData,
    dataWithNeighborhoods,
    filteredData,
    neighborhoodEntries,
    neighborhoodAnomalies,
    netChange,
    netYoY,
    openingsYoY,
    closuresYoY,
    topSector,
    sectorEntries,
    sectorBars,
    monthlyFormation,
    priorFormation,
    cardDefs,
    heatmapGeojson,
    anomalyGeojson,
  }
}
