# Fire Incidents Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the Emergency Response view with Fire Incidents outcome data (`wr8u-xric`) — severity overlays, stat cards, detail panel cross-ref, cause/detection breakdowns, and battery fire trend chart — all activated when the "Fire" service filter is selected.

**Architecture:** Server-side aggregation queries against the Fire Incidents Socrata dataset feed stat cards and sidebar breakdowns. A lazy cross-ref hook fetches individual fire records for the detail panel. Two small overlay queries (casualties, battery fires) provide highlighted map points. Everything is conditional on `serviceFilter === 'fire'`.

**Tech Stack:** React 18, TypeScript, Mapbox GL JS v3, D3.js, Socrata SODA API, Zustand

**Spec:** `docs/superpowers/specs/2026-03-10-fire-incidents-integration-design.md`

---

## Chunk 1: Foundation (Types, Hooks, Chart)

### Task 1: Expand FireIncident type + add aggregation row types

**Files:**
- Modify: `src/types/datasets.ts:4-32` (FireIncident interface)

- [ ] **Step 1: Add missing fields to FireIncident interface**

Open `src/types/datasets.ts`. The `FireIncident` interface is at lines 4-32. Add these fields after the existing `point` field (before the closing `}`):

```typescript
  estimated_property_loss?: number
  estimated_contents_loss?: number
  fire_spread?: string
  ignition_cause?: string
  ignition_factor_primary?: string
  heat_source?: string
  area_of_fire_origin?: string
  detectors_present?: string
  detector_effectiveness?: string
  automatic_extinguishing_system_present?: string
  automatic_extinguishing_sytem_type?: string  // NOTE: Socrata field has this typo (missing 's' in "system")
```

- [ ] **Step 2: Add aggregation row types**

After the `FireIncident` interface, add these types (before the `FireEMSDispatch` interface):

```typescript
/** Server-side aggregation row for fire casualty/loss totals */
export interface FireCasualtyAggRow {
  injuries: string
  fatalities: string
  total_loss: string
}

/** Server-side aggregation row for fire ignition cause counts */
export interface FireCauseAggRow {
  ignition_cause: string
  cnt: string
}

/** Server-side aggregation row for fire property use counts */
export interface FirePropertyUseAggRow {
  property_use: string
  cnt: string
}

/** Server-side aggregation row for fire detector presence counts */
export interface FireDetectorAggRow {
  detectors_present: string
  cnt: string
}

/** Server-side aggregation row for fire neighborhood counts + casualties */
export interface FireNeighborhoodAggRow {
  neighborhood_district: string
  cnt: string
  injuries: string
  fatalities: string
}

/** Server-side aggregation row for battery fire yearly trend */
export interface BatteryTrendAggRow {
  year: string
  cnt: string
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Clean build, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/datasets.ts
git commit -m "feat: expand FireIncident type with outcome/cause/detection fields and agg row types"
```

---

### Task 2: Create `useFireIncidentCrossRef` hook

**Files:**
- Create: `src/hooks/useFireIncidentCrossRef.ts`
- Reference: `src/hooks/useDispatchCrossRef.ts` (same pattern)

- [ ] **Step 1: Create the hook**

Create `src/hooks/useFireIncidentCrossRef.ts`. This follows the exact same pattern as `useDispatchCrossRef.ts` but fetches from the `fireIncidents` dataset:

```typescript
import { useState, useEffect } from 'react'
import { fetchDataset } from '@/api/client'
import type { FireIncident } from '@/types/datasets'

interface FireIncidentCrossRefResult {
  fireIncident: FireIncident | null
  isLoading: boolean
  error: string | null
}

/**
 * Lazy-fetches a Fire Incident record by call_number for cross-referencing
 * with Fire/EMS dispatch records. Only fetches when callNumber is non-null.
 */
export function useFireIncidentCrossRef(callNumber: string | null): FireIncidentCrossRefResult {
  const [fireIncident, setFireIncident] = useState<FireIncident | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!callNumber) {
      setFireIncident(null)
      setError(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetchDataset<FireIncident>('fireIncidents', {
      $where: `call_number = '${callNumber}'`,
      $limit: 1,
    })
      .then((records) => {
        if (!cancelled) {
          setFireIncident(records.length > 0 ? records[0] : null)
          if (records.length === 0) setError('No fire report on file')
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFireIncident(null)
          setError(err instanceof Error ? err.message : 'Failed to fetch fire incident data')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [callNumber])

  return { fireIncident, isLoading, error }
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFireIncidentCrossRef.ts
git commit -m "feat: add useFireIncidentCrossRef hook for detail panel cross-ref"
```

---

### Task 3: Create `useFireInsights` hook

**Files:**
- Create: `src/hooks/useFireInsights.ts`

This hook encapsulates ALL fire-specific Socrata queries. It returns null-ish data when the fire filter isn't active (no queries fired). When active, it fires queries in parallel for stat cards, sidebar breakdowns, map overlays, and battery trend.

- [ ] **Step 1: Create the hook**

Create `src/hooks/useFireInsights.ts`:

