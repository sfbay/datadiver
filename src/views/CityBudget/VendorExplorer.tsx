/** Vendor Explorer v2 — three-level drill-down: Landscape → Profile → Payment Detail
 *
 *  Level 1: Vendor Landscape — scrollable bar chart of all vendors with ghost bars, YoY badges
 *  Level 2: Vendor Profile — full intelligence dossier (Phase 2)
 *  Level 3: Payment Detail — individual voucher view (Phase 5)
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useVendorLandscape, type VendorLandscapeItem, type VendorLandscapeFilters } from '@/hooks/useVendorLandscape'
import VendorProfile from '@/views/CityBudget/VendorProfile'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatBudgetAmount, formatBudgetFull, formatFiscalYear, getCurrentFiscalYear } from '@/utils/fiscalYear'
import { computeLandscapeFlags, filterBySensitivity, type VendorFlag } from '@/utils/vendorFlags'
import type { FiscalYear } from '@/types/budget'

const ACCENT = '#0ea5e9'
const MIN_FY = 2007
const PLAY_INTERVAL_MS = 1500

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

  // ── FY Scrubber animation state ──────────────────────────
  const maxFY = getCurrentFiscalYear()
  const [animatedFY, setAnimatedFY] = useState<FiscalYear | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const prevVendorSetRef = useRef<Set<string>>(new Set())

  // The effective FY used for data queries — animated FY overrides URL FY during playback
  const effectiveFY = animatedFY ?? fiscalYear

  // Play/pause interval
  useEffect(() => {
    if (!isPlaying) return
    const timer = setInterval(() => {
      setAnimatedFY((prev) => {
        const next = (prev ?? MIN_FY) + 1
        if (next > maxFY) {
          setIsPlaying(false)
          return prev
        }
        return next
      })
    }, PLAY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [isPlaying, maxFY])

  const handlePlay = useCallback(() => {
    setAnimatedFY(MIN_FY)
    setIsPlaying(true)
  }, [])

  const handlePause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const handleScrubStep = useCallback((fy: FiscalYear) => {
    const clamped = Math.max(MIN_FY, Math.min(fy, maxFY))
    setAnimatedFY(clamped)
    setIsPlaying(false)
  }, [maxFY])

  const handleScrubReset = useCallback(() => {
    setAnimatedFY(null)
    setIsPlaying(false)
  }, [])

  // Data
  const filters: VendorLandscapeFilters = useMemo(() => ({
    department: deptFilter || undefined,
    category: categoryFilter || undefined,
  }), [deptFilter, categoryFilter])

  const landscape = useVendorLandscape(effectiveFY, filters, showDeparted)

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

  // Anomaly flag sensitivity (0-100, URL-synced)
  const sensitivity = parseInt(searchParams.get('sens') || '50', 10)
  const setSensitivity = useCallback(
    (val: number) => setParam('sens', val === 50 ? null : String(val)),
    [setParam],
  )

  // Compute flags for each vendor
  const vendorFlags = useMemo(() => {
    const flagMap = new Map<string, VendorFlag[]>()
    for (const v of filtered) {
      const raw = computeLandscapeFlags(v, filtered)
      const visible = filterBySensitivity(raw, sensitivity)
      if (visible.length > 0) flagMap.set(v.vendor, visible)
    }
    return flagMap
  }, [filtered, sensitivity])

  // Track which vendors are new (for entrance animation)
  const newVendorSet = useMemo(() => {
    const currentSet = new Set(filtered.map((v) => v.vendor))
    const entering = new Set<string>()
    for (const name of currentSet) {
      if (!prevVendorSetRef.current.has(name)) entering.add(name)
    }
    prevVendorSetRef.current = currentSet
    return entering
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
      <AnimationStyles />
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

          {/* Sensitivity slider */}
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500">Flags</span>
            <input
              type="range"
              min={0}
              max={100}
              step={25}
              value={sensitivity}
              onChange={(e) => setSensitivity(parseInt(e.target.value, 10))}
              className="w-16 h-1 accent-sky-500"
              title={`Flag sensitivity: ${sensitivity}%`}
            />
          </div>
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
            {/* FY Scrubber */}
            <FYScrubber
              currentFY={effectiveFY}
              minFY={MIN_FY}
              maxFY={maxFY}
              isPlaying={isPlaying}
              isAnimating={animatedFY !== null}
              onPlay={handlePlay}
              onPause={handlePause}
              onStep={handleScrubStep}
              onReset={handleScrubReset}
            />

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
                  flags={vendorFlags.get(v.vendor)}
                  isEntering={newVendorSet.has(v.vendor)}
                  animDelay={i * 15}
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
  flags,
  isEntering,
  animDelay = 0,
  onClick,
}: {
  item: VendorLandscapeItem
  rank?: number
  scaleCap: number
  flags?: VendorFlag[]
  isEntering?: boolean
  animDelay?: number
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
      style={isEntering ? {
        animation: `vendorBarEnter 400ms ease-out ${animDelay}ms both`,
      } : undefined}
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

      {/* Anomaly flag badges */}
      {flags && flags.length > 0 && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {flags.slice(0, 2).map((f) => (
            <span
              key={f.type}
              className="text-[7px] font-mono font-bold px-1 py-0.5 rounded whitespace-nowrap"
              style={{
                backgroundColor: f.severity === 'red' ? 'rgba(239,68,68,0.1)'
                  : f.severity === 'amber' ? 'rgba(245,158,11,0.1)'
                  : f.severity === 'green' ? 'rgba(34,197,94,0.1)'
                  : 'rgba(148,163,184,0.1)',
                color: f.severity === 'red' ? '#ef4444'
                  : f.severity === 'amber' ? '#f59e0b'
                  : f.severity === 'green' ? '#22c55e'
                  : '#94a3b8',
              }}
              title={f.detail}
            >
              {f.label}
            </span>
          ))}
        </div>
      )}

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

