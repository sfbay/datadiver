import { useState, useEffect, useMemo } from 'react'
import { fetchDataset } from '@/api/client'
import type {
  FireIncident,
  FireCasualtyAggRow,
  FireCauseAggRow,
  FirePropertyUseAggRow,
  FireDetectorAggRow,
  FireNeighborhoodAggRow,
  BatteryTrendAggRow,
} from '@/types/datasets'

interface FireInsightsResult {
  // Stat card data
  casualties: { injuries: number; fatalities: number; totalLoss: number } | null
  priorYearCasualties: { injuries: number; fatalities: number; totalLoss: number } | null

  // Sidebar breakdowns
  causes: { label: string; count: number }[]
  propertyTypes: { label: string; count: number }[]
  detectionStats: { detectorsPresent: number; effectiveAlert: number; sprinklersPresent: number } | null
  neighborhoodFires: { neighborhood: string; count: number; injuries: number; fatalities: number }[]

  // Map overlays
  severityOverlay: FireIncident[]
  batteryOverlay: FireIncident[]

  // Chart data
  batteryTrend: { year: string; count: number }[]

  isLoading: boolean
}

const EMPTY_RESULT: FireInsightsResult = {
  casualties: null,
  priorYearCasualties: null,
  causes: [],
  propertyTypes: [],
  detectionStats: null,
  neighborhoodFires: [],
  severityOverlay: [],
  batteryOverlay: [],
  batteryTrend: [],
  isLoading: false,
}

