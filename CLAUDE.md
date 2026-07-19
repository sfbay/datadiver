# DataDiver — SF Civic Data Visualization Platform

## Philosophy

DataDiver is the Bloomberg Terminal of civic data — a real-time intelligence surface designed to show us stories before they are stories.

San Francisco publishes millions of records across dozens of datasets on data.sfgov.org — emergency response times, 311 complaints, crime reports, parking citations, traffic crashes — but raw data doesn't change minds or inform decisions. A journalist shouldn't have to write SQL to notice that response times in the Tenderloin spiked 40% year-over-year. A neighborhood advocate shouldn't need a CSV to see that 311 graffiti complaints in the Mission are 2σ above the 12-month baseline. The data is public. The insight should be too.

The project's core belief is that **public data should feel alive, not archival**. Every view answers a human question: *How fast do first responders reach my neighborhood? Where do parking tickets cluster? Are 311 complaints rising or falling?* The interface should reward curiosity — click a neighborhood, zoom into a block, compare this year to last year — and surface the anomalies, trends, and patterns that become tomorrow's headlines.

### Design Principles

- **Data density over decoration.** Every pixel should convey information. Glass-card overlays on maps, inline stat cards, sidebar rankings — the UI is a lens, not a frame. No empty states, no placeholder illustrations, no loading screens that hide the structure.
- **Progressive disclosure.** Show the map and layout immediately. Skeleton shimmer where data will appear. Stat cards fade in as queries resolve. The user never stares at a blank screen wondering if something is broken.
- **Server-side truth.** Never trust a client-side sample to represent a dataset. Use Socrata's `GROUP BY` and `SUM()` to get accurate totals. A meter that earned $39.68 should show $39.68, not $4.60 from a truncated sample.
- **Temporal context by default.** A number without a trend is a number without meaning. YoY deltas on stat cards, ghost prior-year bars on charts, z-score anomaly dots on neighborhoods — every metric earns context about whether it's normal.
- **The map is the hero.** For geospatial datasets, the map occupies the full viewport. Stat cards float on glass. The sidebar is a complement, not the main event. For non-spatial datasets (911 dispatch), charts take the hero role instead.
- **Respect the data's limits.** Some datasets have geo gaps (parking citations after Oct 2025). Some have date lag. `DataFreshnessAlert` detects this and offers a one-click fix rather than showing an empty, confusing view.

### Audience

Journalists, civic researchers, neighborhood advocates, and curious residents. People who want to understand their city through its data but don't want to write SQL or download CSVs. The tool should be shareable (URL-encoded state) and exportable (PNG screenshots).

## Aesthetic

DataDiver runs an **earth-tone visual system** — espresso (`#1e140d`) for dark mode, cream (`#f5ecd9`) for light mode, with pigment-named accents (terracotta, ochre, moss, dusty teal, brick, plum, indigo). The dark mode reads like a leather-bound field journal under a reading lamp; the light mode reads like newsprint or a vintage census report. **Source of truth: `src/styles/tokens.css` and the `@theme` block in `src/index.css`.** Light-mode primary **text** is `--color-ink` = `#4b3827` (warm paper-900 brown) — warmed from near-black `#1e140d` on July 13 2026 so ALL light-mode dark text (body, headlines, panel titles, big figures) reads as one warm brown; don't "fix" it back to espresso-900.

The previous "Bloomberg Terminal" cool slate-950 + signal-red/cyan/violet aesthetic was deliberately replaced. The new direction keeps the information density, the glass cards, the Mapbox dark basemap, and the editorial serif display face — but pulls DataDiver out of the "generic Claude analytics dashboard" visual cluster.

