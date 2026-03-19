import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import ExportButton from '@/components/export/ExportButton'
import { SkeletonChart, SkeletonSidebarRows } from '@/components/ui/Skeleton'
import { getCurrentFiscalYear, formatFiscalYear } from '@/utils/fiscalYear'
import type { FiscalYear } from '@/types/budget'

type BudgetTab = 'overview' | 'search' | 'advertising'

const TAB_LABELS: Record<BudgetTab, string> = {
  overview: 'Budget Overview',
  search: 'Vendor Search',
  advertising: 'Advertising & Media',
}

const ACCENT = '#0ea5e9'

export default function CityBudget() {
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab = (searchParams.get('tab') as BudgetTab) || 'overview'
  const fyParam = searchParams.get('fy')
  const fiscalYear: FiscalYear = fyParam ? parseInt(fyParam, 10) : getCurrentFiscalYear()

  const setActiveTab = useCallback(
    (tab: BudgetTab) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (tab === 'overview') next.delete('tab')
        else next.set('tab', tab)
        return next
      }, { replace: true })
    },
    [setSearchParams]
  )

  const setFiscalYear = useCallback(
    (fy: FiscalYear) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (fy === getCurrentFiscalYear()) next.delete('fy')
        else next.set('fy', String(fy))
        return next
      }, { replace: true })
    },
    [setSearchParams]
  )

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-slate-200/50 dark:border-white/[0.04] bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-xl italic text-ink dark:text-white tracking-tight">
            City Budget
          </h1>

          {/* Tab switcher */}
          <div className="flex gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
            {(Object.keys(TAB_LABELS) as BudgetTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200
                  ${activeTab === tab
                    ? 'bg-white dark:bg-white/10 text-ink dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-ink dark:hover:text-white'
                  }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Fiscal year picker */}
          <select
            value={fiscalYear}
            onChange={(e) => setFiscalYear(parseInt(e.target.value, 10))}
            className="text-xs font-mono bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200/50 dark:border-white/[0.06] rounded-md px-2 py-1.5 text-ink dark:text-white"
          >
            {Array.from({ length: getCurrentFiscalYear() - 2009 }, (_, i) => getCurrentFiscalYear() - i).map((fy) => (
              <option key={fy} value={fy}>
                {formatFiscalYear(fy)}
              </option>
            ))}
          </select>

          <ExportButton />
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && <OverviewPlaceholder fiscalYear={fiscalYear} />}
        {activeTab === 'search' && <SearchPlaceholder />}
        {activeTab === 'advertising' && <AdvertisingPlaceholder />}
      </div>
    </div>
  )
}

/** Placeholder for Overview tab — will be populated in Chunk 2 */
function OverviewPlaceholder({ fiscalYear }: { fiscalYear: FiscalYear }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
        {formatFiscalYear(fiscalYear)} · Overview
      </p>
      <div className="grid grid-cols-2 gap-4">
        <SkeletonChart height={200} />
        <SkeletonChart height={200} />
      </div>
      <SkeletonSidebarRows count={6} />
    </div>
  )
}

/** Placeholder for Search tab — will be populated in Chunk 3 */
function SearchPlaceholder() {
  return (
    <div className="space-y-6">
      <div className="glass-card rounded-xl p-4">
        <div className="h-10 rounded-lg bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200/50 dark:border-white/[0.06]" />
      </div>
      <SkeletonSidebarRows count={8} />
    </div>
  )
}

/** Placeholder for Advertising tab — will be populated in Chunk 4 */
function AdvertisingPlaceholder() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
        Advertising & Media Tracker
      </p>
      <SkeletonChart height={200} />
      <SkeletonSidebarRows count={6} />
    </div>
  )
}
