# Elections — real precinct & neighborhood results

**Date:** 2026-07-14
**Status:** design approved (Jesse), implementation delegated
**Supersedes:** the citywide-only election data model shipped with the Elections view

## The problem

Every race, candidate and turnout figure in the Elections view is a **citywide**
number. `public/data/elections/results/<dateCode>/summary.json` contains no
precinct or neighborhood dimension at all — the strings "precinct" and
"neighborhood" appear zero times in it. Selecting Hayes Valley and selecting
Financial District therefore show identical results, because they *are*
identical.

Worse, the map does not render that absence honestly. `Elections.tsx` fabricates
visual variation:

```ts
const distFactor = (district % 11) / 11        // dominant supervisor district
const fillOpacity = 0.15 + distFactor * 0.35   // 0.15 – 0.50
```

Neighborhood shading is derived from a **supervisor-district id, modulo 11**.
The inline comment states the intent: *"This gives each neighborhood a distinct
look even with citywide data."* A reader decodes shade as signal; the shade
encodes nothing. The Turnout and Margin modes are the same — both paint a single
citywide constant onto all 41 polygons.

A disclosure banner ("neighborhood-level data coming soon") does not cure a
fabricated encoding: the banner says the data is absent while the map
simultaneously *shows* variation. This violates the project's data-transparency
principle (present / suppressed / absent) and is the one thing in DataDiver that
is a data-integrity fault rather than a limitation.

## The data actually exists

The old pipeline (`scripts/build-election-archive.ts`) fetches
`sfelections.org/results/<dateCode>/data/summary.xml` — citywide by
construction. It never asks for anything else.

The real reports live in a **parallel `w`-suffixed archive**
(`/results/<dateCode>w/detail.html`, or `detail.php` for older elections), which
lists, per certification drop:

| File | Grain | Content |
|---|---|---|
| `sov.xlsx` | **precinct** | Statement of the Vote — per-candidate votes, ED/VBM split, registration, turnout |
| `dsov.xlsx` | **neighborhood** | District & Neighborhood SOV — the same, pre-aggregated by neighborhood |

A `p` prefix (`psov` / `dpsov`) marks a **preliminary** daily drop. Unprefixed =
certified final. 2020 prefixes its finals with a date (`20201201_dsov.xlsx`).

**DataSF publishes election precinct *boundaries* but zero election *results*** —
the Department of Elections does not push results to the open-data portal at all.
sfelections.org is the only source, and it is HTML-scraped, not an API.

## The trap: precinct ids are not stable across redistricting

SF renumbered precincts in the 2022 redistricting. **Precinct 1101 in 2020 is not
precinct 1101 in 2025.** The ids match as strings and lie as geography.

Three approaches were tested against SF's own certified neighborhood totals for a
single quantity (registered voters — the easiest number in the file):

| Approach | Reconciles? |
|---|---|
| 2020 precinct ids × the repo's existing 2025 crosswalk | **4/27** — 114 precincts (97,831 voters, 19% of the electorate) unmapped |
| Spatial join, max-overlap area, precinct → Analysis Neighborhood | **20/40** — boundary-straddling precincts land in the wrong neighborhood (`GLEN PARK +1,204` / `NOE VALLEY −1,204`, exactly offsetting) |
| **Era-correct file's own official label** (`neigh22` on `prec_2022`) | **35/40 exact — delta zero** |

Every failing approach produced a plausible map and threw no error. Only
reconciliation against a certified number distinguishes them.

The 5 non-reconciling neighborhoods in the winning approach are all *undercounts*
summing to **−1,215**, which is exactly the gap between the precinct file's total
registration (521,050) and certified citywide (522,265). ~1,215 voters live in
precincts that appear in neighborhood totals but have **no row in the
precinct-level report** — SF suppresses very small precincts to protect ballot
secrecy. This is why the neighborhood file must be read as ground truth, not
derived from precincts.

## Design

**Precinct is the hero grain.** ~500–600 polygons per election, straight from the
certified `sov.xlsx`, joined to geometry by precinct id **within its own era**. No
crosswalk anywhere; exact for every election. The 2024 presidential race spans
38.9 points precinct-to-precinct (PCT 7039 at 41.8% Trump → PCT 7805 at 2.9%)
versus 29.3 across neighborhoods — precinct is where the texture is.

**Neighborhood grain reads `dsov.xlsx` directly.** We do not derive it; SF already
computed and certified it. Exact by construction.

**Geometry is era-scoped.** Each election is pinned to the precinct vintage in
force when it was held:

