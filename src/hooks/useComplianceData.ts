/** Compliance computation for Resolution 240210 — ethnic/community media ≥ 50% of discretionary ad spend */

import { useState, useEffect, useMemo } from 'react'
import { fetchDataset } from '@/api/client'
import { classifyVendor, type MediaCategory } from '@/utils/mediaClassification'
import type { AdVendorRow, AdvertisingData } from '@/hooks/useAdvertisingData'
import type { FiscalYear } from '@/types/budget'
import { getCurrentFiscalYear } from '@/utils/fiscalYear'

// ── Types ──────────────────────────────────────────────────

export type ComplianceStatus = 'compliant' | 'below' | 'critical' | 'none'

export interface ComplianceExclusion {
  vendor: string
  total: number
  category: MediaCategory
  reason: string
}

export interface DepartmentCard {
  department: string
  ethnicMediaSpend: number
  discretionaryTotal: number
  compliancePct: number
  status: ComplianceStatus
  outletCount: number
  trend: number[] // compliance % for recent FYs (for sparkline)
}

export interface ComplianceTrendPoint {
  fiscalYear: FiscalYear
  compliancePct: number
  ethnicMediaSpend: number
  discretionaryTotal: number
  outletCount: number
  /** Agency-managed media buying for this fiscal year (Layer 2) */
  agencyTotal: number
  /** P-card advertising purchases for this fiscal year (Layer 3) */
  pcardTotal: number
  /** Legal notices for this fiscal year (excluded from compliance basis) */
  legalNoticeTotal: number
}

export interface ComplianceData {
  /** Total discretionary ad spend (all advertising minus legal notices) */
  totalDiscretionary: number
  /** Ethnic/community media spend */
  ethnicMediaSpend: number
  /** Compliance percentage: ethnicMediaSpend / totalDiscretionary * 100 */
  compliancePct: number
  /** Number of distinct ethnic/community vendors receiving payments */
  outletCount: number
  /** Per-department compliance breakdown */
  departmentCards: DepartmentCard[]
  /** Legal notice vendors excluded from discretionary total */
  exclusions: ComplianceExclusion[]
  /** Total legal notice spend (excluded from denominator) */
  legalNoticeTotal: number
  /** P-card spend (included in denominator, flagged as outlet-unknown) */
  pcardTotal: number
  /** Total record count backing this computation */
  recordCount: number
  /** Historical compliance % by fiscal year */
  trend: ComplianceTrendPoint[]
  /** Whether trend data is still loading */
  trendLoading: boolean
  isLoading: boolean
  error: string | null
}

// ── Helpers ────────────────────────────────────────────────

function getComplianceStatus(pct: number, hasSpend: boolean): ComplianceStatus {
  if (!hasSpend) return 'none'
  if (pct >= 50) return 'compliant'
  if (pct >= 30) return 'below'
  return 'critical'
}

/** Compute compliance metrics from a set of vendor rows */
function computeFromVendors(vendors: AdVendorRow[]) {
  let totalAdSpend = 0
  let legalNoticeTotal = 0
  let ethnicMediaSpend = 0
  let pcardTotal = 0
  const ethnicVendors = new Set<string>()
  const exclusions: ComplianceExclusion[] = []
  const exclusionMap = new Map<string, number>()

  for (const v of vendors) {
    const amt = parseFloat(v.total_paid) || 0
    totalAdSpend += amt

    if (v.category === 'legal-notices') {
      legalNoticeTotal += amt
      const existing = exclusionMap.get(v.vendor) || 0
      exclusionMap.set(v.vendor, existing + amt)
    } else if (v.category === 'community-ethnic-press') {
      ethnicMediaSpend += amt
      ethnicVendors.add(v.vendor)
    }

    if (v.layer === 'pcard') {
      pcardTotal += amt
    }
  }

  // Build exclusion list
  for (const [vendor, total] of exclusionMap.entries()) {
    exclusions.push({
      vendor,
      total,
      category: 'legal-notices',
      reason: 'Mandatory legal publication — not discretionary advertising',
    })
  }
  exclusions.sort((a, b) => b.total - a.total)

  const totalDiscretionary = totalAdSpend - legalNoticeTotal
  const compliancePct = totalDiscretionary > 0 ? (ethnicMediaSpend / totalDiscretionary) * 100 : 0
  const outletCount = ethnicVendors.size

  return {
    totalDiscretionary,
    ethnicMediaSpend,
    compliancePct,
    outletCount,
    legalNoticeTotal,
    pcardTotal,
    exclusions,
    recordCount: vendors.length,
  }
}

