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
  dateRange: { start: string; end: string }
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
    const dateWhere = `calculated_date >= '${start}T00:00:00' AND calculated_date <= '${end}T23:59:59'`
    const filerNid = escapeSoQL(entity.filerNid)
    const filerWhere = `filer_nid='${filerNid}'`

    // Build IE match clause — for measures, do a secondary lookup if ballotNumber not provided
    const isMeasure = entity.filerType === 'Primarily Formed Measure'

    async function resolveIeMatchWhere(): Promise<string | null> {
      if (isMeasure) {
        // Use provided ballotNumber, or look it up from IE records
        const bn = entity!.ballotNumber
        if (bn) return `ballot_number='${escapeSoQL(bn)}'`
        // Secondary lookup: find ballot_number from this filer's IE-related records
        const rows = await fetchDataset<{ ballot_number: string }>('campaignFinance', {
          $select: 'ballot_number',
          $where: `${filerWhere} AND ballot_number IS NOT NULL AND ${dateWhere}`,
          $limit: 1,
        })
        if (rows.length > 0 && rows[0].ballot_number) {
          return `ballot_number='${escapeSoQL(rows[0].ballot_number)}'`
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
      fetchDataset<CampaignSourceAggRow>('campaignFinance', {
        $select: 'entity_code, SUM(calculated_amount) as total, COUNT(*) as cnt',
        $where: `form_type='A' AND ${filerWhere} AND ${dateWhere}`,
        $group: 'entity_code',
      }),
      // 1: Top donors
      fetchDataset<CampaignDonorRow>('campaignFinance', {
        $select: 'transaction_last_name, SUM(calculated_amount) as total',
        $where: `form_type='A' AND ${filerWhere} AND ${dateWhere}`,
        $group: 'transaction_last_name',
        $order: 'total DESC',
        $limit: 10,
      }),
      // 2: Entity timeline
      fetchDataset<CampaignTimelineRow>('campaignFinance', {
        $select: 'date_trunc_ym(calculated_date) as period, SUM(calculated_amount) as total',
        $where: `form_type='A' AND ${filerWhere} AND ${dateWhere}`,
        $group: 'period',
        $order: 'period',
      }),
      // 3: Spending categories (grouped by FPPC transaction_code)
      fetchDataset<CampaignSpendRow>('campaignFinance', {
        $select: 'transaction_code, SUM(calculated_amount) as total',
        $where: `form_type='E' AND ${filerWhere} AND ${dateWhere}`,
        $group: 'transaction_code',
        $order: 'total DESC',
        $limit: 50,
      }),
      // 4: Entity donor geography
      fetchDataset<CampaignDonorGeoRow>('campaignFinance', {
        $select: 'transaction_zip, SUM(calculated_amount) as total, COUNT(*) as cnt',
        $where: `form_type='A' AND ${filerWhere} AND ${dateWhere} AND transaction_zip IS NOT NULL`,
        $group: 'transaction_zip',
        $order: 'total DESC',
        $limit: 50,
      }),
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
        if (ieMatchWhere) {
          try {
            const [supportRows, opposeRows] = await Promise.all([
              fetchDataset<CampaignIERow>('campaignFinance', {
                $select: 'filer_name, SUM(calculated_amount) as total',
                $where: `(form_type='F496' OR form_type='F496P3' OR form_type='F465P3') AND support_oppose_code='S' AND ${ieMatchWhere} AND ${dateWhere}`,
                $group: 'filer_name',
                $order: 'total DESC',
                $limit: 10,
              }),
              fetchDataset<CampaignIERow>('campaignFinance', {
                $select: 'filer_name, SUM(calculated_amount) as total',
                $where: `(form_type='F496' OR form_type='F496P3' OR form_type='F465P3') AND support_oppose_code='O' AND ${ieMatchWhere} AND ${dateWhere}`,
                $group: 'filer_name',
                $order: 'total DESC',
                $limit: 10,
              }),
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
  }, [entity?.filerNid, entity?.filerType, entity?.candidateLastName, entity?.ballotNumber, dateRange.start, dateRange.end])

  return {
    sourceBreakdown, topDonors, ieSupport, ieOppose,
    ieSupportTotal, ieOpposeTotal, spendingCategories,
    entityTimeline, entityDonorGeo, isLoading, error,
  }
}