| Era | Source | Id field | Neighborhood field | Scheme | Covers |
|---|---|---|---|---|---|
| `prec_2012` | DataSF `bsfq-aeyw` | `prec_2012` | `neighrep` | legacy 26 | Nov 2020, Jun 2022 |
| `prec_2022` | DataSF `d6x4-hefw` | `prec_2022` | `neigh22` | Analysis 41 | Nov 2022 → |

**SF changed neighborhood schemes at the November 2022 election**, with
redistricting. Before: 26 coarse abbreviated names (`BAYVW/HTRSPT`, `SOMA`,
`CVC CTR/DWTN`). After: the 41 Analysis Neighborhoods DataDiver is built on. The
legacy scheme is coarser (one `RICHMOND` where the modern scheme has Inner and
Outer) and **cannot be crosswalked upward** — the detail is not in the file.

Consequently each election renders **its own era's neighborhoods**, with polygons
dissolved from that era's precincts. Numbers always match the certified file, and
the map honestly morphs across the redistricting break. The scheme change is
disclosed rather than smoothed over.

## Twelve precincts in the legacy era have no geometry anywhere

Surfaced by the delegate and confirmed independently: 12 precinct ids in the 2020
`sov.xlsx` — `7055, 7056, 7649, 7651–7657, 7876, 7959` — resolve to no feature in
`prec_2012.geojson`. They carry real votes (roughly 460–1,250 voters each), and
the same 12 recur in June 2022.

There is no fix, because there is no data:

- Both DataSF "2012" precinct datasets (`bsfq-aeyw`, `fhns-n8qp`) are the **same
  605-row file, last updated 2016-07-13**. The "2012 definition" is really a 2016
  snapshot, and SF created precincts between it and the 2020 election.
- Of the 12, only `7055` and `7056` appear in `prec_2022`. The other **ten exist in
  neither published boundary file** — created after the snapshot, renumbered away
  before 2022.
- Berkeley's Statewide Database has no retrievable SF precinct shapefile for G20.

Borrowing 2022 geometry for a 2020 id is precisely the false-friend error this
design exists to prevent, so we don't.

| | Nov 2020 | Jun 2022 |
|---|---|---|
| Unmappable precincts | 12 of 588 | 12 of 589 |
| Registered voters | 9,544 (**1.84%**) | 9,410 (**1.91%**) |

**This affects only the precinct map, and only for those two elections.**
Neighborhood and citywide figures read `dsov.xlsx` directly, which includes these
voters — they are counted, they simply cannot be drawn. The generator emits them
as `unmapped` with their totals intact, surfaces the residual, and holds them in a
single pinned allow-list. Any unresolved precinct **not** on that list is a hard
build failure. `prec_2022` has zero orphans across all four of its elections.

## Reconciliation is a build gate, not a test

The generator MUST fail the build unless, for every election:

1. Σ(precinct registration) + suppressed = certified citywide registration.
2. Σ(precinct votes per contest) = certified citywide votes for that contest.
3. Every precinct row in `sov.xlsx` resolves to geometry in its era.
4. Neighborhood totals emitted == the certified `dsov.xlsx` figures, exactly.
5. Suppressed-precinct residual is reported explicitly, never silently absorbed.

These gates are what caught all three traps above. A warning would not have.

## Edge cases the parser must handle (not assume away)

- **Consolidated precinct rows**: `PCT 1104/1105` — one row, several precincts.
  Present in 2020; absent in 2024; heavy in the Nov 2025 special (100 rows for a
  ~500-precinct city). Registration cannot simply be attributed to the first id.
- **Special elections** consolidate precincts aggressively and may carry a single
  contest (Nov 2025 = Proposition 50 only).
- **Suppressed precincts** — in `dsov` but not `sov`. Must be surfaced, not dropped.
- **RCV contests** carry round-by-round data in a separate report.
- **Report sheets are paginated** (`Page: N of M`) with repeated headers.

## Out of scope (this pass)

- Cast Vote Record ingestion (per-ballot data) — a later, much larger project.
- Deriving modern-scheme neighborhood numbers for pre-2022 elections. The
  precinct grain already gives full spatial resolution for those years; inventing
  neighborhood aggregates SF never certified would be exactly the sin this
  redesign exists to remove.

## Known follow-ups surfaced during design

- `useNeighborhoodBoundaries` fetches SF neighborhood polygons from a **raw
  GitHub URL** (`sfbrigade/data-science-wg`) at runtime — an availability and
  supply-chain dependency on a volunteer repo for a core map layer.
- Elections is absent from the About sources table.
- Elections never received the earth-tone palette migration (62 raw `slate-*` hits).
