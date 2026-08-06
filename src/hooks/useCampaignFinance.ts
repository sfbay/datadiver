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
import type { CityId } from '@/cities/routing'
import { fppcBuildersFor, type FppcQuerySpec } from '@/views/CampaignFinance/fppcDialect'
import { cityElections, findCycleForRange, findPriorCycle } from '@/utils/electionCycles'

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
  dateRange: { start: string; end: string },
  cityId: CityId = 'sf'
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
    setStats(null)
    setTopRecipients([])
    setTimeline([])
    setFundingSources([])
    setDonorGeo([])
    setYoY({ totalRaisedDelta: null, smallDonorDelta: null })

    const { start, end } = dateRange
    const b = fppcBuildersFor(cityId)
    const run = <T,>(spec: FppcQuerySpec) =>
      fetchDataset<T>(spec.datasetKey, spec.params, { cityId })

    const donorGeoSpec = b.donorGeo(start, end)
    const queries = [
      // 0: Total raised + avg
      run<CampaignStatTotals>(b.totals(start, end)),
      // 1: Unique donors (GROUP BY, count rows client-side)
      run<CampaignUniqueDonorRow>(b.uniqueDonors(start, end)),
      // 2: Small donor count
      run<CampaignCountRow>(b.smallDonorCount(start, end)),
      // 3: Total contribution count
      run<CampaignCountRow>(b.contributionCount(start, end)),
      // 4: Self-funding total
      run<CampaignSelfFundRow>(b.selfFunding(start, end)),
      // 5: Top recipients
      run<CampaignFilerAggRow>(b.topRecipients(start, end)),
      // 6: Contribution timeline
      run<CampaignTimelineRow>(b.timeline(start, end)),
      // 7: Funding sources by entity_code
      run<CampaignSourceAggRow>(b.fundingSources(start, end)),
      // 8: Donor geography
      donorGeoSpec ? run<CampaignDonorGeoRow>(donorGeoSpec) : Promise.resolve([] as CampaignDonorGeoRow[]),
    ] as const

    // Determine prior cycle for YoY before firing queries
    const cycles = cityElections(cityId)
    const currentCycle = findCycleForRange(start, end, cycles)
    const priorCycle = currentCycle ? findPriorCycle(currentCycle, cycles) : null

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
        // Oakland's aliased topRecipients rows carry no filer_type; SF rows are unchanged by the spread.
        setTopRecipients(recipients.map((r) => ({ ...r, filer_type: r.filer_type ?? '' })))
        setTimeline(timelineRows)
        setFundingSources(sourceRows)
        setDonorGeo(geoRows)
        setIsLoading(false)

        // YoY: fire inside .then() so totalRaised and smallDonorPct are in scope
        if (priorCycle) {
          try {
            const [priorTotals, priorSmall, priorCount] = await Promise.all([
              run<CampaignStatTotals>(b.totals(priorCycle.start, priorCycle.end)),
              run<CampaignCountRow>(b.smallDonorCount(priorCycle.start, priorCycle.end)),
              run<CampaignCountRow>(b.contributionCount(priorCycle.start, priorCycle.end)),
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
  }, [dateRange.start, dateRange.end, cityId])

  return { stats, yoy, topRecipients, timeline, fundingSources, donorGeo, isLoading, error }
}
