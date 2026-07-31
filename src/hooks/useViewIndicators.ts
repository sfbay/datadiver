/**
 * View-level indicator engine — transforms EXISTING hook output
 * (useTrendBaseline, hourly patterns, comparison data) into TickerItems.
 *
 * NO new Socrata queries. Derives from data already loaded by each view.
 * Filter-aware: recomputes when date range, neighborhood, or category changes,
 * because the source hooks already react to those.
 */

import { useMemo } from 'react'
import type { TickerItem, TickerCategory, TickerSeverity } from '@/types/ticker'
import type { TrendBaselineResult, NeighborhoodTrendStats } from '@/types/trends'

// ── Input types — what each view can pass in ────────────────────

export interface ViewIndicatorData {
  /** From useTrendBaseline */
  trend?: TrendBaselineResult
  /** Peak hour from hourly pattern hook (0-23) */
  peakHour?: number
  /** Quietest hour from hourly pattern hook (0-23) */
  quietestHour?: number
  /** Comparison stats (avg, median, total, deltas) */
  comparison?: {
    currentStats?: { avg: number; median: number; p90: number; total: number } | null
    deltas?: { avg: number; median: number; total: number } | null
  }
  /** View-specific extra data */
  extra?: Record<string, unknown>
}

type ViewId =
  | 'emergency-response'
  | 'parking-revenue'
  | 'dispatch-911'
  | '311-cases'
  | 'crime-incidents'
  | 'parking-citations'
  | 'traffic-safety'
  | 'business-activity'
  | 'campaign-finance'
  | 'city-budget'
  | 'advertising'
  | 'demographics'

// ── Public hook ─────────────────────────────────────────────────

export function useViewIndicators(
  viewId: ViewId,
  data: ViewIndicatorData
): TickerItem[] {
  return useMemo(() => {
    const transformer = VIEW_TRANSFORMERS[viewId]
    if (!transformer) return []

    const items = transformer(data)
    // Filter out nulls and sort by priority desc
    return items
      .filter((item): item is TickerItem => item !== null)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 6)
  }, [viewId, data])
}