```typescript
import { useState, useEffect, useMemo } from 'react'
import { fetchDataset } from '@/api/client'
import type {
  FireIncident,
  FireCasualtyAggRow,
  FireCauseAggRow,
  FirePropertyUseAggRow,
  FireDetectorAggRow,
  FireNeighborhoodAggRow,
  BatteryTrendAggRow,
} from '@/types/datasets'

interface FireInsightsResult {
  // Stat card data
  casualties: { injuries: number; fatalities: number; totalLoss: number } | null
  priorYearCasualties: { injuries: number; fatalities: number; totalLoss: number } | null

  // Sidebar breakdowns
  causes: { label: string; count: number }[]
  propertyTypes: { label: string; count: number }[]
  detectionStats: { detectorsPresent: number; effectiveAlert: number; sprinklersPresent: number } | null
  neighborhoodFires: { neighborhood: string; count: number; injuries: number; fatalities: number }[]

  // Map overlays
  severityOverlay: FireIncident[]
  batteryOverlay: FireIncident[]

  // Chart data
  batteryTrend: { year: string; count: number }[]

  isLoading: boolean
}

const EMPTY_RESULT: FireInsightsResult = {
  casualties: null,
  priorYearCasualties: null,
  causes: [],
  propertyTypes: [],
  detectionStats: null,
  neighborhoodFires: [],
  severityOverlay: [],
  batteryOverlay: [],
  batteryTrend: [],
  isLoading: false,
}

export function useFireInsights(
  isActive: boolean,
  dateRange: { start: string; end: string },
): FireInsightsResult {
  const [result, setResult] = useState<FireInsightsResult>(EMPTY_RESULT)

  const dateWhere = useMemo(() =>
    `alarm_dttm >= '${dateRange.start}T00:00:00' AND alarm_dttm <= '${dateRange.end}T23:59:59'`,
    [dateRange.start, dateRange.end]
  )

  // Prior-year date range
  const priorStart = useMemo(() => {
    const d = new Date(dateRange.start)
    d.setFullYear(d.getFullYear() - 1)
    return d.toISOString().split('T')[0]
  }, [dateRange.start])

  const priorEnd = useMemo(() => {
    const d = new Date(dateRange.end)
    d.setFullYear(d.getFullYear() - 1)
    return d.toISOString().split('T')[0]
  }, [dateRange.end])

  const priorDateWhere = useMemo(() =>
    `alarm_dttm >= '${priorStart}T00:00:00' AND alarm_dttm <= '${priorEnd}T23:59:59'`,
    [priorStart, priorEnd]
  )

  useEffect(() => {
    if (!isActive) {
      setResult(EMPTY_RESULT)
      return
    }

    let cancelled = false
    setResult(prev => ({ ...prev, isLoading: true }))

    const queries = Promise.all([
      // 0: Casualty totals
      fetchDataset<FireCasualtyAggRow>('fireIncidents', {
        $select: 'SUM(civilian_injuries) + SUM(fire_injuries) as injuries, SUM(civilian_fatalities) + SUM(fire_fatalities) as fatalities, SUM(estimated_property_loss) + SUM(estimated_contents_loss) as total_loss',
        $where: dateWhere,
        $limit: 1,
      }),
      // 1: Prior-year casualty totals
      fetchDataset<FireCasualtyAggRow>('fireIncidents', {
        $select: 'SUM(civilian_injuries) + SUM(fire_injuries) as injuries, SUM(civilian_fatalities) + SUM(fire_fatalities) as fatalities, SUM(estimated_property_loss) + SUM(estimated_contents_loss) as total_loss',
        $where: priorDateWhere,
        $limit: 1,
      }),
      // 2: Ignition cause breakdown
      fetchDataset<FireCauseAggRow>('fireIncidents', {
        $select: 'ignition_cause, COUNT(*) as cnt',
        $where: `${dateWhere} AND ignition_cause IS NOT NULL`,
        $group: 'ignition_cause',
        $order: 'cnt DESC',
        $limit: 5,
      }),
      // 3: Property use breakdown
      fetchDataset<FirePropertyUseAggRow>('fireIncidents', {
        $select: 'property_use, COUNT(*) as cnt',
        $where: `${dateWhere} AND property_use IS NOT NULL`,
        $group: 'property_use',
        $order: 'cnt DESC',
        $limit: 5,
      }),
      // 4: Detector stats
      fetchDataset<FireDetectorAggRow>('fireIncidents', {
        $select: 'detectors_present, COUNT(*) as cnt',
        $where: `${dateWhere} AND detectors_present IS NOT NULL`,
        $group: 'detectors_present',
      }),
      // 5: Neighborhood fire counts
      fetchDataset<FireNeighborhoodAggRow>('fireIncidents', {
        $select: 'neighborhood_district, COUNT(*) as cnt, SUM(civilian_injuries) + SUM(fire_injuries) as injuries, SUM(civilian_fatalities) + SUM(fire_fatalities) as fatalities',
        $where: dateWhere,
        $group: 'neighborhood_district',
        $order: 'cnt DESC',
      }),
      // 6: Severity overlay (records with casualties)
      fetchDataset<FireIncident>('fireIncidents', {
        $select: 'call_number, alarm_dttm, primary_situation, address, neighborhood_district, civilian_injuries, civilian_fatalities, fire_injuries, fire_fatalities, estimated_property_loss, point',
        $where: `(civilian_injuries > 0 OR civilian_fatalities > 0 OR fire_injuries > 0 OR fire_fatalities > 0) AND ${dateWhere} AND point IS NOT NULL`,
        $limit: 200,
      }),
      // 7: Battery fire overlay
      fetchDataset<FireIncident>('fireIncidents', {
        $select: 'call_number, alarm_dttm, primary_situation, address, neighborhood_district, ignition_factor_primary, area_of_fire_origin, property_use, civilian_injuries, fire_injuries, estimated_property_loss, point',
        $where: `heat_source = '000 Rechargeable Batteries' AND ${dateWhere} AND point IS NOT NULL`,
        $limit: 200,
      }),
      // 8: Sprinkler/auto-extinguishing stats
      fetchDataset<FireDetectorAggRow>('fireIncidents', {
        $select: 'automatic_extinguishing_system_present as detectors_present, COUNT(*) as cnt',
        $where: `${dateWhere} AND automatic_extinguishing_system_present IS NOT NULL`,
        $group: 'automatic_extinguishing_system_present',
      }),
      // 9: Detector effectiveness stats
      fetchDataset<FireDetectorAggRow>('fireIncidents', {
        $select: 'detector_effectiveness as detectors_present, COUNT(*) as cnt',
        $where: `${dateWhere} AND detector_effectiveness IS NOT NULL`,
        $group: 'detector_effectiveness',
      }),
      // 10: Battery trend (yearly, all-time)
      fetchDataset<BatteryTrendAggRow>('fireIncidents', {
        $select: "date_trunc_y(alarm_dttm) as year, COUNT(*) as cnt",
        $where: "heat_source = '000 Rechargeable Batteries'",
        $group: 'year',
        $order: 'year',
      }),
    ])

    queries.then(([
      casualtyRows, priorCasualtyRows, causeRows, propertyRows, detectorRows,
      neighborhoodRows, severityRows, batteryRows, sprinklerRows, effectivenessRows,
      batteryTrendRows,
    ]) => {
      if (cancelled) return

      // Parse casualties
      const c = casualtyRows[0]
      const casualties = c ? {
        injuries: Number(c.injuries) || 0,
        fatalities: Number(c.fatalities) || 0,
        totalLoss: Number(c.total_loss) || 0,
      } : null

      const pc = priorCasualtyRows[0]
      const priorYearCasualties = pc ? {
        injuries: Number(pc.injuries) || 0,
        fatalities: Number(pc.fatalities) || 0,
        totalLoss: Number(pc.total_loss) || 0,
      } : null

      // Parse causes
      const causes = causeRows.map(r => ({
        label: r.ignition_cause || 'Unknown',
        count: Number(r.cnt) || 0,
      }))

      // Parse property types
      const propertyTypes = propertyRows.map(r => ({
        label: r.property_use || 'Unknown',
        count: Number(r.cnt) || 0,
      }))

      // Parse detection stats
      const totalDetectorRecords = detectorRows.reduce((sum, r) => sum + (Number(r.cnt) || 0), 0)
      let detectionStats: FireInsightsResult['detectionStats'] = null
      if (totalDetectorRecords > 0) {
        // Detectors present: values like "1 Present", "2 Not present", "U Undetermined"
        const presentCount = detectorRows
          .filter(r => r.detectors_present?.includes('Present') && !r.detectors_present?.includes('Not'))
          .reduce((sum, r) => sum + (Number(r.cnt) || 0), 0)

        // Detector effectiveness: values like "1 Effective", "2 Not effective"
        const totalEffectivenessRecords = effectivenessRows.reduce((sum, r) => sum + (Number(r.cnt) || 0), 0)
        const effectiveCount = effectivenessRows
          .filter(r => r.detectors_present?.includes('Effective') && !r.detectors_present?.includes('Not'))
          .reduce((sum, r) => sum + (Number(r.cnt) || 0), 0)

        // Sprinklers/auto-extinguishing: values like "1 Present", "N Not present"
        const totalSprinklerRecords = sprinklerRows.reduce((sum, r) => sum + (Number(r.cnt) || 0), 0)
        const sprinklerCount = sprinklerRows
          .filter(r => r.detectors_present?.includes('Present') && !r.detectors_present?.includes('Not'))
          .reduce((sum, r) => sum + (Number(r.cnt) || 0), 0)

        detectionStats = {
          detectorsPresent: Math.round((presentCount / totalDetectorRecords) * 100),
          effectiveAlert: totalEffectivenessRecords > 0 ? Math.round((effectiveCount / totalEffectivenessRecords) * 100) : 0,
          sprinklersPresent: totalSprinklerRecords > 0 ? Math.round((sprinklerCount / totalSprinklerRecords) * 100) : 0,
        }
      }

      // Parse neighborhood fires
      const neighborhoodFires = neighborhoodRows
        .filter(r => r.neighborhood_district)
        .map(r => ({
          neighborhood: r.neighborhood_district,
          count: Number(r.cnt) || 0,
          injuries: Number(r.injuries) || 0,
          fatalities: Number(r.fatalities) || 0,
        }))

      // Parse battery trend
      const batteryTrend = batteryTrendRows.map(r => ({
        year: r.year ? new Date(r.year).getFullYear().toString() : '',
        count: Number(r.cnt) || 0,
      })).filter(r => r.year)

      setResult({
        casualties,
        priorYearCasualties,
        causes,
        propertyTypes,
        detectionStats,
        neighborhoodFires,
        severityOverlay: severityRows,
        batteryOverlay: batteryRows,
        batteryTrend,
        isLoading: false,
      })
    }).catch(() => {
      if (!cancelled) setResult({ ...EMPTY_RESULT, isLoading: false })
    })

    return () => { cancelled = true }
  }, [isActive, dateWhere, priorDateWhere])

  return result
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFireInsights.ts
git commit -m "feat: add useFireInsights hook with 9 parallel Socrata queries for fire data"
```

