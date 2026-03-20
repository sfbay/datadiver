import { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import ExportButton from '@/components/export/ExportButton'
import { Skeleton, SkeletonChart, SkeletonSidebarRows } from '@/components/ui/Skeleton'
import StatCard from '@/components/ui/StatCard'
import CardTray, { type CardDef } from '@/components/ui/CardTray'
import DepartmentBars from '@/components/charts/DepartmentBars'
import SpendingTrend from '@/components/charts/SpendingTrend'
import VendorDetailPanel from '@/components/ui/VendorDetailPanel'
import HorizontalBarChart, { type BarDatum } from '@/components/charts/HorizontalBarChart'
import { useBudgetVsActual, useBudgetTotals, useSpendingTrend, useDepartmentSpending } from '@/hooks/useBudgetData'
import { useVendorSearch, useTopVendors } from '@/hooks/useVendorSearch'
import { useAdvertisingData } from '@/hooks/useAdvertisingData'
import { MEDIA_CATEGORIES, type MediaCategory } from '@/utils/mediaClassification'
import { exportToCSV } from '@/utils/csvExport'
import { getCurrentFiscalYear, formatFiscalYear, formatBudgetAmount, formatBudgetFull } from '@/utils/fiscalYear'
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
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-slate-200/50 dark:border-white/[0.04] bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-10">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none tracking-tight">
              City Budget
            </h1>
            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
              SF Controller · {formatFiscalYear(fiscalYear)}
            </p>
          </div>

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

          <ExportButton targetSelector="#budget-capture" filename="city-budget" />
        </div>
      </header>

      {/* Tab content */}
      <div id="budget-capture" className="flex-1 overflow-hidden">
        {activeTab === 'overview' && <BudgetOverview fiscalYear={fiscalYear} />}
        {activeTab === 'search' && <VendorSearchTab fiscalYear={fiscalYear} />}
        {activeTab === 'advertising' && <AdvertisingTab fiscalYear={fiscalYear} />}
      </div>
    </div>
  )
}

// ── Budget Overview Tab ─────────────────────────────────────