// ── FY Scrubber ────────────────────────────────────────────

function FYScrubber({
  currentFY,
  minFY,
  maxFY,
  isPlaying,
  isAnimating,
  onPlay,
  onPause,
  onStep,
  onReset,
}: {
  currentFY: FiscalYear
  minFY: FiscalYear
  maxFY: FiscalYear
  isPlaying: boolean
  isAnimating: boolean
  onPlay: () => void
  onPause: () => void
  onStep: (fy: FiscalYear) => void
  onReset: () => void
}) {
  const progress = maxFY > minFY ? ((currentFY - minFY) / (maxFY - minFY)) * 100 : 0

  return (
    <div className="py-3 space-y-2">
      {/* Controls row */}
      <div className="flex items-center gap-3">
        {/* Play / Pause button */}
        <button
          onClick={isPlaying ? onPause : onPlay}
          className="flex items-center justify-center w-7 h-7 rounded-md bg-sky-500/10 hover:bg-sky-500/20 text-sky-500 transition-colors"
          title={isPlaying ? 'Pause' : 'Play through fiscal years'}
        >
          {isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="2" y="2" width="3" height="8" rx="0.5" />
              <rect x="7" y="2" width="3" height="8" rx="0.5" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3 1.5v9l7.5-4.5L3 1.5z" />
            </svg>
          )}
        </button>

        {/* Step back */}
        <button
          onClick={() => onStep(currentFY - 1)}
          disabled={currentFY <= minFY}
          className="text-slate-400 hover:text-ink dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 3.5L5 7l3.5 3.5" />
          </svg>
        </button>

        {/* Year display */}
        <span className="text-sm font-mono font-semibold text-ink dark:text-white tabular-nums min-w-[80px] text-center">
          {formatFiscalYear(currentFY)}
        </span>

        {/* Step forward */}
        <button
          onClick={() => onStep(currentFY + 1)}
          disabled={currentFY >= maxFY}
          className="text-slate-400 hover:text-ink dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5.5 3.5L9 7l-3.5 3.5" />
          </svg>
        </button>

        {/* Reset button (shows when animating) */}
        {isAnimating && !isPlaying && (
          <button
            onClick={onReset}
            className="text-[10px] font-mono text-slate-400 hover:text-ink dark:hover:text-white transition-colors ml-1"
          >
            Reset
          </button>
        )}

        {/* Playing indicator */}
        {isPlaying && (
          <span className="text-[9px] font-mono text-sky-400 animate-pulse ml-auto">
            {currentFY - minFY + 1} / {maxFY - minFY + 1}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div
        className="h-1 bg-slate-100 dark:bg-white/[0.04] rounded-full overflow-hidden cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const pct = (e.clientX - rect.left) / rect.width
          const fy = Math.round(minFY + pct * (maxFY - minFY))
          onStep(fy)
        }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${progress}%`,
            backgroundColor: ACCENT,
            opacity: 0.6,
          }}
        />
      </div>
    </div>
  )
}

// ── CSS keyframes for bar entrance animation ───────────────

const AnimationStyles = () => (
  <style>{`
    @keyframes vendorBarEnter {
      0% {
        opacity: 0;
        transform: translateX(-12px) scaleX(0.95);
      }
      100% {
        opacity: 1;
        transform: translateX(0) scaleX(1);
      }
    }
  `}</style>
)

// Inject styles once — rendered at the top of the vendor landscape
export { AnimationStyles }
