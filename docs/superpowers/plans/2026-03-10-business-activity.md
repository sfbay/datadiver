# Business Activity View Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a map-centric Business Activity view showing SF business opening/closing trends by neighborhood and sector, using the Registered Business Locations dataset (`g8m3-pdis`).

**Architecture:** Map hero with CardTray (net change, openings, closures), ChartTray (net formation mirrored bars, top sectors), 2-tab sidebar (Sectors filter + Neighborhoods). Client-side point-in-polygon assigns neighborhoods from coordinates since the dataset lacks `analysis_neighborhood`.

**Tech Stack:** React 18, TypeScript, Mapbox GL JS v3, D3.js, Zustand, Tailwind v4, Socrata SODA API

**Spec:** `docs/superpowers/specs/2026-03-10-business-activity-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/views/BusinessActivity/BusinessActivity.tsx` | Main view: queries, map layers, sidebar, cards, charts |
| `src/components/charts/NetFormationChart.tsx` | D3 mirrored bar chart (openings up/closures down) |
| `src/components/filters/SectorFilter.tsx` | NAICS category filter (follows CrashModeFilter pattern) |
| `src/components/ui/BusinessDetailPanel.tsx` | Glass-card detail overlay for selected business |
| `src/utils/pointInPolygon.ts` | Ray-casting point-in-polygon + batch neighborhood assignment |

### Modified Files
| File | Change |
|------|--------|
| `src/api/datasets.ts` | Add `businessLocations` dataset config |
| `src/types/datasets.ts` | Add `BusinessLocationRecord`, `SectorAggRow`, `BusinessMonthlyRow` types |
| `src/App.tsx` | Add `/business-activity` route |
| `src/components/layout/AppShell.tsx` | Add nav item |
| `src/views/Home/Home.tsx` | Add exploration card |
| `src/utils/glossary.ts` | Add business-related glossary entries |
| `src/stores/appStore.ts` | Add `selectedBusiness` / `setSelectedBusiness` state |

---

## Task 1: Dataset Registration & Types

Register the dataset and define TypeScript interfaces.

**Files:**
- Modify: `src/api/datasets.ts`
- Modify: `src/types/datasets.ts`

- [ ] **Step 1: Add dataset config to `src/api/datasets.ts`**

Add to the `DATASETS` object (alongside other entries). The category type union in `DatasetConfig` needs `'other'` added if not already present:

```typescript
businessLocations: {
  id: 'g8m3-pdis',
  name: 'Registered Business Locations',
  description: 'Business registrations with opening/closing dates and industry codes',
  endpoint: `${BASE_URL}/g8m3-pdis.json`,
  category: 'other',
  hasGeo: true,
  geoField: 'location',
  defaultSort: 'dba_start_date DESC',
  dateField: 'dba_start_date',
},
```

Check if `'other'` is already in the category union on `DatasetConfig`. If not, add it.

- [ ] **Step 2: Add TypeScript interfaces to `src/types/datasets.ts`**

Add at the end of the file:

```typescript
/** Registered Business Location (g8m3-pdis) */
export interface BusinessLocationRecord {
  uniqueid: string
  certificate_number: string
  ttxid: string
  ownership_name: string
  dba_name: string
  full_business_address: string
  city: string
  state: string
  business_zip: string
  dba_start_date: string
  dba_end_date: string | null
  location_start_date: string
  location_end_date: string | null
  naic_code: string
  naic_code_description: string
  parking_tax: boolean
  transient_occupancy_tax: boolean
  location: { type: string; coordinates: [number, number] } | null
}

/** Server-side aggregation row for sector counts */
export interface SectorAggRow {
  naic_code_description: string
  cnt: string
}

/** Monthly breakdown row for net formation chart */
export interface BusinessMonthlyRow {
  month: string
  cnt: string
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: clean build, no type errors

- [ ] **Step 4: Commit**

```bash
git add src/api/datasets.ts src/types/datasets.ts
git commit -m "Register businessLocations dataset and add types"
```

---

## Task 2: Point-in-Polygon Utility

Create a reusable utility for assigning neighborhood names from coordinates. The business dataset lacks `analysis_neighborhood`, so we derive it client-side using the SF neighborhood boundary GeoJSON (already loaded via `useNeighborhoodBoundaries`).

**Files:**
- Create: `src/utils/pointInPolygon.ts`

- [ ] **Step 1: Create `src/utils/pointInPolygon.ts`**

Implements ray-casting algorithm (no external dependency needed) and a batch assignment function:

```typescript
/**
 * Ray-casting point-in-polygon test.
 * Returns true if [lng, lat] is inside the polygon ring.
 */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Test if a point is inside a GeoJSON Polygon or MultiPolygon geometry.
 */
