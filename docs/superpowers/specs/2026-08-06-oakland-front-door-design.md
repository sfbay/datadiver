# Oakland stage 4 — beat names + the front door (design)

**Status:** approved design, hardened by a 3-lens adversarial verify (data-truth /
architecture / product-honesty, Aug 6 2026 — 5 Critical-class findings folded; see
the verify deltas woven through each section). One stage, one spec, TWO PRs:
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
2. **Ticker = 4 items** — freshness handled per item; the verify pass replaced the
   original two-mode design with the completeness-edge rule (B2).
3. **Switcher = subtitle menu** — the brand-row subtitle becomes a chevron button
   opening a compact city menu; no collapsed-rail control; ⌘K gains switch rows.
4. **About = sections + findings** — per-portal source sections + an Oakland
   findings block.

The beats elephant (AskUserQuestion round 2, after the 4-agent research pass):
5. **Method = overlay + cross-check** — area-share overlay of beat polygons × the
   city's official neighborhoods layer generates proposals; the OPD dispatch-layer
   names cross-check; a committed, test-pinned editorial table is the shipped truth.
6. **Format = name · code** — the human name leads, the beat code stays visible on
   every surface ("Rockridge & Shafter · 12Y"; detail panels render the name on the
   location line with "Police Beat 12Y" beneath it, carrying the disclosure
   tooltip — as-built phrasing, plan-verify M3).
7. **Packaging = names PR first** — 4a improves the already-live views immediately;
   4b presents named beats from day one.

---

# §A — Beat names (PR 4a)

## A1. The problem and the sources

No official beat→name crosswalk exists anywhere. The city's beat layer (`78s7-673i`)
names exactly 2 of 59 polygons via its `fullname` column (`LKM1` → "LAKE MERRIT"
[sic], `PDT2` → "PIEDMONT"); the rest are code-only. Research pass (4 agents,
Aug 6 2026 — live-probed; all counts independently re-verified by the data-truth
lens):

| Source | What it is | Tier |
|---|---|---|
| `sb4q-6bkc` "neighborhoods" (data.oaklandca.gov) | **Official city neighborhoods layer: 131 polygons / 129 names** (two names split across two polygons each — the generator merges shares by name), human-quality names in `neighbhd` (Rockridge, Temescal, Chinatown, Fruitvale Station, Adams Point, Montclair…). Actively maintained (rowsUpdatedAt 2024-07-26). | Official, current |
| `b5ya-f7qx` "Neighborhoods" | Frozen 2021 copy — name sets AND multisets verified identical to `sb4q-6bkc`. It is the source of the citations dataset's `:@computed_region_b5ya_f7qx` (92.93% populated). Crime and 311 carry NO neighborhood computed region — only zips (311's zip region is 100% NULL, never backfilled). | Official, frozen |
| `Police_Beats_NCPC` (Oakland ArcGIS, `services.arcgis.com/9tC74aDHuml0x5Yz/.../Police_Beats_NCPC/FeatureServer/0`) | The layer that feeds Oakland's 911 dispatch system: the SAME 59 beat codes with a `NEIGHBORHO` name field. ~43/59 carry real place names; ~16 are junk (tautologies "22X NC", street range "66-82", generic org names, blanks). lastEditDate 2023-09-26 (1,045 days) — tolerable for names. **Granularity caveat (verify finding; count corrected at plan-verify): 10 of its names span 2–3 beats (22 beats) and 4 are blank, so for 26 of 59 beats this leg corroborates PLACE IDENTITY only, never a per-beat name** — those rows lean on overlay + reverse-share evidence. | Operational |
| NCPC prior art (LocalWiki, NCPC sites) | Oakland's community convention: residents who engage with beats do it through Neighborhood Crime Prevention Councils that self-name exactly this way ("Greater Rockridge NCPC (12Y/13X)"). | Community |
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
2. `shapely` intersection per beat × neighborhood; **forward share** = intersection
   ÷ beat area; **reverse share** = intersection ÷ neighborhood area (lon/lat plane
   — shares are ratios at city scale, no projection needed; noted in the
   docstring). **Merge polygons by name** before computing (131 → 129).
3. Fetch the dispatch names (`Police_Beats_NCPC`, `NAME,NEIGHBORHO`) and
   `78s7-673i`'s `fullname` pair (LKM1/PDT2 — the vendored asset carries only
   `nhood`, so the live layer is the fullname source).
