# Targeted Mobile Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every DataDiver view usable on a phone (<768px) by turning the nav into an off-canvas drawer and the right sidebar + detail panel into bottom sheets, without changing the ≥768px experience.

**Architecture:** A single new responsive tier below Tailwind `md` (768px). Pure-CSS `md:` variants handle most of it; a `useIsMobile()` hook drives the few JS decisions (sheet-vs-card render, camera-offset direction). Mobile overlays use ephemeral, default-closed state; persisted desktop collapse flags are never read on mobile. `MapView`'s existing `ResizeObserver` repaints the map when chrome reflows — no manual `resize()` needed.

**Tech Stack:** Vite + React 18 + TypeScript + Tailwind v4 (+ `tailwindcss-animate` for `slide-in-from-*`) + Zustand + Mapbox GL JS v3 + vitest (pure-function tests only — no jsdom/RTL).

**Spec:** `docs/superpowers/specs/2026-06-15-targeted-mobile-shell-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/hooks/useIsMobile.ts` | **New.** `useIsMobile()` hook + `isMobileViewport()` imperative check (matchMedia `(max-width:767px)`). Single source of the JS breakpoint. |
| `src/utils/cameraPadding.ts` (+`.test.ts`) | Add mobile **vertical** offset branch (bottom-sheet case) + pure `bottomBandHeight`. |
| `src/components/layout/AppShell.tsx` | Mobile top bar + hamburger; `<aside>` → off-canvas drawer + backdrop below `md`; ephemeral `navDrawerOpen`; a11y; auto-close on nav. |
| `src/components/layout/MapSidebar.tsx` | Bottom-sheet render below `md` (peek handle when closed, full sheet + backdrop when open); ephemeral `sheetOpen`. |
| `src/components/ui/DetailPanelShell.tsx` | Bottom-sheet render below `md`; bottom slide animation; `max-w` viewport cap on the desktop path. |
| `src/views/Dispatch911/Dispatch911.tsx` | Migrate hardcoded 320px aside → `MapSidebar`; responsive chart widths. |
| `src/views/Neighborhood/Neighborhood.tsx`, `NeighborhoodSidebar.tsx` | Migrate hardcoded 300px aside → `MapSidebar`. |

**Breakpoint constant:** `md` = 768px (Tailwind default). JS query = `(max-width: 767px)`. The two MUST agree.

**Layering (z, ascending):** sidebar sheet `z-30` · detail sheet `z-40` · nav drawer `z-[45]` (backdrops one step below each) · existing modal tier `z-50`.

---

## Task 1: `useIsMobile` hook

**Files:**
- Create: `src/hooks/useIsMobile.ts`

No unit test: this is a DOM hook (matchMedia) and the project tests pure functions only (no jsdom). Verified by usage in later tasks.

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/useIsMobile.ts
import { useEffect, useState } from 'react'

// Below Tailwind `md` (768px). MUST match the `md:` variants used across the
// mobile shell. Phones / small screens get the drawer + bottom sheets.
const MOBILE_QUERY = '(max-width: 767px)'

/** True when the viewport is below `md`. Drives the JS-side mobile decisions
 *  that can't be pure CSS: sheet-vs-card render branches. SSR-safe. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false,
  )
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    onChange() // sync in case it changed between render and effect
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return isMobile
}

/** Imperative check for non-React call sites (e.g. fly-to handlers). */
export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no errors (file compiles; unused until later tasks).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useIsMobile.ts
git commit -m "feat(mobile): useIsMobile hook (matchMedia md breakpoint)"
```

---

## Task 2: Camera offset — mobile vertical branch

**Files:**
- Modify: `src/utils/cameraPadding.ts`
- Test: `src/utils/cameraPadding.test.ts`

- [ ] **Step 1: Write failing tests for `bottomBandHeight` + the mobile offset branch**

Append to `src/utils/cameraPadding.test.ts`:

```ts
import { bottomBandHeight } from './cameraPadding'