function pointInGeometry(lng: number, lat: number, geometry: GeoJSON.Geometry): boolean {
  if (geometry.type === 'Polygon') {
    // Test outer ring (index 0); holes would be indices 1+
    return pointInRing(lng, lat, geometry.coordinates[0])
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly) => pointInRing(lng, lat, poly[0]))
  }
  return false
}

/**
 * Find the neighborhood name for a given coordinate.
 * Returns the `nhood` property from the matching feature, or 'Unknown'.
 */
export function findNeighborhood(
  lng: number,
  lat: number,
  boundaries: GeoJSON.FeatureCollection
): string {
  for (const feature of boundaries.features) {
    if (pointInGeometry(lng, lat, feature.geometry)) {
      return (feature.properties?.nhood as string) || 'Unknown'
    }
  }
  return 'Unknown'
}

/**
 * Batch-assign neighborhoods to an array of items with lat/lng.
 * Uses a simple cache to avoid re-testing duplicate coordinates.
 */
export function assignNeighborhoods<T extends { lat: number; lng: number }>(
  items: T[],
  boundaries: GeoJSON.FeatureCollection
): (T & { neighborhood: string })[] {
  const cache = new Map<string, string>()
  return items.map((item) => {
    const key = `${item.lng.toFixed(5)},${item.lat.toFixed(5)}`
    let neighborhood = cache.get(key)
    if (!neighborhood) {
      neighborhood = findNeighborhood(item.lng, item.lat, boundaries)
      cache.set(key, neighborhood)
    }
    return { ...item, neighborhood }
  })
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/utils/pointInPolygon.ts
git commit -m "Add point-in-polygon utility for neighborhood assignment"
```

---

## Task 3: NetFormationChart Component

D3 mirrored bar chart showing monthly openings (green, above zero) and closures (red, below zero). Follows existing chart patterns (TrendChart, ResponseHistogram).

**Files:**
- Create: `src/components/charts/NetFormationChart.tsx`

- [ ] **Step 1: Create `src/components/charts/NetFormationChart.tsx`**

```typescript
import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'

export interface FormationDataPoint {
  month: string   // ISO date string e.g. "2025-03-01T00:00:00.000"
  openings: number
  closures: number
}

interface NetFormationChartProps {
  data: FormationDataPoint[]
  priorYear?: FormationDataPoint[]
  width?: number
  height?: number
}

export default function NetFormationChart({
  data,
  priorYear,
  width = 320,
  height = 140,
}: NetFormationChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 8, right: 8, bottom: 20, left: 32 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const maxOpen = d3.max(data, (d) => d.openings) || 1
    const maxClose = d3.max(data, (d) => d.closures) || 1
    const maxVal = Math.max(maxOpen, maxClose)

    const x = d3.scaleBand()
      .domain(data.map((d) => d.month))
      .range([0, w])
      .padding(0.2)

    const yUp = d3.scaleLinear().domain([0, maxVal]).range([h / 2, 0])
    const yDown = d3.scaleLinear().domain([0, maxVal]).range([h / 2, h])

    const labelColor = isDarkMode ? '#64748b' : '#94a3b8'
    const zeroColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'

    // Zero line
    g.append('line')
      .attr('x1', 0).attr('x2', w)
      .attr('y1', h / 2).attr('y2', h / 2)
      .attr('stroke', zeroColor)

    // Ghost prior-year bars
    if (priorYear && priorYear.length > 0) {
      const ghostOpacity = isDarkMode ? 0.15 : 0.1
      // Map prior year months to current x positions by index
      priorYear.forEach((d, i) => {
        if (i >= data.length) return
        const xPos = x(data[i].month)
        if (xPos == null) return
        const bw = x.bandwidth()
        g.append('rect')
          .attr('x', xPos).attr('y', yUp(d.openings))
          .attr('width', bw).attr('height', h / 2 - yUp(d.openings))
          .attr('rx', 1.5).attr('fill', '#10b981').attr('opacity', ghostOpacity)
        g.append('rect')
          .attr('x', xPos).attr('y', h / 2)
          .attr('width', bw).attr('height', yDown(d.closures) - h / 2)
          .attr('rx', 1.5).attr('fill', '#ef4444').attr('opacity', ghostOpacity)
      })
    }

    // Openings bars (above zero)
    g.selectAll('.bar-open')
      .data(data)
      .join('rect')
      .attr('class', 'bar-open')
      .attr('x', (d) => x(d.month) ?? 0)
      .attr('y', h / 2)
      .attr('width', x.bandwidth())
      .attr('height', 0)
      .attr('rx', 1.5)
      .attr('fill', '#10b981')
      .attr('opacity', 0.8)
      .transition()
      .duration(500)
      .delay((_, i) => i * 20)
      .ease(d3.easeCubicOut)
      .attr('y', (d) => yUp(d.openings))
      .attr('height', (d) => h / 2 - yUp(d.openings))

    // Closures bars (below zero)
    g.selectAll('.bar-close')
      .data(data)
      .join('rect')
      .attr('class', 'bar-close')
      .attr('x', (d) => x(d.month) ?? 0)
      .attr('y', h / 2)
      .attr('width', x.bandwidth())
      .attr('height', 0)
      .attr('rx', 1.5)
      .attr('fill', '#ef4444')
      .attr('opacity', 0.8)
      .transition()
      .duration(500)
      .delay((_, i) => i * 20)
      .ease(d3.easeCubicOut)
      .attr('height', (d) => yDown(d.closures) - h / 2)

    // X-axis labels (every 2nd or 3rd month depending on count)
    const step = data.length > 8 ? 3 : data.length > 4 ? 2 : 1
    data.forEach((d, i) => {
      if (i % step !== 0) return
      const xPos = (x(d.month) ?? 0) + x.bandwidth() / 2
      const label = new Date(d.month).toLocaleDateString('en-US', { month: 'short' })
      g.append('text')
        .attr('x', xPos).attr('y', h + 12)
        .attr('text-anchor', 'middle')
        .attr('fill', labelColor)
        .attr('font-size', '8px')
        .attr('font-family', '"JetBrains Mono", monospace')
        .text(label)
    })

    // Y-axis labels
    g.append('text')
      .attr('x', -4).attr('y', 6)
      .attr('text-anchor', 'end')
      .attr('fill', '#10b981').attr('font-size', '7px')
      .attr('font-family', '"JetBrains Mono", monospace')
      .text(`+${maxVal}`)
    g.append('text')
      .attr('x', -4).attr('y', h)
      .attr('text-anchor', 'end')
      .attr('fill', '#ef4444').attr('font-size', '7px')
      .attr('font-family', '"JetBrains Mono", monospace')
      .text(`-${maxVal}`)

  }, [data, priorYear, width, height, isDarkMode])

  return <svg ref={svgRef} className="w-full" />
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/NetFormationChart.tsx
git commit -m "Add NetFormationChart: mirrored openings/closures bar chart"
```

---

## Task 4: SectorFilter Component

NAICS industry category filter. Follows the CrashModeFilter pattern: checkbox list, solo button, select-all toggle. Empty set = all selected.

**Files:**
- Create: `src/components/filters/SectorFilter.tsx`

- [ ] **Step 1: Create `src/components/filters/SectorFilter.tsx`**

Model on `src/components/filters/CrashModeFilter.tsx`. Key differences:
- Props: `categories: { sector: string; count: number }[]` (not `mode`)
- No preset groups (NAICS categories are already high-level)
- Color coding: use sector-based colors (Food Services = amber, Retail = blue, Construction = orange, etc.) or a single accent
- Same checkbox + solo + bar-width pattern

```typescript
import { useMemo, useCallback } from 'react'

