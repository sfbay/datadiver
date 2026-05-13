# The Last 48 · FLOW UI/UX Polish — Design Brief for `/frontend-design`

**Date:** 2026-05-13
**Status:** Active brief
**Phase:** 2.5b (follows 2.5a mechanical fixes)
**Scope:** Visual design + UX direction for `/live-feeds` FLOW mode. NOT a from-scratch redesign — augment the working implementation already in main.

---

## Project context

**DataDiver** is San Francisco civic-data journalism software. The aesthetic is documented in `CLAUDE.md`:

- **Earth-tone palette.** Espresso (`#1e140d`) dark + cream (`#f5ecd9`) light. Pigment ramps for each dataset role: terracotta (emergency/fire), moss (civic upkeep/311), ochre (money/warnings), indigo (911/sensitive), brick (severity/police), teal (paired/cool), plum (campaigns).
- **Type stack.** Fraunces (display, italic at hero scale), Roboto Serif (body, with oldstyle figures in prose / lining tabular in data), Space Mono (mono labels, eyebrows, timestamps).
- **Corner-glow signature.** Single diffuse top-left blur clipped to element bounds, driven by `--glow` custom property. Used on `VizCard`, `StatCard`, hero, detail-view overlays. NOT used on buttons, inputs, tables, prose blocks — preserving its specialness is part of the discipline.
- **Differentiators.** Rule-leading micro labels (`── EYEBROW`), kraft-paper card edges (warm umber shadow), pull-quote margin notes (italic editorial sidebars), oldstyle figures in body / lining tabular in data, pigment naming (`terracotta`, not `red-500`), double-rule dividers, notched corners with accent tab.

**The Last 48** is a new view at `/live-feeds` that displays SF's freshest civic data (911 dispatches, Fire/EMS, 311 service requests) over a rolling 48-hour window. Two modes:
- **FLOW** (this brief) — animated event arrival on a map; chronological event rail at right; detail peek panel slides in over the rail on click.
- **HOTSPOTS** — z-score anomaly choropleth (out of scope for this brief).

