# DataDiver — Project Status

**Last updated:** 2026-06-15
**Live site:** datadiver.jlabsf.org
**Repo:** github.com/sfbay/datadiver

---

## Views (15 total)

| View | Route | Status | Accent |
|------|-------|--------|--------|
| Overview / Home | `/` | ✅ Live | — |
| Emergency Response | `/emergency-response` | ✅ Live | #ff4d4d |
| Parking Revenue | `/parking-revenue` | ✅ Live | #60a5fa |
| 911 Dispatch | `/dispatch-911` | ✅ Live | #a78bfa |
| 311 Cases | `/311-cases` | ✅ Live | #10b981 |
| Crime Incidents | `/crime-incidents` | ✅ Live | #ef4444 |
| Parking Citations | `/parking-citations` | ✅ Live | #f97316 |
| Traffic Safety | `/traffic-safety` | ✅ Live | #dc2626 |
| Business Activity | `/business-activity` | ✅ Live | #10b981 |
| Campaign Finance | `/campaign-finance` | ✅ Live | #14b8a6 |
| Demographics | `/demographics` | ✅ Live | #7c3aed |
| City Budget | `/city-budget` | ✅ Live | #0ea5e9 |
| Elections | `/elections` | ✅ Live (Chunk 1 data + Chunks 2-5 UI) | #6366f1 |
| Neighborhoods | `/neighborhood` | ✅ Live | #8b5cf6 |
| The Last 48 | `/live` | ✅ Live | #f59e0b |

## Major Features

### Home Page
- [x] Dana hero with Instrument Serif headline + data vortex backgrounds (light/dark)
- [x] Dana comic strip ribbon with modal viewer
- [x] Civic data ticker (hero mode, real Socrata indicators)
- [x] Neighborhood Profiles featured section (5 fingerprints)
- [x] 15-view tile grid (3-column)
- [x] "Created by Jesse Garnier with Claude"
- [x] Background cache preloader

### Typography
- [x] Roboto Serif: universal (display + body), letter-spacing -0.02em
- [x] Space Mono: data values + italic for neighborhood detail lines
- [x] Instrument Serif: Dana hero only

### Cross-Cutting Infrastructure
- [x] Per-dataset cache TTLs (1 min → 24 hours based on update frequency)
- [x] Background cache preloader on Home page
- [x] Civic data ticker engine (8 parallel queries, 30-min cache)
- [x] Ticker UI (hero/standard/compact modes, rAF scroll, hover-pause)
- [x] Compact ticker on 4 subpages (ER, Crime, 311, Traffic Safety)
- [x] Data freshness gates (suppress stale dataset indicators)
- [x] TimeOfDayFilter bidirectional drag with visual feedback
- [x] CardTray responsive behavior on all views
- [x] UnderlayPicker moved to header bar (compact dropdown)
- [x] PNG export with two-layer compositing (Mapbox + HTML)
- [x] Tooltip z-index fixes (InfoTip, StatCard, MethodologyTip)
- [x] Date range indicator on collapsed sidebar

### Mobile / Responsive shell (PR #89 — June 2026)
- [x] `useIsMobile` breakpoint (`md`=768px) + AppShell off-canvas nav drawer + mobile top bar (Dana badge + tagline)
- [x] `useDraggableSheet` bottom sheets (peek/glimpse/half/full) — MapSidebar + Neighborhood; detail panels stay top-right cards (`mobileCompact` half-width)
- [x] Last 48 mobile: lean super-chips, inline rail header, scanner footer; manual scroll-to-selected (translateY-sheet safe)
- [x] Home: Explorations relocated to a swipeable rail; per-view responsive headers; map-centering offset propagated to all views
- [x] Hover tooltip off on touch; zoom → bottom-left; earth-tone sheet bg; "parks excluded" label removed

### City Budget & Spending
- [x] Budget Overview tab (department bars, spending trends, FY picker)
- [x] Vendor Explorer v2 (scale-break bars, ghost bars, FY scrubber, anomaly flags)
- [x] Vendor Profile (spending timeline, dept breakdown, contracts, payment table)
- [x] Advertising & Media tab with three-layer detection
- [x] Media classification registry (28+ outlets, 10 categories)
- [x] Resolution 240210 compliance dashboard
- [x] Compliance thermometer + composition bar + trend chart
- [x] Department report card (3-tier status: compliant/below/critical)
- [x] "How is this calculated?" methodology disclosure
- [x] P-card transparency section
- [x] Advertising drill-down (media category → vendor → profile)
- [x] CSV export at every aggregation level
- [x] "Based on N records" clickable export link
- [x] Unified color language (green=community, blue=discretionary, red=shortfall)

### Elections
- [x] Data foundation (XML/HTML parsers, 5 elections, RCV rounds)
- [x] Core map view (choropleth, race/election picker, results sidebar)
- [x] RCV round chart with animated playback + vote transfers
- [x] RCV Sankey vote flow diagram
- [x] Time Machine (cross-election playback, timeline scrubber)
- [x] Ballot Measure Explorer (topic categorization, decade filters)
- [x] 1996 SFSU attribution in footer

