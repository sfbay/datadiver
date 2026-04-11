# Home Page Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the DataDiver home page from mascot + tile grid into a data journalism front page with four hero "investigation" visualizations, a universal OmniSearch, and compressed exploration tiles.

**Architecture:** Independent React components per hero viz, each with a dedicated data hook using module-level 30min caching (same pattern as `useCivicIndicators`). A shared `InvestigationCard` wrapper provides consistent chrome. OmniSearch builds a client-side index from existing registries. Home.tsx composes all zones with staggered loading.

**Tech Stack:** React 18, TypeScript, D3.js (existing), Socrata SODA API via `fetchDataset()`, Tailwind v4, existing glass-card design system.

**Spec:** `docs/superpowers/specs/2026-04-10-home-page-evolution-design.md`

**Verification:** This project has no test runner. Use `npx tsc -b` for type-checking (the CI gate) and `pnpm dev` for visual verification. Each task ends with a type-check pass and a commit.

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/components/investigations/InvestigationCard.tsx` | Shared card chrome: eyebrow, headline, footer, skeleton, click-to-navigate |
| `src/components/investigations/DeficitCounter.tsx` | Budget deficit hero viz with ticking counter |
| `src/components/investigations/ResponseEquity.tsx` | 911 response time equity gap viz |
| `src/components/investigations/DispatchUnanswered.tsx` | 911 calls unanswered viz |
| `src/components/investigations/ComplianceTracker.tsx` | Ethnic media compliance viz |
| `src/hooks/useDeficitData.ts` | Fetches spending vs revenue, computes deficit + rate + trend |
| `src/hooks/useResponseEquity.ts` | Fetches median response time by neighborhood + historical gap |
| `src/hooks/useDispatchUnanswered.ts` | Fetches 911 calls exceeding 10min response target |
| `src/components/search/OmniSearch.tsx` | Search input + typeahead dropdown |
| `src/components/search/useOmniSearch.ts` | Search logic: index building, matching, result ranking |

### Modified Files

| File | Change |
|------|--------|
| `src/views/Home/Home.tsx` | New zone layout, compressed tiles, integrate investigations + omnibox |
| `src/views/Neighborhood/useNeighborhoodProfiles.ts` | Add 30min module-level cache |
| `src/components/layout/AppShell.tsx` | Add `⌘K` / `Ctrl+K` global shortcut |

---

## Task 1: InvestigationCard Shared Chrome

**Files:**
- Create: `src/components/investigations/InvestigationCard.tsx`

This is the wrapper every hero viz uses. Provides consistent eyebrow, headline, footer, skeleton, and click behavior.

- [ ] **Step 1: Create InvestigationCard component**

```tsx
// src/components/investigations/InvestigationCard.tsx
import { useNavigate } from 'react-router-dom'
import { Skeleton } from '@/components/ui/Skeleton'

export interface InvestigationCardProps {
  /** Eyebrow label, e.g. "911 Response · Equity Gap" */
  eyebrow: string
  /** Accent color hex for dot and hover effects */
  accentColor: string
  /** Editorial headline in plain English */
  headline: string
  /** Subtitle with data source and time range */
  subtitle: string
  /** Route to navigate to on "Explore →" click */
  explorePath: string
  /** Human-readable dataset name for footer */
  sourceName: string
  /** Whether the data is still loading */
  isLoading: boolean
  /** Card body content */
  children: React.ReactNode
}

export function InvestigationCard({
  eyebrow,
  accentColor,
  headline,
  subtitle,
  explorePath,
  sourceName,
  isLoading,
  children,
}: InvestigationCardProps) {
  const navigate = useNavigate()

  if (isLoading) return <InvestigationSkeleton />

  return (
    <button
      onClick={() => navigate(explorePath)}
      className="group text-left w-full glass-card rounded-2xl overflow-hidden hover:bg-white/[0.04] transition-all duration-300 flex flex-col"
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-0">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="w-[5px] h-[5px] rounded-full flex-shrink-0"
            style={{
              backgroundColor: accentColor,
              boxShadow: `0 0 6px ${accentColor}80`,
              animation: 'pulse 2.5s ease-in-out infinite',
            }}
          />
          <span
            className="text-[8px] font-mono uppercase tracking-[2.5px] font-semibold"
            style={{ color: accentColor }}
          >
            {eyebrow}
          </span>
        </div>
        <h3
          className="text-[15px] leading-snug text-white mb-0.5"
          style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontStyle: 'italic' }}
        >
          {headline}
        </h3>
        <p className="text-[9px] font-mono text-slate-500 mb-3">{subtitle}</p>
      </div>

      {/* Body — hero viz content */}
      <div className="px-5 pb-3 flex-1">{children}</div>

      {/* Footer */}
      <div className="px-5 py-2.5 border-t border-white/[0.03] flex justify-between items-center mt-auto">
        <span className="text-[7px] font-mono text-slate-700">{sourceName}</span>
        <span className="text-[9px] font-mono text-slate-500 group-hover:text-slate-300 transition-colors">
          Explore →
        </span>
      </div>
    </button>
  )
}