// ── Multi-FY trend fetcher ─────────────────────────────────

interface RawTrendVendorAgg {
  vendor: string
  fiscal_year: string
  total_paid: string
}

/** Same agency vendor LIKE clause used by useAdvertisingData. Update both if you change one. */
const AGENCY_VENDOR_LIKE = "(UPPER(vendor) LIKE '%ZEBA CONSULTING%' OR UPPER(vendor) LIKE '%MOST LIKELY TO%' OR UPPER(vendor) LIKE '%CKR INTERACTIVE%' OR UPPER(vendor) LIKE '%O''RORKE%' OR UPPER(vendor) LIKE '%GREAT KOLOR%' OR UPPER(vendor) LIKE '%CIVIC EDGE%' OR UPPER(vendor) LIKE '%BETTER WORLD ADVERTISING%' OR UPPER(vendor) LIKE '%PROMOTION MARKETING%')"

/** Fetch vendor-level ad data for multiple fiscal years for trend computation.
 *  Pulls all three layers (tagged direct, agency-managed, P-card) so the
 *  composition trend chart can show year-over-year breakdown. */
function useTrendData(currentFY: FiscalYear): { trend: ComplianceTrendPoint[]; trendLoading: boolean } {
  const [trend, setTrend] = useState<ComplianceTrendPoint[]>([])
  const [trendLoading, setTrendLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    // Fetch all advertising vendor data grouped by vendor + fiscal year
    // Going back to FY2018 (fiscal_year = '2018')
    const startFY = 2018
    const fyList = Array.from({ length: currentFY - startFY + 1 }, (_, i) => startFY + i)
    const fyInClause = fyList.map((fy) => `'${fy}'`).join(',')

    // Layer 1: Tagged direct ad placements (sub_object = 'Advertising')
    const taggedPromise = fetchDataset<RawTrendVendorAgg>('vendorPayments', {
      $select: 'vendor, fiscal_year, SUM(vouchers_paid) as total_paid',
      $where: `sub_object = 'Advertising' AND fiscal_year IN (${fyInClause})`,
      $group: 'vendor, fiscal_year',
      $order: 'fiscal_year, total_paid DESC',
      $limit: 10000,
    })

    // Layer 2: Agency-managed media buying (vendor matches agency registry, NOT tagged Advertising)
    const agencyPromise = fetchDataset<RawTrendVendorAgg>('vendorPayments', {
      $select: 'vendor, fiscal_year, SUM(vouchers_paid) as total_paid',
      $where: `${AGENCY_VENDOR_LIKE} AND sub_object != 'Advertising' AND fiscal_year IN (${fyInClause})`,
      $group: 'vendor, fiscal_year',
      $order: 'fiscal_year, total_paid DESC',
      $limit: 5000,
    })

    // Layer 3: P-card advertising
    const pcardPromise = fetchDataset<RawTrendVendorAgg>('vendorPayments', {
      $select: 'vendor, fiscal_year, SUM(vouchers_paid) as total_paid',
      $where: `UPPER(vendor) LIKE '%P-CARD%' AND sub_object = 'Advertising' AND fiscal_year IN (${fyInClause})`,
      $group: 'vendor, fiscal_year',
      $order: 'fiscal_year, total_paid DESC',
      $limit: 5000,
    })

    Promise.all([taggedPromise, agencyPromise, pcardPromise])
      .then(([taggedRows, agencyRows, pcardRows]) => {
        if (cancelled) return

        // Index P-card rows so we can deduplicate them out of the tagged set (matches useAdvertisingData logic)
        const pcardKeys = new Set<string>()
        for (const r of pcardRows) {
          pcardKeys.add(`${r.vendor}|${r.fiscal_year}`)
        }

        // Per-FY accumulators
        const byFY = new Map<number, {
          taggedVendors: { vendor: string; total_paid: string; category: MediaCategory }[]
          agencyTotal: number
          pcardTotal: number
        }>()
        for (const fy of fyList) {
          byFY.set(fy, { taggedVendors: [], agencyTotal: 0, pcardTotal: 0 })
        }

        // Tagged → tagged vendors list, but skip rows that are also P-card (they belong to pcard layer)
        for (const r of taggedRows) {
          const fy = parseInt(r.fiscal_year, 10)
          const entry = byFY.get(fy)
          if (!entry) continue
          if (pcardKeys.has(`${r.vendor}|${r.fiscal_year}`)) continue
          entry.taggedVendors.push({
            vendor: r.vendor,
            total_paid: r.total_paid,
            category: classifyVendor(r.vendor),
          })
        }

        // Agency totals per FY
        for (const r of agencyRows) {
          const fy = parseInt(r.fiscal_year, 10)
          const entry = byFY.get(fy)
          if (!entry) continue
          entry.agencyTotal += parseFloat(r.total_paid) || 0
        }

        // P-card totals per FY
        for (const r of pcardRows) {
          const fy = parseInt(r.fiscal_year, 10)
          const entry = byFY.get(fy)
          if (!entry) continue
          entry.pcardTotal += parseFloat(r.total_paid) || 0
        }

        const points: ComplianceTrendPoint[] = []
        for (const fy of fyList) {
          const entry = byFY.get(fy)!
          let taggedSpend = 0
          let legalNoticeTotal = 0
          let ethnicMediaSpend = 0
          const ethnicVendorSet = new Set<string>()

          for (const v of entry.taggedVendors) {
            const amt = parseFloat(v.total_paid) || 0
            taggedSpend += amt
            if (v.category === 'legal-notices') {
              legalNoticeTotal += amt
            } else if (v.category === 'community-ethnic-press') {
              ethnicMediaSpend += amt
              ethnicVendorSet.add(v.vendor)
            }
          }

          const discretionary = taggedSpend - legalNoticeTotal
          points.push({
            fiscalYear: fy,
            compliancePct: discretionary > 0 ? (ethnicMediaSpend / discretionary) * 100 : 0,
            ethnicMediaSpend,
            discretionaryTotal: discretionary,
            outletCount: ethnicVendorSet.size,
            agencyTotal: entry.agencyTotal,
            pcardTotal: entry.pcardTotal,
            legalNoticeTotal,
          })
        }

        setTrend(points)
      })
      .catch(() => {
        // Trend is supplementary — don't fail the whole view
        if (!cancelled) setTrend([])
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false)
      })

    return () => { cancelled = true }
  }, [currentFY])

  return { trend, trendLoading }
}