describe('bottomBandHeight', () => {
  it('returns the sheet height when it fits under the 60% clamp', () => {
    // 70vh of an 800px map = 560; clamp = floor(800*0.6)=480 → clamp wins
    expect(bottomBandHeight(560, 800)).toBe(480)
  })
  it('returns the sheet height when below the clamp', () => {
    // small sheet 300 on a tall 900px map: clamp 540 → sheet wins
    expect(bottomBandHeight(300, 900)).toBe(300)
  })
  it('never exceeds 60% of the map height', () => {
    for (const mapH of [480, 640, 800, 1000]) {
      expect(bottomBandHeight(mapH, mapH)).toBeLessThanOrEqual(Math.floor(mapH * 0.6))
    }
  })
})

describe('eventFlyToOffset — mobile branch', () => {
  const realMM = globalThis.matchMedia
  afterEach(() => { globalThis.matchMedia = realMM })
  function mockMatchMedia(matches: boolean) {
    globalThis.matchMedia = ((q: string) => ({ matches, media: q })) as unknown as typeof window.matchMedia
  }
  it('on mobile returns a vertical (upward) offset, not horizontal', () => {
    mockMatchMedia(true)
    const fakeMap = { getContainer: () => ({ clientWidth: 390, clientHeight: 700 }) } as unknown as Parameters<typeof eventFlyToOffset>[0]
    const [dx, dy] = eventFlyToOffset(fakeMap, 288)
    expect(dx).toBe(0)
    expect(dy).toBeLessThan(0) // shift target UP, above the bottom sheet
  })
  it('on desktop returns a horizontal (leftward) offset', () => {
    mockMatchMedia(false)
    const fakeMap = { getContainer: () => ({ clientWidth: 1280, clientHeight: 800 }) } as unknown as Parameters<typeof eventFlyToOffset>[0]
    const [dx, dy] = eventFlyToOffset(fakeMap, 288)
    expect(dx).toBeLessThan(0)
    expect(dy).toBe(0)
  })
})
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm test -- cameraPadding`
Expected: FAIL — `bottomBandHeight` not exported; mobile branch returns horizontal.

- [ ] **Step 3: Implement**

In `src/utils/cameraPadding.ts`, add the import and the new logic:

```ts
import { isMobileViewport } from '@/hooks/useIsMobile'

const SHEET_VH = 0.7 // detail bottom-sheet height on mobile (DetailPanelShell max-h-[70vh])

/** Pure: height of the bottom band a bottom-sheet of sheetHeightPx occludes,
 *  clamped to 60% of the map so the band above it stays usable. */
