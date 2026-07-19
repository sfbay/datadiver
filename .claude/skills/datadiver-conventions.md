---
name: datadiver-conventions
description: Use when building, modifying, or debugging any view in the DataDiver project — maps, charts, hooks, Socrata queries, Tailwind styling, or deployment. Covers cross-cutting project conventions that apply across all views (not specific to any single feature). Trigger on terms like "new view," "new map," "new chart," "Mapbox," "Socrata query," "useMapLayer," "glass-card," "skeleton loading," "useDataset," "useTrendBaseline," "dark mode," "heatmap colors," "build failure," "Vercel deploy," "git push."
---

# DataDiver Cross-Cutting Conventions

Project-wide patterns that apply to any view, any hook, any chart. Read this before adding a new view or debugging an unfamiliar failure mode. For feature-specific knowledge (compliance dashboard, neighborhood view, demographics, etc.) see the corresponding domain skill; this file is the horizontal foundation everything shares.

## Stack at a glance

- **Vite + React 18 + TypeScript + Tailwind v4** (NOT Next.js, NOT shadcn/ui)
- **Mapbox GL JS v3** with `dark-v11` basemap + `preserveDrawingBuffer: true`
- **D3.js** for charts (useRef + useEffect + d3.select pattern)
- **Zustand** (`appStore`) for global state (date range, dark mode, sidebar, selected entities)
- **React Router** with URL param sync via `useUrlSync` hook
- **Socrata SODA API** for all SF open data — no backend
- **Vercel** auto-deploys from `main`, build: `pnpm build` → `tsc -b && vite build`, dev: `pnpm dev` (port 5174)

## Mapbox GL v3 + React patterns (critical)

The Mapbox GL v3 / React integration has specific quirks that took many iterations to get right. These ARE the only reliable patterns — deviating from them will cause layers to silently fail to render or cause infinite retry loops.

**`useMapLayer` with try-catch + setTimeout retry**: the canonical pattern for adding GeoJSON sources and layers. Mapbox's `addSource`/`addLayer` throws silently if the style isn't ready. The retry pattern:
```tsx
const addOrUpdate = () => {
  try {
    const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
    if (source) source.setData(geojson)
    else {
      map.addSource(sourceId, { type: 'geojson', data: geojson })
      for (const layer of layers) if (!map.getLayer(layer.id)) map.addLayer(layer)
    }
  } catch {
    retryTimer = setTimeout(addOrUpdate, 200)
  }
}
```
Also handles `style.load` events for theme toggles. See `src/hooks/useMapLayer.ts`.