// ── Main hook ──────────────────────────────────────────────

export function useComplianceData(adData: AdvertisingData, fiscalYear?: FiscalYear): ComplianceData {
  const currentFY = fiscalYear || getCurrentFiscalYear()

  // Compliance uses ONLY the tagged layer (sub_object = 'Advertising') — not
  // agency registry or P-card. Agency spend is opaque (may or may not reach
  // ethnic media), and P-card is untraceable. Only tagged advertising spend
  // is defensible as the "discretionary advertising" denominator.
  const taggedVendors = useMemo(
    () => adData.vendors.filter((v) => v.layer === 'tagged'),
    [adData.vendors]
  )

  const singleFY = useMemo(() => computeFromVendors(taggedVendors), [taggedVendors])

  // Per-department cards (also tagged-only)
  const departmentCards = useMemo((): DepartmentCard[] => {
    const deptMap = new Map<string, { ethnic: number; total: number; legalNotice: number; outlets: Set<string> }>()

    for (const v of taggedVendors) {
      const amt = parseFloat(v.total_paid) || 0
      const entry = deptMap.get(v.department) || { ethnic: 0, total: 0, legalNotice: 0, outlets: new Set<string>() }
      entry.total += amt

      if (v.category === 'legal-notices') {
        entry.legalNotice += amt
      } else if (v.category === 'community-ethnic-press') {
        entry.ethnic += amt
        entry.outlets.add(v.vendor)
      }

      deptMap.set(v.department, entry)
    }

    return [...deptMap.entries()]
      .map(([dept, { ethnic, total, legalNotice, outlets }]) => {
        const discretionary = total - legalNotice
        const pct = discretionary > 0 ? (ethnic / discretionary) * 100 : 0
        return {
          department: dept,
          ethnicMediaSpend: ethnic,
          discretionaryTotal: discretionary,
          compliancePct: pct,
          status: getComplianceStatus(pct, discretionary > 0),
          outletCount: outlets.size,
          trend: [], // populated after trend data loads
        }
      })
      .sort((a, b) => b.discretionaryTotal - a.discretionaryTotal)
  }, [adData.vendors])

  // Multi-FY trend
  const { trend, trendLoading } = useTrendData(currentFY)

  // Note: per-department sparklines would require N × FY Socrata queries.
  // The citywide trend chart below the report card serves this purpose instead.

  return {
    ...singleFY,
    departmentCards,
    trend,
    trendLoading,
    isLoading: adData.isLoading,
    error: adData.error,
  }
}
