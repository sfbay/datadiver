/** Vendor Profile — Level 2 intelligence dossier for a single vendor.
 *
 *  Two-column layout: left (spending timeline + key metrics), right (dept breakdown +
 *  categories + contract inventory). Fired from the vendor landscape bar click.
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'
import { useVendorProfile, useVendorPayments, useVendorMonthlySpend, type VendorContractRow, type VendorPaymentRow, type MonthlySpendRow } from '@/hooks/useVendorProfile'
import { exportToCSV } from '@/utils/csvExport'
import { Skeleton, SkeletonChart } from '@/components/ui/Skeleton'
import ShareLinkButton from '@/components/ui/ShareLinkButton'
import { formatBudgetAmount, formatBudgetFull, formatFiscalYear, getCurrentFiscalYear } from '@/utils/fiscalYear'
import { toSentenceCase } from '@/utils/format'
import { computeContractFlags, computePaymentPatternFlags, type VendorFlag } from '@/utils/vendorFlags'
import type { FiscalYear } from '@/types/budget'

const ACCENT = '#0ea5e9'

interface VendorProfileProps {
  vendor: string
  fiscalYear: FiscalYear
  onBack: () => void
}

export default function VendorProfile({ vendor, fiscalYear, onBack: _onBack }: VendorProfileProps) {
  const profile = useVendorProfile(vendor, fiscalYear)
  const { metrics } = profile
  const payments = useVendorPayments(vendor)
  const monthlySpend = useVendorMonthlySpend(vendor)

  // Filter state — clicking departments/contracts filters the payment table
  const [deptFilter, setDeptFilter] = useState<string | null>(null)
  const [activeContractNo, setActiveContractNo] = useState<string | null>(null) // for visual highlight
  const activeFilterLabel = activeContractNo ? `${activeContractNo} (${deptFilter})` : deptFilter
  const paymentsRef = useRef<HTMLDivElement>(null)

  const filteredPayments = useMemo(() => {
    if (!deptFilter) return payments.payments
    return payments.payments.filter((p) => p.department === deptFilter)
  }, [payments.payments, deptFilter])

  const clearFilter = useCallback(() => {
    setDeptFilter(null)
    setActiveContractNo(null)
  }, [])

  // Scroll to payments table when filter is set
  useEffect(() => {
    if (deptFilter && paymentsRef.current) {
      paymentsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [deptFilter])

  // Contract-level anomaly flags
  const contractFlags = useMemo(
    () => computeContractFlags(profile.contractData),
    [profile.contractData],
  )

  // Payment pattern flags (FY-end clustering, split purchases)
  const patternFlags = useMemo(
    () => computePaymentPatternFlags(monthlySpend.data, payments.payments),
    [monthlySpend.data, payments.payments],
  )

  // All profile flags combined
  const allProfileFlags = useMemo(
    () => [...contractFlags, ...patternFlags],
    [contractFlags, patternFlags],
  )

  // Clean share URL — only view-relevant params
  const buildShareUrl = useCallback(() => {
    const params = new URLSearchParams()
    params.set('tab', 'search')
    params.set('vendor', vendor)
    if (fiscalYear !== getCurrentFiscalYear()) params.set('fy', String(fiscalYear))
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`
  }, [vendor, fiscalYear])

  // CSV export
  const handleExportCSV = useCallback(() => {
    if (payments.payments.length === 0) return
    const rows = payments.payments.map((p) => ({
      fiscal_year: p.fiscal_year,
      payment_date: p.vouchers_paid_distribution_date || '',
      department: p.department,
      category: p.sub_object,
      amount: p.vouchers_paid,
      voucher: p.voucher,
      purchase_order: p.purchase_order,
    }))
    const safeName = vendor.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
    exportToCSV(rows, `vendor-${safeName}-payments`)
  }, [payments.payments, vendor])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header — the big H2 title + back button are handled by the parent
          (AdBreadcrumb in CityBudget.tsx). This inner header now only
          carries the vendor-specific metadata: Nonprofit badge, lifetime
          stats, baseball-card vitals, and anomaly flags. */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-slate-200/50 dark:border-white/[0.04]">
        <div>
          {/* Top row: Nonprofit badge (if applicable) + ShareLinkButton */}
          <div className="flex items-center justify-between mb-1">
            <div>
              {metrics?.isNonprofit && (
                <span className="text-[9px] font-mono font-semibold bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded-full">
                  Nonprofit
                </span>
              )}
            </div>
            <ShareLinkButton buildUrl={buildShareUrl} />
          </div>

          {metrics && (
            <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
              {formatBudgetFull(metrics.lifetimeTotal)} lifetime · {metrics.fiscalYears} fiscal years · {metrics.contractCount} contract{metrics.contractCount !== 1 ? 's' : ''}
            </p>
          )}

          {/* Baseball card — quick-scan vendor vitals */}
          {metrics && profile.yearData.length > 0 && (() => {
            const firstFY = profile.yearData[0].fiscal_year
            const deptCount = profile.deptData.length
            const totalPayments = profile.yearData.reduce((s, r) => s + (parseInt(r.payment_count, 10) || 0), 0)
            const avgPayment = totalPayments > 0 ? metrics.lifetimeTotal / totalPayments : 0
            const activeContracts = profile.contractData.filter((c) => !c.term_end_date || new Date(c.term_end_date) >= new Date()).length
            const soleSourceCount = profile.contractData.filter((c) => c.sole_source_flg === 'Y').length

            return (
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="text-[9px] font-mono text-slate-500" title="First fiscal year with payments">
                  Since <span className="text-slate-300">FY{firstFY}</span>
                </span>
                <span className="text-[9px] font-mono text-slate-600">·</span>
                <span className="text-[9px] font-mono text-slate-500" title="Distinct departments paying this vendor">
                  <span className="text-slate-300">{deptCount}</span> dept{deptCount !== 1 ? 's' : ''}
                </span>
                <span className="text-[9px] font-mono text-slate-600">·</span>
                <span className="text-[9px] font-mono text-slate-500" title="Total individual voucher payments">
                  <span className="text-slate-300">{totalPayments.toLocaleString()}</span> payments
                </span>
                <span className="text-[9px] font-mono text-slate-600">·</span>
                <span className="text-[9px] font-mono text-slate-500" title="Average payment amount">
                  avg <span className="text-slate-300">{formatBudgetAmount(avgPayment)}</span>
                </span>
                {activeContracts > 0 && (
                  <>
                    <span className="text-[9px] font-mono text-slate-600">·</span>
                    <span className="text-[9px] font-mono text-slate-500" title="Contracts not yet expired">
                      <span className="text-slate-300">{activeContracts}</span> active contract{activeContracts !== 1 ? 's' : ''}
                    </span>
                  </>
                )}
                {soleSourceCount > 0 && (
                  <>
                    <span className="text-[9px] font-mono text-slate-600">·</span>
                    <span className="text-[9px] font-mono text-amber-500/80" title="Contracts awarded without competitive bidding">
                      {soleSourceCount} sole source
                    </span>
                  </>
                )}
              </div>
            )
          })()}

          {/* Anomaly flags */}
          {allProfileFlags.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {allProfileFlags.map((f) => (
                <span
                  key={`${f.type}-${f.detail.slice(0, 20)}`}
                  className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: f.severity === 'red' ? 'rgba(239,68,68,0.1)'
                      : f.severity === 'amber' ? 'rgba(245,158,11,0.1)'
                      : 'rgba(148,163,184,0.1)',
                    color: f.severity === 'red' ? '#ef4444'
                      : f.severity === 'amber' ? '#f59e0b'
                      : '#94a3b8',
                  }}
                  title={f.detail}
                >
                  {f.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {profile.isLoading && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl">
            <div className="space-y-4">
              <SkeletonChart height={200} />
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="glass-card rounded-lg p-3 animate-pulse">
                    <Skeleton className="h-2 w-16 mb-2" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <SkeletonChart height={180} />
              <SkeletonChart height={180} />
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {profile.error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="glass-card rounded-xl p-6 max-w-sm">
            <p className="text-sm font-medium text-red-400 mb-1">Failed to load</p>
            <p className="text-xs text-slate-400">{profile.error}</p>
          </div>
        </div>
      )}

      {/* Content */}
      {!profile.isLoading && !profile.error && metrics && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl">
            {/* Left column: timeline + metrics */}
            <div className="space-y-4">
              {/* Spending Timeline */}
              <div className="glass-card rounded-xl p-4">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-500 mb-3">
                  Spending Timeline
                </p>
                <SpendingTimeline data={profile.yearData} currentFY={fiscalYear} />
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-2">
                <MetricCard label="Avg Annual" value={formatBudgetAmount(metrics.avgAnnual)} />
                <MetricCard
                  label="Peak Year"
                  value={metrics.peakYear ? `FY${metrics.peakYear.fy}` : '—'}
                  subtitle={metrics.peakYear ? formatBudgetAmount(metrics.peakYear.amount) : undefined}
                />
                <MetricCard
                  label="YoY Change"
                  value={metrics.yoyChange !== null ? `${metrics.yoyChange > 0 ? '+' : ''}${metrics.yoyChange.toFixed(1)}%` : '—'}
                  color={metrics.yoyChange !== null
                    ? metrics.yoyChange > 0 ? '#22c55e' : metrics.yoyChange < 0 ? '#ef4444' : undefined
                    : undefined}
                />
                <MetricCard
                  label={`FY${fiscalYear} Total`}
                  value={formatBudgetAmount(metrics.currentYearTotal)}
                  color={ACCENT}
                />
              </div>

              {/* Spending Categories */}
              {profile.categoryData.length > 0 && (
                <div className="glass-card rounded-xl p-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-500 mb-3">
                    Spending Categories
                  </p>
                  <CategoryBreakdown data={profile.categoryData} />
                </div>
              )}
            </div>

            {/* Right column: dept breakdown + contracts */}
            <div className="space-y-4">
              {/* Department Breakdown */}
              {profile.deptData.length > 0 && (
                <div className="glass-card rounded-xl p-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-500 mb-3">
                    Department Breakdown
                  </p>
                  <DepartmentBreakdown
                    data={profile.deptData}
                    activeDept={!activeContractNo ? deptFilter : null}
                    onClickDept={(dept) => {
                      setActiveContractNo(null)
                      setDeptFilter((prev) => prev === dept ? null : dept)
                    }}
                  />
                </div>
              )}

              {/* Contract Inventory */}
              {profile.contractData.length > 0 && (
                <div className="glass-card rounded-xl p-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-500 mb-3">
                    Contract Inventory
                  </p>
                  <ContractInventory
                    contracts={profile.contractData}
                    activeContract={activeContractNo}
                    onClickContract={(contractNo, dept) => {
                      if (activeContractNo === contractNo) {
                        clearFilter()
                      } else {
                        setActiveContractNo(contractNo)
                        setDeptFilter(dept)
                      }
                    }}
                  />
                </div>
              )}

              {/* If no contracts found via supplierContracts, note it */}
              {profile.contractData.length === 0 && !profile.isLoading && (
                <div className="glass-card rounded-xl p-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-500 mb-2">
                    Contract Inventory
                  </p>
                  <p className="text-xs text-slate-400 font-mono">
                    No contracts found in Supplier Contracts dataset (cqi5-hm2d)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Payment Pattern Heatgrid */}
          {monthlySpend.data.length > 0 && (
            <div className="glass-card rounded-xl p-4 max-w-6xl mt-6">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-500 mb-3">
                Payment Pattern (monthly)
              </p>
              <PaymentHeatgrid data={monthlySpend.data} />
            </div>
          )}

          {/* Recent Payments Table */}
          <div ref={paymentsRef} className="glass-card rounded-xl p-4 max-w-6xl mt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-500">
                  {deptFilter ? 'Filtered Payments' : 'Recent Payments'}
                </p>
                {deptFilter && (
                  <button
                    onClick={clearFilter}
                    className="text-[9px] font-mono text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1"
                  >
                    {activeFilterLabel} ✕
                  </button>
                )}
              </div>
              <button
                onClick={handleExportCSV}
                disabled={payments.payments.length === 0}
                className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 hover:text-ink dark:hover:text-white bg-slate-100/80 dark:bg-white/[0.04] rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-30"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M6 1v7M3 5l3 3 3-3M2 10h8" />
                </svg>
                CSV
              </button>
            </div>
            <PaymentTable payments={filteredPayments} isLoading={payments.isLoading} />
            {payments.hasMore && (
              <button
                onClick={payments.loadMore}
                disabled={payments.isLoading}
                className="w-full mt-2 py-2 text-[10px] font-mono text-sky-400 hover:text-sky-300 bg-sky-500/5 hover:bg-sky-500/10 rounded-lg transition-colors disabled:opacity-50"
              >
                {payments.isLoading ? 'Loading…' : 'Load more payments'}
              </button>
            )}
          </div>

          {/* Source */}
          <p className="text-[9px] font-mono text-slate-400/60 dark:text-slate-600 mt-6">
            Source: SF Controller — Vendor Payments (<span className="tabular-nums">n9pm-xkyq</span>)
            {profile.contractData.length > 0 && (
              <> · Supplier Contracts (<span className="tabular-nums">cqi5-hm2d</span>)</>
            )}
            {' '}· data.sfgov.org
          </p>
        </div>
      )}
    </div>
  )
}

// ── Spending Timeline (D3 area chart) ──────────────────────

function SpendingTimeline({
  data,
  currentFY,
}: {
  data: { fiscal_year: string; total_paid: string; payment_count: string }[]
  currentFY: FiscalYear
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  const points = useMemo(
    () => data
      .map((r) => ({ fy: parseInt(r.fiscal_year, 10), amount: parseFloat(r.total_paid) || 0 }))
      .sort((a, b) => a.fy - b.fy),
    [data],
  )

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || points.length < 2) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = containerRef.current.clientWidth || 460
    const height = 180
    const margin = { top: 12, right: 16, bottom: 28, left: 52 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom

    svg.attr('width', width).attr('height', height)
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleLinear()
      .domain(d3.extent(points, (d) => d.fy) as [number, number])
      .range([0, w])
    const y = d3.scaleLinear()
      .domain([0, (d3.max(points, (d) => d.amount) || 1) * 1.1])
      .range([h, 0])
      .nice()

    // Grid lines
    const gridColor = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
    g.selectAll('.grid')
      .data(y.ticks(4))
      .join('line')
      .attr('x1', 0).attr('x2', w)
      .attr('y1', (d) => y(d)).attr('y2', (d) => y(d))
      .attr('stroke', gridColor)

    // Area fill
    const area = d3.area<{ fy: number; amount: number }>()
      .x((d) => x(d.fy))
      .y0(h)
      .y1((d) => y(d.amount))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(points)
      .attr('fill', `${ACCENT}18`)
      .attr('d', area)

    // Line
    const line = d3.line<{ fy: number; amount: number }>()
      .x((d) => x(d.fy))
      .y((d) => y(d.amount))
      .curve(d3.curveMonotoneX)

    const path = g.append('path')
      .datum(points)
      .attr('fill', 'none')
      .attr('stroke', ACCENT)
      .attr('stroke-width', 2)
      .attr('d', line)

    // Animate line draw
    const totalLength = path.node()?.getTotalLength() || 0
    path
      .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
      .attr('stroke-dashoffset', totalLength)
      .transition()
      .duration(800)
      .ease(d3.easeCubicOut)
      .attr('stroke-dashoffset', 0)

    // Highlight current FY dot
    const currentPoint = points.find((p) => p.fy === currentFY)
    if (currentPoint) {
      g.append('circle')
        .attr('cx', x(currentPoint.fy))
        .attr('cy', y(currentPoint.amount))
        .attr('r', 4)
        .attr('fill', ACCENT)
        .attr('stroke', isDarkMode ? '#0f172a' : '#fff')
        .attr('stroke-width', 2)
    }

    // Highlight peak year
    const peak = points.reduce((best, p) => p.amount > best.amount ? p : best, points[0])
    if (peak && peak.fy !== currentFY) {
      g.append('circle')
        .attr('cx', x(peak.fy))
        .attr('cy', y(peak.amount))
        .attr('r', 3)
        .attr('fill', '#f59e0b')
        .attr('opacity', 0.7)
    }

    // Axes
    const axisColor = isDarkMode ? '#64748b' : '#94a3b8'
    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat((d) => `'${String(d).slice(-2)}`))
      .call((g) => g.select('.domain').attr('stroke', axisColor))
      .call((g) => g.selectAll('.tick text').attr('fill', axisColor).attr('font-size', '8px').attr('font-family', '"JetBrains Mono", monospace'))
      .call((g) => g.selectAll('.tick line').attr('stroke', axisColor))

    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat((d) => formatBudgetAmount(d as number)))
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick text').attr('fill', axisColor).attr('font-size', '8px').attr('font-family', '"JetBrains Mono", monospace'))
      .call((g) => g.selectAll('.tick line').remove())

  }, [points, currentFY, isDarkMode])

  if (points.length < 2) {
    return <p className="text-xs text-slate-400 font-mono py-4">Insufficient data for timeline</p>
  }

  return (
    <div ref={containerRef} className="w-full">
      <svg ref={svgRef} className="w-full" />
    </div>
  )
}

