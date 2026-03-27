# Neighborhood Comparison Mode — Design Spec

**Goal:** Enable side-by-side comparison of 2-3 SF neighborhoods using overlaid civic fingerprints, proportional domain bars, and multi-boundary map highlighting. Purely a presentation layer on existing profile data — no new Socrata queries.

**Route:** `/neighborhood?compare=Tenderloin,Mission,Marina`

---

## Interaction Model

- **Compare toggle**: Button in sidebar header, alongside sort pills. Toggles between browse mode and compare mode.
- **Selection**: In compare mode, clicking a neighborhood in the list (or on the map) adds it to the comparison set. Clicking again removes it. Max 3 neighborhoods.
- **Color slots**: Fixed assignment — first selected = purple (#a855f7), second = cyan (#22d3ee), third = green (#34d399). Removing a neighborhood frees its slot; the next addition fills the lowest open slot. Colors never shuffle.
- **Exit**: Clicking the Compare toggle again clears the set and returns to browse mode.
- **URL persistence**: `?compare=Tenderloin,Mission,Marina` — comma-separated, URL-encoded. Shareable. Loading this URL enters compare mode automatically.

## Sidebar Layout (Compare Mode)

### 1. Header
- Compare toggle pill (active state: filled purple)
- Row of selected neighborhood names in their slot colors, each with an X button to remove
- "Add neighborhood" prompt if < 3 selected

### 2. Overlaid Civic Fingerprint
- Single large fingerprint (size ~160px) centered in sidebar
- Slot 1 neighborhood: solid polygon, filled at 12% opacity, stroke at 70% opacity, 1.5px width
- Slot 2 neighborhood: dashed polygon (stroke-dasharray 4,3), filled at 6% opacity, stroke at 40% opacity
- Slot 3 neighborhood: dotted polygon (stroke-dasharray 2,3), filled at 5% opacity, stroke at 35% opacity
- Data point dots in domain colors at each axis vertex (only for primary/slot 1)
- Baseline ring (z=0) at 35% opacity — the "normal" reference
- Axis labels (ER, Crime, 311, Crash, Cite) in domain colors

### 3. Legend
- Below fingerprint: three entries showing line style + slot color + neighborhood name
- Example: `━ Tenderloin  ╌ Mission  ··· Marina`

### 4. Domain Comparison Bars
- One section per domain (Emergency Response, Crime Incidents, 311 Cases, Traffic Crashes, Parking Citations)
- Domain label in its domain color (e.g., "Emergency Response" in #ef4444)
- Below label: stacked rows — one full-width bar per neighborhood, colored by slot color
- Bar width proportional to count relative to the max count across all selected neighborhoods for that domain
- Bar height: 6px, rounded ends (border-radius 3px)
- Small count label at end of each bar in slot color (e.g., "2.1K")
- Spacing: 2px gap between bars within a domain, 12px gap between domains

### 5. Summary Row
- Bottom of sidebar: composite z-score per neighborhood displayed inline
- Format: `TL +1.8σ  MI +0.6σ  MA -0.4σ` — each in its slot color

## Map Behavior

- **Multi-boundary highlighting**: Each selected neighborhood gets a fill + outline layer in its slot color
  - Fill: slot color at 12% opacity
  - Outline: slot color at 80% opacity, 2.5px width
- **Fit bounds**: Map auto-zooms to fit all selected boundaries with 60px padding on all sides
  - Triggered on each selection change
  - Uses `mapInstance.fitBounds()` computed from the union of selected neighborhood boundary geometries
  - Worst case (Presidio + Bayview + Outer Richmond): ~z11.5, still readable
- **Interaction**: Click an un-highlighted boundary → adds to comparison (if < 3). Click a highlighted boundary → removes it.
- **Choropleth**: Stays visible underneath for citywide context. Non-selected neighborhoods retain their z-score coloring.

## Color System

| Slot | Color | Hex | Line Style |
|------|-------|-----|------------|
| 1 | Purple | #a855f7 | Solid |
| 2 | Cyan | #22d3ee | Dashed (4,3) |
| 3 | Green | #34d399 | Dotted (2,3) |

Domain colors unchanged: ER=#ef4444, Crime=#f97316, 311=#3b82f6, Crashes=#eab308, Citations=#06b6d4

## Curated Data Portrait ("Dive In")

When a neighborhood is selected (single or comparison mode), the sidebar shows a **"Dive In"** button. Clicking it triggers 5 targeted queries — one per fingerprint axis — that populate the map with curated, high-signal data points. The map becomes a spatial mirror of the civic fingerprint.

### Interaction
- **Select neighborhood** → boundary highlights, sidebar profile appears (instant, no queries)
- **Click "Dive In"** → progressive interstitial plays → curated layers appear on map
- **Dive In is opt-in** — browsing the list is cheap; committing to a portrait costs 5 queries
- In comparison mode, Dive In loads the portrait for the primary (slot 1) neighborhood

### Curated Layers (1:1 with Fingerprint Axes)

Each layer uses its **fingerprint axis domain color** on the map — the visual thread connecting the abstract radar shape to the spatial reality.

| Fingerprint Axis | Map Layer | Color | Query | Expected Points |
|-----------------|-----------|-------|-------|----------------|
| Emergency Response | Slowest response incidents | #ef4444 (red) | `fireEMSDispatch` WHERE neighborhood, ORDER BY response_time DESC, LIMIT 10 | 10 |
| Crime Incidents | Crime hotspot intersections | #f97316 (orange) | `policeIncidents` GROUP BY primary_rd+secondary_rd, top 10 by count | 10 |
| 311 Cases | Top complaint clusters | #3b82f6 (blue) | `cases311` WHERE neighborhood, top categories, LIMIT 20 | 15-20 |
| Traffic Crashes | DUI + fatal/severe crashes | #eab308 (amber) | `trafficCrashes` WHERE (dui OR killed>0) AND neighborhood | 5-20 |
| Parking Citations | Most-ticketed blocks | #06b6d4 (cyan) | `parkingCitations` GROUP BY block, top 10 by count | 10 |

**Plus free layers** (no additional queries):
- HIN corridors filtered to neighborhood boundary (already loaded from Traffic Safety)
- Speed cameras within boundary (already loaded)

### Color Reinforcement
The fingerprint and map portrait use **identical domain colors**:
- Fingerprint ER axis dot = red → Map slow-response circles = red
- Fingerprint Crime axis dot = orange → Map crime hotspot circles = orange
- etc.

When the fingerprint shows the Crime axis spiking orange, the user looks at the map and sees orange clusters — instant visual connection. The fingerprint is the abstract; the map is the spatial. Same data, same color, two lenses.

### Map Point Styling
- Each domain renders as circles with its domain color
- Circle size encodes significance (response time, count, severity)
- Opacity at 70% to allow overlap visibility
- On hover: tooltip with detail (incident type, date, count)
- Points render on top of the choropleth but below the neighborhood boundary outline

### Progressive Interstitial
When Dive In is clicked, a glass-card overlay on the map shows progress:

1. "Analyzing emergency response..." (red dot pulses)
2. "Mapping crime patterns..." (orange dot pulses)
3. "Scanning 311 complaints..." (blue dot pulses)
4. "Identifying crash sites..." (amber dot pulses)
5. "Reviewing citation hotspots..." (cyan dot pulses)
6. "Portrait complete." (all dots solid, overlay fades)

Each step completes as its query resolves (real progress, not fake). Steps appear sequentially. The overlay fades when all 5 queries are done. Total time: ~3-5 seconds.

### State
- `diveInLoaded: boolean` — whether portrait is active for current selection
- `diveInLoading: boolean` — interstitial visible
- `portraitData: Record<MetricDomain, any[]>` — raw records per domain
- Clearing neighborhood selection clears portrait data
- Changing neighborhood selection resets diveInLoaded (must Dive In again)

## Data Architecture

**Comparison mode**: No new queries. Reads from existing `useNeighborhoodProfiles` output — the `profileMap` already contains all 41 neighborhoods with metrics from 5 datasets.

**Data portrait (Dive In)**: 5 targeted Socrata queries, one per domain. Each returns 10-20 curated records with coordinates. Queries are neighborhood-filtered and curated (not raw dumps). Total: ~50-80 points on the map.

State management:
- `compareMode: boolean` — toggle state
- `compareSet: string[]` — ordered array of neighborhood names (max length 3)
- Both persisted to URL via `?compare=` param

## File Changes

### Create
- `src/views/Neighborhood/ComparisonView.tsx` — Sidebar content for compare mode: overlaid fingerprint, legend, domain bars, summary

### Modify
- `src/views/Neighborhood/CivicFingerprint.tsx` — Add `ghostProfiles?: { profile: NeighborhoodProfile; color: string; dashArray: string }[]` prop. When present, renders additional polygons behind the primary.
- `src/views/Neighborhood/NeighborhoodSidebar.tsx` — Add compare toggle button. When `compareMode` is true and `compareSet.length >= 2`, render `ComparisonView` instead of the profile/list view. In compare mode, clicking a neighborhood adds/removes from set instead of selecting.
- `src/views/Neighborhood/Neighborhood.tsx` — Add `compareMode` and `compareSet` state. Parse `?compare=` URL param on mount. Sync to URL on change. Pass to sidebar. Manage map multi-selection: additional colored boundary layers per slot, fitBounds on change.
- `src/views/Neighborhood/neighborhoodMapLayers.ts` — Add `COMPARISON_SLOT_LAYERS` factory function that generates fill + outline layers for a given slot color and source filter.
- `src/views/Neighborhood/types.ts` — Add `SLOT_COLORS` constant array and `ComparisonSlot` type.

## Domain Drill-Down (Cross-Linking)

Each domain metric row in the sidebar (both single profile and comparison mode) includes a small arrow icon that navigates to the dataset's dedicated view, pre-filtered to that neighborhood:

| Domain | Link |
|--------|------|
| Emergency Response | `/emergency-response?neighborhood={name}` |
| Crime Incidents | `/crime-incidents?neighborhood={name}` |
| 311 Cases | `/311-cases?neighborhood={name}` |
| Traffic Crashes | `/traffic-safety?neighborhood={name}` |
| Parking Citations | `/parking-citations?neighborhood={name}` |

The target views already support `?neighborhood=` via `useUrlSync` and `appStore.selectedNeighborhood`. The link opens in the same tab (standard navigation, not new tab).

In comparison mode, clicking the arrow on a domain row drills into the primary (slot 1) neighborhood by default. Each neighborhood name in the header is also clickable to drill into that specific one.

### File Changes for Cross-Linking & Data Portrait
- **Create**: `src/views/Neighborhood/useNeighborhoodPortrait.ts` — Hook that fires 5 targeted queries on Dive In, returns portrait data + loading state per domain
- **Create**: `src/views/Neighborhood/DiveInOverlay.tsx` — Progressive interstitial with domain-colored step indicators
- **Create**: `src/views/Neighborhood/portraitMapLayers.ts` — Circle layer configs per domain (color, size, hover tooltip)
- **Modify**: `src/views/Neighborhood/NeighborhoodSidebar.tsx` — Add Dive In button, cross-link arrows on MetricRow and ComparisonView domain rows
- **Modify**: `src/views/Neighborhood/Neighborhood.tsx` — Wire portrait hook, render portrait map layers, manage diveIn state
- **Modify**: `src/views/Neighborhood/types.ts` — Add `DOMAIN_ROUTES` mapping, `PortraitData` type, `SLOT_COLORS`

## Edge Cases

- **1 neighborhood selected in compare mode**: Show its profile normally (like single-select mode) with a prompt to "Select another neighborhood to compare"
- **Removing middle slot**: If slot 2 is removed, slot 3 stays slot 3 (colors don't shuffle). The gap is visible in the legend.
- **URL with invalid neighborhood name**: Skip silently, don't crash
- **Same neighborhood twice**: Prevent — clicking an already-selected neighborhood removes it
- **Mobile**: Compare mode not ideal on narrow screens. Hide the compare toggle below 768px viewport width.
