# Neighborhood Profile View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a neighborhood-centric view that inverts DataDiver's current model — instead of "one dataset, many neighborhoods," show "one neighborhood, all datasets." The civic pulse of a place, not a dataset.

**Architecture:** The view fetches 5 parallel `useTrendBaseline` calls (one per geo-enabled dataset) on mount, merges results by neighborhood name into a unified `NeighborhoodProfile` structure, and renders as a choropleth map + multi-section sidebar. When a neighborhood is selected, the sidebar expands into a deep profile showing StatCards, sparklines, and anomaly indicators across Safety, Quality of Life, and Economy domains. URL param `?nh=Ingleside` enables shareable deep links.

**Tech Stack:** React + TypeScript, Zustand (appStore), Mapbox GL (choropleth), `useTrendBaseline` (5x parallel), `useNeighborhoodBoundaries` (GeoJSON), `StatCard` + `SparkBars` (existing components), Socrata SODA API.

---

## File Structure

```
src/views/Neighborhood/
  Neighborhood.tsx          # Main view component (layout, state, routing)
  useNeighborhoodProfiles.ts # Data hook: merges 5 datasets into per-neighborhood profiles
  NeighborhoodSidebar.tsx    # Right sidebar: picker, profile sections, comparisons
  NeighborhoodMap.tsx        # Choropleth map with metric-driven coloring
  neighborhoodMapLayers.ts   # Mapbox layer configs for choropleth + selection
  types.ts                   # NeighborhoodProfile, MetricDomain, SortKey interfaces
```

**Existing files to modify:**
- `src/App.tsx` — add `/neighborhood` and `/neighborhood/:name` routes
- `src/components/layout/AppShell.tsx` — add NH nav item
- `src/views/Home/Home.tsx` — add tile to VISUALIZATIONS array

---

## Task 1: Types & Data Model

**Files:**
- Create: `src/views/Neighborhood/types.ts`

- [ ] **Step 1: Define the NeighborhoodProfile interface**

This is the core data structure — one object per neighborhood, aggregating metrics from all datasets.

```typescript
// src/views/Neighborhood/types.ts

export interface DatasetMetric {
  count: number
  priorYearCount: number
  yoyPct: number
  zScore: number
  /** Dataset-specific metric (e.g., avg response time, avg resolution hours) */
  primaryMetric?: number
  primaryMetricPriorYear?: number
  primaryMetricLabel?: string
  primaryMetricFormat?: (v: number) => string
}

export interface NeighborhoodProfile {
  name: string
  /** Center point for map flyTo */
  centerLat: number
  centerLng: number

  /** Per-dataset metrics */
  emergency: DatasetMetric | null
  crime: DatasetMetric | null
  cases311: DatasetMetric | null
  crashes: DatasetMetric | null
  citations: DatasetMetric | null

  /** Composite score: average z-score across available datasets (0 = normal) */
  compositeZScore: number
  /** Number of datasets with |zScore| > 1 (anomaly count) */
  anomalyCount: number
  /** Total events across all datasets */
  totalEvents: number
}

export type MetricDomain = 'emergency' | 'crime' | 'cases311' | 'crashes' | 'citations'

export type SortKey = 'name' | 'totalEvents' | 'compositeZScore' | 'anomalyCount' | MetricDomain

export const DOMAIN_CONFIG: Record<MetricDomain, {
  label: string
  shortLabel: string
  color: string
  icon: string
}> = {
  emergency: { label: 'Emergency Response', shortLabel: 'ER', color: '#ef4444', icon: '🚒' },
  crime: { label: 'Crime Incidents', shortLabel: 'Crime', color: '#f97316', icon: '🔴' },
  cases311: { label: '311 Cases', shortLabel: '311', color: '#3b82f6', icon: '📋' },
  crashes: { label: 'Traffic Crashes', shortLabel: 'Crashes', color: '#eab308', icon: '⚠' },
  citations: { label: 'Parking Citations', shortLabel: 'Citations', color: '#f59e0b', icon: '🅿' },
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/Neighborhood/types.ts
git commit -m "feat(neighborhood): add types — NeighborhoodProfile, DatasetMetric, domain config"
```