// ── Metric Card ────────────────────────────────────────────

function MetricCard({
  label,
  value,
  subtitle,
  color,
}: {
  label: string
  value: string
  subtitle?: string
  color?: string
}) {
  return (
    <div className="glass-card rounded-lg px-3 py-2.5">
      <p className="text-[9px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
        {label}
      </p>
      <p
        className="text-lg font-bold font-mono tracking-tight leading-none"
        style={color ? { color } : undefined}
      >
        {value}
      </p>
      {subtitle && (
        <p className="text-[9px] font-mono text-slate-400 mt-0.5">{subtitle}</p>
      )}
    </div>
  )
}

// ── Department Breakdown (horizontal bars) ─────────────────

function DepartmentBreakdown({
  data,
  activeDept,
  onClickDept,
}: {
  data: { department: string; total_paid: string; payment_count: string }[]
  activeDept?: string | null
  onClickDept?: (dept: string) => void
}) {
  const maxTotal = useMemo(
    () => Math.max(...data.map((r) => parseFloat(r.total_paid) || 0), 1),
    [data],
  )
  const totalAll = useMemo(
    () => data.reduce((s, r) => s + (parseFloat(r.total_paid) || 0), 0),
    [data],
  )

  return (
    <div className="space-y-2">
      {data.map((r) => {
        const amount = parseFloat(r.total_paid) || 0
        const pct = totalAll > 0 ? (amount / totalAll) * 100 : 0
        const isActive = activeDept === r.department
        return (
          <div
            key={r.department}
            className={`rounded-md transition-all duration-150 ${onClickDept ? 'cursor-pointer hover:bg-white/[0.03]' : ''} ${isActive ? 'bg-sky-500/[0.06] ring-1 ring-sky-500/20' : ''}`}
            onClick={() => onClickDept?.(r.department)}
            role={onClickDept ? 'button' : undefined}
            title={onClickDept ? `Filter payments to ${r.department}` : r.department}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className={`text-[10px] truncate max-w-[200px] ${isActive ? 'text-sky-300' : 'text-slate-600 dark:text-slate-300'}`}>
                {r.department}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-[9px] font-mono text-slate-400 tabular-nums">
                  {pct.toFixed(0)}%
                </span>
                <span className="text-[10px] font-mono text-ink dark:text-white tabular-nums">
                  {formatBudgetAmount(amount)}
                </span>
              </div>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-white/[0.04] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(amount / maxTotal) * 100}%`,
                  backgroundColor: ACCENT,
                  opacity: 0.65,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Category Breakdown ─────────────────────────────────────

function CategoryBreakdown({
  data,
}: {
  data: { character: string; object: string; total_paid: string }[]
}) {
  // Group by character, show top objects within each
  const grouped = useMemo(() => {
    const charMap = new Map<string, { total: number; objects: { name: string; total: number }[] }>()
    for (const r of data) {
      const amount = parseFloat(r.total_paid) || 0
      if (!charMap.has(r.character)) {
        charMap.set(r.character, { total: 0, objects: [] })
      }
      const entry = charMap.get(r.character)!
      entry.total += amount
      entry.objects.push({ name: r.object, total: amount })
    }
    return [...charMap.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8)
  }, [data])

  const totalAll = useMemo(
    () => grouped.reduce((s, [, v]) => s + v.total, 0),
    [grouped],
  )

  return (
    <div className="space-y-2">
      {grouped.map(([character, { total, objects }]) => {
        const pct = totalAll > 0 ? (total / totalAll) * 100 : 0
        return (
          <div key={character}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-slate-600 dark:text-slate-300 truncate max-w-[200px]" title={character}>
                {character}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-[9px] font-mono text-slate-400 tabular-nums">
                  {pct.toFixed(0)}%
                </span>
                <span className="text-[10px] font-mono text-ink dark:text-white tabular-nums">
                  {formatBudgetAmount(total)}
                </span>
              </div>
            </div>
            {objects.length > 1 && (
              <div className="ml-2 space-y-0.5 mt-0.5">
                {objects.slice(0, 3).map((obj) => (
                  <div key={obj.name} className="flex items-center justify-between">
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 truncate max-w-[180px]">
                      {obj.name}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400 tabular-nums ml-2">
                      {formatBudgetAmount(obj.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Contract Inventory with utilization bars ────────────────

function ContractInventory({ contracts, activeContract, onClickContract }: {
  contracts: VendorContractRow[]
  activeContract?: string | null
  onClickContract?: (contractNo: string, dept: string) => void
}) {
  return (
    <div className="space-y-2">
      {contracts.map((c) => {
        const agreed = parseFloat(c.agreed_amt) || 0
        const paid = parseFloat(c.pmt_amt) || 0
        const utilization = agreed > 0 ? (paid / agreed) * 100 : 0
        const isFullyConsumed = utilization >= 95
        const isOverrun = paid > agreed && agreed > 0
        const isSoleSource = c.sole_source_flg === 'Y'
        const isExpired = c.term_end_date ? new Date(c.term_end_date) < new Date() : false

        const isActiveContract = activeContract === c.contract_no
        return (
          <div
            key={c.contract_no}
            className={`glass-card rounded-lg p-2.5 transition-all duration-150 ${onClickContract ? 'cursor-pointer hover:bg-white/[0.03]' : ''} ${isActiveContract ? 'ring-1 ring-sky-500/20 bg-sky-500/[0.06]' : ''}`}
            onClick={() => onClickContract?.(c.contract_no, c.department)}
            role={onClickContract ? 'button' : undefined}
            title={onClickContract ? `Filter payments to ${c.department} (${c.contract_no})` : undefined}
          >
            <div className="flex items-center justify-between mb-1">
              <span className={`text-[10px] font-mono ${isActiveContract ? 'text-sky-300' : 'text-sky-400'}`}>{c.contract_no}</span>
              <div className="flex items-center gap-1">
                {isSoleSource && (
                  <span className="text-[7px] font-mono font-bold bg-amber-500/10 text-amber-500 px-1 py-0.5 rounded">
                    SOLE SOURCE
                  </span>
                )}
                {isOverrun && (
                  <span className="text-[7px] font-mono font-bold bg-red-500/10 text-red-500 px-1 py-0.5 rounded">
                    OVERRUN
                  </span>
                )}
                {isFullyConsumed && !isOverrun && (
                  <span className="text-[7px] font-mono font-bold bg-amber-500/10 text-amber-500 px-1 py-0.5 rounded">
                    ⚠ CONSUMED
                  </span>
                )}
                {isExpired && (
                  <span className="text-[7px] font-mono font-bold bg-slate-500/10 text-slate-400 px-1 py-0.5 rounded">
                    EXPIRED
                  </span>
                )}
              </div>
            </div>

            {c.contract_title && (
              <p className="text-[10px] text-slate-600 dark:text-slate-300 line-clamp-2 mb-1">
                {c.contract_title}
              </p>
            )}

            {/* Utilization bar */}
            {agreed > 0 && (
              <div className="mb-1">
                <div className="h-2 bg-slate-100 dark:bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(utilization, 100)}%`,
                      backgroundColor: isOverrun ? '#ef4444' : utilization > 80 ? '#f59e0b' : ACCENT,
                      opacity: 0.7,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[8px] font-mono text-slate-400 tabular-nums">
                    {formatBudgetAmount(paid)} / {formatBudgetAmount(agreed)}
                  </span>
                  <span className="text-[8px] font-mono text-slate-400 tabular-nums">
                    {utilization.toFixed(0)}%
                  </span>
                </div>
              </div>
            )}

            <p className="text-[9px] text-slate-400">
              {c.department}
              {c.term_end_date && (
                <> · Expires {new Date(c.term_end_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</>
              )}
            </p>
          </div>
        )
      })}
    </div>
  )
}