The full design spec lives at `docs/superpowers/specs/2026-05-12-last-48-design.md`. Phases 1 + 2 + 2.5a have shipped to production (PRs #31, #32, #33). The "brand" framing is **"The Last 48 — what's flowed in across SF in the past 48 hours"** — honest about the inherent processing lag in public data (no SF dataset is truly real-time).

## Current state (what's in main as of this brief)

```
/live-feeds (Last48.tsx)
├── Header  ── LIVE · The Last 48  /  [FLOW · HOTSPOTS]  📺 Open in kiosk
├── FreshnessChipStrip  (DATA REFRESH + EVENT LAG, two rows of per-dataset chips)
├── DatasetFilterChips  (6 pill chips: 911 Realtime ✓, Fire/EMS ✓, 311 ✓, 911 Historical ○, Parking ○, Police ○)
├── FlowMode
│   ├── MapView (Mapbox dark-v11 basemap, ~11k event dots)
│   │   └── FlowMapLayer (one circle layer with paint expressions)
│   ├── FlowRail (right, w-clamp(180px,16vw,260px))
│   │   └── chronological event list, 50 rows max, auto-scroll on new
│   └── Last48EventPeek (slides in over the rail when an event is clicked)
└── ScannerStrip  (h-12, bottom: 📡 SCANNER · feed name · ▶ TUNE IN)
```

Tier-1 default-on: 911 Realtime, Fire/EMS, 311. Tier-2 default-off: 911 Historical, Parking Revenue, Police.

911 events now carry an `open | closed` state derived from `disposition`. The map renders them differently:
- **Open** events: +1px circle radius, cream stroke (`#f5ecd9`), gentle age fade (1.0 → 0.55 over 48h).
- **Closed** events: standard radius, dark espresso stroke, pre-faded opacity (0.7 → 0.25 over 48h).
- Non-911 datasets default to the "open" treatment (they don't have a lifecycle concept).

## User design feedback (the brief itself)

The user reviewed the working Phase 2 build and provided this design direction. Each point below is a problem to solve OR a question to explore.

### 1. Hover-box detail pattern (replace the slide-in panel)

The current pattern: clicking a map dot or rail row opens `Last48EventPeek` as a slide-in panel that *takes over the right rail*. This breaks list browsability — the user can't scroll the rail while a peek is open.

**Direction:** replace with a hover/click *popover* that:
- Floats near the cursor (desktop hover) or near the tapped item (mobile tap)
- Shows minimal info (eyebrow + headline + 2-3 fields + footer link)
- Does NOT consume the rail real estate
- Has an "Explore <Dataset> →" footer linking to the dataset's dedicated view
- Dismisses on outside click or Esc
- Works as a hover affordance on desktop AND as a tap-to-show affordance on mobile

**Question:** what's the right interaction model — pure hover, hover + click-to-pin, click only? On dense maps, hover-everywhere creates flicker. On mobile, hover doesn't exist. Recommend a unified model.

### 2. Selected-item treatment (list AND map)

When the user picks an event from the rail, the dot on the map should look *distinct* — not just "the same dot, now selected" but visually *special*.

**Direction:**
- Rail row: distinct selected style (the current `ring-1 ring-ochre-500` is too subtle); consider inversion (light text on warm background), eyebrow accent, or other treatments
- Map dot: animated radar pulse, expanding ring, or other "this one is the chosen one" affordance — but not gaudy. DataDiver's PR #21 introduced a CRT-correct radar sweep on loading skeletons; that's a precedent worth referencing.

**Constraint:** any animation must respect `prefers-reduced-motion`.

### 3. Dot vocabulary — beyond colored circles

The current implementation is dataset-by-color, all circles. With ~11k dots on a dense map, colors blur together and the eye loses dataset structure. Police (35 events) is statistically swamped by 911 (thousands).

**Direction:**
- Explore whether different *shapes* (square, triangle, diamond, plus sign) per dataset add clarity without ugliness
- Consider hybrid: keep circle for most-common datasets, distinct shape for sparse/severe ones
- Alternative: same shape, stronger visual hierarchy via stroke width, halo, or icon overlay
- Whatever direction: the system needs to be readable at three zoom levels — citywide overview (~zoom 12), neighborhood (~zoom 14), street (~zoom 16)
- Mapbox `circle` paint can vary radius/color/stroke per feature; SVG icons via `symbol` layer are possible but require sprite preparation

**Out of scope:** clustering at low zoom (could be Phase 3 polish).

### 4. Sparse-layer visual hierarchy (Police problem)

Police has ~35 events vs ~11k total — 0.3% of dots. At uniform treatment, sparse layers vanish.

**Direction:** flip the hierarchy so *less-frequent datasets render visually stronger*:
- Z-order: render Police last (on top of dense layers)
- Stroke: thicker outline on sparse datasets
- Optional: small halo / glow on sparse points so they punch through

### 5. "Feels alive" energy

The user explicitly wants the page to "feel more alive." Specific opportunities:
- **Newest-event arrival pulse** — when a new event lands on the map, brief pulse animation (~600ms fade-in or radius expansion) before settling into resting state
- **Open call subtle pulse** — open 911 calls (no disposition yet) could gently breathe to convey "still active" — *very subtle, easy to overdo*
- **Mode transition** — switching FLOW ↔ HOTSPOTS could cross-fade or have a brief signature transition
- **Map camera idle motion** — eventually (Phase 3 timelapse work) a subtle "drone circle shot" during quiet ambient viewing. Out of immediate scope but worth noting how it might fit.

### 6. Keyboard browsability

Rail rows need to be keyboard-navigable: arrow up/down to navigate, Enter to open peek, Esc to close. Selected row should be focused (visible focus ring) AND fly the map / highlight the dot in lockstep with selection.

### 7. Chrome polish

The header, freshness chip strip, dataset filter chips, mode toggle, and scanner strip all need a more careful integration with DataDiver's editorial voice. Specifically:
- Pills (filter chips, mode toggle) could leverage the corner-glow signature *more carefully* — currently no glow; might warrant subtle glow on the active mode toggle
- Freshness chips could pull in editorial polish (italic eyebrow, double-rule divider beneath)
- Header could earn a pull-quote margin note explaining "what is this view"
- Scanner strip's "▶ TUNE IN" pill is the only place green appears — feels a little arbitrary; reconsider

### 8. Integration with the earth-tone refactor

`The Last 48` was built during the earth-tone era and uses palette tokens correctly. But it doesn't yet pull in the broader signature elements: corner-glow on the right-rail header, kraft-paper card edges on the peek, pull-quote margin notes for editorial framing. The aesthetic should integrate more deeply — the view shouldn't feel like a "data tool" but a "civic newsroom surface."

## Constraints

- **No new dependencies.** Stick to React 18, Mapbox GL JS v3, Tailwind v4, Vite. The existing palette tokens and font stack are the design system.
- **No backend.** All data through Socrata SODA API. No SSR.
- **Performance budget.** The map renders 5k-15k dots and re-renders on every 2-minute 911 Realtime poll. New animations must NOT cause re-paints that hurt frame rate. Prefer CSS transitions + Mapbox paint expressions over JS animation loops.
- **Accessibility.** WCAG AA color contrast. `prefers-reduced-motion` respected. Keyboard navigability throughout.
- **Mobile.** The view must remain usable down to ~640px width. The right rail collapses to a chevron via the existing `MapSidebar` primitive at narrow widths.
- **Don't replace working primitives unnecessarily.** Reuse `DetailPanelShell`, `MapSidebar`, `useMapLayer`, glow-corner utility, existing palette/typography classes.

## Existing primitives to leverage (or modify carefully)

- `src/components/maps/MapView.tsx` — Mapbox wrapper
- `src/hooks/useMapLayer.ts` — source+layer reactivity with retry
- `src/hooks/useMapTooltip.ts` — hover popups (probably the basis for the new hover-box)
- `src/components/layout/MapSidebar.tsx` — right-rail compress/collapse states
- `src/components/ui/DetailPanelShell.tsx` — slide-in panel chrome (currently used by Last48EventPeek; may be replaced or retained for non-FLOW use)
- `.glow-host` + `.glow-corner` utility in `src/index.css`
- Earth-tone palette tokens in `src/styles/tokens.css` and `src/index.css` `@theme` block

## Files in scope for Phase 2.5b changes

These are the files most likely to be touched:

```
src/views/Last48/Last48.tsx                     - layout chrome, mode router
src/views/Last48/modes/FlowMode.tsx             - orchestrator
src/views/Last48/modes/FlowMapLayer.tsx         - map circle paint expressions
src/views/Last48/modes/FlowRail.tsx             - chronological list + keyboard nav
src/views/Last48/detail/Last48EventPeek.tsx     - REPLACE with hover-box pattern (or retain for HOTSPOTS only)
src/views/Last48/chrome/FreshnessChipStrip.tsx  - chrome polish
src/views/Last48/chrome/DatasetFilterChips.tsx  - chrome polish
src/views/Last48/chrome/ModeToggle.tsx          - chrome polish
src/views/Last48/chrome/ScannerStrip.tsx        - chrome polish
src/index.css                                   - new CSS for animations / focus styles
```

A new component file may be needed for the hover-box, e.g.:
```
src/views/Last48/detail/Last48EventHoverBox.tsx
```

## Deliverables expected from `/frontend-design`

This is an **exploration + recommendation** task, not direct implementation. The agent should produce:

1. **Design rationale per area** — for each of the 8 points above, a short rationale that explains the chosen approach and the alternatives considered
2. **Visual mockups** — code-level mockups (TSX + Tailwind) for each new pattern, particularly:
   - Hover-box layout, anchored to map / rail position
   - Selected-state visual treatment (rail row + map dot)
   - Dot vocabulary recommendation (with paint expression draft)
   - Chrome polish — sample before/after for at least 2 elements
3. **Implementation roadmap** — ordered list of tasks with file-level scope, sequenced for safe incremental landing (each step ships independently)
4. **Annotations on accessibility, performance, and mobile** — note specific concerns and how the recommended solutions handle them

The deliverable should go to: `docs/superpowers/specs/2026-05-13-last-48-flow-polish-design.md` (sibling to this brief)

## Non-goals

- Redesigning HOTSPOTS mode (separate effort)
- Phase 3 work (scrubber + timelapse + drone circle shot — those are their own design conversation)
- Reworking the broader DataDiver aesthetic — only Last 48 FLOW UI
- Replacing the central data engine (`useLast48Window`) — it's working
- Introducing a new design system or component library

## What the user has explicitly approved or signaled preference for

- **Hover-box pattern over slide-in panel** for event detail
- **Selected-dot animation** — likely something radar-inspired but not overdone
- **Keyboard browsability** of the rail
- **More distinctive visual hierarchy** for sparse datasets
- **Subtle "alive" energy** — animations integrated with DataDiver's existing radar/pulse vocabulary
- **Better integration** with the earth-tone overhaul

## What the user has not yet decided

- Specific dot shape vocabulary (open question to explore)
- Exact animation style for selected state (open question)
- Whether to keep Parking Revenue chip at all (currently default-off Tier-2; user said "borderline")
- Specific hover-box anchoring (cursor-anchored vs item-anchored)

---

**Begin by reading `CLAUDE.md`, `docs/superpowers/specs/2026-05-12-last-48-design.md`, and the current implementation files in `src/views/Last48/`. Then produce the design-direction document.**