export function bottomBandHeight(sheetHeightPx: number, mapHeightPx: number): number {
  return Math.min(sheetHeightPx, Math.floor(mapHeightPx * 0.6))
}
```

Replace `eventFlyToOffset` with the viewport-aware version:

```ts
export function eventFlyToOffset(map: mapboxgl.Map, cardWidthPx: number): [number, number] {
  // Mobile: the detail panel is a BOTTOM sheet, not a right-side card. Shift
  // the target UP so it lands in the visible band above the sheet.
  if (isMobileViewport()) {
    const mapH = map.getContainer().clientHeight
    const band = bottomBandHeight(mapH * SHEET_VH, mapH)
    return [0, -band / 2]
  }
  return [-obstructedRightBand(map, cardWidthPx) / 2, 0]
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- cameraPadding`
Expected: PASS (all band + offset tests, desktop and mobile).

- [ ] **Step 5: Commit**

```bash
git add src/utils/cameraPadding.ts src/utils/cameraPadding.test.ts
git commit -m "feat(mobile): vertical camera offset when detail panel is a bottom sheet"
```

**Note:** Last 48's ambient director calls `obstructedRightBand(map)` directly for framing; on mobile that band is still horizontal. Ambient is a desktop/kiosk feature (hidden under reduced-motion), so leave it — tracked as a known limitation, not in scope.

---

## Task 3: AppShell — off-canvas nav drawer

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

Behavior below `md`: a fixed top bar (hamburger + wordmark) replaces the rail's footprint; the `<aside>` slides off-canvas over a backdrop; `<main>` is full-width with `pt-12` for the top bar. At/above `md`, today's behavior is unchanged.

- [ ] **Step 1: Add mobile state + breakpoint awareness**

In the component body add:

```ts
import { useIsMobile } from '@/hooks/useIsMobile'
// ...
const isMobile = useIsMobile()
const [navDrawerOpen, setNavDrawerOpen] = useState(false)
// On mobile the drawer shows the FULL (expanded) nav, regardless of the
// persisted desktop collapse flag.
const expanded = isMobile || isSidebarOpen
// Close the drawer after navigating on mobile.
const go = (path: string) => { navigate(path); if (isMobile) setNavDrawerOpen(false) }
```

Replace the nav-item `onClick={() => navigate(item.path)}` with `onClick={() => go(item.path)}`, and replace the content conditionals that read `isSidebarOpen` for *content rendering* (the label/description blocks, brand text, date picker, footer labels) with `expanded`. (Leave the desktop *width* classes keyed on `isSidebarOpen`.)

- [ ] **Step 2: Add the mobile top bar (before the `<aside>`, inside the root flex)**

```tsx
{/* Mobile top bar — reclaims the permanent rail; hosts the drawer trigger. */}
<div className="md:hidden fixed top-0 inset-x-0 h-12 z-40 flex items-center gap-3 px-4
  bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-white/[0.06]">
  <button
    onClick={() => setNavDrawerOpen(true)}
    aria-label="Open navigation"
    className="w-9 h-9 -ml-1 flex items-center justify-center rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
  >
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M3 5h14M3 10h14M3 15h14" />
    </svg>
  </button>
  <span className="font-display italic text-lg text-ink dark:text-white leading-none tracking-tight">DataDiver</span>
</div>

{/* Drawer backdrop (mobile only) */}
{navDrawerOpen && (
  <div className="md:hidden fixed inset-0 z-[44] bg-black/50 backdrop-blur-sm" onClick={() => setNavDrawerOpen(false)} aria-hidden="true" />
)}
```

- [ ] **Step 3: Make the `<aside>` off-canvas below `md`**

Change the `<aside>` className block so positioning is responsive. Base (mobile) = fixed off-canvas drawer at `w-64`; `md:` restores the in-flow rail with the existing width logic:

```
fixed md:relative inset-y-0 left-0
z-[45] md:z-20
w-64 ${isSidebarOpen ? 'md:w-64' : 'md:w-[52px]'}
${navDrawerOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
flex flex-col bg-white/95 md:bg-white/50 dark:bg-slate-900/95 md:dark:bg-slate-900/50
backdrop-blur-xl border-r border-slate-200/50 dark:border-white/[0.04]
transition-transform md:transition-all duration-300 md:duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]
```

(Keep `role="dialog" aria-modal="true"` semantics gated on mobile — add `role={isMobile ? 'dialog' : undefined} aria-modal={isMobile ? true : undefined}` to the `<aside>`.) The existing inner drawer-pull collapse button should be `hidden md:flex` (it's a desktop affordance).

- [ ] **Step 4: Give `<main>` room for the top bar**

Change `<main className="flex-1 overflow-hidden relative">` → `<main className="flex-1 overflow-hidden relative pt-12 md:pt-0">`.

- [ ] **Step 5: ESC closes the drawer**

Extend the existing keydown `useEffect` (the one handling ⌘K) or add a small effect: on `Escape`, `setNavDrawerOpen(false)`.

- [ ] **Step 6: Build + manual verify**

Run: `pnpm build` → expect success.
Manual (browser at 390px): hamburger opens drawer over backdrop; tapping a nav item navigates AND closes; backdrop/ESC close; at ≥768px the rail is back and the top bar is gone.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "feat(mobile): AppShell off-canvas nav drawer below md"
```

---

## Task 4: MapSidebar — bottom sheet

**Files:**
- Modify: `src/components/layout/MapSidebar.tsx`

Below `md`: render as a bottom sheet. Closed = a slim peek handle pinned to the bottom; open = full sheet (`h-[70vh]`) + backdrop. Ephemeral `sheetOpen` (default closed). At ≥`md`, today's inline aside is unchanged.

- [ ] **Step 1: Add mobile state**

```ts
import { useIsMobile } from '@/hooks/useIsMobile'
// ...
const isMobile = useIsMobile()
const [sheetOpen, setSheetOpen] = useState(false)
```

- [ ] **Step 2: Branch the render**

When `isMobile`, return the sheet variant instead of the inline aside:

```tsx
if (isMobile) {
  return (
    <MapSidebarContext.Provider value={{ isCompressed: false }}>
      {/* Backdrop */}
      {sheetOpen && (
        <div className="fixed inset-0 z-20 bg-black/40" onClick={() => setSheetOpen(false)} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-x-0 bottom-0 z-30 h-[70vh] rounded-t-2xl
          bg-white dark:bg-slate-900 border-t border-slate-200/60 dark:border-white/10
          shadow-[0_-8px_30px_rgba(0,0,0,0.18)]
          flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${sheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-2.25rem)]'}`}
      >
        {/* Grab handle — whole bar toggles the sheet */}
        <button
          onClick={() => setSheetOpen((v) => !v)}
          className="h-9 flex-shrink-0 flex items-center justify-center gap-2 w-full"
          aria-label={sheetOpen ? 'Collapse panel' : 'Expand panel'}
        >
          <span className="w-9 h-1 rounded-full bg-slate-300 dark:bg-white/20" />
        </button>
        <div {...scrollContainerProps} className={`flex-1 overflow-y-auto flex flex-col min-h-0 ${scrollContainerProps?.className ?? ''}`}>
          {children}
        </div>
      </aside>
    </MapSidebarContext.Provider>
  )
}
```

`translate-y-[calc(100%-2.25rem)]` leaves the 36px (`h-9`) handle peeking when closed. Keep the existing desktop `return` (inline aside) below this branch.

- [ ] **Step 3: Build + manual verify**

Run: `pnpm build` → success.
Manual (390px, on a map view e.g. /crime-incidents): a handle peeks at the bottom; tapping it slides the rankings sheet up over a backdrop; tapping the handle/backdrop closes it; map is full-width behind it. At ≥768px the inline sidebar is unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/MapSidebar.tsx
git commit -m "feat(mobile): MapSidebar bottom sheet below md"
```