---

## Task 2: Data Hook — useNeighborhoodProfiles

**Files:**
- Create: `src/views/Neighborhood/useNeighborhoodProfiles.ts`

This is the heart of the view — 5 parallel `useTrendBaseline` calls merged into a single profiles array.

- [ ] **Step 1: Create the hook**

```typescript
// src/views/Neighborhood/useNeighborhoodProfiles.ts

import { useMemo } from 'react'
import { useTrendBaseline } from '@/hooks/useTrendBaseline'
import { SF_NEIGHBORHOODS } from '@/utils/geo'
import type { NeighborhoodProfile, DatasetMetric } from './types'

/** Neighborhood centers — approximate lat/lng for flyTo */
const NEIGHBORHOOD_CENTERS: Record<string, [number, number]> = {
  'Bayview Hunters Point': [37.7346, -122.3907],
  'Bernal Heights': [37.7389, -122.4154],
  'Castro/Upper Market': [37.7609, -122.4350],
  'Chinatown': [37.7941, -122.4078],
  'Excelsior': [37.7236, -122.4254],
  'Financial District/South Beach': [37.7897, -122.3934],
  'Glen Park': [37.7340, -122.4332],
  'Golden Gate Park': [37.7694, -122.4862],
  'Haight Ashbury': [37.7692, -122.4481],
  'Hayes Valley': [37.7759, -122.4245],
  'Inner Richmond': [37.7781, -122.4641],
  'Inner Sunset': [37.7592, -122.4658],
  'Japantown': [37.7854, -122.4294],
  'Lakeshore': [37.7268, -122.4838],
  'Lincoln Park': [37.7856, -122.5033],
  'Lone Mountain/USF': [37.7770, -122.4518],
  'Marina': [37.8012, -122.4364],
  'McLaren Park': [37.7183, -122.4204],
  'Mission': [37.7599, -122.4148],
  'Mission Bay': [37.7707, -122.3910],
  'Nob Hill': [37.7930, -122.4161],
  'Noe Valley': [37.7502, -122.4337],
  'North Beach': [37.8007, -122.4112],
  'Oceanview/Merced/Ingleside': [37.7232, -122.4560],
  'Outer Mission': [37.7230, -122.4430],
  'Outer Richmond': [37.7781, -122.4941],
  'Pacific Heights': [37.7925, -122.4382],
  'Portola': [37.7284, -122.4054],
  'Potrero Hill': [37.7604, -122.3926],
  'Presidio': [37.7989, -122.4662],
  'Presidio Heights': [37.7878, -122.4518],
  'Russian Hill': [37.8011, -122.4194],
  'Seacliff': [37.7870, -122.4891],
  'South of Market': [37.7785, -122.3990],
  'Sunset/Parkside': [37.7532, -122.4941],
  'Tenderloin': [37.7833, -122.4133],
  'Treasure Island': [37.8235, -122.3707],
  'Twin Peaks': [37.7544, -122.4477],
  'Visitacion Valley': [37.7133, -122.4036],
  'West of Twin Peaks': [37.7458, -122.4577],
  'Western Addition': [37.7810, -122.4358],
}

function extractMetric(
  neighborhoodMap: Map<string, any> | undefined,
  name: string
): DatasetMetric | null {
  if (!neighborhoodMap) return null
  const stats = neighborhoodMap.get(name)
  if (!stats) return null
  return {
    count: stats.currentCount ?? 0,
    priorYearCount: stats.priorYearCount ?? 0,
    yoyPct: stats.yoyPct ?? 0,
    zScore: stats.zScore ?? 0,
  }
}

export interface NeighborhoodProfilesResult {
  profiles: NeighborhoodProfile[]
  profileMap: Map<string, NeighborhoodProfile>
  isLoading: boolean
}

export function useNeighborhoodProfiles(
  dateRange: { start: string; end: string }
): NeighborhoodProfilesResult {
  // 5 parallel trend baseline calls — one per geo-enabled dataset
  const trendER = useTrendBaseline(
    { datasetKey: 'fireEMSDispatch', dateField: 'received_dttm', neighborhoodField: 'neighborhoods_analysis_boundaries', baseWhere: 'on_scene_dttm IS NOT NULL' },
    dateRange
  )
  const trendCrime = useTrendBaseline(
    { datasetKey: 'policeIncidents', dateField: 'incident_datetime', neighborhoodField: 'analysis_neighborhood' },
    dateRange
  )
  const trend311 = useTrendBaseline(
    { datasetKey: 'cases311', dateField: 'requested_datetime', neighborhoodField: 'analysis_neighborhood' },
    dateRange
  )
  const trendCrashes = useTrendBaseline(
    { datasetKey: 'trafficCrashes', dateField: 'collision_datetime', neighborhoodField: 'analysis_neighborhood' },
    dateRange
  )
  const trendCitations = useTrendBaseline(
    { datasetKey: 'parkingCitations', dateField: 'citation_issued_datetime', neighborhoodField: 'analysis_neighborhood' },
    dateRange
  )

  const isLoading = trendER.isLoading || trendCrime.isLoading || trend311.isLoading || trendCrashes.isLoading || trendCitations.isLoading

  const { profiles, profileMap } = useMemo(() => {
    const map = new Map<string, NeighborhoodProfile>()

    for (const name of SF_NEIGHBORHOODS) {
      const emergency = extractMetric(trendER.neighborhoodMap, name)
      const crime = extractMetric(trendCrime.neighborhoodMap, name)
      const cases311 = extractMetric(trend311.neighborhoodMap, name)
      const crashes = extractMetric(trendCrashes.neighborhoodMap, name)
      const citations = extractMetric(trendCitations.neighborhoodMap, name)

      // Composite z-score: average of available z-scores
      const zScores = [emergency, crime, cases311, crashes, citations]
        .filter((m): m is DatasetMetric => m !== null)
        .map((m) => m.zScore)
      const compositeZScore = zScores.length > 0
        ? zScores.reduce((a, b) => a + b, 0) / zScores.length
        : 0
      const anomalyCount = zScores.filter((z) => Math.abs(z) > 1).length

      const totalEvents = [emergency, crime, cases311, crashes, citations]
        .filter((m): m is DatasetMetric => m !== null)
        .reduce((sum, m) => sum + m.count, 0)

      const center = NEIGHBORHOOD_CENTERS[name] || [37.76, -122.44]

      const profile: NeighborhoodProfile = {
        name,
        centerLat: center[0],
        centerLng: center[1],
        emergency,
        crime,
        cases311,
        crashes,
        citations,
        compositeZScore,
        anomalyCount,
        totalEvents,
      }

      map.set(name, profile)
    }

    const sorted = Array.from(map.values()).sort((a, b) => b.totalEvents - a.totalEvents)
    return { profiles: sorted, profileMap: map }
  }, [
    trendER.neighborhoodMap, trendCrime.neighborhoodMap,
    trend311.neighborhoodMap, trendCrashes.neighborhoodMap,
    trendCitations.neighborhoodMap,
  ])

  return { profiles, profileMap, isLoading }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/Neighborhood/useNeighborhoodProfiles.ts
git commit -m "feat(neighborhood): data hook — 5 parallel trend calls merged into profiles"
```