**`MapView` calls `onMapReady` immediately** — NOT on `load` event. The style data may still be loading but the map instance is ready to accept layer calls (which will retry via the pattern above if the style isn't ready yet).

**Container sizing**: use `w-full h-full` NOT `absolute inset-0`. Mapbox overrides `position` to `relative` on its container, which breaks absolute positioning.

**Heatmap colors on dark-v11 basemap**: must be bright (cyan, red, amber, emerald). Dark blues and purples are invisible against the dark background. If a heatmap looks dead, check if the color ramp starts at a visible color.

**`useMapLayer` has a secondary effect** that updates paint/layout properties when the layers config changes. This is the fix for the Demographics choropleth bug where switching variables didn't repaint. Cast prop names with `prop as any` for `setPaintProperty` / `setLayoutProperty` because Mapbox's union types are too strict for generic iteration.

**Stacking context with glass-card**: `.glass-card` uses `backdrop-filter: blur(...)` which forces a new stacking context. Tooltips/popovers that need to overflow from one card on top of another require the parent card to have `relative z-20` (or similar). Bumping the child's z-index alone isn't enough because stacking contexts are bounded.

## Socrata data patterns

**All data comes from Socrata SODA API** via `fetchDataset()` in `src/api/client.ts`. No backend, no database — the API is the backend.

**Per-dataset cache TTLs**: configured in `src/api/datasets.ts` via `cacheTTL` field. Range from 1 min (real-time 911) to 24 hours (annual GIS). Aggregation queries share the same cache entry as raw queries if the URL matches.

**Server-side aggregation over client-side sampling — always.** The rule: use `GROUP BY` + `SUM()`/`COUNT()` in the `$select` and `$group` params to get accurate per-entity totals. Fetching N rows sorted by recency and then aggregating client-side will produce wrong totals because the sample doesn't cover the full universe.

**`fetchDataset` auto-skips `defaultSort`** when `$group` or aggregate functions (`SUM`, `COUNT`, `AVG`, `MIN`, `MAX`) are detected in `$select` — ordering by a non-selected field causes Socrata 400 errors.

**Parallel fetches via `Promise.all`**: the canonical pattern for multi-layer or multi-metric queries. See `useAdvertisingData.ts` (3-layer ad detection), `useTrendBaseline` (5 parallel queries for YoY + baseline + breakdown), `useDepartmentTimeline` (3 layers per dept).

**SQL escaping**: single quotes in vendor/department names need doubling (`'` → `''`). The canonical pattern: `const escaped = name.replace(/'/g, "''")`.

**`useDataset` hook** wraps `fetchDataset` with `{ data, isLoading, error, refetch }` state. Standard contract for all view data loading.

## Progressive skeleton loading

**No full-screen loading blockers.** Every view shows its layout immediately; each component zone has its own skeleton that gets replaced when its data arrives.

- **Map area**: `MapLoadingIndicator` — a corner pill that says "Loading X datasets..." at top-left. NOT an overlay that blocks the map.
- **Stat cards**: `SkeletonStatCards` — render in the same absolute positions as the real tiles
- **Sidebar lists**: `SkeletonSidebarRows count={N}` — pre-sized row placeholders
- **Charts**: `SkeletonChart height={N}` — matches the chart's expected dimensions
- **Breakdown lists**: `SkeletonBreakdownList` — vertical list skeleton

See `src/components/ui/Skeleton.tsx` for the full kit. The rule: layout stable first, data in progressively.

## D3-in-React pattern

All D3 charts in this codebase follow the same shape. Don't invent alternatives.

```tsx
function MyChart({ data, width, height }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()  // clear on rerender

    // Build scales, draw elements, animate...
  }, [data, width, height, isDarkMode])

  return <svg ref={svgRef} className="w-full" />
}
```

**Responsive width**: either pass `width` as a prop OR use `containerRef.current.clientWidth` inside the effect to measure the parent. See `SpendingTimeline.tsx` for the measure-parent pattern.

**Animated line draw**: the stroke-dasharray trick for drawing lines over time:
```tsx
const totalLength = path.node()?.getTotalLength() || 0
path.attr('stroke-dasharray', `${totalLength} ${totalLength}`)
    .attr('stroke-dashoffset', totalLength)
    .transition().duration(800).ease(d3.easeCubicOut)
    .attr('stroke-dashoffset', 0)
```

**Dark/light mode colors inside charts**: read `isDarkMode` from `useAppStore` and branch accordingly. Earth-tone neutral mid-tones for axis text, warm-tinted alpha grids:
```tsx
const textColor = isDarkMode ? '#a8926a' : '#7a5f42'  // paper-500 / ink-500
const gridColor = isDarkMode ? 'rgba(255,235,200,0.04)' : 'rgba(58,42,30,0.06)'
```

## Number formatting rules

**`formatBudgetFull` ($48,584) over `formatBudgetAmount` ($48.6K)** for journalism precision. Full dollar amounts preserve the exact figure which is sometimes the story. Use abbreviated format only in chart axis labels where space is truly constrained.

**Rounding rules for percentages**: zero decimals for large percentages (`73%`), one decimal for small ones under 1% (`0.4%`). Compare agencies `73%` vs p-card `1.0%` — asymmetric by design because decimal precision matters more at small scales.

**Whole numbers for counts**: incidents, outlets, departments — never with a decimal. The `formatTooltipValue` function in `CorrelationScatter.tsx` checks `Number.isInteger(value)` to suppress unwanted `.0` suffixes.

**Sentence case for ALL-CAPS vendor names**: the `toSentenceCase` utility in `src/utils/format.ts` handles UPPERCASE-to-title-case with:
- Preserved abbreviations (LLC, SF, DPH, MTA, HRD, etc.)
- Possessive fix (`CHILDREN'S` → `Children's`, not `Children'S`)
- Works on vendor names, department names, outlet names

## Views pattern

Every view file follows the same structure:
1. `useDataset` (or similar) for raw data (map points, list items)
2. Server-side aggregation queries for accurate per-entity stats
3. `useDataFreshness` + `DataFreshnessAlert` to detect stale date ranges and offer one-click auto-adjust
4. `useTrendBaseline` for YoY deltas + z-score computation (5 parallel Socrata queries)
5. Map-centric layout (MapView + right sidebar) OR chart-centric (like Dispatch911)
6. Skeleton loading per component zone
7. `DataSourceLine` footer with dataset name, source agency, dataset ID, and caveats

See any existing view file (e.g., `src/views/CrimeIncidents/CrimeIncidents.tsx`) as a reference implementation.

## Shared map-view components (May 2026 sprint additions)

| Component | Path | Use for |
|---|---|---|
| `<MapSidebar>` | `src/components/layout/MapSidebar.tsx` | Right context sidebar wrapper. Three states (full ≥1024 / compressed <1024 / collapsed-stub). Children read `useMapSidebarMode().isCompressed` to opt into compressed rendering. Sticky toggle via `appStore.isContextSidebarOpen`. |
| `<PositionScale>` | `src/components/charts/PositionScale.tsx` | "You are here" microvis — small SVG track with min/max endpoint dots, optional reference tick (citywide avg), colored focal dot. Dataset-agnostic; accepts `value`, `range: [min,max]`, optional `reference`, `color`. Reusable for any entity-vs-population comparison. Wired into `<StatCard>` via the optional `positionScale` prop. |
| `<UnderlayLegend>` | `src/components/maps/UnderlayLegend.tsx` | Floating glass-card legend for the active demographic underlay. Renders nothing when `variable` is null. Matches `DemographicUnderlay`'s 0/33/66/100 percentile stops so the legend gradient lines up with the choropleth. Position: `absolute bottom-4 right-4` on each view's `MapView` children. |
| `<ComparisonPopover>` | `src/components/filters/ComparisonPopover.tsx` | Date-anchored "vs July 4, 2025 ▾" pill trailing `<CardTray>`'s pill bar (after the card pills + "= all"; ochre when active). Dropdown rows are presets resolved to concrete dates + a pinned-date picker. Drives Zustand `comparisonMode` (union — presets follow the range, pinned dates stay put; see `src/utils/comparisonMode.ts` + the CLAUDE.md Trend Infrastructure bullet). Never reintroduce offset labels ("vs 1yr ago") or the deleted `<ComparisonToggle>`. |

When adding map-view comparison UX, prefer the **neighborhood comparison framing** pattern (see `memory/feedback_comparison_framing_not_drilldown.md`): keep citywide as canvas, render neighborhood as context via `<PositionScale>` + stat-card swap. Don't drill everything down.

## Liquid layout pattern (Home page)

Inspired by Jesse's 2000-era LiquidEx, translated to modern controls in PR #25. When working on Home or any new hero-like section:

- Prefer `clamp(min, vw-formula, max)` over breakpoint-based size classes (`desk:` / `lg:` / `xl:`).
- Prefer `grid-cols-[repeat(auto-fit,minmax(N,1fr))]` over `desk:grid-cols-X lg:grid-cols-Y`.

## Type tokens & breakpoints (Large Type Phase 2, July 2026)

- Micro type is TOKENS, never arbitrary px: `text-nano` (9px) / `text-micro` (10px) /
  `text-label` (11px) — defined in the `@theme` block of `src/index.css`, floor-raised under
  `html[data-type-scale]`. Writing `text-[9px]`-style classes reintroduces px-frozen debt.
- **`md:` is banned in app code — write `desk:`** (attribute variant off `html[data-vp]`,
  stamped from EFFECTIVE viewport width = innerWidth ÷ type-scale factor). JS side:
  `useIsMobile()` / `effectiveViewportWidth()`. Rationale + mechanics: CLAUDE.md →
  Mobile/responsive.
- Hero `min-height: clamp(0px, 30vw, 600px)` is a beautiful trick — natural content height wins at narrow widths, kicks in only at wide widths.
- The proportion control modern CSS adds over 2000 is `min`/`max` bounds; `clamp` is the spiritual successor to raw `width="N%"` with the guards that 2000 couldn't have.

Full pattern docs: `memory/project_liquid_layout_pattern.md`.

## Z-index hierarchy on map views

Documented inline in `src/index.css` and in CLAUDE.md. Quick reference, ascending:

| Layer | z-index |
|---|---|
| Map basemap | auto |
| MapView overlay layers | `z-[1]`, `z-[2]` |
| `<CardTray>` | `z-10` |
| `.mapboxgl-popup` | `z-15` (global rule in `index.css`) |
| Page header | `z-20` |
| Detail panels | `z-30` |
| Modals | `z-50+` |

`backdrop-blur-*` creates a stacking context — sibling rows both at `backdrop-blur + z-10` will compete via DOM order, not z-index. Bump the one that needs to win to a higher z-index.

Full reference + deferred extract-as-constants TODO: `memory/project_zindex_stack.md`.

## URL state and navigation

**`useUrlSync`** lives in `AppShell` and syncs the global date range (`start`/`end` params) to/from the Zustand store. Every view inherits this for free.

**Per-view URL params** are managed locally via `useSearchParams` from react-router-dom. The pattern: read on render, write via `setSearchParams` on state change, use `{ replace: true }` to avoid polluting history for transient selections.

**Deep-link cleanup**: when building a share URL for a detail view, don't just use `window.location.href` — it will include stale global params (e.g., `start`/`end` from views that don't use the date range). Construct the URL with only the params this view cares about:
```tsx
const buildShareUrl = useCallback(() => {
  const params = new URLSearchParams()
  params.set('tab', 'search')
  params.set('vendor', vendor)
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`
}, [vendor])
```

**`ShareLinkButton`** is the standard share affordance (circle with link icon + green checkmark flash on copy). Located at `src/components/ui/ShareLinkButton.tsx`. Prefer this over custom "Share URL" text buttons.

## Deployment gotchas

**`tsc -b` is stricter than `tsc --noEmit`.** Vercel's build runs `tsc -b` (project references mode) which catches issues the local `--noEmit` pass doesn't:
- Unused parameters in function signatures → prefix with underscore (`_onBack`)
- Mapbox `setPaintProperty` / `setLayoutProperty` with generic prop names → cast as `any`
- Some stricter return-type inference

**Always run `npx tsc -b` before pushing** to avoid failed deploys. If a build fails on Vercel and passes locally, this is almost always the reason.

**Env vars on Vercel**: must be added with `vercel env add VAR production --value "..." --yes` — stdin pipe (`echo val | vercel env add`) doesn't work reliably.

**Background `git push` vs foreground race condition**: if you background-push a commit in one tool call and then foreground-push in the next, the foreground may race with the background and report "nothing to commit." Always verify with `git log --oneline -1` after a push to confirm the commit actually landed.

**SPA routing**: `vercel.json` has a rewrites rule `/(.*) → /index.html` to make React Router work. Don't remove it or nested URLs will 404 on page refresh.

## Color palette (cross-view)

DataDiver runs an **earth-tone palette** site-wide as of the May 2026 refactor (PRs #9–#16). Espresso `#1e140d` for dark mode, cream `#f5ecd9` for light mode, with seven pigment-named accent ramps. Source of truth: `src/styles/tokens.css` and the `@theme` block in `src/index.css`.

