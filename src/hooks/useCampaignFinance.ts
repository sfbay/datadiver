import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'
import type {
  CampaignFilerAggRow,
  CampaignDonorGeoRow,
  CampaignSourceAggRow,
  CampaignTimelineRow,
  CampaignStatTotals,
  CampaignCountRow,
  CampaignSelfFundRow,
  CampaignUniqueDonorRow,
} from '@/types/datasets'
import { findCycleForRange, findPriorCycle } from '@/utils/electionCycles'

export interface CampaignFinanceStats {
  totalRaised: number
  avgContribution: number
  uniqueDonors: number
  smallDonorPct: number
  selfFundingTotal: number
}

export interface CampaignFinanceYoY {
  totalRaisedDelta: number | null
  smallDonorDelta: number | null
}

export interface UseCampaignFinanceResult {
  stats: CampaignFinanceStats | null
  yoy: CampaignFinanceYoY
  topRecipients: CampaignFilerAggRow[]
  timeline: CampaignTimelineRow[]
  fundingSources: CampaignSourceAggRow[]
  donorGeo: CampaignDonorGeoRow[]
  isLoading: boolean
  error: string | null
}

export function useCampaignFinance(
  dateRange: { start: string; end: string }
): UseCampaignFinanceResult {
  const [stats, setStats] = useState<CampaignFinanceStats | null>(null)
  const [yoy, setYoY] = useState<CampaignFinanceYoY>({ totalRaisedDelta: null, smallDonorDelta: null })
  const [topRecipients, setTopRecipients] = useState<CampaignFilerAggRow[]>([])
  const [timeline, setTimeline] = useState<CampaignTimelineRow[]>([])
  const [fundingSources, setFundingSources] = useState<CampaignSourceAggRow[]>([])
  const [donorGeo, setDonorGeo] = useState<CampaignDonorGeoRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(0)

  useEffect(() => {
    const id = ++abortRef.current
    setIsLoading(true)
    setError(null)

    const { start, end } = dateRange
    const dateWhere = `calculated_date >= '${start}T00:00:00' AND calculated_date <= '${end}T23:59:59'`
    const contribWhere = `form_type='A' AND calculated_amount > 0 AND ${dateWhere}`

    const queries = [
      // 0: Total raised + avg
      fetchDataset<CampaignStatTotals>('campaignFinance', {
        $select: 'SUM(calculated_amount) as total, AVG(calculated_amount) as avg_amt',
        $where: contribWhere,
      }),
      // 1: Unique donors (GROUP BY, count rows client-side)
      fetchDataset<CampaignUniqueDonorRow>('campaignFinance', {
        $select: 'transaction_last_name, COUNT(*) as cnt',
        $where: `form_type='A' AND ${dateWhere} AND transaction_last_name IS NOT NULL`,
        $group: 'transaction_last_name',
        $limit: 50000,
      }),
      // 2: Small donor count
      fetchDataset<CampaignCountRow>('campaignFinance', {
        $select: 'COUNT(*) as cnt',
        $where: `${contribWhere} AND calculated_amount < 100`,
      }),
      // 3: Total contribution count
      fetchDataset<CampaignCountRow>('campaignFinance', {
        $select: 'COUNT(*) as cnt',
        $where: contribWhere,
      }),
      // 4: Self-funding total
      fetchDataset<CampaignSelfFundRow>('campaignFinance', {
        $select: 'SUM(calculated_amount) as total',
        $where: `form_type='A' AND transaction_self=true AND ${dateWhere}`,
      }),
      // 5: Top recipients
      fetchDataset<CampaignFilerAggRow>('campaignFinance', {
        $select: 'filer_nid, filer_name, filer_type, SUM(calculated_amount) as total',
        $where: `form_type='A' AND ${dateWhere}`,
        $group: 'filer_nid, filer_name, filer_type',
        $order: 'total DESC',
        $limit: 50,
      }),
      // 6: Contribution timeline
      fetchDataset<CampaignTimelineRow>('campaignFinance', {
        $select: 'date_trunc_ym(calculated_date) as period, SUM(calculated_amount) as total',
        $where: `form_type='A' AND ${dateWhere}`,
        $group: 'period',
        $order: 'period',
      }),
      // 7: Funding sources by entity_code
      fetchDataset<CampaignSourceAggRow>('campaignFinance', {
        $select: 'entity_code, SUM(calculated_amount) as total',
        $where: `form_type='A' AND ${dateWhere}`,
        $group: 'entity_code',
        $order: 'total DESC',
      }),
      // 8: Donor geography
      fetchDataset<CampaignDonorGeoRow>('campaignFinance', {
        $select: 'transaction_zip, SUM(calculated_amount) as total, COUNT(*) as cnt',
        $where: `form_type='A' AND ${dateWhere} AND transaction_zip IS NOT NULL`,
        $group: 'transaction_zip',
        $order: 'total DESC',
        $limit: 50,
      }),
    ] as const

    // Determine prior cycle for YoY before firing queries
    const currentCycle = findCycleForRange(start, end)
    const priorCycle = currentCycle ? findPriorCycle(currentCycle) : null

    Promise.all(queries)
      .then(async ([totalsRows, uniqueRows, smallRows, countRows, selfRows, recipients, timelineRows, sourceRows, geoRows]) => {
        if (id !== abortRef.current) return

        const totalRaised = parseFloat(totalsRows[0]?.total || '0')
        const avgContribution = parseFloat(totalsRows[0]?.avg_amt || '0')
        const uniqueDonors = uniqueRows.length
        const smallCount = parseInt(smallRows[0]?.cnt || '0', 10)
        const totalCount = parseInt(countRows[0]?.cnt || '0', 10)
        const smallDonorPct = totalCount > 0 ? (smallCount / totalCount) * 100 : 0
        const selfFundingTotal = parseFloat(selfRows[0]?.total || '0')

        setStats({ totalRaised, avgContribution, uniqueDonors, smallDonorPct, selfFundingTotal })
        setTopRecipients(recipients)
        setTimeline(timelineRows)
        setFundingSources(sourceRows)
        setDonorGeo(geoRows)
        setIsLoading(false)

        // YoY: fire inside .then() so totalRaised and smallDonorPct are in scope
        if (priorCycle) {
          const priorWhere = `calculated_date >= '${priorCycle.start}T00:00:00' AND calculated_date <= '${priorCycle.end}T23:59:59'`
          const priorContribWhere = `form_type='A' AND calculated_amount > 0 AND ${priorWhere}`
          try {
            const [priorTotals, priorSmall, priorCount] = await Promise.all([
              fetchDataset<CampaignStatTotals>('campaignFinance', {
                $select: 'SUM(calculated_amount) as total, AVG(calculated_amount) as avg_amt',
                $where: priorContribWhere,
              }),
              fetchDataset<CampaignCountRow>('campaignFinance', {
                $select: 'COUNT(*) as cnt',
                $where: `${priorContribWhere} AND calculated_amount < 100`,
              }),
              fetchDataset<CampaignCountRow>('campaignFinance', {
                $select: 'COUNT(*) as cnt',
                $where: priorContribWhere,
              }),
            ])
            if (id !== abortRef.current) return
            const priorTotal = parseFloat(priorTotals[0]?.total || '0')
            const priorSmallCount = parseInt(priorSmall[0]?.cnt || '0', 10)
            const priorTotalCount = parseInt(priorCount[0]?.cnt || '0', 10)
            const priorSmallPct = priorTotalCount > 0 ? (priorSmallCount / priorTotalCount) * 100 : 0
            setYoY({
              totalRaisedDelta: priorTotal > 0 ? ((totalRaised - priorTotal) / priorTotal) * 100 : null,
              smallDonorDelta: priorSmallPct > 0 ? ((smallDonorPct - priorSmallPct) / priorSmallPct) * 100 : null,
            })
          } catch {
            // YoY failure is non-critical
          }
        } else {
          setYoY({ totalRaisedDelta: null, smallDonorDelta: null })
        }
      })
      .catch((err) => {
        if (id !== abortRef.current) return
        setError(err.message || 'Failed to load campaign finance data')
        setIsLoading(false)
      })
  }, [dateRange.start, dateRange.end])

  return { stats, yoy, topRecipients, timeline, fundingSources, donorGeo, isLoading, error }
}
