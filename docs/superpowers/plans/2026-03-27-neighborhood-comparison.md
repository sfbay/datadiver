# Neighborhood Comparison Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable side-by-side comparison of 2-3 neighborhoods with overlaid civic fingerprints, proportional domain bars, multi-boundary map highlighting, and domain cross-linking.

**Architecture:** Adds `compareMode` and `compareSet` state to the Neighborhood view, persisted via `?compare=` URL param. The sidebar switches between browse/single-profile/comparison views. The CivicFingerprint component gains a `ghostProfiles` prop for overlay polygons. Map renders up to 3 colored boundary highlights using a factory function for layer configs. No new Socrata queries — comparison is a pure presentation layer on existing `useNeighborhoodProfiles` data.

**Tech Stack:** React, TypeScript, Mapbox GL, existing `useNeighborhoodProfiles` hook, `useMapLayer`, URL search params.

**Spec:** `docs/superpowers/specs/2026-03-27-neighborhood-comparison-design.md`

---

## File Structure

```
src/views/Neighborhood/
  types.ts                    # MODIFY: add SLOT_COLORS, DOMAIN_ROUTES
  CivicFingerprint.tsx        # MODIFY: add ghostProfiles prop
  ComparisonView.tsx          # CREATE: comparison sidebar content
  NeighborhoodSidebar.tsx     # MODIFY: compare toggle + routing to ComparisonView
  Neighborhood.tsx            # MODIFY: compareMode state, URL sync, multi-boundary map
  neighborhoodMapLayers.ts    # MODIFY: add makeSlotLayers factory
```

---

### Task 1: Add Constants to types.ts

**Files:**
- Modify: `src/views/Neighborhood/types.ts`

- [ ] **Step 1: Add SLOT_COLORS and DOMAIN_ROUTES**

Add to end of `src/views/Neighborhood/types.ts`:

```typescript
/** Fixed color slots for comparison mode */
export const SLOT_COLORS = [
  { hex: '#a855f7', name: 'purple', dashArray: '' },       // slot 0: solid
  { hex: '#22d3ee', name: 'cyan', dashArray: '4,3' },      // slot 1: dashed
  { hex: '#34d399', name: 'green', dashArray: '2,3' },     // slot 2: dotted
] as const

/** Cross-link routes: fingerprint axis → dataset view */
export const DOMAIN_ROUTES: Record<MetricDomain, string> = {
  emergency: '/emergency-response',
  crime: '/crime-incidents',
  cases311: '/311-cases',
  crashes: '/traffic-safety',
  citations: '/parking-citations',
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc -b
```

- [ ] **Step 3: Commit**

```bash
git add src/views/Neighborhood/types.ts
git commit -m "feat(neighborhood): add SLOT_COLORS and DOMAIN_ROUTES constants"
```

---

### Task 2: Ghost Polygons on CivicFingerprint

**Files:**
- Modify: `src/views/Neighborhood/CivicFingerprint.tsx`

- [ ] **Step 1: Add ghostProfiles prop to interface**

Replace lines 13-20 of `CivicFingerprint.tsx`:

```typescript
interface GhostOverlay {
  profile: NeighborhoodProfile
  color: string
  dashArray: string
}

interface CivicFingerprintProps {
  profile: NeighborhoodProfile
  size?: number
  showLabels?: boolean
  animate?: boolean
  className?: string
  /** Comparison overlays rendered behind the primary polygon */
  ghostProfiles?: GhostOverlay[]
}
```

- [ ] **Step 2: Add ghost polygon computation**

After the `polygonPath` const (line 60), add a helper to compute polygon points for any profile:

```typescript
  // Compute polygon path for a given profile
  function computePolygon(p: NeighborhoodProfile): string {
    return DOMAINS.map(({ key }, i) => {
      const metric = p[key]
      const z = metric ? Math.max(-3, Math.min(3, metric.zScore)) : -3
      const v = 0.35 + (z / 3) * 0.55
      const r = Math.max(v, 0.15) * maxR
      const angle = (i / DOMAINS.length) * TAU - Math.PI / 2
      return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
    }).join(' ')
  }
```