---

### Task 4: Create `BatteryTrendChart` component

**Files:**
- Create: `src/components/charts/BatteryTrendChart.tsx`
- Reference: `src/components/charts/ResponseHistogram.tsx` for D3 patterns

- [ ] **Step 1: Create the chart component**

Create `src/components/charts/BatteryTrendChart.tsx`. This is a simple D3 vertical bar chart showing yearly battery fire counts:

```typescript
import { useRef, useEffect } from 'react'
import * as d3 from 'd3'

interface Props {
  data: { year: string; count: number }[]
  width?: number
  height?: number
}

export default function BatteryTrendChart({ data, width = 320, height = 140 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 12, right: 12, bottom: 24, left: 32 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleBand<string>()
      .domain(data.map(d => d.year))
      .range([0, w])
      .padding(0.3)

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.count) || 1])
      .nice()
      .range([h, 0])

    // Bars with amber gradient
    g.selectAll('.bar')
      .data(data)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.year)!)
      .attr('width', x.bandwidth())
      .attr('y', h)
      .attr('height', 0)
      .attr('rx', 2)
      .attr('fill', '#f59e0b')
      .attr('opacity', 0.8)
      .transition()
      .duration(500)
      .delay((_, i) => i * 60)
      .attr('y', d => y(d.count))
      .attr('height', d => h - y(d.count))

    // Value labels on bars
    g.selectAll('.value')
      .data(data)
      .join('text')
      .attr('class', 'value')
      .attr('x', d => x(d.year)! + x.bandwidth() / 2)
      .attr('y', d => y(d.count) - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#f59e0b')
      .attr('font-size', '9px')
      .attr('font-family', "'JetBrains Mono', monospace")
      .attr('opacity', 0)
      .text(d => d.count)
      .transition()
      .duration(400)
      .delay((_, i) => i * 60 + 300)
      .attr('opacity', 1)

    // X-axis (years)
    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x).tickSize(0))
      .call(g => g.select('.domain').remove())
      .selectAll('text')
      .attr('fill', 'rgba(148,163,184,0.6)')
      .attr('font-size', '8px')
      .attr('font-family', "'JetBrains Mono', monospace")

    // Y-axis (count)
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickSize(-w))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line')
        .attr('stroke', 'rgba(148,163,184,0.08)')
        .attr('stroke-dasharray', '2,2'))
      .selectAll('text')
      .attr('fill', 'rgba(148,163,184,0.5)')
      .attr('font-size', '8px')
      .attr('font-family', "'JetBrains Mono', monospace")
  }, [data, width, height])

  if (data.length === 0) return null

  return <svg ref={svgRef} />
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/BatteryTrendChart.tsx
git commit -m "feat: add BatteryTrendChart component for yearly battery fire counts"
```