---

## Task 3: Choropleth Map Layers

**Files:**
- Create: `src/views/Neighborhood/neighborhoodMapLayers.ts`

- [ ] **Step 1: Define choropleth + selection layers**

```typescript
// src/views/Neighborhood/neighborhoodMapLayers.ts

import type mapboxgl from 'mapbox-gl'

/** Choropleth fill — colored by z-score expression set dynamically */
export const NEIGHBORHOOD_CHOROPLETH_LAYERS: mapboxgl.AnyLayer[] = [
  {
    id: 'neighborhood-fill',
    type: 'fill',
    source: 'neighborhood-boundaries',
    paint: {
      'fill-color': '#64748b',  // placeholder — set dynamically via setColorExpression
      'fill-opacity': 0.35,
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'neighborhood-outline',
    type: 'line',
    source: 'neighborhood-boundaries',
    paint: {
      'line-color': 'rgba(255,255,255,0.15)',
      'line-width': 1,
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'neighborhood-labels',
    type: 'symbol',
    source: 'neighborhood-boundaries',
    layout: {
      'text-field': ['get', 'nhood'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 10, 8, 14, 12],
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
      'text-anchor': 'center',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': 'rgba(255,255,255,0.7)',
      'text-halo-color': 'rgba(0,0,0,0.6)',
      'text-halo-width': 1,
    },
  } as mapboxgl.AnyLayer,
]

/** Selected neighborhood highlight */
export const NEIGHBORHOOD_SELECTION_LAYERS: mapboxgl.AnyLayer[] = [
  {
    id: 'neighborhood-selection-fill',
    type: 'fill',
    source: 'neighborhood-boundaries',
    paint: {
      'fill-color': '#a855f7',
      'fill-opacity': 0.15,
    },
    filter: ['==', 'nhood', ''],  // set dynamically
  } as mapboxgl.AnyLayer,
  {
    id: 'neighborhood-selection-outline',
    type: 'line',
    source: 'neighborhood-boundaries',
    paint: {
      'line-color': '#a855f7',
      'line-width': 2.5,
    },
    filter: ['==', 'nhood', ''],  // set dynamically
  } as mapboxgl.AnyLayer,
]

/**
 * Build a Mapbox data-driven expression that colors neighborhoods by z-score.
 * Red = anomalously high, Blue = anomalously low, Slate = normal.
 */
export function buildZScoreColorExpression(
  profileMap: Map<string, { compositeZScore: number }>,
): mapboxgl.Expression {
  const stops: (string | number)[] = []
  for (const [name, profile] of profileMap) {
    const z = profile.compositeZScore
    let color: string
    if (z > 2) color = '#ef4444'       // deep red
    else if (z > 1) color = '#f97316'  // orange
    else if (z > 0.5) color = '#fbbf24' // amber
    else if (z < -2) color = '#3b82f6' // deep blue
    else if (z < -1) color = '#60a5fa' // light blue
    else color = '#64748b'             // slate (normal)
    stops.push(name, color)
  }
  return ['match', ['get', 'nhood'], ...stops, '#334155'] as mapboxgl.Expression
}

/**
 * Build color expression for a specific metric domain (event count).
 */
export function buildMetricColorExpression(
  profileMap: Map<string, any>,
  domain: string,
): mapboxgl.Expression {
  const counts: number[] = []
  for (const profile of profileMap.values()) {
    const metric = profile[domain]
    if (metric) counts.push(metric.count)
  }
  const maxCount = Math.max(...counts, 1)

  const stops: (string | number)[] = []
  for (const [name, profile] of profileMap) {
    const metric = profile[domain]
    const intensity = metric ? metric.count / maxCount : 0
    // Interpolate from slate to domain accent color based on intensity
    const r = Math.round(100 + intensity * 155)
    const g = Math.round(116 - intensity * 50)
    const b = Math.round(139 - intensity * 70)
    stops.push(name, `rgb(${r},${g},${b})`)
  }
  return ['match', ['get', 'nhood'], ...stops, '#334155'] as mapboxgl.Expression
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/Neighborhood/neighborhoodMapLayers.ts
git commit -m "feat(neighborhood): choropleth map layers — z-score + metric color expressions"
```