export function useFireInsights(
  isActive: boolean,
  dateRange: { start: string; end: string },
): FireInsightsResult {
  const [result, setResult] = useState<FireInsightsResult>(EMPTY_RESULT)

  const dateWhere = useMemo(() =>
    `alarm_dttm >= '${dateRange.start}T00:00:00' AND alarm_dttm <= '${dateRange.end}T23:59:59'`,
    [dateRange.start, dateRange.end]
  )

  // Prior-year date range
  const priorStart = useMemo(() => {
    const d = new Date(dateRange.start)
    d.setFullYear(d.getFullYear() - 1)
    return d.toISOString().split('T')[0]
  }, [dateRange.start])

  const priorEnd = useMemo(() => {
    const d = new Date(dateRange.end)
    d.setFullYear(d.getFullYear() - 1)
    return d.toISOString().split('T')[0]
  }, [dateRange.end])

  const priorDateWhere = useMemo(() =>
    `alarm_dttm >= '${priorStart}T00:00:00' AND alarm_dttm <= '${priorEnd}T23:59:59'`,
    [priorStart, priorEnd]
  )

  useEffect(() => {
    if (!isActive) {
      setResult(EMPTY_RESULT)
      return
    }

    let cancelled = false
    setResult(prev => ({ ...prev, isLoading: true }))

    const queries = Promise.all([
      // 0: Casualty totals
      fetchDataset<FireCasualtyAggRow>('fireIncidents', {
        $select: 'SUM(civilian_injuries) + SUM(fire_injuries) as injuries, SUM(civilian_fatalities) + SUM(fire_fatalities) as fatalities, SUM(estimated_property_loss) + SUM(estimated_contents_loss) as total_loss',
        $where: dateWhere,
        $limit: 1,
      }),
      // 1: Prior-year casualty totals
      fetchDataset<FireCasualtyAggRow>('fireIncidents', {
        $select: 'SUM(civilian_injuries) + SUM(fire_injuries) as injuries, SUM(civilian_fatalities) + SUM(fire_fatalities) as fatalities, SUM(estimated_property_loss) + SUM(estimated_contents_loss) as total_loss',
        $where: priorDateWhere,
        $limit: 1,
      }),
      // 2: Ignition cause breakdown
      fetchDataset<FireCauseAggRow>('fireIncidents', {
        $select: 'ignition_cause, COUNT(*) as cnt',
        $where: `${dateWhere} AND ignition_cause IS NOT NULL`,
        $group: 'ignition_cause',
        $order: 'cnt DESC',
        $limit: 5,
      }),
      // 3: Property use breakdown
      fetchDataset<FirePropertyUseAggRow>('fireIncidents', {
        $select: 'property_use, COUNT(*) as cnt',
        $where: `${dateWhere} AND property_use IS NOT NULL`,
        $group: 'property_use',
        $order: 'cnt DESC',
        $limit: 5,
      }),
      // 4: Detector stats
      fetchDataset<FireDetectorAggRow>('fireIncidents', {
        $select: 'detectors_present, COUNT(*) as cnt',
        $where: `${dateWhere} AND detectors_present IS NOT NULL`,
        $group: 'detectors_present',
      }),
      // 5: Neighborhood fire counts
      fetchDataset<FireNeighborhoodAggRow>('fireIncidents', {
        $select: 'neighborhood_district, COUNT(*) as cnt, SUM(civilian_injuries) + SUM(fire_injuries) as injuries, SUM(civilian_fatalities) + SUM(fire_fatalities) as fatalities',
        $where: dateWhere,
        $group: 'neighborhood_district',
        $order: 'cnt DESC',
      }),
      // 6: Severity overlay (records with casualties)
      fetchDataset<FireIncident>('fireIncidents', {
        $select: 'call_number, alarm_dttm, primary_situation, address, neighborhood_district, civilian_injuries, civilian_fatalities, fire_injuries, fire_fatalities, estimated_property_loss, point',
        $where: `(civilian_injuries > 0 OR civilian_fatalities > 0 OR fire_injuries > 0 OR fire_fatalities > 0) AND ${dateWhere} AND point IS NOT NULL`,
        $limit: 200,
      }),
      // 7: Battery fire overlay
      fetchDataset<FireIncident>('fireIncidents', {
        $select: 'call_number, alarm_dttm, primary_situation, address, neighborhood_district, ignition_factor_primary, area_of_fire_origin, property_use, civilian_injuries, fire_injuries, estimated_property_loss, point',
        $where: `heat_source = '000 Rechargeable Batteries' AND ${dateWhere} AND point IS NOT NULL`,
        $limit: 200,
      }),
      // 8: Sprinkler/auto-extinguishing stats
      fetchDataset<FireDetectorAggRow>('fireIncidents', {
        $select: 'automatic_extinguishing_system_present as detectors_present, COUNT(*) as cnt',
        $where: `${dateWhere} AND automatic_extinguishing_system_present IS NOT NULL`,
        $group: 'automatic_extinguishing_system_present',
      }),
      // 9: Detector effectiveness stats
      fetchDataset<FireDetectorAggRow>('fireIncidents', {
        $select: 'detector_effectiveness as detectors_present, COUNT(*) as cnt',
        $where: `${dateWhere} AND detector_effectiveness IS NOT NULL`,
        $group: 'detector_effectiveness',
      }),
      // 10: Battery trend (yearly, all-time)
      fetchDataset<BatteryTrendAggRow>('fireIncidents', {
        $select: "date_trunc_y(alarm_dttm) as year, COUNT(*) as cnt",
        $where: "heat_source = '000 Rechargeable Batteries'",
        $group: 'year',
        $order: 'year',
      }),
    ])

    queries.then(([
      casualtyRows, priorCasualtyRows, causeRows, propertyRows, detectorRows,
      neighborhoodRows, severityRows, batteryRows, sprinklerRows, effectivenessRows,
      batteryTrendRows,
    ]) => {
      if (cancelled) return

      // Parse casualties
      const c = casualtyRows[0]
      const casualties = c ? {
        injuries: Number(c.injuries) || 0,
        fatalities: Number(c.fatalities) || 0,
        totalLoss: Number(c.total_loss) || 0,
      } : null

      const pc = priorCasualtyRows[0]
      const priorYearCasualties = pc ? {
        injuries: Number(pc.injuries) || 0,
        fatalities: Number(pc.fatalities) || 0,
        totalLoss: Number(pc.total_loss) || 0,
      } : null

      // Parse causes
      const causes = causeRows.map(r => ({
        label: r.ignition_cause || 'Unknown',
        count: Number(r.cnt) || 0,
      }))

      // Parse property types
      const propertyTypes = propertyRows.map(r => ({
        label: r.property_use || 'Unknown',
        count: Number(r.cnt) || 0,
      }))

      // Parse detection stats
      const totalDetectorRecords = detectorRows.reduce((sum, r) => sum + (Number(r.cnt) || 0), 0)
      let detectionStats: FireInsightsResult['detectionStats'] = null
      if (totalDetectorRecords > 0) {
        // Detectors present: values like "1 Present", "2 Not present", "U Undetermined"
        const presentCount = detectorRows
          .filter(r => r.detectors_present?.includes('Present') && !r.detectors_present?.includes('Not'))
          .reduce((sum, r) => sum + (Number(r.cnt) || 0), 0)

        // Detector effectiveness: values like "1 Effective", "2 Not effective"
        const totalEffectivenessRecords = effectivenessRows.reduce((sum, r) => sum + (Number(r.cnt) || 0), 0)
        const effectiveCount = effectivenessRows
          .filter(r => r.detectors_present?.includes('Effective') && !r.detectors_present?.includes('Not'))
          .reduce((sum, r) => sum + (Number(r.cnt) || 0), 0)

        // Sprinklers/auto-extinguishing: values like "1 Present", "N Not present"
        const totalSprinklerRecords = sprinklerRows.reduce((sum, r) => sum + (Number(r.cnt) || 0), 0)
        const sprinklerCount = sprinklerRows
          .filter(r => r.detectors_present?.includes('Present') && !r.detectors_present?.includes('Not'))
          .reduce((sum, r) => sum + (Number(r.cnt) || 0), 0)

        detectionStats = {
          detectorsPresent: Math.round((presentCount / totalDetectorRecords) * 100),
          effectiveAlert: totalEffectivenessRecords > 0 ? Math.round((effectiveCount / totalEffectivenessRecords) * 100) : 0,
          sprinklersPresent: totalSprinklerRecords > 0 ? Math.round((sprinklerCount / totalSprinklerRecords) * 100) : 0,
        }
      }

      // Parse neighborhood fires
      const neighborhoodFires = neighborhoodRows
        .filter(r => r.neighborhood_district)
        .map(r => ({
          neighborhood: r.neighborhood_district,
          count: Number(r.cnt) || 0,
          injuries: Number(r.injuries) || 0,
          fatalities: Number(r.fatalities) || 0,
        }))

      // Parse battery trend
      const batteryTrend = batteryTrendRows.map(r => ({
        year: r.year ? new Date(r.year).getFullYear().toString() : '',
        count: Number(r.cnt) || 0,
      })).filter(r => r.year)

      setResult({
        casualties,
        priorYearCasualties,
        causes,
        propertyTypes,
        detectionStats,
        neighborhoodFires,
        severityOverlay: severityRows,
        batteryOverlay: batteryRows,
        batteryTrend,
        isLoading: false,
      })
    }).catch(() => {
      if (!cancelled) setResult({ ...EMPTY_RESULT, isLoading: false })
    })

    return () => { cancelled = true }
  }, [isActive, dateWhere, priorDateWhere])

  return result
}
