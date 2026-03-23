/** Advertising data hook — three-layer detection: tagged + agency + P-card */

import { useState, useEffect, useMemo } from 'react'
import { fetchDataset } from '@/api/client'
import { classifyVendor, type MediaCategory } from '@/utils/mediaClassification'
import type { FiscalYear } from '@/types/budget'

export interface AdVendorRow {
  vendor: string
  department: string
  total_paid: string
  payment_count: string
  layer: 'tagged' | 'agency' | 'pcard'
  category: MediaCategory
}

export interface AdDepartmentRow {
  department: string
  total: number
  pcard_total: number
  transparency_pct: number
}

export interface AdTrendRow {
  fiscal_year: string
  total: string
  layer: 'tagged' | 'agency' | 'pcard'
}

interface RawVendorAgg {
  vendor: string
  department: string
  total_paid: string
  payment_count: string
}

export interface AdvertisingData {
  vendors: AdVendorRow[]
  departments: AdDepartmentRow[]
  totalAdSpend: number
  totalPcardSpend: number
  topDepartment: string
  isLoading: boolean
  error: string | null
}

/** Fetch advertising data with three-layer detection */
export function useAdvertisingData(fiscalYear?: FiscalYear): AdvertisingData {
  const [vendors, setVendors] = useState<AdVendorRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    const fyClause = fiscalYear ? ` AND fiscal_year = '${fiscalYear}'` : ''

    // Layer 1: Tagged advertising (sub_object = 'Advertising')
    const taggedPromise = fetchDataset<RawVendorAgg>('vendorPayments', {
      $select: 'vendor, department, SUM(vouchers_paid) as total_paid, COUNT(*) as payment_count',
      $where: `sub_object = 'Advertising'${fyClause}`,
      $group: 'vendor, department',
      $order: 'total_paid DESC',
      $limit: 2000, // vendor × department pairs — 500 was truncating smaller vendors
    })

    // Layer 2: Known agency vendors (even if not tagged as Advertising)
    // These are matched by classifyVendor — fetch top vendors matching agency patterns
    const agencyPromise = fetchDataset<RawVendorAgg>('vendorPayments', {
      $select: 'vendor, department, SUM(vouchers_paid) as total_paid, COUNT(*) as payment_count',
      $where: `(UPPER(vendor) LIKE '%ZEBA CONSULTING%' OR UPPER(vendor) LIKE '%MOST LIKELY TO%' OR UPPER(vendor) LIKE '%CKR INTERACTIVE%' OR UPPER(vendor) LIKE '%O''RORKE%' OR UPPER(vendor) LIKE '%GREAT KOLOR%' OR UPPER(vendor) LIKE '%CIVIC EDGE%' OR UPPER(vendor) LIKE '%BETTER WORLD ADVERTISING%' OR UPPER(vendor) LIKE '%PROMOTION MARKETING%') AND sub_object != 'Advertising'${fyClause}`,
      $group: 'vendor, department',
      $order: 'total_paid DESC',
      $limit: 100,
    })

    // Layer 3: P-card advertising (vendor contains P-CARD + sub_object = Advertising)
    const pcardPromise = fetchDataset<RawVendorAgg>('vendorPayments', {
      $select: 'vendor, department, SUM(vouchers_paid) as total_paid, COUNT(*) as payment_count',
      $where: `UPPER(vendor) LIKE '%P-CARD%' AND sub_object = 'Advertising'${fyClause}`,
      $group: 'vendor, department',
      $order: 'total_paid DESC',
      $limit: 100,
    })

    Promise.all([taggedPromise, agencyPromise, pcardPromise])
      .then(([tagged, agency, pcard]) => {
        if (cancelled) return

        const all: AdVendorRow[] = []
        const seen = new Set<string>()

        // P-card layer first (they're in tagged too, deduplicate)
        for (const r of pcard) {
          const key = `${r.vendor}|${r.department}`
          if (!seen.has(key)) {
            seen.add(key)
            all.push({ ...r, layer: 'pcard', category: 'p-card' })
          }
        }

        // Tagged layer (minus P-card duplicates)
        for (const r of tagged) {
          const key = `${r.vendor}|${r.department}`
          if (!seen.has(key)) {
            seen.add(key)
            all.push({ ...r, layer: 'tagged', category: classifyVendor(r.vendor) })
          }
        }

        // Agency layer (non-advertising tagged)
        for (const r of agency) {
          const key = `${r.vendor}|${r.department}`
          if (!seen.has(key)) {
            seen.add(key)
            all.push({ ...r, layer: 'agency', category: classifyVendor(r.vendor) })
          }
        }

        setVendors(all)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch advertising data')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [fiscalYear])

  // Compute department summaries
  const departments = useMemo((): AdDepartmentRow[] => {
    const deptMap = new Map<string, { total: number; pcard: number }>()
    for (const v of vendors) {
      const amt = parseFloat(v.total_paid) || 0
      const entry = deptMap.get(v.department) || { total: 0, pcard: 0 }
      entry.total += amt
      if (v.layer === 'pcard') entry.pcard += amt
      deptMap.set(v.department, entry)
    }
    return [...deptMap.entries()]
      .map(([dept, { total, pcard }]) => ({
        department: dept,
        total,
        pcard_total: pcard,
        transparency_pct: total > 0 ? ((total - pcard) / total) * 100 : 100,
      }))
      .sort((a, b) => b.total - a.total)
  }, [vendors])

  const totalAdSpend = useMemo(
    () => vendors.reduce((sum, v) => sum + (parseFloat(v.total_paid) || 0), 0),
    [vendors]
  )

  const totalPcardSpend = useMemo(
    () => vendors.filter((v) => v.layer === 'pcard').reduce((sum, v) => sum + (parseFloat(v.total_paid) || 0), 0),
    [vendors]
  )

  const topDepartment = departments[0]?.department || '—'

  return { vendors, departments, totalAdSpend, totalPcardSpend, topDepartment, isLoading, error }
}
