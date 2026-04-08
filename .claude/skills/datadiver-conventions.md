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

**Dark/light mode colors inside charts**: read `isDarkMode` from `useAppStore` and branch accordingly:
```tsx
const textColor = isDarkMode ? '#94a3b8' : '#64748b'
const gridColor = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'
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

Beyond the compliance dashboard palette documented in `datadiver-compliance` skill, these colors recur across the project:

- **Sky `#0ea5e9`** — default chart accent, "active" state, primary data color
- **Emerald `#10b981`** — positive / good / community media
- **Red `#ef4444`** — negative / warning / p-card / crimes
- **Amber `#f59e0b`** — caution / below-target / flag / pending
- **Purple `#7c3aed`** — demographics accent, census data, agencies (when in compliance context)
- **Slate family** — neutral / excluded / muted / borders

**Dark-v11 heatmap colors must be bright** — as noted in the Mapbox section, dark blues/purples are invisible on the dark basemap. Use cyan, red, emerald, or amber for heatmaps.

## Fonts

- **Playfair Display** — headlines, italic `.font-display` (H1/H2 titles on detail pages)
- **Inter** — body text
- **JetBrains Mono** — data values, `.font-mono` (numbers, tabular info, labels)

**Italic display font for main titles**: the `font-display text-Nxl italic` pattern signals "this is a content subject" (department name, vendor name, neighborhood name). Used on drill-down page H2s.

## Memory and conversation persistence

- **`CLAUDE.md`** at repo root — project docs, loads every session, high-level patterns
- **`.claude/skills/*.md`** — focused domain playbooks, loads on-demand via description-matching
- **`~/.claude/projects/-Users-faculty-m-Documents-dev-datadiver/memory/MEMORY.md`** — cross-conversation project state index
- **`~/.claude/projects/.../memory/project_*.md`** — individual memory files pointed to by MEMORY.md

When in doubt about where to capture knowledge: architectural facts → CLAUDE.md, focused domain workflows → skills, evolving project state → memory files.

## The tile-and-chart consistency self-check

**Before committing any new visualization**, verify that the chart's current-FY value matches the corresponding stat tile or text display. This is how the AIR Airport Commission timeline bug was caught in April 2026 — the tiles said `$863K` and the chart peaked at `$100K` because the hook only queried the tagged layer. Each piece was individually correct but together they told contradictory stories.

**Internal consistency is the primary QA for a journalism dashboard.** If two visualizations of the same entity disagree, one is lying, and the reader who notices is doing your QA work for you. Make that check before pushing.