// ── Helpers ─────────────────────────────────────────────────────

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`
}

function formatPct(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function deltaSeverity(delta: number, higherIsBad: boolean): TickerSeverity {
  if (Math.abs(delta) < 5) return 'neutral'
  const isUp = delta > 0
  if (higherIsBad) return isUp ? 'negative' : 'positive'
  return isUp ? 'positive' : 'negative'
}

function makeItem(
  id: string,
  headline: string,
  category: TickerCategory,
  severity: TickerSeverity,
  view: string,
  priority: number,
  opts?: Partial<Pick<TickerItem, 'delta' | 'value' | 'detail' | 'sparkData'>>
): TickerItem {
  return {
    id,
    headline,
    category,
    severity,
    source: { view: `/${view}`, label: view.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) },
    freshness: 'daily',
    computedAt: new Date(),
    priority,
    ...opts,
  }
}

function topAnomalyNeighborhood(
  neighborhoods: NeighborhoodTrendStats[],
  minCount: number = 20
): NeighborhoodTrendStats | null {
  let top: NeighborhoodTrendStats | null = null
  for (const nh of neighborhoods) {
    if (nh.currentCount < minCount) continue
    if (!top || Math.abs(nh.zScore) > Math.abs(top.zScore)) {
      top = nh
    }
  }
  return top && Math.abs(top.zScore) >= 1.5 ? top : null
}

// ── Per-view transformer registry ───────────────────────────────

type ViewTransformer = (data: ViewIndicatorData) => (TickerItem | null)[]

const VIEW_TRANSFORMERS: Record<ViewId, ViewTransformer> = {
  'emergency-response': (data) => {
    const items: (TickerItem | null)[] = []
    const { trend, peakHour, comparison } = data

    // YoY trend
    if (trend?.cityWideYoY) {
      const { pct, current } = trend.cityWideYoY
      items.push(makeItem(
        'view-er-yoy', `Dispatch volume ${formatPct(pct)} vs last year · ${formatCount(current)} calls`,
        'trend', deltaSeverity(pct, true), 'emergency-response', 70,
        { delta: pct, value: formatCount(current) }
      ))
    }

    // Peak hour
    if (peakHour !== undefined) {
      items.push(makeItem(
        'view-er-peak', `Peak hour: ${formatHour(peakHour)}`,
        'trend', 'neutral', 'emergency-response', 50
      ))
    }

    // Top anomaly neighborhood
    if (trend?.neighborhoods) {
      const anomaly = topAnomalyNeighborhood(trend.neighborhoods)
      if (anomaly) {
        items.push(makeItem(
          'view-er-anomaly', `${anomaly.neighborhood}: ${anomaly.zScore.toFixed(1)}σ above baseline`,
          'anomaly', 'alert', 'emergency-response', 90,
          { delta: anomaly.yoyPct, value: formatCount(anomaly.currentCount) }
        ))
      }
    }

    // Response time comparison
    if (comparison?.currentStats && comparison?.deltas) {
      const avgMin = comparison.currentStats.avg.toFixed(1)
      items.push(makeItem(
        'view-er-response', `Avg response: ${avgMin} min (${formatPct(comparison.deltas.avg)})`,
        'trend', deltaSeverity(comparison.deltas.avg, true), 'emergency-response', 75,
        { delta: comparison.deltas.avg, value: `${avgMin} min` }
      ))
    }

    return items
  },

  '311-cases': (data) => {
    const items: (TickerItem | null)[] = []
    const { trend, peakHour } = data

    if (trend?.cityWideYoY) {
      const { pct, current } = trend.cityWideYoY
      items.push(makeItem(
        'view-311-yoy', `311 volume ${formatPct(pct)} vs last year · ${formatCount(current)} cases`,
        'trend', deltaSeverity(pct, true), '311-cases', 70,
        { delta: pct, value: formatCount(current) }
      ))
    }

    if (trend?.neighborhoods) {
      const anomaly = topAnomalyNeighborhood(trend.neighborhoods)
      if (anomaly) {
        items.push(makeItem(
          'view-311-anomaly', `${anomaly.neighborhood}: ${anomaly.zScore.toFixed(1)}σ anomaly · ${formatCount(anomaly.currentCount)} cases`,
          'anomaly', 'alert', '311-cases', 90,
          { delta: anomaly.yoyPct }
        ))
      }
    }

    if (peakHour !== undefined) {
      items.push(makeItem(
        'view-311-peak', `Peak filing hour: ${formatHour(peakHour)}`,
        'trend', 'neutral', '311-cases', 50
      ))
    }

    return items
  },

  'crime-incidents': (data) => {
    const items: (TickerItem | null)[] = []
    const { trend, peakHour } = data

    if (trend?.cityWideYoY) {
      const { pct, current } = trend.cityWideYoY
      items.push(makeItem(
        'view-crime-yoy', `Incidents ${formatPct(pct)} vs last year · ${formatCount(current)} reports`,
        'trend', deltaSeverity(pct, true), 'crime-incidents', 70,
        { delta: pct, value: formatCount(current) }
      ))
    }

    if (trend?.neighborhoods) {
      const anomaly = topAnomalyNeighborhood(trend.neighborhoods)
      if (anomaly) {
        items.push(makeItem(
          'view-crime-anomaly', `${anomaly.neighborhood}: ${anomaly.zScore.toFixed(1)}σ above baseline`,
          'anomaly', 'alert', 'crime-incidents', 90,
          { delta: anomaly.yoyPct }
        ))
      }
    }

    if (peakHour !== undefined) {
      items.push(makeItem(
        'view-crime-peak', `Peak hour: ${formatHour(peakHour)}`,
        'trend', 'neutral', 'crime-incidents', 50
      ))
    }

    return items
  },

  'traffic-safety': (data) => {
    const items: (TickerItem | null)[] = []
    const { trend, extra } = data

    if (trend?.cityWideYoY) {
      const { pct, current } = trend.cityWideYoY
      items.push(makeItem(
        'view-traffic-yoy', `Crashes ${formatPct(pct)} vs last year · ${formatCount(current)} total`,
        'trend', deltaSeverity(pct, true), 'traffic-safety', 70,
        { delta: pct, value: formatCount(current) }
      ))
    }

    // Fatality count from extra data
    const fatalities = extra?.fatalities as number | undefined
    if (fatalities !== undefined && fatalities > 0) {
      items.push(makeItem(
        'view-traffic-fatal', `${fatalities} fatalities in period`,
        'anomaly', 'alert', 'traffic-safety', 95,
        { value: String(fatalities) }
      ))
    }

    // DUI delta from extra data
    const duiDelta = extra?.duiDelta as number | undefined
    if (duiDelta !== undefined) {
      items.push(makeItem(
        'view-traffic-dui', `DUI-related crashes ${formatPct(duiDelta)}`,
        'trend', deltaSeverity(duiDelta, true), 'traffic-safety', 75,
        { delta: duiDelta }
      ))
    }

    if (trend?.neighborhoods) {
      const anomaly = topAnomalyNeighborhood(trend.neighborhoods, 5)
      if (anomaly) {
        items.push(makeItem(
          'view-traffic-anomaly', `${anomaly.neighborhood}: ${anomaly.zScore.toFixed(1)}σ crash anomaly`,
          'anomaly', 'alert', 'traffic-safety', 90,
          { delta: anomaly.yoyPct }
        ))
      }
    }

    return items
  },

  'business-activity': (data) => {
    const items: (TickerItem | null)[] = []
    const { extra } = data

    const net = extra?.netFormation as number | undefined
    const openings = extra?.openings as number | undefined
    const closures = extra?.closures as number | undefined

    if (net !== undefined && openings !== undefined && closures !== undefined) {
      const sign = net >= 0 ? '+' : ''
      items.push(makeItem(
        'view-biz-net', `Net formation: ${sign}${net} · ${formatCount(openings)} opened, ${formatCount(closures)} closed`,
        'trend', net > 0 ? 'positive' : net < 0 ? 'negative' : 'neutral', 'business-activity', 70,
        { value: `${sign}${net}` }
      ))
    }

    const topSector = extra?.topSector as string | undefined
    if (topSector) {
      items.push(makeItem(
        'view-biz-sector', `Most active sector: ${topSector}`,
        'trend', 'neutral', 'business-activity', 55
      ))
    }

    if (data.trend?.neighborhoods) {
      const anomaly = topAnomalyNeighborhood(data.trend.neighborhoods, 10)
      if (anomaly) {
        items.push(makeItem(
          'view-biz-anomaly', `${anomaly.neighborhood}: highest churn (${anomaly.zScore.toFixed(1)}σ)`,
          'anomaly', 'alert', 'business-activity', 85,
          { delta: anomaly.yoyPct }
        ))
      }
    }

    return items
  },

  'parking-revenue': (data) => {
    const items: (TickerItem | null)[] = []
    const { trend, extra } = data

    if (trend?.cityWideYoY) {
      const { pct } = trend.cityWideYoY
      items.push(makeItem(
        'view-pr-yoy', `Revenue ${formatPct(pct)} vs last year`,
        'trend', deltaSeverity(pct, false), 'parking-revenue', 70,
        { delta: pct }
      ))
    }

    const avgPerMeter = extra?.avgPerMeter as number | undefined
    if (avgPerMeter !== undefined) {
      items.push(makeItem(
        'view-pr-avg', `Avg per meter: $${avgPerMeter.toFixed(2)}`,
        'trend', 'neutral', 'parking-revenue', 55,
        { value: `$${avgPerMeter.toFixed(2)}` }
      ))
    }

    if (trend?.neighborhoods) {
      const anomaly = topAnomalyNeighborhood(trend.neighborhoods, 10)
      if (anomaly) {
        items.push(makeItem(
          'view-pr-anomaly', `${anomaly.neighborhood}: revenue ${anomaly.zScore.toFixed(1)}σ from baseline`,
          'anomaly', 'alert', 'parking-revenue', 85
        ))
      }
    }

    return items
  },

  'parking-citations': (data) => {
    const items: (TickerItem | null)[] = []
    const { trend, extra } = data

    if (trend?.cityWideYoY) {
      const { pct, current } = trend.cityWideYoY
      items.push(makeItem(
        'view-cit-yoy', `Citations ${formatPct(pct)} vs last year · ${formatCount(current)} issued`,
        'trend', deltaSeverity(pct, true), 'parking-citations', 70,
        { delta: pct, value: formatCount(current) }
      ))
    }

    const oosPct = extra?.outOfStatePct as number | undefined
    if (oosPct !== undefined) {
      items.push(makeItem(
        'view-cit-oos', `Out-of-state vehicles: ${oosPct.toFixed(1)}%`,
        'trend', 'neutral', 'parking-citations', 55,
        { value: `${oosPct.toFixed(1)}%` }
      ))
    }

    const topViolation = extra?.topViolation as string | undefined
    if (topViolation) {
      items.push(makeItem(
        'view-cit-top', `Top violation: ${topViolation}`,
        'trend', 'neutral', 'parking-citations', 50
      ))
    }

    return items
  },

  'dispatch-911': (data) => {
    const items: (TickerItem | null)[] = []
    const { trend, peakHour, extra } = data

    if (trend?.cityWideYoY) {
      const { pct, current } = trend.cityWideYoY
      items.push(makeItem(
        'view-911-yoy', `911 calls ${formatPct(pct)} vs last year · ${formatCount(current)} dispatches`,
        'trend', deltaSeverity(pct, true), 'dispatch-911', 70,
        { delta: pct, value: formatCount(current) }
      ))
    }

    if (peakHour !== undefined) {
      items.push(makeItem(
        'view-911-peak', `Peak dispatch hour: ${formatHour(peakHour)}`,
        'trend', 'neutral', 'dispatch-911', 50
      ))
    }

    const sensitivePct = extra?.sensitivePct as number | undefined
    if (sensitivePct !== undefined) {
      items.push(makeItem(
        'view-911-sensitive', `Sensitive calls: ${sensitivePct.toFixed(1)}% of total`,
        'trend', 'neutral', 'dispatch-911', 55,
        { value: `${sensitivePct.toFixed(1)}%` }
      ))
    }

    return items
  },

  'campaign-finance': (data) => {
    const items: (TickerItem | null)[] = []
    const { extra } = data

    const totalRaised = extra?.totalRaised as number | undefined
    if (totalRaised !== undefined) {
      const fmt = totalRaised >= 1_000_000 ? `$${(totalRaised / 1_000_000).toFixed(1)}M` : `$${(totalRaised / 1_000).toFixed(0)}K`
      items.push(makeItem(
        'view-cf-total', `Cycle total: ${fmt} raised`,
        'milestone', 'neutral', 'campaign-finance', 60,
        { value: fmt }
      ))
    }

    const topRecipient = extra?.topRecipient as string | undefined
    if (topRecipient) {
      items.push(makeItem(
        'view-cf-top', `Top recipient: ${topRecipient}`,
        'trend', 'neutral', 'campaign-finance', 55
      ))
    }

    const smallDonorPct = extra?.smallDonorPct as number | undefined
    if (smallDonorPct !== undefined) {
      items.push(makeItem(
        'view-cf-small', `Small donors: ${smallDonorPct.toFixed(1)}% of contributions`,
        'trend', 'neutral', 'campaign-finance', 50,
        { value: `${smallDonorPct.toFixed(1)}%` }
      ))
    }

    return items
  },

  'city-budget': (data) => {
    const items: (TickerItem | null)[] = []
    const { extra } = data

    const topDept = extra?.topDepartment as string | undefined
    const topDeptAmt = extra?.topDepartmentAmt as number | undefined
    if (topDept && topDeptAmt !== undefined) {
      const fmt = topDeptAmt >= 1_000_000 ? `$${(topDeptAmt / 1_000_000).toFixed(1)}M` : `$${(topDeptAmt / 1_000).toFixed(0)}K`
      items.push(makeItem(
        'view-budget-top', `Top dept: ${topDept} · ${fmt}`,
        'trend', 'neutral', 'city-budget', 60,
        { value: fmt }
      ))
    }

    const spendingDelta = extra?.spendingDelta as number | undefined
    if (spendingDelta !== undefined) {
      items.push(makeItem(
        'view-budget-delta', `YoY spending: ${formatPct(spendingDelta)}`,
        'trend', deltaSeverity(spendingDelta, true), 'city-budget', 65,
        { delta: spendingDelta }
      ))
    }

    return items
  },

  'advertising': (data) => {
    const items: (TickerItem | null)[] = []
    const { extra } = data

    const compliancePct = extra?.compliancePct as number | undefined
    if (compliancePct !== undefined) {
      const severity: TickerSeverity = compliancePct >= 50 ? 'positive' : compliancePct >= 30 ? 'negative' : 'alert'
      items.push(makeItem(
        'view-ad-compliance', `Res. 240210: ${compliancePct.toFixed(1)}% ethnic media spend (target 50%)`,
        'compliance', severity, 'city-budget', 85,
        { value: `${compliancePct.toFixed(1)}%` }
      ))
    }

    const pcardAmt = extra?.pcardAmt as number | undefined
    if (pcardAmt !== undefined) {
      const fmt = pcardAmt >= 1_000_000 ? `$${(pcardAmt / 1_000_000).toFixed(1)}M` : `$${(pcardAmt / 1_000).toFixed(0)}K`
      items.push(makeItem(
        'view-ad-pcard', `P-card advertising: ${fmt} (untraceable)`,
        'compliance', 'alert', 'city-budget', 80,
        { value: fmt }
      ))
    }

    return items
  },

  'demographics': (data) => {
    const items: (TickerItem | null)[] = []
    const { extra } = data

    const incomeRange = extra?.incomeRange as { low: number; high: number } | undefined
    if (incomeRange) {
      const ratio = (incomeRange.high / incomeRange.low).toFixed(1)
      const lowK = `$${(incomeRange.low / 1_000).toFixed(0)}K`
      const highK = `$${(incomeRange.high / 1_000).toFixed(0)}K`
      items.push(makeItem(
        'view-demo-income', `Median income varies ${ratio}x across SF (${lowK}–${highK})`,
        'milestone', 'neutral', 'demographics', 60,
        { value: `${ratio}x` }
      ))
    }

    const mostDiverse = extra?.mostDiverseNeighborhood as string | undefined
    if (mostDiverse) {
      items.push(makeItem(
        'view-demo-diverse', `Most diverse: ${mostDiverse}`,
        'milestone', 'neutral', 'demographics', 50
      ))
    }

    return items
  },
}
