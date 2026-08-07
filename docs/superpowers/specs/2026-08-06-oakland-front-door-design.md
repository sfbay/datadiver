# Oakland stage 4 — beat names + the front door (design)

**Status:** approved design, pre-implementation. One stage, one spec, TWO PRs:
**4a** (branch `feat/oakland-beat-names`) ships the beat-name vocabulary across the
four live Oakland views; **4b** (branch `feat/oakland-front-door`, after 4a merges)
ships the landing page, ticker, city switcher, Home doorway card, and About
city-sectioning. Until 4b merges, Oakland stays URL-only by design.

**Program context:** stages 1a–3b are merged (PRs #141/#143/#145/#146/#147); all four
Oakland views render on the 59-beat spine. The program spec
(`2026-08-03-oakland-geography-program-design.md`) locked the stage-4 frame at the
Aug 3 brainstorm: shell switcher at the sidebar brand row; root Home stays SF's front
door + one Oakland doorway card; switch-mid-view lands on the same view in the other
city when live, else the city's landing; area selection resets on switch.

## Decisions locked (Jesse, Aug 6 2026)

Front door (AskUserQuestion round 1):
1. **Landing = lean mini-Home** — hero + ticker + view cards + SF doorway + footer;
   no map moment, no investigation cards.
2. **Ticker = 4 items, citations dated** — crime/311 freshness-SUPPRESS, citations/
   campaign-finance freshness-DISCLOSE ("through {date}").
3. **Switcher = subtitle menu** — the brand-row subtitle becomes a chevron button
   opening a compact city menu; no collapsed-rail control; ⌘K gains switch rows.
4. **About = sections + findings** — per-portal source sections + an Oakland
   findings block.

The beats elephant (AskUserQuestion round 2, after the 4-agent research pass):
5. **Method = overlay + cross-check** — area-share overlay of beat polygons × the
   city's official neighborhoods layer generates proposals; the OPD dispatch-layer
   names cross-check; a committed, test-pinned editorial table is the shipped truth.
6. **Format = name · code** — the human name leads, the beat code stays visible on
   every surface ("Rockridge · 12Y"; detail panels "ROCKRIDGE — Police Beat 12Y").
7. **Packaging = names PR first** — 4a improves the already-live views immediately;
   4b presents named beats from day one.

---

# §A — Beat names (PR 4a)

## A1. The problem and the sources

No official beat→name crosswalk exists anywhere. The city's beat layer (`78s7-673i`)
names exactly 2 of 59 polygons (`LKM1` → "LAKE MERRIT" [sic], `PDT2` → "PIEDMONT");
the rest are code-only. Research pass (4 agents, Aug 6 2026 — live-probed):

| Source | What it is | Tier |
|---|---|---|
| `sb4q-6bkc` "neighborhoods" (data.oaklandca.gov) | **Official city neighborhoods layer: 131 polygons**, human-quality names in `neighbhd` (Rockridge, Temescal, Chinatown, Fruitvale Station, Adams Point, Montclair…), `code` like `N-2`/`S-10`. Actively maintained (rowsUpdatedAt 2024-07-26). | Official, current |
| `b5ya-f7qx` "Neighborhoods" | Frozen 2021 copy of the same 131 features (name sets verified IDENTICAL to `sb4q-6bkc`). It is the source of the citations dataset's `:@computed_region_b5ya_f7qx` (92.9% populated). Crime and 311 carry NO neighborhood computed region — only zips (311's zip region is 100% NULL, never backfilled). | Official, frozen |
| `Police_Beats_NCPC` (Oakland ArcGIS, service `services.arcgis.com/9tC74aDHuml0x5Yz/.../Police_Beats_NCPC/FeatureServer/0`) | The layer that feeds Oakland's 911 dispatch system: the SAME 59 beat codes with a `NEIGHBORHO` name field. ~43/59 carry real place names ("Jack London NC", "Temescal Neighbors", "Greater Rockridge NC"); ~16 are junk (tautologies "22X NC", street range "66-82", generic org names, blanks). 1,045 days stale — tolerable for names. | Operational |
| NCPC prior art (LocalWiki, NCPC sites) | Oakland's community convention: residents who engage with beats do it through Neighborhood Crime Prevention Councils that self-name exactly this way ("Greater Rockridge NCPC (12Y/13X)", "Laurel/Redwood/Leona Heights (25X)"). | Community |
| `jjkx-wmbc` Planning Areas | 9 named regions with population — banked as a possible future regional tier, NOT used in v1. | Official (unused) |