---

### Task 5: Add glossary entries

**Files:**
- Modify: `src/utils/glossary.ts`

- [ ] **Step 1: Add fire-related glossary entries**

Open `src/utils/glossary.ts`. Add these entries inside the `GLOSSARY` object, after the existing traffic safety entries (before the `// Trend indicators` section):

```typescript
  // Fire incidents
  'fire-casualties':
    'Total people injured or killed in fire incidents, including both civilians and fire personnel.',
  'fire-property-loss':
    'Estimated dollar value of property and contents destroyed or damaged by fire. Assessed by fire investigators on scene.',
  'battery-fires':
    'Fires caused by rechargeable batteries (primarily lithium-ion). Includes e-bike, e-scooter, and device charging fires. A growing trend in SF since 2020.',
  'detection-rate':
    'Percentage of fire incidents where smoke detectors were present in the building. Higher rates correlate with earlier detection and fewer casualties.',
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/utils/glossary.ts
git commit -m "feat: add fire incident glossary entries"
```

---

## Chunk 2: Detail Panel + Map Overlays

### Task 6: Enrich IncidentDetailPanel with fire outcome sections

**Files:**
- Modify: `src/components/ui/IncidentDetailPanel.tsx`

The detail panel currently shows a response timeline for Fire/EMS dispatch records. When the dispatch record has a matching Fire Incident (via `call_number`), we add three outcome sections below the existing "Total to Scene" block.

- [ ] **Step 1: Add import for the cross-ref hook**

At the top of `src/components/ui/IncidentDetailPanel.tsx`, add:

```typescript
import { useFireIncidentCrossRef } from '@/hooks/useFireIncidentCrossRef'
```

- [ ] **Step 2: Call the hook inside the component**

Inside the `IncidentDetailPanel` component (after the existing state declarations around line 43), add:

```typescript
  const { fireIncident, isLoading: fireLoading } = useFireIncidentCrossRef(selectedIncident)
```

- [ ] **Step 3: Add fire outcome sections**

