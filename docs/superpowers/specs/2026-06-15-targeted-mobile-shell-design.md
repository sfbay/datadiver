# Targeted Mobile Shell — Design

**Date:** 2026-06-15
**Status:** Design (awaiting plan)
**Scope:** Targeted re-engineering — make every existing view usable on a phone while keeping today's information architecture and per-view design. Layout-only; no IA changes, no content reprioritization, no bottom-tab nav (those were the deliberately-deferred "mobile-first rethink").

## Goal

DataDiver is desktop-first with **zero responsive breakpoints in its shell**. On a phone the left nav permanently steals ≥52px, the right sidebar (`flex-shrink-0`, floors at 240px) crushes the map to a ~68px sliver, detail panels (`w-72`/`w-80`) overrun the map area, and `<main>`'s `overflow-hidden` *silently clips* anything too wide. This design adds a single new responsive tier — below `md` (768px) — that turns the two chrome rails into overlays (drawer + bottom sheets) so the map (the product's hero) gets the full viewport on phones.

## Non-goals (YAGNI)

- No drag-to-resize sheet physics — sheets snap open/closed at a fixed height.
- No information-architecture changes, no bottom-tab nav, no per-view content reordering.
- No changes to the ≥768px experience — tablets and desktops are untouched.
- No jsdom/RTL layout tests — this project tests pure functions only; layout is verified by build + browser preview, per convention.

## Breakpoint model (3 tiers; only the bottom tier is new)

| Width | Left nav | Right sidebar | Detail panel |
|---|---|---|---|
| **≥1024 (`lg`)** | rail, 320px sidebar | inline 320px | top-right card |
| **768–1024** | rail, compressed | inline 240px compressed | top-right card |
| **<768 (`md`) — NEW** | off-canvas **drawer** | bottom **sheet** | bottom **sheet** |

Tiers 1–2 are today's behavior, **untouched**. `MapSidebar` already keys its "narrow/compressed" state off 1024px; the new mobile mode keys off 768px, so the two breakpoints nest cleanly (768–1024 = compressed-inline; <768 = sheet). This is what makes the change surgical: the overlay treatment only engages for phones/small screens.

The 768px threshold is expressed two ways that must stay in sync:
- **CSS:** Tailwind `md:` variants (`md:` = min-width 768px). Mobile styles are the base; `md:` restores desktop.
- **JS:** a `useIsMobile()` hook (matchMedia `(max-width: 767px)`) for decisions that can't be pure CSS (sheet-vs-card render branch, camera-offset direction).

## Component designs

### 1. Left nav → off-canvas drawer — `AppShell.tsx`

Below `md`:
- A slim **top bar** (`h-12`, `md:hidden`) renders a hamburger button + the DataDiver wordmark/Dana mark. It occupies the vertical space the rail's identity used to.
- The `<aside>` nav becomes `fixed inset-y-0 left-0 z-[45] w-64 -translate-x-full` (off-canvas), sliding to `translate-x-0` when open, over a `fixed inset-0 z-[44] bg-black/50` backdrop. `md:relative md:translate-x-0 md:w-64/md:w-[52px]` restores today's in-flow rail. The drawer sits above both bottom sheets and below the `z-50` modal tier (OmniSearch) — see Layering below.
- `<main>` is full-width below `md` (the drawer is out of flow).
- **State:** a new **ephemeral** `navDrawerOpen` (`useState(false)` in AppShell) — NOT the persisted `isSidebarOpen`. The persisted flag would re-open the drawer over content on load. `isSidebarOpen`/`toggleSidebar` continue to govern only the desktop rail's expanded/collapsed width.
- The drawer **auto-closes** on nav-item tap (extend the existing `navigate` handler) and on backdrop tap / ESC.
- **A11y:** drawer is `role="dialog" aria-modal="true"`; focus moves into it on open and returns to the hamburger on close; ESC closes; backdrop is `aria-hidden`.

### 2. Right sidebar → bottom sheet — `MapSidebar.tsx`