4. Emit `scripts/oakland-beat-names-evidence.json`: per beat — ranked
   (name, forward share, reverse share), coverage %, dispatch name. Committed so
   the proposal is regenerable and the editorial table is auditable against it.

The overlay was run for this spec and independently recomputed by the verify pass
(all 59 shares reproduce within rounding). Verified sanity anchors: LKM1 has 0%
neighborhood coverage (it is the lake); Piedmont City Hall is inside PDT2; the
Port's container terminals (OICT/Matson/TraPac, berths 30–57) are inside 02Y and
the Outer Harbor/former Army Base inside 05Y; the Oakland Coliseum stadium AND the
Airport are inside 31X, while the *neighborhood* named Coliseum is 100% inside 26Y;
Fruitvale BART and 100% of the Fruitvale Station polygon are inside 23X.

## A3. Curation principles

1. **≤2 names per label**, joined " & ". The code disambiguates everything
   (format decision 6) — shared names across adjacent beats are allowed when the
   place genuinely straddles them (Longfellow in 06X/10Y, Havenscourt in 27Y/30X).
2. **Populated-fraction principle:** industrial/park/water polygons and uncovered
   land don't outrank the residential names humans use. (31Y/33X read past
   "Coliseum Industrial Complex"; 13Y/22Y/25Y/35Y read past regional parkland;
   coverage % below 100 usually means freeway/port/park/water, not missing data.)
3. **Names come only from the sources** (the 129-name vocabulary, the dispatch
   names, `78s7-673i` `fullname`) — no invented names. Fragments of compound
   source names are allowed ("Waterfront" ⊂ "Produce and Waterfront", "Skyline" ⊂
   "Skyline-Hillcrest Estates", "Oak Knoll" ⊂ "Oak Knoll-Golf Links"). The
   `authored` tier is reserved for geographic facts verified by landmark
   containment in the geometry itself (Airport, Coliseum stadium, Port terminals,
   Outer Harbor/Army Base, Lake Merritt, Piedmont) and is disclosed as editorial.
4. **Label order follows forward-share order.** A name may lead out of share
   order — or be included over a larger share — only when (a) its **reverse share**
   is a majority (most of that neighborhood lives in this beat: Laurel 65% → 25X,
   Melrose 89% → 26X), or (b) the dispatch/NCPC leg attests it (Golden Gate NC →
   10X, Eastmont 30Y NC → 30Y, Joaquin Miller → 22Y). Every promoted row is marked
   **†** in A4 — the table is regenerable from the rules plus the marked
   promotions.
5. **Spelling curation, each with a code comment:** "Lake Merritt" (city publishes
   "LAKE MERRIT"), "Crocker Highlands" (layer: "Crocker Highland"), "Upper Dimond"
   (layer: "Upper Diamond"; the district's accepted spelling is Dimond — the
   city's own layer contains both spellings), "Hoover-Foster" (layer:
   "Hoover/Foster" — slash collides with the " & " joiner register).
6. **Never imply OPD publishes this mapping.** Disclosure ships WITH the labels
   (A7) — never a PR behind them.

## A4. The 59 labels (the shipped editorial table)

Evidence tiers (restated after the verify pass): **both** = the overlay and
dispatch legs corroborate the beat's place identity (not necessarily the same
string) · **overlay** = official-layer overlay only (dispatch name junk/blank/
non-discriminating) · **ncpc** = the dispatch/NCPC leg carries the label where
overlay coverage is weak · **authored** = landmark-verified geographic fact.
**†** = declared ordering promotion per A3.4.