**Status (May 2026):** earth-tone refactor is complete end-to-end across 8 PRs (#9–#16). Every dot, halo, chip, card, fill, stroke, and gradient stop site-wide is on the unified palette — including the previously-exempt CityBudget compliance dashboard, which migrated in PR #15 with a non-default `sky → indigo` mapping to preserve its drill-down narrative (see Color palette commitment below). For future palette work, the grep pattern that catches all three CSS color forms (#hex, rgba channel, hsl) lives in `memory/feedback_palette_migration_grep.md`.

**Status (May 8–11 sprint):** PRs #19–#26 shipped a series of compounding improvements: citywide-true server-side stats for EmergencyResponse + the `useResponseEquity` hook rescue (PR #19); completed 41/41 SF neighborhood camera presets (PRs #20, #24); human-readable durations (`Mm Ss`) and CRT-correct radar sweep (PR #21); unified `<MapSidebar>` primitive with symmetric pill chevrons on both nav and context sidebars (PR #22); position-on-scale microvis + neighborhood drill heatmap + relocated ComparisonPopover (PR #23); demographic underlay legend + more prominent picker (PR #24); liquid Home layout inspired by Jesse's 2000-era LiquidEx pattern, translated to modern `clamp()` + `auto-fit` (PR #25); investigation-card top-alignment + map popup z-index hierarchy (PR #26).

### Pigment vocabulary

Each accent has a 400/500/600/700 ramp. Same dataset = same pigment across sidebar nav, viz card, on-map detail, and stat cards. The pigment palette + their semantic meanings:

| Pigment | Role |
|---|---|
| Terracotta `#b85a33` | Primary brand, emergency, alert |
| Ochre `#d4a435` | Warnings, money, ledger feel |
| Moss `#7a9954` | Success, business formation, civic upkeep |
| Dusty teal `#5c9693` | Info, Dana's color, civic-place |
| Brick `#963e30` | Critical, errors, crash severity |
| Indigo `#616a96` | Rare cool, civic ceremony, sensitive calls |
| Plum `#8b6282` | Campaign finance, agency routing |

The "signal" Tailwind tokens (`text-signal-red`, `bg-signal-cyan`, etc.) still exist as class names but resolve to earth-tone equivalents under the hood — no caller-side migration is required.

### Corner-glow signature

The unifying visual signature of the system is a **single diffuse, top-left-anchored blur** clipped to the element's bounds, driven by an inline `--glow` custom property. Reads like warm morning light leaking through a corner window — not an LED, not a gradient overlay.

Utility lives at the bottom of `src/index.css`:

```html
<div class="my-card glow-host" style="--glow: #b85a33">
  <div class="glow-corner"></div>
  ...
</div>
```

Sizes: `.is-sm` (80px, ticker cells), default (110px, stat cards), `.is-lg` (180px, viz cards). On cream surfaces opacity drops to ~0.4; on espresso ~0.55.

**Glow tiers — where to use it, where NOT** (overusing dilutes the signature):

- **Tier 1, always glows:** `<VizCard>`, `<StatCard>`, `<TickerCard>`, sidebar active nav item, hero, section heads, detail-view overlay panels.
- **Tier 2, subtle on interaction only:** `.btn-primary` hover, active date-preset chip, Dana ribbon hover.
- **Tier 3, HOLD THE LINE (no glow):** body copy / prose blocks, secondary/tertiary/icon buttons, inputs, dropdowns, modals, tooltips, popovers, tables, list rows, comic-panel thumbnails (image IS the color), every neutral `bg-raised` card with no dataset pigment. If a reviewer adds a glow to one of these, push back.

### Differentiators layered on top

To avoid looking like another generic dashboard, the system also enforces:

1. **Rule-leading micro labels** — `── EYEBROW` instead of floating caps
2. **Kraft-paper card edges** — warm umber shadow rather than cool glass
3. **Pull-quote margin notes** — italic editorial sidebars inside data views
4. **Oldstyle figures in body text**, lining tabular figures in data values
5. **Pigment naming** — `terracotta`, `ochre`, `moss` in code, not `red-500`
6. **Double-rule dividers** — newspaper-style section breaks
7. **Notched corners with accent tab** — see `<VizCard>`, the Home / Overview tile

## Stack
- **Vite + React 18 + TypeScript + Tailwind v4**
- **Mapbox GL JS v3** for maps (dark-v11 basemap, `preserveDrawingBuffer: true`)
- **D3.js** for charts (histograms, heatgrids, trend charts)
- **Zustand** for global state (`src/stores/appStore.ts`)
- **React Router** with URL param sync (`useUrlSync` hook)
- **Socrata SODA API** for all SF open data (no backend)

## Project Structure
```
src/
  api/           # Socrata client + dataset registry
  components/
    charts/      # D3 chart components (ResponseHistogram, HourlyHeatgrid, PeriodBreakdownChart, etc.)
    export/      # ExportButton (html2canvas-pro PNG — NOT html2canvas 1.x, which chokes on Tailwind v4 oklab; downloads via toBlob, never toDataURL)
    filters/     # DateRangePicker, CallTypeFilter, CategoryFilter, etc.
    layout/      # AppShell (sidebar nav + header)
    maps/        # MapView (Mapbox GL wrapper)
    ui/          # StatCard, Skeleton, DataFreshnessAlert, detail panels
  hooks/         # Data fetching + map interaction hooks
  stores/        # Zustand appStore
  types/         # TypeScript interfaces (datasets.ts, trends.ts)
  utils/         # Colors, time formatting, geo helpers
  views/         # 8 dataset views + Home + The Last 48 (nav 3) + The Pulse (anomaly wire, nav 4)
                 # Nav order (reordered July 13 2026): Overview · Alerts · The Last 48 · Pulse ·
                 #   Emergency Response · Crime Incidents · Traffic Safety · City Budget · …the rest
```

## Key Conventions

### Data Fetching
- All data comes from Socrata SODA API via `fetchDataset()` in `src/api/client.ts`
- `useDataset` hook wraps fetch with loading/error/refetch state
- **Aggregation queries**: `fetchDataset` auto-skips `defaultSort` when `$group` or aggregate functions (`SUM`, `COUNT`, `AVG`, `MIN`, `MAX`) are detected in `$select` — ordering by a non-selected field causes Socrata 400 errors
- Use **server-side aggregation** (`GROUP BY`, `SUM()`, `COUNT()`) over client-side aggregation of sampled rows — sampling produces inaccurate per-entity totals
- **DataSF datetimes are FLOATING SF-LOCAL strings** (no offset, no Z — `'2026-07-01T16:10:21.000'` means SF wall time). NEVER `Date.parse` them (reads host TZ — correct only on a Pacific laptop; the cron runs TZ=UTC) and NEVER build a `$where` cutoff from `toISOString()` (UTC digits start the window 7–8h late). Use `parseSfLocal()` / `sfLocalCutoff()` from `src/utils/sfTime.ts` — the bug this prevents skewed digest-email clocks by 7–8h and shrank every "last 48h" to ~41h (PR #101). Display of event times is pinned to `America/Los_Angeles` (`formatApTime`) — SF facts read on the SF clock for every viewer.
- Dataset config in `src/api/datasets.ts` — each has `id`, `endpoint`, `dateField`, `defaultSort`
- **Elections is NOT Socrata and precinct ids are NOT stable.** SF publishes zero election results to DataSF (boundaries only) — results are certified `sov.xlsx` (per precinct) / `dsov.xlsx` (per neighborhood) scraped from the `w`-suffixed archive at `sfelections.org/results/<dateCode>w/detail.html` (`p`-prefix = preliminary; unprefixed = certified final; sort drops by DATE, the pages are reverse-chronological). **SF renumbered precincts in the 2022 redistricting, so precinct 1101 in 2020 ≠ 1101 today** — the ids match as text and lie as geography, so a join succeeds, throws nothing, and renders a plausible WRONG map (validated: 4/27 neighborhoods reconcile). Pin every election to its era's boundary vintage (`prec_2012` ≤ Jun 2022, `prec_2022` after) and read neighborhood figures from `dsov` rather than deriving them from precincts (SF withholds small precincts from the precinct report — 1,215 voters in Nov 2024). The neighborhood *vocabulary* also changed in Nov 2022 (26 coarse names → the 41 Analysis Neighborhoods) and cannot be crosswalked upward. Full story + the 12 precincts with no geometry anywhere: `docs/data-insights.md` → Elections; design: `docs/superpowers/specs/2026-07-14-elections-real-results-design.md`.
- **Socrata schemas DRIFT — a `400 no-such-column` is usually not your typo.** DataSF silently removes columns. July 2026: `naic_code` / `naic_code_description` / `naics_code_descriptions_list` vanished from `g8m3-pdis`, 400'ing Business Search AND Business Activity together (shared field list). Ground truth is `https://data.sfgov.org/api/views/<id>/columns.json` — **never** a remembered schema. Business sectors are now RECONSTRUCTED from the surviving `self_reported_naics_code` by `src/utils/naicsSector.ts` (pure, unit-tested longest-prefix crosswalk; `sectorWhereClause()` builds server-side sector filters; sector aggregation groups on `substring(self_reported_naics_code,1,3)` + client rollup). Don't re-add the dead columns. Full story: `docs/data-insights.md`.

### Maps
- `MapView` calls `onMapReady` immediately (no waiting for Mapbox events)
- `useMapLayer` uses try-catch with setTimeout retry — the ONLY reliable pattern with Mapbox GL v3 + React
- Container sizing: use `w-full h-full` NOT `absolute inset-0` — Mapbox overrides position to relative
- Heatmap colors must be bright (cyan/red) on dark-v11 basemap — dark blues are invisible
- **Basemap labels are DELIBERATELY re-styled, not stock** (since July 13 2026). `softenBasemapLabels()` in `MapView` overwrites the stock dark-v11/light-v11 label paint on every `style.load`, per label GROUP × THEME (values baked in `LABEL_STYLES`): light mode warms all text to espresso `#2a1d13` @ 0.7 w/ thin crisp halos (light-v11 otherwise makes neighborhood labels lighter than street labels); dark mode uses cream text + espresso halo @ 0.6. Groups come from the shared `classifyLabelLayer()` (`src/components/maps/labelGroups.ts`) — place / road / other. Re-tune visually with **`?labeltune=1`** (dev overlay `MapLabelTuner`, sibling of `?debug=map` / `?tune=1`; read the values off it and bake into `LABEL_STYLES`). Do NOT assume stock label colors when reasoning about map legibility.
- **Dense full-coverage fills (choropleths) go BELOW the labels** — pass `{ belowLabels: true }` to `useMapLayer` (inserts each layer before the first symbol layer + re-enforces via `moveLayer` on the paint pass, so it survives HMR + theme swaps). A 0.7 fill added on top (the default, no `beforeId`) muddies every label into a hard-bordered smudge. Demographics uses this; its choropleth opacity is theme-aware (`isDarkMode ? 0.5 : 0.8` — the cream light-mode basemap washes a semi-transparent fill toward pastel, so light needs more).

### Mobile / responsive (PR #89, June 2026; effective-width since Large Type Phase 2, July 2026)
- Breakpoint is **EFFECTIVE 768px** — `innerWidth ÷ type-scale factor` (a 900px window under `large` IS mobile: 900/1.18 ≈ 763). JS source of truth: `useIsMobile()` / `isMobileViewport()` (`src/hooks/useIsMobile.ts`) via `effectiveViewportWidth()` in `src/hooks/effectiveViewport.ts` (leaf, node-tested). CSS follows the SAME source through the **`desk:` custom variant** (`html[data-vp="mobile"|"desk"]`, stamped by `syncViewportMode()` at appStore eval + setTypeScale + App.tsx resize listener) — **`md:` is banned in app code; write `desk:`** (media queries can't read attributes, which is why the variant exists). `sm:/lg:/xl:/2xl:` remain physical-px cosmetics. MapSidebar's narrow check (1024) is also effective-width. Below md: AppShell nav → off-canvas drawer; `MapSidebar`/`NeighborhoodSidebar` → draggable bottom **sheets** (`useDraggableSheet`, snaps peek/glimpse/half/full); detail panels (`DetailPanelShell`) stay **top-right cards** (NOT sheets) — narrow them via the `mobileCompact` prop.
- **`useDraggableSheet` sheets render at FULL height + `translateY` (cheap GPU resize)**, so the browser's scrollport is the whole, mostly-off-screen sheet. `scrollIntoView` and `position:sticky bottom-0` MISBEHAVE — scroll a selected row into view with manual `getBoundingClientRect` math (see `FlowRail`), and know sticky footers only show when the sheet is expanded. The mobile sheet bg must match the content register (`paper-50 dark:bg-espresso-900`), not slate, or it seams against earth-tone content.
- Touch: suppress Mapbox hover tooltips via `matchMedia('(hover:none)')` (NOT a width check — a tablet+mouse keeps hover). `eventFlyToOffset` is horizontal on all viewports — a panel's render and its camera offset are coupled; change both together. Full system: the `mobile-shell` memory + `docs/superpowers/specs/2026-06-15-targeted-mobile-shell-design.md`.

### Large Type mode (Phases 1–2, July 2026)
- `typeScale: 'default' | 'large' | 'xl'` in `appStore` (localStorage key `dd-type-scale`; pure parse + `SCALE_FACTORS` {1, 1.18, 1.33} in `src/stores/typeScale.ts` — a leaf module because appStore itself is unimportable under the node-only Vitest; a test pins SCALE_FACTORS to the CSS). Applied as `data-type-scale` on `<html>` at appStore **module eval** (kills the stored-pref first-paint flash), in `setTypeScale`, AND an `App.tsx` effect; `html[data-type-scale]` rules in `index.css` — large = 118%, xl = 133%. The control is a **Default/Large/XL segmented radiogroup slider** beside the dark-mode toggle (expanded rail); the collapsed rail gets a cycle button.
- **Phase 2 (shipped July 18 2026): the micro-type token scale.** `text-nano` (9px) / `text-micro` (10px) / `text-label` (11px) utilities live in the `@theme` block of `index.css` (moved OUT of tokens.css — Tailwind v4 only generates `text-*` utilities from `--text-*` inside `@theme`; deliberately NO `--text-*--line-height` companions so they emit font-size only). All 850 former `text-[9|10|11px]` sites use them; **never write `text-[9px]`-style micro sizes again — use the tokens.** A shared `html[data-type-scale="large"], [data-type-scale="xl"]` block raises the floor disproportionately (nano→0.625rem, micro→0.6875rem, label→0.75rem base — micro reads ≈13px under large, ≈14.6px under xl). Text-bearing fixed `w-[Npx]` containers were rem-normalized (N/16); decorative geometry (5px rails, 34px notch tabs, page wrappers) stays px.
- Phase 3 (D3 SVG `font-size` attrs, Mapbox label `text-size`, `.datadiver-tooltip`) is still specced-only — at xl a D3 value label can clip its card edge (card padding grows, SVG layout doesn't); that's the Phase 3 motivator, spec `docs/superpowers/specs/2026-07-18-large-type-edition-design.md`.

### Loading States
- **Progressive skeleton loading** — no full-screen blockers
- Each component shows its own skeleton via `src/components/ui/Skeleton.tsx`
- Map area: `MapLoadingIndicator` (corner pill, not overlay)
- Stat cards: `SkeletonStatCards` in the same absolute position
- Sidebar: `SkeletonSidebarRows`, `SkeletonBreakdownList`
- Charts: `SkeletonChart`

### Trend Infrastructure
- `useTrendBaseline` hook fires 3-5 parallel Socrata queries for YoY comparison, z-score baseline, sub-period breakdown
- **YoY windows are MAX-anchored matched windows** (July 2026, honesty-hardening): the hook probes `MAX(dateField)` first, clamps the current window's end to the data's real edge (`effectiveEnd`), and shifts the CLAMPED window back a year — never reintroduce a naive `yearAgo(dateRange.end)` shift, which fabricates YoY declines on lagged datasets (Vision Zero publishes ~4–6wk behind). Result exposes `effectiveEnd`/`truncatedDays`; TrafficSafety discloses the clamp in a card subtitle. The optional `granularity` override is guarded: a daily/weekly override on a >500-day range is DISCARDED (falls back to auto-detect) because day-bucketed queries carry `$limit: 500` and would silently drop the newest days; ParkingRevenue's pills disable with a title in that state.
- Comparison hooks (`useComparisonDataFactory`) **suppress deltas + trends when either side hit the 5K row cap** (`suppressed` flag; views pass their `hitLimit` as the 5th arg) — a capped DESC sample is the newest slice, not the range, so a delta from it is plausible and wrong. One card per view explains: "Compare needs a narrower date range."
- **Compare is date-anchored** (July 2026): `appStore.comparisonMode` is a union — presets (`prev/30d/90d/180d/1yr`) re-resolve when the range moves (`1yr` = same calendar day last year, leap-aware; the old 360-day shift was a bug), pinned `{ kind: 'date' }` stays put. Resolution/labels/URL all live in `src/utils/comparisonMode.ts` (pure, tested); URL `?compare=1yr|YYYY-MM-DD` with legacy numeric params auto-migrating. Card labels are concrete AP-style dates ("vs July 4, 2025") via `comparisonLabel` — never reintroduce offset labels ("vs 1yr ago").
- `PeriodBreakdownChart` renders D3 bars with ghost prior-year series
- `StatCard` accepts optional `yoyDelta` and `zScore` props
- `useDataFreshness` detects stale date ranges via `MAX(dateField)`, `DataFreshnessAlert` offers auto-adjust; with a `geoField` option it also derives `hasGeoInRange`/`suggestedGeoRange`, and the alert has a dismissible `mode="geo-gap"` variant (ParkingCitations: coords end ~Oct 2025 while rows keep publishing — stat cards stay server-true and RENDER in the gap; the CardTray gates on `totalCount`, not the geo sample)

### Views inventory

- **The Pulse** (`/pulse`, nav position 4 since the July 13 2026 nav reorder — Overview · Alerts · Last 48 · Pulse; **nav label is now "Pulse"**, the article dropped July 13 2026, though the masthead stays "Trending now in San Francisco"; PR #98, June 30 2026): a ranked plain-English wire of what stands out right now in SF (reader-facing copy since July 2 2026: masthead "Trending now in San Francisco", nav description "Trending now in S.F.", teaser link "See everything trending →") — the tool→publication answer to "another map that doesn't surface storylines." A WRITING layer (`src/lib/pulse/pulsePhrase.ts`, pure + Vitest-tested — a test FAILS the build if σ/z-score/baseline/YoY reaches reader-facing text) over the EXISTING z-score engine (`useAnomalyBaseline` per-neighborhood volume + `useCivicIndicators` citywide); NO new detection, just translation + framing. Ticket-stub cards (place stub + feed-coloured big-number anchor + a deviation bar off `ratio`=current÷typical; the bar's reading is a solid 14px datum marker w/ pale core against a DOTTED "usual" tick — reference dotted, datum solid — plus a finite ratio-staggered radar ping, `datumPing` in index.css), ONE colour per feed (911/Fire-EMS/311/citywide), direction via the arrow + the bar's position (NOT a second colour). Freshness-gated — "quiet" is suppressed unless the stream is current (the Quakebot / "-100%" trap). Home carries a cheap `PulseTeaser` (reuses Home's already-fetched indicators — do NOT add a 2nd `useCivicIndicators` call, it isn't single-flighted). Files `src/views/Pulse/{Pulse,WireCard,DeviationBar,SignalGlyph,usePulseWire}`; design rationale in memory `pulse-architecture` + `pulse-card-design`. The Last48 anomaly choropleth was reworked into this wire's EVIDENCE VIEW in PRs #108/#110 (July 2026) — see the Last 48 entry below.
- **The Last 48** (`/live`, nav position 3 since the July 13 2026 nav reorder; legacy `/live-feeds` redirects → `/live` preserving query/hash, so old `?event=` shares survive): comprehensive surface for SF's freshest civic data. The route carries NO global date params — `useUrlSync` strips `start/end/tod/compare` on `/live` (fixed 48h window) while leaving Last 48's own params (`?event=`, `?ambient=`, `?points=`, `?nh=`, `?tune=`). Two display modes: **FLOW** (animated event dots; the header toggle is labelled **DOTS** — it shows/hides the dots; ~6000 events in 48h window) and the **anomaly** choropleth (fill-picker label **"Pulse"** since PR #111 — a DISPLAY label only: the internal fill id and the `?fill=anomaly` URL param are the Pulse evidence-link contract, do NOT rename them; formerly "HOTSPOTS"; reworked in PRs #108/#110, July 2026, as the evidence view Pulse cards land on): a CONTINUOUS diverging ramp (dusty teal quiet ↔ transparent at typical ↔ ochre→terracotta→brick busy) with FIXED z stops consonant with the Pulse tiers (1.5/1.9/2.6 — change one, change both), driven by a **Stouffer combine** (`Σz/√k`, `anomalyRamp.combineZ` — NOT an arithmetic mean, which shrank the spread 1/√k and caused the old "near-flat" look; paint + math had to move together). One stops array derives both the Mapbox expression and `AnomalyLegend`'s CSS gradient (can't drift). Selected neighborhood gets a theme-aware ring + opacity lift; AnomalyRail/peek speak dejargoned tier words via `pulsePhrase.combinedDeviation` (words for the combined score, concrete counts per stream — a combined z has no single count/baseline behind it). The 2026-07-02 ramp study's losers are documented in `anomalyRamp.ts`: low "underlay-register" opacity only works UNDER dots, and warm-only ramps are invisible on a typical afternoon — the quiet side carries the map's texture. Three editorial streams: 911 Realtime, Fire/EMS, 311 Cases. (Originally also offered opt-in Tier 2 datasets — Police, Parking Revenue, 911 Historical — but they didn't earn their place: Police has ~39h lag, Parking is rate-shaped not event-shaped, 911 Historical duplicates the lifecycle-aware Realtime feed. Retired in the "retire Tier 2" PR.) The brand line "The Last 48" is editorial — public data publishes with intrinsic lag (no SF dataset is truly real-time), and the name names that honestly. See `docs/superpowers/specs/2026-05-12-last-48-design.md` for the design rationale; `docs/superpowers/specs/2026-05-13-last-48-flow-polish-design.md` for the visual stance ("civic observatory" — calm wall-display register, sparse motion). Phase 2.5b polish complete in PRs #34–#39; Phase 3 architectural polish (useMapLayer cleanup, pin-out-of-sequence row, priority-A halo, composable layers, progressive boot/loading) in PRs #41–#47; super-chip row + publish-lag sparklines + 311 image + demographic-underlay park exclusion + hatch idiom in PRs #48–#51; two-register arrival sheen on super-chips (quiet loading shimmer vs bold streaming beacon, settled by the sweep via onSweepPhase) in PR #74; ambient mode + scanner-strip Broadcastify links + event-centering camera offset in PRs #81–#87; blip/recenter fixes + AUTO/DOTS relabel + north-axis pendulum + `/live` URL in PR #88. **AUTO** (header pill — labelled "AUTO" to users; internal name still "drift"/ambient; sits in the control row **underlay · DOTS · AUTO**) is an ambient idle behavior that auto-walks the freshest events (selecting in the rail, opening the real detail card, flying point-to-point, dwelling) until any user input stops it; `?ambient=stroll|drift|sweep` (or `?ambient=1`), `?tune=1` reveals a dev slider panel, hidden entirely under reduced-motion. The AUTO pill is a green/red traffic-light: green dot + pulseGlow while touring, solid red dot when idle/booting (one dot in every state → constant width). The orbit is a **sine pendulum across the north axis** (±90° W↔N↔E, eased reversals) — NOT a full 360° spin, which put SOUTH at the top of the pitched map and disoriented (math in `ambient/orbit.ts`; `pace.orbitDegPerS` = time-AVERAGE sweep speed, peak ×π/2). Camera uses native `map.flyTo` for flights (van Wijk natively) + manual RAF for bearing-only holds pinned via Mapbox `padding` — do NOT reintroduce a hand-rolled flight path (`flightPath.ts` was built then deleted; the judder was frame-pacing, not path shape). Two camera-correctness fixes worth knowing before touching ambient: the tour is **single-flight** (a genRef generation guard + wall-clock `dueWaitMs` gate) so overlapping/throttle-burst loops can't flicker the card; and the **DeepLinkLander bails while `ambientOn`** (its `?event=` is output, and the lander's `setSearchParams` otherwise races/clobbers the director — see [[react-router-redirect-clobber]]). Files in `src/views/Last48/ambient/`; spec `docs/superpowers/specs/2026-06-12-last48-ambient-drift-design.md`. AUTO realized what the old design called "Mode: KIOSK" (Phase 4) as a simpler idle behavior. The header **ScannerStrip** (`chrome/ScannerStrip.tsx`) links to Broadcastify SF Fire/EMS (feed 6336) + Police (46180) in new tabs ONLY — Broadcastify TOS restricts embedded players to feed owners.
- **EmergencyResponse**: Fire/EMS heatmap, response time stats, histogram, neighborhood breakdown
- **ParkingRevenue**: Cyan heatmap (server-side per-meter aggregation), payment methods, neighborhoods
- **Dispatch911**: Chart-centric (no map), sensitive call patterns, call type filter
- **Cases311**: Heatmap + anomaly choropleth, category filter with quick groups, resolution histogram
- **CrimeIncidents**: Red heatmap, category filter (violent/property/QoL), 911 cross-ref via cad_number
- **ParkingCitations**: Orange heatmap, dual WHERE (mapWhere with geo, statsWhere without)
- **TrafficSafety**: Crash heatmap/anomaly, severity breakdown, speed camera overlay
- **Home**: Hero (masthead-style credit is a mailto to the support address jesse@jlabsf.org, subject "[DataDiver] Inquiry"; /about stays reachable via nav + moss health pill, real fetch timestamp, navigates to /live on click) + newsletter/Dana 2:1 liquid row (`@container`-queried comic tile w/ espresso veil, dark mode only) + six investigation preview cards (InvestigationCard shell: destination-pigment corner glow top-left + VizCard notch tab top-right; incl. Last48Pulse seeded from summaryStore and VisionZeroCounter with matched-window YoY) + a **Pulse teaser** (`PulseTeaser`, above the Visualizations grid — top citywide signals as ticket-stub-body cards driving to `/pulse`) + exploration cards
- **Elections** (`/elections`, indigo pigment): SF election results, RCV rounds/Sankey, ballot-measure explorer, Time Machine timeline. Data = static JSON (NOT Socrata — see the Data Fetching bullet above): citywide `summary.json` from the legacy XML pipeline + certified precinct/neighborhood files from `scripts/build-election-results.mjs` (reconciliation-gated; sources gitignored, refetch via `scripts/fetch-election-sources.mjs`). The map is a real precinct choropleth (leader hue × 4 RACE-RELATIVE quartile steps of lead strength — absolute cutpoints flattened lopsided races like Biden 85%, don't revert; props on the measureColor diverging ramp; turnout/margin modes; click a candidate in the legend or precinct panel for a single-hue support ramp, `?candidate=`, suspended during Time Machine) with an era-correct neighborhood frame — geometry + vocabulary swap across the 2022 redistricting break (prec_2012+legacy26 ↔ prec_2022+analysis41), crossfaded in Time Machine. Paint/join are pure + Vitest-tested (`src/views/Elections/map/precinctPaint|precinctJoin`); vote keys carry "\n(PARTY)" suffixes AND presidential tickets join with " / " or " AND " depending on election — every name join goes through `cleanCandidateName()`, every surname display through `leaderDisplayName()`. Geometry features with no data stay UNPAINTED on purpose (13 in 2024; 414 in the consolidated Nov 2025 special) — the CoverageChip explains gaps from `_turnout` data, never hardcoded. Precinct click → `?precinct=` + DetailPanelShell; neighborhood selection via sidebar (mutually exclusive). Era geometry vendored by `scripts/build-precinct-geometry.py` (gates fail loudly). **RCV round files are named by race id** (`rcv/district-attorney.json`, NOT SF's URL slugs `da`/`d1` — the July 2026 honesty audit found 9 of 11 races silently 404ing AND wrong `isWinner` flags on D1/D5/D11 from the generator's fuzzy slug→race matching; `rcvFiles.test.ts` pins the contract, treasurer is a pinned known-missing, rounds exist for Nov 2024 only). **Selection states use the Last 48 idiom** (July 2026): rounded-lg + ochre-500/10 tint + 1px ochre-500/30 ring for selected rows, `bg-ochre-500/15` + ink text for active pills, focused candidate rows in the candidate's OWN pigment (tint+ring, no inset side bar) — indigo remains ONLY as metadata/navigation pigment (RCV badges, certified chips, links, spinners); never reintroduce blue selection states or `border-l` side bars. UI spec: `docs/superpowers/specs/2026-07-14-elections-ui-design.md`. **RCV rounds chart reworked July 18 2026 (PR #127)**: stable roster (one permanent row per candidate, round-1 order, constant panel size — click zones never move), flow ribbons + donor-color transfer segments derived from round deltas, keyboard arrow stepping, persistent fixed-height callout. CRITICAL data semantics: a round's `isEliminated` flag describes the NEXT round's removal — transfers INTO a round come from the PREVIOUS round's flags (`rcvFlow.ts` `computeRoundTransfers`, conservation-pinned by tests; full story data-insights.md → Elections). Spec: `2026-07-18-rcv-flow-animation-design.md`.
- **About** (`/about`, nav bottom, paper pigment): authorship + AI disclosure (top-line credit is Jesse's alone, academic convention; Claude's role disclosed specifically), detailed stack table, sources table (~23 rows: DataSF-linked IDs + the non-DataSF sfelections.org row) + known limitations, public distillation of docs/data-insights.md findings, Resolution 240210 methodology case study. Static editorial page — keep in sync with datasets.ts and data-insights.md when those change.

### Views Pattern
Each view follows the same structure:
1. `useDataset` for raw data (map points)
2. Server-side aggregation queries for accurate stats
3. `useDataFreshness` + `DataFreshnessAlert`
4. `useTrendBaseline` for YoY/z-score
5. Map-centric (MapView + sidebar) or chart-centric (Dispatch911)
6. Skeleton loading per component zone

### Compliance data model (Resolution 240210)
The Advertising & Media tab has a dense architectural story worth preserving. **Three-layer ad detection** is the foundational pattern:
- **Tagged** (`sub_object = 'Advertising'`) — direct department ad placements
- **Agency** (vendor matches registry AND `sub_object != 'Advertising'`) — agency-managed media buying, opaque
- **P-card** (`vendor LIKE '%P-CARD%' AND sub_object = 'Advertising'`) — untraceable purchases

**P-card rows appear in BOTH tagged and p-card queries** — always deduplicate via `vendor + fiscal_year` keys or exclude `%P-CARD%` from the tagged query. Any department-level or category-level time series MUST query all three layers and sum; tagged-only queries produce wildly misleading totals for agency-heavy departments like AIR Airport Commission (99% agency-routed).

**Compliance basis** = discretionary = tagged minus legal notices. Target: ≥50% of discretionary → community/ethnic media outlets. The agency registry is currently duplicated across `useAdvertisingData.ts`, `useComplianceData.ts`, and `useEntityTimeline.ts` — should be lifted to `mediaClassification.ts` as an exported `AGENCY_VENDOR_LIKE` constant.

**See `.claude/skills/datadiver-compliance.md`** for the full compliance dashboard knowledge base — color palette reservations, trapezoid gradient technique, stakeholder context (Maya, Resolution 240210 effective FY2024-25), department rail tab semantics, and the tile-and-chart consistency self-check.

### Color palette commitment (drill-down hierarchy)

The compliance dashboard and related views enforce **reserved color semantics** in the earth-tone palette. Same concept = same color everywhere:

| Concept | Pigment | Hex |
|---|---|---|
| Agencies (full-service agency) | Plum-500 | `#8b6282` |
| Direct ad placements | Indigo-500 | `#616a96` |
| Discretionary (compliance basis) | Teal-500 | `#5c9693` |
| Community media (goal + actual + target line) | Moss-500 | `#7a9954` |
| Legal notices (excluded) | Paper-500 | `#a8926a` |
| P-card (untraceable) | Brick-500 | `#b85545` |
| Warning / below-target | Ochre-500 | `#d4a435` |

The visual progression **plum → indigo → teal → moss** is the narrative of narrowing scope (purple-cool → cool → info → growth). The non-default mapping that preserves this story: **sky → indigo** (NOT teal — would collide with Discretionary). All other compliance accents use the standard earth-tone migration map.

Don't introduce collisions — `full-service-agency` in `MEDIA_CATEGORIES` is plum (matches Agencies layer), and `out-of-home` is brick-400 (kept warm, doesn't compete with the cool drill-down tier).

### SVG gradient pattern for adjacent semi-transparent shapes
When two semi-transparent shapes meet at a 1-pixel boundary (e.g., compliance card bar meeting trapezoid connector), alpha compositing produces a brighter line at the overlap. **Fix**: fade to zero alpha at the exact overlap edge. Safe gradient shape:
```
0%   → rgba(color, 0)     // overlap pixel transparent, no compound
5%   → rgba(color, 0.22)  // sharp rise in ~2 pixels
100% → rgba(color, 0)     // linear fade to zero over remaining height
```
**Alpha-only fades** (constant hue, varying alpha) work in both light and dark modes. Fading to a specific dark color introduces a visible smudge in light mode. Used in `CityBudget.tsx` trapezoid connectors — see also `.claude/skills/datadiver-compliance.md`.

### Z-index hierarchy

Layer stack on map views, ascending (documented inline in `src/index.css` next to the `.mapboxgl-popup` rule):

| Layer | z-index | Notes |
|---|---|---|
| Map basemap (Mapbox canvas) | auto | |
| MapView gradient overlays (top/bottom) | `z-[1]` | Subtle gradients on `MapView` for legibility |
| MapView children container | `z-[2]` | Where view-specific stat-card overlays + `UnderlayLegend` live |
| `<CardTray>` (stat cards + pill bar) | `z-10` | The visible stat card overlay |
| `.mapboxgl-popup` (hover details) | `z-15` | Lifted above CardTray; raised from default by global rule in `index.css` |
| Page header (compact title bar) | `z-20` | Each view's `<header>` was bumped from `z-10` in PR #23 so dropdowns opened from the header (UnderlayPicker) escape the ticker row's stacking context (the Compare popover has since moved into CardTray's pill bar) |
| Detail panels (`IncidentDetailPanel` etc.) | `z-30` | Slide-in panels above all map layers |
| Modal overlays (`OmniSearch`, comic) | `z-50+` | Full-screen modal layer |

Reasoning: numbering close to neighbors forces explicit hierarchy thinking. Avoid jumping to `z-999` — if a popup needs that, the conflict is somewhere else.

**Deferred audit**: extract these into a central `src/utils/zIndex.ts` constants module so values are self-documenting. Tracked but not urgent.

### Liquid layout (Home page)

Inspired by [Jesse's `LiquidEx c.2000`](https://web.archive.org/web/20000815052829/http://www.examiner.com/) — proportion-based design that flows continuously to any viewport without breakpoints — translated to modern CSS via `clamp()` and `auto-fit`.

Patterns in use on `src/views/Home/Home.tsx`:

- **Wrapper width**: `max-w-[1800px]` + `px-[clamp(16px,3vw,64px)]`. Page flows from mobile to ~1800px ultrawide without snapping.
- **Hero typography**: `fontSize: clamp(2.75rem, 5vw + 1rem, 7rem)`. Headline scales continuously.
- **Hero min-height**: `clamp(0px, 30vw, 600px)` + `flex flex-col justify-center` so the hero card grows cinematic on wide displays without empty-space awkwardness.
- **Visualizations grid**: `grid-cols-[repeat(auto-fit,minmax(460px,1fr))]`. Cards reflow 1 → 2 → 3 → 4 columns smoothly.
- **Explorations grid**: `grid-cols-[repeat(auto-fit,minmax(220px,1fr))]`. Same pattern, tighter minmax.

When adding new sections to Home, prefer `clamp` + `auto-fit` over breakpoint-based classes (`desk:`, `lg:`, `xl:`). The whole point of liquid is *no* breakpoints.

### Neighborhood-vs-citywide comparison framing

**When a user selects a neighborhood on a map view**, the editorial decision is **keep citywide as the canvas, layer the neighborhood as comparison context** — NOT drill the entire view down to one neighborhood.

This means:
- **Heatmap**: drills to the selected neighborhood (per-neighborhood query is uncapped since the 5K limit doesn't bite at neighborhood scale).
- **Stat cards (Avg, Incidents)**: swap to the neighborhood's value AND render a `<PositionScale>` microvis showing where the neighborhood sits on the citywide gap. Reference tick = citywide avg.
- **Sidebar ranking, histogram, citywide stats queries**: stay UNFILTERED. They're the comparison frame.

Implemented on `EmergencyResponse` in PR #23. Pattern is reusable: Cases311, Crime, Citations, TrafficSafety could adopt the same comparison framing in follow-up work (the `<PositionScale>` primitive at `src/components/charts/PositionScale.tsx` is dataset-agnostic).

The editorial argument: a number alone is meaningless; a number's *position on a scale* is a story. Clicking "Visitacion Valley" should light up "this is the slowest-response neighborhood by 30%", not just show 14m 32s in isolation.

### Tonal age ramp + per-dataset latency baseline

For map dots encoding age in a multi-stream visualization (introduced in The Last 48 FLOW), each dataset's pigment fades toward a paper anchor (`#d4c8a8`) in 4 discrete buckets across its delivery window. The bucket boundaries are NOT measured from absolute age (which rarely includes the "fresh" tone — most SF datasets publish events hours old). Instead, subtract a per-dataset `LATENCY_BASELINE_MS` from raw age before bucketing — the fresh tone is reserved for events at each dataset's natural floor.

Helpers live in `src/views/Last48/modes/FlowMapLayer.tsx`:
- `LATENCY_BASELINE_MS`: per-dataset offset (911 Realtime 30min, Fire/EMS 12h, 311 15h). The original 7h figure for 911 was a measurement artifact of the SF-local-vs-UTC timestamp bug (below) — exactly the PDT offset.
- `AGE_BUCKETS`: asymmetric curve `[0, 0.45, 0.60, 0.70]` over 4 buckets (heaviest tonal motion in the first 18h post-floor)
- `mixHex(a, b, t)`, `ageColor(datasetId, rawAgeMs)`, `ageStrokeOpen(datasetId, rawAgeMs)`

Editorial framing: tone = stream-relative recency ("as fresh as this dataset gets"); the row's timestamp in the rail communicates absolute clock time. The two signals reinforce, don't contradict.

### Detail panel pattern: click-driven, top-right corner, DetailPanelShell

All map-based detail panels in DataDiver use `src/components/ui/DetailPanelShell` — top-right anchored (`absolute top-5 right-5`), slide-in-from-right animation, max-h-[80vh], corner-glow with dataset pigment color, X close button. Selection is click-driven (no hover-dwell — tried and abandoned in Phase 2.5b for The Last 48). The hover-to-show pattern doesn't translate cleanly to mobile and added complexity without clear value.

Wrap dataset-specific body content inside DetailPanelShell. See `Last48EventCard.tsx`, `IncidentDetailPanel.tsx`, `CaseDetailPanel.tsx` for examples.

## Deployment
- **Vercel** auto-deploys from `main` branch
- Production domain: **https://datadiver.jlabsf.org** (since June 2026; `datadiver.jlab-sf.org` 308-redirects to it — never delete the old domain from Vercel, old email links depend on it)
- Env vars: set via the **Vercel dashboard only** — `vercel env add` has silently dropped values. Sensitive-type vars (the alerts backend secrets) are write-only: the edit box shows EMPTY on re-open (normal, not data loss — but never re-save while empty), `vercel env pull` returns `""` for them, and the only ground truth for a value is deployed behavior. Client-side: `VITE_MAPBOX_TOKEN`, `VITE_SOCRATA_APP_TOKEN`; alerts backend vars are tabled in `docs/geo-newsletters-runbook.md`
- SPA routing: `vercel.json` has `rewrites` for `/(.*) → /index.html`
- Build: `pnpm build` → `tsc -b && vite build`
- Dev: `pnpm dev` (port 5174)
- **`tsc -b` is stricter than `tsc --noEmit`** — Vercel's build runs `tsc -b` which catches issues the local `--noEmit` pass doesn't (unused parameters, some Mapbox type assertions). Always run `npx tsc -b` before pushing to avoid failed deploys. Underscore-prefix unused parameters (`_onBack`) to silence strict mode without losing the signature.

## Fonts

All three self-hosted via Fontsource (npm), imported in `src/main.tsx`; Vite fingerprints + serves the woff2 same-origin (no Google Fonts CDN — removed June 2026 for privacy + to drop two render-blocking third-party origins). The two variable families register under their Fontsource names — `"Fraunces Variable"` / `"Roboto Serif Variable"` (Space Mono is static, keeps `"Space Mono"`); the `--font-*` tokens in `src/styles/tokens.css` + the `@theme` block in `src/index.css` reference those names. Use the `full.css` Fontsource entry for the variable families — it carries the `opsz` axis (single-axis files drop it and break optical sizing). A guard test (`src/styles/font-hosting.test.ts`) fails if a Google Fonts origin reappears.

- **Fraunces** — display face, headlines, hero. Variable axis `opsz 9..144`, `SOFT 0..100`. Italic at hero scale; upright at card titles. Replaces the older Instrument Serif / Roboto Serif display role with a higher-stylistic-contrast italic. Class: `.font-display`.
- **Roboto Serif** — body. Variable axis `opsz 8..144`, weights 300–700. Oldstyle figures (`font-feature-settings: "onum"`) in prose; lining tabular figures (`"tnum","lnum"`) in data values.
- **Space Mono** — mono labels, data values, eyebrows, timestamps, coordinates. Has real italics. Class: `.font-mono`.

Tracking is tight (`-0.02em` to `-0.04em`) on display, heavy (`+0.25em` uppercase) on micro labels.
