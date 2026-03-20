/** Vendor Explorer v2 — three-level drill-down: Landscape → Profile → Payment Detail
 *
 *  Level 1: Vendor Landscape — scrollable bar chart of all vendors with ghost bars, YoY badges
 *  Level 2: Vendor Profile — full intelligence dossier (Phase 2)
 *  Level 3: Payment Detail — individual voucher view (Phase 5)
 */

import { useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useVendorLandscape, type VendorLandscapeItem, type VendorLandscapeFilters } from '@/hooks/useVendorLandscape'
import VendorProfile from '@/views/CityBudget/VendorProfile'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatBudgetAmount, formatBudgetFull } from '@/utils/fiscalYear'
import type { FiscalYear } from '@/types/budget'

const ACCENT = '#0ea5e9'

// ── Filter types ───────────────────────────────────────────

type SizeTier = 'all' | 'mega' | 'large' | 'mid' | 'small' | 'micro'
type VendorSort = 'spend' | 'yoy' | 'payments' | 'alpha'

const SIZE_TIER_DEFS: Record<Exclude<SizeTier, 'all'>, { label: string; min: number; max: number }> = {
  mega:  { label: 'Mega ($100M+)',     min: 100_000_000, max: Infinity },
  large: { label: 'Large ($10M–100M)', min: 10_000_000,  max: 100_000_000 },
  mid:   { label: 'Mid ($1M–10M)',     min: 1_000_000,   max: 10_000_000 },
  small: { label: 'Small ($100K–1M)',  min: 100_000,     max: 1_000_000 },
  micro: { label: 'Micro (<$100K)',    min: 0,           max: 100_000 },
}

const SORT_OPTIONS: Record<VendorSort, string> = {
  spend: 'Total Spend',
  yoy: 'YoY Growth',
  payments: 'Payment Count',
  alpha: 'Alphabetical',
}

// ── Scale-break computation ────────────────────────────────

function computeScaleCap(values: number[], percentile = 85): number {
  const positive = values.filter((v) => v > 0)
  if (positive.length < 3) return Math.max(...positive, 1)
  const sorted = [...positive].sort((a, b) => a - b)
  const idx = Math.floor(sorted.length * percentile / 100)
  const pVal = sorted[Math.min(idx, sorted.length - 1)]
  const rawMax = sorted[sorted.length - 1]
  if (pVal > 0 && rawMax > pVal * 2) return pVal * 1.3
  return rawMax
}

// ── Main component ─────────────────────────────────────────