interface SectorEntry {
  sector: string
  count: number
}

interface SectorFilterProps {
  categories: SectorEntry[]
  selected: Set<string>
  onChange: (selected: Set<string>) => void
}

// Accent colors for common NAICS sectors
const SECTOR_COLORS: Record<string, string> = {
  'Food Services': '#f59e0b',
  'Retail Trade': '#3b82f6',
  'Construction': '#f97316',
  'Professional, Scientific, and Technical Services': '#8b5cf6',
  'Real Estate and Rental and Leasing Services': '#10b981',
  'Arts, Entertainment, and Recreation': '#ec4899',
  'Accommodations': '#06b6d4',
  'Information': '#6366f1',
  'Private Education and Health Services': '#14b8a6',
  'Financial Services': '#84cc16',
}

function getSectorColor(sector: string): string {
  return SECTOR_COLORS[sector] || '#64748b'
}

export default function SectorFilter({ categories, selected, onChange }: SectorFilterProps) {
  const allSectors = useMemo(() => categories.map((c) => c.sector), [categories])
  const maxCount = useMemo(() => Math.max(...categories.map((c) => c.count), 1), [categories])
  const allSelected = selected.size === 0

  const toggle = useCallback((sector: string) => {
    const next = new Set(selected)
    if (allSelected) {
      // Switching from all → only this one excluded: select all EXCEPT this one
      allSectors.forEach((s) => { if (s !== sector) next.add(s) })
      onChange(next)
    } else if (next.has(sector)) {
      next.delete(sector)
      // If nothing left, go back to "all"
      onChange(next.size === 0 ? new Set() : next)
    } else {
      next.add(sector)
      // If all now selected, clear to mean "all"
      onChange(next.size === allSectors.length ? new Set() : next)
    }
  }, [selected, allSelected, allSectors, onChange])

  const solo = useCallback((sector: string) => {
    if (selected.size === 1 && selected.has(sector)) {
      onChange(new Set()) // un-solo
    } else {
      onChange(new Set([sector]))
    }
  }, [selected, onChange])

  const selectAll = useCallback(() => {
    onChange(new Set())
  }, [onChange])

  const isChecked = (sector: string) => allSelected || selected.has(sector)

  return (
    <div className="space-y-0.5">
      {/* Select all */}
      <button
        onClick={selectAll}
        className={`w-full text-left px-2 py-1 rounded text-[10px] font-mono transition-colors
          ${allSelected ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
      >
        {allSelected ? '✓ All sectors' : 'Show all sectors'}
      </button>

      {categories.map((entry) => {
        const checked = isChecked(entry.sector)
        const color = getSectorColor(entry.sector)
        const barWidth = (entry.count / maxCount) * 100
        return (
          <div
            key={entry.sector}
            className="relative flex items-center gap-1 px-2 py-1.5 rounded-md
              hover:bg-white/[0.04] transition-colors group/row"
          >
            {/* Background bar */}
            <div
              className="absolute inset-y-0 left-0 rounded-md opacity-[0.06]"
              style={{ width: `${barWidth}%`, backgroundColor: color }}
            />

            {/* Checkbox + solo */}
            <div className="flex items-center gap-1 relative z-10">
              <button
                onClick={() => toggle(entry.sector)}
                className={`w-3.5 h-3.5 rounded flex-shrink-0 border transition-colors flex items-center justify-center
                  ${checked
                    ? 'border-transparent'
                    : 'border-slate-600 bg-transparent'
                  }`}
                style={checked ? { backgroundColor: color } : undefined}
              >
                {checked && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.5">
                    <path d="M1.5 4L3 5.5L6.5 2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); solo(entry.sector) }}
                className="opacity-0 group-hover/row:opacity-60 hover:!opacity-100 transition-opacity"
                title={`Solo: show only ${entry.sector}`}
              >
                <svg className="w-2.5 h-2.5 text-slate-400" viewBox="0 0 10 10" fill="currentColor">
                  <circle cx="5" cy="5" r="3" />
                </svg>
              </button>
            </div>

            {/* Label + count */}
            <button
              onClick={() => toggle(entry.sector)}
              className={`flex-1 flex items-center justify-between relative z-10 cursor-pointer
                ${checked ? '' : 'opacity-40'}`}
            >
              <span className="text-[10px] text-slate-300 truncate mr-2">
                {entry.sector || 'Uncategorized'}
              </span>
              <span className="text-[9px] font-mono text-slate-500 tabular-nums flex-shrink-0">
                {entry.count.toLocaleString()}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/components/filters/SectorFilter.tsx
git commit -m "Add SectorFilter component for NAICS industry categories"
```

---

## Task 5: BusinessDetailPanel Component

Glass-card detail overlay for a selected business. Follows CrashDetailPanel/CrimeDetailPanel pattern.

**Files:**
- Create: `src/components/ui/BusinessDetailPanel.tsx`
- Modify: `src/stores/appStore.ts` — add `selectedBusiness` state

- [ ] **Step 1: Add `selectedBusiness` state to appStore**

In `src/stores/appStore.ts`, add to the store interface and initial state:

```typescript
// In the interface:
selectedBusiness: string | null
setSelectedBusiness: (id: string | null) => void

// In the create():
selectedBusiness: null,
setSelectedBusiness: (id) => set({ selectedBusiness: id }),
```

Follow the exact same pattern as `selectedCrash` / `setSelectedCrash`.

- [ ] **Step 2: Create `src/components/ui/BusinessDetailPanel.tsx`**

Follow `CrashDetailPanel.tsx` pattern: fetch by ID, display detail, close button.

```typescript
import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { fetchDataset } from '@/api/client'
import type { BusinessLocationRecord } from '@/types/datasets'

interface BusinessDetail {
  name: string
  owner: string
  address: string
  sector: string
  status: 'Active' | 'Closed'
  openedDate: string
  closedDate: string | null
  duration: string
  parkingTax: boolean
  transientTax: boolean
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function computeDuration(start: string, end: string | null): string {
  const s = new Date(start)
  const e = end ? new Date(end) : new Date()
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  if (months < 1) return 'Less than a month'
  if (months < 12) return `${months} month${months > 1 ? 's' : ''}`
  const years = Math.floor(months / 12)
  const rem = months % 12
  return `${years} yr${years > 1 ? 's' : ''}${rem > 0 ? ` ${rem} mo` : ''}`
}

function buildDetail(record: BusinessLocationRecord): BusinessDetail {
  return {
    name: record.dba_name || 'Unknown',
    owner: record.ownership_name || 'Unknown',
    address: record.full_business_address || 'Unknown',
    sector: record.naic_code_description || 'Uncategorized',
    status: record.dba_end_date ? 'Closed' : 'Active',
    openedDate: record.dba_start_date,
    closedDate: record.dba_end_date,
    duration: computeDuration(record.dba_start_date, record.dba_end_date),
    parkingTax: record.parking_tax,
    transientTax: record.transient_occupancy_tax,
  }
}

export default function BusinessDetailPanel() {
  const { selectedBusiness, setSelectedBusiness } = useAppStore()
  const [detail, setDetail] = useState<BusinessDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedBusiness) { setDetail(null); return }
    let cancelled = false
    setLoading(true)

    fetchDataset<BusinessLocationRecord>('businessLocations', {
      $where: `uniqueid = '${selectedBusiness.replace(/'/g, "''")}'`,
      $limit: 1,
    }).then((rows) => {
      if (cancelled) return
      if (rows[0]) setDetail(buildDetail(rows[0]))
      setLoading(false)
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [selectedBusiness])

  const close = useCallback(() => setSelectedBusiness(null), [setSelectedBusiness])

  if (!selectedBusiness) return null

  return (
    <div className="absolute top-4 right-4 z-30 w-72 glass-card rounded-xl p-4 space-y-3">
      {/* Close button */}
      <button
        onClick={close}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/[0.06]
          hover:bg-white/[0.12] flex items-center justify-center transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="#94a3b8" strokeWidth="1.5">
          <path d="M2 2l6 6M8 2l-6 6" strokeLinecap="round" />
        </svg>
      </button>

      {loading && (
        <div className="text-[10px] font-mono text-slate-500 animate-pulse">Loading...</div>
      )}

      {detail && (
        <>
          <div>
            <p className="text-[13px] font-semibold text-slate-100">{detail.name}</p>
            <p className="text-[10px] text-slate-400">{detail.owner}</p>
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">Sector</p>
              <p className="text-[11px] text-slate-300">{detail.sector}</p>
            </div>
            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">Address</p>
              <p className="text-[11px] text-slate-300">{detail.address}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">Status</p>
                <p className={`text-[11px] font-semibold ${detail.status === 'Active' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {detail.status}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">Duration</p>
                <p className="text-[11px] text-slate-300">{detail.duration}</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">Opened</p>
                <p className="text-[11px] text-slate-300">{formatDate(detail.openedDate)}</p>
              </div>
              {detail.closedDate && (
                <div>
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">Closed</p>
                  <p className="text-[11px] text-slate-300">{formatDate(detail.closedDate)}</p>
                </div>
              )}
            </div>
            {(detail.parkingTax || detail.transientTax) && (
              <div className="flex gap-2 pt-1">
                {detail.parkingTax && (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                    Parking Tax
                  </span>
                )}
                {detail.transientTax && (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400">
                    Hotel Tax
                  </span>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/stores/appStore.ts src/components/ui/BusinessDetailPanel.tsx
git commit -m "Add BusinessDetailPanel and selectedBusiness store state"
```

---

## Task 6: Route, Navigation, and Home Card Wiring

Wire the new view into routing, sidebar nav, and the home page.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/views/Home/Home.tsx`
- Modify: `src/utils/glossary.ts`

- [ ] **Step 1: Add route to `src/App.tsx`**

Add import at top:
```typescript
import BusinessActivity from '@/views/BusinessActivity/BusinessActivity'
```

Add route before the catch-all:
```typescript
<Route path="/business-activity" element={<BusinessActivity />} />
```

Note: the view file doesn't exist yet — this will cause a build error until Task 7 creates a stub. If you prefer, create a minimal stub file first:

```typescript
// src/views/BusinessActivity/BusinessActivity.tsx (temporary stub)
export default function BusinessActivity() {
  return <div>Business Activity — coming soon</div>
}
```

- [ ] **Step 2: Add nav item to `src/components/layout/AppShell.tsx`**

Add to `NAV_ITEMS` array:
```typescript
{
  path: '/business-activity',
  label: 'Business Activity',
  shortLabel: 'BA',
  description: 'Business opening & closing trends',
  accentColor: '#10b981',
},
```

- [ ] **Step 3: Add exploration card to `src/views/Home/Home.tsx`**

Add to `VISUALIZATIONS` array:
```typescript
{
  path: '/business-activity',
  title: 'Business Activity',
  subtitle: 'Opening & Closing Trends',
  description:
    'Where are businesses opening and closing? Track neighborhood economic vitality, sector shifts, and net formation trends across San Francisco.',
  stats: [
    { label: 'Business records', value: '~356K' },
    { label: 'Active businesses', value: '~164K' },
    { label: 'Industry sectors', value: '15+' },
  ],
  gradient: 'from-emerald-600/20 via-emerald-500/10 to-transparent',
  borderGlow: 'hover:shadow-[0_0_40px_rgba(16,185,129,0.08)]',
  accentColor: '#10b981',
  number: '08',
},
```

- [ ] **Step 4: Add glossary entries to `src/utils/glossary.ts`**

Add to the GLOSSARY object:
```typescript
'net-change':
  'New businesses opened minus businesses closed in the selected period. Positive means the city gained more businesses than it lost.',
'openings':
  'Businesses that registered a new DBA (doing business as) start date in the selected period.',
'closures':
  'Businesses whose DBA end date falls within the selected period. This indicates the business registration was terminated.',
'active-businesses':
  'Total businesses currently registered with no end date — still operating as of the latest data update.',
'top-sector':
  'The NAICS industry category with the most new business openings in the selected period.',
'dui-crashes':
  'Crashes where the primary collision factor was driving under the influence of alcohol and/or drugs (California Vehicle Code 23152/23153).',
```

(Also adding the `dui-crashes` glossary entry that was missing from the earlier DUI feature.)

- [ ] **Step 5: Verify build**

Run: `pnpm build`
(Should pass if you created the stub in Step 1)

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/layout/AppShell.tsx src/views/Home/Home.tsx src/utils/glossary.ts src/views/BusinessActivity/BusinessActivity.tsx
git commit -m "Wire Business Activity into routing, nav, and home page"
```

---

## Task 7: Main View — BusinessActivity.tsx

The main view component. This is the largest task — follows the exact same architecture as TrafficSafety.tsx or CrimeIncidents.tsx.

**Files:**
- Create (or replace stub): `src/views/BusinessActivity/BusinessActivity.tsx`

- [ ] **Step 1: Create the full view**

This is a large file. Follow these patterns from the existing views:

**Structure:**
1. Imports (hooks, components, types, utils)
2. Constants (SELECT_FIELDS, SF_CITY_FILTER)
3. Component function
4. URL param sync (searchParams for detail, map_mode, sectors, neighborhood)
5. WHERE clause construction (date range + sector filter + neighborhood filter)
6. Data queries (useDataset calls: raw data, openings count, closures count, active count, sector agg, monthly openings, monthly closures, prior-year counts)
7. Computed data (parse raw records, assign neighborhoods via pointInPolygon, derive stats)
8. CardDefs (useMemo → CardDef[])
9. ChartTiles (useMemo → ChartTileDef[])
10. Map GeoJSON (heatmap + point layers, anomaly choropleth)
11. Map layer definitions (heatmap, points colored by status, anomaly fill/outline)
12. useMapLayer calls
13. useMapTooltip calls
14. Click handlers (point click → detail panel, neighborhood click → filter)
15. JSX return (sidebar + MapView with overlays)

**Key implementation notes:**

- **SF city filter**: All WHERE clauses must include `city = 'San Francisco'`
- **Date range default**: The view should use a 12-month range. Check if `useAppStore`'s `dateRange` can be overridden at view level, or set a reasonable initial range. The simplest approach: use the store's `dateRange` as-is (user sets via DateRangePicker) but document that 12mo is recommended. Alternatively, call `setDateRange` on mount if the current range is < 90 days.
- **Neighborhood assignment**: After fetching raw data, run `assignNeighborhoods(parsedData, boundaries)` using the point-in-polygon utility. Do this in a `useMemo` that depends on `[rawData, boundaries]`.
- **Neighborhood aggregation**: Since there's no server-side neighborhood field, aggregate client-side from the assigned neighborhoods. Use a `useMemo` that groups by `neighborhood` and counts openings/closures.
- **Heatmap gradient**: Use green-tinted colors to distinguish from red (fire/crash) and cyan (parking):
  ```
  0: rgba(0,0,0,0)
  0.1: rgba(16, 185, 129, 0.15)
  0.25: rgba(16, 185, 129, 0.3)
  0.5: rgba(16, 185, 129, 0.5)
  0.8: rgba(5, 150, 105, 0.7)
  1: rgba(4, 120, 87, 0.85)
  ```
- **Point colors**: Use `match` on a `status` property:
  - `'opened'` → `#10b981`
  - `'closed'` → `#ef4444`
  - `'active'` → `#64748b`
- **Status assignment**: In the `useMemo` that parses raw records, determine status:
  ```typescript
  const startDate = new Date(record.dba_start_date)
  const endDate = record.dba_end_date ? new Date(record.dba_end_date) : null
  const rangeStart = new Date(dateRange.start)
  const rangeEnd = new Date(dateRange.end)
  const status = startDate >= rangeStart && startDate <= rangeEnd ? 'opened'
    : endDate && endDate >= rangeStart && endDate <= rangeEnd ? 'closed'
    : 'active'
  ```
- **No TimeOfDayFilter**: This view omits it (business data has no hour granularity)
- **ComparisonToggle**: Include for the Daily Trend chart tile, but comparison data is optional
- **DataFreshnessAlert**: Wire up `useDataFreshness('businessLocations', 'dba_start_date', dateRange)`
- **useProgressScope**: Call at component top for the loading progress bar
- **Skeleton loading**: Use `SkeletonStatCards`, `SkeletonSidebarRows`, `MapScanOverlay`, `MapProgressBar`

**Sidebar JSX pattern** (2 tabs: Sectors / Neighborhoods):
- Tab 1 "Sectors": renders `<SectorFilter>` with sector aggregation data
- Tab 2 "Neighborhoods": renders neighborhood list with net change, openings, closures, "since last yr" delta. Includes `<PeriodBreakdownChart>` for volume trend.

The full file will be ~900-1100 lines following existing view patterns. Reference `src/views/TrafficSafety/TrafficSafety.tsx` as the closest template (it has ChartTray, CardTray, anomaly mode, overlay toggles, and a 2-tab sidebar).

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: clean build. Fix any type errors.

- [ ] **Step 3: Manual smoke test**

Run: `pnpm dev`
Navigate to `/business-activity`. Verify:
- Map loads with green heatmap
- Stat cards show (Net Change, Openings, Closures)
- Sidebar has Sectors and Neighborhoods tabs
- Clicking a sector filters the view
- Clicking a neighborhood zooms the map
- Bottom chart tiles show (Net Formation, Top Sectors)
- Points appear when zoomed in (green/red/slate)
- Tooltip shows business name and details on hover
- Clicking a point opens the detail panel
- Anomaly mode toggle works

- [ ] **Step 4: Commit**

```bash
git add src/views/BusinessActivity/BusinessActivity.tsx
git commit -m "Implement Business Activity view with map, cards, charts, and sidebar"
```

---

## Task 8: Polish and Final Integration

Final touches: verify all wiring, test edge cases, ensure build is clean.

- [ ] **Step 1: Test date range behavior**

Navigate to Business Activity with different date ranges:
- Last 7 days → very few records, verify it doesn't break
- Last 12 months → healthy data, all features work
- YTD → reasonable data volume
- Custom range spanning 3+ years → verify monthly chart handles many bars

- [ ] **Step 2: Test neighborhood assignment**

Zoom into a specific neighborhood (e.g., Mission). Verify:
- Neighborhood tab shows the Mission with correct counts
- Clicking it filters to Mission businesses
- Anomaly mode colors the Mission polygon correctly

- [ ] **Step 3: Verify all other views still work**

Quick check: navigate to Emergency Response, Crime Incidents, Traffic Safety. Ensure no regressions from the appStore changes.

- [ ] **Step 4: Final build check**

Run: `pnpm build`
Expected: clean build, no warnings beyond the existing chunk size warning.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "Polish Business Activity view and fix edge cases"
```

- [ ] **Step 6: Push**

```bash
git push
```

---

## Implementation Order Summary

```
Task 1: Dataset registration + types         (foundation, no UI)
Task 2: Point-in-polygon utility              (foundation, no UI)
Task 3: NetFormationChart component           (new chart, standalone)
Task 4: SectorFilter component               (new filter, standalone)
Task 5: BusinessDetailPanel + store state     (new panel, standalone)
Task 6: Route/nav/home wiring + glossary      (wiring, stub view)
Task 7: Main BusinessActivity view            (the big integration)
Task 8: Polish and verification               (testing, edge cases)
```

Tasks 1-5 are independent and can be parallelized. Task 6 depends on having at least a stub view. Task 7 depends on all previous tasks. Task 8 is verification.