After the "Total to Scene" section (after line 215, before the closing `</>` on line 216), add the fire outcome sections:

```tsx
          {/* Fire Incident Outcome — cross-referenced from wr8u-xric */}
          {fireLoading && selectedIncident && (
            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
              <div className="animate-pulse space-y-2">
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-24" />
                <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded w-full" />
                <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
              </div>
            </div>
          )}

          {fireIncident && !fireLoading && (
            <>
              {/* Section 1: Fire Outcome */}
              <div className="mt-3 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-red-400">
                    Fire Outcome
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.08]" />
                </div>
                <div className="space-y-1.5 text-[10px]">
                  {fireIncident.number_of_alarms > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Alarms</span>
                      <span className="font-mono text-slate-800 dark:text-white">{fireIncident.number_of_alarms}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Injuries</span>
                    <span className={`font-mono ${(fireIncident.civilian_injuries + fireIncident.fire_injuries) > 0 ? 'text-red-400' : 'text-slate-800 dark:text-white'}`}>
                      {(fireIncident.civilian_injuries || 0) + (fireIncident.fire_injuries || 0)}
                      {fireIncident.civilian_injuries > 0 && ` (${fireIncident.civilian_injuries} civilian)`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Fatalities</span>
                    <span className={`font-mono ${(fireIncident.civilian_fatalities + fireIncident.fire_fatalities) > 0 ? 'text-red-500 font-semibold' : 'text-slate-800 dark:text-white'}`}>
                      {(fireIncident.civilian_fatalities || 0) + (fireIncident.fire_fatalities || 0)}
                    </span>
                  </div>
                  {fireIncident.estimated_property_loss != null && fireIncident.estimated_property_loss > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Est. Loss</span>
                      <span className="font-mono text-slate-800 dark:text-white">
                        ${((fireIncident.estimated_property_loss || 0) + (fireIncident.estimated_contents_loss || 0)).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {fireIncident.fire_spread && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Spread</span>
                      <span className="font-mono text-slate-800 dark:text-white text-right max-w-[55%]">{fireIncident.fire_spread}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 2: Cause & Origin */}
              {(fireIncident.ignition_cause || fireIncident.area_of_fire_origin || fireIncident.heat_source) && (
                <div className="mt-3 pt-2 border-t border-slate-200/50 dark:border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-signal-amber">
                      Cause &amp; Origin
                    </p>
                    <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.08]" />
                  </div>
                  <div className="space-y-1.5 text-[10px]">
                    {fireIncident.ignition_cause && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Cause</span>
                        <span className="font-mono text-slate-800 dark:text-white text-right max-w-[55%]">{fireIncident.ignition_cause}</span>
                      </div>
                    )}
                    {fireIncident.ignition_factor_primary && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Factor</span>
                        <span className="font-mono text-slate-800 dark:text-white text-right max-w-[55%]">{fireIncident.ignition_factor_primary}</span>
                      </div>
                    )}
                    {fireIncident.heat_source && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Heat Source</span>
                        <span className={`font-mono text-right max-w-[55%] ${fireIncident.heat_source.includes('Rechargeable') ? 'text-amber-400 font-semibold' : 'text-slate-800 dark:text-white'}`}>
                          {fireIncident.heat_source}
                        </span>
                      </div>
                    )}
                    {fireIncident.area_of_fire_origin && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Origin</span>
                        <span className="font-mono text-slate-800 dark:text-white text-right max-w-[55%]">{fireIncident.area_of_fire_origin}</span>
                      </div>
                    )}
                    {fireIncident.property_use && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Property</span>
                        <span className="font-mono text-slate-800 dark:text-white text-right max-w-[55%]">{fireIncident.property_use}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Section 3: Detection & Protection */}
              {(fireIncident.detectors_present || fireIncident.automatic_extinguishing_system_present) && (
                <div className="mt-3 pt-2 border-t border-slate-200/50 dark:border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-signal-blue">
                      Detection &amp; Protection
                    </p>
                    <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.08]" />
                  </div>
                  <div className="space-y-1.5 text-[10px]">
                    {fireIncident.detectors_present && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Detectors</span>
                        <span className={`font-mono ${fireIncident.detectors_present.includes('Present') && !fireIncident.detectors_present.includes('Not') ? 'text-emerald-400' : 'text-red-400'}`}>
                          {fireIncident.detectors_present}
                        </span>
                      </div>
                    )}
                    {fireIncident.detector_effectiveness && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Effectiveness</span>
                        <span className="font-mono text-slate-800 dark:text-white text-right max-w-[55%]">{fireIncident.detector_effectiveness}</span>
                      </div>
                    )}
                    {fireIncident.automatic_extinguishing_system_present && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Sprinklers</span>
                        <span className={`font-mono ${fireIncident.automatic_extinguishing_system_present.includes('Present') && !fireIncident.automatic_extinguishing_system_present.includes('Not') ? 'text-emerald-400' : 'text-red-400'}`}>
                          {fireIncident.automatic_extinguishing_system_present}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {!fireIncident && !fireLoading && selectedIncident && detail && (
            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
              <p className="text-[9px] font-mono text-slate-500 dark:text-slate-600 italic">
                No fire report on file
              </p>
            </div>
          )}
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/IncidentDetailPanel.tsx
git commit -m "feat: add fire outcome/cause/detection sections to IncidentDetailPanel"
```