function BudgetOverview({ fiscalYear }: { fiscalYear: FiscalYear }) {
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null)
  const [trendMode, setTrendMode] = useState<'absolute' | 'percent'>('absolute')

  const totals = useBudgetTotals(fiscalYear)
  const bva = useBudgetVsActual(fiscalYear)
  const trend = useSpendingTrend(undefined, undefined)
  const deptSpending = useDepartmentSpending(fiscalYear)

  // Find largest department
  const largestDept = useMemo(() => {
    if (bva.data.length === 0) return '—'
    return bva.data[0].department
  }, [bva.data])

  // Build card definitions
  const cards = useMemo((): CardDef[] => {
    if (totals.isLoading) return []
    return [
      {
        id: 'total-budget',
        label: 'Total Budget',
        shortLabel: 'Budget',
        value: formatBudgetAmount(totals.budget),
        color: ACCENT,
        defaultExpanded: true,
        info: 'budget-total',
      },
      {
        id: 'total-spending',
        label: 'Total Spending',
        shortLabel: 'Spending',
        value: formatBudgetAmount(totals.spending),
        color: '#a78bfa',
        subtitle: `${totals.spendingPct.toFixed(1)}% of budget`,
        defaultExpanded: true,
      },
      {
        id: 'largest-dept',
        label: 'Largest Department',
        shortLabel: 'Top Dept',
        value: largestDept.length > 20 ? largestDept.slice(0, 19) + '…' : largestDept,
        color: '#f59e0b',
        defaultExpanded: true,
      },
      {
        id: 'yoy-growth',
        label: 'YoY Spending Growth',
        shortLabel: 'YoY',
        value: `${totals.yoyGrowth >= 0 ? '+' : ''}${totals.yoyGrowth.toFixed(1)}%`,
        color: totals.yoyGrowth > 0 ? '#ef4444' : '#22c55e',
        trend: totals.yoyGrowth > 0 ? 'up' : totals.yoyGrowth < 0 ? 'down' : 'neutral',
        yoyDelta: totals.yoyGrowth,
        defaultExpanded: true,
      },
    ]
  }, [totals, largestDept])

  const handleSelectDepartment = useCallback((dept: string) => {
    setSelectedDepartment((prev) => (prev === dept ? null : dept))
  }, [])

  // Department sidebar list
  const deptList = useMemo(() => {
    if (deptSpending.data.length === 0) return []
    const maxVal = parseFloat(deptSpending.data[0]?.total) || 1
    return deptSpending.data.map((r) => ({
      name: r.department,
      amount: parseFloat(r.total) || 0,
      pct: ((parseFloat(r.total) || 0) / maxVal) * 100,
    }))
  }, [deptSpending.data])

  return (
    <div className="h-full flex overflow-hidden">
      {/* Main chart area */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Loading state */}
        {totals.isLoading && (
          <div className="max-w-4xl space-y-6">
            <div className="flex gap-2.5 flex-wrap">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="glass-card rounded-xl px-4 py-3 min-w-[140px] animate-pulse" style={{ animationDelay: `${i * 60}ms` }}>
                  <Skeleton className="h-2.5 w-16 mb-3" />
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
            <SkeletonChart height={300} />
          </div>
        )}

        {/* Error state */}
        {totals.error && (
          <div className="flex items-center justify-center py-16">
            <div className="glass-card rounded-xl p-6 max-w-sm">
              <p className="text-sm font-medium text-red-400 mb-1">Data Error</p>
              <p className="text-xs text-slate-400">{totals.error}</p>
            </div>
          </div>
        )}

        {/* Main content */}
        {!totals.isLoading && !totals.error && (
          <div className="max-w-4xl space-y-6">
            {/* Stat cards — inline for chart-centric view (not absolute overlay) */}
            <div className="flex flex-wrap gap-2.5">
              {cards.map((card) => (
                <div key={card.id} className="glass-card rounded-xl px-4 py-3 min-w-[120px]">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1.5 whitespace-nowrap">
                    {card.label}
                  </p>
                  <p className="text-2xl font-bold font-mono tracking-tight leading-none" style={{ color: card.color }}>
                    {card.value}
                  </p>
                  {card.subtitle && (
                    <p className="text-[10px] font-mono text-slate-400 mt-1">{card.subtitle}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Department breakdown chart */}
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-500">
                  Department Spending vs Budget
                </p>
                {selectedDepartment && (
                  <button
                    onClick={() => setSelectedDepartment(null)}
                    className="text-[10px] font-mono text-slate-400 hover:text-ink dark:hover:text-white transition-colors"
                  >
                    ← All departments
                  </button>
                )}
              </div>
              {bva.isLoading ? (
                <SkeletonChart height={400} />
              ) : (
                <DepartmentBars
                  data={bva.data}
                  width={700}
                  height={Math.min(bva.data.length * 23 + 20, 600)}
                  maxBars={20}
                  onSelectDepartment={handleSelectDepartment}
                  selectedDepartment={selectedDepartment}
                />
              )}
            </div>

            {/* Spending trends chart */}
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-500">
                  Spending Trends (FY2000–Present)
                </p>
                <div className="flex gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-md p-0.5">
                  {(['absolute', 'percent'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setTrendMode(m)}
                      className={`px-2 py-0.5 text-[10px] font-mono rounded transition-all
                        ${trendMode === m
                          ? 'bg-white dark:bg-white/10 text-ink dark:text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                        }`}
                    >
                      {m === 'absolute' ? '$' : '%'}
                    </button>
                  ))}
                </div>
              </div>
              {trend.isLoading ? (
                <SkeletonChart height={250} />
              ) : (
                <SpendingTrend
                  data={trend.data}
                  width={700}
                  height={300}
                  topN={8}
                  highlightDepartment={selectedDepartment}
                  mode={trendMode}
                />
              )}
            </div>

            {/* Source attribution */}
            <p className="text-[9px] font-mono text-slate-400/60 dark:text-slate-600">
              Source: SF Controller — Budget ({' '}
              <span className="tabular-nums">xdgd-c79v</span>) · Spending & Revenue ({' '}
              <span className="tabular-nums">bpnb-jwfb</span>) · data.sfgov.org
            </p>
          </div>
        )}
      </div>

      {/* Right sidebar — department list */}
      <aside className="w-72 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] bg-white/30 dark:bg-slate-900/30 overflow-y-auto">
        <div className="p-4">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-500 mb-3">
            Departments by Spending
          </p>

          {deptSpending.isLoading ? (
            <SkeletonSidebarRows count={12} />
          ) : (
            <div className="space-y-0.5">
              {deptList.map((dept) => (
                <button
                  key={dept.name}
                  onClick={() => handleSelectDepartment(dept.name)}
                  className={`w-full text-left px-2 py-1.5 rounded-md transition-all duration-150 group
                    ${selectedDepartment === dept.name
                      ? 'bg-sky-500/10 dark:bg-sky-400/10'
                      : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                    }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-[10px] truncate max-w-[160px] ${
                      selectedDepartment === dept.name
                        ? 'text-sky-600 dark:text-sky-400 font-medium'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}>
                      {dept.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500 tabular-nums ml-2">
                      {formatBudgetAmount(dept.amount)}
                    </span>
                  </div>
                  <div className="h-1 bg-slate-100 dark:bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${dept.pct}%`,
                        backgroundColor: selectedDepartment === dept.name ? ACCENT : `${ACCENT}60`,
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

// ── Vendor Search Tab ───────────────────────────────────────

function VendorSearchTab({ fiscalYear }: { fiscalYear: FiscalYear }) {
  const [query, setQuery] = useState('')
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null)
  const search = useVendorSearch(query, fiscalYear)
  const topVendors = useTopVendors(fiscalYear, 20)

  const hasResults = search.vendors.length > 0 || search.departments.length > 0 || search.categories.length > 0
  const showSearch = query.length >= 2

  // Concentration chart data
  const concentrationBars = useMemo((): BarDatum[] => {
    return topVendors.data.map((v) => ({
      label: v.vendor,
      value: parseFloat(v.total_paid) || 0,
      color: ACCENT,
    }))
  }, [topVendors.data])

  const totalTopSpend = useMemo(
    () => topVendors.data.reduce((sum, v) => sum + (parseFloat(v.total_paid) || 0), 0),
    [topVendors.data]
  )

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Search input — always full width at top */}
      <div className="flex-shrink-0 p-6 pb-0">
        <div className="glass-card rounded-xl p-4 max-w-4xl">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vendors, departments, spending categories…"
            className="w-full h-10 rounded-lg bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200/50 dark:border-white/[0.06] px-4 text-sm text-ink dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/50 transition-all font-mono"
          />
          {search.isLoading && (
            <p className="text-[10px] font-mono text-slate-400 mt-2">Searching…</p>
          )}
        </div>
      </div>

      {/* Two-column layout: results left, detail right */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`overflow-y-auto p-6 pt-4 transition-all duration-300 ${selectedVendor ? 'w-1/2 flex-shrink-0' : 'flex-1'}`}>
          <div className={selectedVendor ? '' : 'max-w-4xl'}>
            <div className="space-y-6">

          {/* Search results */}
          {showSearch && hasResults && (
            <div className="space-y-4">
              {/* Vendor results */}
              {search.vendors.length > 0 && (
                <div>
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                    Vendors ({search.vendors.length})
                  </p>
                  <div className="space-y-1">
                    {search.vendors.map((v) => (
                      <button
                        key={v.vendor}
                        onClick={() => setSelectedVendor(v.vendor)}
                        className="w-full text-left glass-card rounded-lg p-3 hover:bg-white/60 dark:hover:bg-white/[0.04] transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-ink dark:text-white font-medium truncate max-w-[400px]">
                            {v.vendor}
                          </span>
                          <span className="text-sm font-mono text-sky-500 tabular-nums">
                            {formatBudgetAmount(parseFloat(v.total_paid) || 0)}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {v.payment_count} payments
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Department results */}
              {search.departments.length > 0 && (
                <div>
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                    Departments ({search.departments.length})
                  </p>
                  <div className="space-y-1">
                    {search.departments.map((d) => (
                      <div key={d.department} className="glass-card rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-ink dark:text-white">{d.department}</span>
                          <span className="text-sm font-mono text-violet-400 tabular-nums">
                            {formatBudgetAmount(parseFloat(d.total) || 0)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Category results */}
              {search.categories.length > 0 && (
                <div>
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                    Spending Categories ({search.categories.length})
                  </p>
                  <div className="space-y-1">
                    {search.categories.map((c) => (
                      <div key={c.sub_object} className="glass-card rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-ink dark:text-white">{c.sub_object}</span>
                          <span className="text-sm font-mono text-amber-400 tabular-nums">
                            {formatBudgetAmount(parseFloat(c.total) || 0)}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">{c.count} vouchers</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No results */}
          {showSearch && !hasResults && !search.isLoading && (
            <p className="text-sm text-slate-400 text-center py-8 font-mono">
              No results for "{query}"
            </p>
          )}

          {/* Default: vendor concentration chart */}
          {!showSearch && (
            <div className="space-y-6">
              <div className="glass-card rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60">
                    Top 20 Vendors by Total Spend
                  </p>
                  {totalTopSpend > 0 && (
                    <span className="text-[10px] font-mono text-slate-400">
                      {formatBudgetFull(totalTopSpend)} total
                    </span>
                  )}
                </div>
                {topVendors.isLoading ? (
                  <SkeletonChart height={400} />
                ) : (
                  <HorizontalBarChart
                    data={concentrationBars}
                    width={600}
                    height={Math.min(concentrationBars.length * 22 + 10, 500)}
                    maxBars={20}
                    valueFormatter={(v) => formatBudgetAmount(v)}
                  />
                )}
              </div>

              {/* Source attribution */}
              <p className="text-[9px] font-mono text-slate-400/60 dark:text-slate-600">
                Source: SF Controller — Vendor Payments ({' '}
                <span className="tabular-nums">n9pm-xkyq</span>) · data.sfgov.org
              </p>
            </div>
          )}
          </div>
          </div>
        </div>

        {/* Vendor detail — right column when a vendor is selected */}
        {selectedVendor && (
          <div className="w-1/2 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] overflow-y-auto">
            <VendorDetailPanel vendor={selectedVendor} onClose={() => setSelectedVendor(null)} inline />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Advertising & Media Tracker Tab ─────────────────────────

function AdvertisingTab({ fiscalYear }: { fiscalYear: FiscalYear }) {
  const ad = useAdvertisingData(fiscalYear)

  // Media mix: aggregate by category
  const mediaMix = useMemo(() => {
    const catMap = new Map<MediaCategory, number>()
    for (const v of ad.vendors) {
      const amt = parseFloat(v.total_paid) || 0
      catMap.set(v.category, (catMap.get(v.category) || 0) + amt)
    }
    return [...catMap.entries()]
      .map(([cat, total]) => ({
        category: cat,
        total,
        label: MEDIA_CATEGORIES[cat].label,
        color: MEDIA_CATEGORIES[cat].color,
      }))
      .sort((a, b) => b.total - a.total)
  }, [ad.vendors])

  // Vendor breakdown bars
  const vendorBars = useMemo((): BarDatum[] => {
    // Aggregate by vendor (across departments)
    const vendorMap = new Map<string, { total: number; category: MediaCategory }>()
    for (const v of ad.vendors) {
      const amt = parseFloat(v.total_paid) || 0
      const entry = vendorMap.get(v.vendor) || { total: 0, category: v.category }
      entry.total += amt
      vendorMap.set(v.vendor, entry)
    }
    return [...vendorMap.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 20)
      .map(([name, { total, category }]) => ({
        label: name,
        value: total,
        color: MEDIA_CATEGORIES[category].color,
      }))
  }, [ad.vendors])

  // Cards
  const cards = useMemo((): CardDef[] => {
    if (ad.isLoading) return []
    return [
      {
        id: 'total-ad-spend',
        label: 'Total Ad Spend',
        shortLabel: 'Ad Total',
        value: formatBudgetAmount(ad.totalAdSpend),
        color: ACCENT,
        defaultExpanded: true,
      },
      {
        id: 'top-ad-dept',
        label: 'Top Ad Department',
        shortLabel: 'Top Dept',
        value: ad.topDepartment.length > 18 ? ad.topDepartment.slice(0, 17) + '…' : ad.topDepartment,
        color: '#a78bfa',
        defaultExpanded: true,
      },
      {
        id: 'pcard-spend',
        label: 'P-Card Ad Spend',
        shortLabel: 'P-Card',
        value: formatBudgetAmount(ad.totalPcardSpend),
        color: '#ef4444',
        subtitle: ad.totalAdSpend > 0
          ? `${((ad.totalPcardSpend / ad.totalAdSpend) * 100).toFixed(1)}% of ad spend`
          : undefined,
        defaultExpanded: true,
      },
      {
        id: 'vendor-count',
        label: 'Ad Vendors',
        shortLabel: 'Vendors',
        value: String(new Set(ad.vendors.map((v) => v.vendor)).size),
        color: '#f59e0b',
        defaultExpanded: true,
      },
    ]
  }, [ad])

  const maxPcardTotal = useMemo(
    () => Math.max(...ad.departments.map((d) => d.pcard_total), 1),
    [ad.departments]
  )

  const handleExportCSV = useCallback(() => {
    const rows = ad.vendors.map((v) => ({
      vendor: v.vendor,
      department: v.department,
      total_paid: v.total_paid,
      payments: v.payment_count,
      detection_layer: v.layer,
      media_category: MEDIA_CATEGORIES[v.category].label,
    }))
    exportToCSV(rows, `sf-advertising-${fiscalYear ? `fy${fiscalYear}` : 'all'}`)
  }, [ad.vendors, fiscalYear])

  return (
    <div className="h-full flex overflow-hidden">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Loading */}
        {ad.isLoading && (
          <div className="max-w-4xl space-y-6">
            <div className="flex gap-2.5 flex-wrap">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="glass-card rounded-xl px-4 py-3 min-w-[140px] animate-pulse" style={{ animationDelay: `${i * 60}ms` }}>
                  <Skeleton className="h-2.5 w-16 mb-3" />
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
            <SkeletonChart height={300} />
          </div>
        )}

        {/* Error */}
        {ad.error && (
          <div className="flex items-center justify-center py-16">
            <div className="glass-card rounded-xl p-6 max-w-sm">
              <p className="text-sm font-medium text-red-400 mb-1">Data Error</p>
              <p className="text-xs text-slate-400">{ad.error}</p>
            </div>
          </div>
        )}

        {/* Content */}
        {!ad.isLoading && !ad.error && (
          <div className="max-w-4xl space-y-6">
            {/* Cards + CSV button */}
            <div className="flex items-start justify-between">
              <div className="flex flex-wrap gap-2.5">
                {cards.map((card) => (
                  <div key={card.id} className="glass-card rounded-xl px-4 py-3 min-w-[120px]">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1.5 whitespace-nowrap">
                      {card.label}
                    </p>
                    <p className="text-2xl font-bold font-mono tracking-tight leading-none" style={{ color: card.color }}>
                      {card.value}
                    </p>
                    {card.subtitle && (
                      <p className="text-[10px] font-mono text-slate-400 mt-1">{card.subtitle}</p>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={handleExportCSV}
                className="flex-shrink-0 ml-4 mt-1 flex items-center gap-1.5 text-[10px] font-mono text-slate-400 hover:text-ink dark:hover:text-white bg-slate-100/80 dark:bg-white/[0.04] rounded-md px-2.5 py-1.5 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M6 1v7M3 5l3 3 3-3M2 10h8" />
                </svg>
                CSV
              </button>
            </div>

            {/* Media mix breakdown */}
            <div className="glass-card rounded-xl p-4">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-3">
                Media Mix
              </p>
              <div className="space-y-2">
                {mediaMix.map((m) => (
                  <div key={m.category}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: m.color }} />
                        <span className="text-[10px] text-slate-600 dark:text-slate-300">{m.label}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                        {formatBudgetAmount(m.total)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-white/[0.04] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${ad.totalAdSpend > 0 ? (m.total / ad.totalAdSpend) * 100 : 0}%`,
                          backgroundColor: m.color,
                          opacity: 0.7,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top ad vendors */}
            <div className="glass-card rounded-xl p-4">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-3">
                Top Advertising Vendors (color = media category)
              </p>
              <HorizontalBarChart
                data={vendorBars}
                width={700}
                height={Math.min(vendorBars.length * 22 + 10, 550)}
                maxBars={25}
                labelWidth={200}
                capPercentile={85}
                valueFormatter={(v) => formatBudgetAmount(v)}
              />
            </div>

            {/* P-card transparency callout */}
            <div className="glass-card rounded-xl p-4 border border-red-500/20">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <p className="text-xs font-semibold text-red-400">P-Card Transparency</p>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                These purchases are made via procurement cards (US Bank) and do not identify the specific platform or media outlet.
                They may include Facebook/Instagram boosts, Google Ads, and other digital advertising that is nearly invisible in city financial data.
              </p>
              {/* Department P-card breakdown */}
              <div className="space-y-1.5">
                {ad.departments
                  .filter((d) => d.pcard_total > 0)
                  .map((d) => (
                    <div key={d.department}>
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span className="text-slate-600 dark:text-slate-300 truncate max-w-[300px]">{d.department}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-red-400 tabular-nums">{formatBudgetAmount(d.pcard_total)}</span>
                          <span className="font-mono text-slate-400 tabular-nums">
                            ({(100 - d.transparency_pct).toFixed(0)}% opaque)
                          </span>
                        </div>
                      </div>
                      <div className="h-1 bg-slate-100 dark:bg-white/[0.04] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-red-500/60"
                          style={{ width: `${(d.pcard_total / maxPcardTotal) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Source attribution */}
            <p className="text-[9px] font-mono text-slate-400/60 dark:text-slate-600">
              Source: SF Controller — Vendor Payments ({' '}
              <span className="tabular-nums">n9pm-xkyq</span>) · Three-layer detection:
              sub_object tagging + agency registry + P-card flagging · data.sfgov.org
            </p>
          </div>
        )}
      </div>

      {/* Right sidebar — departments by ad spend */}
      <aside className="w-72 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] bg-white/30 dark:bg-slate-900/30 overflow-y-auto">
        <div className="p-4">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-500 mb-3">
            Departments by Ad Spend
          </p>

          {ad.isLoading ? (
            <SkeletonSidebarRows count={10} />
          ) : (
            <div className="space-y-0.5">
              {ad.departments.map((dept) => (
                <div key={dept.department} className="px-2 py-1.5 rounded-md">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-slate-600 dark:text-slate-400 truncate max-w-[140px]">
                      {dept.department}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 tabular-nums ml-2">
                      {formatBudgetAmount(dept.total)}
                    </span>
                  </div>
                  <div className="h-1 bg-slate-100 dark:bg-white/[0.04] rounded-full overflow-hidden flex">
                    {/* Transparent portion */}
                    <div
                      className="h-full bg-sky-500/50"
                      style={{ width: `${dept.transparency_pct * (ad.departments[0]?.total ? dept.total / ad.departments[0].total : 0)}%` }}
                    />
                    {/* P-card (opaque) portion */}
                    {dept.pcard_total > 0 && (
                      <div
                        className="h-full bg-red-500/50"
                        style={{ width: `${(100 - dept.transparency_pct) * (ad.departments[0]?.total ? dept.total / ad.departments[0].total : 0)}%` }}
                      />
                    )}
                  </div>
                  {dept.pcard_total > 0 && (
                    <p className="text-[8px] font-mono text-red-400/60 mt-0.5">
                      {(100 - dept.transparency_pct).toFixed(0)}% P-card
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
