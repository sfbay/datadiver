# Trees — SF's street trees (design spec)

**Status:** DRAFT for Fable review. No code written. Branch `feat/trees`, one PR.
**Author:** Sonnet 5.5 with Jesse, Sept. 30 2026.
**Every figure below was measured on Sept. 30 2026** against the live portal
unless it says "not probed". Re-measure before building (memory:
`feedback_delegation_brief_lessons`).

## 1. What Jesse asked for

A new **Trees** view. In Jesse's words: tree equity; tree age "comes into play
for safety — if a tree falls in San Francisco people will come here"; a tree
explorer with **linkable detail cards**; species **popularity rankings**; and
any record of **fallen or former trees**. One PR.

Success looks like: a reader can (1) open any street tree by a link and read
its card, (2) see which species dominate the city and how concentrated that
is, (3) see which neighborhoods have few street trees next to income, and (4)
see where old, large trees and fall reports cluster, without the page ever
claiming more than the records hold.

## 2. What the data can and cannot say

### 2.1 Sources (three, all Socrata on `data.sf.gov`)

| Key (new registry entry) | Id | What it is | Rows | Updated |
|---|---|---|---|---|
| `streetTrees` | `tkzw-k3nq` | Street Tree Inventory — one row per street tree standing now | 144,504 | daily |
| `streetTreeRemovals` | `qrwx-q4gg` | Street Tree Removal **Notifications** — public notices posted on a tree after a removal permit | 5,713 | daily |
| `cases311` (exists) | `vw6y-z8j6` | 311 "Tree Maintenance", detail `fallen_tree` / `about_to_fall` | 175,867 tree rows since 2008 | daily |

### 2.2 The five facts that shape the design

1. **It is STREET trees only.** Golden Gate Park has 87 trees in the list, the
   Presidio 86, Lincoln Park 11. Parks and the Presidio have their own trees
   that this dataset does not hold. Any "trees per neighborhood" figure must
   say "street trees" and must not rank park-heavy areas as treeless.
2. **The inventory forgets dead trees.** Its own description says it "does not
   include Street Trees that have been removed" and points to `qrwx-q4gg`.
   (I told Jesse earlier that no removal dataset existed; the catalog search
   missed it. This spec supersedes that answer.)
3. **A removal NOTICE is not a removal.** Numeric `treeid`s in the notices:
   5,111 distinct. **4,413 (86%) are still in today's inventory.** By notice
   year, still-listed/gone: 2017 449/90 · 2018 1,285/198 · 2019 826/130 ·
   2020 471/96 · 2021 312/50 · 2022 418/48 · 2023 413/64 · 2024 314/36.
   Even 2017 notices are 83% still listed. Possible causes (not probed): the
   permit was never executed, a tree was replanted under the same id, or the
   inventory lags. So the card says "a removal notice was posted on <date>" and
   never "removed".
4. **The notice ids changed in 2023.** 506 of 5,713 rows carry ids like
   `TRE-124769` (new asset system, 2023–2026); the inventory's `treeid` is a
   number. Those rows cannot join by id. They can only be placed by address /
   point. Disclosed in the data notes; the join is by id only.
5. **311 fall reports point at an address or a street corner, not a trunk.**
   One real report (1330 Bush St, Sept. 29 2026) has 6 street trees within 20 m
   and 37 within 45 m. A fall report can never be tied to one tree. The card
   may say "N fall reports within 30 m since 2021" and nothing stronger.

### 2.3 Field facts and traps (all measured)

- **`point` is TEXT** in `tkzw-k3nq` (the map-circle query fails with
  `type-mismatch`). Use `latitude`/`longitude`, cast `::number`, bbox. `treeid`
  is also a number there, so `treeid IN (…)` takes UNQUOTED values.
- **`species` is `"Latin :: Common"`.** 663 distinct strings. Junk forms:
  `"Tree(s) ::"` (940), `":: To Be Determine"` (81), plus ~1,100 more with an
  empty half (my blank/placeholder count: 2,164). These render as "Species not
  recorded", are EXCLUDED from ranks (never a rank-1 "Tree(s)") and counted.
