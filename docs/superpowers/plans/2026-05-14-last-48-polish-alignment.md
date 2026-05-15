# The Last 48 — Polish & Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile The Last 48 with its eight sibling views — adopt shared chrome, sidebar, loading, and underlay primitives — without flattening its observatory register. Also enrich the FLOW signal with 911 priority encoding and honest suppressed-location designation.

**Architecture:** Adopt-and-extend. Last 48 imports the shared primitives; where Last 48 carries the genuinely better pattern, the shared primitive grows to absorb it (lean-width variant + listbox prop passthrough on `MapSidebar`). Single persistent `MapView` hosts all map layers, enabling composable layers (FLOW points + base fill picker) in place of the binary mode toggle.

**Tech Stack:** Vite + React 19 + TypeScript + Tailwind v4, Mapbox GL JS v3, Zustand, React Router v7, Socrata SODA API. **No test runner installed** — verification is `npx tsc -b` (type), `pnpm lint` (lint), and manual browser checks via tarmac MCP.

**Spec:** [docs/superpowers/specs/2026-05-14-last-48-polish-alignment-design.md](../specs/2026-05-14-last-48-polish-alignment-design.md)

**Branch (recommended):** `last48-polish-alignment` (created from `main`)

---

## Execution-order summary

Six phases, each landing as its own PR. Order reflects the actual dependency graph (not the spec's section numbering — §5 priority extraction moves ahead of §4 ripple gating so the gate has a field to read):

| # | Phase | Spec § | Notes |
|---|---|---|---|
| 1 | Header chrome alignment | §1 | Independent, quick alignment win |
| 2 | Sidebar wrap + `MapSidebar` extension | §2 | Independent, parallel to Phase 1 |
| 3 | Shared `MapView` refactor | §4a | Prerequisite for Phases 5 & 6 |
| 4 | 911 signal richness (priority + suppressed-loc) | §5 | Moved ahead of §4b; priority field needed for ripple gate |
| 5 | Composable layer controls + arrivals ripple | §4b | Depends on Phases 3 + 4 |
| 6 | Loading B+C blend | §3 | Depends on Phase 3 (one MapView to mount boot on) |

---

## File structure (decomposition map)

### Files created
- `src/views/Last48/modes/Last48Map.tsx` — single persistent MapView host (Phase 3)
- `src/views/Last48/modes/FlowPointsLayer.tsx` — FLOW dots as a layer (Phase 3, extracted from FlowMapLayer)
- `src/views/Last48/modes/AnomalyFillLayer.tsx` — z-score choropleth as a layer (Phase 3, extracted from HotspotsChoropleth)
- `src/views/Last48/modes/DemographicFillLayer.tsx` — Census underlay layer (Phase 5)
- `src/views/Last48/chrome/LayerControls.tsx` — replaces `ModeToggle` (Phase 5)
- `src/views/Last48/chrome/StreamProgressBar.tsx` — slim top progress band (Phase 6)
- `src/views/Last48/modes/BootEmanation.tsx` — boot pulse (Phase 6)

### Files modified
- `src/views/Last48/Last48.tsx` — header chrome, ticker row, layer controls, URL params (Phases 1, 5)
- `src/views/Last48/modes/FlowMode.tsx` — drops isLoading gate; sheds MapView mount (Phases 3, 6)
- `src/views/Last48/modes/HotspotsMode.tsx` — same shape changes (Phases 3, 6)
- `src/views/Last48/modes/FlowRail.tsx` — wrapped in MapSidebar; withheld marker; count (Phases 2, 4)
- `src/views/Last48/modes/AnomalyRail.tsx` — wrapped in MapSidebar (Phase 2)
- `src/views/Last48/modes/FlowMapLayer.tsx` — priority-A paint; arrival ripple gate (Phases 4, 5)
- `src/views/Last48/detail/Last48EventCard.tsx` — priority chip; suppressed-loc explanation (Phase 4)
- `src/views/Last48/chrome/FreshnessChipStrip.tsx` — per-stream loading state (Phase 6)
- `src/components/layout/MapSidebar.tsx` — `width="lean"` variant; `scrollContainerProps` (Phase 2)
- `src/types/last48.ts` — `priority?: string` on `NormalizedEvent` (Phase 4)
- `src/utils/eventNormalization.ts` — 911 priority extraction (Phase 4)
- `src/index.css` — `emanate-in` keyframe + `.emanate-in` utility (Phase 6)

### Files deleted (after migration)
- `src/views/Last48/chrome/ModeToggle.tsx` — replaced by `LayerControls.tsx` (Phase 5)
- `src/views/Last48/modes/HotspotsChoropleth.tsx` — extracted into `AnomalyFillLayer.tsx` (Phase 3); deletion in Phase 5 once nothing references it

---

## Phase 1 — Header chrome alignment

**Spec:** §1. **PR:** `last48-phase3-1-header-chrome`. **Effort:** ~30 min.

### Task 1.1 — Adopt structural header chrome

**Files:**
- Modify: `src/views/Last48/Last48.tsx` (header element)

- [ ] **Step 1: Read the current header in `Last48.tsx`**

  Run: `sed -n '55,85p' src/views/Last48/Last48.tsx` to see the current `<header>` element.

- [ ] **Step 2: Replace the header element with the sibling-chrome version**

  In `src/views/Last48/Last48.tsx`, replace the existing `<header>` block (starting `<header className="px-[clamp(...) ...]>` through its closing `</header>`) with:

  ```tsx
  <header className="flex-shrink-0 border-b border-paper-200/40 dark:border-espresso-700 px-[clamp(16px,3vw,64px)] py-3 bg-paper-50/50 dark:bg-espresso-950/50 backdrop-blur-xl z-20">
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <div className="min-w-0">
          <div className="font-mono text-[10px] tracking-widest text-paper-500 dark:text-paper-600">
            <span className="text-paper-400 dark:text-paper-700">——</span> LIVE
          </div>
          <h1 className="font-display italic text-2xl text-ink dark:text-paper-100 leading-none whitespace-nowrap">
            The Last 48
          </h1>
          <p className="font-mono text-[10px] text-paper-500 dark:text-paper-600 mt-0.5">
            What's flowed in across SF in the past 48 hours
          </p>
        </div>
        {/* Event count chip — Task 1.2 */}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <ModeToggle mode={mode} onChange={setMode} />
        {/* ExportButton — Task 1.3 */}
      </div>
    </div>
  </header>
  ```

  This adopts: `flex-shrink-0`, `border-b`, `backdrop-blur-xl`, bg tint — matching `EmergencyResponse`. Preserves the `—— LIVE` rule-leading eyebrow, the italic display h1, and the descriptive sentence (Section 1 decision B).

- [ ] **Step 3: Verify type-check**

  Run: `npx tsc -b`
  Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/views/Last48/Last48.tsx
  git commit -m "$(cat <<'EOF'
  feat(last48): adopt sibling header structural chrome

  Border-b + backdrop-blur + bg tint + flex-shrink-0, matching
  EmergencyResponse. Preserves the rule-leading —— LIVE eyebrow
  (Section 1 decision B from the design spec).

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 1.2 — Add live event-count chip

**Files:**
- Modify: `src/views/Last48/Last48.tsx`

- [ ] **Step 1: Expose event count from useLast48Window**

  The hook already returns `events: allEvents`. In `Last48.tsx`, derive a count from `window48.events.length`. No hook change needed.

- [ ] **Step 2: Insert the chip in the header**

  Replace the `{/* Event count chip — Task 1.2 */}` comment with:

  ```tsx
  {!window48.isLoading && window48.events.length > 0 && (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-moss-500/80 bg-moss-500/10 px-2 py-1 rounded-full whitespace-nowrap">
      <span className="w-1 h-1 rounded-full bg-moss-500 pulse-live" />
      {window48.events.length.toLocaleString()} events
    </span>
  )}
  ```

  Pigment choice: moss (the existing `pulse-live` class works with it). Hides during initial load; reveals once events exist.

- [ ] **Step 3: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/Last48.tsx
  git commit -m "feat(last48): live event-count chip in header

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 1.3 — Add ExportButton

**Files:**
- Modify: `src/views/Last48/Last48.tsx`

- [ ] **Step 1: Import ExportButton**

  At the top of `Last48.tsx`:

  ```tsx
  import ExportButton from '@/components/export/ExportButton'
  ```

- [ ] **Step 2: Add the target id wrapper around the content area**

  Wrap the mode renderer div in an `id` for html2canvas to capture:

  ```tsx
  <div id="last48-capture" className="flex-1 relative">
    {mode === 'flow' && <FlowMode window48={window48} datasets={datasets} />}
    {mode === 'hotspots' && <HotspotsMode window48={window48} datasets={datasets} />}
  </div>
  ```

- [ ] **Step 3: Insert ExportButton in the header right cluster**

  Replace the `{/* ExportButton — Task 1.3 */}` comment with:

  ```tsx
  <ExportButton targetSelector="#last48-capture" filename="last-48" />
  ```

- [ ] **Step 4: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/Last48.tsx
  git commit -m "feat(last48): ExportButton in header (PNG export)

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 1.4 — Add CivicTicker row

**Files:**
- Modify: `src/views/Last48/Last48.tsx`

- [ ] **Step 1: Import CivicTicker + useCivicIndicators**

  ```tsx
  import CivicTicker from '@/components/ui/CivicTicker'
  import { useCivicIndicators } from '@/hooks/useCivicIndicators'
  ```

- [ ] **Step 2: Call the hook in the component body**

  Near the top of the component:

  ```tsx
  const civicIndicators = useCivicIndicators()
  ```

- [ ] **Step 3: Insert the ticker row between header and FreshnessChipStrip**

  After the closing `</header>` and before `<div className="px-[clamp(16px,3vw,64px)] pb-2"><FreshnessChipStrip ... /></div>`, add:

  ```tsx
  <div className="flex-shrink-0 border-b border-paper-200/40 dark:border-espresso-800 px-[clamp(16px,3vw,64px)] py-1 bg-paper-50/30 dark:bg-espresso-950/30 backdrop-blur-xl z-10">
    <CivicTicker
      items={civicIndicators.items.filter(i => i.source.view !== '/live-feeds')}
      size="compact"
    />
  </div>
  ```

  The filter excludes Last 48's own indicators (it doesn't tick itself).

