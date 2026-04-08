/** Year-by-year spending timelines for Advertising & Media detail pages.
 *
 *  Provides two hooks:
 *    - useDepartmentTimeline(deptName, currentFY) — multi-year dept spending
 *    - useCategoryTimeline(category, currentFY) — multi-year media-category spending
 *
 *  Both return SpendingTimelineRow[] ready to pass into the shared
 *  SpendingTimeline component. Uses the same FY2018+ historical window
 *  as useComplianceData's trend fetch for consistency across charts.
 *
 *  Only reads tagged ad spend (sub_object='Advertising') so the timeline
 *  reflects the same "direct ad placements" universe as the compliance
 *  card's bar 2. Agency and P-card layers would be noisy for a dept-level
 *  timeline (agencies route through categories not typically tracked
 *  year-over-year per dept).
 */

import { useState, useEffect } from 'react'
import { fetchDataset } from '@/api/client'
import { classifyVendor, type MediaCategory } from '@/utils/mediaClassification'
import type { FiscalYear } from '@/types/budget'
import type { SpendingTimelineRow } from '@/components/charts/SpendingTimeline'

const START_FY = 2018

interface TimelineState {
  data: SpendingTimelineRow[]
  isLoading: boolean
  error: string | null
}

/** Department-scoped yearly totals. One Socrata query grouped by fiscal_year. */
export function useDepartmentTimeline(
  deptName: string | null,
  currentFY: FiscalYear,
): TimelineState {
  const [state, setState] = useState<TimelineState>({ data: [], isLoading: false, error: null })

  useEffect(() => {
    if (!deptName) {
      setState({ data: [], isLoading: false, error: null })
      return
    }

    let cancelled = false
    setState({ data: [], isLoading: true, error: null })

    const fyList = Array.from(
      { length: currentFY - START_FY + 1 },
      (_, i) => START_FY + i,
    )
    const fyInClause = fyList.map((fy) => `'${fy}'`).join(',')
    const escaped = deptName.replace(/'/g, "''")

    fetchDataset<{ fiscal_year: string; total_paid: string }>('vendorPayments', {
      $select: 'fiscal_year, SUM(vouchers_paid) as total_paid',
      $where: `department = '${escaped}' AND sub_object = 'Advertising' AND fiscal_year IN (${fyInClause})`,
      $group: 'fiscal_year',
      $order: 'fiscal_year ASC',
      $limit: 50,
    })
      .then((rows) => {
        if (cancelled) return
        setState({ data: rows, isLoading: false, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        setState({
          data: [],
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch department timeline',
        })
      })

    return () => { cancelled = true }
  }, [deptName, currentFY])

  return state
}

/** Category-scoped yearly totals. Fetches tagged ad vendors grouped by
 *  vendor + fiscal_year, then classifies each vendor and sums by year. */
export function useCategoryTimeline(
  category: MediaCategory | null,
  currentFY: FiscalYear,
): TimelineState {
  const [state, setState] = useState<TimelineState>({ data: [], isLoading: false, error: null })

  useEffect(() => {
    if (!category) {
      setState({ data: [], isLoading: false, error: null })
      return
    }

    let cancelled = false
    setState({ data: [], isLoading: true, error: null })

    const fyList = Array.from(
      { length: currentFY - START_FY + 1 },
      (_, i) => START_FY + i,
    )
    const fyInClause = fyList.map((fy) => `'${fy}'`).join(',')

    // We fetch ALL tagged vendor×year rows for the window, then filter
    // client-side by category using the same classifyVendor() used
    // elsewhere in the app. This matches how useComplianceData.ts handles
    // category attribution and keeps the source of truth single-file.
    fetchDataset<{ vendor: string; fiscal_year: string; total_paid: string }>('vendorPayments', {
      $select: 'vendor, fiscal_year, SUM(vouchers_paid) as total_paid',
      $where: `sub_object = 'Advertising' AND fiscal_year IN (${fyInClause})`,
      $group: 'vendor, fiscal_year',
      $order: 'fiscal_year ASC',
      $limit: 10000,
    })
      .then((rows) => {
        if (cancelled) return
        // Aggregate rows where vendor classification === target category
        const byFY = new Map<string, number>()
        for (const r of rows) {
          if (classifyVendor(r.vendor) !== category) continue
          const amount = parseFloat(r.total_paid) || 0
          byFY.set(r.fiscal_year, (byFY.get(r.fiscal_year) || 0) + amount)
        }
        const data: SpendingTimelineRow[] = fyList
          .filter((fy) => byFY.has(String(fy)))
          .map((fy) => ({
            fiscal_year: String(fy),
            total_paid: String(byFY.get(String(fy)) || 0),
          }))
        setState({ data, isLoading: false, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        setState({
          data: [],
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch category timeline',
        })
      })

    return () => { cancelled = true }
  }, [category, currentFY])

  return state
}
