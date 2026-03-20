/** Vendor profile data — spending timeline, department breakdown, categories, contracts, metrics */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { fetchDataset } from '@/api/client'
import type { FiscalYear } from '@/types/budget'

// ── Row types from Socrata aggregation queries ─────────────

export interface VendorYearRow {
  fiscal_year: string
  total_paid: string
  payment_count: string
}

export interface VendorDeptBreakdown {
  department: string
  total_paid: string
  payment_count: string
}

export interface VendorCategoryRow {
  character: string
  object: string
  total_paid: string
}

export interface VendorContractRow {
  contract_no: string
  contract_title: string
  department: string
  agreed_amt: string
  pmt_amt: string
  remaining_amt: string
  sole_source_flg: string
  term_end_date: string
}

export interface VendorPaymentRow {
  fiscal_year: string
  department: string
  sub_object: string
  vouchers_paid: string
  voucher: string
  purchase_order: string
}

// ── Computed metrics ───────────────────────────────────────

export interface VendorMetrics {
  lifetimeTotal: number
  fiscalYears: number
  avgAnnual: number
  peakYear: { fy: string; amount: number } | null
  currentYearTotal: number
  priorYearTotal: number
  yoyChange: number | null // percentage
  contractCount: number
  isNonprofit: boolean
}

// ── Hook ───────────────────────────────────────────────────