| Beat | Label | Tier | Overlay (forward share of beat) | Dispatch name |
|---|---|---|---|---|
| 01X | Jack London & Waterfront | both | Produce and Waterfront 82% (Jack London Sq. verified inside) | Jack London NC |
| 02X | Acorn & Oak Center | both | Acorn Ind. 22, Acorn 18, Oak Center 16 | Acorn & Oak Community |
| 02Y | Prescott & Port of Oakland | authored | Prescott 9, South Prescott 7; container terminals (OICT/Matson/TraPac) verified inside | Prescott NC |
| 03X | Chinatown & Civic Center | both | Chinatown 41, Civic Center 24, Peralta/Laney 17 | Chinatown NC |
| 03Y | Old Oakland | both | Old City 45, Downtown 30 | Old Oakland Neighbors |
| 04X | Uptown & Gold Coast | ncpc | Downtown 41, San Pablo Gateway 28, Lakeside 21 | Uptown/Gold Coast NC |
| 05X | Ralph Bunche & Oak Center | overlay | Ralph Bunche 55, Oak Center 45 | Acorn & Oak Community |
| 05Y | Outer Harbor & Army Base | authored | Prescott 8; Outer Harbor berths + former Oakland Army Base verified inside | Prescott NC |
| 06X | Hoover-Foster & Longfellow | both | Hoover/Foster 59, Longfellow 40 | Hoover Durant |
| 07X | McClymonds & Clawson | overlay | McClymonds 6, Clawson 5 (rest = rail/freeway maze) | Beat 7 NC / West Oakland Neighbors |
| 08X | Pill Hill & Mosswood | overlay | Pill Hill 28, Mosswood 26, Oakland Ave/Harrison 24, Northgate/Waverly 20 | Ujima Friends |
| 09X | Piedmont Avenue | both | Piedmont Avenue 79% | PANIL NC (= Piedmont Ave. Neighborhood Improvement League) |
| 10X | Golden Gate & Paradise Park † | both | Paradise Park 33, Golden Gate 30, Gaskill 24 | Golden Gate NC |
| 10Y | Santa Fe & Longfellow | overlay | Santa Fe 53, Longfellow 46 | 10Y NC (junk) |
| 11X | Bushrod | both | Bushrod 90% | Shattuck NC |
| 12X | Temescal | both | Temescal 86% | Temescal Neighbors |
| 12Y | Rockridge & Shafter | both | Rockridge 34, Shafter 26, Fairview Park 25, Upper Rockridge 13 | Greater Rockridge NC |
| 13X | Upper Rockridge | both | Upper Rockridge 63% | Greater Rockridge NC |
| 13Y | Claremont & North Hills | both | Claremont 23, Merriwood 10, Forestland 8 (rest = canyon parkland) | North Hills Public Safety Committee |
| 13Z | Montclair & Piedmont Pines | both | Montclair 35, Piedmont Pines 32, Shepherd Canyon 13 | Montclair NC (MNC) |
| 14X | Adams Point | both | Adams Point 56% | Adams Point Neighborhood Group |
| 14Y | Grand Lake & Lakeshore | both | Grand Lake 69, Lakeshore 28 | Grand Lake Neighbors |
| 15X | Cleveland Heights | both | Cleveland Heights 89% | Friends of Cleveland Heights NC |
| 16X | Trestle Glen & Crocker Highlands | overlay | Trestle Glen 47, Lakeshore 28, Crocker Highland 25 | Grand Lake Neighbors |
| 16Y | Glenview | both | Glenview 72, Trestle Glen 22 | Glenview NC |
| 17X | Clinton & Ivy Hill | overlay | Clinton 72, Ivy Hill 21 | (generic org name) |
| 17Y | Lynn & Bella Vista † | overlay | Lynn 20, Clinton 20, Bella Vista 19, Ivy Hill 18 (Clinton already leads 17X) | (generic org name) |
| 18X | Rancho San Antonio | both | Rancho San Antonio 100% | Greater San Antonio NC |
| 18Y | Highland Terrace & Tuxedo | overlay | Highland Terrace 63, Tuxedo 36 | Greater San Antonio NC |
| 19X | East Peralta & Waterfront † | overlay | Produce and Waterfront 13, East Peralta 10, Merritt 9 (55% cov — estuary frontage) | Greater San Antonio NC |
| 20X | North Kennedy Tract & Hawthorne | overlay | N. Kennedy Tract 31 (reverse 94%), Hawthorne 26, Oak Tree 19, S. Kennedy 14 — Fruitvale itself is 23X | Fruitvale Unity (spans 20X/23X/24X) |
| 21X | Meadow Brook & Reservoir Hill | overlay | Meadow Brook 60, Reservoir Hill 39 | 21XY NC (junk) |
| 21Y | Upper Peralta Creek & Patten | overlay | Upper Peralta Creek 25, Patten 22, School 21, Sausal Creek 18 | 21XY NC (junk) |
| 22X | Oakmore & Upper Dimond | overlay | Oakmore 41, Upper Diamond 27, Piedmont Pines 13, Lincoln Highlands 12 | 22X NC (junk) |
| 22Y | Joaquin Miller & Woodminster † | both | Woodminster 21, Upper Diamond 15, Crestmont 14 (rest = Joaquin Miller parkland) | Bret Harte/Joaquin Miller NAC |
| 23X | Saint Elizabeth & Fruitvale Station | both | Saint Elizabeth 39, Fruitvale Station 26 (100% of that polygon; Fruitvale BART verified inside) | Fruitvale Unity (spans 20X/23X/24X) |
| 24X | Jefferson & Harrington | overlay | Jefferson 51, Harrington 40 | Fruitvale Unity (spans 20X/23X/24X) |
| 24Y | Allendale & Bartlett | both | Allendale 67, Bartlett 25 | Allendale Park Community Council |
| 25X | Laurel & Redwood Heights † | both | Redwood Heights 61, Leona Heights 22 (dropped by the 2-cap), Laurel 6 (reverse 65%) | Laurel/Redwood/Leona Heights NC |
| 25Y | Caballo Hills & Skyline | overlay | Caballo Hills 31, Skyline-Hillcrest Estates 18, Sequoyah 15 (rest = parkland) | Beat 25Y NC (junk) |
| 26X | Melrose † | both | Melrose 12 (reverse 89%); Coliseum Ind. 36 read past per A3.2 | Coliseum Melrose |
| 26Y | Coliseum & Fitchburg | both | Coliseum 23 (the NEIGHBORHOOD — 100% inside 26Y), Fitchburg 16, Lockwood-Tevis 14; industrial 34 read past | Coliseum Melrose |
| 27X | Fairfax & Fremont † | overlay | Fremont 44, Fairfax 37, Maxwell Park 10 (near-tie; "Fremont" alone reads as the other city) | Melrose 27X NC |
| 27Y | Seminary & Havenscourt | overlay | Seminary 45, Havenscourt 22, Wentworth Holland 16 | Rainbow NC |
| 28X | Maxwell Park & Mills College | both | Maxwell Park 64, Mills College 35 | Maxwell Park NC |
| 29X | Millsmont & Frick | both | Millsmont 53, Frick 33 | Millsmont, Evergreen, Millsbrae NC |
| 30X | Arroyo Viejo & Havenscourt | overlay | Arroyo Viejo 47, Havenscourt 35, Hegenberger 11 | "66-82" (junk) |
| 30Y | Eastmont & Eastmont Hills † | both | Eastmont Hills 60, Eastmont 28 | Eastmont 30Y NC |
| 31X | Airport & Coliseum Complex | authored | Coliseum Ind. 2%; Airport terminal AND the stadium complex verified inside ("Complex" distinguishes the venue from 26Y's Coliseum neighborhood) | Coliseum Business Alert |
| 31Y | Brookfield Village & Columbia Gardens | overlay | Coliseum Ind. 47 read past, Brookfield Village 25, Columbia Gardens 11 | (blank) |
| 31Z | Sobrante Park & South Stonehurst | overlay | Sobrante Park 52, South Stonehurst 24, Brookfield Village 21 | (blank) |
| 32X | North Stonehurst & Iveywood | overlay | North Stonehurst 42, Iveywood 22 | 32X NC (junk) |
| 32Y | Foothill Square & Las Palmas † | overlay | Las Palmas 30, Foothill Square 27, Iveywood 16, Toler Heights 15 (near-tie; Foothill Square is the recognized landmark) | MacArthur Corridor |
| 33X | Highland & Elmhurst Park | overlay | Highland 27, Elmhurst Park 19, Woodland 15 (excl. industrial 32) | Beat 33X/34X NIC (junk) |
| 34X | Webster & Cox | overlay | Webster 52, Cox 41 | Beat 33X/34X NIC (junk) |
| 35X | Oak Knoll & Castlemont | overlay | Oak Knoll-Golf Links 57, Castlemont 26, Toler Heights 13 | 35X NC (junk) |
| 35Y | Sequoyah & Chabot Park | both | Sequoyah 45, Chabot Park 22 (rest = Chabot parkland) | South Hills NC |
| LKM1 | Lake Merritt | authored | 0% coverage — the lake itself | (blank; `78s7-673i` fullname "LAKE MERRIT") |
| PDT2 | Piedmont | authored | 3%; Piedmont City Hall verified inside — the enclave city, an OPD dispatch carve-out (crime: 182 cases all-time, 8 since 2024; 311: 457 requests, current) | (blank; fullname "PIEDMONT") |

## A5. Data model + display API

- **`src/cities/oakland/beatNames.ts`** — zero-import leaf:
  `OAKLAND_BEAT_NAMES: Record<string, string>` (59 rows, labels verbatim from A4,
  spelling-curation comments inline). Pinning test: key set === `OAKLAND_BEATS`
  (bijective, no empty labels — the duplicated-allowlist lesson).
- **Extract and export a named `CityAreas` interface** from the currently-anonymous
  `areas` shape in `src/cities/types.ts` (verify finding: no such named type exists
  today), then add `displayName?: (id: string) => string`.
  Oakland: `(id) => OAKLAND_BEAT_NAMES[id] ?? 'Unmapped beat'` — the fallback fires
  on REAL data (`77X` 34,898 rows / `99X` 8,311, ~3.9% of incidents, codes with no
  polygon) and must read as the administrative bucket it is, never as a place
  ("Beat 77X · 77X" was the rejected form). SF: absent — a neighborhood's name IS
  its id; no behavior change.
- **`areas.formatLabel` is DELETED in 4a** (verify finding: after conversion it
  would have zero call sites — two label authorities is the duplicated-allowlist
  class). All seven consumers move: `useOmniSearch.ts:51`,
  `CrimeDetailPanel.tsx:479`, `CaseDetailPanel.tsx:380`,
  `CitationDetailPanel.tsx:163`, and the three view-local `areaLabel` closures
  (`CrimeIncidents.tsx:58`, `Cases311.tsx:65`, `ParkingCitations.tsx:68` — these
  local bindings are replaced by the shared helper, which therefore takes a
  different name to avoid shadowing confusion during the migration).
- **Composed-label convention** — one shared pure leaf helper
  `composeAreaLabel(areas: CityAreas, id: string): string` in
  `src/cities/areaLabel.ts` (imports types only; node-unit-tested):
  `displayName ? \`${displayName(id)} · ${id}\` : id` → SF "Mission" stays
  "Mission"; Oakland renders "Rockridge & Shafter · 12Y"; unmapped codes render
  "Unmapped beat · 77X". Detail panels use the parts directly: the name on the
  location line, "Police Beat 12Y" beneath it (with the disclosure tooltip).
- **Truncation rule (verify finding — Large Type clips ~half the table):** in
  truncating containers (sidebar ranking rows at `min-w-0 flex-1 truncate`), the
  name and code render as SEPARATE spans — name truncates, the code span never
  shrinks. The code must survive every viewport × type-scale combination
  (decision 6).
- **⌘K place rows:** the filter is a single-field substring test over
  `label`/`sublabel` (`useOmniSearch.ts:93-96` — no match-terms mechanism exists).
  Label = composed form; **sublabel = "Police beat {code}"** so the legacy query
  shape "beat 12y" keeps matching (verify finding: the composed label alone
  silently regresses it). `placeDestination` param value stays the CODE.
- **`areas.searchExcluded?: ReadonlySet<string>`** (new optional field, ⌘K-only
  consumer): Oakland sets `{LKM1, PDT2}` — a "Lake Merritt" ⌘K row would land the
  crime view on a beat with 3 cases all-time (all 2005), and "Piedmont" navigates
  to an enclave OPD doesn't police (verify finding: absence rendered as a
  destination). Sidebar rankings and detail panels keep the honest labels wherever
  those codes genuinely carry data. SF: absent. (The existing `excluded` set is
  NOT reused — it has census semantics and a non-empty SF value; overloading it
  would silently drop SF ⌘K places.)

