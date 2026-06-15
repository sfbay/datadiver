/** Vendor detail panel — payment history, department breakdown, contract cross-ref */

import { useState, useEffect, useMemo } from 'react'
import DetailPanelShell from '@/components/ui/DetailPanelShell'
import { fetchDataset } from '@/api/client'
import { formatBudgetAmount, formatBudgetFull } from '@/utils/fiscalYear'
import { toSentenceCase } from '@/utils/format'
import type { VendorDepartmentRow } from '@/types/budget'

interface VendorDetailPanelProps {
  vendor: string | null
  onClose: () => void
  /** Render as inline content instead of a slide-in overlay */
  inline?: boolean
}

interface VendorYearRow {
  fiscal_year: string
  total_paid: string
  payment_count: string
}

interface VendorContractRow {
  contract_number: string
  contract_title: string
  department: string
  total_paid: string
}

export default function VendorDetailPanel({ vendor, onClose, inline }: VendorDetailPanelProps) {
  const [yearData, setYearData] = useState<VendorYearRow[]>([])
  const [deptData, setDeptData] = useState<VendorDepartmentRow[]>([])
  const [contractData, setContractData] = useState<VendorContractRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonProfit, setNonProfit] = useState(false)

  useEffect(() => {
    if (!vendor) return
    setIsLoading(true)
    setError(null)
    const escaped = vendor.replace(/'/g, "''")

    Promise.all([
      // Payment history by fiscal year
      fetchDataset<VendorYearRow>('vendorPayments', {
        $select: 'fiscal_year, SUM(vouchers_paid) as total_paid, COUNT(*) as payment_count',
        $where: `vendor = '${escaped}'`,
        $group: 'fiscal_year',
        $order: 'fiscal_year DESC',
        $limit: 50,
      }),
      // Department breakdown
      fetchDataset<VendorDepartmentRow>('vendorPayments', {
        $select: 'department, SUM(vouchers_paid) as total_paid',
        $where: `vendor = '${escaped}'`,
        $group: 'department',
        $order: 'total_paid DESC',
        $limit: 20,
      }),
      // Contract cross-reference
      fetchDataset<VendorContractRow>('vendorPayments', {
        $select: 'contract_number, contract_title, department, SUM(vouchers_paid) as total_paid',
        $where: `vendor = '${escaped}' AND contract_number IS NOT NULL AND contract_number != ''`,
        $group: 'contract_number, contract_title, department',
        $order: 'total_paid DESC',
        $limit: 10,
      }),
      // Check nonprofit status
      fetchDataset<{ non_profit_indicator: string }>('vendorPayments', {
        $select: 'non_profit_indicator',
        $where: `vendor = '${escaped}' AND non_profit_indicator = 'Y'`,
        $limit: 1,
      }),
    ]).then(([years, depts, contracts, npCheck]) => {
      setYearData(years)
      setDeptData(depts)
      setContractData(contracts)
      setNonProfit(npCheck.length > 0)
      setIsLoading(false)
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load vendor details')
      setIsLoading(false)
    })
  }, [vendor])

  const totalPaid = useMemo(
    () => yearData.reduce((sum, r) => sum + (parseFloat(r.total_paid) || 0), 0),
    [yearData]
  )

  const maxDeptTotal = useMemo(
    () => Math.max(...deptData.map((r) => parseFloat(r.total_paid) || 0), 1),
    [deptData]
  )

  const content = (
    <>
      {vendor && error && (
        <div className="py-4">
          <p className="text-sm font-medium text-brick-400 mb-1">Failed to load</p>
          <p className="text-xs text-slate-400">{error}</p>
        </div>
      )}
      {vendor && !error && (
        <div className="space-y-4">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-ink dark:text-white pr-8 leading-tight">
                {toSentenceCase(vendor ?? '')}
              </h3>
              {nonProfit && (
                <span className="inline-flex items-center text-[9px] font-mono bg-moss-500/10 text-moss-500 px-1.5 py-0.5 rounded-full">
                  Nonprofit
                </span>
              )}
            </div>
            <p className="text-[10px] font-mono text-slate-400 mt-0.5">
              {formatBudgetFull(totalPaid)} total · {yearData.length} fiscal years
            </p>
          </div>

          {/* Payment history by year */}
          {yearData.length > 0 && (
            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                Payment History
              </p>
              <div className="space-y-1">
                {yearData.map((r) => (
                  <div key={r.fiscal_year} className="flex items-center justify-between text-[10px]">
                    <span className="font-mono text-slate-500">FY{r.fiscal_year}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{r.payment_count} pmts</span>
                      <span className="font-mono text-ink dark:text-white tabular-nums">
                        {formatBudgetAmount(parseFloat(r.total_paid) || 0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Department breakdown */}
          {deptData.length > 0 && (
            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                Departments
              </p>
              <div className="space-y-1.5">
                {deptData.map((r) => {
                  const amount = parseFloat(r.total_paid) || 0
                  return (
                    <div key={r.department}>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-slate-600 dark:text-slate-300 truncate max-w-[180px]">{r.department}</span>
                        <span className="font-mono text-slate-500 tabular-nums ml-2">{formatBudgetAmount(amount)}</span>
                      </div>
                      <div className="h-1 bg-slate-100 dark:bg-white/[0.04] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-teal-500/60"
                          style={{ width: `${(amount / maxDeptTotal) * 100}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Contract cross-reference */}
          {contractData.length > 0 && (
            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                Contracts
              </p>
              <div className="space-y-2">
                {contractData.map((r) => (
                  <div key={r.contract_number} className="glass-card rounded-lg p-2">
                    <p className="text-[10px] font-mono text-teal-500">{r.contract_number}</p>
                    {r.contract_title && (
                      <p className="text-[10px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
                        {r.contract_title}
                      </p>
                    )}
                    <p className="text-[9px] text-slate-400 mt-0.5">
                      {r.department} · {formatBudgetAmount(parseFloat(r.total_paid) || 0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )

  if (inline) {
    if (!vendor) return null
    return (
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60">Vendor Detail</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors" title="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <span className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : content}
      </div>
    )
  }

  return (
    <DetailPanelShell
      open={vendor !== null}
      onClose={onClose}
      isLoading={isLoading}
      spinnerClass="border-teal-400"
      widthClass="w-80"
      mobileCompact
    >
      {content}
    </DetailPanelShell>
  )
}