export function useVendorProfile(vendor: string | null, fiscalYear?: FiscalYear) {
  const [yearData, setYearData] = useState<VendorYearRow[]>([])
  const [deptData, setDeptData] = useState<VendorDeptBreakdown[]>([])
  const [categoryData, setCategoryData] = useState<VendorCategoryRow[]>([])
  const [contractData, setContractData] = useState<VendorContractRow[]>([])
  const [isNonprofit, setIsNonprofit] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!vendor) return
    let cancelled = false
    setIsLoading(true)
    setError(null)

    const escaped = vendor.replace(/'/g, "''")
    const spending = "revenue_or_spending = 'Spending'"
    const vendorBase = `vendor = '${escaped}' AND ${spending}`
    const fyClause = fiscalYear ? ` AND fiscal_year = '${fiscalYear}'` : ''

    Promise.all([
      // Annual spending history
      fetchDataset<VendorYearRow>('vendorPayments', {
        $select: 'fiscal_year, SUM(vouchers_paid) as total_paid, COUNT(*) as payment_count',
        $where: vendorBase,
        $group: 'fiscal_year',
        $order: 'fiscal_year ASC',
        $limit: 50,
      }),
      // Department breakdown (current FY or all-time)
      fetchDataset<VendorDeptBreakdown>('vendorPayments', {
        $select: 'department, SUM(vouchers_paid) as total_paid, COUNT(*) as payment_count',
        $where: `${vendorBase}${fyClause}`,
        $group: 'department',
        $order: 'total_paid DESC',
        $limit: 20,
      }),
      // Category breakdown (character/object hierarchy)
      fetchDataset<VendorCategoryRow>('vendorPayments', {
        $select: 'character, object, SUM(vouchers_paid) as total_paid',
        $where: `${vendorBase}${fyClause}`,
        $group: 'character, object',
        $order: 'total_paid DESC',
        $limit: 20,
      }),
      // Contract inventory from supplierContracts dataset
      // Use exact match for short names to avoid over-matching (e.g., "SF" matching everything)
      fetchDataset<VendorContractRow>('supplierContracts', {
        $select: 'contract_no, contract_title, department, agreed_amt, pmt_amt, remaining_amt, sole_source_flg, term_end_date',
        $where: escaped.length >= 6
          ? `UPPER(prime_contractor) LIKE '%${escaped.toUpperCase()}%'`
          : `UPPER(prime_contractor) = '${escaped.toUpperCase()}'`,
        $order: 'pmt_amt DESC',
        $limit: 20,
      }),
      // Nonprofit check
      fetchDataset<{ non_profit_indicator: string }>('vendorPayments', {
        $select: 'non_profit_indicator',
        $where: `vendor = '${escaped}' AND ${spending} AND non_profit_indicator = 'Y'`,
        $limit: 1,
      }),
    ])
      .then(([years, depts, cats, contracts, npCheck]) => {
        if (cancelled) return
        setYearData(years)
        setDeptData(depts)
        setCategoryData(cats)
        setContractData(contracts)
        setIsNonprofit(npCheck.length > 0)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load vendor profile')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [vendor, fiscalYear])

  // Compute derived metrics
  const metrics = useMemo((): VendorMetrics | null => {
    if (yearData.length === 0) return null

    const yearAmounts = yearData.map((r) => ({
      fy: r.fiscal_year,
      amount: parseFloat(r.total_paid) || 0,
    }))

    const lifetimeTotal = yearAmounts.reduce((s, y) => s + y.amount, 0)
    const peakYear = yearAmounts.reduce((best, y) => y.amount > (best?.amount ?? 0) ? y : best, yearAmounts[0])

    // Current and prior year for YoY
    const currentFY = fiscalYear ?? Math.max(...yearAmounts.map((y) => parseInt(y.fy, 10)))
    const currentYearTotal = yearAmounts.find((y) => y.fy === String(currentFY))?.amount ?? 0
    const priorYearTotal = yearAmounts.find((y) => y.fy === String(currentFY - 1))?.amount ?? 0
    const yoyChange = priorYearTotal > 0
      ? ((currentYearTotal - priorYearTotal) / priorYearTotal) * 100
      : null

    return {
      lifetimeTotal,
      fiscalYears: yearAmounts.length,
      avgAnnual: yearAmounts.length > 0 ? lifetimeTotal / yearAmounts.length : 0,
      peakYear,
      currentYearTotal,
      priorYearTotal,
      yoyChange,
      contractCount: contractData.length,
      isNonprofit: isNonprofit,
    }
  }, [yearData, contractData, isNonprofit, fiscalYear])

  return {
    yearData,
    deptData,
    categoryData,
    contractData,
    metrics,
    isLoading,
    error,
  }
}

// ── Paginated payments hook ────────────────────────────────

const PAGE_SIZE = 50

export function useVendorPayments(vendor: string | null) {
  const [payments, setPayments] = useState<VendorPaymentRow[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  // Reset on vendor change
  useEffect(() => {
    setPayments([])
    setPage(0)
    setHasMore(true)
  }, [vendor])

  // Fetch current page
  useEffect(() => {
    if (!vendor) return
    let cancelled = false
    setIsLoading(true)

    const escaped = vendor.replace(/'/g, "''")

    fetchDataset<VendorPaymentRow>('vendorPayments', {
      $select: 'fiscal_year, department, sub_object, vouchers_paid, voucher, purchase_order',
      $where: `vendor = '${escaped}' AND revenue_or_spending = 'Spending'`,
      $order: 'fiscal_year DESC, vouchers_paid DESC',
      $limit: PAGE_SIZE,
      $offset: page * PAGE_SIZE,
    })
      .then((rows) => {
        if (cancelled) return
        setPayments((prev) => page === 0 ? rows : [...prev, ...rows])
        setHasMore(rows.length === PAGE_SIZE)
      })
      .catch(() => {
        if (!cancelled) setHasMore(false)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [vendor, page])

  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) setPage((p) => p + 1)
  }, [hasMore, isLoading])

  return { payments, isLoading, hasMore, loadMore }
}

// ── Monthly spending heatgrid data ─────────────────────────

export interface MonthlySpendRow {
  fiscal_year: string
  month: string
  total_paid: string
}

export function useVendorMonthlySpend(vendor: string | null) {
  const [data, setData] = useState<MonthlySpendRow[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!vendor) return
    let cancelled = false
    setIsLoading(true)

    const escaped = vendor.replace(/'/g, "''")

    fetchDataset<MonthlySpendRow>('vendorPayments', {
      $select: "fiscal_year, date_extract_m(vouchers_paid_distribution_date) as month, SUM(vouchers_paid) as total_paid",
      $where: `vendor = '${escaped}' AND revenue_or_spending = 'Spending' AND vouchers_paid_distribution_date IS NOT NULL`,
      $group: 'fiscal_year, month',
      $order: 'fiscal_year ASC, month ASC',
      $limit: 500,
    })
      .then((rows) => { if (!cancelled) setData(rows) })
      .catch(() => { /* silently fail — heatgrid is supplementary */ })
      .finally(() => { if (!cancelled) setIsLoading(false) })

    return () => { cancelled = true }
  }, [vendor])

  return { data, isLoading }
}
