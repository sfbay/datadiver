/** Year-by-year spending timelines for Advertising & Media detail pages.
 *
 *  Provides two hooks:
 *    - useDepartmentTimeline(deptName, currentFY) — multi-year dept spending
 *    - useCategoryTimeline(category, currentFY) — multi-year media-category spending
 *
 *  BOTH hooks fetch all three ad-detection layers (tagged, agency, p-card)
 *  in parallel and sum them to produce full-picture yearly totals. This is
 *  critical for departments like AIR Airport Commission whose ad spending
 *  is dominated by agency-managed media buying (99%+) — a tagged-only
 *  query would misleadingly show near-zero activity for such departments.
 *
 *  Uses the same FY2018+ historical window as useComplianceData's trend
 *  fetch for consistency across all time-series charts in the app.
 */

import { useState, useEffect } from 'react'
import { fetchDataset } from '@/api/client'
import { classifyVendor, type MediaCategory } from '@/utils/mediaClassification'
import type { FiscalYear } from '@/types/budget'
import type { SpendingTimelineRow } from '@/components/charts/SpendingTimeline'

const START_FY = 2018

// Shared agency vendor LIKE clause — keep in sync with useAdvertisingData.ts
// and useComplianceData.ts. These are the known full-service agencies
// whose spending is detected via vendor-name matching when sub_object != 'Advertising'.
const AGENCY_VENDOR_LIKE = "(UPPER(vendor) LIKE '%ZEBA CONSULTING%' OR UPPER(vendor) LIKE '%MOST LIKELY TO%' OR UPPER(vendor) LIKE '%CKR INTERACTIVE%' OR UPPER(vendor) LIKE '%O''RORKE%' OR UPPER(vendor) LIKE '%GREAT KOLOR%' OR UPPER(vendor) LIKE '%CIVIC EDGE%' OR UPPER(vendor) LIKE '%BETTER WORLD ADVERTISING%' OR UPPER(vendor) LIKE '%PROMOTION MARKETING%')"

interface TimelineState {
  data: SpendingTimelineRow[]
  isLoading: boolean
  error: string | null
}

/** Build fiscal year list and SQL IN clause from START_FY through currentFY */
function buildFyClause(currentFY: FiscalYear): { fyList: number[]; fyInClause: string } {
  const fyList = Array.from(
    { length: currentFY - START_FY + 1 },
    (_, i) => START_FY + i,
  )
  const fyInClause = fyList.map((fy) => `'${fy}'`).join(',')
  return { fyList, fyInClause }
}

/** Turn a Map<fiscal_year, total> into SpendingTimelineRow[] for the year range */
function mapToRows(byFY: Map<string, number>, fyList: number[]): SpendingTimelineRow[] {
  return fyList
    .filter((fy) => byFY.has(String(fy)))
    .map((fy) => ({
      fiscal_year: String(fy),
      total_paid: String(byFY.get(String(fy)) || 0),
    }))
}