function InvestigationSkeleton() {
  return (
    <div className="glass-card rounded-2xl p-5 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <Skeleton className="w-2 h-2 rounded-full" />
        <Skeleton className="h-2 w-32" />
      </div>
      <Skeleton className="h-4 w-4/5 mb-1" />
      <Skeleton className="h-2 w-48 mb-4" />
      <Skeleton className="h-24 w-full rounded-lg mb-3" />
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc -b`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/investigations/InvestigationCard.tsx
git commit -m "feat(home): add InvestigationCard shared chrome component"
```

---

## Task 2: useDeficitData Hook

**Files:**
- Create: `src/hooks/useDeficitData.ts`

Fetches spending and revenue from `spendingRevenue` dataset (`bpnb-jwfb`), computes the deficit, per-second rate, FY-over-FY trend, and top department contributors.

- [ ] **Step 1: Create the hook**

```tsx
// src/hooks/useDeficitData.ts
import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'

// ── Module-level cache ──────────────────────────────────────
interface CacheEntry {
  data: DeficitData
  timestamp: number
  dateKey: string
}
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes
let deficitCache: CacheEntry | null = null

// ── Types ───────────────────────────────────────────────────
interface SpendingRow {
  fiscal_year: string
  revenue_or_spending: string
  total: string
}

interface DeptRow {
  department: string
  total: string
}

export interface FYTrend {
  fiscalYear: string
  spending: number
  revenue: number
  gap: number
}

export interface DeptContributor {
  department: string
  spending: number
  pctOfTotal: number
}

export interface DeficitData {
  /** Current FY total spending */
  totalSpending: number
  /** Current FY total revenue */
  totalRevenue: number
  /** Spending minus revenue */
  deficit: number
  /** Computed dollars per second (deficit / seconds elapsed in FY) */
  perSecond: number
  /** Computed dollars per day */
  perDay: number
  /** FY-over-FY trend (up to 5 years) */
  trend: FYTrend[]
  /** Top 3 departments by spending */
  topDepartments: DeptContributor[]
  /** Year-over-year % change in deficit */
  yoyPct: number
}

export interface UseDeficitDataResult {
  data: DeficitData | null
  isLoading: boolean
  error: string | null
}

// ── Helper: current fiscal year label (SF FY runs Jul 1 – Jun 30) ──
function currentFYLabel(): string {
  const now = new Date()
  const year = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()
  return `FY${year - 1}-${year}`
}

function fyStartDate(fyLabel: string): Date {
  // "FY2025-2026" → July 1, 2025
  const match = fyLabel.match(/FY(\d{4})/)
  const startYear = match ? parseInt(match[1], 10) : new Date().getFullYear()
  return new Date(startYear, 6, 1) // July 1
}

// ── Hook ────────────────────────────────────────────────────
export function useDeficitData(): UseDeficitDataResult {
  const [data, setData] = useState<DeficitData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)

  useEffect(() => {
    abortRef.current = false
    const dateKey = currentFYLabel()

    // Check cache
    if (
      deficitCache &&
      deficitCache.dateKey === dateKey &&
      Date.now() - deficitCache.timestamp < CACHE_TTL
    ) {
      setData(deficitCache.data)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    computeDeficit(dateKey).then((result) => {
      if (abortRef.current) return
      deficitCache = { data: result, timestamp: Date.now(), dateKey }
      setData(result)
      setIsLoading(false)
    }).catch((e) => {
      if (abortRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to load deficit data')
      setIsLoading(false)
    })

    return () => { abortRef.current = true }
  }, [])

  return { data, isLoading, error }
}

async function computeDeficit(currentFY: string): Promise<DeficitData> {
  // Query 1: Spending vs revenue by FY (last 5 years)
  // Query 2: Top departments by spending for current FY
  const [trendRows, deptRows] = await Promise.all([
    fetchDataset<SpendingRow>('spendingRevenue', {
      $select: 'fiscal_year, revenue_or_spending, SUM(amount) as total',
      $group: 'fiscal_year, revenue_or_spending',
      $order: 'fiscal_year DESC',
      $limit: 20,
    }),
    fetchDataset<DeptRow>('spendingRevenue', {
      $select: 'department, SUM(amount) as total',
      $where: `fiscal_year = '${currentFY}' AND revenue_or_spending = 'Spending'`,
      $group: 'department',
      $order: 'total DESC',
      $limit: 5,
    }),
  ])

  // Build FY trend
  const fyMap = new Map<string, { spending: number; revenue: number }>()
  for (const row of trendRows) {
    const fy = row.fiscal_year
    if (!fyMap.has(fy)) fyMap.set(fy, { spending: 0, revenue: 0 })
    const entry = fyMap.get(fy)!
    const amount = parseFloat(row.total) || 0
    if (row.revenue_or_spending === 'Spending') entry.spending += amount
    else entry.revenue += amount
  }

  const trend: FYTrend[] = Array.from(fyMap.entries())
    .map(([fy, v]) => ({ fiscalYear: fy, spending: v.spending, revenue: v.revenue, gap: v.spending - v.revenue }))
    .sort((a, b) => a.fiscalYear.localeCompare(b.fiscalYear))
    .slice(-5)

  // Current FY numbers
  const current = fyMap.get(currentFY) || { spending: 0, revenue: 0 }
  const deficit = current.spending - current.revenue

  // Per-second rate: deficit / seconds elapsed in FY so far
  const fyStart = fyStartDate(currentFY)
  const secondsElapsed = Math.max(1, (Date.now() - fyStart.getTime()) / 1000)
  const perSecond = deficit / secondsElapsed
  const perDay = perSecond * 86400

  // Top departments
  const totalSpending = current.spending
  const topDepartments: DeptContributor[] = deptRows.slice(0, 3).map((r) => {
    const spending = parseFloat(r.total) || 0
    return {
      department: r.department,
      spending,
      pctOfTotal: totalSpending > 0 ? (spending / totalSpending) * 100 : 0,
    }
  })

  // YoY deficit change
  const priorFY = trend.length >= 2 ? trend[trend.length - 2] : null
  const yoyPct = priorFY && priorFY.gap > 0
    ? ((deficit - priorFY.gap) / priorFY.gap) * 100
    : 0

  return {
    totalSpending: current.spending,
    totalRevenue: current.revenue,
    deficit,
    perSecond,
    perDay,
    trend,
    topDepartments,
    yoyPct,
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc -b`
Expected: no errors. If `spendingRevenue` dataset fields (`revenue_or_spending`, `amount`, `fiscal_year`) don't match exactly, adjust field names by checking `curl -s "https://data.sfgov.org/resource/bpnb-jwfb.json?\$limit=1" | python3 -m json.tool`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDeficitData.ts
git commit -m "feat(home): add useDeficitData hook — deficit counter data layer"
```

---

## Task 3: DeficitCounter Component

**Files:**
- Create: `src/components/investigations/DeficitCounter.tsx`

Renders the budget deficit hero viz with ticking counter, trend sparkline, and department breakdown.

- [ ] **Step 1: Create the component**

```tsx
// src/components/investigations/DeficitCounter.tsx
import { useRef, useEffect, useState } from 'react'
import { InvestigationCard } from './InvestigationCard'
import { useDeficitData } from '@/hooks/useDeficitData'

export default function DeficitCounter() {
  const { data, isLoading } = useDeficitData()
  const [displayAmount, setDisplayAmount] = useState(0)
  const startTimeRef = useRef(Date.now())
  const rafRef = useRef<number>()

  // Ticking counter effect
  useEffect(() => {
    if (!data) return
    startTimeRef.current = Date.now()

    const tick = () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000
      setDisplayAmount(data.deficit + elapsed * data.perSecond)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [data])

  const sinceOpened = data ? displayAmount - data.deficit : 0

  return (
    <InvestigationCard
      eyebrow="Budget Gap · This Fiscal Year"
      accentColor="#ef4444"
      headline={data ? 'The deficit is growing faster than revenue' : 'Loading budget data...'}
      subtitle="SF Controller · Spending & Revenue"
      explorePath="/city-budget"
      sourceName="Spending & Revenue Data"
      isLoading={isLoading}
    >
      {data && (
        <>
          {/* Big ticking number */}
          <div className="font-mono text-[28px] font-bold text-red-300 leading-none tracking-tight tabular-nums">
            ${displayAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-1.5">
            <span className="text-red-400">▲ ${Math.round(data.perSecond).toLocaleString()}</span>/sec
            {' · '}
            <span className="text-red-400">▲ ${(data.perDay / 1e6).toFixed(1)}M</span>/day
          </div>

          {/* Trend sparkline (SVG) */}
          {data.trend.length > 1 && (
            <div className="mt-3">
              <svg viewBox="0 0 160 32" className="w-full h-8">
                <defs>
                  <linearGradient id="deficit-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {(() => {
                  const gaps = data.trend.map((t) => t.gap)
                  const max = Math.max(...gaps)
                  const min = Math.min(...gaps, 0)
                  const range = max - min || 1
                  const points = gaps.map((g, i) => {
                    const x = (i / (gaps.length - 1)) * 160
                    const y = 28 - ((g - min) / range) * 24
                    return `${x},${y}`
                  })
                  const linePath = `M${points.join(' L')}`
                  const areaPath = `${linePath} L160,32 L0,32 Z`
                  return (
                    <>
                      <path d={areaPath} fill="url(#deficit-grad)" />
                      <path d={linePath} fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.7" />
                    </>
                  )
                })()}
                <text x="0" y="31" fontSize="6" fill="#334155" fontFamily="JetBrains Mono">
                  {data.trend[0]?.fiscalYear?.slice(0, 4) ?? ''}
                </text>
                <text x="140" y="31" fontSize="6" fill="#334155" fontFamily="JetBrains Mono">
                  {data.trend[data.trend.length - 1]?.fiscalYear?.slice(0, 4) ?? ''}
                </text>
              </svg>
            </div>
          )}

          {/* Department breakdown bar */}
          {data.topDepartments.length > 0 && (
            <>
              <div className="mt-2 flex gap-[2px] h-[5px] rounded-sm overflow-hidden">
                {data.topDepartments.map((d, i) => (
                  <div
                    key={d.department}
                    style={{
                      flex: d.pctOfTotal,
                      background: ['#ef4444', '#f97316', '#f59e0b'][i] ?? '#64748b',
                      opacity: 0.5,
                    }}
                  />
                ))}
                <div style={{ flex: 100 - data.topDepartments.reduce((s, d) => s + d.pctOfTotal, 0), background: '#64748b', opacity: 0.3 }} />
              </div>
              <div className="flex gap-3 mt-1 text-[7px] font-mono text-slate-500">
                {data.topDepartments.map((d, i) => (
                  <span key={d.department}>
                    <span style={{ color: ['#ef4444', '#f97316', '#f59e0b'][i] }}>■</span>
                    {' '}{d.department.slice(0, 12)} {Math.round(d.pctOfTotal)}%
                  </span>
                ))}
              </div>
            </>
          )}

          {/* "Since you opened" personalizer */}
          <div className="text-[9px] font-mono text-slate-600 mt-2">
            Since you opened this page:{' '}
            <span className="text-red-400">
              +${sinceOpened.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </span>
          </div>
        </>
      )}
    </InvestigationCard>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc -b`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/investigations/DeficitCounter.tsx
git commit -m "feat(home): add DeficitCounter component — ticking budget gap viz"
```

---

## Task 4: useResponseEquity Hook

**Files:**
- Create: `src/hooks/useResponseEquity.ts`

Fetches median Fire/EMS response time by neighborhood and computes the equity gap.

- [ ] **Step 1: Create the hook**

```tsx
// src/hooks/useResponseEquity.ts
import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'
import { useAppStore } from '@/stores/appStore'

// ── Module-level cache ──────────────────────────────────────
interface CacheEntry { data: ResponseEquityData; timestamp: number; dateKey: string }
const CACHE_TTL = 30 * 60 * 1000
let equityCache: CacheEntry | null = null

// ── Types ───────────────────────────────────────────────────
interface MedianRow {
  neighborhood: string
  median_response: string
  call_count: string
}

interface HeatgridRow {
  neighborhood: string
  call_type_group: string
  median_response: string
}

export interface NeighborhoodResponse {
  name: string
  medianSeconds: number
  medianFormatted: string
  callCount: number
}

export interface HeatgridCell {
  neighborhood: string
  callType: string
  medianSeconds: number
  medianFormatted: string
}

export interface ResponseEquityData {
  /** Fastest responding neighborhood */
  best: NeighborhoodResponse
  /** Slowest responding neighborhood */
  worst: NeighborhoodResponse
  /** City-wide median */
  cityAvg: NeighborhoodResponse
  /** Gap multiplier (worst / best) */
  gapMultiplier: number
  /** Call type × neighborhood heatgrid */
  heatgrid: HeatgridCell[]
  /** Neighborhoods in heatgrid (column headers) */
  heatgridNeighborhoods: string[]
  /** Call types in heatgrid (row headers) */
  heatgridCallTypes: string[]
}

export interface UseResponseEquityResult {
  data: ResponseEquityData | null
  isLoading: boolean
  error: string | null
}

function formatSeconds(s: number): string {
  const min = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export function useResponseEquity(): UseResponseEquityResult {
  const dateRange = useAppStore((s) => s.dateRange)
  const [data, setData] = useState<ResponseEquityData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)

  useEffect(() => {
    abortRef.current = false
    const dateKey = `${dateRange.start}|${dateRange.end}`

    if (equityCache && equityCache.dateKey === dateKey && Date.now() - equityCache.timestamp < CACHE_TTL) {
      setData(equityCache.data)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    computeEquity(dateRange.start, dateRange.end).then((result) => {
      if (abortRef.current) return
      equityCache = { data: result, timestamp: Date.now(), dateKey }
      setData(result)
      setIsLoading(false)
    }).catch((e) => {
      if (abortRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to load response equity data')
      setIsLoading(false)
    })

    return () => { abortRef.current = true }
  }, [dateRange.start, dateRange.end])

  return { data, isLoading, error }
}

async function computeEquity(start: string, end: string): Promise<ResponseEquityData> {
  const dateWhere = `received_dttm >= '${start}T00:00:00' AND received_dttm <= '${end}T23:59:59' AND on_scene_dttm IS NOT NULL`

  // Socrata doesn't support MEDIAN, so we use AVG as a proxy for the hero viz.
  // A future improvement could fetch raw data and compute median client-side for
  // a smaller set of neighborhoods.
  const responseCalc = "AVG(date_diff_d(on_scene_dttm, received_dttm, 'SS'))"

  const [neighborhoodRows, cityRow, heatgridRows] = await Promise.all([
    // Per-neighborhood average response time
    fetchDataset<MedianRow>('fireEMSDispatch', {
      $select: `neighborhoods_analysis_boundaries as neighborhood, ${responseCalc} as median_response, COUNT(*) as call_count`,
      $where: dateWhere,
      $group: 'neighborhoods_analysis_boundaries',
      $having: 'COUNT(*) > 50',
      $order: 'median_response ASC',
      $limit: 50,
    }),
    // City-wide average
    fetchDataset<MedianRow>('fireEMSDispatch', {
      $select: `'City Average' as neighborhood, ${responseCalc} as median_response, COUNT(*) as call_count`,
      $where: dateWhere,
      $limit: 1,
    }),
    // Heatgrid: call type × top/bottom neighborhoods
    fetchDataset<HeatgridRow>('fireEMSDispatch', {
      $select: `neighborhoods_analysis_boundaries as neighborhood, call_type_group, ${responseCalc} as median_response`,
      $where: dateWhere,
      $group: 'neighborhoods_analysis_boundaries, call_type_group',
      $having: 'COUNT(*) > 20',
      $order: 'neighborhood, call_type_group',
      $limit: 500,
    }),
  ])

  const toEntry = (r: MedianRow): NeighborhoodResponse => {
    const sec = parseFloat(r.median_response) || 0
    return { name: r.neighborhood, medianSeconds: sec, medianFormatted: formatSeconds(sec), callCount: parseInt(r.call_count, 10) || 0 }
  }

  const sorted = neighborhoodRows.filter((r) => r.neighborhood).map(toEntry)
  const best = sorted[0] ?? { name: 'N/A', medianSeconds: 0, medianFormatted: '0:00', callCount: 0 }
  const worst = sorted[sorted.length - 1] ?? best
  const cityAvg = cityRow[0] ? toEntry(cityRow[0]) : { name: 'City Average', medianSeconds: 0, medianFormatted: '0:00', callCount: 0 }
  const gapMultiplier = best.medianSeconds > 0 ? worst.medianSeconds / best.medianSeconds : 1

  // Build heatgrid for the 5 most/least neighborhoods and top 4 call types
  const targetNeighborhoods = [best.name, sorted[1]?.name, cityAvg.name, sorted[sorted.length - 2]?.name, worst.name].filter(Boolean) as string[]
  const callTypeCounts = new Map<string, number>()
  for (const row of heatgridRows) {
    callTypeCounts.set(row.call_type_group, (callTypeCounts.get(row.call_type_group) || 0) + 1)
  }
  const topCallTypes = Array.from(callTypeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([ct]) => ct)

  const heatgrid: HeatgridCell[] = heatgridRows
    .filter((r) => targetNeighborhoods.includes(r.neighborhood) && topCallTypes.includes(r.call_type_group))
    .map((r) => {
      const sec = parseFloat(r.median_response) || 0
      return { neighborhood: r.neighborhood, callType: r.call_type_group, medianSeconds: sec, medianFormatted: formatSeconds(sec) }
    })

  return {
    best,
    worst,
    cityAvg,
    gapMultiplier,
    heatgrid,
    heatgridNeighborhoods: targetNeighborhoods,
    heatgridCallTypes: topCallTypes,
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc -b`
Expected: no errors. If `date_diff_d` function or field names don't match Socrata's API, check with a test query: `curl -s "https://data.sfgov.org/resource/nuek-vuh3.json?\$select=*&\$limit=1" | python3 -m json.tool`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useResponseEquity.ts
git commit -m "feat(home): add useResponseEquity hook — neighborhood response time comparison"
```

---

## Task 5: ResponseEquity Component

**Files:**
- Create: `src/components/investigations/ResponseEquity.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/investigations/ResponseEquity.tsx
import { InvestigationCard } from './InvestigationCard'
import { useResponseEquity } from '@/hooks/useResponseEquity'

const BAR_COLORS = {
  best: { text: '#86efac', bar: 'linear-gradient(90deg, #10b981, #34d399)' },
  avg: { text: '#94a3b8', bar: 'linear-gradient(90deg, #64748b, #94a3b8)' },
  worst: { text: '#fca5a5', bar: 'linear-gradient(90deg, #ef4444, #fca5a5)' },
}

export default function ResponseEquity() {
  const { data, isLoading } = useResponseEquity()

  const maxSeconds = data ? Math.max(data.best.medianSeconds, data.worst.medianSeconds, data.cityAvg.medianSeconds) : 1

  return (
    <InvestigationCard
      eyebrow="911 Response · The Equity Gap"
      accentColor="#f59e0b"
      headline={data ? `Help takes ${data.gapMultiplier.toFixed(1)}× longer in ${data.worst.name}` : 'Loading response data...'}
      subtitle="Fire/EMS Dispatch · Average response time by neighborhood"
      explorePath="/emergency-response"
      sourceName="SFFD Dispatch Data"
      isLoading={isLoading}
    >
      {data && (
        <>
          {/* Three equity bars */}
          <div className="flex flex-col gap-[6px]">
            {([
              { entry: data.best, tier: 'best' as const },
              { entry: data.cityAvg, tier: 'avg' as const },
              { entry: data.worst, tier: 'worst' as const },
            ]).map(({ entry, tier }) => (
              <div key={tier} className="flex items-center gap-2">
                <span className="text-[9px] w-[72px] text-right flex-shrink-0 font-medium" style={{ color: BAR_COLORS[tier].text }}>
                  {entry.name.length > 14 ? entry.name.slice(0, 14) + '…' : entry.name}
                </span>
                <div className="flex-1 h-[5px] rounded-sm overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${(entry.medianSeconds / maxSeconds) * 100}%`,
                      background: BAR_COLORS[tier].bar,
                    }}
                  />
                </div>
                <span className="text-[14px] font-bold font-mono w-10 tabular-nums" style={{ color: BAR_COLORS[tier].text }}>
                  {entry.medianFormatted}
                </span>
              </div>
            ))}
          </div>

          {/* Gap callout */}
          <div className="mt-2 px-2.5 py-1.5 rounded-md flex items-baseline gap-1" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)' }}>
            <span className="text-[12px] font-bold font-mono text-red-300">{data.gapMultiplier.toFixed(1)}×</span>
            <span className="text-[9px] text-slate-400">slower — the gap between fastest and slowest neighborhoods</span>
          </div>

          {/* Mini heatgrid */}
          {data.heatgrid.length > 0 && (
            <div className="mt-2">
              <div
                className="grid gap-[1px] text-[7px] font-mono"
                style={{ gridTemplateColumns: `50px repeat(${data.heatgridNeighborhoods.length}, 1fr)` }}
              >
                {/* Column headers */}
                <div />
                {data.heatgridNeighborhoods.map((n) => (
                  <div key={n} className="text-center text-slate-600 truncate px-0.5">
                    {n.slice(0, 5)}
                  </div>
                ))}

                {/* Rows by call type */}
                {data.heatgridCallTypes.map((ct) => (
                  <div key={ct} className="contents">
                    <div className="text-right text-slate-600 pr-1 truncate">{ct.slice(0, 8)}</div>
                    {data.heatgridNeighborhoods.map((n) => {
                      const cell = data.heatgrid.find((c) => c.neighborhood === n && c.callType === ct)
                      const intensity = cell ? Math.min(cell.medianSeconds / (maxSeconds * 1.2), 1) : 0
                      const color = intensity > 0.6 ? 'rgba(239,68,68,' : intensity > 0.35 ? 'rgba(245,158,11,' : 'rgba(52,211,153,'
                      return (
                        <div
                          key={`${n}-${ct}`}
                          className="h-[14px] rounded-sm"
                          style={{ background: `${color}${(0.15 + intensity * 0.35).toFixed(2)})` }}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </InvestigationCard>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/components/investigations/ResponseEquity.tsx
git commit -m "feat(home): add ResponseEquity component — equity gap visualization"
```

---

## Task 6: useDispatchUnanswered Hook

**Files:**
- Create: `src/hooks/useDispatchUnanswered.ts`

- [ ] **Step 1: Create the hook**

```tsx
// src/hooks/useDispatchUnanswered.ts
import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'
import { useAppStore } from '@/stores/appStore'
import { yearAgo } from '@/utils/time'

// ── Module-level cache ──────────────────────────────────────
interface CacheEntry { data: UnansweredData; timestamp: number; dateKey: string }
const CACHE_TTL = 30 * 60 * 1000
let unansweredCache: CacheEntry | null = null

// ── Types ───────────────────────────────────────────────────
interface CountRow { cnt: string }
interface HourRow { hour: string; cnt: string }
interface StatusRow { final_disposition: string; cnt: string }

export interface UnansweredData {
  /** Total calls exceeding 10-min response target */
  totalExceeded: number
  /** Same metric for prior year period */
  priorYearTotal: number
  /** Percentage change vs last year */
  yoyPct: number
  /** Hourly distribution (24 entries, 0=midnight) */
  hourlyDistribution: number[]
  /** Outcome breakdown */
  outcomes: Array<{ label: string; count: number; pct: number }>
}

export interface UseDispatchUnansweredResult {
  data: UnansweredData | null
  isLoading: boolean
  error: string | null
}

export function useDispatchUnanswered(): UseDispatchUnansweredResult {
  const dateRange = useAppStore((s) => s.dateRange)
  const [data, setData] = useState<UnansweredData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)

  useEffect(() => {
    abortRef.current = false
    const dateKey = `${dateRange.start}|${dateRange.end}`

    if (unansweredCache && unansweredCache.dateKey === dateKey && Date.now() - unansweredCache.timestamp < CACHE_TTL) {
      setData(unansweredCache.data)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    computeUnanswered(dateRange.start, dateRange.end).then((result) => {
      if (abortRef.current) return
      unansweredCache = { data: result, timestamp: Date.now(), dateKey }
      setData(result)
      setIsLoading(false)
    }).catch((e) => {
      if (abortRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to load dispatch data')
      setIsLoading(false)
    })

    return () => { abortRef.current = true }
  }, [dateRange.start, dateRange.end])

  return { data, isLoading, error }
}

async function computeUnanswered(start: string, end: string): Promise<UnansweredData> {
  const curWhere = `received_dttm >= '${start}T00:00:00' AND received_dttm <= '${end}T23:59:59'`
  const slowWhere = `${curWhere} AND (on_scene_dttm IS NULL OR date_diff_d(on_scene_dttm, received_dttm, 'MI') > 10)`

  const priStart = yearAgo(start)
  const priEnd = yearAgo(end)
  const priWhere = `received_dttm >= '${priStart}T00:00:00' AND received_dttm <= '${priEnd}T23:59:59'`
  const priSlowWhere = `${priWhere} AND (on_scene_dttm IS NULL OR date_diff_d(on_scene_dttm, received_dttm, 'MI') > 10)`

  const [curCount, priCount, hourly, dispositions] = await Promise.all([
    fetchDataset<CountRow>('fireEMSDispatch', {
      $select: 'COUNT(*) as cnt',
      $where: slowWhere,
      $limit: 1,
    }),
    fetchDataset<CountRow>('fireEMSDispatch', {
      $select: 'COUNT(*) as cnt',
      $where: priSlowWhere,
      $limit: 1,
    }),
    fetchDataset<HourRow>('fireEMSDispatch', {
      $select: "date_extract_hh(received_dttm) as hour, COUNT(*) as cnt",
      $where: slowWhere,
      $group: 'hour',
      $order: 'hour ASC',
      $limit: 24,
    }),
    fetchDataset<StatusRow>('fireEMSDispatch', {
      $select: 'final_disposition, COUNT(*) as cnt',
      $where: slowWhere,
      $group: 'final_disposition',
      $order: 'cnt DESC',
      $limit: 10,
    }),
  ])

  const totalExceeded = parseInt(curCount[0]?.cnt, 10) || 0
  const priorYearTotal = parseInt(priCount[0]?.cnt, 10) || 0
  const yoyPct = priorYearTotal > 0
    ? ((totalExceeded - priorYearTotal) / priorYearTotal) * 100
    : 0

  // Hourly distribution — fill all 24 hours
  const hourlyDistribution = new Array(24).fill(0)
  for (const row of hourly) {
    const h = parseInt(row.hour, 10)
    if (h >= 0 && h < 24) hourlyDistribution[h] = parseInt(row.cnt, 10) || 0
  }

  // Outcomes — group dispositions into human-readable buckets
  const outcomeMap = new Map<string, number>()
  for (const row of dispositions) {
    const count = parseInt(row.cnt, 10) || 0
    const disp = (row.final_disposition || '').toUpperCase()
    if (disp.includes('CANCEL') || disp.includes('CAN')) {
      outcomeMap.set('Cancelled', (outcomeMap.get('Cancelled') || 0) + count)
    } else if (disp.includes('NO MERIT') || disp.includes('GONE ON ARRIVAL') || disp === 'GOA') {
      outcomeMap.set('No one there', (outcomeMap.get('No one there') || 0) + count)
    } else {
      outcomeMap.set('Late arrival', (outcomeMap.get('Late arrival') || 0) + count)
    }
  }

  const outcomes = Array.from(outcomeMap.entries())
    .map(([label, count]) => ({
      label,
      count,
      pct: totalExceeded > 0 ? (count / totalExceeded) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)

  return { totalExceeded, priorYearTotal, yoyPct, hourlyDistribution, outcomes }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDispatchUnanswered.ts
git commit -m "feat(home): add useDispatchUnanswered hook — 911 response target data"
```

---

## Task 7: DispatchUnanswered Component

**Files:**
- Create: `src/components/investigations/DispatchUnanswered.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/investigations/DispatchUnanswered.tsx
import { InvestigationCard } from './InvestigationCard'
import { useDispatchUnanswered } from '@/hooks/useDispatchUnanswered'

export default function DispatchUnanswered() {
  const { data, isLoading } = useDispatchUnanswered()

  return (
    <InvestigationCard
      eyebrow="911 Dispatch · Unanswered"
      accentColor="#f97316"
      headline={data ? `${data.totalExceeded.toLocaleString()} times help took more than 10 minutes` : 'Loading dispatch data...'}
      subtitle="Fire/EMS Dispatch · Calls exceeding 10-min response target"
      explorePath="/emergency-response"
      sourceName="SFFD Dispatch Data"
      isLoading={isLoading}
    >
      {data && (
        <>
          {/* Big number */}
          <div className="font-mono text-[28px] font-bold text-amber-200 leading-none tabular-nums">
            {data.totalExceeded.toLocaleString()}
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-1">
            {data.yoyPct > 0
              ? <><span className="text-red-400">▲ {Math.round(Math.abs(data.yoyPct))}%</span> more than last year</>
              : data.yoyPct < 0
                ? <><span className="text-green-400">▼ {Math.round(Math.abs(data.yoyPct))}%</span> fewer than last year</>
                : 'About the same as last year'
            }
          </div>

          {/* Hourly heatstrip */}
          <div className="mt-3">
            <div className="text-[7px] font-mono text-slate-600 uppercase tracking-wider mb-1">
              When calls go unanswered
            </div>
            <div className="flex gap-[1px] h-4">
              {data.hourlyDistribution.map((count, hour) => {
                const max = Math.max(...data.hourlyDistribution, 1)
                const intensity = count / max
                const isEvening = hour >= 17 && hour <= 22
                const color = isEvening
                  ? `rgba(239,68,68,${(0.08 + intensity * 0.7).toFixed(2)})`
                  : `rgba(249,115,22,${(0.05 + intensity * 0.55).toFixed(2)})`
                return <div key={hour} className="flex-1 rounded-sm" style={{ background: color }} />
              })}
            </div>
            <div className="flex justify-between text-[6px] font-mono text-slate-700 mt-0.5">
              <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>12am</span>
            </div>
          </div>

          {/* Outcome breakdown */}
          {data.outcomes.length > 0 && (
            <div className="mt-2 flex gap-3 text-[8px] font-mono">
              {data.outcomes.slice(0, 3).map((o) => (
                <div key={o.label}>
                  <span className="text-[13px] font-bold" style={{ color: o.label === 'Cancelled' ? '#ef4444' : o.label === 'Late arrival' ? '#f97316' : '#64748b' }}>
                    {Math.round(o.pct)}%
                  </span>
                  {' '}
                  <span className="text-slate-500">{o.label.toLowerCase()}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </InvestigationCard>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/components/investigations/DispatchUnanswered.tsx
git commit -m "feat(home): add DispatchUnanswered component — unanswered 911 calls viz"
```

---

## Task 8: ComplianceTracker Component

**Files:**
- Create: `src/components/investigations/ComplianceTracker.tsx`

Reuses the existing `useComplianceData` hook — only needs a component.

- [ ] **Step 1: Create the component**

```tsx
// src/components/investigations/ComplianceTracker.tsx
import { InvestigationCard } from './InvestigationCard'
import { useComplianceData } from '@/hooks/useComplianceData'

export default function ComplianceTracker() {
  const compliance = useComplianceData()

  const pct = compliance.compliancePct
  const isLoading = compliance.isLoading

  return (
    <InvestigationCard
      eyebrow="Resolution 240210 · Compliance"
      accentColor="#10b981"
      headline={!isLoading ? `The city spends ${pct.toFixed(1)}% where law requires 50%` : 'Loading compliance data...'}
      subtitle="Discretionary ad spend → Community & ethnic media"
      explorePath="/city-budget"
      sourceName="SF Controller · Vendor Payments"
      isLoading={isLoading}
    >
      {!isLoading && (
        <>
          {/* Big percentage vs target */}
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[28px] font-bold text-emerald-300 leading-none tabular-nums">
              {pct.toFixed(1)}%
            </span>
            <span className="text-[12px] text-slate-500">of</span>
            <span className="font-mono text-[18px] font-bold text-slate-600">50%</span>
          </div>

          {/* Progress bar with target line */}
          <div className="mt-2 relative">
            <div className="h-[8px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(pct * 2, 100)}%`,
                  background: 'linear-gradient(90deg, #10b981, #34d399)',
                }}
              />
            </div>
            {/* 50% target line */}
            <div
              className="absolute top-[-2px] bottom-[-2px] w-[2px] rounded-full"
              style={{ left: '50%', background: '#f59e0b' }}
            />
          </div>
          <div className="flex justify-between text-[7px] font-mono text-slate-700 mt-0.5">
            <span>0%</span>
            <span className="text-amber-500">50% target</span>
            <span>100%</span>
          </div>

          {/* Multi-year trend */}
          {compliance.trend.length > 1 && (
            <div className="mt-2 flex items-center gap-2">
              <svg viewBox="0 0 120 24" className="flex-1 h-6">
                {(() => {
                  const pcts = compliance.trend.map((t) => t.compliancePct)
                  const max = Math.max(...pcts, 50)
                  const points = pcts.map((p, i) => {
                    const x = (i / (pcts.length - 1)) * 120
                    const y = 22 - (p / max) * 20
                    return `${x},${y}`
                  })
                  const targetY = 22 - (50 / max) * 20
                  return (
                    <>
                      <line x1="0" y1={targetY} x2="120" y2={targetY} stroke="#f59e0b" strokeWidth="0.75" strokeDasharray="3,3" opacity="0.3" />
                      <path d={`M${points.join(' L')}`} fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.7" />
                    </>
                  )
                })()}
              </svg>
              <div className="text-[8px] font-mono text-slate-500">
                <div className="text-emerald-400 font-semibold">
                  {compliance.trend[compliance.trend.length - 1].compliancePct > compliance.trend[0].compliancePct ? '▲ rising' : '▼ falling'}
                </div>
                <div className="text-slate-600">but far from 50%</div>
              </div>
            </div>
          )}

          {/* Dollar context */}
          <div className="mt-1.5 text-[8px] font-mono text-slate-500">
            <span className="text-emerald-300 font-semibold">
              ${(compliance.ethnicMediaSpend / 1000).toFixed(0)}K
            </span>
            {' '}ethnic media · {' '}
            <span className="text-slate-400">
              ${(compliance.totalDiscretionary / 1e6).toFixed(1)}M
            </span>
            {' '}discretionary
          </div>
        </>
      )}
    </InvestigationCard>
  )
}
```

- [ ] **Step 2: Verify the component compiles against useComplianceData's return type**

Run: `npx tsc -b`

Check that `compliance.compliancePct`, `compliance.trend`, `compliance.ethnicMediaSpend`, and `compliance.totalDiscretionary` exist on the `ComplianceData` type. They do per the interface at `src/hooks/useComplianceData.ts:46-68`.

- [ ] **Step 3: Commit**

```bash
git add src/components/investigations/ComplianceTracker.tsx
git commit -m "feat(home): add ComplianceTracker component — ethnic media compliance viz"
```

---

## Task 9: Cache Neighborhood Profiles

**Files:**
- Modify: `src/views/Neighborhood/useNeighborhoodProfiles.ts`

Add module-level cache to avoid re-running 15-25 Socrata queries on every mount.

- [ ] **Step 1: Add module-level cache**

Add above the `extract` function (around line 7):

```tsx
// ── Module-level cache ──────────────────────────────────────
interface ProfileCacheEntry {
  profiles: NeighborhoodProfile[]
  profileMap: Map<string, NeighborhoodProfile>
  timestamp: number
  dateKey: string
}
const PROFILE_CACHE_TTL = 30 * 60 * 1000 // 30 minutes
let profileCache: ProfileCacheEntry | null = null
```

Then modify the `useNeighborhoodProfiles` function to check and populate the cache. Wrap the existing `useMemo` result in a cache check:

At the end of the hook function, before `return { profiles, profileMap, isLoading }`, add cache write logic. And at the top of the function, after the `useTrendBaseline` calls and `isLoading` check, add a cache read:

```tsx
export function useNeighborhoodProfiles(
  dateRange: { start: string; end: string }
): NeighborhoodProfilesResult {
  const dateKey = `${dateRange.start}|${dateRange.end}`

  // Check module-level cache before firing any trend queries
  // Note: useTrendBaseline hooks still fire (React rules), but they have their own caches.
  // This cache prevents the expensive useMemo recomputation.

  // ... existing useTrendBaseline calls stay as-is ...

  const { profiles, profileMap } = useMemo(() => {
    // Check cache first
    if (
      profileCache &&
      profileCache.dateKey === dateKey &&
      Date.now() - profileCache.timestamp < PROFILE_CACHE_TTL
    ) {
      return { profiles: profileCache.profiles, profileMap: profileCache.profileMap }
    }

    // ... existing computation ...

    // Write cache before returning
    profileCache = { profiles: sorted, profileMap: map, timestamp: Date.now(), dateKey }
    return { profiles: sorted, profileMap: map }
  }, [
    // ... existing deps, add dateKey ...
    trendER.neighborhoodMap, trendCrime.neighborhoodMap,
    trend311.neighborhoodMap, trendCrashes.neighborhoodMap,
    trendCitations.neighborhoodMap, dateKey,
  ])

  return { profiles, profileMap, isLoading }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/views/Neighborhood/useNeighborhoodProfiles.ts
git commit -m "perf(home): add 30min module-level cache to neighborhood profiles"
```

---

## Task 10: OmniSearch Component

**Files:**
- Create: `src/components/search/useOmniSearch.ts`
- Create: `src/components/search/OmniSearch.tsx`

- [ ] **Step 1: Create the search hook**

```tsx
// src/components/search/useOmniSearch.ts
import { useState, useMemo, useCallback } from 'react'
import { DATASETS } from '@/api/datasets'
import { SF_NEIGHBORHOODS } from '@/utils/geo'

export type SearchCategory = 'place' | 'dataset' | 'vendor' | 'time'

export interface SearchResult {
  id: string
  category: SearchCategory
  label: string
  sublabel: string
  icon: string
  /** Route to navigate to */
  path: string
  /** URL params to append */
  params?: Record<string, string>
}

// ── Build static index on first call ────────────────────────
let indexCache: SearchResult[] | null = null

function buildIndex(): SearchResult[] {
  if (indexCache) return indexCache

  const results: SearchResult[] = []

  // Neighborhoods
  for (const name of SF_NEIGHBORHOODS) {
    results.push({
      id: `place-${name}`,
      category: 'place',
      label: name,
      sublabel: 'Neighborhood',
      icon: '📍',
      path: '/neighborhood',
      params: { n: name },
    })
  }

  // Datasets
  for (const [key, config] of Object.entries(DATASETS)) {
    // Map dataset keys to their view routes
    const routeMap: Record<string, string> = {
      fireEMSDispatch: '/emergency-response',
      policeIncidents: '/crime-incidents',
      dispatch911Realtime: '/dispatch-911',
      dispatch911Historical: '/dispatch-911',
      cases311: '/311-cases',
      parkingRevenue: '/parking-revenue',
      parkingCitations: '/parking-citations',
      trafficCrashes: '/traffic-safety',
      businessLocations: '/business-activity',
      campaignFinance: '/campaign-finance',
      vendorPayments: '/city-budget',
      budget: '/city-budget',
      spendingRevenue: '/city-budget',
    }
    const path = routeMap[key]
    if (!path) continue

    results.push({
      id: `dataset-${key}`,
      category: 'dataset',
      label: config.name,
      sublabel: config.description.slice(0, 60),
      icon: '📊',
      path,
    })
  }

  indexCache = results
  return results
}

// ── Hook ────────────────────────────────────────────────────
export function useOmniSearch() {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const index = useMemo(() => buildIndex(), [])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return index
      .filter((r) => r.label.toLowerCase().includes(q) || r.sublabel.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, index])

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => { setIsOpen(false); setQuery('') }, [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  return { query, setQuery, results, isOpen, open, close, toggle }
}
```

- [ ] **Step 2: Create the OmniSearch component**

```tsx
// src/components/search/OmniSearch.tsx
import { useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOmniSearch, type SearchResult } from './useOmniSearch'

interface OmniSearchProps {
  /** Render as inline bar (home page) or modal overlay (global ⌘K) */
  mode: 'inline' | 'modal'
  /** For modal mode: whether the modal is open */
  isOpen?: boolean
  /** For modal mode: close callback */
  onClose?: () => void
}

export default function OmniSearch({ mode, isOpen, onClose }: OmniSearchProps) {
  const navigate = useNavigate()
  const { query, setQuery, results } = useOmniSearch()
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus on open
  useEffect(() => {
    if ((mode === 'modal' && isOpen) || mode === 'inline') {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen, mode])

  // ESC to close modal
  useEffect(() => {
    if (mode !== 'modal' || !isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mode, isOpen, onClose])

  const handleSelect = (result: SearchResult) => {
    const params = result.params
      ? '?' + new URLSearchParams(result.params).toString()
      : ''
    navigate(`${result.path}${params}`)
    onClose?.()
    setQuery('')
  }

  const searchBar = (
    <div className="relative">
      <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-white/[0.06] bg-slate-950/60 hover:border-white/[0.12] transition-colors">
        <span className="text-slate-500 text-base">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search across time, place, vendor, dataset..."
          className="flex-1 bg-transparent text-[13px] text-slate-300 placeholder:text-slate-600 outline-none font-mono"
        />
        {mode === 'inline' && (
          <div className="flex gap-1.5 flex-shrink-0">
            <span className="text-[8px] font-mono text-slate-600 bg-white/[0.03] px-2 py-0.5 rounded border border-slate-800">
              ⌘K
            </span>
          </div>
        )}
      </div>

      {/* Results dropdown */}
      {results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-white/[0.06] bg-slate-900/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.04] transition-colors"
            >
              <span className="text-base">{r.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-slate-200 truncate">{r.label}</p>
                <p className="text-[9px] font-mono text-slate-500 truncate">{r.sublabel}</p>
              </div>
              <span className="text-[8px] font-mono text-slate-600 uppercase tracking-wider flex-shrink-0">
                {r.category}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  if (mode === 'modal') {
    if (!isOpen) return null
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] px-6" onClick={onClose}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
          {searchBar}
        </div>
      </div>
    )
  }

  return searchBar
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc -b`

- [ ] **Step 4: Commit**

```bash
git add src/components/search/useOmniSearch.ts src/components/search/OmniSearch.tsx
git commit -m "feat(home): add OmniSearch component — universal search with typeahead"
```

---

## Task 11: Global ⌘K Shortcut

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Add ⌘K listener and modal OmniSearch to AppShell**

Read `AppShell.tsx` to find the right insertion point. Add:

1. Import OmniSearch at the top:
```tsx
import { useState, useEffect } from 'react'
import OmniSearch from '@/components/search/OmniSearch'
```

2. Inside the AppShell component, add state and keyboard listener:
```tsx
const [omniOpen, setOmniOpen] = useState(false)

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setOmniOpen((v) => !v)
    }
  }
  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}, [])
```

3. Render the modal OmniSearch alongside the existing outlet:
```tsx
<OmniSearch mode="modal" isOpen={omniOpen} onClose={() => setOmniOpen(false)} />
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "feat(search): add ⌘K global shortcut for OmniSearch modal"
```

---

## Task 12: Recompose Home.tsx

**Files:**
- Modify: `src/views/Home/Home.tsx`

This is the integration task — add the investigations grid, omnibox, and compress tiles.

- [ ] **Step 1: Add imports for new components**

At the top of Home.tsx, add:
```tsx
import DeficitCounter from '@/components/investigations/DeficitCounter'
import ResponseEquity from '@/components/investigations/ResponseEquity'
import DispatchUnanswered from '@/components/investigations/DispatchUnanswered'
import ComplianceTracker from '@/components/investigations/ComplianceTracker'
import OmniSearch from '@/components/search/OmniSearch'
```

- [ ] **Step 2: Add Investigations section after Dana comic ribbon**

Insert after the `{/* Dana Comic Modal */}` closing `)}` and before the `{/* Civic Data Ticker */}` section:

```tsx
{/* Investigations — hero visualizations */}
<section
  className={`relative z-10 mb-8 transition-all duration-1000 delay-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
>
  <div className="flex items-center gap-2.5 mb-4">
    <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-slate-400/60 dark:text-slate-600">
      Investigations
    </p>
    <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
  </div>
  <div className="grid gap-4 md:grid-cols-2">
    <DeficitCounter />
    <ResponseEquity />
    <DispatchUnanswered />
    <ComplianceTracker />
  </div>
</section>
```

- [ ] **Step 3: Add OmniSearch section after investigations, before ticker**

```tsx
{/* OmniSearch */}
<section
  className={`relative z-10 mb-8 transition-all duration-1000 delay-600 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
>
  <OmniSearch mode="inline" />
</section>
```

- [ ] **Step 4: Compress exploration tiles to 4-column compact grid**

Replace the existing `VISUALIZATIONS.map` rendering block (the `<div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">` section) with a compressed 4-column layout:

```tsx
<div className="grid gap-2.5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
  {VISUALIZATIONS.map((viz, idx) => (
    <button
      key={viz.path}
      onClick={() => navigate(viz.path)}
      className={`
        group text-left overflow-hidden relative
        rounded-xl border border-white/[0.04]
        bg-slate-950/30 hover:bg-slate-950/50 hover:border-white/[0.1]
        transition-all duration-300
        px-3.5 py-3
        ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
      style={{ transitionDelay: `${600 + idx * 60}ms` }}
    >
      <div
        className="text-[9px] font-mono font-bold tracking-wider mb-1.5"
        style={{ color: viz.accentColor, opacity: 0.7 }}
      >
        {viz.badge}
      </div>
      <h3
        className="text-[14px] text-ink dark:text-slate-200 leading-tight mb-0.5"
        style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontStyle: 'italic' }}
      >
        {viz.title}
      </h3>
      <p className="text-[8px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-600">
        {viz.subtitle}
      </p>
    </button>
  ))}
</div>
```

- [ ] **Step 5: Verify types compile and visually verify**

Run: `npx tsc -b`
Run: `pnpm dev` — open http://localhost:5174 and verify the new page layout: Dana hero → comic → investigations 2×2 → omnibox → ticker → neighborhoods → compressed tiles.

- [ ] **Step 6: Commit**

```bash
git add src/views/Home/Home.tsx
git commit -m "feat(home): integrate investigations grid, omnibox, and compressed tiles"
```

---

## Task 13: Stagger Loading

**Files:**
- Modify: `src/views/Home/Home.tsx`

The investigations fire at mount. Stagger the ticker and profiles to avoid a query avalanche.

- [ ] **Step 1: Add delayed rendering for ticker and profiles**

Wrap the ticker and neighborhood sections in a delayed mount. Add state to Home component:

```tsx
const [showTicker, setShowTicker] = useState(false)
const [showProfiles, setShowProfiles] = useState(false)

useEffect(() => {
  const t1 = setTimeout(() => setShowTicker(true), 500)
  const t2 = setTimeout(() => setShowProfiles(true), 1000)
  return () => { clearTimeout(t1); clearTimeout(t2) }
}, [])
```

Then gate the existing ticker and profiles sections:

```tsx
{/* Civic Ticker — delayed 500ms */}
{showTicker && (
  <section ...>
    <CivicTicker ... />
  </section>
)}

{/* Neighborhood Profiles — delayed 1000ms */}
{showProfiles && (
  <section ...>
    {/* existing neighborhood profiles content */}
  </section>
)}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc -b`

- [ ] **Step 3: Visual verification**

Run: `pnpm dev` — on cold load, hero vizzes should appear first, then ticker fades in at 500ms, then profiles at 1000ms. Each shows its skeleton while loading.

- [ ] **Step 4: Commit**

```bash
git add src/views/Home/Home.tsx
git commit -m "perf(home): stagger ticker and profile loading to reduce query avalanche"
```

---

## Post-Implementation Verification

After all tasks are complete:

1. **Type check:** `npx tsc -b` — zero errors
2. **Build:** `pnpm build` — successful
3. **Visual audit:** Open http://localhost:5174 and verify:
   - Dana hero + comic ribbon render as before
   - 4 investigation cards render in 2×2 grid with skeletons → data
   - Deficit counter ticks
   - Omnibox accepts input and shows typeahead results
   - ⌘K opens modal omnibox from any page
   - Ticker and profiles appear after investigations
   - Exploration tiles are compact 4-column
4. **Performance:** Open DevTools Network tab — verify queries fire in staggered priority order, not all at once
5. **Cache:** Navigate away and back — data should load instantly from cache within 30min
