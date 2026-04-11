/**
 * Budget deficit data hook — fetches spending vs revenue from the Socrata
 * `spendingRevenue` dataset (bpnb-jwfb), computes deficit, per-second rate,
 * FY-over-FY trend, and top department contributors.
 *
 * Module-level cache with 30-minute TTL, keyed on current FY string.
 * Fires two parallel Socrata queries on mount; uses useRef abort pattern.
 *
 * SF fiscal year: July 1 – June 30. FY "2026" = July 2025 – June 2026.
 */

import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'

// ── Types ───────────────────────────────────────────────────────

export interface FYTrend {
  fiscalYear: string  // "2022", "2023", etc.
  spending: number
  revenue: number
  gap: number  // spending - revenue (positive = deficit)
}

export interface DeptContributor {
  department: string
  spending: number
  pctOfTotal: number
}

export interface DeficitData {
  totalSpending: number
  totalRevenue: number
  deficit: number       // spending - revenue
  perSecond: number     // deficit / seconds elapsed in FY so far
  perDay: number
  trend: FYTrend[]      // last 5 fiscal years, ascending
  topDepartments: DeptContributor[]  // top 3 by spending
  yoyPct: number        // year-over-year % change in gap
}

export interface UseDeficitDataResult {
  data: DeficitData | null
  isLoading: boolean
  error: string | null
}

// ── Module-level cache ──────────────────────────────────────────

interface CacheEntry {
  data: DeficitData
  timestamp: number
  dateKey: string
}

const CACHE_TTL = 30 * 60 * 1000  // 30 minutes
let deficitCache: CacheEntry | null = null

// ── Current FY helper ───────────────────────────────────────────

/** Return the current SF fiscal year ending year string.
 *  FY "2026" = July 1 2025 – June 30 2026.
 *  If month >= 7 (July or later), FY ending year = current year + 1.
 *  Otherwise FY ending year = current year. */
function getCurrentFY(): string {
  const now = new Date()
  const month = now.getMonth() + 1  // 1-indexed
  const year = now.getFullYear()
  return String(month >= 7 ? year + 1 : year)
}

/** Return seconds elapsed since the start of the given FY (July 1 of fyYear - 1). */
function secondsElapsedInFY(fiscalYear: string): number {
  const fyStart = new Date(`${Number(fiscalYear) - 1}-07-01T00:00:00Z`)
  const now = new Date()
  const elapsedMs = now.getTime() - fyStart.getTime()
  return Math.max(elapsedMs / 1000, 1)  // avoid division by zero
}

// ── Row types for Socrata responses ────────────────────────────

interface FYAggRow {
  fiscal_year: string
  revenue_or_spending: string
  total: string
}

interface DeptAggRow {
  department: string
  total: string
}

// ── Hook ────────────────────────────────────────────────────────

export function useDeficitData(): UseDeficitDataResult {
  const [data, setData] = useState<DeficitData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)

  useEffect(() => {
    abortRef.current = false
    const currentFY = getCurrentFY()
    const dateKey = currentFY

    // Check module-level cache
    if (
      deficitCache &&
      deficitCache.dateKey === dateKey &&
      Date.now() - deficitCache.timestamp < CACHE_TTL
    ) {
      setData(deficitCache.data)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    // Compute the last 5 FY strings: e.g. ["2022","2023","2024","2025","2026"]
    const currentFYNum = Number(currentFY)
    const fyList = Array.from({ length: 5 }, (_, i) =>
      String(currentFYNum - 4 + i)
    )
    const fyListSQL = fyList.map((y) => `'${y}'`).join(', ')

    Promise.all([
      // Query 1: spending + revenue by FY for last 5 years
      fetchDataset<FYAggRow>('spendingRevenue', {
        $select: 'fiscal_year, revenue_or_spending, SUM(amount) as total',
        $where: `fiscal_year IN (${fyListSQL})`,
        $group: 'fiscal_year, revenue_or_spending',
        $limit: 20,
      }),
      // Query 2: top departments by spending for current FY
      fetchDataset<DeptAggRow>('spendingRevenue', {
        $select: 'department, SUM(amount) as total',
        $where: `fiscal_year = '${currentFY}' AND revenue_or_spending = 'Spending'`,
        $group: 'department',
        $order: 'total DESC',
        $limit: 5,
      }),
    ]).then(([fyRows, deptRows]) => {
      if (abortRef.current) return

      // ── Build FY trend map ─────────────────────────────────
      // Map: fyYear -> { spending, revenue }
      const fyMap = new Map<string, { spending: number; revenue: number }>()
      for (const row of fyRows) {
        const fy = row.fiscal_year
        const amount = parseFloat(row.total) || 0
        if (!fyMap.has(fy)) fyMap.set(fy, { spending: 0, revenue: 0 })
        const entry = fyMap.get(fy)!
        if (row.revenue_or_spending === 'Spending') {
          entry.spending += amount
        } else if (row.revenue_or_spending === 'Revenue') {
          entry.revenue += amount
        }
      }

      // Build sorted trend array (ascending FY)
      const trend: FYTrend[] = fyList
        .filter((fy) => fyMap.has(fy))
        .map((fy) => {
          const { spending, revenue } = fyMap.get(fy)!
          return { fiscalYear: fy, spending, revenue, gap: spending - revenue }
        })

      // ── Current FY stats ───────────────────────────────────
      const currentFYEntry = fyMap.get(currentFY) ?? { spending: 0, revenue: 0 }
      const totalSpending = currentFYEntry.spending
      const totalRevenue = currentFYEntry.revenue
      const deficit = totalSpending - totalRevenue

      // Per-second and per-day rates
      const secondsElapsed = secondsElapsedInFY(currentFY)
      const perSecond = deficit / secondsElapsed
      const perDay = perSecond * 86400

      // ── YoY % change in gap ────────────────────────────────
      const prevFY = String(currentFYNum - 1)
      const prevEntry = fyMap.get(prevFY)
      const prevGap = prevEntry ? prevEntry.spending - prevEntry.revenue : 0
      let yoyPct = 0
      if (prevGap !== 0) {
        yoyPct = ((deficit - prevGap) / Math.abs(prevGap)) * 100
      } else if (deficit !== 0) {
        yoyPct = 100
      }

      // ── Top departments ────────────────────────────────────
      // Filter out null/blank departments, take top 3
      const validDeptRows = deptRows.filter((r) => r.department?.trim())
      const topDepartments: DeptContributor[] = validDeptRows.slice(0, 3).map((r) => ({
        department: r.department,
        spending: parseFloat(r.total) || 0,
        pctOfTotal: totalSpending > 0
          ? ((parseFloat(r.total) || 0) / totalSpending) * 100
          : 0,
      }))

      // ── Assemble result ────────────────────────────────────
      const result: DeficitData = {
        totalSpending,
        totalRevenue,
        deficit,
        perSecond,
        perDay,
        trend,
        topDepartments,
        yoyPct,
      }

      // Write cache
      deficitCache = { data: result, timestamp: Date.now(), dateKey }

      setData(result)
      setIsLoading(false)
    }).catch((e) => {
      if (abortRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to load deficit data')
      setIsLoading(false)
    })

    return () => { abortRef.current = true }
  }, [])  // fires once — FY changes at most once per year, cache handles re-use

  return { data, isLoading, error }
}