---

## Task 4: Neighborhood Sidebar

**Files:**
- Create: `src/views/Neighborhood/NeighborhoodSidebar.tsx`

- [ ] **Step 1: Build the sidebar — picker mode + profile mode**

```typescript
// src/views/Neighborhood/NeighborhoodSidebar.tsx

import { useState, useMemo } from 'react'
import StatCard from '@/components/ui/StatCard'
import { SkeletonSidebarRows } from '@/components/ui/Skeleton'
import NeighborhoodCensusContext from '@/components/ui/NeighborhoodCensusContext'
import type { NeighborhoodProfile, MetricDomain, SortKey } from './types'
import { DOMAIN_CONFIG } from './types'

interface NeighborhoodSidebarProps {
  profiles: NeighborhoodProfile[]
  selectedNeighborhood: string | null
  onSelectNeighborhood: (name: string | null) => void
  isLoading: boolean
}

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString()
}

function MetricRow({ label, metric, color }: {
  label: string
  metric: import('./types').DatasetMetric | null
  color: string
}) {
  if (!metric) return null
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-[11px] text-slate-300 truncate">{label}</span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-[11px] font-mono text-slate-400">{formatCount(metric.count)}</span>
        <span className={`text-[10px] font-mono ${metric.yoyPct > 0 ? 'text-red-400' : metric.yoyPct < 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
          {metric.yoyPct >= 0 ? '+' : ''}{metric.yoyPct.toFixed(0)}%
        </span>
        {Math.abs(metric.zScore) > 1 && (
          <span className={`w-1.5 h-1.5 rounded-full ${metric.zScore > 1 ? 'bg-red-400' : 'bg-blue-400'}`} />
        )}
      </div>
    </div>
  )
}