---

## Chunk 3: EmergencyResponse View Integration

### Task 7: Wire fire insights into EmergencyResponse

**Files:**
- Modify: `src/views/EmergencyResponse/EmergencyResponse.tsx`

This is the main integration task. We add: the `useFireInsights` hook call, conditional stat cards, severity/battery map overlay layers, sidebar enrichments, and the battery trend chart tile.

- [ ] **Step 1: Add imports**

At the top of `EmergencyResponse.tsx`, add these imports:

```typescript
import { useFireInsights } from '@/hooks/useFireInsights'
import { extractCoordinates as extractGeoPoint } from '@/utils/geo'
import BatteryTrendChart from '@/components/charts/BatteryTrendChart'
import HorizontalBarChart from '@/components/charts/HorizontalBarChart'
import type { FireIncident } from '@/types/datasets'
```

Note: `extractCoordinates` may already be imported — if so, just add the alias or skip. `HorizontalBarChart` may also already be imported — check and skip if so.

- [ ] **Step 2: Call the useFireInsights hook**

After the `trend` hook call (around line 106), add:

```typescript
  const isFireMode = serviceFilter === 'fire'
  const fireInsights = useFireInsights(isFireMode, dateRange)

  // Neighborhood name lookup for fire data — neighborhood_district may differ from
  // neighborhoods_analysis_boundaries. Build a case-insensitive lookup map.
  const fireNeighborhoodLookup = useMemo(() => {
    const map = new Map<string, typeof fireInsights.neighborhoodFires[0]>()
    for (const f of fireInsights.neighborhoodFires) {
      // Store under both original and lowercase for flexible matching
      map.set(f.neighborhood, f)
      map.set(f.neighborhood.toLowerCase(), f)
    }
    return map
  }, [fireInsights.neighborhoodFires])
```

- [ ] **Step 3: Build severity and battery overlay GeoJSON**

After the existing `apotGeojson` memo (around line 209), add:

```typescript
  // Fire severity overlay GeoJSON (casualties)
  const severityGeojson = useMemo(() => {
    if (!isFireMode || fireInsights.severityOverlay.length === 0) return null
    return {
      type: 'FeatureCollection' as const,
      features: fireInsights.severityOverlay
        .filter(r => r.point?.coordinates)
        .map(r => ({
          type: 'Feature' as const,
          geometry: r.point,
          properties: {
            callNumber: r.call_number,
            situation: r.primary_situation || '',
            injuries: (r.civilian_injuries || 0) + (r.fire_injuries || 0),
            fatalities: (r.civilian_fatalities || 0) + (r.fire_fatalities || 0),
            loss: r.estimated_property_loss || 0,
            address: r.address || '',
            date: r.alarm_dttm || '',
          },
        })),
    }
  }, [isFireMode, fireInsights.severityOverlay])

  // Battery fire overlay GeoJSON
  const batteryGeojson = useMemo(() => {
    if (!isFireMode || fireInsights.batteryOverlay.length === 0) return null
    return {
      type: 'FeatureCollection' as const,
      features: fireInsights.batteryOverlay
        .filter(r => r.point?.coordinates)
        .map(r => ({
          type: 'Feature' as const,
          geometry: r.point,
          properties: {
            callNumber: r.call_number,
            situation: r.primary_situation || '',
            factor: r.ignition_factor_primary || '',
            origin: r.area_of_fire_origin || '',
            property: r.property_use || '',
            address: r.address || '',
            date: r.alarm_dttm || '',
            injuries: (r.civilian_injuries || 0) + (r.fire_injuries || 0),
            loss: r.estimated_property_loss || 0,
          },
        })),
    }
  }, [isFireMode, fireInsights.batteryOverlay])
```

- [ ] **Step 4: Define severity and battery map layers**

After the existing `apotLayers` definition (around line 293), add:

```typescript
  const severityLayers = useMemo((): mapboxgl.AnyLayer[] => isFireMode ? [{
    id: 'fire-severity-points',
    type: 'circle',
    source: 'fire-severity',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 10],
      'circle-color': '#ef4444',
      'circle-stroke-color': '#ef4444',
      'circle-stroke-width': 2,
      'circle-opacity': 0.7,
      'circle-stroke-opacity': 0.9,
    },
  } as mapboxgl.AnyLayer] : [], [isFireMode])

  const batteryLayers = useMemo((): mapboxgl.AnyLayer[] => isFireMode ? [{
    id: 'fire-battery-points',
    type: 'circle',
    source: 'fire-battery',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 8],
      'circle-color': '#f59e0b',
      'circle-stroke-color': '#f59e0b',
      'circle-stroke-width': 2,
      'circle-opacity': 0.6,
      'circle-stroke-opacity': 0.8,
    },
  } as mapboxgl.AnyLayer] : [], [isFireMode])
```

- [ ] **Step 5: Bind overlay layers to map**

After the existing `useMapLayer` calls (around line 296-297), add:

```typescript
  useMapLayer(mapInstance, 'fire-severity', severityGeojson, severityLayers)
  useMapLayer(mapInstance, 'fire-battery', batteryGeojson, batteryLayers)
```

- [ ] **Step 6: Add tooltips for overlay layers**

After the existing `useMapTooltip` calls (around line 337), add:

```typescript
  // Fire severity tooltip
  useMapTooltip(mapInstance, 'fire-severity-points', (props) => {
    const casualties = []
    if (props.injuries > 0) casualties.push(`${props.injuries} injured`)
    if (props.fatalities > 0) casualties.push(`${props.fatalities} fatal`)
    return `<div class="font-mono text-[10px]">
      <div class="font-semibold text-red-400 mb-1">Fire with Casualties</div>
      <div>${props.situation}</div>
      <div class="text-red-300">${casualties.join(', ')}</div>
      ${props.loss > 0 ? `<div>Loss: $${Number(props.loss).toLocaleString()}</div>` : ''}
      <div class="text-slate-400 mt-1">${props.address}</div>
      <div class="text-slate-500">${props.date ? new Date(props.date).toLocaleDateString() : ''}</div>
    </div>`
  })

  // Battery fire tooltip
  useMapTooltip(mapInstance, 'fire-battery-points', (props) => {
    return `<div class="font-mono text-[10px]">
      <div class="font-semibold text-amber-400 mb-1">Battery Fire</div>
      <div>${props.factor || props.situation}</div>
      ${props.origin ? `<div>Origin: ${props.origin}</div>` : ''}
      ${props.property ? `<div>${props.property}</div>` : ''}
      <div class="text-slate-400 mt-1">${props.address}</div>
      <div class="text-slate-500">${props.date ? new Date(props.date).toLocaleDateString() : ''}</div>
    </div>`
  })
```

- [ ] **Step 7: Add click handlers for overlay layers**

In the existing click handler `useEffect` (around line 339-372), add click handlers for the two new layers. Inside the same `useEffect`, after the `response-points` click handler attachment:

```typescript
      // Fire severity + battery layer clicks
      const handleFireClick = (e: mapboxgl.MapMouseEvent) => {
        const features = e.features
        if (features && features.length > 0) {
          const callNumber = features[0].properties?.callNumber
          if (callNumber) setSelectedIncident(callNumber)
        }
      }
      try {
        mapInstance.on('click', 'fire-severity-points', handleFireClick)
        mapInstance.on('click', 'fire-battery-points', handleFireClick)
      } catch { /* layers may not exist yet */ }
```

And in the cleanup return:

```typescript
      try { mapInstance.off('click', 'fire-severity-points', handleFireClick) } catch { /* */ }
      try { mapInstance.off('click', 'fire-battery-points', handleFireClick) } catch { /* */ }
```

- [ ] **Step 8: Add conditional fire stat cards**

In the stat cards section (around line 571-601), after the APOT card (line 600) and before the closing `</div>` of the flex container, add:

```tsx
                {isFireMode && fireInsights.casualties && (
                  <>
                    <StatCard
                      label="Casualties"
                      info="fire-casualties"
                      value={String(fireInsights.casualties.injuries + fireInsights.casualties.fatalities)}
                      color="#ef4444"
                      delay={400}
                      subtitle={`${fireInsights.casualties.injuries} inj, ${fireInsights.casualties.fatalities} fatal`}
                      yoyDelta={
                        fireInsights.priorYearCasualties
                          ? (() => {
                              const prev = fireInsights.priorYearCasualties.injuries + fireInsights.priorYearCasualties.fatalities
                              const curr = fireInsights.casualties!.injuries + fireInsights.casualties!.fatalities
                              return prev > 0 ? ((curr - prev) / prev) * 100 : null
                            })()
                          : null
                      }
                    />
                    <StatCard
                      label="Est. Loss"
                      info="fire-property-loss"
                      value={fireInsights.casualties.totalLoss >= 1_000_000
                        ? `$${(fireInsights.casualties.totalLoss / 1_000_000).toFixed(1)}M`
                        : fireInsights.casualties.totalLoss >= 1_000
                        ? `$${(fireInsights.casualties.totalLoss / 1_000).toFixed(0)}K`
                        : `$${fireInsights.casualties.totalLoss.toLocaleString()}`}
                      color="#f59e0b"
                      delay={480}
                      yoyDelta={
                        fireInsights.priorYearCasualties && fireInsights.priorYearCasualties.totalLoss > 0
                          ? ((fireInsights.casualties.totalLoss - fireInsights.priorYearCasualties.totalLoss) / fireInsights.priorYearCasualties.totalLoss) * 100
                          : null
                      }
                    />
                  </>
                )}
```

- [ ] **Step 9: Add battery trend chart tile**

In the `chartTiles` memo (around line 419-452), after the existing daily-trend tile push and before `return tiles`:

```typescript
    // Battery fire trend tile (fire mode only)
    if (isFireMode && fireInsights.batteryTrend.length > 0) {
      tiles.push({
        id: 'battery-trend',
        label: 'Battery Fire Trend',
        shortLabel: 'Battery',
        color: '#f59e0b',
        defaultExpanded: true,
        render: () => <BatteryTrendChart data={fireInsights.batteryTrend} width={320} height={140} />,
      })
    }
```

- [ ] **Step 10: Enrich neighborhood sidebar rows with fire data**

In the neighborhoods tab (around line 656-709), inside the neighborhood row rendering, find the line that shows `{ns.totalIncidents} calls` (around line 676). After that text, add fire-specific indicators:

