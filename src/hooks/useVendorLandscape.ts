/** Vendor landscape data — top vendors with YoY comparison for the Vendor Explorer */

import { useState, useEffect, useMemo } from 'react'
import { fetchDataset } from '@/api/client'
import type { FiscalYear, VendorAggRow, DepartmentAggRow } from '@/types/budget'

export interface VendorLandscapeItem {
  vendor: string
  total: number
  priorTotal: number
  payments: number
  yoyDelta: number | null // percentage, null if vendor is new (no prior year)
  isNew: boolean
  isDeparted: boolean
}

interface CharacterAggRow {
  character: string
  total: string
}

export interface VendorLandscapeFilters {
  department?: string
  category?: string // character field
}

export function useVendorLandscape(
  fiscalYear: FiscalYear,
  filters: VendorLandscapeFilters = {},
  showDeparted = false,
) {
  const [currentData, setCurrentData] = useState<VendorAggRow[]>([])
  const [priorData, setPriorData] = useState<VendorAggRow[]>([])
  const [departments, setDepartments] = useState<DepartmentAggRow[]>([])
  const [categories, setCategories] = useState<CharacterAggRow[]>([])
  const [totalVendorCount, setTotalVendorCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { department, category } = filters

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    // Build filter clauses — always include revenue_or_spending = 'Spending' (matches useBudgetData pattern)
    const spendingFilter = "revenue_or_spending = 'Spending'"
    const clauses: string[] = [spendingFilter]
    if (department) clauses.push(`department = '${department.replace(/'/g, "''")}'`)
    if (category) clauses.push(`character = '${category.replace(/'/g, "''")}'`)
    const vendorWhere = (fy: number) => `fiscal_year = '${fy}' AND ${clauses.join(' AND ')}`
    const baseWhere = (fy: number) => `fiscal_year = '${fy}' AND ${spendingFilter}`

    Promise.all([
      // Current FY vendors
      fetchDataset<VendorAggRow>('vendorPayments', {
        $select: 'vendor, SUM(vouchers_paid) as total_paid, COUNT(*) as payment_count',
        $where: vendorWhere(fiscalYear),
        $group: 'vendor',
        $order: 'total_paid DESC',
        $limit: 500,
      }),
      // Prior FY vendors (for ghost bars + YoY)
      fetchDataset<VendorAggRow>('vendorPayments', {
        $select: 'vendor, SUM(vouchers_paid) as total_paid, COUNT(*) as payment_count',
        $where: vendorWhere(fiscalYear - 1),
        $group: 'vendor',
        $order: 'total_paid DESC',
        $limit: 500,
      }),
      // Department list for filter dropdown (unfiltered by dept/category)
      fetchDataset<DepartmentAggRow>('vendorPayments', {
        $select: 'department, SUM(vouchers_paid) as total',
        $where: baseWhere(fiscalYear),
        $group: 'department',
        $order: 'total DESC',
        $limit: 50,
      }),
      // Category (character) list for filter dropdown
      fetchDataset<CharacterAggRow>('vendorPayments', {
        $select: 'character, SUM(vouchers_paid) as total',
        $where: baseWhere(fiscalYear),
        $group: 'character',
        $order: 'total DESC',
        $limit: 30,
      }),
      // Total vendor count (for "showing top 500 of N" indicator)
      fetchDataset<{ count: string }>('vendorPayments', {
        $select: 'COUNT(DISTINCT vendor) as count',
        $where: baseWhere(fiscalYear),
      }),
    ])
      .then(([current, prior, depts, cats, countResult]) => {
        if (cancelled) return
        setCurrentData(current)
        setPriorData(prior)
        setDepartments(depts)
        setCategories(cats)
        setTotalVendorCount(countResult[0] ? parseInt(countResult[0].count, 10) : null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load vendor data')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [fiscalYear, department, category])

  const vendors = useMemo((): VendorLandscapeItem[] => {
    const priorMap = new Map<string, number>()
    for (const v of priorData) {
      priorMap.set(v.vendor, parseFloat(v.total_paid) || 0)
    }

    const currentSet = new Set<string>()
    const items: VendorLandscapeItem[] = []

    for (const v of currentData) {
      const total = parseFloat(v.total_paid) || 0
      if (total <= 0) continue
      const priorTotal = priorMap.get(v.vendor) ?? 0
      currentSet.add(v.vendor)

      items.push({
        vendor: v.vendor,
        total,
        priorTotal,
        payments: parseInt(v.payment_count, 10) || 0,
        yoyDelta: priorTotal > 0 ? ((total - priorTotal) / priorTotal) * 100 : null,
        isNew: !priorMap.has(v.vendor),
        isDeparted: false,
      })
    }

    // Departed vendors: present in prior year but absent in current
    if (showDeparted) {
      for (const v of priorData) {
        if (!currentSet.has(v.vendor)) {
          const priorTotal = parseFloat(v.total_paid) || 0
          if (priorTotal <= 0) continue
          items.push({
            vendor: v.vendor,
            total: 0,
            priorTotal,
            payments: 0,
            yoyDelta: -100,
            isNew: false,
            isDeparted: true,
          })
        }
      }
    }

    return items
  }, [currentData, priorData, showDeparted])

  return {
    vendors,
    departments,
    categories,
    totalVendorCount,
    isLoading,
    error,
  }
}