| Pigment | Hex (-500) | Role |
|---|---|---|
| Terracotta | `#d47149` | Primary brand, emergency, alert |
| Ochre | `#d4a435` | Warning, money, ledger feel |
| Moss | `#7a9954` | Success, business formation, civic upkeep |
| Dusty teal | `#5c9693` | Info, Dana's color, civic-place |
| Brick | `#b85545` | Critical, errors, crash severity, P-card |
| Indigo | `#616a96` | Rare cool, civic ceremony, sensitive calls, Direct ad placements |
| Plum | `#8b6282` | Campaign finance, agency routing, demographics |

**`text-{pigment}-{400|500|600|700}` and `bg-{pigment}-{...}` Tailwind utility classes are available** site-wide via `@theme` in `src/index.css`. Use these instead of arbitrary-value hex literals (`text-[#7a9954]`).

**Migration note for any future palette work** — the cleanest grep covers all three CSS color formats since each surfaces different gaps:

```bash
# Catches hex AND rgba() channel form AND hsl() form in one pass
grep -rE "#[0-9a-fA-F]{3,8}|rgba?\([0-9]+[, ]+[0-9]+[, ]+[0-9]+|hsla?\(" src/
```

The earth-tone refactor's first sweep grepped only `#hex` and missed all the `rgba(R, G, B, A)` channel literals in Mapbox heatmap configs (`mapLayers.ts` files), which had to be migrated in a follow-up PR. Heatmap configs structurally use `rgba()` for alpha-controlled color stops, so always grep all three forms.