Below `md`, the `<aside>` renders as a bottom sheet instead of an inline column:
- `fixed inset-x-0 bottom-0 z-30 h-[70vh] rounded-t-2xl` slide-up + `bg-black/40` backdrop. `md:` restores the inline `flex-shrink-0` aside with today's width logic.
- The existing chevron pill becomes the **sheet handle** (a horizontal grab-bar affordance, visual only).
- **State:** a new ephemeral `sheetOpen` (`useState(false)`), default closed. On mobile the chevron toggles `sheetOpen`; on desktop it keeps toggling the persisted `isContextSidebarOpen`. (Selecting which to toggle is gated by `useIsMobile()`.) Persisted desktop state is left intact.
- The `useMapSidebarMode().isCompressed` context flag continues to work (children keep dropping secondary elements); on mobile the sheet is full-width, so `isCompressed` is `false` there (children render their full layout in the wide sheet).
- **Layering:** the sidebar sheet sits at `z-30`; the detail-panel sheet (§3) is `z-40`, so a selection's detail sheet simply **stacks above** the list sheet while open — no cross-component state, and the list sheet is still there underneath when the detail closes.

### 3. Detail panel → bottom sheet — `DetailPanelShell.tsx`

Below `md`, the panel renders as a bottom sheet instead of the `top-5 right-5` card:
- `fixed inset-x-0 bottom-0 z-40 max-h-[70vh] rounded-t-2xl` slide-up-from-bottom (swap the `slide-in-from-right-4` animation for a bottom variant). `md:` restores `absolute top-5 right-5 w-72/w-80`.
- The panel already opens on selection via its `open` prop — **no new state needed.** Tapping a map dot → sheet slides up with the detail. This is the desired mobile flow and falls out for free.
- Outside-click dismiss still applies; on mobile a backdrop tap closes it.
- **Layering:** detail sheet is `z-40` (above the list sheet's `z-30`); it covers the list while open via pure z-stacking — no shared state to coordinate.
- Add a viewport width cap for safety even on the desktop path: `max-w-[calc(100vw-2.5rem)]` so a `w-80` card can never overrun a narrow map column.

### 4. Camera-centering: mobile branch — `src/utils/cameraPadding.ts`

The detail panel moving to the bottom **inverts the obstruction**: the offset we just shipped (shift selection *left* of a right-side card) is wrong when the card is a bottom sheet. The shared util becomes viewport-aware:
- **Desktop (≥768):** unchanged — `eventFlyToOffset(map, cardWidthPx)` returns `[-rightBand/2, 0]`.
- **Mobile (<768):** return a *vertical* offset `[0, -bottomBand/2]` where `bottomBand = min(sheetHeightPx, floor(mapH * 0.6))`, shifting the selection up into the visible band above the sheet.
- All **7 existing call sites stay unchanged** — they call the same helper; the util reads viewport to branch.
- Keep the math testable: add a pure `bottomBandHeight(sheetHeightPx, mapHeightPx)` mirroring `rightBandWidth`, and have `eventFlyToOffset` choose horizontal vs vertical via `useIsMobile`-equivalent (`window.matchMedia` check, or a passed flag in tests). New unit tests cover the vertical branch and the chooser.

### 5. The two rogue sidebars — `Dispatch911.tsx`, `Neighborhood*.tsx`

Both hardcode their own fixed-width asides (`w-80`/`w-[300px]`) and bypass `MapSidebar` entirely, so they don't inherit any of the above.
- **Migrate both onto `<MapSidebar>`** so they get the bottom-sheet behavior for free. If a full migration is too invasive in one pass, the fallback is to wrap each aside in the same `md:`-gated sheet classes.
- **Dispatch911 charts:** the hero `HourlyHeatgrid` etc. are fixed `width={640}` and overflow a phone. Make them measure their container (`ResizeObserver`/ref) and pass that as `width`; `overflow-x-auto` on each chart card is an acceptable stopgap if responsive-width D3 is deferred.

### 6. Shared plumbing — `src/hooks/useIsMobile.ts`

A small SSR-safe `useIsMobile()` returning `matchMedia('(max-width: 767px)').matches`, updated on change. Mirrors the existing `useCompactViewport` pattern (which uses a 600px threshold for CardTray/ChartTray — left as-is). Used by `AppShell`, `MapSidebar`, `DetailPanelShell`, and the camera-offset chooser so they all agree on the breakpoint.

## What we get for free (already in place)

- **`MapView` auto-resize:** `MapView.tsx:179-197` runs a `ResizeObserver` → `map.resize()` on any container geometry change. When the drawer frees width or the sidebar flips to overlay, the map repaints to the new size with no extra wiring. This removes the biggest risk.
- **Header mobile fix + camera-centering offset** already shipped this session (parked, ready to commit): `Last48` header wraps/hides correctly, and the 6 map views offset their fly-to so a selection lands beside (not under) its card. This design extends that offset to the mobile sheet case.

## Interaction rules (summary)

- Below `md`: the detail sheet (`z-40`) stacks above the list sheet (`z-30`) — opening a detail covers the list; closing it reveals the list again. The nav drawer (`z-[45]`) sits above both, under the `z-50` modal tier. No cross-component close-on-select coordination — pure z-stacking.
- All overlays (nav drawer, both sheets) default **closed** on load and use ephemeral state — persisted desktop collapse flags are never read on mobile.
- Backdrop tap and ESC close the topmost overlay; focus is managed for the nav drawer.

**Layering (z-index), ascending — extends the documented hierarchy (CardTray 10 → popup 15 → header 20 → detail 30):** sidebar sheet `z-30` · detail sheet `z-40` · nav drawer `z-[45]` (backdrops one step below each) · existing modal tier `z-50` (OmniSearch) on top.

## File-by-file change list (feeds the plan)

| File | Change |
|---|---|
| `src/hooks/useIsMobile.ts` | **New.** matchMedia `(max-width:767px)` hook. |
| `src/components/layout/AppShell.tsx` | Top bar + hamburger (`md:hidden`); `<aside>` → off-canvas drawer + backdrop below `md`; ephemeral `navDrawerOpen`; auto-close on nav tap; a11y. |
| `src/components/layout/MapSidebar.tsx` | Bottom-sheet render below `md`; ephemeral `sheetOpen`; chevron→handle; one-sheet coordination. |
| `src/components/ui/DetailPanelShell.tsx` | Bottom-sheet render below `md`; bottom slide animation; `max-w` cap on desktop path. |
| `src/utils/cameraPadding.ts` (+`.test.ts`) | Mobile vertical-offset branch; pure `bottomBandHeight`; tests. |
| `src/views/Dispatch911/Dispatch911.tsx` | Migrate aside → `MapSidebar`; responsive chart widths. |
| `src/views/Neighborhood/Neighborhood.tsx`, `NeighborhoodSidebar.tsx` | Migrate aside → `MapSidebar`. |
| (regression check) `CardTray.tsx` | Confirm `useCompactViewport` still fires once map column is full-width on phones. |

## Verification

- **Unit:** `cameraPadding` mobile branch (pure `bottomBandHeight` + chooser).
- **Build:** `pnpm build` (full `tsc -b` + vite — the project's ground truth; incremental `tsc -b` can false-pass).
- **Manual:** browser preview at 390px width across Last 48, one map view (e.g. Cases311), Dispatch911, Neighborhood, and a scrolling view (Home) — confirm drawer, sheets, one-sheet rule, and that the map gets full width.

## Risks & open questions

- **Ephemeral-state placement:** the nav drawer (`AppShell`) and the sidebar `sheetOpen` (`MapSidebar`) each own local ephemeral state; the detail sheet rides the existing per-view selection. No cross-component coordination by design (pure z-stacking), which keeps this low-risk.
- **Dispatch911 chart responsiveness** is the largest single sub-task (fixed 640px D3). If it balloons, ship the `overflow-x-auto` stopgap and track responsive-width D3 as a follow-up.
- **Last 48 uses `MapSidebar` (lean variant)** for FlowRail, so it inherits the sheet automatically — verify the FlowRail listbox keyboard/scroll behavior survives the sheet remount.