/** Deep profile for a selected neighborhood */
function NeighborhoodProfile({ profile }: { profile: NeighborhoodProfile }) {
  return (
    <div className="space-y-4">
      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="Total Events"
          value={formatCount(profile.totalEvents)}
          color="#8b5cf6"
          zScore={profile.compositeZScore}
        />
        <StatCard
          label="Anomalies"
          value={`${profile.anomalyCount} of 5`}
          color={profile.anomalyCount > 2 ? '#ef4444' : profile.anomalyCount > 0 ? '#f59e0b' : '#10b981'}
        />
      </div>

      {/* Per-domain breakdown */}
      <div>
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-2">Safety</p>
        <div className="space-y-0.5">
          <MetricRow label="Emergency Response" metric={profile.emergency} color={DOMAIN_CONFIG.emergency.color} />
          <MetricRow label="Crime Incidents" metric={profile.crime} color={DOMAIN_CONFIG.crime.color} />
          <MetricRow label="Traffic Crashes" metric={profile.crashes} color={DOMAIN_CONFIG.crashes.color} />
        </div>
      </div>

      <div>
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-2">Quality of Life</p>
        <div className="space-y-0.5">
          <MetricRow label="311 Cases" metric={profile.cases311} color={DOMAIN_CONFIG.cases311.color} />
          <MetricRow label="Parking Citations" metric={profile.citations} color={DOMAIN_CONFIG.citations.color} />
        </div>
      </div>

      {/* Census context (already exists as a component) */}
      <NeighborhoodCensusContext neighborhood={profile.name} />
    </div>
  )
}