**Heatmap colors on dark-v11 basemap** — the original "dark blues/purples are invisible" rule still applies. Earth-tone equivalents to use: brick (severity), terracotta (alerts), ochre (warnings), moss (positive). Avoid plum and indigo for heatmap density gradients on dark — they don't pop enough.

## Fonts

All three loaded from Google Fonts CDN via `<link>` in `index.html`. Type-stack tokens live in `src/styles/tokens.css` as `--font-display` / `--font-body` / `--font-mono`.

- **Fraunces** — display face, headlines, hero. Variable axis `opsz 9..144`, `SOFT 0..100`. Italic at hero scale; upright at card titles. Class: `.font-display`.
- **Roboto Serif** — body. Variable axis `opsz 8..144`, weights 300–700. Oldstyle figures (`font-feature-settings: "onum"`) in prose; lining tabular figures (`"tnum","lnum"`) in data values.
- **Space Mono** — mono labels, data values, eyebrows, timestamps, coordinates. Has real italics. Class: `.font-mono`.

**Italic display font for main titles**: the `font-display italic text-Nxl` pattern signals "this is a content subject" (department name, vendor name, neighborhood name). Used on drill-down page H2s. Fraunces' `SOFT 100` axis at hero scale gives an editorial drop that the previous Playfair/Roboto Serif setup didn't.