## A6. Surfaces converted in 4a

All within the three beat-bearing views + shared chrome (campaign-finance has no
areas): sidebar ranking rows, beat drill headers, map hover tooltips, detail
panels (crime charges panel, `CaseDetailPanel`, `CitationDetailPanel` beat line),
⌘K place rows. (Verify corrections: there is no citations "beat filter" — beats
are selected from the map/ranking; the unmapped-beat disclosure lines render a
percentage with no beat name — nothing to convert. The seven `formatLabel`
consumers in A5 are the complete conversion inventory.)

Also in 4a: fix the **factually wrong docstring** in `src/cities/oakland/beats.ts`
("PDT2 (Port)" — PDT2 is Piedmont per `78s7-673i` fullname + City Hall
containment; the Port is 02Y/05Y) before it propagates. URL params, store state,
and all query keys keep codes (A1). SF surfaces byte-identical.

## A7. Disclosure — ships WITH the labels, not behind them

(Verify finding: the original plan put all reader-facing disclosure in 4b, leaving
a window where synthesized names render with no disclosure anywhere.)

- **In 4a:** the About findings section gains the beat-naming finding (method,
  three legs, the authored tier, spelling curations — About is a live SF-route
  surface and can ship it now); detail-panel beat sub-lines carry a source
  `title` tooltip ("Beat names are DataDiver's synthesis of the City's official
  neighborhood boundaries and community policing names — see About");
  `docs/data-insights.md` → Oakland gains "How beats get their names" (sources
  with ids + staleness, the reverse-share promotion rule, the 26-of-59
  granularity caveat, LKM1/PDT2 semantics).
- **In 4b:** the full Oakland findings block (B5) absorbs and extends it.
- The evidence JSON + generator script are committed (A2) — the audit trail.

## A8. 4a tests + gate

- `beatNames.test.ts`: bijective vs `OAKLAND_BEATS`; no empty/whitespace labels;
  spot-pins (12Y → "Rockridge & Shafter", 20X → "North Kennedy Tract &
  Hawthorne", LKM1 → "Lake Merritt", PDT2 → "Piedmont").
- `composeAreaLabel` unit tests: SF identity; Oakland composed form; unmapped
  fallback pins exactly "Unmapped beat · 77X" (never a doubled code, never
  "undefined").
- ⌘K re-pins (named exhaustively — verify finding): `useOmniSearch.test.ts:80-83`
  place-row label ("Beat 01X" → "Jack London & Waterfront · 01X", sublabel
  "Police beat 01X"); index row count drops by 2 (59 → 57 place rows via
  `searchExcluded`), so the 70-row Oakland pin at `:90` re-pins to 68; a query
  test pins that "beat 12y" AND "rockridge" AND "12y" all resolve.
- Gate: devman build + full vitest + browser walk of the three views (sidebar
  rows read "Temescal · 12X" with the code surviving Large Type, detail panels
  show name + "Police Beat" sub-line + disclosure tooltip, ⌘K "rockridge"
  resolves, "fruitvale" resolves to 23X, SF views unchanged).

---

# §B — The front door (PR 4b)

## B1. Oakland landing (`/oakland`) — `CityLanding`

- **Manifest:** `OAKLAND_MANIFEST` gains `{ viewId: 'home', navLabel: 'Overview',
  navShortLabel: 'OV', navDescription: 'Oakland overview & view picker',
  accentColor: '#b85a33', dateless: true }` as entry 0 — the route
  (`viewPath('oakland','home')` → `/oakland`), the nav row, and the ⌘K row all
  derive automatically; zero App.tsx route edits. No `homeCard` on the home entry
  (SF parity: Home doesn't card-link to itself). **`dateless: true` is a declared
  delta from SF Home** (verify finding): SF's Home genuinely consumes `dateRange`
  (Neighborhood Profiles); the landing consumes nothing date-scoped, so without
  the flag the header picker would be inert while `?start=&end=` dirties every
  shared link. The four view entries gain `homeCard: { title, subtitle,
  order 1–4 }`.
- **Dispatch (verify finding — the early-return form either breaks
  rules-of-hooks or fires SF's fetch battery from `/oakland`):**
  `VIEW_COMPONENTS.home` becomes a two-line `HomeRouter`:
  `useActiveCity().id === 'sf' ? <SfHome/> : <CityLanding/>`. The current
  `Home.tsx` body becomes `SfHome` unchanged (all hooks unconditional — including
  `usePreloadCache`, which has no `enabled` option and would otherwise fire
  `vendorPayments` etc. at cityId 'sf' from `/oakland`, tripping the DEV
  tripwire and failing B7's own network gate). **`CityLanding` is `React.lazy`**
  — `Home` is the one eager import in App.tsx, and a static CityLanding import
  would pull the Oakland indicator/fppc/cycles code into the entry bundle
  ([[frontpage-load-perf]]).
- **`src/views/Home/CityLanding.tsx`** renders entirely from CityConfig +
  manifest: hero (eyebrow "{city.name} Open Data", the brand headline register,
  an Oakland-authored deck line naming the four subjects + "59 police beats" +
  the portal), the same authorship credit block, a **non-navigating** status chip
  reading **"Updated {fetch time} · data.oaklandca.gov"** — no "Live" wording, no
  pulse dot (verify finding: "Live" over a composition whose freshest stream lags
  2 days and slowest ~7 months is the claim the brand exists to refuse; the
  `title` explains per-dataset cadence), the Oakland ticker (B2), the view-card
  grid (the `homeCards` pattern over `liveManifest(city.manifest)`), one
  **doorway card back to SF** ("San Francisco — the full DataDiver" → `/`), and a
  footer crediting `city.portal.host`. Explicitly absent: investigation cards,
  PulseTeaser, Neighborhood Profiles, AlertsRibbon (SF-scoped backend), Dana
  comic row.
- **Config correction riding 4b:** `portal.name` for Oakland is currently
  `'OakData'` — an invented brand appearing nowhere on the portal (verify
  finding; it has zero consumers today, so it never shipped). Corrected to
  **'Oakland Open Data'** (the portal's real title is "City of Oakland Open Data
  Portal") before its first reader-facing use.

## B2. Oakland ticker — `useOaklandIndicators`

New self-contained hook + a pure node-tested framing leaf (`oaklandIndicators.ts`).
Four items. **Governing rule (replaces the original two-mode design after the
verify pass): every count window ends at the stream's COMPLETENESS EDGE, never at
`max(dateField)`.** Oakland's streams have fill-in tails — verified live: a naive
"past 7 days" crime count returns 76 against a ~385 steady state while
`max(datetime)` is only 2 days old, so a max-anchored gate waves through a number
~80% low (the banked [[ticker-data-freshness]] class, and the reason the original
"honesty asymmetry" justification didn't transfer: lag makes a volume item
*artificially quiet*, which is exactly what must be suppressed or dated). Per-item
horizons are measured at plan time from fill-in curves.

| Item | Query core | Freshness treatment |
|---|---|---|
| Crime | `count(distinct casenumber)` (dialect rule) over a 7-day window ending at the completeness edge (≈ max − 9d, plan-measured) | Copy is DATED: "in the week ending {date}". SUPPRESS if max(datetime) > 14 days old. |
| 311 | opened-count over the last complete window (`datetimeinit`; the feed is **next-day**, not same-day — max observed ~21h behind) | Copy dated; SUPPRESS if max > 3 days old. |
| Citations | volume through the completeness edge (the tail is real here too: final days carry 155/483/916 vs ~1,700–2,000 steady) | Copy: "through {edge date}" (~11-week lag disclosed, never gated away). |
| Campaign finance | **the concluded cycle's total** via `getDefaultCycle` + the fppc builders — the SAME cycle the view opens on (verify finding: an in-progress-cycle item beside a concluded-cycle view is a contradiction, and "filed through {max tran_date}" fabricates completeness — the Jan–Jun 2026 semiannual hasn't landed; max(tran_date) is a committee outlier resting on 63 rows vs 370 in December) | Copy NAMES the cycle ("Apr 2025 special: $3.9M raised"). Probe suppresses on an empty window (fetch-error/absence guard). No "filed through" claim. |

Same fetch rules as before: explicit `cityId: 'oakland'` on every direct
`fetchDataset` call; `parseSfLocal` (Oakland shares the floating-local
convention); `timeoutMs`/`retries` on the heavier aggregates; `enabled`-gated
deferral like the SF ticker. Item copy uses beat NAMES where a beat appears
("Busiest beat: Temescal · 12X"); item `source.view` paths via
`viewPath('oakland', …)`. No retrofit of `useCivicIndicators`.

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
  control. Escape/blur closes.
- **Selection reset (verify finding — "no new reset logic" was false):**
  `CityChangeReset` clears only neighborhood/crime/311 selections; stage 3b made
  parking-citations live in BOTH cities without extending it, so the switcher
  would carry an SF `selectedCitation` into Oakland one click deep (empty panel,
  or a different citation presented as the clicked one on numeric collision). 4b
  adds `setSelectedCitation(null)` AND a pinning test: every `selected*` store
  field consumed by a dual-city view appears in the reset list — the test is the
  guard for the next view that goes cross-city.
- **⌘K:** a new `'city'` `SearchCategory` row per OTHER city ("Switch to Oakland"
  / "Switch to San Francisco"), built in `useOmniSearch`'s results memo OUTSIDE
  the per-city index cache, path = `crossCityPath(other, current viewId)`. The
  existing `handleSelect` navigates it with zero OmniSearch component changes
  (verified: the category chip renders the raw string). The city-row builder is a
  **pure exported function** node-tested directly (verify finding: the harness is
  node-only — no jsdom, no `.tsx` test includes — so "hook-level" assertions are
  not runnable; `buildSearchIndex` is already tested exactly this way).

## B4. SF Home doorway card

One hand-authored VizCard appended to BOTH grids (desktop Explorations + mobile
rail): badge `OAK`, title "Oakland", subtitle on the 4-views/59-named-beats pitch,
→ `/oakland`. Authored in the SfHome body — NOT a fake SF manifest entry.

## B5. About city-sectioning

- **Sources:** the table splits into "San Francisco — data.sfgov.org" (existing
  ~25 rows unchanged) and "Oakland — data.oaklandca.gov" with **10 rows** (verify
  finding: the original 5-row roll-up made every shipped Oakland campaign-finance
  figure uncitable while all SF figures stayed traceable): crime `ppgh-7dqv`,
  311 `quth-gb8e`, citations `58em-y96b`, beats polygons `78s7-673i` (vendored),
  **neighborhoods `sb4q-6bkc`** (the beat-label source is a shipped data source),
  the four consumed FPPC sets individually (`3xq4-ermg` Sch A, `bvfu-nq99` Sch E,
  `jkj3-8yq3` 496, `qact-u8hq` 497), and one roll-up row for the remaining
  registered-but-unread FPPC sets — noting `fppcSchB2` is published empty and the
  460 summary is deliberately never summed. Row-link fallback becomes per-section
  host. Intro prose rewritten off the DataSF-only framing — AND (4a final-review
  carry) the elections-exception sentence ("Every other dataset on this page
  lives on DataSF", About.tsx ~:421) and the page footer ("data from DataSF",
  ~:618), which become false the moment Oakland rows land in the table.
- **Disclosure reachability (4a final-review carry, load-bearing):** the
  beat-naming disclosure ships in 4a as the About finding + a hover `title` —
  sufficient ONLY while Oakland is URL-only. 4b must make it reachable without
  hover from Oakland routes the day the front door ships (at minimum: the
  landing footer links the About finding; the detail-panel sub-line's tooltip
  stays as a bonus, never the primary path).
- **Findings:** the Oakland block (~6 `<Finding>`s distilled from data-insights):
  the beat-naming method (extending 4a's finding); beat spine + the ~4.8% no-beat
  disclosure (77X/99X unmapped codes + what "Unmapped beat" means); charge-level
  `casenumber` dedupe; `srx`/`sry` vs junk `reqaddress`; the citations cluster
  (integer-region crosswalk, `violatio_1` truncation era, ~11-week lag, decimal
  `ticket_num`); tiled FPPC cycles + `exp_date` + null-date Sch E + the unfiled
  current semiannual.

## B6. Hygiene riding 4b

- `homeCards` memo filters through `liveManifest(...)` (today a dormant entry
  with a `homeCard` would render a dead tile).
- Stale `App.tsx` comment ("Dormant Oakland slugs…") corrected.
- The `/oakland/*` catch-all retargets `/` → `/oakland` (unknown Oakland slugs
  land on Oakland's own front door; skipSync already covers the pre-redirect
  frame — unknown viewId → `entry === undefined`). **Pinned by test** (verify
  finding): the catch-all's target must resolve to a live route — if Oakland's
  home entry were ever marked dormant, the splat would match `/oakland` itself
  and render a blank content area (React Router's `<Navigate>` is dep-guarded so
  it settles rather than loops, but settles on nothing).

## B7. 4b tests + gate

- Re-pin inventory (named exhaustively — verify finding): `registry.test.ts:57`
  Oakland view-id list gains `'home'` (first); `useOmniSearch.test.ts:74-76`
  view-id list + the index count (68 after 4a → 69 with the home view row); the
  pure city-row builder tests (both directions); `eraSources.test.ts:56`
  (`eraSourceFor('oakland','home')` undefined) already passes and stays.
- `crossCityPath` unit tests: live-view mapping both directions; fallback-to-home
  (`/housing` → switch → `/oakland`); SF home always `/`.
- `CityChangeReset` pinning test (B3). Catch-all liveness pin (B6).
- Ticker framing leaf node tests: completeness-edge windowing, dated copy, the
  suppress thresholds, cycle-naming.
- Gate: devman build + full vitest + browser walk (landing renders honestly —
  hero, dated ticker items or their honest suppression, 4 cards + SF doorway;
  switcher both directions incl. the fallback case AND the citation-selection
  reset; ⌘K rows; About sections; SF Home unchanged but for the doorway card) +
  network isolation (zero SF-resolved fetches from `/oakland` — `usePreloadCache`
  never mounts there — DEV tripwire clean).

## Out of scope (banked)

Regional tier from Planning Areas (`jjkx-wmbc`) as sidebar grouping; Oakland
Pulse/Last 48 ("data-edge daily wire", stage 5+); Traffic Safety via ArcGIS;
beat-name enrichment of email digests; any `activeCity` store field (permanently
banned); auditing the remaining un-reset `selected*` fields beyond the B3 pinning
test (they belong to SF-only views until those gain dialects).