- [ ] **Step 4: Type-check, lint, commit**

  ```bash
  npx tsc -b
  pnpm lint
  git add src/views/Last48/Last48.tsx
  git commit -m "feat(last48): CivicTicker row between header and freshness

  Excludes /live-feeds indicators so Last 48 doesn't tick itself.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 1.5 — Drop kiosk placeholder

**Files:**
- Modify: `src/views/Last48/Last48.tsx`

- [ ] **Step 1: Remove the kiosk anchor**

  Delete the `<a href="?mode=kiosk" ...>📺 Open in kiosk</a>` block. Kiosk is Phase 4 work — no placeholder pollution.

- [ ] **Step 2: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/Last48.tsx
  git commit -m "chore(last48): drop kiosk placeholder link

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 1.6 — Manual verify Phase 1

- [ ] **Step 1: Start dev server via tarmac**

  Use `mcp__tarmac__*` tools to start the dev server (per CLAUDE.md, never run `pnpm dev` directly).

- [ ] **Step 2: Verify in browser**

  Navigate to `/live-feeds`. Confirm:
  - Header has `border-b`, blur backdrop, bg tint (matches `EmergencyResponse` chrome)
  - Eyebrow shows `—— LIVE` (rule-leading, paper color)
  - h1 reads "The Last 48" in italic display face
  - Descriptive sentence below h1
  - Live event-count chip appears once events load (moss pigment, pulse dot)
  - CivicTicker row below header, excluding `/live-feeds` items
  - ExportButton on right beside ModeToggle
  - No kiosk link

- [ ] **Step 3: Open the PR**

  Open Phase 1 PR against `main`. Title: `feat(last48): Phase 3.1 — header chrome alignment`.

---

## Phase 2 — Sidebar wrap + `MapSidebar` extension

**Spec:** §2. **PR:** `last48-phase3-2-sidebar`. **Effort:** ~45 min.

### Task 2.1 — Add `width="lean"` variant to `MapSidebar`

**Files:**
- Modify: `src/components/layout/MapSidebar.tsx`

- [ ] **Step 1: Add `width` prop**

  Modify the `MapSidebarProps` interface and the component signature:

  ```tsx
  type MapSidebarWidth = 'default' | 'lean'

  interface MapSidebarProps {
    children: ReactNode
    /** Open-width variant. 'default' = 320px (w-80). 'lean' = 260px (w-[260px]) for map-hero-forward views like The Last 48. */
    width?: MapSidebarWidth
  }
  ```

- [ ] **Step 2: Use the width in the className**

  Replace the `widthClass` computation:

  ```tsx
  const widthClass = isOpen
    ? (isNarrow ? 'w-60' : (width === 'lean' ? 'w-[260px]' : 'w-80'))
    : 'w-9'
  ```

  `w-[260px]` is the arbitrary-value Tailwind escape. Lean only applies at full open-wide; compressed-narrow stays at `w-60` (240px) regardless, since compressed mode is already lean.

- [ ] **Step 3: Default the prop in the destructure**

  Update the component signature:

  ```tsx
  export default function MapSidebar({ children, width = 'default' }: MapSidebarProps) {
  ```

- [ ] **Step 4: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/components/layout/MapSidebar.tsx
  git commit -m "feat(map-sidebar): add lean width variant

  Opt-in 260px variant for map-hero-forward views (The Last 48).
  Default behavior unchanged; existing callers pass nothing.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 2.2 — Add `scrollContainerProps` passthrough

**Files:**
- Modify: `src/components/layout/MapSidebar.tsx`

- [ ] **Step 1: Add the prop type**

  Import `HTMLAttributes`:

  ```tsx
  import { createContext, useContext, useEffect, useState, type ReactNode, type HTMLAttributes } from 'react'
  ```

  Extend the props:

  ```tsx
  interface MapSidebarProps {
    children: ReactNode
    width?: MapSidebarWidth
    /** Props spread onto the inner scroll <div>. Required if children need the
     *  scrolling element to be a listbox (role + aria-activedescendant must sit
     *  on the scrolling element for scrollIntoView + activedescendant to work). */
    scrollContainerProps?: HTMLAttributes<HTMLDivElement>
  }
  ```

- [ ] **Step 2: Spread onto the inner div**

  Replace the inner scroll container:

  ```tsx
  {isOpen && (
    <div
      {...scrollContainerProps}
      className={`flex-1 overflow-y-auto flex flex-col min-h-0 ${scrollContainerProps?.className ?? ''}`}
    >
      {children}
    </div>
  )}
  ```

  Note the className-merge so caller's optional className adds to the base classes.

- [ ] **Step 3: Default destructure**

  ```tsx
  export default function MapSidebar({ children, width = 'default', scrollContainerProps }: MapSidebarProps) {
  ```

- [ ] **Step 4: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/components/layout/MapSidebar.tsx
  git commit -m "feat(map-sidebar): scrollContainerProps passthrough

  Lets children make the inner scroll <div> a listbox (or anything
  else). Required for FlowRail's keyboard nav to survive the wrap.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 2.3 — Wrap `FlowRail` in `MapSidebar`

**Files:**
- Modify: `src/views/Last48/modes/FlowRail.tsx`

- [ ] **Step 1: Read the current `FlowRail` structure**

  Run: `sed -n '107,189p' src/views/Last48/modes/FlowRail.tsx` to see the current `<aside>` + scrollable listbox structure.

- [ ] **Step 2: Replace the outer `<aside>` with `MapSidebar`**

  Replace the outer `<aside className="w-[clamp(...) ...]">` and its closing tag with `<MapSidebar width="lean" scrollContainerProps={{...}}>`, lifting the existing scroll-container props (role, aria-activedescendant, tabIndex, onKeyDown, ref, focus-visible classes) into `scrollContainerProps`.

  Concretely, the return becomes:

  ```tsx
  return (
    <MapSidebar
      width="lean"
      scrollContainerProps={{
        ref: scrollRef as React.RefObject<HTMLDivElement>,
        role: 'listbox',
        'aria-label': '48-hour event log',
        'aria-activedescendant': selectedId ? `flow-row-${selectedId}` : undefined,
        tabIndex: 0,
        onKeyDown: handleKeyDown,
        className: 'px-2 py-2 flex flex-col gap-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ochre-500 focus-visible:ring-inset',
      }}
    >
      <div className="px-3 pt-3 pb-2 border-b border-paper-200/40 dark:border-espresso-800 flex-shrink-0">
        <h2 className="font-mono text-[10px] tracking-widest text-paper-600 dark:text-paper-500">
          FRESHEST
        </h2>
        <p className="font-mono text-[9px] text-paper-500 dark:text-paper-600 mt-0.5 tabular-nums">
          {events.length} events · 48h window
        </p>
      </div>

      {/* Rows — rendered as direct children of the scroll container.
          Move the existing limited.map() block here, unchanged. */}
      {limited.map((ev) => { /* unchanged row markup */ })}

      {events.length === 0 && (
        <div className="text-paper-500 dark:text-paper-600 text-center italic py-6">
          no events in window yet
        </div>
      )}
    </MapSidebar>
  )
  ```

  Important: the FRESHEST header is `flex-shrink-0` so it stays pinned while rows scroll. The rows render as direct children of the scroll container (which is now MapSidebar's inner div) — that's why the keyboard nav still works.

- [ ] **Step 3: Add the MapSidebar import**

  ```tsx
  import MapSidebar from '@/components/layout/MapSidebar'
  ```

  Drop the existing `useRef` for scrollRef typing tweak if needed (`HTMLDivElement` is correct as before).

- [ ] **Step 4: Type-check**

  ```bash
  npx tsc -b
  ```

  Expected: exit 0. If TypeScript complains about `ref` in `scrollContainerProps`, cast appropriately or accept `RefObject<HTMLDivElement>`.

- [ ] **Step 5: Commit**

  ```bash
  git add src/views/Last48/modes/FlowRail.tsx
  git commit -m "feat(last48): wrap FlowRail in MapSidebar (lean width)

  Listbox semantics + keyboard nav preserved via scrollContainerProps.
  FlowRail now gains collapse chevron, 3-state width, persistence.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 2.4 — Wrap `AnomalyRail` in `MapSidebar`

**Files:**
- Modify: `src/views/Last48/modes/AnomalyRail.tsx`

- [ ] **Step 1: Read current structure**

  Run: `sed -n '40,125p' src/views/Last48/modes/AnomalyRail.tsx`.

- [ ] **Step 2: Replace the outer `<aside>` with `MapSidebar`**

  Same pattern. AnomalyRail doesn't have listbox/keyboard nav today, so `scrollContainerProps` only needs the className for inner padding:

  ```tsx
  return (
    <MapSidebar
      width="lean"
      scrollContainerProps={{ className: 'px-2 py-2 flex flex-col gap-1' }}
    >
      <div className="px-3 pt-3 pb-2 border-b border-paper-200/40 dark:border-espresso-800 flex-shrink-0">
        {/* existing STANDS OUT header markup — unchanged */}
      </div>

      {/* existing visible.flatMap rows block — unchanged */}

      <div className="px-3 py-2 border-t border-paper-200/40 dark:border-espresso-800 flex-shrink-0 font-mono text-[8px] leading-snug text-paper-500 dark:text-paper-600">
        {/* existing methodology footer — unchanged */}
      </div>
    </MapSidebar>
  )
  ```

  Header and footer are `flex-shrink-0`; rows fill the middle and scroll.

- [ ] **Step 3: Import**

  ```tsx
  import MapSidebar from '@/components/layout/MapSidebar'
  ```

- [ ] **Step 4: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/modes/AnomalyRail.tsx
  git commit -m "feat(last48): wrap AnomalyRail in MapSidebar (lean width)

  Gains collapse + 3-state width + persistence. Threshold divider
  and methodology footer preserved.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 2.5 — Manual verify Phase 2

- [ ] **Step 1: Dev server**

  Start via tarmac, open `/live-feeds`.

- [ ] **Step 2: Verify FLOW mode**

  - Rail now has the chevron toggle on its left edge
  - Click chevron → collapses to 36px stub, map gets full canvas
  - Click again → restores
  - Refresh page → collapsed state persists (Zustand + localStorage)
  - Width is ~260px (lean), not 320px
  - Click a rail row → row selects, map flies, detail card opens (existing behavior)
  - Tab into the rail → focus ring on the scroll container
  - Arrow Down/Up navigates rows (listbox keyboard nav preserved)
  - Esc deselects (existing)

- [ ] **Step 3: Verify HOTSPOTS mode**

  Toggle to HOTSPOTS. AnomalyRail also has the chevron + collapse behavior + lean width. STANDS OUT header pinned, methodology footer pinned, rows scroll.

- [ ] **Step 4: Verify sibling views unaffected**

  Open `/emergency-response`. Sidebar still 320px when open (no lean), all sibling behavior unchanged.

- [ ] **Step 5: Open PR**

  Title: `feat(last48): Phase 3.2 — sidebar wrapping + MapSidebar extensions`.

---

## Phase 3 — Shared `MapView` refactor (prerequisite)

**Spec:** §4a. **PR:** `last48-phase3-3-shared-mapview`. **Effort:** ~90 min. **Risk:** highest in the phase — land + verify before adding controls.

### Task 3.1 — Create `Last48Map.tsx` host

**Files:**
- Create: `src/views/Last48/modes/Last48Map.tsx`

- [ ] **Step 1: Scaffold the host component**

  Write `src/views/Last48/modes/Last48Map.tsx`:

  ```tsx
  // src/views/Last48/modes/Last48Map.tsx
  //
  // Single persistent MapView host for The Last 48. Both FLOW points and the
  // base-fill layers (Anomaly, Demographic) mount as children. This replaces
  // the previous one-MapView-per-mode architecture and is the prerequisite
  // for composable layers (Phase 5).

  import { useState, useCallback, type ReactNode } from 'react'
  import mapboxgl from 'mapbox-gl'
  import MapView from '@/components/maps/MapView'

  interface Props {
    /** Render-prop children receive the live map instance (or null while it boots). */
    children: (map: mapboxgl.Map | null) => ReactNode
  }

  export default function Last48Map({ children }: Props) {
    const [map, setMap] = useState<mapboxgl.Map | null>(null)
    const handleReady = useCallback((m: mapboxgl.Map) => setMap(m), [])

    return (
      <div className="absolute inset-0 flex">
        <div className="flex-1 relative">
          <MapView onMapReady={handleReady}>
            {children(map)}
          </MapView>
        </div>
      </div>
    )
  }
  ```

  The render-prop pattern lets the caller mount layers and overlays that depend on the live map instance.

- [ ] **Step 2: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/modes/Last48Map.tsx
  git commit -m "feat(last48): Last48Map host (render-prop, single MapView)

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 3.2 — Refactor `FlowMode` to use `Last48Map`

**Files:**
- Modify: `src/views/Last48/modes/FlowMode.tsx`

- [ ] **Step 1: Replace MapView with Last48Map**

  Update `FlowMode.tsx` so it mounts `Last48Map` instead of `MapView` directly. The map instance comes via render-prop:

  ```tsx
  import Last48Map from './Last48Map'
  // …existing imports for FlowMapLayer, FlowRail, FlowSelectedRadar, Last48EventCard…

  export default function FlowMode({ window48, datasets }: Props) {
    const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null)
    const visibleEvents = window48.events.filter((e) => datasets.includes(e.datasetId))

    /* …handleMapSelect, handleRailSelect, handleClose, Esc effect — unchanged… */

    return (
      <Last48Map>
        {(map) => (
          <>
            <FlowMapLayer
              map={map}
              events={visibleEvents}
              selectedId={selectedEvent?.id}
              onSelect={handleMapSelect}
            />

            {window48.isLoading && (
              <div className="absolute top-3 left-3 font-mono text-[10px] text-paper-500 bg-espresso-900/70 px-2 py-1 rounded">
                loading 48h window…
              </div>
            )}

            <FlowSelectedRadar map={map} event={selectedEvent} />
            <Last48EventCard event={selectedEvent} onClose={handleClose} />

            <FlowRail
              events={visibleEvents}
              selectedId={selectedEvent?.id}
              onSelect={(ev) => {
                // existing rail-select behavior; needs map for flyTo
                if (selectedEvent?.id === ev.id) {
                  setSelectedEvent(null)
                  return
                }
                setSelectedEvent(ev)
                if (map && ev.longitude != null && ev.latitude != null) {
                  map.flyTo({ center: [ev.longitude, ev.latitude], zoom: 14, duration: 600 })
                }
              }}
            />
          </>
        )}
      </Last48Map>
    )
  }
  ```

  Note: `FlowRail` is *inside* the render-prop closure now so it gets the live `map` for flyTo. The outer `<div className="absolute inset-0 flex">` is now inside `Last48Map`, so `FlowMode`'s outer wrapper goes away — `Last48Map` is the layout root.

- [ ] **Step 2: Drop the local `useState<mapboxgl.Map>` and `setMap`**

  These move into `Last48Map`. Remove `const [map, setMap] = useState<mapboxgl.Map | null>(null)` and `setMap` references.

- [ ] **Step 3: Type-check**

  ```bash
  npx tsc -b
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/views/Last48/modes/FlowMode.tsx
  git commit -m "refactor(last48): FlowMode renders through Last48Map

  Map state lifts into the host. No behavior change yet.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 3.3 — Refactor `HotspotsMode` to use `Last48Map`

**Files:**
- Modify: `src/views/Last48/modes/HotspotsMode.tsx`

- [ ] **Step 1: Read current HotspotsMode**

  Run: `cat src/views/Last48/modes/HotspotsMode.tsx`.

- [ ] **Step 2: Replace the MapView/wrapper with Last48Map**

  Mirror the FlowMode refactor. The choropleth + AnomalyRail render inside the render-prop. Existing logic (combinedAnomalies, selection state, etc.) unchanged.

- [ ] **Step 3: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/modes/HotspotsMode.tsx
  git commit -m "refactor(last48): HotspotsMode renders through Last48Map

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 3.4 — Manual smoke test Phase 3

- [ ] **Step 1: Dev server + verify both modes**

  Start dev server. Open `/live-feeds`. Confirm:
  - FLOW mode: dots render, rail works, selection ring renders, detail card opens
  - Toggle to HOTSPOTS: choropleth renders, rail works, selection works
  - Toggle back to FLOW: dots render, no Mapbox console errors
  - Pan/zoom in FLOW, toggle to HOTSPOTS — camera resets (expected for now; persistence comes in Phase 5 when both layers mount into one MapView)

- [ ] **Step 2: Type-check + lint**

  ```bash
  npx tsc -b
  pnpm lint
  ```

- [ ] **Step 3: Open PR**

  Title: `refactor(last48): Phase 3.3 — single MapView host (no behavior change)`.

  Description should call out: this is a structural refactor with no user-visible change. The architectural payoff lands in Phase 5.

---

## Phase 4 — 911 signal richness (priority + suppressed-location)

**Spec:** §5. **PR:** `last48-phase3-4-911-signal`. **Effort:** ~75 min. **Why this order:** priority extraction must precede Phase 5's ripple gate.

### Task 4.1 — Extend `NormalizedEvent` with `priority`

**Files:**
- Modify: `src/types/last48.ts`

- [ ] **Step 1: Add the field**

  In the `NormalizedEvent` interface in `src/types/last48.ts`, add after `disposition`:

  ```ts
    /** 911 priority code, when available. Typically 'A', 'B', 'C', etc.
     *  Pulled from priority_final, priority_original, or priority on 911
     *  dispatch rows. Undefined for non-911 datasets or rows with no
     *  priority field. */
    priority?: string
  ```

- [ ] **Step 2: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/types/last48.ts
  git commit -m "feat(types): add optional priority to NormalizedEvent

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 4.2 — Extract priority in `normalizeEvent`

**Files:**
- Modify: `src/utils/eventNormalization.ts`

- [ ] **Step 1: Add a small helper for priority extraction**

  Above `normalizeEvent`, add:

  ```ts
  function extractPriority(row: Record<string, unknown>): string | undefined {
    // SF 911 CAD rows expose priority on one of these columns depending on
    // dataset version. Prefer the final assignment over the original.
    const v = row.priority_final ?? row.priority_original ?? row.priority
    if (typeof v === 'string' && v.length > 0) return v.toUpperCase()
    return undefined
  }
  ```

- [ ] **Step 2: Use it in the 911 branches**

  In the `'911-realtime'` / `'911-historical'` case, after computing `state`/`disposition`/`closeAt`, add:

  ```ts
        const priority = extractPriority(row)
  ```

  Then in the returned object, after `disposition,`:

  ```ts
          priority,
  ```

- [ ] **Step 3: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/utils/eventNormalization.ts
  git commit -m "feat(last48): extract 911 priority via fallback chain

  priority_final ?? priority_original ?? priority. Upper-cased for
  consistent comparison.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 4.3 — Priority-A size + crispness paint in `FlowMapLayer`

**Files:**
- Modify: `src/views/Last48/modes/FlowMapLayer.tsx`

- [ ] **Step 1: Surface `priority` in the geojson properties**

  In `FlowMapLayer.tsx`, locate the `geojson` `useMemo`. In the per-event feature, add `priority: e.priority` to `properties`. Use `priority` to drive a boolean `isPriorityA`:

  ```ts
            isPriorityA: e.datasetId === '911-realtime' && e.priority === 'A',
  ```

  Add this property alongside `isOpen`, `color`, etc.

- [ ] **Step 2: Adjust the paint expressions**

  In the layer's `paint`, replace `circle-radius` with an expression that bumps priority-A:

  ```ts
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          10, ['case',
            ['get', 'isPriorityA'], ['case', ['get', 'isOpen'], 6, 5],
            ['case', ['get', 'isOpen'], 4, 3],
          ],
          14, ['case',
            ['get', 'isPriorityA'], ['case', ['get', 'isOpen'], 10, 9],
            ['case', ['get', 'isOpen'], 7, 6],
          ],
        ],
  ```

  Priority-A is ~50% larger than routine 911 at both zoom anchors.

- [ ] **Step 3: Crispness — bump opacity for priority-A**

  Replace `circle-opacity`:

  ```ts
        'circle-opacity': [
          'case',
          ['get', 'isPriorityA'],
          // Priority-A: full opacity at age 0, slower decay
          ['interpolate', ['linear'], ['get', 'age'], 0, 1.0, 172800000, 0.8],
          ['case',
            ['get', 'isOpen'],
            ['interpolate', ['linear'], ['get', 'age'], 0, 1.0, 172800000, 0.55],
            ['interpolate', ['linear'], ['get', 'age'], 0, 0.7, 172800000, 0.25],
          ],
        ],
  ```

  Priority-A holds opacity longer — it doesn't dry out as fast. That's the "crispness" lift.

- [ ] **Step 4: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/modes/FlowMapLayer.tsx
  git commit -m "feat(last48): priority-A size + crispness lift on 911 dots

  Larger and more opacity-resistant than routine 911. The loud
  signal lives in the arrival ripple (Phase 5); resting state stays
  observatory-calm.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 4.4 — Suppressed-location marker + count in `FlowRail`

**Files:**
- Modify: `src/views/Last48/modes/FlowRail.tsx`

- [ ] **Step 1: Compute coordless count for the header**

  Inside `FlowRail`, derive:

  ```ts
    const withheldCount = events.filter((e) => e.longitude == null || e.latitude == null).length
  ```

- [ ] **Step 2: Update the FRESHEST header line**

  Replace the count `<p>`:

  ```tsx
        <p className="font-mono text-[9px] text-paper-500 dark:text-paper-600 mt-0.5 tabular-nums">
          {events.length} events · 48h window
          {withheldCount > 0 && ` · ${withheldCount} location-withheld`}
        </p>
  ```

- [ ] **Step 3: Mark rows with no coords**

  Inside the `limited.map((ev) => …)` callback, compute:

  ```ts
            const hasCoords = ev.longitude != null && ev.latitude != null
  ```

  Replace the row's headline display so coordless rows render a `◉ location withheld` marker in place of (or alongside) the neighborhood chip, and the row gets `opacity-60`:

  ```tsx
              <div
                key={ev.id}
                id={`flow-row-${ev.id}`}
                role="option"
                aria-selected={isSel}
                ref={isSel ? selectedRowRef : undefined}
                onClick={() => onSelect(ev)}
                className={`
                  relative text-left py-2 px-3 rounded-lg font-mono text-[10px]
                  leading-tight cursor-pointer transition-all duration-200
                  ${!hasCoords ? 'opacity-60' : ''}
                  ${isSel
                    ? 'bg-ochre-500/10 ring-1 ring-ochre-500/30 text-paper-200 dark:text-paper-200'
                    : 'text-paper-700 dark:text-paper-400 hover:bg-white/80 dark:hover:bg-white/[0.04]'}
                `}
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="tabular-nums text-paper-500 dark:text-paper-600">
                    {formatTime(ev.receivedAt)}
                  </span>
                  <span className="font-bold tracking-wider" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  {!hasCoords ? (
                    <span className="text-paper-500 dark:text-paper-600" title="Location suppressed — sensitive call type">
                      ◉ withheld
                    </span>
                  ) : (
                    ev.neighborhood && (
                      <span className="text-ochre-700 dark:text-ochre-500">
                        {shortNeighborhood(ev.neighborhood)}
                      </span>
                    )
                  )}
                </div>
                {ev.headline && (
                  <div className={`truncate mt-0.5 leading-tight ${isSel ? 'text-paper-300' : 'text-paper-700 dark:text-paper-400'}`}>
                    {ev.headline}
                  </div>
                )}
              </div>
  ```

  The `◉ withheld` substitutes for the neighborhood chip on coordless rows (the neighborhood is also often null when location is suppressed).

- [ ] **Step 4: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/modes/FlowRail.tsx
  git commit -m "feat(last48): suppressed-location marker + count in FLOW rail

  Coordless rows now carry a ◉ withheld marker (replacing the
  neighborhood chip) and the FRESHEST header surfaces the count.
  Click behavior unchanged — the row still opens the detail card
  honestly via Phase 4 Task 4.5.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 4.5 — Detail-card priority chip + suppressed-location explanation

**Files:**
- Modify: `src/views/Last48/detail/Last48EventCard.tsx`

- [ ] **Step 1: Read current detail-card structure**

  Run: `cat src/views/Last48/detail/Last48EventCard.tsx`.

- [ ] **Step 2: Add a priority chip on 911 events**

  In the body, after the call-type/headline display, add (or extend the existing row block):

  ```tsx
  {(event.datasetId === '911-realtime' || event.datasetId === '911-historical') && event.priority && (
    <div className="mt-3">
      <div className="font-mono text-[10px] tracking-widest text-paper-500 dark:text-paper-600">PRIORITY</div>
      <div className={`font-mono text-[12px] mt-0.5 ${event.priority === 'A' ? 'text-indigo-300 font-semibold' : 'text-paper-300'}`}>
        {event.priority}
        {event.priority === 'A' && ' — life-threatening'}
      </div>
    </div>
  )}
  ```

- [ ] **Step 3: Explain suppressed location**

  In the location-display block, replace the empty/missing-coords fallback with an honest explanation:

  ```tsx
  <div className="mt-3">
    <div className="font-mono text-[10px] tracking-widest text-paper-500 dark:text-paper-600">LOCATION</div>
    {(event.longitude != null && event.latitude != null) ? (
      <div className="font-mono text-[11px] text-paper-300 mt-0.5">
        {event.neighborhood ?? 'SF'}
        <span className="text-paper-600 dark:text-paper-700">
          {' · '}
          {event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}
        </span>
      </div>
    ) : (
      <div className="font-mono text-[11px] italic text-paper-500 dark:text-paper-600 mt-0.5">
        Suppressed — sensitive call type. No map position available.
      </div>
    )}
  </div>
  ```

  Adapt to whatever structure the current card uses for location; the key is the conditional + the explanation string.

- [ ] **Step 4: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/detail/Last48EventCard.tsx
  git commit -m "feat(last48): priority chip + suppressed-location explainer

  Detail card now displays 911 priority (A highlighted) and explains
  suppressed locations honestly instead of showing an empty field.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 4.6 — Manual verify Phase 4

- [ ] **Step 1: Dev server + verify**

  Confirm:
  - 911 priority-A dots are visibly larger than routine 911 dots on the map
  - Priority-A dots retain opacity longer as they age (still readable past 24h)
  - Priority-A 911 events show "Priority A — life-threatening" in the detail card
  - Some rail rows show `◉ withheld` instead of a neighborhood chip
  - FRESHEST header reads "N events · M location-withheld" when M > 0
  - Clicking a withheld row opens the detail card with the honest explanation, no dead flyTo behavior

- [ ] **Step 2: Open PR**

  Title: `feat(last48): Phase 3.4 — 911 priority encoding + suppressed-location designation`.

---

## Phase 5 — Composable layer controls + arrivals ripple

**Spec:** §4b. **PR:** `last48-phase3-5-composable-layers`. **Effort:** ~2h. **Depends on:** Phases 3 + 4.

### Task 5.1 — Extract anomaly choropleth into a layer component

**Files:**
- Create: `src/views/Last48/modes/AnomalyFillLayer.tsx`
- Read: `src/views/Last48/modes/HotspotsChoropleth.tsx` (source to extract from)

- [ ] **Step 1: Read existing HotspotsChoropleth**

  Run: `cat src/views/Last48/modes/HotspotsChoropleth.tsx`.

- [ ] **Step 2: Create `AnomalyFillLayer.tsx`**

  Mirror the layer-mounting pattern from `FlowMapLayer.tsx`. Component takes `map`, `combinedAnomalies`, `selectedNeighborhood` props; calls `useMapLayer` to mount the choropleth source/layer with the existing z-score paint logic. Returns `null`.

  Skeleton:

  ```tsx
  // src/views/Last48/modes/AnomalyFillLayer.tsx
  import { useMemo } from 'react'
  import mapboxgl from 'mapbox-gl'
  import { useMapLayer } from '@/hooks/useMapLayer'
  import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'

  interface Props {
    map: mapboxgl.Map | null
    combinedAnomalies: Record<string, number>
    selectedNeighborhood?: string
  }

  const SOURCE_ID = 'last48-anomaly-fill'
  const LAYER_ID = 'last48-anomaly-fill-poly'

  export default function AnomalyFillLayer({ map, combinedAnomalies, selectedNeighborhood }: Props) {
    const { boundaries } = useNeighborhoodBoundaries()

    const geojson = useMemo<GeoJSON.FeatureCollection>(() => {
      if (!boundaries) return { type: 'FeatureCollection', features: [] }
      return {
        type: 'FeatureCollection',
        features: boundaries.features.map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            zScore: combinedAnomalies[(f.properties as any).nhood as string] ?? 0,
            selected: selectedNeighborhood === (f.properties as any).nhood,
          },
        })),
      }
    }, [boundaries, combinedAnomalies, selectedNeighborhood])

    const layers: mapboxgl.AnyLayer[] = useMemo(() => [
      {
        id: LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          // Lift the z-score → color expression from HotspotsChoropleth.
          // The exact ramp lives in that file's existing paint — copy it here.
        },
      } as mapboxgl.AnyLayer,
    ], [])

    useMapLayer(map, SOURCE_ID, geojson, layers)
    return null
  }
  ```

  Copy the z-score → color expression from `HotspotsChoropleth.tsx` paint into the `paint` block. **Do not invent it from scratch** — extract the existing expression verbatim.

- [ ] **Step 3: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/modes/AnomalyFillLayer.tsx
  git commit -m "feat(last48): extract AnomalyFillLayer as a composable layer

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 5.2 — Create `DemographicFillLayer`

**Files:**
- Create: `src/views/Last48/modes/DemographicFillLayer.tsx`

- [ ] **Step 1: Read the existing demographic-underlay integration**

  Run: `grep -n "useDemographicUnderlay\|UnderlayPicker" src/components/maps/*.tsx src/views/EmergencyResponse/EmergencyResponse.tsx | head -20`. Study how EmergencyResponse wires `useDemographicUnderlay` (the `useDemographicUnderlay` call with map/variable/data/boundaries/geoIdProperty/opacity).

- [ ] **Step 2: Create `DemographicFillLayer.tsx`**

  ```tsx
  // src/views/Last48/modes/DemographicFillLayer.tsx
  import mapboxgl from 'mapbox-gl'
  import { useDemographicUnderlay } from '@/components/maps/DemographicUnderlay'
  import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
  import { useCensusData } from '@/hooks/useCensusData'
  import type { CensusVariable } from '@/types/census'

  interface Props {
    map: mapboxgl.Map | null
    variable: CensusVariable | null
  }

  export default function DemographicFillLayer({ map, variable }: Props) {
    const { boundaries } = useNeighborhoodBoundaries()
    const { neighborhoods } = useCensusData()

    useDemographicUnderlay({
      map,
      variable,
      censusData: neighborhoods,
      boundaries,
      geoIdProperty: 'nhood',
      opacity: 0.22,
    })

    return null
  }
  ```

  No `beforeLayerId` needed — Last48Map controls layer order via mount order in JSX.

- [ ] **Step 3: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/modes/DemographicFillLayer.tsx
  git commit -m "feat(last48): DemographicFillLayer wraps shared Census underlay

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 5.3 — Build `LayerControls` component

**Files:**
- Create: `src/views/Last48/chrome/LayerControls.tsx`

- [ ] **Step 1: Write the component**

  ```tsx
  // src/views/Last48/chrome/LayerControls.tsx
  //
  // Replaces ModeToggle. Renders the composable layer controls:
  //   - FLOW points on/off toggle
  //   - Base-fill picker: None / Anomaly / Demographic
  // Demographic surfaces the UnderlayPicker once selected.

  import UnderlayPicker from '@/components/maps/UnderlayPicker'
  import { UNDERLAY_PRESETS } from '@/utils/censusVariables'
  import type { CensusVariable } from '@/types/census'

  export type BaseFill = 'none' | 'anomaly' | 'demographic'

  interface Props {
    pointsOn: boolean
    onPointsToggle: (next: boolean) => void
    fill: BaseFill
    onFillChange: (next: BaseFill) => void
    underlayVariable: CensusVariable | null
    onUnderlayChange: (v: CensusVariable | null) => void
  }

  export default function LayerControls({
    pointsOn, onPointsToggle, fill, onFillChange, underlayVariable, onUnderlayChange,
  }: Props) {
    return (
      <div className="flex items-center gap-2">
        {/* FLOW points toggle */}
        <button
          onClick={() => onPointsToggle(!pointsOn)}
          className={`px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition-all duration-200 ${
            pointsOn
              ? 'bg-paper-200 dark:bg-espresso-800 text-ink dark:text-paper-100'
              : 'text-paper-500 dark:text-paper-600 hover:text-paper-300'
          }`}
          aria-pressed={pointsOn}
        >
          {pointsOn ? '● flow' : '○ flow'}
        </button>

        {/* Base-fill picker */}
        <div className="flex items-center gap-1 bg-paper-100/40 dark:bg-espresso-900/40 rounded-lg p-0.5">
          {(['none', 'anomaly', 'demographic'] as const).map((f) => (
            <button
              key={f}
              onClick={() => onFillChange(f)}
              className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-all duration-200 ${
                fill === f
                  ? 'bg-paper-200 dark:bg-espresso-800 text-ink dark:text-paper-100 shadow-sm'
                  : 'text-paper-500 dark:text-paper-600 hover:text-paper-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Demographic variable picker — shows only when demographic fill is active */}
        {fill === 'demographic' && (
          <UnderlayPicker
            presets={UNDERLAY_PRESETS['emergency-response'] ?? []}
            activeVariable={underlayVariable}
            onSelect={onUnderlayChange}
          />
        )}
      </div>
    )
  }
  ```

  Uses `UNDERLAY_PRESETS['emergency-response']` as the initial preset set; a Last 48–specific preset list can replace it in a follow-up.

- [ ] **Step 2: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/chrome/LayerControls.tsx
  git commit -m "feat(last48): LayerControls — composable layer picker

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 5.4 — Wire LayerControls into `Last48.tsx`; retire ModeToggle

**Files:**
- Modify: `src/views/Last48/Last48.tsx`
- Delete: `src/views/Last48/chrome/ModeToggle.tsx`

- [ ] **Step 1: Replace mode state with layer state**

  In `Last48.tsx`:

  ```tsx
  type BaseFill = 'none' | 'anomaly' | 'demographic'

  function parseFill(s: string | null, legacyMode: string | null): BaseFill {
    // Legacy ?mode=hotspots → anomaly. Otherwise read ?fill=.
    if (s === 'anomaly' || s === 'demographic' || s === 'none') return s
    if (legacyMode === 'hotspots') return 'anomaly'
    return 'none'
  }

  function parsePoints(s: string | null): boolean {
    return s !== 'off'
  }

  // …inside the component:

  const fill = parseFill(searchParams.get('fill'), searchParams.get('mode'))
  const pointsOn = parsePoints(searchParams.get('points'))
  const [underlayVariable, setUnderlayVariable] = useState<CensusVariable | null>(null)

  const setFill = (next: BaseFill) => {
    const np = new URLSearchParams(searchParams)
    if (next === 'none') np.delete('fill')
    else np.set('fill', next)
    np.delete('mode')  // retire legacy param
    setSearchParams(np, { replace: true })
  }

  const setPointsOn = (next: boolean) => {
    const np = new URLSearchParams(searchParams)
    if (next) np.delete('points')
    else np.set('points', 'off')
    setSearchParams(np, { replace: true })
  }
  ```

- [ ] **Step 2: Replace ModeToggle with LayerControls in the header**

  ```tsx
  <LayerControls
    pointsOn={pointsOn}
    onPointsToggle={setPointsOn}
    fill={fill}
    onFillChange={setFill}
    underlayVariable={underlayVariable}
    onUnderlayChange={setUnderlayVariable}
  />
  ```

  Replace the `<ModeToggle ... />` line.

- [ ] **Step 3: Replace the mode-renderer block with a unified Last48Map composition**

  Replace the previous mode-conditional block with a single `Last48Map` that mounts the requested layers:

  ```tsx
  <div id="last48-capture" className="flex-1 relative">
    <Last48UnifiedView
      window48={window48}
      datasets={datasets}
      pointsOn={pointsOn}
      fill={fill}
      underlayVariable={underlayVariable}
    />
  </div>
  ```

  Create `Last48UnifiedView` in `src/views/Last48/modes/Last48UnifiedView.tsx` that wires Last48Map, FlowPointsLayer (when `pointsOn`), AnomalyFillLayer (when `fill === 'anomaly'`), DemographicFillLayer (when `fill === 'demographic'`), the FlowRail, AnomalyRail, FlowSelectedRadar, Last48EventCard. FlowMode/HotspotsMode become thin (or get deleted).

- [ ] **Step 4: Delete `ModeToggle.tsx`**

  ```bash
  git rm src/views/Last48/chrome/ModeToggle.tsx
  ```

- [ ] **Step 5: Type-check + commit**

  ```bash
  npx tsc -b
  git add -A
  git commit -m "feat(last48): retire ModeToggle, switch to composable layers

  ?mode= retired in favor of ?fill= + ?points=. Legacy URLs migrate
  at parse time (mode=hotspots → fill=anomaly).

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 5.5 — Layer cross-fade on fill swap

**Files:**
- Modify: `src/views/Last48/modes/Last48UnifiedView.tsx`

- [ ] **Step 1: Add a CSS opacity transition on fill-layer mount**

  Wrap each fill layer in a `<div className="transition-opacity duration-300">` whose opacity is driven by whether the fill matches. Alternative: pass an `opacity` prop into each layer component that lerps via Mapbox `fill-opacity` paint property.

  Simpler approach: each fill layer mounts/unmounts cleanly; the visual cross-fade comes from the boot/teardown animation of the Mapbox source. The user-perceived swap is fast (<150ms) without explicit CSS.

  For an explicit cross-fade, set Mapbox `fill-opacity-transition` in the paint:

  ```ts
  'fill-opacity': 0.55,
  'fill-opacity-transition': { duration: 300 },
  ```

  on both AnomalyFillLayer and DemographicFillLayer. Mapbox handles the fade.

- [ ] **Step 2: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/modes/AnomalyFillLayer.tsx src/views/Last48/modes/DemographicFillLayer.tsx
  git commit -m "feat(last48): fill-opacity transition on layer swap

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 5.6 — Significant-arrivals ripple gate

**Files:**
- Modify: `src/views/Last48/modes/FlowMapLayer.tsx`

- [ ] **Step 1: Track previously-seen event IDs**

  Inside `FlowMapLayer`, add a `Set<string>` ref of already-seen IDs:

  ```ts
  const seenIdsRef = useRef<Set<string>>(new Set())
  ```

- [ ] **Step 2: On geojson update, identify "newly significant" arrivals**

  After computing the new feature list, derive the new significant IDs:

  ```ts
    const significantNewIds: string[] = []
    for (const ev of events) {
      if (seenIdsRef.current.has(ev.id)) continue
      const isSignificant =
        (ev.datasetId === '911-realtime' && ev.priority === 'A') ||
        (ev.datasetId === '911-realtime' && ev.state === 'open')
      if (isSignificant) significantNewIds.push(ev.id)
      seenIdsRef.current.add(ev.id)
    }
  ```

  After the first poll, the set is seeded — every subsequent poll only flags arrivals that weren't in the previous batch.

- [ ] **Step 3: Render a transient ripple per significant arrival**

  Mount a sibling layer/component (e.g., `FlowArrivalRipples`) that takes the `significantNewIds` list + event lookup and renders a brief emanation ring at each new location. The ring uses the existing `@keyframes emanate` from `src/index.css`. After ~1.9s, the ring fades and unmounts.

  Skeleton:

  ```tsx
  // src/views/Last48/modes/FlowArrivalRipples.tsx — new file
  // Renders one transient ring per newly-arrived significant event. Each ring
  // self-unmounts after the animation completes.

  import { useEffect, useState } from 'react'
  import mapboxgl from 'mapbox-gl'

  interface Ripple { id: string; lng: number; lat: number; bornAt: number }
  interface Props { map: mapboxgl.Map | null; ripples: Ripple[] }

  export default function FlowArrivalRipples({ map, ripples }: Props) {
    // Project each lng/lat to screen coords via map.project; render an SVG ring
    // positioned absolutely inside the relative map container. The animation
    // uses class 'emanate' (reuse the FlowSelectedRadar pattern).
    // After 1900ms, mark the ripple as done and let it be removed from props.
    // …
  }
  ```

  Detailed implementation lives in the file; the executor mirrors `FlowSelectedRadar.tsx` for the per-ring SVG approach.

- [ ] **Step 4: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/modes/FlowMapLayer.tsx src/views/Last48/modes/FlowArrivalRipples.tsx
  git commit -m "feat(last48): significant-arrivals ripple

  Priority-A 911 and new open 911 calls emanate-in on arrival.
  Routine events fade quietly. The ring means something —
  editorial signal, not decoration.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 5.7 — Manual verify Phase 5

- [ ] **Step 1: Dev server + verify**

  Confirm:
  - LayerControls render in the header (FLOW toggle + None/Anomaly/Demographic picker)
  - Toggling FLOW off hides the dots without unmounting the map
  - Selecting Anomaly fills the choropleth; selecting Demographic shows the Census underlay (UnderlayPicker appears)
  - Switching between fills cross-fades smoothly (~300ms)
  - Camera persists across all toggles (no pan/zoom reset)
  - URL params shift to `?fill=` and `?points=`; `?mode=hotspots` legacy link still works (migrates to `fill=anomaly`)
  - Watch the map for ~2 min — when a significant 911 event polls in, it emanates with a ring; routine events fade in quietly

- [ ] **Step 2: Open PR**

  Title: `feat(last48): Phase 3.5 — composable layers + arrivals ripple`.

---

## Phase 6 — Loading B+C blend

**Spec:** §3. **PR:** `last48-phase3-6-loading`. **Effort:** ~75 min.

### Task 6.1 — Drop the `isLoading` gate on event rendering

**Files:**
- Modify: `src/views/Last48/modes/Last48UnifiedView.tsx` (or wherever FLOW renders post-Phase 5)

- [ ] **Step 1: Remove conditional gating around dot rendering**

  Find any `{window48.isLoading && …}` blocks that hide content. Specifically, the "loading 48h window…" pill in the original FlowMode. Decide: keep it as a small corner indicator (yes), but never block events from rendering.

  Events should always render via `<FlowPointsLayer events={visibleEvents} … />` — the layer naturally renders nothing when `events` is empty and grows as streams arrive.

- [ ] **Step 2: Replace the corner pill with the upcoming StreamProgressBar (Task 6.3)**

  Remove the inline pill; the progress band replaces it.

- [ ] **Step 3: Type-check + commit**

  ```bash
  npx tsc -b
  git add -A
  git commit -m "fix(last48): drop isLoading gate so events paint per-stream

  Fast streams (911-realtime, ~1s) no longer wait for the slow tail
  (police-incidents, much slower). The map paints as data arrives.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 6.2 — Per-stream loading state on `FreshnessChipStrip`

**Files:**
- Modify: `src/views/Last48/chrome/FreshnessChipStrip.tsx`
- Possibly modify: `src/hooks/useLast48Window.ts` (expose per-stream loading)

- [ ] **Step 1: Surface per-stream initial-load state from `useLast48Window`**

  In `useLast48Window.ts`, extend the snapshot with an `initialLoadedByDataset: Record<DatasetId, boolean>` map. Set the flag true after each dataset's first successful fetch resolves; never reset to false.

  Add to the returned object: `initialLoadedByDataset: snapshot.initialLoadedByDataset`.

- [ ] **Step 2: Read it in `FreshnessChipStrip`**

  Accept a new prop:

  ```tsx
  interface Props {
    freshness: FreshnessMap
    initialLoadedByDataset: Record<DatasetId, boolean>
  }
  ```

  Per chip, if `!initialLoadedByDataset[datasetId]`, render a shimmer state instead of the freshness value:

  ```tsx
  {isInitialLoaded ? (
    <span>{formatLag(freshness[datasetId])}</span>
  ) : (
    <span className="animate-pulse text-paper-600 dark:text-paper-700">loading…</span>
  )}
  ```

- [ ] **Step 3: Pass the new prop from `Last48.tsx`**

  ```tsx
  <FreshnessChipStrip
    freshness={window48.freshness}
    initialLoadedByDataset={window48.initialLoadedByDataset}
  />
  ```

- [ ] **Step 4: Type-check + commit**

  ```bash
  npx tsc -b
  git add -A
  git commit -m "feat(last48): per-stream loading state on FreshnessChipStrip

  Each chip shimmers until its stream's first fetch lands, then
  flips to its freshness value.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 6.3 — `StreamProgressBar` component

**Files:**
- Create: `src/views/Last48/chrome/StreamProgressBar.tsx`
- Modify: `src/views/Last48/Last48.tsx` (mount the bar)

- [ ] **Step 1: Write the component**

  ```tsx
  // src/views/Last48/chrome/StreamProgressBar.tsx
  //
  // Slim top progress band driven by useLast48Window's per-stream initial-load
  // state. Mirrors MapProgressBar's visual language but counts streams, not
  // queries.

  import { ALL_LAST48_DATASETS } from '@/types/last48'
  import type { DatasetId } from '@/types/last48'

  interface Props {
    initialLoadedByDataset: Record<DatasetId, boolean>
    enabled: DatasetId[]
    color?: string
  }

  export default function StreamProgressBar({ initialLoadedByDataset, enabled, color = '#7a9954' }: Props) {
    const total = enabled.length
    const completed = enabled.filter((id) => initialLoadedByDataset[id]).length
    const fraction = total > 0 ? completed / total : 0
    const active = completed < total

    if (!active && completed === total) return null

    return (
      <div className={`absolute top-0 left-0 right-0 z-20 h-1 overflow-hidden transition-opacity duration-500 ${active ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute inset-0" style={{ backgroundColor: `${color}10` }} />
        <div
          className="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
          style={{
            width: `${Math.max(fraction * 100, active ? 3 : 0)}%`,
            background: `linear-gradient(to right, ${color}60, ${color})`,
            boxShadow: `0 0 12px ${color}40`,
          }}
        />
        {active && total > 0 && (
          <div className="absolute top-1.5 right-2">
            <span className="text-[9px] font-mono tabular-nums text-paper-500 dark:text-paper-600">
              {completed} / {total}
            </span>
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 2: Mount in Last48UnifiedView (inside the map relative container)**

  ```tsx
  <StreamProgressBar
    initialLoadedByDataset={window48.initialLoadedByDataset}
    enabled={datasets}
  />
  ```

- [ ] **Step 3: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/chrome/StreamProgressBar.tsx src/views/Last48/modes/Last48UnifiedView.tsx
  git commit -m "feat(last48): StreamProgressBar — slim top band, streams in

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 6.4 — `BootEmanation` component

**Files:**
- Create: `src/views/Last48/modes/BootEmanation.tsx`

- [ ] **Step 1: Write the component**

  ```tsx
  // src/views/Last48/modes/BootEmanation.tsx
  //
  // Calm sonar-ping boot pulse — 2–3 rings expand from map center then fade.
  // Reuses @keyframes emanate from src/index.css. Mounts once on view mount,
  // self-unmounts after ~2s.

  import { useEffect, useState } from 'react'

  export default function BootEmanation() {
    const [visible, setVisible] = useState(true)
    useEffect(() => {
      const t = setTimeout(() => setVisible(false), 2400)
      return () => clearTimeout(t)
    }, [])

    if (!visible) return null

    return (
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center motion-reduce:hidden">
        <svg width="200" height="200" viewBox="0 0 200 200" style={{ overflow: 'visible' }}>
          <circle cx="100" cy="100" r="20" fill="none" stroke="rgba(245,236,217,0.75)" strokeWidth="1"
            style={{ transformBox: 'view-box', transformOrigin: '100px 100px', animation: 'emanate 1.9s ease-out forwards' }} />
          <circle cx="100" cy="100" r="20" fill="none" stroke="rgba(245,236,217,0.55)" strokeWidth="1"
            style={{ transformBox: 'view-box', transformOrigin: '100px 100px', animation: 'emanate 1.9s ease-out 0.5s forwards' }} />
          <circle cx="100" cy="100" r="20" fill="none" stroke="rgba(245,236,217,0.35)" strokeWidth="1"
            style={{ transformBox: 'view-box', transformOrigin: '100px 100px', animation: 'emanate 1.9s ease-out 1.0s forwards' }} />
        </svg>
      </div>
    )
  }
  ```

  Three rings, staggered. Uses the existing `emanate` keyframe.

- [ ] **Step 2: Mount in Last48UnifiedView**

  ```tsx
  <BootEmanation />
  ```

  Place it once at the top of the render, inside the relative map container.

- [ ] **Step 3: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/modes/BootEmanation.tsx src/views/Last48/modes/Last48UnifiedView.tsx
  git commit -m "feat(last48): BootEmanation boot pulse

  Three calm emanation rings on view mount. Reuses @keyframes
  emanate. Not rotating — that motion was rejected in PR #37.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 6.5 — Stream paint-in (emanate-in on dot mount)

**Files:**
- Modify: `src/index.css`
- Modify: `src/views/Last48/modes/FlowMapLayer.tsx`

- [ ] **Step 1: Add `emanate-in` paint expression**

  Per-dot mount animation in Mapbox is most reliable as a feature-state opacity transition keyed off `firstSeenAt`. Simplest path: when a new event ID enters `geojson`, mark it with a `mountedAtAge` property where age is the time-since-eventsRef-update. Then drive `circle-opacity` to lerp from 0 to its target opacity over a ~400ms window per-feature.

  This is non-trivial in Mapbox paint expressions without per-feature animation. Acceptable simpler approach: on first batch arrival per stream, run a single CSS-class flicker on the canvas (less precise but visible). Mark this as a polish item the executor can implement at increased fidelity later — initial implementation can be the simpler stream-batch fade-in (canvas-level), with the per-dot stagger as a follow-up.

  For initial implementation, accept stream-batch fade: each stream's first batch mounts with the layer at `circle-opacity` 0 for one frame, transitioning to normal opacity over 400ms. This uses Mapbox's `circle-opacity-transition: { duration: 400 }` paint property and a brief `setPaintProperty` from 0 → target.

- [ ] **Step 2: Implement stream-batch fade-in in FlowMapLayer**

  Track which streams have completed their first batch (`initialLoadedByDataset`). On each stream's transition from false → true, briefly set `circle-opacity` to 0, then revert to the expression. Implementation outline:

  ```tsx
  // In FlowMapLayer, accept an optional prop:
  // initialLoadedByDataset: Record<DatasetId, boolean>
  //
  // useEffect on initialLoadedByDataset diff:
  // For each dataset that just transitioned to true,
  //   call map.setPaintProperty(LAYER_ID, 'circle-opacity', 0)
  //   then in next frame restore the original expression
  // Mapbox's circle-opacity-transition handles the fade
  ```

  Or — simpler still: add a per-feature `mountedAt` timestamp to the geojson, and let the `circle-opacity` interpolate from `mountedAt → mountedAt + 400ms` against the current time. This requires the layer to re-render frequently (every animation frame for 400ms after a mount), which is heavy. Accept the stream-batch approach as Phase 6's initial implementation.

  *Implementation detail*: this task's exact code is best refined during execution since it touches Mapbox paint timing. Leave room.

- [ ] **Step 3: Type-check + commit**

  ```bash
  npx tsc -b
  git add -A
  git commit -m "feat(last48): stream-batch fade-in on FLOW dot arrivals

  Each stream's first batch transitions opacity 0 → target over
  400ms via Mapbox circle-opacity-transition. Subsequent polls use
  the standard expression. Per-dot stagger is a follow-up polish.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 6.6 — Chip resolve pulse

**Files:**
- Modify: `src/views/Last48/chrome/FreshnessChipStrip.tsx`

- [ ] **Step 1: Detect resolve transitions and trigger a pulse class**

  Track previous `initialLoadedByDataset` value per chip via ref. When a chip's value flips false → true, add a `chip-resolve-pulse` class for ~600ms, then remove.

  Add to `src/index.css`:

  ```css
  @keyframes chipResolvePulse {
    0%   { box-shadow: 0 0 0 0 rgba(122,153,84,0.45); }
    50%  { box-shadow: 0 0 0 6px rgba(122,153,84,0.20); }
    100% { box-shadow: 0 0 0 0 rgba(122,153,84,0.00); }
  }
  .chip-resolve-pulse {
    animation: chipResolvePulse 600ms ease-out;
    border-radius: 999px;
  }
  ```

  Apply the class conditionally per chip.

- [ ] **Step 2: Type-check + commit**

  ```bash
  npx tsc -b
  git add src/views/Last48/chrome/FreshnessChipStrip.tsx src/index.css
  git commit -m "feat(last48): chip resolve pulse on first-fetch flip

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### Task 6.7 — Manual verify Phase 6

- [ ] **Step 1: Dev server + verify**

  Open `/live-feeds` from a hard refresh.
  - At t=0: boot emanation rings expand from map center
  - Within ~1s: FLOW dots begin painting (fastest streams first — indigo 911-realtime)
  - Freshness chips shimmer until their stream lands, then pulse-resolve to their freshness value
  - StreamProgressBar visible at top, advancing from 0 to N/6 then fading out
  - Slow streams (police-incidents) continue loading but don't block anything else
  - Total visible motion budget ≤ ~3s

- [ ] **Step 2: Verify cached refresh feel**

  Hard refresh, then soft refresh. Cached data should still emanate-in (the choreography plays) but events are present immediately.

- [ ] **Step 3: Open PR**

  Title: `feat(last48): Phase 3.6 — loading B+C blend (progressive reveal + emanation boot)`.

---

## Self-review

### Spec coverage

Walking the spec section-by-section:

- **§1 Header & chrome alignment** → Phase 1 (Tasks 1.1–1.6). All bullets covered: structural chrome, event-count chip, CivicTicker w/ filter, ExportButton, kiosk drop. ✓
- **§2 Sidebar alignment** → Phase 2 (Tasks 2.1–2.5). `MapSidebar` lean width + scrollContainerProps; both rails wrapped; keyboard nav preservation called out in 2.5 verify. ✓
- **§3 Loading B+C blend** → Phase 6 (Tasks 6.1–6.7). Drops isLoading gate, per-stream chip state, StreamProgressBar, BootEmanation, stream-batch fade-in, chip resolve pulse. ✓
- **§4 Composable layers** → Phase 3 (shared MapView prereq) + Phase 5 (controls + ripple). All bullets covered: layer model, shared MapView, layer cross-fade via Mapbox fill-opacity-transition, significant-arrivals ripple, URL param shift with legacy migration. ✓
- **§5 911 signal richness** → Phase 4 (Tasks 4.1–4.6). Priority type + extraction + map paint + rail marker + detail card. ✓

### Placeholder scan

- Task 5.1 instructs to "copy the z-score → color expression from `HotspotsChoropleth.tsx` paint" — concrete instruction, not a placeholder, but assumes existing code; executor reads the source file (instructed in Step 1).
- Task 5.4 references `Last48UnifiedView.tsx` as a file the executor creates; the skeleton is described but not fully written out. Acceptable — the structure is described concretely (which layers mount conditionally, which props pass through). Executor mirrors `FlowMode`'s now-shed structure.
- Task 6.5's per-dot vs. stream-batch fade-in includes an explicit acknowledgment that the simpler stream-batch path is the Phase 6 initial implementation and per-dot is a follow-up. Not a placeholder — a scoped tradeoff.

### Type consistency

- `BaseFill` type spelled identically in `LayerControls.tsx` and `Last48.tsx`. ✓
- `NormalizedEvent.priority` is `string | undefined`; used consistently across `eventNormalization.ts`, `FlowMapLayer.tsx`, `Last48EventCard.tsx`, `FlowRail.tsx`. ✓
- `MapSidebar`'s `width` prop accepts `'default' | 'lean'`; only the rails pass `width="lean"`. ✓

No issues to fix inline.

---

## Execution choice

Plan complete and saved to `docs/superpowers/plans/2026-05-14-last-48-polish-alignment.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task with the full plan context, review the diff between tasks, fast iteration. Best for a 6-PR phase like this — each subagent gets a clean context and the per-task focus stays tight.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Riskier on a plan this size since context grows steadily.

Which approach?