export default function VendorExplorer({ fiscalYear }: { fiscalYear: FiscalYear }) {
  const [searchParams, setSearchParams] = useSearchParams()

  // URL-synced state
  const selectedVendor = searchParams.get('vendor')
  const deptFilter = searchParams.get('dept') || ''
  const categoryFilter = searchParams.get('cat') || ''
  const tierFilter = (searchParams.get('tier') as SizeTier) || 'all'
  const sortBy = (searchParams.get('sort') as VendorSort) || 'spend'
  const searchQuery = searchParams.get('q') || ''
  const showDeparted = searchParams.get('departed') === '1'

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
        return next
      }, { replace: true })
    },
    [setSearchParams],
  )

  const selectVendor = useCallback(
    (vendor: string | null) => setParam('vendor', vendor),
    [setParam],
  )

  // Data
  const filters: VendorLandscapeFilters = useMemo(() => ({
    department: deptFilter || undefined,
    category: categoryFilter || undefined,
  }), [deptFilter, categoryFilter])

  const landscape = useVendorLandscape(fiscalYear, filters, showDeparted)

  // Client-side filtering and sorting
  const filtered = useMemo(() => {
    let items = landscape.vendors

    // Text search (client-side on loaded vendors)
    if (searchQuery.length >= 2) {
      const upper = searchQuery.toUpperCase()
      items = items.filter((v) => v.vendor.toUpperCase().includes(upper))
    }

    // Size tier
    if (tierFilter !== 'all') {
      const tier = SIZE_TIER_DEFS[tierFilter]
      items = items.filter((v) => {
        const amt = v.isDeparted ? v.priorTotal : v.total
        return amt >= tier.min && amt < tier.max
      })
    }

    // Sort
    switch (sortBy) {
      case 'yoy':
        items = [...items].sort((a, b) => (b.yoyDelta ?? -Infinity) - (a.yoyDelta ?? -Infinity))
        break
      case 'payments':
        items = [...items].sort((a, b) => b.payments - a.payments)
        break
      case 'alpha':
        items = [...items].sort((a, b) => a.vendor.localeCompare(b.vendor))
        break
      // 'spend' — already sorted by total_paid DESC from server
    }

    return items
  }, [landscape.vendors, searchQuery, tierFilter, sortBy])

  const totalFilteredSpend = useMemo(
    () => filtered.reduce((s, v) => s + v.total, 0),
    [filtered],
  )

  // Scale-break: compute from both current and prior values
  const scaleCap = useMemo(() => {
    const allValues = filtered.flatMap((v) => [v.total, v.priorTotal]).filter((v) => v > 0)
    return computeScaleCap(allValues)
  }, [filtered])

  // ── Level 2: Vendor Profile ──────────────────────────────────
  if (selectedVendor) {
    return (
      <VendorProfile
        vendor={selectedVendor}
        fiscalYear={fiscalYear}
        onBack={() => selectVendor(null)}
      />
    )
  }

  // ── Level 1: Vendor Landscape ──────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Search + filter bar */}
      <div className="flex-shrink-0 px-6 py-4 space-y-3 border-b border-slate-200/50 dark:border-white/[0.04]">
        {/* Search input */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setParam('q', e.target.value || null)}
          placeholder="Filter vendors…"
          className="w-full max-w-xl h-9 rounded-lg bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200/50 dark:border-white/[0.06] px-3 text-sm text-ink dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/50 transition-all font-mono"
        />

        {/* Filter row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Department */}
          <select
            value={deptFilter}
            onChange={(e) => setParam('dept', e.target.value || null)}
            className="text-xs font-mono bg-slate-100/80 dark:bg-slate-800 border border-slate-200/50 dark:border-white/[0.06] rounded-md px-2 py-1.5 text-ink dark:text-white"
            style={{ colorScheme: 'dark' }}
          >
            <option value="">All Departments</option>
            {landscape.departments.map((d) => (
              <option key={d.department} value={d.department} className="bg-white dark:bg-slate-800">
                {d.department}
              </option>
            ))}
          </select>

          {/* Category (character field) */}
          <select
            value={categoryFilter}
            onChange={(e) => setParam('cat', e.target.value || null)}
            className="text-xs font-mono bg-slate-100/80 dark:bg-slate-800 border border-slate-200/50 dark:border-white/[0.06] rounded-md px-2 py-1.5 text-ink dark:text-white"
            style={{ colorScheme: 'dark' }}
          >
            <option value="">All Categories</option>
            {landscape.categories.map((c) => (
              <option key={c.character} value={c.character} className="bg-white dark:bg-slate-800">
                {c.character}
              </option>
            ))}
          </select>

          {/* Size tier */}
          <select
            value={tierFilter}
            onChange={(e) => setParam('tier', e.target.value === 'all' ? null : e.target.value)}
            className="text-xs font-mono bg-slate-100/80 dark:bg-slate-800 border border-slate-200/50 dark:border-white/[0.06] rounded-md px-2 py-1.5 text-ink dark:text-white"
            style={{ colorScheme: 'dark' }}
          >
            <option value="all">All Sizes</option>
            {(Object.entries(SIZE_TIER_DEFS) as [string, { label: string }][]).map(([key, { label }]) => (
              <option key={key} value={key} className="bg-white dark:bg-slate-800">{label}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setParam('sort', e.target.value === 'spend' ? null : e.target.value)}
            className="text-xs font-mono bg-slate-100/80 dark:bg-slate-800 border border-slate-200/50 dark:border-white/[0.06] rounded-md px-2 py-1.5 text-ink dark:text-white"
            style={{ colorScheme: 'dark' }}
          >
            {(Object.entries(SORT_OPTIONS) as [VendorSort, string][]).map(([key, label]) => (
              <option key={key} value={key} className="bg-white dark:bg-slate-800">{label}</option>
            ))}
          </select>

          {/* Show departed toggle */}
          <label className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 dark:text-slate-500 cursor-pointer select-none ml-1">
            <input
              type="checkbox"
              checked={showDeparted}
              onChange={(e) => setParam('departed', e.target.checked ? '1' : null)}
              className="rounded border-slate-300 dark:border-slate-600 text-sky-500 focus:ring-sky-500/30 h-3 w-3"
            />
            Show departed
          </label>
        </div>
      </div>

      {/* Vendor bar list */}
      <div className="flex-1 overflow-y-auto px-6 py-2">
        {/* Loading skeleton */}
        {landscape.isLoading && (
          <div className="space-y-1 py-2">
            {Array.from({ length: 20 }, (_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 h-9 animate-pulse"
                style={{ animationDelay: `${i * 30}ms`, opacity: 1 - i * 0.04 }}
              >
                <Skeleton className="w-8 h-3" />
                <Skeleton className="w-44 h-3" />
                <Skeleton className="flex-1 h-5 rounded" />
                <Skeleton className="w-14 h-3" />
                <Skeleton className="w-10 h-3" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {landscape.error && (
          <div className="flex items-center justify-center py-16">
            <div className="glass-card rounded-xl p-6 max-w-sm">
              <p className="text-sm font-medium text-red-400 mb-1">Data Error</p>
              <p className="text-xs text-slate-400">{landscape.error}</p>
            </div>
          </div>
        )}

        {/* Vendor bars */}
        {!landscape.isLoading && !landscape.error && (
          <>
            {/* Legend */}
            <div className="flex items-center gap-4 py-2 mb-1">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-2.5 rounded-sm" style={{ backgroundColor: ACCENT, opacity: 0.7 }} />
                <span className="text-[9px] font-mono text-slate-400">Current FY</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-4 h-2.5 rounded-sm border border-dashed"
                  style={{ borderColor: ACCENT, opacity: 0.4 }}
                />
                <span className="text-[9px] font-mono text-slate-400">Prior FY</span>
              </div>
            </div>

            {/* Bar rows */}
            <div className="space-y-px">
              {filtered.map((v, i) => (
                <VendorBarRow
                  key={v.vendor}
                  item={v}
                  rank={sortBy === 'spend' && !searchQuery ? i + 1 : undefined}
                  scaleCap={scaleCap}
                  onClick={() => selectVendor(v.vendor)}
                />
              ))}
            </div>

            {/* Empty state */}
            {filtered.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-12 font-mono">
                No vendors match the current filters
              </p>
            )}

            {/* Footer stats */}
            <div className="py-3 text-[10px] font-mono text-slate-400/60 dark:text-slate-500/60">
              Showing {filtered.length} vendor{filtered.length !== 1 ? 's' : ''} · {formatBudgetFull(totalFilteredSpend)} total
            </div>

            {/* Source attribution */}
            <p className="text-[9px] font-mono text-slate-400/60 dark:text-slate-600 pb-4">
              Source: SF Controller — Vendor Payments ({' '}
              <span className="tabular-nums">n9pm-xkyq</span>) · data.sfgov.org
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Vendor Bar Row ─────────────────────────────────────────

function VendorBarRow({
  item,
  rank,
  scaleCap,
  onClick,
}: {
  item: VendorLandscapeItem
  rank?: number
  scaleCap: number
  onClick: () => void
}) {
  const barPct = scaleCap > 0 ? Math.min((item.total / scaleCap) * 100, 100) : 0
  const ghostPct = scaleCap > 0 ? Math.min((item.priorTotal / scaleCap) * 100, 100) : 0
  const isCapped = item.total > scaleCap

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 h-9 px-2 rounded-lg transition-all duration-150 group text-left
        ${item.isDeparted
          ? 'opacity-40 hover:opacity-60'
          : 'hover:bg-slate-50/50 dark:hover:bg-white/[0.03]'
        }`}
    >
      {/* Rank or badge */}
      <div className="w-8 flex-shrink-0 text-right">
        {item.isNew ? (
          <span className="text-[7px] font-mono font-bold tracking-wide text-emerald-500 bg-emerald-500/10 px-1 py-0.5 rounded">
            NEW
          </span>
        ) : item.isDeparted ? (
          <span className="text-[9px] font-mono text-slate-400 dark:text-slate-600">✕</span>
        ) : rank ? (
          <span className="text-[9px] font-mono text-slate-400/40 dark:text-slate-600/60 tabular-nums">
            {rank}
          </span>
        ) : null}
      </div>

      {/* Vendor name */}
      <div
        className={`w-48 flex-shrink-0 truncate text-[11px] font-mono
          ${item.isDeparted
            ? 'text-slate-400 dark:text-slate-600 line-through'
            : 'text-slate-600 dark:text-slate-300 group-hover:text-ink dark:group-hover:text-white'
          }`}
        title={item.vendor}
      >
        {item.vendor}
      </div>

      {/* Bar area */}
      <div className="flex-1 h-5 relative min-w-0">
        {/* Ghost bar (prior year) — dashed outline behind the current bar */}
        {item.priorTotal > 0 && ghostPct > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded"
            style={{
              width: `${ghostPct}%`,
              border: `1px dashed ${ACCENT}`,
              opacity: 0.25,
            }}
          />
        )}
        {/* Current bar — solid fill */}
        {barPct > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded transition-all duration-500"
            style={{
              width: `${barPct}%`,
              backgroundColor: ACCENT,
              opacity: 0.65,
            }}
          />
        )}
        {/* Scale-break indicator (diagonal hash marks for capped bars) */}
        {isCapped && (
          <div
            className="absolute right-0 inset-y-0.5 w-2 rounded-r"
            style={{
              background: `repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(0,0,0,0.35) 2px, rgba(0,0,0,0.35) 3px)`,
            }}
          />
        )}
      </div>

      {/* Dollar amount */}
      <span
        className={`text-xs font-mono tabular-nums flex-shrink-0 w-16 text-right
          ${item.isDeparted
            ? 'text-slate-400 dark:text-slate-600'
            : 'text-ink dark:text-white'
          }`}
      >
        {item.isDeparted
          ? formatBudgetAmount(item.priorTotal)
          : formatBudgetAmount(item.total)}
      </span>

      {/* YoY delta badge */}
      <span
        className={`text-[10px] font-mono tabular-nums flex-shrink-0 w-12 text-right
          ${item.yoyDelta === null
            ? 'text-slate-400 dark:text-slate-500'
            : item.yoyDelta > 0
              ? 'text-emerald-500 dark:text-emerald-400'
              : item.yoyDelta < -0.5
                ? 'text-red-500 dark:text-red-400'
                : 'text-slate-400 dark:text-slate-500'
          }`}
      >
        {item.yoyDelta === null
          ? '—'
          : item.isDeparted
            ? '−100%'
            : `${item.yoyDelta > 0 ? '+' : ''}${item.yoyDelta.toFixed(0)}%`}
      </span>

      {/* Drill-down chevron */}
      {!item.isDeparted && (
        <svg
          width="12" height="12" viewBox="0 0 12 12"
          fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          className="flex-shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-sky-500 dark:group-hover:text-sky-400 transition-colors"
        >
          <path d="M4.5 3L7.5 6L4.5 9" />
        </svg>
      )}
    </button>
  )
}