**Ruled out honestly:** re-spining views on neighborhoods. Only citations has a
neighborhood computed region; crime/311 cannot be server-side GROUPed by
neighborhood, and client-side point-in-polygon over 5K-capped samples breaks
server-side truth. **Beats stay the data spine; names are the display vocabulary.**
State, URL params (`?neighborhood=`), and store keys hold beat CODES everywhere —
the stage-3b canonical-code ruling extends unchanged.

## A2. Method (reproducible)

`scripts/build-oakland-beat-names.py` — sibling of `build-oakland-beats.py`, same
docstring register, run by hand, output committed:

1. Load the vendored `public/data/geo/oakland-beats.geojson` (the app's beat truth)
   and fetch the live neighborhoods layer (`sb4q-6bkc` GeoJSON export).
2. `shapely` intersection per beat × neighborhood; share = intersection area ÷ beat
   area (lon/lat plane — shares are ratios within one beat at city scale, so no
   projection needed; noted in the docstring). **Merge shares by name** — the layer
   has 131 polygons / 129 names ("Coliseum Industrial Complex" and "East 14th Street
   Business" each split across two polygons).
3. Fetch the dispatch names (`Police_Beats_NCPC` query, `NAME,NEIGHBORHO`) and the
   beats layer's own `FULLNAME` pair (LKM1/PDT2).
4. Emit `scripts/oakland-beat-names-evidence.json`: per beat — ranked (name, share)
   list, coverage %, dispatch name. Committed so the proposal is regenerable and the
   editorial table is auditable against it.

The overlay was already run for this spec (results below). Verified sanity checks:
LKM1 has 0% neighborhood coverage (it is the lake); PDT2 contains Piedmont's city
center; 02Y contains the Port's Middle Harbor and West Oakland BART; 31X contains
both the Airport and the Coliseum.

## A3. Curation principles

1. **≤2 names per label**, joined " & ". The code disambiguates everything
   (format decision 6) — shared names across adjacent beats are allowed when true.
2. **Populated-fraction principle:** industrial/park/water polygons and uncovered
   land don't outrank the residential names humans use. (26X/31Y/33X read past
   "Coliseum Industrial Complex"; 13Y/22Y/25Y/35Y read past regional parkland;
   coverage % below 100 usually means freeway/port/park/water, not missing data.)
3. **Names come only from the sources** (the 131-layer vocabulary, the dispatch
   names, the beats layer's FULLNAME) — no invented names. Fragments of compound
   source names are allowed ("Waterfront" ⊂ "Produce and Waterfront", "Skyline" ⊂
   "Skyline-Hillcrest Estates", "Oak Knoll" ⊂ "Oak Knoll-Golf Links"). The
   `authored` tier is reserved for geographic facts verifiable from the geometry
   itself (Airport, Port, Lake Merritt, Piedmont) and is disclosed as editorial.
4. **Label order follows share order**, except where the populated-fraction
   principle promotes the residential name humans use (26X leads with Melrose over
   the larger industrial share; 22Y leads with the NCPC's Joaquin Miller over
   parkland-fragmented overlay shares).
5. **Spelling curation, each with a code comment:** "Lake Merritt" (city publishes
   "LAKE MERRIT"), "Crocker Highlands" (layer: "Crocker Highland"), "Upper Dimond"
   (layer: "Upper Diamond"; the district's accepted spelling is Dimond — the city's
   own layer contains both spellings), "Hoover-Foster" (layer: "Hoover/Foster" —
   slash collides with the " & " joiner register).
6. **Never imply OPD publishes this mapping.** About + data-insights disclose the
   synthesis: derived by area overlap from the City's official neighborhood
   boundaries, cross-checked against the dispatch/NCPC names, edited for clarity.

## A4. The 59 labels (the shipped editorial table)

Evidence tiers: **both** = overlay and dispatch name agree on the place ·
**overlay** = official-layer overlay only (dispatch name junk/blank) · **ncpc** =
dispatch/NCPC carries it where overlay coverage is weak · **authored** = geographic
fact from beats-layer FULLNAME or verified landmark containment.

| Beat | Label | Tier | Overlay (share of beat) | Dispatch name |
|---|---|---|---|---|
| 01X | Jack London & Waterfront | both | Produce and Waterfront 82% | Jack London NC |
| 02X | Acorn & Oak Center | both | Acorn Ind. 22, Acorn 18, Oak Center 16 | Acorn & Oak Community |
| 02Y | Prescott & South Prescott | ncpc | Prescott 9, South Prescott 7 (rest = Port lands: Middle Harbor, West Oakland BART verified inside) | Prescott NC |
| 03X | Chinatown & Civic Center | both | Chinatown 41, Civic Center 24, Peralta/Laney 17 | Chinatown NC |
| 03Y | Old Oakland | both | Old City 45, Downtown 30 | Old Oakland Neighbors |
| 04X | Uptown & Gold Coast | ncpc | Downtown 41, San Pablo Gateway 28, Lakeside 21 | Uptown/Gold Coast NC |
| 05X | Oak Center & Ralph Bunche | overlay | Ralph Bunche 55, Oak Center 45 | Acorn & Oak Community |
| 05Y | Port of Oakland | authored | Prescott 8 (rest = Outer Harbor / former Army Base) | Prescott NC |
| 06X | Hoover-Foster & Longfellow | both | Hoover/Foster 59, Longfellow 40 | Hoover Durant |
| 07X | McClymonds & Clawson | overlay | McClymonds 6, Clawson 5 (rest = rail/freeway maze) | Beat 7 NC / West Oakland Neighbors |
| 08X | Pill Hill & Mosswood | overlay | Pill Hill 28, Mosswood 26, Oakland Ave/Harrison 24, Northgate/Waverly 20 | Ujima Friends |
| 09X | Piedmont Avenue | both | Piedmont Avenue 79% | PANIL NC (= Piedmont Ave. Neighborhood Improvement League) |
| 10X | Golden Gate & Paradise Park | both | Paradise Park 33, Golden Gate 30, Gaskill 24 | Golden Gate NC |
| 10Y | Santa Fe & Longfellow | overlay | Santa Fe 53, Longfellow 46 | 10Y NC |
| 11X | Bushrod | both | Bushrod 90% | Shattuck NC |
| 12X | Temescal | both | Temescal 86% | Temescal Neighbors |
| 12Y | Rockridge | both | Rockridge 34, Shafter 26, Fairview Park 25, Upper Rockridge 13 | Greater Rockridge NC |
| 13X | Upper Rockridge | both | Upper Rockridge 63% | Greater Rockridge NC |
| 13Y | Claremont & North Hills | both | Claremont 23, Merriwood 10, Forestland 8 (rest = canyon parkland) | North Hills Public Safety Committee |
| 13Z | Montclair & Piedmont Pines | both | Montclair 35, Piedmont Pines 32, Shepherd Canyon 13 | Montclair NC (MNC) |
| 14X | Adams Point | both | Adams Point 56% | Adams Point Neighborhood Group |
| 14Y | Grand Lake & Lakeshore | both | Grand Lake 69, Lakeshore 28 | Grand Lake Neighbors |
| 15X | Cleveland Heights | both | Cleveland Heights 89% | Friends of Cleveland Heights NC |
| 16X | Trestle Glen & Crocker Highlands | overlay | Trestle Glen 47, Lakeshore 28, Crocker Highland 25 | Grand Lake Neighbors |
| 16Y | Glenview | both | Glenview 72, Trestle Glen 22 | Glenview NC |
| 17X | Clinton & Ivy Hill | overlay | Clinton 72, Ivy Hill 21 | (generic org name) |
| 17Y | Lynn & Bella Vista | overlay | Lynn 20, Clinton 20, Bella Vista 19, Ivy Hill 18 | (generic org name) |
| 18X | Rancho San Antonio | both | Rancho San Antonio 100% | Greater San Antonio NC |
| 18Y | Highland Terrace & Tuxedo | overlay | Highland Terrace 63, Tuxedo 36 | Greater San Antonio NC |
| 19X | East Peralta & Waterfront | overlay | Produce and Waterfront 13, East Peralta 10, Merritt 9 (55% cov — estuary frontage) | Greater San Antonio NC |
| 20X | Fruitvale & Hawthorne | both | N. Kennedy Tract 31, Hawthorne 26, Oak Tree 19, S. Kennedy 14 | Fruitvale Unity |
| 21X | Meadow Brook & Reservoir Hill | overlay | Meadow Brook 60, Reservoir Hill 39 | 21XY NC |
| 21Y | Upper Peralta Creek & Patten | overlay | Upper Peralta Creek 25, Patten 22, School 21, Sausal Creek 18 | 21XY NC |
| 22X | Oakmore & Upper Dimond | overlay | Oakmore 41, Upper Diamond 27, Piedmont Pines 13, Lincoln Highlands 12 | 22X NC |
| 22Y | Joaquin Miller & Woodminster | both | Woodminster 21, Upper Diamond 15, Crestmont 14 (rest = Joaquin Miller parkland) | Bret Harte/Joaquin Miller NAC |
| 23X | Saint Elizabeth & Fruitvale Station | both | Saint Elizabeth 39, Fruitvale Station 26 | Fruitvale Unity |
| 24X | Jefferson & Harrington | overlay | Jefferson 51, Harrington 40 | Fruitvale Unity |
| 24Y | Allendale & Bartlett | both | Allendale 67, Bartlett 25 | Allendale Park Community Council |
| 25X | Laurel & Redwood Heights | both | Redwood Heights 61, Leona Heights 22, Laurel 6 | Laurel/Redwood/Leona Heights NC |
| 25Y | Caballo Hills & Skyline | overlay | Caballo Hills 31, Skyline-Hillcrest Estates 18, Sequoyah 15 (rest = parkland) | Beat 25Y NC |
| 26X | Melrose & Coliseum Industrial | both | Coliseum Industrial 36, Melrose 12 | Coliseum Melrose |
| 26Y | Coliseum & Fitchburg | both | Coliseum Ind. 34 (merged), Coliseum 23, Fitchburg 16, Lockwood-Tevis 14 | Coliseum Melrose |
| 27X | Fairfax & Fremont | overlay | Fremont 44, Fairfax 37, Maxwell Park 10 | Melrose 27X NC |
| 27Y | Seminary & Havenscourt | overlay | Seminary 45, Havenscourt 22, Wentworth Holland 16 | Rainbow NC |
| 28X | Maxwell Park & Mills College | both | Maxwell Park 64, Mills College 35 | Maxwell Park NC |
| 29X | Millsmont & Frick | both | Millsmont 53, Frick 33 | Millsmont, Evergreen, Millsbrae NC |
| 30X | Arroyo Viejo & Havenscourt | overlay | Arroyo Viejo 47, Havenscourt 35, Hegenberger 11 | "66-82" (junk) |
| 30Y | Eastmont & Eastmont Hills | both | Eastmont Hills 60, Eastmont 28 | Eastmont 30Y NC |
| 31X | Airport & Coliseum | authored | Coliseum Ind. 2% (rest = Airport, Bay; Airport AND Coliseum verified inside) | Coliseum Business Alert |
| 31Y | Brookfield Village & Columbia Gardens | overlay | Coliseum Ind. 46, Brookfield Village 25, Columbia Gardens 11 | (blank) |
| 31Z | Sobrante Park & South Stonehurst | overlay | Sobrante Park 52, South Stonehurst 24, Brookfield Village 21 | (blank) |
| 32X | North Stonehurst & Iveywood | overlay | North Stonehurst 42, Iveywood 22 | 32X NC |
| 32Y | Foothill Square & Las Palmas | overlay | Las Palmas 30, Foothill Square 27, Iveywood 16, Toler Heights 15 | MacArthur Corridor |
| 33X | Highland & Elmhurst Park | overlay | Highland 27, Elmhurst Park 19, Woodland 15 (excl. industrial 32) | Beat 33X/34X NIC |
| 34X | Webster & Cox | overlay | Webster 52, Cox 41 | Beat 33X/34X NIC |
| 35X | Oak Knoll & Castlemont | overlay | Oak Knoll-Golf Links 57, Castlemont 26, Toler Heights 13 | 35X NC |
| 35Y | Sequoyah & Chabot Park | both | Sequoyah 45, Chabot Park 22 (rest = Chabot parkland) | South Hills NC |
| LKM1 | Lake Merritt | authored | 0% coverage — the lake itself | (blank; beats layer FULLNAME "LAKE MERRIT") |
| PDT2 | Piedmont | authored | 3% (Piedmont city center verified inside — the enclave city, an OPD dispatch carve-out; events are edge-rare) | (blank; FULLNAME "PIEDMONT") |

## A5. Data model + display API

- **`src/cities/oakland/beatNames.ts`** — zero-import leaf:
  `OAKLAND_BEAT_NAMES: Record<string, string>` (59 rows, code → label verbatim from
  A4, spelling-curation comments inline). Pinning test: key set ===
  `OAKLAND_BEATS` (bijective, no empty labels — the duplicated-allowlist lesson).
- **`CityAreas` gains `displayName?: (id: string) => string`**
  (`src/cities/types.ts`). Oakland: `(id) => OAKLAND_BEAT_NAMES[id] ?? \`Beat ${id}\``.
  SF: absent — a neighborhood's name IS its id; no behavior change.
- **Composed-label convention** — one shared helper `areaLabel(areas, id)` in a new
  pure leaf `src/cities/areaLabel.ts` (imports types only; node-unit-tested):
  `displayName ? \`${displayName(id)} · ${id}\` : id` → SF "Mission" stays "Mission";
  Oakland renders "Rockridge · 12Y". Detail panels use the parts directly:
  name as the heading, "Police Beat 12Y" as the sub-line.
  `areas.formatLabel` ("Beat 04X") remains for prose contexts that want the
  code-only form; call sites choose deliberately.
- **⌘K place rows:** label becomes the composed form; match terms include BOTH the
  name and the code ("rockridge" and "12y" both hit). `placeDestination` param value
  stays the CODE.

## A6. Surfaces converted in 4a

All within the three beat-bearing views + shared chrome (campaign-finance has no
areas): sidebar ranking rows, neighborhood/beat drill headers, map hover tooltips,
detail panels (crime charges panel, `CitationDetailPanel` beat line, 311 case
panel), citations beat filter labels, the unmapped-beat disclosure lines, ⌘K place
rows. URL params, store state, and all query keys keep codes (A1). SF surfaces
byte-identical (the `displayName` field is absent for SF; the helper degrades to
identity).

## A7. Disclosure

- `docs/data-insights.md` → Oakland: a "How beats get their names" subsection —
  method, sources with ids/staleness, the three-legged evidence structure, the
  authored-tier list, the spelling curations.
- About (rides 4b): the Oakland findings block includes a beat-naming finding.
- The evidence JSON + generator script are committed (A2) — the audit trail.

## A8. 4a tests + gate

- `beatNames.test.ts`: bijective vs `OAKLAND_BEATS`; no empty/whitespace labels;
  spot-pins (12Y → "Rockridge", LKM1 → "Lake Merritt", PDT2 → "Piedmont").
- Label-helper unit tests: SF identity; Oakland composed form; unknown code
  fallback "Beat {code} · {code}" never renders "undefined".
- ⌘K: index test re-pins — Oakland place rows searchable by name AND code.
- Gate: devman build + full vitest + browser walk of the three views (sidebar rows
  read "Temescal · 12X", detail panels show the name + "Police Beat" sub-line,
  ⌘K "rockridge" resolves, SF views unchanged).

---

# §B — The front door (PR 4b)

## B1. Oakland landing (`/oakland`) — `CityLanding`

- **Manifest:** `OAKLAND_MANIFEST` gains `{ viewId: 'home', navLabel: 'Overview',
  navShortLabel: 'OV', navDescription: 'Oakland overview & view picker',
  accentColor: '#b85a33' }` as entry 0 — the route (`viewPath('oakland','home')` →
  `/oakland`), the nav row, and the ⌘K row all derive automatically; zero App.tsx
  route edits. No `homeCard` on the home entry (SF parity: Home doesn't card-link
  to itself). No `dateless` flag (SF Home parity — zero special-casing).
  The four view entries gain `homeCard: { title, subtitle, order 1–4 }`.
- **Dispatch:** `VIEW_COMPONENTS.home` stays `Home`; `Home.tsx` opens with
  `const city = useActiveCity(); if (city.id !== 'sf') return <CityLanding />`.
  In-view city branching is the established dialect pattern (the liveness rule
  governs chrome OUTSIDE `<Routes>`; route rows carry `key={city.id}` remount).
- **`src/views/Home/CityLanding.tsx`** renders entirely from CityConfig + manifest:
  hero (eyebrow "{city.name} Open Data", the brand headline register, an
  Oakland-authored deck line naming the four subjects + "59 police beats" +
  `portal.name`), the same authorship credit block, a **non-navigating** status
  chip ("Live · data.oaklandca.gov" + ticker `lastUpdated`; Oakland has no `/live`
  — the chip must not pretend to link), the Oakland ticker (B2), the view-card grid
  (the `homeCards` pattern over `liveManifest(city.manifest)`), one **doorway card
  back to SF** ("San Francisco — the full DataDiver" → `/`), and a footer crediting
  `city.portal.host`. Explicitly absent: investigation cards, PulseTeaser,
  Neighborhood Profiles, AlertsRibbon (SF-scoped backend), Dana comic row.

## B2. Oakland ticker — `useOaklandIndicators`

New self-contained hook + a pure node-tested framing leaf (`oaklandIndicators.ts`).
Four items; every item runs a `MAX(dateField)` probe first (the mandatory
checkFreshness), consumed in **two modes**:

| Item | Query core | Probe mode |
|---|---|---|
| Crime | `count(distinct casenumber)` recent window (dialect rule) | SUPPRESS if max(datetime) older than 7 days (~3-day publishing lag) |
| 311 | opened-this-week count (`datetimeinit`) | SUPPRESS if older than 3 days (same-day publishing) |
| Citations | recent volume via `ticket_iss` | DISCLOSE — "through {max date}" (the ~11-week lag would permanently fail any gate; the item is true, it carries its date) |
| Campaign finance | cycle-to-date raised via the fppc builders + tiled `OAKLAND_ELECTIONS` | DISCLOSE — "filed through {max tran_date}" (semiannual filing lumps) |

Same honesty asymmetry as Pulse: a busy reading survives staleness; a quiet one
doesn't. All fetches pass explicit `cityId: 'oakland'` (direct `fetchDataset` calls
from async orchestrators — the route-derived default is not readable there). Item
copy uses beat NAMES where a beat appears ("Busiest beat: Temescal · 12X"). Item
`source.view` paths via `viewPath('oakland', …)`. Timestamps parsed with
`parseSfLocal` (Oakland shares the floating-local convention). The hook is
`enabled`-gated like the SF ticker's deferral; no retrofit of `useCivicIndicators`.

## B3. City switcher

- **`crossCityPath(targetCityId, currentViewId)`** in `src/cities/registry.ts`:
  `isViewLive(target, viewId) ? viewPath(target, viewId) : viewPath(target,'home')`
  — the program-spec semantics. (Trap this kills: naive `viewPath('oakland','home')`
  pre-4b bounced to `/` via the catch-all; after B1 the landing route exists.)
- **AppShell brand row:** the subtitle line ("{abbrev} Open Data" — already
  city-dynamic) becomes a button with a chevron opening a compact menu listing the
  registry's cities (SF first), current city marked. Select → `navigate(
  crossCityPath(other, currentViewId))`; on mobile also closes the drawer (the
  `go()` idiom). The Dana badge keeps its collapse/expand job. Collapsed rail: no
  control. Escape/blur closes. `CityChangeReset` (already URL-keyed) handles
  selection reset — no new reset logic.
- **⌘K:** a new `'city'` `SearchCategory` row per OTHER city ("Switch to Oakland" /
  "Switch to San Francisco"), built in `useOmniSearch`'s results memo OUTSIDE the
  per-city index cache, path = `crossCityPath(other, current viewId)`. The existing
  `handleSelect` navigates it with zero OmniSearch component changes.

## B4. SF Home doorway card

One hand-authored VizCard appended to BOTH grids (desktop Explorations + mobile
rail): badge `OAK`, title "Oakland", subtitle on the 4-views/59-named-beats pitch,
→ `/oakland`. Authored in `Home.tsx` — NOT a fake SF manifest entry.

## B5. About city-sectioning

- **Sources:** the table splits into "San Francisco — data.sfgov.org" (existing ~25
  rows unchanged) and "Oakland — data.oaklandca.gov" (5 hand-authored rows: crime
  `ppgh-7dqv`, 311 `quth-gb8e`, citations `58em-y96b`, beats polygons `78s7-673i`
  [vendored], one roll-up row "FPPC campaign-finance filings — 16 datasets"). The
  row-link fallback template becomes per-section host (today it hardcodes
  `data.sfgov.org`). Intro prose rewritten off the DataSF-only framing.
- **Findings:** an Oakland block (~5 `<Finding>`s distilled from data-insights):
  beat spine + the ~4.8% no-beat disclosure; charge-level `casenumber` dedupe;
  `srx`/`sry` vs junk `reqaddress`; the citations cluster (integer-region
  crosswalk, `violatio_1` truncation era, ~11-week lag, decimal `ticket_num`);
  tiled FPPC cycles + `exp_date` + null-date Sch E; **and the beat-naming method**
  (A7).

## B6. Hygiene riding 4b

- `Home.tsx` `homeCards` memo filters through `liveManifest(...)` (today a dormant
  entry with a `homeCard` would render a dead tile).
- Stale `App.tsx` comment ("Dormant Oakland slugs…") corrected.
- The `/oakland/*` catch-all retargets `/` → `/oakland` (unknown Oakland slugs land
  on Oakland's own front door; skipSync already covers the pre-redirect frame —
  unknown viewId → `entry === undefined`).

## B7. 4b tests + gate

- Manifest/⌘K re-pins: Oakland 5 manifest entries; the Oakland INDEX re-pins to 71
  rows (5 views + 59 places + 7 datasets — the city row lives OUTSIDE the per-city
  index cache per B3, asserted separately at the hook level for both cities).
- `crossCityPath` unit tests: live-view mapping both directions; fallback-to-home
  (`/housing` → switch → `/oakland`); SF home always `/`.
- Ticker framing leaf node tests: both probe modes, threshold edges, as-of copy.
- Era/`useUrlSync` integrity suites pass with the new `home` entry (no `eraSource`
  on it — nothing to register).
- Gate: devman build + full vitest + browser walk (landing renders honestly —
  hero, ticker items or their honest suppression, 4 cards + SF doorway; switcher
  both directions incl. the fallback case; ⌘K rows; About sections; SF Home
  unchanged but for the doorway card) + network isolation (zero SF-resolved
  fetches from `/oakland`, DEV tripwire clean).

## Out of scope (banked)

Regional tier from Planning Areas (`jjkx-wmbc`) as sidebar grouping; Oakland
Pulse/Last 48 ("data-edge daily wire", stage 5+); Traffic Safety via ArcGIS;
beat-name enrichment of email digests; any `activeCity` store field (permanently
banned); Piedmont/LKM1 curation beyond labels (the `excluded` set stays empty —
its only consumer is census-gated off for Oakland).
