/** Vendor search hook — searches vendor names, departments, sub_objects via Socrata LIKE */

import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'
import type { FiscalYear, VendorAggRow, DepartmentAggRow, SubObjectAggRow } from '@/types/budget'

export interface VendorSearchResults {
  vendors: VendorAggRow[]
  departments: DepartmentAggRow[]
  categories: SubObjectAggRow[]
  isLoading: boolean
  error: string | null
}

const DEBOUNCE_MS = 300

/** Debounced search across vendor payments for vendors, departments, and spending categories */
export function useVendorSearch(query: string, fiscalYear?: FiscalYear): VendorSearchResults {
  const [vendors, setVendors] = useState<VendorAggRow[]>([])
  const [departments, setDepartments] = useState<DepartmentAggRow[]>([])
  const [categories, setCategories] = useState<SubObjectAggRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!query || query.length < 2) {
      setVendors([])
      setDepartments([])
      setCategories([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      try {
        const escaped = query.replace(/'/g, "''")
        const likeTerm = `%${escaped.toUpperCase()}%`
        const fyClause = fiscalYear ? ` AND fiscal_year = '${fiscalYear}'` : ''

        // Search vendors — aggregate by vendor name
        const vendorPromise = fetchDataset<VendorAggRow>('vendorPayments', {
          $select: 'vendor, SUM(vouchers_paid) as total_paid, COUNT(*) as payment_count',
          $where: `UPPER(vendor) LIKE '${likeTerm}'${fyClause}`,
          $group: 'vendor',
          $order: 'total_paid DESC',
          $limit: 25,
        })

        // Search departments
        const deptPromise = fetchDataset<DepartmentAggRow>('vendorPayments', {
          $select: 'department, SUM(vouchers_paid) as total',
          $where: `UPPER(department) LIKE '${likeTerm}'${fyClause}`,
          $group: 'department',
          $order: 'total DESC',
          $limit: 15,
        })

        // Search sub_object categories
        const catPromise = fetchDataset<SubObjectAggRow>('vendorPayments', {
          $select: 'sub_object, SUM(vouchers_paid) as total, COUNT(*) as count',
          $where: `UPPER(sub_object) LIKE '${likeTerm}'${fyClause}`,
          $group: 'sub_object',
          $order: 'total DESC',
          $limit: 15,
        })

        const [vendorResult, deptResult, catResult] = await Promise.all([vendorPromise, deptPromise, catPromise])

        setVendors(vendorResult)
        setDepartments(deptResult)
        setCategories(catResult)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed')
      } finally {
        setIsLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query, fiscalYear])

  return { vendors, departments, categories, isLoading, error }
}

/** Top vendors by total spend — for concentration chart */
export function useTopVendors(fiscalYear?: FiscalYear, limit = 20) {
  const fyClause = fiscalYear ? `fiscal_year = '${fiscalYear}'` : undefined
  const { data, isLoading, error } = useVendorAgg(fyClause, limit)

  return { data, isLoading, error }
}

function useVendorAgg(where?: string, limit = 20) {
  // Use a raw useEffect + fetchDataset since useDataset doesn't support optional where well
  const [data, setData] = useState<VendorAggRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    fetchDataset<VendorAggRow>('vendorPayments', {
      $select: 'vendor, SUM(vouchers_paid) as total_paid, COUNT(*) as payment_count',
      $where: where,
      $group: 'vendor',
      $order: 'total_paid DESC',
      $limit: limit,
    })
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch vendors')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [where, limit])

  return { data, isLoading, error }
}