### Neighborhood Profiles
- [x] 5 parallel useTrendBaseline calls → unified profiles
- [x] Civic Fingerprint radar chart (5-axis z-score visualization)
- [x] Choropleth map (composite z-score coloring)
- [x] Sortable 41-neighborhood sidebar with mini fingerprints
- [x] Deep profile (fingerprint + stat cards + domain metric rows)
- [x] Comparison mode (up to 3 neighborhoods, ghost fingerprints)
- [x] Proportional domain bars in comparison
- [x] Multi-boundary map highlighting with fitBounds
- [x] Data Portrait / Dive In (5 curated queries, domain-colored map points)
- [x] Progressive loading interstitial with domain progress indicators
- [x] Cross-link arrows (metric rows → dataset views)
- [x] URL shareable: `?nh=Tenderloin`, `?compare=A,B,C`

### Traffic Safety
- [x] HIN (High Injury Network) overlay — 5,917 street segments
- [x] Speed cameras, red light cameras, pavement condition overlays
- [x] DUI crash identification + tooltip deduplication fix

### Business Activity
- [x] Dual heatmap (green openings + red closures) — split query fix
- [x] Sector filter with openings/closures/net per sector

### The Last 48 (`/live` — legacy `/live-feeds` redirects)
- [x] FLOW dots (header toggle "DOTS") + anomaly choropleth (ex-"HOTSPOTS" — flat single color, flagged for rethink)
- [x] DatasetSuperChips row (toggle + headline + per-hour rate + publish-lag sparkline)
- [x] Civic heartbeat ticker (significance-ranked plain-language readout)
- [x] Ambient AUTO mode (pill labelled "AUTO") — idle auto-tour of freshest events; orbit is a sine pendulum across the north axis (±90°, never south-up); green/red pill; Stroll/Drift/Sweep pace presets; `?ambient=` URL; `?tune=1` dev panel; reduced-motion aware (PRs #85–88)
- [x] Scanner strip linking Broadcastify SF Fire/EMS (6336) + Police (46180) — new-tab only per TOS (PR #81)
- [x] Control row reorder + relabel: underlay · DOTS · AUTO (PR #88)
- [x] Canonical `/live` URL with clean params; correctness fixes — single-flight tour (no card "blip"), lander suppressed in AUTO (no "recenter then jump") (PR #88)

### Data Quality
- [x] Sort bias fix for dual-field queries (business openings/closures)
- [x] Data freshness gates on ticker (suppress high-latency datasets)
- [x] `$limit` tuning to prevent silent data truncation

---

## Known Issues / Open Items

### Neighborhood View — Immediate Fixes Needed
- [ ] **3rd neighborhood compare**: can add via map click but sidebar picker may not allow 3rd selection
- [ ] **Click neighborhood name in compare bar**: should zoom to that neighborhood + load its portrait
- [ ] **Domain filtering**: clicking domain labels should toggle map layer visibility
- [ ] **Portrait point detail**: individual dot click/hover should show detail panel like other views
- [ ] **311 in comparison bars**: verify rendering in Quality of Life section

### Design / Polish
- [ ] Responsive mobile layouts (sidebar collapse, card stacking)
- [ ] Side-by-side comparison mode for Elections (spec'd, not built)
- [ ] RCV map progression (round-by-round choropleth animation)
- [ ] Vendor sparkline trends in search results
- [ ] Anomaly detection sensitivity slider (Budget)
- [ ] Ad spend timeline chart (stacked area)
- [ ] Fund type filter (Budget Overview)

### Infrastructure
- [ ] Vercel Edge Cache (Option 3) — proxy Socrata with CDN TTLs
- [ ] Build-time static JSON (Option 4) — for ticker + compliance indicators
- [ ] Virtual scrolling for 12K+ vendor list
- [ ] `dataAsOf` freshness timestamps on DataSourceLine

### Future Features (Spec'd)
- [ ] Unified SpendingDrilldown component (cross-tab audit trail)
- [ ] Neighborhood Report export (PNG/PDF one-pager)
- [ ] Dana Instagram content pipeline
- [ ] Dana comic archive / thin CMS
- [ ] Compliance report deliverable (coalition → city → public)
- [ ] Sector analysis templates (Professional Services, Construction, etc.)

---

## Architecture Notes

### Data Sources
- **Socrata SODA API**: 14 datasets from data.sfgov.org
- **SF Elections**: Static JSON parsed from sfelections.org (5 elections)
- **Census ACS**: Static JSON with background refresh
- **CivicAPI**: Planned for live election night mode

### Key Patterns
- `useDataset` → Socrata fetch with cache
- `useTrendBaseline` → YoY + z-score + sub-period breakdown (5 parallel queries)
- `useMapLayer` → GeoJSON source + Mapbox layer with retry
- `useMapTooltip` → hover popup with retry-attach
- `CardTray` → responsive stat cards with localStorage persistence
- `DetailPanelShell` → slide-in detail panel wrapper
- Module-level caching with per-dataset TTLs (1 min → 24 hours)

### Font Stack
- Roboto Serif (display + body, -0.02em tracking)
- Space Mono (data values, italic for detail lines)
- Instrument Serif (Dana hero only)

### Deployment
- Vercel auto-deploy from `main`
- SPA routing via `vercel.json` rewrites
- Static election data at `/data/elections/` (avoids route collision)
