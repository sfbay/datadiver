import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'
import type {
  CampaignSourceAggRow,
  CampaignDonorRow,
  CampaignIERow,
  CampaignSpendRow,
  CampaignTimelineRow,
  CampaignDonorGeoRow,
} from '@/types/datasets'
import { escapeSoQL } from '@/utils/electionCycles'
import { categorizeSpending, type SpendingCategory } from '@/utils/spendingCategories'
import type { CityId } from '@/cities/routing'
import { fppcBuildersFor, type FppcQuerySpec } from '@/views/CampaignFinance/fppcDialect'

export interface SelectedEntity {
  filerName: string
  filerNid: string
  filerType: string  // 'Candidate or Officeholder' | 'Primarily Formed Measure' | etc.
  total: number
  /** For candidates: extracted last name for IE matching */
  candidateLastName?: string
  /** For measures: ballot letter/number for IE matching */
  ballotNumber?: string
}

export interface UseCampaignDetailResult {
  sourceBreakdown: CampaignSourceAggRow[]
  topDonors: CampaignDonorRow[]
  ieSupport: CampaignIERow[]
  ieOppose: CampaignIERow[]
  ieSupportTotal: number
  ieOpposeTotal: number
  spendingCategories: SpendingCategory[]
  entityTimeline: CampaignTimelineRow[]
  entityDonorGeo: CampaignDonorGeoRow[]
  isLoading: boolean
  error: string | null
}

export function useCampaignDetail(
  entity: SelectedEntity | null,
  dateRange: { start: string; end: string },
  cityId: CityId = 'sf'
): UseCampaignDetailResult {
  const [sourceBreakdown, setSourceBreakdown] = useState<CampaignSourceAggRow[]>([])
  const [topDonors, setTopDonors] = useState<CampaignDonorRow[]>([])
  const [ieSupport, setIeSupport] = useState<CampaignIERow[]>([])
  const [ieOppose, setIeOppose] = useState<CampaignIERow[]>([])
  const [ieSupportTotal, setIeSupportTotal] = useState(0)
  const [ieOpposeTotal, setIeOpposeTotal] = useState(0)
  const [spendingCategories, setSpendingCategories] = useState<SpendingCategory[]>([])
  const [entityTimeline, setEntityTimeline] = useState<CampaignTimelineRow[]>([])
  const [entityDonorGeo, setEntityDonorGeo] = useState<CampaignDonorGeoRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(0)

  useEffect(() => {
    if (!entity) {
      setSourceBreakdown([])
      setTopDonors([])
      setIeSupport([])
      setIeOppose([])
      setIeSupportTotal(0)
      setIeOpposeTotal(0)
      setSpendingCategories([])
      setEntityTimeline([])
      setEntityDonorGeo([])
      setError(null)
      return
    }

    const id = ++abortRef.current
    setIsLoading(true)
    setError(null)

    const { start, end } = dateRange
    const b = fppcBuildersFor(cityId)
    const run = <T,>(spec: FppcQuerySpec) =>
      fetchDataset<T>(spec.datasetKey, spec.params, { cityId })

    // Build IE match clause — for measures, do a secondary lookup if ballotNumber not provided
    const isMeasure = entity.filerType === 'Primarily Formed Measure'

    async function resolveIeMatchWhere(): Promise<string | null> {
      if (b.lateIEScope !== 'entity') return null // Oakland: entity IE withheld (no reliable filer→candidate join)
      if (isMeasure) {
        // Use provided ballotNumber, or look it up from IE records
        const bn = entity!.ballotNumber
        if (bn) return `ballot_number='${escapeSoQL(bn)}'`
        // Secondary lookup: find ballot_number from this filer's IE-related records
        const spec = b.ballotNumberLookup(entity!.filerNid, start, end)
        if (spec) {
          const rows = await run<{ ballot_number: string }>(spec)
          if (rows.length > 0 && rows[0].ballot_number) {
            return `ballot_number='${escapeSoQL(rows[0].ballot_number)}'`
          }
        }
        // Fallback: try parsing from filer name (e.g., "Yes on D" → "D")
        const match = entity!.filerName.match(/\b(?:Yes|No|Support|Oppose)\s+(?:on\s+)?(?:Prop(?:osition)?\s+)?([A-Z])\b/i)
        if (match) return `ballot_number='${match[1].toUpperCase()}'`
        return null
      }
      if (entity!.candidateLastName) {
        return `candidate_last_name='${escapeSoQL(entity!.candidateLastName)}'`
      }
      return null
    }

    const queries: Promise<unknown>[] = [
      // 0: Source breakdown
      run<CampaignSourceAggRow>(b.sourceBreakdown(entity.filerNid, start, end)),
      // 1: Top donors
      run<CampaignDonorRow>(b.topDonors(entity.filerNid, start, end)),
      // 2: Entity timeline
      run<CampaignTimelineRow>(b.entityTimeline(entity.filerNid, start, end)),
      // 3: Spending categories (grouped by FPPC transaction_code)
      run<CampaignSpendRow>(b.spendingCategories(entity.filerNid, start, end)),
      // 4: Entity donor geography
      (() => {
        const geoSpec = b.entityDonorGeo(entity.filerNid, start, end)
        return geoSpec ? run<CampaignDonorGeoRow>(geoSpec) : Promise.resolve([] as CampaignDonorGeoRow[])
      })(),
    ]

    // Fire base queries + resolve IE match in parallel, then fire IE queries
    Promise.all([Promise.all(queries), resolveIeMatchWhere()])
      .then(async ([baseResults, ieMatchWhere]) => {
        if (id !== abortRef.current) return

        const [sources, donors, timeline, spending, geo] = baseResults as [
          CampaignSourceAggRow[], CampaignDonorRow[], CampaignTimelineRow[],
          CampaignSpendRow[], CampaignDonorGeoRow[]
        ]

        setSourceBreakdown(sources)
        setTopDonors(donors)
        setEntityTimeline(timeline)
        setSpendingCategories(categorizeSpending(spending))
        setEntityDonorGeo(geo)

        // Fire IE queries now that we have the match clause
        const ieSpecs = ieMatchWhere ? b.ieQueries(ieMatchWhere, start, end) : null
        if (ieSpecs) {
          try {
            const [supportRows, opposeRows] = await Promise.all([
              run<CampaignIERow>(ieSpecs.support),
              run<CampaignIERow>(ieSpecs.oppose),
            ])
            if (id !== abortRef.current) return
            setIeSupport(supportRows)
            setIeOppose(opposeRows)
            setIeSupportTotal(supportRows.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0))
            setIeOpposeTotal(opposeRows.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0))
          } catch {
            // IE lookup failure is non-critical
          }
        } else {
          setIeSupport([])
          setIeOppose([])
          setIeSupportTotal(0)
          setIeOpposeTotal(0)
        }

        setIsLoading(false)
      })
      .catch((err) => {
        if (id !== abortRef.current) return
        setError(err.message || 'Failed to load entity detail')
        setIsLoading(false)
      })
  }, [entity?.filerNid, entity?.filerType, entity?.candidateLastName, entity?.ballotNumber, dateRange.start, dateRange.end, cityId])

  return {
    sourceBreakdown, topDonors, ieSupport, ieOppose,
    ieSupportTotal, ieOpposeTotal, spendingCategories,
    entityTimeline, entityDonorGeo, isLoading, error,
  }
}