```tsx
                              {isFireMode && (() => {
                                const fireStat = fireNeighborhoodLookup.get(ns.neighborhood)
                                  || fireNeighborhoodLookup.get(ns.neighborhood.toLowerCase())
                                if (!fireStat) return null
                                return (
                                  <>
                                    <span className="text-red-400/80"> · {fireStat.count} fires</span>
                                    {fireStat.injuries > 0 && (
                                      <span className="text-red-400"> · {fireStat.injuries} inj</span>
                                    )}
                                    {fireStat.fatalities > 0 && (
                                      <span className="text-red-500 font-semibold"> · {fireStat.fatalities} fatal</span>
                                    )}
                                  </>
                                )
                              })()}
```

- [ ] **Step 11: Add Fire Insights section to Patterns tab**

In the patterns tab (around line 714-755), after the PeriodBreakdownChart block (after line 752), add the Fire Insights section:

```tsx
                {/* Fire Insights — only when Fire filter active */}
                {isFireMode && !fireInsights.isLoading && (fireInsights.causes.length > 0 || fireInsights.propertyTypes.length > 0) && (
                  <div className="mt-5">
                    <div className="flex items-center gap-2 mb-3">
                      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-red-400/80">
                        Fire Insights
                      </p>
                      <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                    </div>

                    {/* Top Causes */}
                    {fireInsights.causes.length > 0 && (
                      <div className="mb-4">
                        <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-500 dark:text-slate-600 mb-2">
                          Top Causes
                        </p>
                        <HorizontalBarChart
                          data={fireInsights.causes.map(c => ({ label: c.label, value: c.count, color: '#ef4444' }))}
                          width={232}
                          height={100}
                          maxBars={5}
                        />
                      </div>
                    )}

                    {/* Property Types */}
                    {fireInsights.propertyTypes.length > 0 && (
                      <div className="mb-4">
                        <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-500 dark:text-slate-600 mb-2">
                          Property Types
                        </p>
                        <HorizontalBarChart
                          data={fireInsights.propertyTypes.map(p => ({ label: p.label, value: p.count, color: '#fb923c' }))}
                          width={232}
                          height={80}
                          maxBars={4}
                        />
                      </div>
                    )}

                    {/* Detection Rate */}
                    {fireInsights.detectionStats && (
                      <div>
                        <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-500 dark:text-slate-600 mb-2">
                          Detection Rate
                        </p>
                        <div className="flex gap-2">
                          <div className="flex-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-2 text-center">
                            <p className="font-mono text-emerald-400 text-sm font-bold">
                              {fireInsights.detectionStats.detectorsPresent}%
                            </p>
                            <p className="text-[8px] text-slate-500 dark:text-slate-600 mt-0.5">
                              Detectors
                            </p>
                          </div>
                          <div className="flex-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-2 text-center">
                            <p className="font-mono text-amber-400 text-sm font-bold">
                              {fireInsights.detectionStats.effectiveAlert}%
                            </p>
                            <p className="text-[8px] text-slate-500 dark:text-slate-600 mt-0.5">
                              Effective
                            </p>
                          </div>
                          <div className="flex-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-2 text-center">
                            <p className="font-mono text-red-400 text-sm font-bold">
                              {fireInsights.detectionStats.sprinklersPresent}%
                            </p>
                            <p className="text-[8px] text-slate-500 dark:text-slate-600 mt-0.5">
                              Sprinklers
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
```

- [ ] **Step 12: Verify build**

Run: `pnpm build`
Expected: Clean build, no type errors.

- [ ] **Step 13: Commit**

```bash
git add src/views/EmergencyResponse/EmergencyResponse.tsx
git commit -m "feat: wire fire insights into Emergency Response — stat cards, overlays, sidebar, chart"
```

---

### Task 8: Verification

- [ ] **Step 1: Run full build**

Run: `pnpm build`
Expected: Clean build, no type errors, no warnings.

- [ ] **Step 2: Manual verification checklist**

Run `pnpm dev` and verify in the browser:

1. Navigate to Emergency Response (`/emergency-response`)
2. Default view (All filter) — no fire-specific UI visible. Behaves exactly as before.
3. Click "Fire" service filter:
   - Two new stat cards appear: "Casualties" (red) and "Est. Loss" (amber)
   - Red rings appear on map for fire incidents with casualties
   - Amber rings appear for battery fires
   - Sidebar Neighborhoods tab shows "X fires" and injury/fatality counts per neighborhood
   - Sidebar Patterns tab shows "Fire Insights" section with Top Causes, Property Types, Detection Rate
   - Battery Fire Trend chart tile appears in bottom-left ChartTray
4. Click a dispatch point on the map:
   - Detail panel opens with response timeline (existing)
   - Below the timeline: Fire Outcome, Cause & Origin, Detection & Protection sections appear
   - If no fire incident record matches, shows "No fire report on file"
5. Hover over red ring (severity overlay): tooltip shows casualties, situation, address
6. Hover over amber ring (battery overlay): tooltip shows "Battery Fire", ignition factor, origin
7. Click red/amber ring: opens detail panel with full fire outcome data
8. Switch back to "All" filter — all fire-specific UI disappears cleanly
9. Check Network tab — fire queries only fire when "Fire" filter is active, not on initial page load

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: polish fire incidents integration"
```
