import { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import ExportButton from '@/components/export/ExportButton'
import DataSourceLine from '@/components/ui/DataSourceLine'
import { Skeleton, SkeletonChart, SkeletonSidebarRows } from '@/components/ui/Skeleton'
import { type CardDef } from '@/components/ui/CardTray'
import DepartmentBars from '@/components/charts/DepartmentBars'
import SpendingTrend from '@/components/charts/SpendingTrend'
import HorizontalBarChart, { type BarDatum } from '@/components/charts/HorizontalBarChart'
import VendorExplorer from '@/views/CityBudget/VendorExplorer'
import VendorProfile from '@/views/CityBudget/VendorProfile'
import { useBudgetVsActual, useBudgetTotals, useSpendingTrend, useDepartmentSpending } from '@/hooks/useBudgetData'
import { useAdvertisingData, type AdVendorRow } from '@/hooks/useAdvertisingData'
import { useComplianceData, type ComplianceStatus, type DepartmentCard } from '@/hooks/useComplianceData'
import ComplianceTrendChart from '@/components/charts/ComplianceTrendChart'
import MethodologyTip from '@/components/ui/MethodologyTip'
import { MEDIA_CATEGORIES, type MediaCategory } from '@/utils/mediaClassification'
import { exportToCSV } from '@/utils/csvExport'
import { toSentenceCase } from '@/utils/format'
import { getCurrentFiscalYear, formatFiscalYear, formatBudgetAmount, formatBudgetFull } from '@/utils/fiscalYear'
import type { FiscalYear } from '@/types/budget'

type BudgetTab = 'overview' | 'search' | 'advertising'

const TAB_LABELS: Record<BudgetTab, string> = {
  overview: 'Budget Overview',
  search: 'Vendor Explorer',
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
            className="text-xs font-mono bg-slate-100/80 dark:bg-slate-800 border border-slate-200/50 dark:border-white/[0.06] rounded-md px-2 py-1.5 text-ink dark:text-white"
            style={{ colorScheme: 'dark' }}
          >
            {Array.from({ length: getCurrentFiscalYear() - 2009 }, (_, i) => getCurrentFiscalYear() - i).map((fy) => (
              <option key={fy} value={fy} className="bg-white dark:bg-slate-800 text-ink dark:text-white">
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
        {activeTab === 'search' && <VendorExplorer fiscalYear={fiscalYear} />}
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
            <DataSourceLine
              dataset="Budget (xdgd-c79v) · Spending & Revenue (bpnb-jwfb)"
              source="SF Controller"
              recordCount={bva.data.length > 0 ? bva.data.length : undefined}
            />
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

// ── Advertising & Media Tracker Tab ─────────────────────────

/** Drill-down state encoded in URL search params */
interface AdDrilldown {
  category: MediaCategory | null  // adCategory param
  dept: string | null             // adDept param
  vendor: string | null           // adVendor param
}

function AdvertisingTab({ fiscalYear }: { fiscalYear: FiscalYear }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const ad = useAdvertisingData(fiscalYear)
  const compliance = useComplianceData(ad, fiscalYear)
  const [methodologyOpen, setMethodologyOpen] = useState(false)

  // ── Drill-down state from URL ────────────────────────────
  const drilldown = useMemo((): AdDrilldown => ({
    category: (searchParams.get('adCategory') as MediaCategory) || null,
    dept: searchParams.get('adDept') || null,
    vendor: searchParams.get('adVendor') || null,
  }), [searchParams])

  const isDrilledDown = drilldown.category !== null || drilldown.dept !== null

  // ── Navigation helpers ───────────────────────────────────
  // adCategory and adDept are mutually exclusive: navigating to a category
  // clears any department filter and vice versa. Both can coexist with adVendor
  // (vendor is always the deepest level in either drill-down path).
  const navigateToCategory = useCallback((cat: MediaCategory) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('adCategory', cat)
      next.delete('adDept')
      next.delete('adVendor')
      return next
    }, { replace: false })
  }, [setSearchParams])

  const navigateToDept = useCallback((dept: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('adDept', dept)
      next.delete('adCategory')
      next.delete('adVendor')
      return next
    }, { replace: false })
  }, [setSearchParams])

  const navigateToVendor = useCallback((vendor: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('adVendor', vendor)
      return next
    }, { replace: false })
  }, [setSearchParams])

  const navigateToRoot = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('adCategory')
      next.delete('adDept')
      next.delete('adVendor')
      return next
    }, { replace: false })
  }, [setSearchParams])

  const navigateUp = useCallback(() => {
    if (drilldown.vendor) {
      // Pop vendor, keep category/dept
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('adVendor')
        return next
      }, { replace: false })
    } else {
      navigateToRoot()
    }
  }, [drilldown.vendor, setSearchParams, navigateToRoot])

  // ── Filtered vendor data ─────────────────────────────────
  const filteredVendors = useMemo(() => {
    let filtered = ad.vendors
    if (drilldown.category) {
      filtered = filtered.filter((v) => v.category === drilldown.category)
    }
    if (drilldown.dept) {
      filtered = filtered.filter((v) => v.department === drilldown.dept)
    }
    return filtered
  }, [ad.vendors, drilldown.category, drilldown.dept])

  // Aggregate filtered vendors by vendor name (across departments)
  const aggregatedVendors = useMemo(() => {
    const map = new Map<string, { total: number; category: MediaCategory; departments: Set<string>; payments: number }>()
    for (const v of filteredVendors) {
      const amt = parseFloat(v.total_paid) || 0
      const entry = map.get(v.vendor) || { total: 0, category: v.category, departments: new Set<string>(), payments: 0 }
      entry.total += amt
      entry.departments.add(v.department)
      entry.payments += parseInt(v.payment_count, 10) || 0
      map.set(v.vendor, entry)
    }
    return [...map.entries()]
      .map(([name, { total, category, departments, payments }]) => ({
        vendor: name,
        total,
        category,
        departments: [...departments],
        payments,
      }))
      .sort((a, b) => b.total - a.total)
  }, [filteredVendors])

  const filteredTotal = useMemo(
    () => filteredVendors.reduce((s, v) => s + (parseFloat(v.total_paid) || 0), 0),
    [filteredVendors]
  )

  // ── Top-level aggregations (unchanged from original) ─────
  const mediaMix = useMemo(() => {
    const source = drilldown.dept ? filteredVendors : ad.vendors
    const catMap = new Map<MediaCategory, number>()
    for (const v of source) {
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
  }, [ad.vendors, filteredVendors, drilldown.dept])

  // Build vendor bars + a reverse lookup from title-cased label → raw Socrata vendor name
  const { vendorBars, vendorLabelToRaw } = useMemo(() => {
    const vendorMap = new Map<string, { total: number; category: MediaCategory }>()
    for (const v of ad.vendors) {
      const amt = parseFloat(v.total_paid) || 0
      const entry = vendorMap.get(v.vendor) || { total: 0, category: v.category }
      entry.total += amt
      vendorMap.set(v.vendor, entry)
    }
    const labelToRaw = new Map<string, string>()
    const bars = [...vendorMap.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 20)
      .map(([name, { total, category }]) => {
        const label = toSentenceCase(name)
        labelToRaw.set(label, name)
        return { label, value: total, color: MEDIA_CATEGORIES[category].color }
      })
    return { vendorBars: bars, vendorLabelToRaw: labelToRaw }
  }, [ad.vendors])

  // Cards — adapt to drill-down context
  const cards = useMemo((): CardDef[] => {
    if (ad.isLoading) return []

    if (drilldown.category) {
      const catInfo = MEDIA_CATEGORIES[drilldown.category]
      return [
        {
          id: 'cat-total',
          label: `${catInfo.label} Spend`,
          shortLabel: 'Total',
          value: formatBudgetAmount(filteredTotal),
          color: catInfo.color,
          defaultExpanded: true,
        },
        {
          id: 'cat-vendors',
          label: 'Vendors',
          shortLabel: 'Vendors',
          value: String(aggregatedVendors.length),
          color: '#f59e0b',
          defaultExpanded: true,
        },
        {
          id: 'cat-pct',
          label: '% of Ad Spend',
          shortLabel: 'Share',
          value: ad.totalAdSpend > 0 ? `${((filteredTotal / ad.totalAdSpend) * 100).toFixed(1)}%` : '—',
          color: '#a78bfa',
          defaultExpanded: true,
        },
      ]
    }

    if (drilldown.dept) {
      const deptInfo = ad.departments.find((d) => d.department === drilldown.dept)
      return [
        {
          id: 'dept-total',
          label: 'Dept Ad Spend',
          shortLabel: 'Total',
          value: formatBudgetAmount(filteredTotal),
          color: ACCENT,
          defaultExpanded: true,
        },
        {
          id: 'dept-vendors',
          label: 'Ad Vendors',
          shortLabel: 'Vendors',
          value: String(aggregatedVendors.length),
          color: '#f59e0b',
          defaultExpanded: true,
        },
        {
          id: 'dept-pcard',
          label: 'P-Card %',
          shortLabel: 'P-Card',
          value: deptInfo ? `${(100 - deptInfo.transparency_pct).toFixed(0)}%` : '—',
          color: '#ef4444',
          defaultExpanded: true,
        },
      ]
    }

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
        id: 'discretionary',
        label: 'Discretionary',
        shortLabel: 'Discr.',
        value: formatBudgetAmount(compliance.totalDiscretionary),
        color: '#0ea5e9',
        subtitle: 'excl. legal notices',
        defaultExpanded: true,
      },
      {
        id: 'community-media',
        label: 'Community Media',
        shortLabel: 'Ethnic',
        value: formatBudgetAmount(compliance.ethnicMediaSpend),
        color: '#10b981',
        subtitle: `${compliance.outletCount} outlets`,
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
        id: 'community-vendors',
        label: 'Community Outlets',
        shortLabel: 'Outlets',
        value: String(compliance.outletCount),
        color: '#10b981',
        subtitle: `of ${new Set(ad.vendors.map((v) => v.vendor)).size} total vendors`,
        defaultExpanded: true,
      },
    ]
  }, [ad, compliance, drilldown, filteredTotal, aggregatedVendors.length])

  const maxPcardTotal = useMemo(
    () => Math.max(...ad.departments.map((d) => d.pcard_total), 1),
    [ad.departments]
  )

  const handleExportCSV = useCallback(() => {
    const rows = (isDrilledDown ? filteredVendors : ad.vendors).map((v) => ({
      vendor: v.vendor,
      department: v.department,
      total_paid: v.total_paid,
      payments: v.payment_count,
      detection_layer: v.layer,
      media_category: MEDIA_CATEGORIES[v.category].label,
    }))
    exportToCSV(rows, `sf-advertising-${fiscalYear ? `fy${fiscalYear}` : 'all'}`)
  }, [ad.vendors, filteredVendors, isDrilledDown, fiscalYear])

  // ── Vendor profile view ──────────────────────────────────
  if (drilldown.vendor) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-6 pt-4 pb-2">
          <AdBreadcrumb drilldown={drilldown} onNavigateRoot={navigateToRoot} onNavigateUp={navigateUp} />
        </div>
        <VendorProfile
          vendor={drilldown.vendor}
          fiscalYear={fiscalYear}
          onBack={navigateUp}
        />
      </div>
    )
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Breadcrumb */}
        {isDrilledDown && (
          <div className="mb-4">
            <AdBreadcrumb drilldown={drilldown} onNavigateRoot={navigateToRoot} onNavigateUp={navigateUp} />
          </div>
        )}

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
          <div className="max-w-4xl space-y-6 transition-opacity duration-200">
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

            {/* ── Resolution 240210 Compliance Dashboard ──── */}
            {!isDrilledDown && (
              <ComplianceDashboard
                compliance={compliance}
                fiscalYear={fiscalYear}
                methodologyOpen={methodologyOpen}
                onToggleMethodology={() => setMethodologyOpen((o) => !o)}
                onDeptClick={navigateToDept}
              />
            )}

            {/* ── Drilled-down view: filtered vendor list ──── */}
            {isDrilledDown && (
              <>
                {/* Department compliance indicator */}
                {drilldown.dept && (() => {
                  const deptCard = compliance.departmentCards.find((d) => d.department === drilldown.dept)
                  if (!deptCard || deptCard.status === 'none') return null
                  const cfg = STATUS_CONFIG[deptCard.status]
                  const deptDiscretionary = deptCard.discretionaryTotal
                  const deptEthnic = deptCard.ethnicMediaSpend
                  const deptTarget = deptDiscretionary * 0.5
                  return (
                    <div className="glass-card rounded-xl p-4 border" style={{ borderColor: cfg.color + '30' }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60">
                            Compliance — {toSentenceCase(drilldown.dept)}
                          </span>
                          <span
                            className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                            style={{ color: cfg.color, backgroundColor: cfg.color + '15' }}
                          >
                            {cfg.icon} {deptCard.compliancePct.toFixed(0)}%
                          </span>
                        </div>
                        <span className="text-[9px] font-mono text-slate-400/50">
                          {deptCard.outletCount} outlet{deptCard.outletCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {/* Mini composition bar for this department */}
                      <div className="relative h-4 rounded overflow-hidden bg-slate-100 dark:bg-white/[0.04]">
                        {/* Community media fill */}
                        <div
                          className="absolute inset-y-0 left-0 rounded-r transition-all duration-500"
                          style={{
                            width: deptDiscretionary > 0
                              ? `${Math.min((deptEthnic / deptDiscretionary) * 100, 100)}%`
                              : '0%',
                            backgroundColor: '#10b981',
                            opacity: 0.6,
                          }}
                        />
                        {/* 50% target line */}
                        <div
                          className="absolute inset-y-0 border-r-2 border-dashed border-amber-400/50"
                          style={{ left: '50%' }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-[9px] font-mono">
                        <span className="text-emerald-400 tabular-nums">
                          {formatBudgetAmount(deptEthnic)} community
                        </span>
                        <span className="text-slate-400/60 tabular-nums">
                          {formatBudgetAmount(deptTarget)} target · {formatBudgetAmount(deptDiscretionary)} discretionary
                        </span>
                      </div>
                    </div>
                  )
                })()}

                {/* Media mix for department drill-down */}
                {drilldown.dept && (
                  <div className="glass-card rounded-xl p-4">
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-3">
                      Media Mix — {drilldown.dept}
                    </p>
                    <div className="space-y-2">
                      {mediaMix.map((m) => (
                        <button
                          key={m.category}
                          onClick={() => navigateToCategory(m.category)}
                          className="w-full text-left group"
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: m.color }} />
                              <span className="text-[10px] text-slate-600 dark:text-slate-300 group-hover:text-ink dark:group-hover:text-white transition-colors">
                                {m.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                                {formatBudgetAmount(m.total)}
                              </span>
                              <svg className="w-3 h-3 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                          <div className="h-1.5 bg-slate-100 dark:bg-white/[0.04] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${filteredTotal > 0 ? (m.total / filteredTotal) * 100 : 0}%`,
                                backgroundColor: m.color,
                                opacity: 0.7,
                              }}
                            />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Filtered vendor list */}
                <FilteredVendorList
                  vendors={aggregatedVendors}
                  onSelectVendor={navigateToVendor}
                  title={
                    drilldown.category
                      ? `${MEDIA_CATEGORIES[drilldown.category].label} Vendors`
                      : drilldown.dept
                        ? `Ad Vendors — ${drilldown.dept}`
                        : 'Vendors'
                  }
                />
              </>
            )}

            {/* ── Top-level view (no drill-down) ──────────── */}
            {!isDrilledDown && (
              <>
                {/* Media mix breakdown */}
                <div className="glass-card rounded-xl p-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-3">
                    Media Mix
                  </p>
                  <div className="space-y-2">
                    {mediaMix.map((m) => (
                      <button
                        key={m.category}
                        onClick={() => navigateToCategory(m.category)}
                        className="w-full text-left group"
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: m.color }} />
                            <span className="text-[10px] text-slate-600 dark:text-slate-300 group-hover:text-ink dark:group-hover:text-white transition-colors">
                              {m.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                              {formatBudgetAmount(m.total)}
                            </span>
                            <svg className="w-3 h-3 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
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
                      </button>
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
                    onBarClick={(label) => navigateToVendor(vendorLabelToRaw.get(label) || label)}
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
              </>
            )}

            {/* Source attribution */}
            <DataSourceLine
              dataset="Vendor Payments"
              source="SF Controller"
              id="n9pm-xkyq"
              recordCount={ad.vendors.length}
              caveats={['Three-layer detection: sub_object tagging + agency registry + P-card flagging']}
            />
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
                <button
                  key={dept.department}
                  onClick={() => navigateToDept(dept.department)}
                  className={`w-full text-left px-2 py-1.5 rounded-md transition-all duration-150 group
                    ${drilldown.dept === dept.department
                      ? 'bg-sky-500/10 dark:bg-sky-400/10'
                      : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                    }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-[10px] truncate max-w-[140px] ${
                      drilldown.dept === dept.department
                        ? 'text-sky-600 dark:text-sky-400 font-medium'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}>
                      {dept.department}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 tabular-nums ml-2">
                      {formatBudgetAmount(dept.total)}
                    </span>
                  </div>
                  <div className="h-1 bg-slate-100 dark:bg-white/[0.04] rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-sky-500/50"
                      style={{ width: `${dept.transparency_pct * (ad.departments[0]?.total ? dept.total / ad.departments[0].total : 0)}%` }}
                    />
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
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

// ── Breadcrumb Navigation ───────────────────────────────────

function AdBreadcrumb({
  drilldown,
  onNavigateRoot,
  onNavigateUp,
}: {
  drilldown: AdDrilldown
  onNavigateRoot: () => void
  onNavigateUp: () => void
}) {
  const segments: { label: string; onClick: () => void; isCurrent: boolean }[] = [
    { label: 'Advertising & Media', onClick: onNavigateRoot, isCurrent: !drilldown.category && !drilldown.dept && !drilldown.vendor },
  ]

  if (drilldown.category) {
    const catLabel = MEDIA_CATEGORIES[drilldown.category]?.label || drilldown.category
    segments.push({
      label: catLabel,
      onClick: onNavigateUp,
      isCurrent: !drilldown.vendor,
    })
  }

  if (drilldown.dept) {
    segments.push({
      label: drilldown.dept,
      onClick: onNavigateUp,
      isCurrent: !drilldown.vendor,
    })
  }

  if (drilldown.vendor) {
    segments.push({
      label: toSentenceCase(drilldown.vendor),
      onClick: () => {},
      isCurrent: true,
    })
  }

  return (
    <nav className="flex items-center gap-1 text-[11px] font-mono">
      {segments.map((seg, i) => (
        <span key={seg.label} className="flex items-center gap-1 animate-[fadeSlideIn_200ms_ease-out_both]" style={{ animationDelay: `${i * 50}ms` }}>
          {i > 0 && <span className="text-slate-300 dark:text-slate-600">›</span>}
          {seg.isCurrent ? (
            <span className="text-ink dark:text-white font-medium">{seg.label}</span>
          ) : (
            <button
              onClick={seg.onClick}
              className="text-slate-400 hover:text-sky-500 dark:hover:text-sky-400 transition-colors"
            >
              {seg.label}
            </button>
          )}
        </span>
      ))}
    </nav>
  )
}

// ── Filtered Vendor List ────────────────────────────────────

function FilteredVendorList({
  vendors,
  onSelectVendor,
  title,
}: {
  vendors: { vendor: string; total: number; category: MediaCategory; departments: string[]; payments: number }[]
  onSelectVendor: (vendor: string) => void
  title: string
}) {
  const [sortBy, setSortBy] = useState<'amount' | 'name' | 'payments'>('amount')

  const sorted = useMemo(() => {
    const list = [...vendors]
    if (sortBy === 'amount') list.sort((a, b) => b.total - a.total)
    else if (sortBy === 'name') list.sort((a, b) => a.vendor.localeCompare(b.vendor))
    else if (sortBy === 'payments') list.sort((a, b) => b.payments - a.payments)
    return list
  }, [vendors, sortBy])

  const maxTotal = sorted[0]?.total || 1

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60">
          {title}
        </p>
        <div className="flex gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-md p-0.5">
          {(['amount', 'name', 'payments'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-2 py-0.5 text-[9px] font-mono rounded transition-all
                ${sortBy === s
                  ? 'bg-white dark:bg-white/10 text-ink dark:text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
            >
              {s === 'amount' ? '$' : s === 'name' ? 'A–Z' : '#'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        {sorted.map((v, i) => (
          <button
            key={v.vendor}
            onClick={() => onSelectVendor(v.vendor)}
            className="w-full text-left px-2 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all duration-150 group"
            style={{ animationDelay: `${i * 20}ms` }}
          >
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[9px] font-mono text-slate-300 dark:text-slate-600 w-5 text-right flex-shrink-0">
                  {i + 1}
                </span>
                <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: MEDIA_CATEGORIES[v.category].color }} />
                <span className="text-[11px] text-slate-700 dark:text-slate-200 group-hover:text-ink dark:group-hover:text-white transition-colors truncate">
                  {toSentenceCase(v.vendor)}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                <span className="text-[9px] font-mono text-slate-400 tabular-nums">
                  {v.payments} pmt{v.payments !== 1 ? 's' : ''}
                </span>
                <span className="text-[10px] font-mono text-ink dark:text-white tabular-nums font-medium">
                  {formatBudgetAmount(v.total)}
                </span>
                <svg className="w-3 h-3 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            {/* Spend bar */}
            <div className="ml-7 h-1 bg-slate-100 dark:bg-white/[0.04] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(v.total / maxTotal) * 100}%`,
                  backgroundColor: MEDIA_CATEGORIES[v.category].color,
                  opacity: 0.6,
                }}
              />
            </div>
            {/* Department tags */}
            {v.departments.length > 0 && (
              <div className="ml-7 mt-1 flex flex-wrap gap-1">
                {v.departments.slice(0, 3).map((d) => (
                  <span key={d} className="text-[8px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/[0.04] px-1.5 py-0.5 rounded">
                    {d.length > 20 ? d.slice(0, 19) + '…' : d}
                  </span>
                ))}
                {v.departments.length > 3 && (
                  <span className="text-[8px] font-mono text-slate-400">+{v.departments.length - 3}</span>
                )}
              </div>
            )}
          </button>
        ))}
      </div>

      {vendors.length === 0 && (
        <p className="text-xs text-slate-400 font-mono py-4 text-center">No vendors found</p>
      )}
    </div>
  )
}

// ── Compliance Dashboard ──────────────────────────────────

const STATUS_CONFIG: Record<ComplianceStatus, { icon: string; color: string; bg: string; label: string }> = {
  compliant: { icon: '✓', color: '#10b981', bg: 'bg-emerald-500/10', label: '≥ 50%' },
  below: { icon: '⚠', color: '#f59e0b', bg: 'bg-amber-500/10', label: '30–49%' },
  critical: { icon: '✗', color: '#ef4444', bg: 'bg-red-500/10', label: '< 30%' },
  none: { icon: '—', color: '#64748b', bg: 'bg-slate-500/10', label: 'No ad spend' },
}

function ComplianceDashboard({
  compliance,
  fiscalYear,
  methodologyOpen,
  onToggleMethodology,
  onDeptClick,
}: {
  compliance: ReturnType<typeof useComplianceData>
  fiscalYear: FiscalYear
  methodologyOpen: boolean
  onToggleMethodology: () => void
  onDeptClick: (dept: string) => void
}) {
  const handleExportDeptCSV = useCallback(() => {
    const rows = compliance.departmentCards.map((d) => ({
      department: d.department,
      ethnic_media_spend: d.ethnicMediaSpend.toFixed(2),
      discretionary_total: d.discretionaryTotal.toFixed(2),
      compliance_pct: d.compliancePct.toFixed(1),
      status: d.status,
      outlet_count: d.outletCount,
    }))
    exportToCSV(rows, `compliance-report-card-fy${fiscalYear}`)
  }, [compliance.departmentCards, fiscalYear])

  const handleExportExclusions = useCallback(() => {
    const rows = compliance.exclusions.map((e) => ({
      vendor: e.vendor,
      total: e.total.toFixed(2),
      reason: e.reason,
    }))
    exportToCSV(rows, `legal-notice-exclusions-fy${fiscalYear}`)
  }, [compliance.exclusions, fiscalYear])

  // Total tagged ad spend = discretionary + legal notices (the full sub_object='Advertising' universe)
  const totalTaggedAdSpend = compliance.totalDiscretionary + compliance.legalNoticeTotal

  // Compliance % — bar fill is ALWAYS emerald (it represents community media spend).
  // The empty space tells the "not enough" story. Only the shortfall number is red.
  const pct = compliance.compliancePct
  const barColor = '#10b981' // emerald — community media, consistent with composition bar

  return (
    <div className="space-y-4">
      {/* ── Compliance Progress Bar ──────────────────── */}
      <div className="glass-card rounded-xl p-4 border border-slate-200/30 dark:border-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60">
              Resolution 240210 Compliance
            </span>
            <span className="text-[9px] font-mono text-slate-400/40">·</span>
            <span className="text-[9px] font-mono text-slate-400/60">
              {formatFiscalYear(fiscalYear)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[8px] font-mono text-slate-400/50">
              Based on {compliance.recordCount.toLocaleString()} records
            </span>
          </div>
        </div>

        {/* ── 1. Composition bar FIRST — the broadest context ── */}
        {totalTaggedAdSpend > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[8px] font-mono uppercase tracking-wider text-slate-400/50">
                Total Ad Spend Composition
              </span>
              <span className="text-[9px] font-mono font-semibold text-slate-300 tabular-nums">
                {formatBudgetFull(totalTaggedAdSpend)}
              </span>
            </div>
            {/* Stacked bar with inline labels */}
            <div className="relative h-8 rounded overflow-hidden">
              {/* Legal notices (excluded — diagonal hatching) */}
              <div
                className="absolute inset-y-0 left-0 flex items-center justify-center"
                style={{
                  width: `${(compliance.legalNoticeTotal / totalTaggedAdSpend) * 100}%`,
                  background: `repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(148,163,184,0.25) 3px, rgba(148,163,184,0.25) 5px)`,
                  backgroundColor: 'rgba(148,163,184,0.1)',
                }}
                title={`Legal notices: ${formatBudgetFull(compliance.legalNoticeTotal)} (excluded)`}
              >
                {compliance.legalNoticeTotal / totalTaggedAdSpend > 0.15 && (
                  <span className="text-[8px] font-mono text-slate-400/70 tabular-nums">
                    {formatBudgetAmount(compliance.legalNoticeTotal)} legal
                  </span>
                )}
              </div>
              {/* Discretionary portion */}
              <div
                className="absolute inset-y-0 border border-sky-400/20"
                style={{
                  left: `${(compliance.legalNoticeTotal / totalTaggedAdSpend) * 100}%`,
                  width: `${(compliance.totalDiscretionary / totalTaggedAdSpend) * 100}%`,
                  backgroundColor: 'rgba(14,165,233,0.08)',
                }}
              >
                {/* Community media actual (filled green) */}
                <div
                  className="absolute inset-y-0 left-0 rounded-r bg-emerald-500/60 transition-all duration-700 flex items-center"
                  style={{
                    width: compliance.totalDiscretionary > 0
                      ? `${Math.min((compliance.ethnicMediaSpend / compliance.totalDiscretionary) * 100, 100)}%`
                      : '0%',
                  }}
                >
                  {compliance.ethnicMediaSpend / compliance.totalDiscretionary > 0.08 && (
                    <span className="text-[8px] font-mono font-semibold text-white/90 pl-1.5 tabular-nums whitespace-nowrap">
                      {formatBudgetAmount(compliance.ethnicMediaSpend)}
                    </span>
                  )}
                </div>
                {/* 50% target line within discretionary */}
                <div className="absolute inset-y-0 flex flex-col items-center" style={{ left: '50%' }}>
                  <div className="h-full border-r-2 border-dashed border-amber-400/60" />
                </div>
              </div>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-4 mt-1.5 text-[8px] font-mono text-slate-400/60">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(148,163,184,0.3) 2px, rgba(148,163,184,0.3) 3px)', backgroundColor: 'rgba(148,163,184,0.1)' }} />
                Legal notices (excl.)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm border border-sky-400/30" style={{ backgroundColor: 'rgba(14,165,233,0.12)' }} />
                Discretionary
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/60" />
                Community media
              </span>
              <span className="flex items-center gap-1">
                <span className="w-0 h-2.5 border-r-2 border-dashed border-amber-400/50" />
                50% target
              </span>
            </div>
          </div>
        )}

        {/* ── 2. Compliance thermometer — zooms into the discretionary portion ── */}
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
          Target: ≥ 50% of discretionary ad spend → ethnic &amp; community journalism outlets
        </p>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 relative">
            <div
              className="h-5 rounded-full overflow-hidden border border-sky-400/20"
              style={{ backgroundColor: 'rgba(14,165,233,0.12)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }}
              />
            </div>
            {/* 50% target marker */}
            <div
              className="absolute top-0 h-5 border-l-2 border-dashed border-amber-400/60"
              style={{ left: '50%' }}
            />
          </div>
          <span className="flex-shrink-0 text-sm font-bold font-mono tabular-nums text-sky-400">
            {formatBudgetFull(compliance.totalDiscretionary)}
          </span>
        </div>

        {/* Prominent dollar amounts */}
        <div className="grid grid-cols-3 gap-4 mt-3 mb-2">
          <div>
            <p className="text-[9px] font-mono uppercase tracking-wider text-slate-400/60 mb-0.5">Community Media Spend</p>
            <p className="text-lg font-bold font-mono tabular-nums text-emerald-400">{formatBudgetFull(compliance.ethnicMediaSpend)}</p>
            <p className="text-[9px] font-mono text-slate-400/60">{compliance.outletCount} outlet{compliance.outletCount !== 1 ? 's' : ''}</p>
          </div>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-wider text-slate-400/60 mb-0.5">50% Target</p>
            <p className="text-lg font-bold font-mono tabular-nums text-amber-400">{formatBudgetFull(compliance.totalDiscretionary * 0.5)}</p>
            <p className="text-[9px] font-mono text-slate-400/60">of {formatBudgetFull(compliance.totalDiscretionary)} discretionary</p>
          </div>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-wider text-slate-400/60 mb-0.5">Shortfall</p>
            {compliance.totalDiscretionary * 0.5 > compliance.ethnicMediaSpend ? (
              <>
                <p className="text-lg font-bold font-mono tabular-nums text-red-400">
                  {formatBudgetFull(compliance.totalDiscretionary * 0.5 - compliance.ethnicMediaSpend)}
                </p>
                <p className="text-[9px] font-mono text-red-400/60">below 50% target</p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold font-mono tabular-nums text-emerald-400">
                  +{formatBudgetFull(compliance.ethnicMediaSpend - compliance.totalDiscretionary * 0.5)}
                </p>
                <p className="text-[9px] font-mono text-emerald-400/60">above 50% target</p>
              </>
            )}
          </div>
        </div>

        {/* Compliance % + methodology link */}
        <div className="flex items-center justify-between text-[10px] font-mono border-t border-slate-200/30 dark:border-white/[0.04] pt-2">
          <div className="flex items-center gap-3">
            <span style={{ color: barColor }} className="font-semibold text-sm tabular-nums">
              {pct.toFixed(1)}%
            </span>
            <MethodologyTip
              formula="ethnic media spend ÷ discretionary ad total × 100"
              inputs={[
                { label: 'Ethnic media spend', value: formatBudgetFull(compliance.ethnicMediaSpend) },
                { label: 'Discretionary ad total', value: formatBudgetFull(compliance.totalDiscretionary) },
              ]}
              exclusions={compliance.exclusions.map((e) => ({
                label: toSentenceCase(e.vendor),
                reason: e.reason,
              }))}
              note="P-card purchases are included in the denominator but outlet is unknown."
            />
          </div>
          {compliance.legalNoticeTotal > 0 && (
            <span className="text-slate-400/60 text-[9px]">
              {formatBudgetAmount(compliance.legalNoticeTotal)} legal notices excluded
            </span>
          )}
        </div>
      </div>

      {/* ── Historical Trend Chart (right under thermometer) ── */}
      {compliance.trend.length > 0 && (
        <div className="glass-card rounded-xl p-4">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-3">
            Compliance Trend — Ethnic Media Share of Discretionary Ad Spend
          </p>
          <ComplianceTrendChart
            data={compliance.trend}
            width={700}
            height={260}
            currentFY={fiscalYear}
          />
          <p className="text-[8px] font-mono text-slate-400/50 mt-2">
            Green line = compliance %. Purple bars = outlet count. Dashed line = 50% target.
          </p>
        </div>
      )}
      {compliance.trendLoading && (
        <SkeletonChart height={260} />
      )}

      {/* ── Department Report Card ──────────────────── */}
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60">
            Department Report Card
          </p>
          <button
            onClick={handleExportDeptCSV}
            className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400 hover:text-ink dark:hover:text-white bg-slate-100/80 dark:bg-white/[0.04] rounded-md px-2 py-1 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M6 1v7M3 5l3 3 3-3M2 10h8" />
            </svg>
            CSV
          </button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_80px_80px_60px_50px] gap-2 px-2 pb-1.5 border-b border-slate-100 dark:border-white/[0.04]">
          <span className="text-[8px] font-mono uppercase tracking-wider text-slate-400/50">Department</span>
          <span className="text-[8px] font-mono uppercase tracking-wider text-slate-400/50 text-right">Ethnic Media</span>
          <span className="text-[8px] font-mono uppercase tracking-wider text-slate-400/50 text-right">Discretionary</span>
          <span className="text-[8px] font-mono uppercase tracking-wider text-slate-400/50 text-right">Compliance</span>
          <span className="text-[8px] font-mono uppercase tracking-wider text-slate-400/50 text-center">Status</span>
        </div>

        <div className="space-y-0.5 mt-1 max-h-[320px] overflow-y-auto">
          {compliance.departmentCards.map((card) => {
            const cfg = STATUS_CONFIG[card.status]
            return (
              <button
                key={card.department}
                onClick={() => onDeptClick(card.department)}
                className="w-full grid grid-cols-[1fr_80px_80px_60px_50px] gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-all group items-center"
              >
                <span className="text-[10px] text-slate-600 dark:text-slate-300 group-hover:text-ink dark:group-hover:text-white transition-colors truncate text-left">
                  {card.department}
                </span>
                <span className="text-[10px] font-mono text-slate-500 tabular-nums text-right">
                  {formatBudgetAmount(card.ethnicMediaSpend)}
                </span>
                <span className="text-[10px] font-mono text-slate-500 tabular-nums text-right">
                  {formatBudgetAmount(card.discretionaryTotal)}
                </span>
                <span className="text-[10px] font-mono tabular-nums text-right font-medium" style={{ color: cfg.color }}>
                  {card.status === 'none' ? '—' : `${card.compliancePct.toFixed(0)}%`}
                </span>
                <span className="flex items-center justify-center">
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] ${cfg.bg}`}
                    style={{ color: cfg.color }}
                  >
                    {cfg.icon}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {compliance.departmentCards.length === 0 && (
          <p className="text-xs text-slate-400 font-mono py-4 text-center">No department data</p>
        )}
      </div>

      {/* ── Methodology Disclosure ──────────────────── */}
      <div className="glass-card rounded-xl overflow-hidden">
        <button
          onClick={onToggleMethodology}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors"
        >
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
            How is this calculated?
          </span>
          <svg
            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${methodologyOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
          >
            <path d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {methodologyOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-white/[0.04] pt-3">
            <div className="grid grid-cols-2 gap-4 text-[10px]">
              <div>
                <p className="font-mono uppercase tracking-wider text-slate-400/60 mb-1 text-[8px]">Numerator</p>
                <p className="text-slate-600 dark:text-slate-300">
                  Sum of payments to vendors classified as <strong className="text-emerald-500">Community &amp; Ethnic Press</strong>
                </p>
                <p className="font-mono text-emerald-500 mt-0.5 tabular-nums">{formatBudgetFull(compliance.ethnicMediaSpend)}</p>
                <p className="text-slate-400 mt-0.5">{compliance.outletCount} distinct outlet{compliance.outletCount !== 1 ? 's' : ''}</p>
              </div>
              <div>
                <p className="font-mono uppercase tracking-wider text-slate-400/60 mb-1 text-[8px]">Denominator</p>
                <p className="text-slate-600 dark:text-slate-300">
                  All advertising spend (<code className="text-[9px]">sub_object = &apos;Advertising&apos;</code>) minus mandatory legal notices
                </p>
                <p className="font-mono text-sky-400 mt-0.5 tabular-nums">{formatBudgetFull(compliance.totalDiscretionary)}</p>
              </div>
            </div>

            {/* Exclusions */}
            {compliance.exclusions.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="font-mono uppercase tracking-wider text-slate-400/60 text-[8px]">
                    Excluded from Denominator (Legal Notices)
                  </p>
                  <button
                    onClick={handleExportExclusions}
                    className="text-[8px] font-mono text-slate-400 hover:text-ink dark:hover:text-white transition-colors"
                  >
                    Export ↓
                  </button>
                </div>
                <div className="space-y-1">
                  {compliance.exclusions.map((e) => (
                    <div key={e.vendor} className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-slate-50 dark:bg-white/[0.02]">
                      <span className="text-slate-500">{toSentenceCase(e.vendor)}</span>
                      <span className="font-mono text-slate-400 tabular-nums">{formatBudgetFull(e.total)}</span>
                    </div>
                  ))}
                  <p className="text-[9px] text-slate-400/60 mt-1">
                    Total excluded: {formatBudgetFull(compliance.legalNoticeTotal)}
                  </p>
                </div>
              </div>
            )}

            {/* P-card caveat */}
            {compliance.pcardTotal > 0 && (
              <div className="text-[10px] text-slate-500 dark:text-slate-400 bg-red-500/5 rounded-md px-3 py-2">
                <strong className="text-red-400">P-Card note:</strong> {formatBudgetFull(compliance.pcardTotal)} in procurement card purchases are included in the denominator but the outlet is unknown — these may or may not be ethnic/community media.
              </div>
            )}

            {/* Resolution reference */}
            <p className="text-[9px] text-slate-400/60">
              Per SF Board of Supervisors File No. 240210 (Dorsey/Preston): city departments should spend ≥ 50% of discretionary ad budgets with locally owned ethnic and community journalism outlets.
            </p>
          </div>
        )}
      </div>

      {compliance.trendLoading && !compliance.trend.length && (
        <SkeletonChart height={260} />
      )}
    </div>
  )
}
