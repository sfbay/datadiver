/**
 * Silent background cache warmer — fires key queries for all views
 * on Home page mount so subsequent navigation is instant.
 *
 * Strategy: delay 2 seconds after mount (let the visible UI load first),
 * then fire queries in priority order with staggered timing to avoid
 * hammering Socrata. Total preload takes ~8-10 seconds silently in
 * the background.
 *
 * Once Option 3 (Vercel edge cache) is added, this same preload
 * warms the CDN for all subsequent users.
 */

import { useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'
import { useAppStore } from '@/stores/appStore'

export function usePreloadCache() {
  const dateRange = useAppStore((s) => s.dateRange)
  const hasPreloaded = useRef(false)

  useEffect(() => {
    // Only preload once per session
    if (hasPreloaded.current) return
    hasPreloaded.current = true

    const { start, end } = dateRange
    const whereDate = (field: string) =>
      `${field} >= '${start}T00:00:00' AND ${field} <= '${end}T23:59:59'`

    // Delay 2s — let the hero, ticker, and visible content load first
    const timer = setTimeout(() => {
      // Priority 1: Budget & vendor data (1-hour TTL, heaviest queries)
      const budget = [
        fetchDataset('vendorPayments', {
          $select: 'vendor, SUM(vouchers_paid) as total_paid, COUNT(*) as payment_count',
          $where: "fiscal_year = '2026' AND sub_object = 'Advertising'",
          $group: 'vendor, department',
          $order: 'total_paid DESC',
          $limit: 2000,
        }),
        fetchDataset('spendingRevenue', {
          $select: 'department, SUM(amount) as total',
          $where: "fiscal_year = '2026' AND revenue_or_spending = 'Spending'",
          $group: 'department',
          $order: 'total DESC',
          $limit: 100,
        }),
        fetchDataset('budget', {
          $select: 'department, SUM(budget) as total',
          $where: "fiscal_year = '2026'",
          $group: 'department',
          $order: 'total DESC',
          $limit: 100,
        }),
      ]

      // Priority 2: Public safety views (10-min TTL)
      const safety = [
        fetchDataset('fireEMSDispatch', {
          $select: 'neighborhoods_analysis_boundaries, COUNT(*) as cnt',
          $where: `${whereDate('received_dttm')} AND on_scene_dttm IS NOT NULL`,
          $group: 'neighborhoods_analysis_boundaries',
          $order: 'cnt DESC',
          $limit: 50,
        }),
        fetchDataset('policeIncidents', {
          $select: 'analysis_neighborhood, COUNT(*) as cnt',
          $where: whereDate('incident_datetime'),
          $group: 'analysis_neighborhood',
          $order: 'cnt DESC',
          $limit: 50,
        }),
        fetchDataset('cases311', {
          $select: 'analysis_neighborhood, COUNT(*) as cnt',
          $where: whereDate('requested_datetime'),
          $group: 'analysis_neighborhood',
          $order: 'cnt DESC',
          $limit: 50,
        }),
      ]

      // Priority 3: Other views (15-30 min TTL)
      const other = [
        fetchDataset('businessLocations', {
          $select: 'COUNT(*) as cnt',
          $where: `dba_start_date >= '${start}T00:00:00' AND dba_start_date <= '${end}T23:59:59'`,
          $limit: 1,
        }),
        fetchDataset('campaignFinance', {
          $select: 'filer_name, SUM(calculated_amount) as total',
          $where: "form_type = 'A'",
          $group: 'filer_name',
          $order: 'total DESC',
          $limit: 20,
        }),
      ]

      // Fire priority 1 immediately
      Promise.allSettled(budget).catch(() => {})

      // Fire priority 2 after 1 second
      setTimeout(() => Promise.allSettled(safety).catch(() => {}), 1000)

      // Fire priority 3 after 2 seconds
      setTimeout(() => Promise.allSettled(other).catch(() => {}), 2000)
    }, 2000)

    return () => clearTimeout(timer)
  }, [dateRange])
}