---

## Task 5: DetailPanelShell — bottom sheet

**Files:**
- Modify: `src/components/ui/DetailPanelShell.tsx`

Below `md`: render the panel as a bottom sheet (slide-up) instead of the top-right card. Add a viewport `max-w` cap on the desktop path so a `w-80` card can't overrun a narrow map column.

- [ ] **Step 1: Branch the outer positioning**

```ts
import { useIsMobile } from '@/hooks/useIsMobile'
// ... inside component:
const isMobile = useIsMobile()
```

Replace the outer wrapper `className` (currently `absolute top-5 right-5 z-30 ${widthClass} max-h-[80vh] animate-in fade-in slide-in-from-right-4`) with:

```ts
const outerClass = isMobile
  ? `fixed inset-x-0 bottom-0 z-40 max-h-[70vh] animate-in fade-in slide-in-from-bottom-4`
  : `absolute top-5 right-5 z-30 ${widthClass} max-w-[calc(100vw-2.5rem)] max-h-[80vh] animate-in fade-in slide-in-from-right-4`
```

and use `className={outerClass}`. On mobile, add a backdrop sibling (`fixed inset-0 z-[39] bg-black/40`, `onClick={onClose}`) and switch the inner wrapper's `rounded-xl` → `rounded-t-2xl` when mobile.

- [ ] **Step 2: Build + manual verify**