- [ ] **Step 3: Render ghost polygons before the primary polygon**

Insert before the `{/* Filled polygon */}` comment (before line 111):

```typescript
      {/* Ghost overlay polygons (comparison mode) */}
      {ghostProfiles?.map((ghost, gi) => (
        <polygon
          key={gi}
          points={computePolygon(ghost.profile)}
          fill={`${ghost.color}${gi === 0 ? '0f' : '0c'}`}
          stroke={ghost.color}
          strokeOpacity={gi === 0 ? 0.4 : 0.35}
          strokeWidth={1}
          strokeDasharray={ghost.dashArray}
          strokeLinejoin="round"
        />
      ))}
```

- [ ] **Step 4: Pass ghostProfiles through in the component signature**

Update the destructuring on line 24-30 to include `ghostProfiles`:

```typescript
export default function CivicFingerprint({
  profile,
  size = 120,
  showLabels = true,
  animate = true,
  className = '',
  ghostProfiles,
}: CivicFingerprintProps) {
```

- [ ] **Step 5: Verify build**

```bash
npx tsc -b
```

- [ ] **Step 6: Commit**

```bash
git add src/views/Neighborhood/CivicFingerprint.tsx
git commit -m "feat(neighborhood): ghost polygon overlays on CivicFingerprint"
```

---

### Task 3: ComparisonView Sidebar Component

**Files:**
- Create: `src/views/Neighborhood/ComparisonView.tsx`

- [ ] **Step 1: Create ComparisonView**