- **Coverage:** latitude 138,750 of 144,504 (5,754 missing, 4.0%);
  `analysis_neighborhood` 138,748 (5,756 missing); `cnn` 144,431; `planter`
  142,813; `mapdbh` 134,967 (9,537 missing); **`planteddate` 38,599 (26.7%)**.
- **Age is not a field.** The honest proxies: trunk width `mapdbh` (inches;
  `dbhrange` 1 = 3–10, 2 = 11–20, 3 = 21–130; 93,018 / 33,152 / 18,334) and
  `planteddate` for 27% of trees. The UI says **"trunk size"** and "planted
  <year>", never "age". Trunk size grows at different rates per species, which
  belongs in the data notes.
- **Shape:** top 5 species = 36,487 trees = **25.3%** of all street trees
  (London Plane 8,943 · Brisbane Box 6,973 · NZ Xmas Tree 6,971 · Swamp Myrtle
  6,430 · Victorian Box 5,582). A monoculture-concentration fact, shown with
  its denominator.
- **Typos in the source:** `legalstatus` has `Perrmitted`, `2`, `DPW`, 442
  blanks; `planttype` is `tree` on 26 rows and `Tree` on the rest.
- **The dataset was rebuilt in place on Sept. 9 2026** (migration to a new asset
  system, Dec. 2024). Counts from before and after are not comparable; the data
  notes say so, and the snapshot is stamped with `asOf`.
- **311 vocabulary split.** `Fallen_tree` through 2024-06-11 (18,597),
  `fallen_tree` from 2024-06-13 (4,066); `About_to_fall` / `about_to_fall`
  (4,079 / 1,979). Query `lower(service_details)`. Since 2025 every
  `fallen_tree` row has a lat/long (2,983 of 2,983); **pre-2025 coverage is not
  probed** and is a generator gate (§5.3).
- **A fall report is a REPORT.** Not a confirmed fall, not an injury, not a
  death. No city dataset records tree-caused harm.

### 2.4 Is there an equity story? Yes, measured

Street trees per 1,000 residents (ACS `totalPopulation`), 38 neighborhoods with
population ≥ 2,000 (the inventory's and the census's 41 names match exactly):
**Spearman ρ = +0.56 with median income, −0.50 with poverty rate.**
Top: Seacliff 452 · Presidio Heights 317 · Potrero Hill 298 · Glen Park 298 ·
West of Twin Peaks 290. Bottom: Treasure Island 2 · Presidio 23 · Lakeshore 38 ·
Chinatown 54 · Tenderloin 54 · Twin Peaks 57.
Two bottom entries (Presidio, Treasure Island) are the park/federal-land trap
from §2.2.1 and must be footnoted in place, not hidden. The lead sentence is
written from measured ranks at build time, never assumed.

## 3. Design

### 3.1 Shape

`/trees`, viewId `trees` (the 22nd ViewId), nav right after Restaurants,
masthead **"Street trees"**, nav label "Trees", badge `TREE`, pigment **moss**
(`#7a9954` — "civic upkeep"; Restaurants took teal). `dateless` (no global era
picker): the view owns its windows (§3.4), like Restaurants. City: SF only;
Oakland's entry is absent (not probed whether Oakland publishes a tree
inventory — backlog).

Three lenses on `?lens=explore|equity|safety` (default `explore`), the
Restaurants rail-tab pattern (the tabs ARE the lenses). Map-centric: the map is
the hero (CLAUDE.md design principles).

### 3.2 Explore lens

- **Rankings rail:** species by count with rank, share of city, and a bar. "Rank
  N of M recorded species" (M = 663 distinct strings today, minus the junk forms
  of §2.3; the exact M is measured by the generator and pinned). Top 5 carry a "25.3% of all street trees" chip
  (number → mark → words, per the readouts rule).