Run: `pnpm build` → success.
Manual (390px): clicking a map dot slides a full-width detail sheet up from the bottom; X / backdrop close it. The list sheet (Task 4), if open, is covered (z-40 > z-30). At ≥768px the top-right card returns, now width-capped.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/DetailPanelShell.tsx
git commit -m "feat(mobile): DetailPanelShell bottom sheet below md + desktop max-w cap"
```

---

## Task 6: Dispatch911 — migrate aside → MapSidebar + responsive charts

**Files:**
- Modify: `src/views/Dispatch911/Dispatch911.tsx`

This view is chart-centric and bypasses `MapSidebar` with a hardcoded `w-80` aside and fixed-`width={640}` D3 charts.

- [ ] **Step 1: Read the current aside + chart layout**

Read `src/views/Dispatch911/Dispatch911.tsx` around the `<aside className="w-80 ...">` (call-type filter) and the chart blocks (`HourlyHeatgrid width={640}`, `PeriodBreakdownChart`/`TrendChart` width=640).

- [ ] **Step 2: Replace the hardcoded aside with `<MapSidebar>`**

Wrap the existing call-type-filter content in `<MapSidebar width="default">…</MapSidebar>` so it inherits the bottom-sheet behavior. Remove the `w-80 flex-shrink-0` aside wrapper.

- [ ] **Step 3: Make charts not overflow on a phone (stopgap acceptable)**

Wrap each fixed-width chart card in `overflow-x-auto` so a 640px chart scrolls horizontally instead of being clipped by `<main>`'s `overflow-hidden`. (Full responsive-width D3 via `ResizeObserver` is a tracked follow-up, not required here.) Also add `flex-col md:flex-row` to the content row so the chart column and the sidebar stack on mobile.

- [ ] **Step 4: Build + manual verify**

Run: `pnpm build` → success. Manual (390px): charts scroll rather than clip; the call-type filter is a bottom sheet; nothing is cut off.

- [ ] **Step 5: Commit**

```bash
git add src/views/Dispatch911/Dispatch911.tsx
git commit -m "feat(mobile): Dispatch911 sidebar→MapSidebar + non-clipping charts"
```

---

## Task 7: Neighborhood — migrate aside → MapSidebar

**Files:**
- Modify: `src/views/Neighborhood/Neighborhood.tsx`, `src/views/Neighborhood/NeighborhoodSidebar.tsx`

- [ ] **Step 1: Read** `NeighborhoodSidebar.tsx` (root `<aside className="w-[300px] flex-shrink-0 …">`) and how `Neighborhood.tsx` lays out map + sidebar (`flex h-full`).

- [ ] **Step 2: Wrap the sidebar content in `<MapSidebar>`** — replace `NeighborhoodSidebar`'s hardcoded `<aside>` root with `<MapSidebar>` (or render `<MapSidebar>` in `Neighborhood.tsx` around `<NeighborhoodSidebar>`’s inner content), removing the `w-[300px] flex-shrink-0` wrapper so it inherits the sheet.

- [ ] **Step 3: Build + manual verify**

Run: `pnpm build` → success. Manual (390px): the 41-row ranking is a bottom sheet; the map/scatter gets full width. At ≥768px unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/views/Neighborhood/Neighborhood.tsx src/views/Neighborhood/NeighborhoodSidebar.tsx
git commit -m "feat(mobile): Neighborhood sidebar→MapSidebar"
```

---

## Task 8: Full verification + regression sweep

**Files:** none (verification only).

- [ ] **Step 1: Full test + build**

Run: `pnpm test` (expect all pass incl. cameraPadding) then `pnpm build` (expect success — ground truth; incremental `tsc -b` can false-pass).

- [ ] **Step 2: CardTray regression check**

Confirm `useCompactViewport` (threshold 600) still fires now that the map column is full-width on phones — expanded stat cards should still auto-minimize to pills. If a full-width map >600px on a phone keeps cards expanded, lower the threshold or pass a phone-aware one. (Likely fine; verify only.)

- [ ] **Step 3: Cross-view browser pass at 390px**

Walk: Last 48 (FlowRail sheet + event sheet + header), one heatmap view (Cases311 — map full-width, anomaly legend, stat cards, detail sheet, centering offset lands the dot above the sheet), Dispatch911 (charts scroll), Neighborhood (ranking sheet), Home (viz grid not clipped — note: the Home `minmax(460px)` clip is a separate reasonable-lift fix tracked outside this plan). Confirm the nav drawer + one-bottom-sheet-at-a-time z-stacking on each.

- [ ] **Step 4: Final commit if any regression fixes were needed; otherwise done.**

---

## Self-review notes

- **Spec coverage:** breakpoint model (Task 3-7 `md:` gating), nav drawer (T3), sidebar sheet (T4), detail sheet + camera vertical offset (T2, T5), rogue-aside migration (T6, T7), shared `useIsMobile` (T1), CardTray regression (T8). ✅ all spec sections mapped.
- **Type consistency:** `useIsMobile()` / `isMobileViewport()` named consistently across T1-T5; `bottomBandHeight` matches the `rightBandWidth` shape from the shipped util.
- **Out of scope (tracked, not in this plan):** Home `minmax(460px)` viz-grid clip and the other reasonable-lift patches (per-view header wrap, anomaly legend hide, ScannerStrip) — they're independent surgical fixes; do them in a separate pass to keep this PR focused on the shell.