/** Department-scoped yearly totals across all three layers (tagged, agency, p-card).
 *  Runs three parallel queries filtered by department and sums them per fiscal year.
 *  Tagged query excludes p-card vendor rows to prevent double-counting (p-card rows
 *  have sub_object='Advertising' so they'd otherwise appear in both queries). */
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

    const { fyList, fyInClause } = buildFyClause(currentFY)
    const escaped = deptName.replace(/'/g, "''")
    const deptClause = `department = '${escaped}'`

    // Layer 1: Tagged direct ad placements (excluding p-card to avoid overlap)
    const taggedPromise = fetchDataset<{ fiscal_year: string; total_paid: string }>('vendorPayments', {
      $select: 'fiscal_year, SUM(vouchers_paid) as total_paid',
      $where: `${deptClause} AND sub_object = 'Advertising' AND UPPER(vendor) NOT LIKE '%P-CARD%' AND fiscal_year IN (${fyInClause})`,
      $group: 'fiscal_year',
      $order: 'fiscal_year ASC',
      $limit: 50,
    })

    // Layer 2: Agency-managed media buying (vendor registry, not sub_object='Advertising')
    const agencyPromise = fetchDataset<{ fiscal_year: string; total_paid: string }>('vendorPayments', {
      $select: 'fiscal_year, SUM(vouchers_paid) as total_paid',
      $where: `${deptClause} AND ${AGENCY_VENDOR_LIKE} AND sub_object != 'Advertising' AND fiscal_year IN (${fyInClause})`,
      $group: 'fiscal_year',
      $order: 'fiscal_year ASC',
      $limit: 50,
    })

    // Layer 3: P-card advertising
    const pcardPromise = fetchDataset<{ fiscal_year: string; total_paid: string }>('vendorPayments', {
      $select: 'fiscal_year, SUM(vouchers_paid) as total_paid',
      $where: `${deptClause} AND UPPER(vendor) LIKE '%P-CARD%' AND sub_object = 'Advertising' AND fiscal_year IN (${fyInClause})`,
      $group: 'fiscal_year',
      $order: 'fiscal_year ASC',
      $limit: 50,
    })

    Promise.all([taggedPromise, agencyPromise, pcardPromise])
      .then(([tagged, agency, pcard]) => {
        if (cancelled) return
        const byFY = new Map<string, number>()
        for (const rows of [tagged, agency, pcard]) {
          for (const r of rows) {
            const amount = parseFloat(r.total_paid) || 0
            byFY.set(r.fiscal_year, (byFY.get(r.fiscal_year) || 0) + amount)
          }
        }
        setState({ data: mapToRows(byFY, fyList), isLoading: false, error: null })
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

/** Category-scoped yearly totals. Some categories live in the tagged layer
 *  (community-ethnic-press, major-metro-print, radio-tv, legal-notices, etc.),
 *  others live in the agency layer (full-service-agency, digital-agency),
 *  and p-card is its own layer. Fetch all three vendor-level streams,
 *  classify each row, and sum matches by fiscal year. */
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

    const { fyList, fyInClause } = buildFyClause(currentFY)

    // Layer 1: Tagged (excludes p-card pattern to prevent double count)
    const taggedPromise = fetchDataset<{ vendor: string; fiscal_year: string; total_paid: string }>('vendorPayments', {
      $select: 'vendor, fiscal_year, SUM(vouchers_paid) as total_paid',
      $where: `sub_object = 'Advertising' AND UPPER(vendor) NOT LIKE '%P-CARD%' AND fiscal_year IN (${fyInClause})`,
      $group: 'vendor, fiscal_year',
      $order: 'fiscal_year ASC',
      $limit: 10000,
    })

    // Layer 2: Agency vendors (non-tagged)
    const agencyPromise = fetchDataset<{ vendor: string; fiscal_year: string; total_paid: string }>('vendorPayments', {
      $select: 'vendor, fiscal_year, SUM(vouchers_paid) as total_paid',
      $where: `${AGENCY_VENDOR_LIKE} AND sub_object != 'Advertising' AND fiscal_year IN (${fyInClause})`,
      $group: 'vendor, fiscal_year',
      $order: 'fiscal_year ASC',
      $limit: 5000,
    })

    // Layer 3: P-card
    const pcardPromise = fetchDataset<{ vendor: string; fiscal_year: string; total_paid: string }>('vendorPayments', {
      $select: 'vendor, fiscal_year, SUM(vouchers_paid) as total_paid',
      $where: `UPPER(vendor) LIKE '%P-CARD%' AND sub_object = 'Advertising' AND fiscal_year IN (${fyInClause})`,
      $group: 'vendor, fiscal_year',
      $order: 'fiscal_year ASC',
      $limit: 5000,
    })

    Promise.all([taggedPromise, agencyPromise, pcardPromise])
      .then(([tagged, agency, pcard]) => {
        if (cancelled) return
        // Aggregate rows where vendor classification === target category.
        // Every layer's rows get classified independently by classifyVendor(),
        // which returns the right category (including 'full-service-agency'
        // or 'p-card') regardless of which layer the row came from.
        const byFY = new Map<string, number>()
        for (const rows of [tagged, agency, pcard]) {
          for (const r of rows) {
            if (classifyVendor(r.vendor) !== category) continue
            const amount = parseFloat(r.total_paid) || 0
            byFY.set(r.fiscal_year, (byFY.get(r.fiscal_year) || 0) + amount)
          }
        }
        setState({ data: mapToRows(byFY, fyList), isLoading: false, error: null })
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