export default function NeighborhoodSidebar({
  profiles,
  selectedNeighborhood,
  onSelectNeighborhood,
  isLoading,
}: NeighborhoodSidebarProps) {
  const [sortKey, setSortKey] = useState<SortKey>('totalEvents')

  const sorted = useMemo(() => {
    const copy = [...profiles]
    switch (sortKey) {
      case 'name': return copy.sort((a, b) => a.name.localeCompare(b.name))
      case 'totalEvents': return copy.sort((a, b) => b.totalEvents - a.totalEvents)
      case 'compositeZScore': return copy.sort((a, b) => b.compositeZScore - a.compositeZScore)
      case 'anomalyCount': return copy.sort((a, b) => b.anomalyCount - a.anomalyCount)
      default: {
        // Sort by specific domain count
        return copy.sort((a, b) => {
          const aMetric = a[sortKey as MetricDomain]
          const bMetric = b[sortKey as MetricDomain]
          return (bMetric?.count ?? 0) - (aMetric?.count ?? 0)
        })
      }
    }
  }, [profiles, sortKey])

  const selectedProfile = selectedNeighborhood
    ? profiles.find((p) => p.name === selectedNeighborhood) ?? null
    : null

  return (
    <aside className="w-72 flex-shrink-0 border-l border-white/[0.06] flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">
            {selectedNeighborhood ? 'Neighborhood Profile' : 'All Neighborhoods'}
          </p>
          {selectedNeighborhood && (
            <button
              onClick={() => onSelectNeighborhood(null)}
              className="text-[9px] font-mono text-blue-400 hover:text-blue-300 transition-colors"
            >
              Show all
            </button>
          )}
        </div>

        {selectedNeighborhood && (
          <h2 className="text-lg font-display italic text-white leading-tight mb-1">
            {selectedNeighborhood}
          </h2>
        )}

        {!selectedNeighborhood && (
          <div className="flex gap-1 flex-wrap">
            {(['totalEvents', 'compositeZScore', 'anomalyCount', 'name'] as SortKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSortKey(key)}
                className={`text-[9px] font-mono px-2 py-0.5 rounded-full transition-colors ${
                  sortKey === key
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {key === 'totalEvents' ? 'Events' : key === 'compositeZScore' ? 'Z-Score' : key === 'anomalyCount' ? 'Anomalies' : 'A-Z'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {isLoading ? (
          <SkeletonSidebarRows count={12} />
        ) : selectedProfile ? (
          <NeighborhoodProfile profile={selectedProfile} />
        ) : (
          <div className="space-y-0.5">
            {sorted.map((profile) => (
              <button
                key={profile.name}
                onClick={() => onSelectNeighborhood(profile.name)}
                className={`w-full text-left py-2 px-3 rounded-lg cursor-pointer transition-all hover:bg-white/[0.04] ${
                  selectedNeighborhood === profile.name ? 'bg-purple-500/10 ring-1 ring-purple-500/20' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-slate-200 truncate leading-tight">
                      {profile.name}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-600 font-mono italic">
                      {formatCount(profile.totalEvents)} events
                      {profile.anomalyCount > 0 && (
                        <span className="text-amber-400"> · {profile.anomalyCount} anomal{profile.anomalyCount === 1 ? 'y' : 'ies'}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {Math.abs(profile.compositeZScore) > 1 && (
                      <div className={`w-1.5 h-1.5 rounded-full ${profile.compositeZScore > 1 ? 'bg-red-400' : 'bg-blue-400'}`} />
                    )}
                    <span className="text-[11px] font-mono text-slate-400">
                      {profile.compositeZScore >= 0 ? '+' : ''}{profile.compositeZScore.toFixed(1)}σ
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/Neighborhood/NeighborhoodSidebar.tsx
git commit -m "feat(neighborhood): sidebar — picker list + deep profile with per-domain metrics"
```

---

## Task 5: Main View Component

**Files:**
- Create: `src/views/Neighborhood/Neighborhood.tsx`

- [ ] **Step 1: Build the main view**

```typescript
// src/views/Neighborhood/Neighborhood.tsx

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import { useAppStore } from '@/stores/appStore'
import MapView from '@/components/maps/MapView'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { MapLoadingIndicator } from '@/components/ui/Skeleton'
import { useNeighborhoodProfiles } from './useNeighborhoodProfiles'
import NeighborhoodSidebar from './NeighborhoodSidebar'
import {
  NEIGHBORHOOD_CHOROPLETH_LAYERS,
  NEIGHBORHOOD_SELECTION_LAYERS,
  buildZScoreColorExpression,
} from './neighborhoodMapLayers'

export default function Neighborhood() {
  const dateRange = useAppStore((s) => s.dateRange)
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedNeighborhood = searchParams.get('nh') || null

  const { profiles, profileMap, isLoading } = useNeighborhoodProfiles(dateRange)
  const boundaries = useNeighborhoodBoundaries()

  const setSelectedNeighborhood = useCallback(
    (name: string | null) => {
      setSearchParams((prev) => {
        if (name) prev.set('nh', name)
        else prev.delete('nh')
        return prev
      }, { replace: true })
    },
    [setSearchParams]
  )

  // Fly to selected neighborhood
  useEffect(() => {
    if (!mapInstance || !selectedNeighborhood) return
    const profile = profileMap.get(selectedNeighborhood)
    if (profile) {
      mapInstance.flyTo({ center: [profile.centerLng, profile.centerLat], zoom: 14, duration: 1200 })
    }
  }, [mapInstance, selectedNeighborhood, profileMap])

  // Update choropleth colors when data loads
  useEffect(() => {
    if (!mapInstance || profileMap.size === 0) return
    const expr = buildZScoreColorExpression(profileMap)
    try {
      mapInstance.setPaintProperty('neighborhood-fill', 'fill-color', expr)
    } catch { /* layer may not be ready yet */ }
  }, [mapInstance, profileMap])

  // Update selection filter
  useEffect(() => {
    if (!mapInstance) return
    const filter: mapboxgl.FilterSpecification = selectedNeighborhood
      ? ['==', 'nhood', selectedNeighborhood]
      : ['==', 'nhood', '']
    try {
      mapInstance.setFilter('neighborhood-selection-fill', filter)
      mapInstance.setFilter('neighborhood-selection-outline', filter)
    } catch { /* layers may not be ready */ }
  }, [mapInstance, selectedNeighborhood])

  // Map layers
  useMapLayer(mapInstance, 'neighborhood-boundaries', boundaries, NEIGHBORHOOD_CHOROPLETH_LAYERS)
  useMapLayer(mapInstance, 'neighborhood-boundaries', boundaries, NEIGHBORHOOD_SELECTION_LAYERS)

  // Click handler for choropleth
  useEffect(() => {
    if (!mapInstance) return
    const handler = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      const feature = e.features?.[0]
      if (feature?.properties?.nhood) {
        const name = feature.properties.nhood
        setSelectedNeighborhood(selectedNeighborhood === name ? null : name)
      }
    }
    mapInstance.on('click', 'neighborhood-fill', handler)
    mapInstance.getCanvas().style.cursor = 'pointer'
    return () => {
      mapInstance.off('click', 'neighborhood-fill', handler)
    }
  }, [mapInstance, selectedNeighborhood, setSelectedNeighborhood])

  // Tooltip
  useMapTooltip(mapInstance, 'neighborhood-fill', (props) => {
    const profile = profileMap.get(props.nhood)
    if (!profile) return `<div class="tooltip-value">${props.nhood}</div>`
    return `
      <div class="tooltip-value">${props.nhood}</div>
      <div style="color:#94a3b8;font-size:10px;margin-top:4px">
        ${profile.totalEvents.toLocaleString()} events ·
        z-score: ${profile.compositeZScore >= 0 ? '+' : ''}${profile.compositeZScore.toFixed(1)}
      </div>
      ${profile.anomalyCount > 0 ? `<div style="color:#fbbf24;font-size:10px">${profile.anomalyCount} anomal${profile.anomalyCount === 1 ? 'y' : 'ies'}</div>` : ''}
    `
  })

  return (
    <div className="flex h-full">
      {/* Map */}
      <div className="flex-1 relative">
        <MapView
          ref={(ref) => { if (ref && !mapInstance) setMapInstance(ref) }}
          onMapReady={setMapInstance}
          initialCenter={[-122.4394, 37.7549]}
          initialZoom={11.8}
        />
        {isLoading && <MapLoadingIndicator label="Loading neighborhoods..." />}

        {/* View title */}
        <div className="absolute top-4 left-4 z-10">
          <h1 className="text-2xl font-display italic text-white drop-shadow-lg">
            Neighborhood Profiles
          </h1>
          <p className="text-[11px] font-mono text-slate-400 mt-0.5">
            Cross-dataset civic pulse · {profiles.length} neighborhoods
          </p>
        </div>
      </div>

      {/* Sidebar */}
      <NeighborhoodSidebar
        profiles={profiles}
        selectedNeighborhood={selectedNeighborhood}
        onSelectNeighborhood={setSelectedNeighborhood}
        isLoading={isLoading}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/Neighborhood/Neighborhood.tsx
git commit -m "feat(neighborhood): main view — choropleth map + sidebar + URL param sync"
```

---

## Task 6: Routing & Navigation

**Files:**
- Modify: `src/App.tsx` — add route
- Modify: `src/components/layout/AppShell.tsx` — add nav item
- Modify: `src/views/Home/Home.tsx` — add tile

- [ ] **Step 1: Add route to App.tsx**

Add after the `/traffic-safety` route:

```typescript
<Route path="/neighborhood" element={<Neighborhood />} />
```

And the import:

```typescript
import Neighborhood from '@/views/Neighborhood/Neighborhood'
```

- [ ] **Step 2: Add nav item to AppShell.tsx**

Add to `NAV_ITEMS` array (before the bottom utility items like Light/Collapse):

```typescript
{
  path: '/neighborhood',
  label: 'Neighborhoods',
  shortLabel: 'NH',
  description: 'Cross-dataset civic profiles',
  accentColor: '#8b5cf6',
},
```

- [ ] **Step 3: Add tile to Home.tsx VISUALIZATIONS**

```typescript
{
  path: '/neighborhood',
  title: 'Neighborhood Profiles',
  subtitle: 'Cross-Dataset Civic Pulse',
  badge: 'NH',
  description: 'Deep-dive into any of 41 neighborhoods. Compare emergency response, crime, 311 complaints, crashes, and citations — with YoY trends and anomaly detection.',
  stats: [
    { label: 'Neighborhoods', value: '41' },
    { label: 'Datasets', value: '5' },
    { label: 'Metrics', value: 'YoY + z-score' },
  ],
  accentColor: '#8b5cf6',
},
```

- [ ] **Step 4: Verify build**

```bash
npx tsc -b
```

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/layout/AppShell.tsx src/views/Home/Home.tsx
git commit -m "feat(neighborhood): routing, nav item, and Home tile"
```

---

## Task 7: Shareable URL Deep Links

**Files:**
- Modify: `src/views/Neighborhood/Neighborhood.tsx` (already handles `?nh=` param)

The `?nh=Ingleside` URL param is already implemented in Task 5 via `useSearchParams`. This task adds the `?start=` and `?end=` params (already handled by `useUrlSync` at the AppShell level) and verifies end-to-end.

- [ ] **Step 1: Verify URL roundtrip**

Test these URLs manually:
- `/neighborhood` → shows all 41 neighborhoods
- `/neighborhood?nh=Oceanview/Merced/Ingleside` → shows Ingleside profile + map flyTo
- `/neighborhood?nh=Tenderloin&start=2026-01-01&end=2026-03-26` → Tenderloin profile, date-filtered

- [ ] **Step 2: Commit any fixes**

```bash
git commit -m "fix(neighborhood): URL param encoding for neighborhood names with slashes"
```

---

## Task 8: Integration Test & Polish

- [ ] **Step 1: Build check**

```bash
npx tsc -b && pnpm build
```

- [ ] **Step 2: Visual QA checklist**

Navigate to `/neighborhood` and verify:
- Choropleth renders with z-score-based coloring (red = anomalously high activity)
- Clicking a neighborhood: sidebar shows profile, map flies to it, purple selection highlight
- Clicking "Show all" returns to full list
- Sort buttons (Events, Z-Score, Anomalies, A-Z) work
- Skeleton loading shows during data fetch
- Tooltip on hover shows neighborhood name + summary stats
- Mobile: sidebar should collapse (verify it doesn't break)

- [ ] **Step 3: Final commit + push**

```bash
git add -A
git commit -m "feat: Neighborhood Profiles view — cross-dataset civic pulse for 41 neighborhoods

New /neighborhood route showing all 5 geo-enabled datasets merged
into a single per-neighborhood profile. Choropleth map colored by
composite z-score. Sidebar with sortable list, deep profile on
click (per-domain metrics, YoY%, anomaly indicators, Census context).

Shareable via ?nh=Ingleside&start=YYYY-MM-DD&end=YYYY-MM-DD.

Datasets: Emergency Response, Crime, 311, Traffic Crashes, Citations.
Each neighborhood shows: event count, YoY%, z-score, anomaly count."
git push
```

---

## Future Enhancements (not in this plan)

These are noted for future planning, not implemented now:

1. **Comparison mode** — side-by-side two neighborhoods or neighborhood vs citywide average
2. **Per-domain sparklines** — 30-day mini trend charts in the sidebar profile
3. **Business Activity + Parking Revenue integration** — once those datasets have reliable `analysis_neighborhood` fields
4. **Census demographic underlay** — when Census integration is complete, add income/demographics to the profile
5. **"Neighborhood Report" export** — PNG or PDF one-pager for a selected neighborhood
6. **Cross-linking** — clicking a domain metric in the profile navigates to that view pre-filtered to the neighborhood