## Memory and conversation persistence

- **`CLAUDE.md`** at repo root — project docs, loads every session, high-level patterns
- **`.claude/skills/*.md`** — focused domain playbooks, loads on-demand via description-matching
- **`~/.claude/projects/-Users-faculty-m-Documents-dev-datadiver/memory/MEMORY.md`** — cross-conversation project state index
- **`~/.claude/projects/.../memory/project_*.md`** — individual memory files pointed to by MEMORY.md

When in doubt about where to capture knowledge: architectural facts → CLAUDE.md, focused domain workflows → skills, evolving project state → memory files.

## ER-style sidebar row pattern (cross-view standard)

When a rail or sidebar row can be selected, the standard selection treatment is a **soft tint + ring**, NOT a cream-on-espresso inversion. This is the pattern established in EmergencyResponse and adopted in The Last 48's FlowRail:

```tsx
className={`
  py-2 px-3 rounded-lg transition-colors duration-150
  ${isSelected
    ? 'bg-ochre-500/10 ring-1 ring-ochre-500/30'
    : 'hover:bg-paper-100/30 dark:hover:bg-espresso-800/50'
  }
`}
```

The `bg-{pigment}-500/10` + `ring-1 ring-{pigment}-500/30` pattern adapts to any pigment. Use the dataset's own pigment (ochre for Last 48 FLOW, terracotta for emergency, etc.) so selection reinforces the dataset identity. For entity-focus rows (e.g. a focused candidate in the Elections precinct card), the ring/tint wear the ENTITY's own pigment as inline styles (`{hex}1a` / `0 0 0 1px {hex}4d`) so the highlight binds to what's on the map.