```typescript
// src/views/Neighborhood/ComparisonView.tsx

/** Comparison sidebar: overlaid fingerprint + legend + proportional domain bars + cross-links */

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import CivicFingerprint from './CivicFingerprint'
import type { NeighborhoodProfile, MetricDomain, DatasetMetric } from './types'
import { DOMAINS, SLOT_COLORS, DOMAIN_ROUTES } from './types'

interface ComparisonViewProps {
  /** Profiles in slot order (index 0 = primary/purple, 1 = cyan, 2 = green) */
  profiles: NeighborhoodProfile[]
  onRemove: (name: string) => void
}

function fmt(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString()
}

/** Proportional bars for one domain across all compared neighborhoods */
function DomainBars({
  domain,
  profiles,
}: {
  domain: { key: MetricDomain; label: string; color: string }
  profiles: NeighborhoodProfile[]
}) {
  const navigate = useNavigate()
  const maxCount = Math.max(...profiles.map((p) => p[domain.key]?.count ?? 0), 1)

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <span className="text-[10px] font-mono" style={{ color: domain.color }}>
          {domain.label}
        </span>
        <button
          onClick={() => {
            const primary = profiles[0]
            if (primary) navigate(`${DOMAIN_ROUTES[domain.key]}?neighborhood=${encodeURIComponent(primary.name)}`)
          }}
          className="text-[9px] font-mono text-slate-600 hover:text-slate-400 transition-colors"
          title={`Open ${domain.label} view`}
        >
          →
        </button>
      </div>
      <div className="space-y-[3px]">
        {profiles.map((profile, i) => {
          const metric = profile[domain.key]
          if (!metric) return null
          const widthPct = (metric.count / maxCount) * 100
          const slot = SLOT_COLORS[i]
          return (
            <div key={profile.name} className="flex items-center gap-2">
              <div className="flex-1 h-[6px] rounded-full bg-white/[0.04] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${widthPct}%`, backgroundColor: slot.hex }}
                />
              </div>
              <span className="text-[9px] font-mono tabular-nums w-10 text-right" style={{ color: slot.hex }}>
                {fmt(metric.count)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ComparisonView({ profiles, onRemove }: ComparisonViewProps) {
  const primary = profiles[0]
  const ghosts = useMemo(
    () =>
      profiles.slice(1).map((p, i) => ({
        profile: p,
        color: SLOT_COLORS[i + 1].hex,
        dashArray: SLOT_COLORS[i + 1].dashArray,
      })),
    [profiles]
  )

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Selected neighborhoods with remove buttons */}
      <div className="space-y-1">
        {profiles.map((p, i) => (
          <div key={p.name} className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: SLOT_COLORS[i].hex }}
              />
              <span className="text-[11px] text-slate-300 truncate">{p.name}</span>
            </div>
            <button
              onClick={() => onRemove(p.name)}
              className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0 ml-2"
            >
              ✕
            </button>
          </div>
        ))}
        {profiles.length < 3 && (
          <p className="text-[9px] font-mono text-slate-600 italic px-1 mt-1">
            Click a neighborhood to add ({3 - profiles.length} remaining)
          </p>
        )}
      </div>

      {/* Overlaid fingerprint */}
      {primary && (
        <div className="flex flex-col items-center py-2">
          <CivicFingerprint
            profile={primary}
            size={160}
            showLabels
            animate
            ghostProfiles={ghosts}
          />
          {/* Legend */}
          <div className="flex items-center gap-3 mt-2">
            {profiles.map((p, i) => (
              <span key={p.name} className="flex items-center gap-1">
                <span
                  className="inline-block w-3 h-[2px]"
                  style={{
                    backgroundColor: SLOT_COLORS[i].hex,
                    ...(SLOT_COLORS[i].dashArray ? { backgroundImage: 'none' } : {}),
                  }}
                />
                <span className="text-[8px] font-mono" style={{ color: SLOT_COLORS[i].hex }}>
                  {p.name.length > 14 ? p.name.slice(0, 12) + '...' : p.name}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Domain comparison bars */}
      <div>
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-2 px-0.5">
          Safety
        </p>
        <DomainBars domain={DOMAINS[0]} profiles={profiles} />
        <DomainBars domain={DOMAINS[1]} profiles={profiles} />
        <DomainBars domain={DOMAINS[3]} profiles={profiles} />
      </div>

      <div>
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-2 px-0.5">
          Quality of Life
        </p>
        <DomainBars domain={DOMAINS[2]} profiles={profiles} />
        <DomainBars domain={DOMAINS[4]} profiles={profiles} />
      </div>

      {/* Summary z-scores */}
      <div className="flex items-center justify-center gap-4 pt-2 border-t border-white/[0.04]">
        {profiles.map((p, i) => (
          <span key={p.name} className="text-[10px] font-mono tabular-nums" style={{ color: SLOT_COLORS[i].hex }}>
            {p.compositeZScore >= 0 ? '+' : ''}{p.compositeZScore.toFixed(1)}σ
          </span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc -b
```

- [ ] **Step 3: Commit**

```bash
git add src/views/Neighborhood/ComparisonView.tsx
git commit -m "feat(neighborhood): ComparisonView — overlaid fingerprint + proportional bars"
```

---

### Task 4: Compare Toggle in NeighborhoodSidebar

**Files:**
- Modify: `src/views/Neighborhood/NeighborhoodSidebar.tsx`

- [ ] **Step 1: Update Props interface**

Replace the Props interface (lines 9-13):

```typescript
interface Props {
  profiles: NeighborhoodProfile[]
  profileMap: Map<string, NeighborhoodProfile>
  selectedNeighborhood: string | null
  onSelectNeighborhood: (name: string | null) => void
  isLoading: boolean
  compareMode: boolean
  onToggleCompare: () => void
  compareSet: string[]
  onAddToCompare: (name: string) => void
  onRemoveFromCompare: (name: string) => void
}
```

- [ ] **Step 2: Add ComparisonView import**

Add after the existing imports (line 7):

```typescript
import ComparisonView from './ComparisonView'
```

- [ ] **Step 3: Update component destructuring**

Replace the destructuring in the default export (lines 136-140):

```typescript
export default function NeighborhoodSidebar({
  profiles,
  profileMap,
  selectedNeighborhood,
  onSelectNeighborhood,
  isLoading,
  compareMode,
  onToggleCompare,
  compareSet,
  onAddToCompare,
  onRemoveFromCompare,
}: Props) {
```

- [ ] **Step 4: Add Compare toggle button to header**

Replace the sort buttons div (lines 184-198) with:

```typescript
        ) : (
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex gap-1 flex-1">
              {sortButtons.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortKey(key)}
                  className={`text-[9px] font-mono px-2 py-0.5 rounded-full transition-all duration-200 ${
                    sortKey === key
                      ? 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/20'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={onToggleCompare}
              className={`text-[9px] font-mono px-2 py-0.5 rounded-full transition-all duration-200 ${
                compareMode
                  ? 'bg-purple-500/30 text-purple-300 ring-1 ring-purple-500/30'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
              }`}
            >
              Compare
            </button>
          </div>
```

- [ ] **Step 5: Update header label and neighborhood title for compare mode**

Replace the header label (lines 166-176):

```typescript
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">
            {compareMode
              ? `Comparing ${compareSet.length} of 3`
              : selectedNeighborhood
                ? 'Neighborhood Profile'
                : '41 Neighborhoods'}
          </p>
          {(selectedNeighborhood || compareMode) && (
            <button
              onClick={() => { onSelectNeighborhood(null); if (compareMode) onToggleCompare() }}
              className="text-[9px] font-mono text-purple-400 hover:text-purple-300 transition-colors"
            >
              {compareMode ? 'Exit compare' : 'All neighborhoods'}
            </button>
          )}
```

- [ ] **Step 6: Update content area to handle compare mode**

Replace the content div (lines 203-243):

```typescript
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2">
        {isLoading ? (
          <SkeletonSidebarRows count={14} />
        ) : compareMode && compareSet.length >= 2 ? (
          <ComparisonView
            profiles={compareSet.map((name) => profileMap.get(name)!).filter(Boolean)}
            onRemove={onRemoveFromCompare}
          />
        ) : selectedProfile && !compareMode ? (
          <ProfileView profile={selectedProfile} />
        ) : (
          <div className="space-y-0.5">
            {sorted.map((profile, i) => {
              const compareIndex = compareSet.indexOf(profile.name)
              const isInCompare = compareIndex >= 0
              return (
                <button
                  key={profile.name}
                  onClick={() => {
                    if (compareMode) {
                      if (isInCompare) onRemoveFromCompare(profile.name)
                      else if (compareSet.length < 3) onAddToCompare(profile.name)
                    } else {
                      onSelectNeighborhood(profile.name)
                    }
                  }}
                  className={`w-full text-left py-2 px-2.5 rounded-lg cursor-pointer transition-all duration-150 hover:bg-white/[0.04] group ${
                    isInCompare ? 'ring-1' : ''
                  }`}
                  style={isInCompare ? { borderColor: SLOT_COLORS[compareIndex].hex + '40' } : undefined}
                >
                  <div className="flex items-center gap-2.5">
                    {compareMode && (
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isInCompare ? 'border-transparent' : 'border-slate-600'
                        }`}
                        style={isInCompare ? { backgroundColor: SLOT_COLORS[compareIndex].hex } : undefined}
                      >
                        {isInCompare && (
                          <span className="text-[8px] font-mono text-white font-bold">{compareIndex + 1}</span>
                        )}
                      </div>
                    )}
                    {!compareMode && <MiniFingerprint profile={profile} />}
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-slate-200 truncate leading-tight group-hover:text-white transition-colors">
                        {profile.name}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono italic">
                        {fmt(profile.totalEvents)} events
                        {profile.anomalyCount > 0 && (
                          <span className="text-amber-400/80">
                            {' '}{profile.anomalyCount} anomal{profile.anomalyCount === 1 ? 'y' : 'ies'}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <ZDot z={profile.compositeZScore} />
                      <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                        {profile.compositeZScore >= 0 ? '+' : ''}{profile.compositeZScore.toFixed(1)}σ
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
```

- [ ] **Step 7: Add SLOT_COLORS import**

Update line 7 to add SLOT_COLORS:

```typescript
import { DOMAINS, SLOT_COLORS } from './types'
```

- [ ] **Step 8: Verify build**

```bash
npx tsc -b
```

- [ ] **Step 9: Commit**

```bash
git add src/views/Neighborhood/NeighborhoodSidebar.tsx
git commit -m "feat(neighborhood): compare toggle + multi-select list + ComparisonView routing"
```

---

### Task 5: Multi-Boundary Map Layers

**Files:**
- Modify: `src/views/Neighborhood/neighborhoodMapLayers.ts`

- [ ] **Step 1: Add makeSlotLayers factory**

Add at end of `neighborhoodMapLayers.ts`:

```typescript
/** Generate fill + outline layers for a comparison slot */
export function makeSlotLayers(
  slotIndex: number,
  color: string,
): mapboxgl.AnyLayer[] {
  return [
    {
      id: `nh-compare-fill-${slotIndex}`,
      type: 'fill',
      source: 'nh-boundaries',
      paint: {
        'fill-color': color,
        'fill-opacity': 0.12,
      },
      filter: ['==', 'nhood', ''],
    } as mapboxgl.AnyLayer,
    {
      id: `nh-compare-outline-${slotIndex}`,
      type: 'line',
      source: 'nh-boundaries',
      paint: {
        'line-color': color,
        'line-width': 2.5,
        'line-opacity': 0.8,
      },
      filter: ['==', 'nhood', ''],
    } as mapboxgl.AnyLayer,
  ]
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc -b
```

- [ ] **Step 3: Commit**

```bash
git add src/views/Neighborhood/neighborhoodMapLayers.ts
git commit -m "feat(neighborhood): makeSlotLayers factory for comparison map boundaries"
```

---

### Task 6: Wire Up Comparison State in Neighborhood.tsx

**Files:**
- Modify: `src/views/Neighborhood/Neighborhood.tsx`

- [ ] **Step 1: Add comparison state and URL sync**

After the `selectedNeighborhood` line (line 24), add:

```typescript
  const [compareMode, setCompareMode] = useState(() => searchParams.has('compare'))
  const [compareSet, setCompareSet] = useState<string[]>(() => {
    const param = searchParams.get('compare')
    return param ? param.split(',').map(decodeURIComponent).filter(Boolean).slice(0, 3) : []
  })

  // Sync compareSet to URL
  useEffect(() => {
    setSearchParams((prev) => {
      if (compareMode && compareSet.length > 0) {
        prev.set('compare', compareSet.map(encodeURIComponent).join(','))
        prev.delete('nh')
      } else {
        prev.delete('compare')
      }
      return prev
    }, { replace: true })
  }, [compareMode, compareSet, setSearchParams])

  const toggleCompare = useCallback(() => {
    setCompareMode((prev) => {
      if (prev) setCompareSet([]) // exiting compare clears set
      return !prev
    })
  }, [])

  const addToCompare = useCallback((name: string) => {
    setCompareSet((prev) => {
      if (prev.includes(name) || prev.length >= 3) return prev
      return [...prev, name]
    })
  }, [])

  const removeFromCompare = useCallback((name: string) => {
    setCompareSet((prev) => prev.filter((n) => n !== name))
  }, [])
```

- [ ] **Step 2: Import makeSlotLayers and SLOT_COLORS**

Update imports (line 14-18):

```typescript
import {
  NEIGHBORHOOD_CHOROPLETH_LAYERS,
  NEIGHBORHOOD_SELECTION_LAYERS,
  buildZScoreColorExpression,
  makeSlotLayers,
} from './neighborhoodMapLayers'
import { SLOT_COLORS } from './types'
```

- [ ] **Step 3: Add comparison boundary layers**

After the existing `useMapLayer` calls (lines 81-82), add:

```typescript
  // Comparison slot layers (3 slots)
  const slot0Layers = useMemo(() => makeSlotLayers(0, SLOT_COLORS[0].hex), [])
  const slot1Layers = useMemo(() => makeSlotLayers(1, SLOT_COLORS[1].hex), [])
  const slot2Layers = useMemo(() => makeSlotLayers(2, SLOT_COLORS[2].hex), [])
  useMapLayer(mapInstance, 'nh-boundaries', boundaries, slot0Layers)
  useMapLayer(mapInstance, 'nh-boundaries', boundaries, slot1Layers)
  useMapLayer(mapInstance, 'nh-boundaries', boundaries, slot2Layers)

  // Update comparison boundary filters
  useEffect(() => {
    if (!mapInstance) return
    for (let i = 0; i < 3; i++) {
      const name = compareMode ? (compareSet[i] || '') : ''
      const filter: any = ['==', 'nhood', name]
      try {
        mapInstance.setFilter(`nh-compare-fill-${i}`, filter)
        mapInstance.setFilter(`nh-compare-outline-${i}`, filter)
      } catch { /* layers not ready */ }
    }
  }, [mapInstance, compareMode, compareSet])

  // Fit bounds to all compared neighborhoods
  useEffect(() => {
    if (!mapInstance || !compareMode || compareSet.length < 2 || !boundaries) return
    const coords: [number, number][] = []
    for (const feature of boundaries.features) {
      const name = feature.properties?.nhood
      if (!compareSet.includes(name)) continue
      // Extract bbox from geometry coordinates
      const geom = feature.geometry as any
      const extractCoords = (c: any): void => {
        if (typeof c[0] === 'number') coords.push(c as [number, number])
        else c.forEach(extractCoords)
      }
      extractCoords(geom.coordinates)
    }
    if (coords.length === 0) return
    const lngs = coords.map((c) => c[0])
    const lats = coords.map((c) => c[1])
    mapInstance.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 60, duration: 800 }
    )
  }, [mapInstance, compareMode, compareSet, boundaries])
```

- [ ] **Step 4: Hide single-select layers in compare mode**

Update the selection highlight effect (lines 70-78) to only apply when NOT in compare mode:

```typescript
  // Update selection highlight (single-select mode only)
  useEffect(() => {
    if (!mapInstance) return
    const filter: any = !compareMode && selectedNeighborhood
      ? ['==', 'nhood', selectedNeighborhood]
      : ['==', 'nhood', '']
    try {
      mapInstance.setFilter('nh-selection-fill', filter)
      mapInstance.setFilter('nh-selection-outline', filter)
    } catch { /* layers not ready */ }
  }, [mapInstance, selectedNeighborhood, compareMode])
```

- [ ] **Step 5: Update click handler for compare mode**

Replace the click handler effect (lines 84-103):

```typescript
  // Click handler — single select or compare add/remove
  useEffect(() => {
    if (!mapInstance) return
    const handler = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      const name = e.features?.[0]?.properties?.nhood as string | undefined
      if (!name) return
      if (compareMode) {
        if (compareSet.includes(name)) removeFromCompare(name)
        else if (compareSet.length < 3) addToCompare(name)
      } else {
        setSelectedNeighborhood(selectedNeighborhood === name ? null : name)
      }
    }
    mapInstance.on('click', 'nh-choropleth-fill', handler)
    const enter = () => { mapInstance.getCanvas().style.cursor = 'pointer' }
    const leave = () => { mapInstance.getCanvas().style.cursor = '' }
    mapInstance.on('mouseenter', 'nh-choropleth-fill', enter)
    mapInstance.on('mouseleave', 'nh-choropleth-fill', leave)
    return () => {
      mapInstance.off('click', 'nh-choropleth-fill', handler)
      mapInstance.off('mouseenter', 'nh-choropleth-fill', enter)
      mapInstance.off('mouseleave', 'nh-choropleth-fill', leave)
    }
  }, [mapInstance, selectedNeighborhood, setSelectedNeighborhood, compareMode, compareSet, addToCompare, removeFromCompare])
```

- [ ] **Step 6: Pass new props to NeighborhoodSidebar**

Replace the sidebar JSX (lines 168-173):

```typescript
      <NeighborhoodSidebar
        profiles={profiles}
        profileMap={profileMap}
        selectedNeighborhood={selectedNeighborhood}
        onSelectNeighborhood={setSelectedNeighborhood}
        isLoading={isLoading}
        compareMode={compareMode}
        onToggleCompare={toggleCompare}
        compareSet={compareSet}
        onAddToCompare={addToCompare}
        onRemoveFromCompare={removeFromCompare}
      />
```

- [ ] **Step 7: Verify full build**

```bash
pnpm build
```

- [ ] **Step 8: Commit**

```bash
git add src/views/Neighborhood/Neighborhood.tsx
git commit -m "feat(neighborhood): comparison state, URL sync, multi-boundary map + fitBounds"
```

---

### Task 7: Cross-Link Arrows on MetricRow

**Files:**
- Modify: `src/views/Neighborhood/NeighborhoodSidebar.tsx`

- [ ] **Step 1: Add navigation imports and DOMAIN_ROUTES**

Update imports at top:

```typescript
import { useNavigate } from 'react-router-dom'
import { DOMAINS, SLOT_COLORS, DOMAIN_ROUTES } from './types'
```

- [ ] **Step 2: Add domain key prop and arrow to MetricRow**

Update MetricRow to accept a domain key and render a cross-link arrow:

```typescript
function MetricRow({
  label,
  metric,
  color,
  maxCount,
  domainKey,
  neighborhood,
}: {
  label: string
  metric: DatasetMetric | null
  color: string
  maxCount: number
  domainKey?: MetricDomain
  neighborhood?: string
}) {
  const navigate = useNavigate()
  if (!metric) return null
  const barWidth = maxCount > 0 ? (metric.count / maxCount) * 100 : 0
  return (
    <div className="relative py-2 px-2.5 rounded-lg group">
      <div
        className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
        style={{ width: `${barWidth}%`, backgroundColor: color, opacity: 0.08 }}
      />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-[11px] text-slate-300 truncate">{label}</span>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className="text-[12px] font-mono text-slate-300 tabular-nums">{fmt(metric.count)}</span>
          <YoYBadge pct={metric.yoyPct} />
          <ZDot z={metric.zScore} />
          {domainKey && neighborhood && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigate(`${DOMAIN_ROUTES[domainKey]}?neighborhood=${encodeURIComponent(neighborhood)}`)
              }}
              className="text-slate-600 hover:text-slate-400 transition-colors opacity-0 group-hover:opacity-100"
              title={`Open in ${label}`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 5h6M6 3l2 2-2 2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update MetricRow calls in ProfileView to pass domainKey and neighborhood**

In the ProfileView component, update the MetricRow calls:

```typescript
          <MetricRow label="Emergency Response" metric={profile.emergency} color="#ef4444" maxCount={maxCount} domainKey="emergency" neighborhood={profile.name} />
          <MetricRow label="Crime Incidents" metric={profile.crime} color="#f97316" maxCount={maxCount} domainKey="crime" neighborhood={profile.name} />
          <MetricRow label="Traffic Crashes" metric={profile.crashes} color="#eab308" maxCount={maxCount} domainKey="crashes" neighborhood={profile.name} />
```

And:

```typescript
          <MetricRow label="311 Cases" metric={profile.cases311} color="#3b82f6" maxCount={maxCount} domainKey="cases311" neighborhood={profile.name} />
          <MetricRow label="Parking Citations" metric={profile.citations} color="#06b6d4" maxCount={maxCount} domainKey="citations" neighborhood={profile.name} />
```

- [ ] **Step 4: Verify full build**

```bash
pnpm build
```

- [ ] **Step 5: Commit and push**

```bash
git add src/views/Neighborhood/NeighborhoodSidebar.tsx
git commit -m "feat(neighborhood): cross-link arrows on metric rows → dataset views"
git push
```

---

### Task 8: End-to-End QA

- [ ] **Step 1: Test browse mode (no regressions)**
- Navigate to `/neighborhood`
- Click a neighborhood → profile appears, map flies to it
- Click "All neighborhoods" → returns to list
- Sort buttons work

- [ ] **Step 2: Test compare mode**
- Click "Compare" → toggle activates, numbered circles appear in list
- Click 2 neighborhoods → ComparisonView appears with overlaid fingerprint + bars
- Click 3rd → added to comparison
- Click selected neighborhood → removed
- Map shows all selected boundaries in slot colors
- Map auto-fits to show all boundaries

- [ ] **Step 3: Test URL persistence**
- Select 3 neighborhoods → URL shows `?compare=Name1,Name2,Name3`
- Copy URL → open in new tab → same comparison loads
- Click "Exit compare" → `?compare=` removed

- [ ] **Step 4: Test cross-links**
- In profile view, hover a metric row → arrow appears
- Click arrow → navigates to dataset view with `?neighborhood=` param

- [ ] **Step 5: Final commit**

```bash
git push
```