- **Species card** (`?species=<latin>`): rank, count, size mix (three
  `dbhrange` classes as a `PartWhole`), planted-year spread where recorded,
  top neighborhoods by share. It shows NO fall-report figure per species:
  reports carry no species, so any such figure would be invented.
- **Tree card** (`?tree=<treeid>`, `DetailPanelShell`, top-right): common and
  Latin name, address line (`description`, e.g. "1215 35th Ave | Tree 1"),
  trunk size in inches and class, planted date or "Planting date not
  recorded", legal status (Significant / Landmark tree stated plainly), who
  planted and who waters it (`planter`, `waterresponsibility`), site and plot
  size, neighborhood, the species' rank, removal notices matched by id (§2.2.3,
  worded as notices), fall reports within 30 m since 2021 (count only), and a
  link to the portal row. Links are stable (`treeid` is the key). A tree that is
  not in the snapshot opens a "not in the inventory (it may have been removed)"
  note rather than a blank.
- **Search:** species (Latin + common), address. Trees are not people; the
  addresses are already public in the source (no person's name appears in any
  field). Sample pills pinned to first rows, per the `searchSamples` precedent.

### 3.3 Equity lens

- Choropleth of **street trees per 1,000 residents** over the 41 neighborhoods
  (SF's self-labelling basemap case), plus a ranked rail and a
  position-on-scale `PositionScale` against **median income** and **poverty
  rate** (existing primitive, `src/components/charts/PositionScale.tsx`).
- **Three §fairness/§accuracy rules** (CLAUDE.md transparency ruling):
  (a) the metric is named "street trees", with a standing line that parks are
  not counted; (b) neighborhoods under 2,000 residents and park-dominated ones
  (Golden Gate Park, Presidio, Lincoln Park, Treasure Island) are shown but
  flagged in place with the reason and left out of the correlation sentence;
  (c) the correlation is stated as "moves with", never "because".
- **Also shown:** share of street trees that are small (`dbhrange` 1) — a young
  tree is a sign of recent planting and of less shade today. Named "small
  trunk", not "young".
- No heat layer in this PR (no heat dataset probed; see §8).

### 3.4 Safety lens

Two signals, never combined into a "risk score", never a league table of
dangerous trees:

1. **Large trunks** (`dbhrange` 3, ≥ 21 in; 18,334 trees) and trees with a
   recorded planting year before 1990, as a count and a map layer per
   neighborhood.
2. **Fall reports**, from 311: per neighborhood, per year, **five full calendar
   years (2021–2025)** fixed and stamped, the current partial year shown
   separately ("so far in 2026"). `fallen_tree` and `about_to_fall` are two
   separate marks (a fall that happened vs a worry), never summed silently.
   Per-1,000-trees rate beside the raw count so a big neighborhood is not
   ranked just for having more trees.

Plus a **Removal notices** row: counts by notice type (24-hr / 15-day / 30-day),
with the still-listed caveat in the row itself (§2.2.3). The notice types are
shown by their published names; the page does not interpret "24hr".

Tone: a dispassionate ledger, not an alarm. Every figure names what it counts
("reports", "notices", "trees").

### 3.5 Former trees going forward

The snapshot generator (§4) keeps the prior `trees.json` tree-id set. On each
regeneration it writes a committed `public/data/trees/disappeared.json`: ids
that were present last time and are absent now, with both `asOf` dates. The
view shows "N trees left the inventory between <dates>" once a second snapshot
exists; until then it says the tracking began on <date>. This is the only way
to record "former trees" for trees the city removes without a notice. It is
labelled "left the inventory", never "removed" or "fell".

## 4. Architecture (mirrors Restaurants)

### 4.1 Data: a committed snapshot, not live rows

144,504 points cannot be aggregated live per pan, and the joins (notices, fall
reports, census) must not run in the browser (the Restaurants rule: every
cross-dataset join is precomputed by one generator). So:

- `scripts/build-trees.ts` (`pnpm build:trees`) reads the three sources, runs
  gates, and writes `public/data/trees/trees.json` (columnar, stamped `asOf`):
  per tree `[treeid, lon, lat, speciesIdx, dbhClass, mapdbh, plantedYear,
  legalIdx, planterIdx, nbhdIdx, nNotices, lastNoticeYmd, nFalls30m]` plus
  lookup tables (species, legal status, planter, neighborhood, address lines
  in a second lazy file `trees-addr.json`). Target < 2.5 MB gzip for the map
  file. The `description` address lines load on demand for the card.
- `public/data/trees/aggregates.json`: per-neighborhood and per-species
  aggregates, the fall-report counts by year, the equity table, the measured
  lead-sentence inputs.
- Leaves in `src/lib/trees/` (zero DOM, imported by BOTH generator and browser,
  like `src/lib/storefronts/`): `speciesName` (the ONE `"Latin :: Common"`
  parser + the junk-species rule), `dbhClass`, `treeKey`, `nearbyFalls`
  (grid index, 30 m rule), `noticeJoin`, `equityRows`.
- Live reads are limited to a freshness probe for the "Updated" chip
  (`max(data_as_of)`), clamped; the card links the portal row.

### 4.2 Map

- Below zoom 12: neighborhood choropleth (equity lens) or density heat
  (explore/safety), no dots. From zoom 13: circle layer of the trees, sized by
  `dbhClass`, colour by the lens (explore: by species family or selected
  species; equity: by trunk size; safety: large trunks emphasised). Because 144k
  features is heavy on phones, the dots layer is gated by zoom and by a measured
  budget (§7); a failing budget falls back to heat only on narrow viewports.
- Conventions that apply unchanged: `useMapLayer` retry pattern with cleanup;
  dense fills `belowLabels: true`; `w-full h-full` container; `desk:` not `md:`;
  micro-type tokens; glow tiers; `DetailPanelShell`.
- Camera: `?nh=` selects a neighborhood; presets come from `NEIGHBORHOOD_VIEWS`.

### 4.3 Repo wiring (the Views-pattern checklist)

1. `src/cities/manifest.ts`: add `'trees'` to `VIEW_IDS` (count 21 → 22).
2. `src/cities/sf/manifest.ts`: entry after Restaurants, `dateless: true`,
   `sources`/`staticSources`/`citable` declared; `homeCard` (order after
   Restaurants); `omniDatasetKeys`.
3. `src/App.tsx` `VIEW_COMPONENTS`: lazy `Trees`; the `Record<ViewId,…>` makes a
   miss a compile error.
4. `src/cities/sf/datasets.ts`: `streetTrees`, `streetTreeRemovals` as
   `RawDatasetConfig` with authored `publisher: {short:'Public Works', full:
   'San Francisco Public Works'}` (publisher attribution to be confirmed from
   the dataset's own page; not probed).
5. `src/lib/provenance/nonSocrata.ts`: a row for the committed snapshot
   (`kind` decided with the `sources.test.ts` scanner; see §9 Q5).
6. `src/views/About/sourceNotes.ts` + `src/views/About/sourceRows.ts` (generated
   rows): notes for both datasets; `docs/data-insights.md` → new "Street trees"
   section (the §2 facts, including the notice-not-removal join and the `TRE-`
   id split).
7. ⌘K: species and neighborhood rows; topic rows for the three lenses;
   `searchSamples.ts` pills (pinned by the existing test).
8. `CLAUDE.md` views inventory + nav-order line; memory entry; data notes
   (`dataNotes.ts`-style single table, `Data notes ›` link per tab — one copy).
9. Files under `src/views/Trees/`: `Trees.tsx`, `TreeCard.tsx`,
   `SpeciesCard.tsx`, `RankingRail.tsx`, `EquityRail.tsx`, `SafetyRail.tsx`,
   `mapLayers.ts`, `useTreeData.ts`, `treesPhrase.ts` (the writing layer: a test
   fails the build if σ/z/baseline jargon reaches reader text), `dataNotes.ts`.
   Reuse `RailStat`, `PartWhole`, `DotRow`, `RingGlyph` from
   `src/components/charts/` (readouts = marks, not sentences).

### 4.4 URL grammar

`?lens=` · `?tree=<treeid>` · `?species=<latin>` (encoded) · `?nh=<canonical
neighborhood>` · `?rank=count|perK|falls` · `useUrlSync` never touches any of
them (pinned, like `funder`). The Last 48 date params are stripped (dateless).
Stale/unknown values are silent no-ops (validated against the loaded tables).

## 5. Generator gates (refuse to write on failure)

- **G0** every `species` string parses; unknowns counted, not classed.
- **G1** inventory total equals a live `count(*)` probe within 0.5% (a snapshot
  made mid-refresh is refused).
- **G2** every lookup index resolves; every neighborhood matches the 41 census
  names exactly (today: 0 mismatches). Trees with no `analysis_neighborhood`
  (5,756) are assigned by point-in-polygon against the vendored boundary file;
  trees with no lat/long (5,754) are listed, not mapped, and counted in the
  notes.
- **G3** 311 fall-report coverage: fraction of `fallen_tree`/`about_to_fall` rows
  with lat/long, per year 2021–2025; the generator REPORTS it and fails below a
  floor set after measuring (not probed for pre-2025).
- **G4** notice join: numeric ids joined, `TRE-` ids counted and dropped from the
  join (disclosed figure = 506 rows today).
- **G5** `disappeared.json` only diffs two snapshots whose `asOf` dates differ.
- **G6** exact-pinned published figures in `src/lib/trees/trees.test.ts`
  (144,504 · 663 species · top-5 36,487 · 4,413/5,111 · per-neighborhood table).
  **Regenerating = re-pin + About notes + data-insights in the SAME commit; the
  failing pins are the checklist.**

## 6. Transparency and honesty (per CLAUDE.md §Transparency is the default)

- **Privacy:** the inventory names no person and lists public street trees; the
  address line is already public. No redaction is proposed. Flag for review
  (Q6): trees on private-yard sites appear here too (`sitetype` "Yard" in the
  notices) — still city-published.
- **Accuracy:** anything OUR inference is labelled. Trunk size ≠ age. A notice ≠
  a removal. A 311 report near a tree ≠ that tree. "Left the inventory" ≠
  "removed".
- **Fairness:** every rate beside its count and denominator; park-dominated
  neighborhoods flagged in place; correlation wording limited to "moves with".
- **"Live" is not claimed.** Headers say "Updated <date> · data.sf.gov".
- Caveats live in ONE data-notes table (single `Data notes ›` link per tab),
  grouped by surface; chrome stays clean.

## 7. Verification

- Unit: every leaf in `src/lib/trees/` (species parser incl. all junk forms,
  dbh classes at the boundaries 10/11 and 20/21, 30 m nearby rule with
  synthetic points, notice join with numeric and `TRE-` ids, equity rows with
  the exclusion flags), `treesPhrase` jargon ban, URL-state sanitizing, manifest
  pins (`sources.test.ts`: fetched ⇔ declared ⇔ tagged).
- Generator: dry-run against live data; output sizes; `pnpm build:trees` twice
  to prove `disappeared.json` logic with a fabricated earlier snapshot.
- `~/dev/devman/tools/devman-build.mjs pnpm build` and `pnpm test`; `npx tsc
  -b`; `scripts/check-entry-bundle.mjs` (snapshot not in the entry bundle).
- **Browser walk before merge** (Chrome Dev, tab foregrounded,
  `document.hidden === false`): a `?tree=` deep link; species card; equity lens
  against a neighborhood with known figures; safety lens; 144k dots frame time
  on Jesse's machine and a mobile viewport (the performance budget in §4.2 is a
  measured pass/fail, not a guess); light + dark; Large Type XL.
- Data spot-checks against the portal for three trees and two neighborhoods.

## 8. Out of scope (banked for later)

- **Heat / canopy layer** ("next to income and heat" in the brief). I found no
  heat dataset in the probes; SF's urban canopy layer and CalEnviroScreen are
  NOT probed. Needs its own recon before a promise.
- **Trees per street mile** (would beat per-resident): the `cnn` street id is
  in 144,431 rows; a centerline-length source is not probed.
- **Park trees** (Rec & Park) and **Oakland** inventory: not probed.
- A scheduled job that regenerates the snapshot daily; species photos; alert
  emails for removal notices (would be a new alerts stream: separate spec).
- Any "hazardous tree" list or per-tree risk score: deliberately excluded.
- **The residential streets of Lakeshore and Twin Peaks** (flagged park-heavy by ruling R20, Sept. 30, 2026): a finer analysis by census tract or per street mile, so their streets can be ranked without the parkland that dominates both neighborhoods.
- **How long a stump stands** (ruling R23, Oct. 1, 2026): once several dated snapshots exist, `disappeared.json` could measure how long a stump stands before its site is replanted or leaves the inventory, by neighborhood — but only after the log also records each site's class (stump, tree), which it does not yet (data-insights.md → Street trees → Stumps).

## 9. Questions for Fable's review

1. **Snapshot vs live.** Is a committed, daily-stale `trees.json` (asOf-stamped,
   Restaurants precedent) right for a dataset that updates daily, given the map
   needs all 144k points and the joins must be precomputed? The alternative is
   paged live fetches (3 × 50k) plus a live aggregate per species. My lean:
   snapshot.
2. **144k dots.** Is zoom-gated circles + heat below zoom 12 the right budget,
   or should the points ship as vector tiles / a binary buffer? What is the
   measured frame-time pass line?
3. **Equity denominator.** Per 1,000 residents (measured, simple) vs per street
   mile (better, needs a new source). Ship the first, bank the second?
4. **Fall-report window and radius.** Five full years + partial current year,
   30 m radius, two marks not summed. Sound, given geocoded-to-address points?
5. **Provenance shape.** How should the committed snapshot register in
   `NON_SOCRATA` and `sources.test.ts` so that "fetched ⇔ declared ⇔ tagged"
   holds when the tree/notice/311 datasets are read only by the generator?
   (The Restaurants file's `staticSources` precedent suggests a `snapshot` kind.)
6. **Privacy call.** Any objection to showing the full address line on each tree
   card? (My read: public source, no person named, no added harm.)
7. **Naming.** Nav "Trees", masthead "Street trees": does the masthead carry
   enough of the "parks not included" message, or does it need to be in the
   title?
8. **Does the notice-vs-inventory 86% gap deserve a corrections-style public
   note** in About once the view ships (it is a FINDING about the upstream, not
   a correction of ours per the corrections-log threshold)? My read: a
   data-insights + About-findings entry, not a corrections entry.

## 10. Fable review (Sept. 30 2026) — SUPERSEDES the sections above where they conflict

**Verdict: the shape is right; build it. But seven measured claims above are
wrong or incomplete, and two of them would have published wrong figures.** The
three-lens design, the committed-snapshot architecture, the "notice is not a
removal" and "a report is not a tree" rules, and the no-risk-score stance all
stand. Every figure below was re-measured against the live portal on Sept. 30
2026; the probes are described so the plan can re-run them.

### 10.1 Corrections to the facts (required before the plan)

1. **`treeid` names a SITE, not a tree** (changes §2.2.3, §3.2, §3.5). Of the
   4,831 noticed ids still in the inventory, **1,022 now hold a tree whose
   `planteddate` is AFTER the notice**: the old tree went, a new one was
   planted, the id stayed. So the "86% still listed" figure mostly measures
   replanting and missing plant dates, not unexecuted permits. Rules: a notice
   dated before the tree's planting date is shown as "a removal notice was
   posted for an earlier tree at this site", never attached to the living
   tree; with no planting date (3,328 sites) the card says only "a removal
   notice was posted at this site on <date>". A `?tree=` link is a link to a
   site. The `disappeared.json` diff (§3.5) catches vanished SITES only; a
   same-site replacement shows up as a changed species or planting date, so
   the diff must record those too.
2. **The `TRE-` notice ids DO join** (replaces §2.2.4, gate G4). Strip the
   prefix: 432 of the 477 distinct `TRE-` ids are inventory `treeid`s and the
   address line matches on 453 of 503 rows. All-ids result: 5,571 distinct
   notice ids → 4,831 listed, 740 absent. The old figures (5,111 / 4,413 / 698,
   "506 cannot join") are retired.
3. **The inventory holds non-trees** (changes §2.3, G0, every count). Despite
   its description: **1,483 planting sites** (`Planting site (plant|cut|pave)`),
   **635 stumps** (`Stump`, `Stump (use Grinder)`, `Stump (hand Remove)`) and
   **65 shrubs**. The generator needs an authored row class (tree / stump /
   empty site / shrub / unknown), the `foodPermits.ts` pattern: every published
   string classed, an unclassed string fails the build. Headline counts are
   TREES only. **The 635 stumps are the one direct record of former trees in
   the inventory** and get their own mark on the map and in the Safety lens
   ("a stump stands here"), which answers Jesse's "former trees" question today
   rather than only going forward.
4. **Species parsing** (replaces the "2,164" figure and the "Species not
   recorded" rule in §2.3). Measured over 664 groups: 1,224 rows NULL; 523 rows
   a valid Latin name with NO `::` at all (`Acer buergerianum`); 1,509 rows with
   an empty common-name half, of which 940 are the placeholder `Tree(s) ::` and
   the rest real species (`patanus racemosa ::`, 177); 101 rows with an empty
   Latin half (`:: To Be Determine`, 81). A Latin-only row is a RECORDED species
   and ranks under its Latin name. Only NULL, `Tree(s)` and `To Be Determine`
   are "species not recorded". The notices dataset separates with ` : ` (one
   colon), so the shared parser must take both.
5. **Top-five share is 34,899 trees (24.2%), not 36,487 (25.3%)** (§2.3, G6).
   The spec's query matched by prefix and swept in cultivars. Rankings use the
   published string VERBATIM: no merging of cultivars or typo'd spellings by
   similarity (the crime-subcategory rule: a merge is authored and evidenced,
   or it does not happen). Say so in the data notes.
6. **Large trunks are 8,797, not 18,334** (§3.4). All 9,537 rows with no
   `mapdbh` are coded `dbhrange` 3, the LARGE class. Never read `dbhrange`;
   derive the class from `mapdbh` and give unmeasured trees their own class.
   Also: `mapdbh` is exactly 3 on 41,307 trees (29%), including 1,215 planted
   before 2000, so it is the size AS LAST RECORDED (often planting size), with
   no measurement date published. 635 rows exceed 60 inches. Consequences: the
   label is "trunk size as recorded"; the Equity lens's "share of small trunks"
   metric (§3.3) is DROPPED, since it would measure record-keeping.
7. **Drop the "planted before 1990" layer** (§3.4). Only 2,781 trees carry a
   pre-1990 date, and date coverage follows who planted the tree (Friends of
   the Urban Forest 91%, Public Works 40%, private 20%), not how old it is.
   `planteddate` is also a TEXT column (ISO strings; compare as text, no date
   functions). Planting year stays on the tree card only.
8. **311 fall reports: three fixes** (§2.3, §3.4, G3).
   (a) "Every row has a point" was wrong: non-null is not valid. Of 13,508
   reports since 2021, **2,161 (16%) sit at latitude 0, longitude 0** (phone
   reports, 2021–2024; 1,551 of them in 2023) and carry no neighborhood. They
   count citywide and are disclosed as unplaced; per-neighborhood figures name
   the placed share. (b) **2,421 (18%) were closed by the city as duplicates**
   (`status_notes` contains "Duplicate"). Exclude them, using the city's own
   mark; do NOT invent our own clustering of nearby reports. (c) Years are
   storm-shaped: 2021 1,347 · 2022 722 · **2023 5,505** · 2024 2,951 · 2025
   1,858, with 664 reports on March 21 2023 alone. Show the years as a strip,
   never one five-year total, and no year-over-year verdicts. The dataset has
   its own `analysis_neighborhood` column, so no point-in-polygon step is needed.
9. **Unmappable trees cannot be rescued** (G2). The 5,754 rows without
   latitude have no `xcoord` either, only an address line. They are counted
   citywide, excluded from the map and from neighborhood figures, and
   disclosed (4.0%). Point-in-polygon rescues two rows, not 5,756.

### 10.2 The equity finding depends on the denominator (Jesse ruled Sept. 30, 2026: show both)

Re-measured with the park and federal-land areas removed (36 neighborhoods):

| Street trees… | vs median income | vs poverty rate |
|---|---|---|
| per 1,000 residents | ρ +0.65 | ρ −0.58 |
| per square kilometre of land | ρ +0.33 | ρ −0.17 |

Per resident punishes density by construction: the Tenderloin ranks 34th of 36
per resident and 15th per area; Bayview Hunters Point ranks 6th per resident
and 33rd per area. One measure alone would let the page assert a finding the
other measure does not support. Land area is computable today from the
vendored boundary file, so no new source is needed. **Requirement: the Equity
lens shows both measures side by side (`?rank=perK|perKm2`), and the lead
sentence states only what holds under both.** Street miles stays banked.

### 10.3 Answers to the review questions (§9)

1. **Snapshot: yes.** The precedent exists: `kind: 'derived'` in `NON_SOCRATA`
   (`dd-storefront-histories`), with `generator` and `servedPath`. Add
   `dd-street-trees`. One change: the tree CARD fetches its row live by
   `treeid` (one cheap query, always current, and it removes the need for the
   `trees-addr.json` file); the snapshot supplies the map, the aggregates and
   the precomputed joins. A site in the snapshot that the live fetch no longer
   returns renders the "left the inventory" note.
2. **Dots: measure first.** Task 1 of the plan is a throwaway spike: all points
   as one GeoJSON source, circle layer with `minzoom` 13, on Jesse's laptop and
   a phone. Pass line: snapshot parse plus source load under 1 s on the laptop,
   no frame over 50 ms while panning at zoom 14. Only a failed spike justifies
   vector tiles.
3. **Denominator:** §10.2.
4. **Window and radius:** 30 m and "reports nearby" stand; apply §10.1.8.
5. **Provenance:** Restaurants is the model. `sources` lists only what the
   browser fetches (`streetTrees` for the card and the freshness probe);
   `streetTreeRemovals` and the 311 fall reports are generator-only and ride
   `staticSources: ['dd-street-trees', 'sf-analysis-neighborhoods',
   'acs-2023-5yr']`. `homeCard.order` is 16 (its own sequence, not nav order).
6. **Privacy:** no objection. No person is named in any field.
7. **Naming:** "Trees" in the nav, "Street trees" as the masthead. The
   parks-not-counted line sits in the Equity lens, where it changes a reading.
8. **Agreed:** a finding for data-insights and About, not a corrections entry.

### 10.4 Banked leads (not this PR)

- The archived list (`uzd4-f6yf`, 198,436 rows) holds **62,464 ids absent from
  today's inventory**; 135,972 ids are shared, and in a 284-id sample 279 kept
  the same species. It may be a backfill of former trees, but the city retired
  it for "outstanding data issues", so removal cannot be told from cleanup
  without more work.
- Whether the notice rows' species describes the old tree or the site's current
  state is unresolved (some notices read `Planting site (cut)`); do not print a
  "former species" from the notices until it is.
