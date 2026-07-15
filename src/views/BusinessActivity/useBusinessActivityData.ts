import { useMemo } from 'react'
import type { BusinessLocationRecord, SectorAggRow, BusinessMonthlyRow } from '@/types/datasets'
import { naicsSector } from '@/utils/naicsSector'
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
  selectedCorridor: string | null
  neighborhoodBoundaries: GeoJSON.FeatureCollection | null
  sectorRows: SectorAggRow[]
  monthlyOpeningRows: BusinessMonthlyRow[]
  monthlyClosureRows: BusinessMonthlyRow[]
  priorOpeningRows: BusinessMonthlyRow[]
  priorClosureRows: BusinessMonthlyRow[]
  openingsCount: number | null
  closuresCount: number | null
  adminClosuresCount: number | null
  activeCount: number | null
  priorOpeningsCount: number | null
  priorClosuresCount: number | null
  priorAdminClosuresCount: number | null
}

export function useBusinessActivityData(params: UseBusinessActivityDataParams) {
  const {
    rawData,
    dateRange,
    mapMode,
    selectedNeighborhood,
    selectedCorridor,
    neighborhoodBoundaries,
    sectorRows,
    monthlyOpeningRows,
    monthlyClosureRows,
    priorOpeningRows,
    priorClosureRows,
    openingsCount,
    closuresCount,
    adminClosuresCount,
    activeCount,
    priorOpeningsCount,
    priorClosuresCount,
    priorAdminClosuresCount,
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
        const isAdminClosed = status === 'closed'
          && record.administratively_closed?.trim().toLowerCase() === 'yes'

        // DataSF now ships a single self-reported NAICS code per business (the
        // old multi-NAICS list column was dropped), so each business maps to
        // exactly one sector. `sectors` stays a one-element array to keep the
        // downstream per-sector tally loop unchanged.
        const sector = naicsSector(record.self_reported_naics_code)
        const sectors: string[] = [sector]

        return {
          uniqueId: record.uniqueid,
          dbaName: record.dba_name || 'Unknown',
          ownerName: record.ownership_name || '',
          address: record.full_business_address || '',
          sector,
          sectors,
          corridor: record.business_corridor?.trim() || null,
          status,
          isAdminClosed,
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

  // Apply client-side neighborhood + corridor filters. Corridor matching is
  // case-insensitive (Socrata's free-text values are inconsistently cased).
  const filteredData = useMemo(() => {
    let result = dataWithNeighborhoods
    if (selectedNeighborhood) {
      result = result.filter((d) => d.neighborhood === selectedNeighborhood)
    }
    if (selectedCorridor) {
      const target = selectedCorridor.toLowerCase()
      result = result.filter((d) => d.corridor?.toLowerCase() === target)
    }
    return result
  }, [dataWithNeighborhoods, selectedNeighborhood, selectedCorridor])

  // Neighborhood aggregation (client-side)
  const neighborhoodEntries = useMemo(() => {
    const map = new Map<string, { openings: number; closures: number; adminClosures: number; total: number }>()
    for (const d of dataWithNeighborhoods) {
      const entry = map.get(d.neighborhood) || { openings: 0, closures: 0, adminClosures: 0, total: 0 }
      entry.total++
      if (d.status === 'opened') entry.openings++
      if (d.status === 'closed') {
        entry.closures++
        if (d.isAdminClosed) entry.adminClosures++
      }
      map.set(d.neighborhood, entry)
    }
    return Array.from(map.entries())
      .map(([neighborhood, stats]) => ({
        neighborhood,
        openings: stats.openings,
        closures: stats.closures,
        adminClosures: stats.adminClosures,
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

  // Admin-closure derived stats — voluntary count and "vs last year" delta for the
  // forced-closure subset specifically. Useful for journalists asking "is the
  // city forcing more businesses out than usual?"
  const voluntaryClosuresCount = useMemo(() => {
    if (closuresCount === null) return null
    const admin = adminClosuresCount ?? 0
    return Math.max(closuresCount - admin, 0)
  }, [closuresCount, adminClosuresCount])

  const adminClosuresYoY = useMemo(() => {
    if (adminClosuresCount === null || priorAdminClosuresCount === null || priorAdminClosuresCount === 0) return null
    return ((adminClosuresCount - priorAdminClosuresCount) / priorAdminClosuresCount) * 100
  }, [adminClosuresCount, priorAdminClosuresCount])

  const topSector = useMemo(() => {
    const top = sectorRows.find((r) => r.sector && r.sector !== 'Uncategorized')
    return top ? top.sector : null
  }, [sectorRows])

  // Sector entries for sidebar (enrich the server-side per-sector counts with
  // client-side openings/closures/net). Each business now carries exactly one
  // self-reported NAICS code → one sector, so a business contributes +1 to its
  // single sector's opening/closure tally (the old multi-NAICS list column that
  // let one business count in several sectors was dropped by DataSF).
  const sectorEntries = useMemo(() => {
    const sectorStats = new Map<string, { openings: number; closures: number }>()
    for (const d of dataWithNeighborhoods) {
      for (const s of d.sectors) {
        if (!s) continue
        const entry = sectorStats.get(s) || { openings: 0, closures: 0 }
        if (d.status === 'opened') entry.openings++
        if (d.status === 'closed') entry.closures++
        sectorStats.set(s, entry)
      }
    }

    return sectorRows
      .filter((r) => r.sector)
      .map((r) => {
        const stats = sectorStats.get(r.sector) || { openings: 0, closures: 0 }
        return {
          sector: r.sector,
          count: r.count,
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
      color: netChange !== null && netChange >= 0 ? '#7a9954' : '#b85545',
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
      color: '#7a9954',
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
      color: '#b85545',
      delay: 160,
      info: 'closures',
      defaultExpanded: true,
      yoyDelta: closuresYoY,
      // When admin closures > 0, surface the voluntary/forced split in the subtitle.
      // (StatCard renders subtitle in lieu of yoyText, so we fold both signals into
      // one line.) Pill view still shows the YoY arrow via yoyDelta.
      subtitle: adminClosuresCount && adminClosuresCount > 0 && voluntaryClosuresCount !== null
        ? `${formatNumber(voluntaryClosuresCount)} voluntary · ${formatNumber(adminClosuresCount)} forced`
          + (adminClosuresYoY !== null
            ? ` (${adminClosuresYoY > 0 ? '+' : ''}${adminClosuresYoY.toFixed(0)}% vs last yr)`
            : '')
        : undefined,
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
      // Pill rendering shows `${shortLabel} ${value}`, so the previous
      // shortLabel "Sector" produced a chip reading "Sector Professional,
      // Scientific…" — visually identical to a filter selection. "Top"
      // disambiguates: this is the most-active sector in the current
      // window, not a filter that's been applied.
      label: 'Top Sector',
      shortLabel: 'Top',
      value: topSector || '...',
      color: '#64748b',
      delay: 320,
      info: 'top-sector',
      defaultExpanded: false,
    },
  ], [
    netChange, netYoY, openingsCount, openingsYoY,
    closuresCount, closuresYoY, adminClosuresCount, voluntaryClosuresCount, adminClosuresYoY,
    activeCount, topSector,
  ])

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