**Disfavored (standing rule, July 2026 — Elections was the last holdout, converted in PR #114):** `border-l-2` / inset-`boxShadow` side bars and blue/indigo selection tints. No edge-border highlights anywhere — the rounded ring is the one sanctioned margin, and active-state color stays in the warm family (`bg-ochre-500/15` + ink text for pills, per Last 48's LayerControls). Blue (indigo) survives only as metadata/navigation pigment, never as a selected/active state. Rounded rings also need `space-y-*` list containers, not `divide-y` — hairlines cutting a ring read as broken.

**When the cream-inversion is appropriate:** only for listbox-style components where strong contrast is required for accessibility (see "Listbox keyboard nav" below and the design-doc history). In most sidebar contexts the soft tint is sufficient and less visually jarring at the density DataDiver operates at.

## Listbox keyboard nav recipe

When a scroll-list needs keyboard navigation (e.g., FlowRail), implement it as a proper `listbox`:

```tsx
<div
  role="listbox"
  aria-label="48-hour event log"
  aria-activedescendant={selectedId ? `flow-row-${selectedId}` : undefined}
  tabIndex={0}
  onKeyDown={handleKeyDown}
  className="... focus-visible:ring-1 focus-visible:ring-ochre-500"
>
  {rows.map((row) => (
    <div
      key={row.id}
      id={`flow-row-${row.id}`}
      role="option"
      aria-selected={row.id === selectedId}
      onClick={() => onSelect(row)}
    >
      {/* row content */}
    </div>
  ))}
</div>
```

Keyboard handler covers `ArrowDown` / `ArrowUp` / `Home` / `End` / `Enter` (Enter is a no-op or confirmation, not required for selection since selection auto-updates on navigation) / `Escape`.

**Esc must be hoisted to page level.** Put an `Escape` listener on `document` in the parent mode component so Esc deselects regardless of what element currently has focus — this is critical when the user has clicked the map or somewhere else on the page.

Don't use `role="tab"` for a segmented control / mode toggle. `role="group"` + `aria-pressed` on each button is the correct ARIA pattern for a segmented control.

## AP-style date helper

DataDiver formats dates in AP style — the same convention used by SF print and broadcast journalism:

- Weekday abbreviated with period: `Mon.`, `Tue.`, `Wed.`, `Thu.`, `Fri.`, `Sat.`, `Sun.`
- Months with 5 or fewer letters **unabbreviated**: `March`, `April`, `May`, `June`, `July`
- Months with 6+ letters abbreviated with period: `Jan.`, `Feb.`, `Aug.`, `Sept.`, `Oct.`, `Nov.`, `Dec.`

Reference implementation: `AP_MONTH` lookup and `formatApDate` function in `src/views/Last48/detail/Last48EventCard.tsx`. Extract to `src/utils/format.ts` when a second consumer arises — don't duplicate.

## Sonar-ping emanation pattern

For indicating "this event/dot is selected and alive," use **two staggered concentric rings** scaling outward and fading — the sonar-ping / emanate pattern. This replaced the rotating radar-wedge approach, which reads as "scanning" rather than "here, alive."

The `@keyframes emanate` animation lives in `src/index.css`. Two rings share the same keyframe with a 0.95s stagger (second ring's `animation-delay`):

```tsx
// Two <circle> elements, same center, staggered animation
<circle
  cx="40" cy="40" r="10"
  className="origin-center"
  style={{
    transformBox: 'view-box',         // REQUIRED — see SVG transform-box note
    transformOrigin: 'center center',
    animation: 'emanate 1.9s ease-out infinite',
  }}
/>
<circle
  cx="40" cy="40" r="10"
  style={{
    transformBox: 'view-box',
    transformOrigin: 'center center',
    animation: 'emanate 1.9s ease-out 0.95s infinite',
  }}
/>
```

**`transform-box: view-box` is required** on SVG elements using `transform-origin` — without it, the origin references the element's own bounding box, not the SVG viewport, and the animation appears off-center. See `[[svg-transform-box-view-box]]`.

All emanation animations respect `motion-reduce:hidden` on the wrapper SVG.

## Tonal age ramp helpers

When encoding event age as dot color in FLOW mode, use the helpers in `src/views/Last48/modes/FlowMapLayer.tsx`:

**Stream pigment identity — `COLORS` in FlowMapLayer.tsx is the canonical source** (used by chips, rail, event cards, AND the digest email): 911 Realtime = indigo `#616a96`, Fire/EMS = terracotta `#b85a33`, 311 = moss `#7a9954`. Do NOT restate these from memory in specs/plans — a July 2026 email plan asserted 911 = terracotta and every review gate faithfully verified the wrong constant; only the designer's eye caught it.

- `LATENCY_BASELINE_MS` — per-dataset floor: 911 Realtime 30min, Fire/EMS 12h, 311 15h, etc. Subtract from raw age before bucketing. (The old "7h" figure for 911 was the SF-local timestamp bug's artifact — exactly the PDT offset; fixed PR #101.)
- `AGE_BUCKETS` — asymmetric `[0, 0.45, 0.60, 0.70]` t-values across 4 buckets. Heaviest tonal shift in the first 18h post-floor.
- `ageColor(datasetId, rawAgeMs)` — returns hex, fades toward `#d4c8a8` (paper anchor).
- `ageStrokeOpen(datasetId, rawAgeMs)` — same fade for open-event stroke color.

Do not calibrate against absolute age 0 — no SF dataset has events younger than its natural floor. Calibrating to the floor means the "freshest" tone actually appears on real data.

See also `[[sf-data-latency-baseline]]` and `[[tonal-age-ramp-pattern]]` for the editorial rationale.

## The tile-and-chart consistency self-check

**Before committing any new visualization**, verify that the chart's current-FY value matches the corresponding stat tile or text display. This is how the AIR Airport Commission timeline bug was caught in April 2026 — the tiles said `$863K` and the chart peaked at `$100K` because the hook only queried the tagged layer. Each piece was individually correct but together they told contradictory stories.

**Internal consistency is the primary QA for a journalism dashboard.** If two visualizations of the same entity disagree, one is lying, and the reader who notices is doing your QA work for you. Make that check before pushing.