// ── Payment Table ──────────────────────────────────────────

function PaymentTable({
  payments,
  isLoading,
}: {
  payments: VendorPaymentRow[]
  isLoading: boolean
}) {
  if (payments.length === 0 && !isLoading) {
    return <p className="text-xs text-slate-400 font-mono py-4">No payment records</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] font-mono">
        <thead>
          <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-200/50 dark:border-white/[0.04]">
            <th className="text-left py-1.5 pr-3 font-medium">FY</th>
            <th className="text-left py-1.5 pr-3 font-medium">Date</th>
            <th className="text-left py-1.5 pr-3 font-medium">Department</th>
            <th className="text-left py-1.5 pr-3 font-medium">Category</th>
            <th className="text-right py-1.5 pr-3 font-medium">Amount</th>
            <th className="text-left py-1.5 pr-3 font-medium">Voucher</th>
            <th className="text-left py-1.5 font-medium">PO</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p, i) => (
            <tr
              key={`${p.voucher}-${i}`}
              className="border-b border-slate-100/50 dark:border-white/[0.02] hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors"
            >
              <td className="py-1.5 pr-3 text-slate-500 tabular-nums">FY{p.fiscal_year}</td>
              <td className="py-1.5 pr-3 text-slate-400 tabular-nums whitespace-nowrap">
                {p.vouchers_paid_distribution_date
                  ? new Date(p.vouchers_paid_distribution_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                  : '—'}
              </td>
              <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-300 truncate max-w-[160px]" title={p.department}>
                {p.department}
              </td>
              <td className="py-1.5 pr-3 text-slate-400 truncate max-w-[140px]" title={p.sub_object}>
                {p.sub_object}
              </td>
              <td className="py-1.5 pr-3 text-right text-ink dark:text-white tabular-nums">
                {formatBudgetAmount(parseFloat(p.vouchers_paid) || 0)}
              </td>
              <td className="py-1.5 pr-3 text-sky-400 tabular-nums">{p.voucher}</td>
              <td className="py-1.5 text-slate-400 tabular-nums">{p.purchase_order}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <span className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

// ── Payment Pattern Heatgrid ───────────────────────────────

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function PaymentHeatgrid({ data }: { data: MonthlySpendRow[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  const { matrix, years, maxVal } = useMemo(() => {
    const yearSet = new Set<string>()
    const grid = new Map<string, number>() // "FY-month" → total

    for (const r of data) {
      const fy = r.fiscal_year
      const month = parseInt(r.month, 10)
      const total = parseFloat(r.total_paid) || 0
      if (month < 1 || month > 12) continue
      yearSet.add(fy)
      const key = `${fy}-${month}`
      grid.set(key, (grid.get(key) || 0) + total)
    }

    const sortedYears = [...yearSet].sort()
    const maxV = Math.max(...grid.values(), 1)
    return { matrix: grid, years: sortedYears, maxVal: maxV }
  }, [data])

  useEffect(() => {
    if (!svgRef.current || years.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const cellSize = 20
    const gap = 2
    const marginLeft = 40
    const marginTop = 20
    const width = marginLeft + 12 * (cellSize + gap)
    const height = marginTop + years.length * (cellSize + gap)

    svg.attr('width', width).attr('height', height)

    const g = svg.append('g').attr('transform', `translate(${marginLeft},${marginTop})`)

    // Color scale: transparent → accent
    const color = d3.scaleSequential()
      .domain([0, maxVal])
      .interpolator(d3.interpolateRgb('rgba(14,165,233,0.05)', 'rgba(14,165,233,0.8)'))

    // Month labels (top)
    const labelColor = isDarkMode ? '#64748b' : '#94a3b8'
    svg.selectAll('.month-label')
      .data(MONTH_LABELS)
      .join('text')
      .attr('x', (_, i) => marginLeft + i * (cellSize + gap) + cellSize / 2)
      .attr('y', marginTop - 6)
      .attr('text-anchor', 'middle')
      .attr('fill', labelColor)
      .attr('font-size', '7px')
      .attr('font-family', '"JetBrains Mono", monospace')
      .text((d) => d)

    // Year labels (left)
    svg.selectAll('.year-label')
      .data(years)
      .join('text')
      .attr('x', marginLeft - 6)
      .attr('y', (_, i) => marginTop + i * (cellSize + gap) + cellSize / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', labelColor)
      .attr('font-size', '7px')
      .attr('font-family', '"JetBrains Mono", monospace')
      .text((d) => `'${d.slice(-2)}`)

    // Cells
    for (const [yi, fy] of years.entries()) {
      for (let m = 1; m <= 12; m++) {
        const key = `${fy}-${m}`
        const val = matrix.get(key) || 0
        const x = (m - 1) * (cellSize + gap)
        const y = yi * (cellSize + gap)

        g.append('rect')
          .attr('x', x)
          .attr('y', y)
          .attr('width', cellSize)
          .attr('height', cellSize)
          .attr('rx', 2)
          .attr('fill', val > 0 ? color(val) : (isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'))
          .append('title')
          .text(`FY${fy} ${MONTH_LABELS[m - 1]}: ${formatBudgetAmount(val)}`)
      }
    }
  }, [matrix, years, maxVal, isDarkMode])

  if (years.length === 0) return null

  return <svg ref={svgRef} className="w-full" />
}
