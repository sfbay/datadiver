# Crime subcategory drill + "What's moving" — design

**Date:** 2026-08-31
**Scope:** SF Crime Incidents (`/crime-incidents`), the civic ticker, and the
crime deep-link grammar. Oakland is untouched.
**Status:** approved (Jesse, 2026-08-31), amended same day (§4 `kind`, §12).
**Prerequisite:** the distinct-incident count fix ships FIRST, in its own PR
(§12). This spec's counts assume it has landed.

## 1. Why

DataDiver ranks SF crime by `incident_category` — 49 values, several of which
are so coarse they hide the story. "Larceny Theft" is 57,944 incidents a year
and reads as one undifferentiated block.

The fix needs no heuristic. SFPD already publishes a finer grain we fetch and
then throw away:

| Level | Field | Distinct (2024+) | Example |
|---|---|---|---|
| Rendered today | `incident_category` | 49 | Larceny Theft — 57,944 |
| **Fetched, never surfaced** | `incident_subcategory` | 71 | **Larceny Theft - Shoplifting — 8,786** |
| Detail panel only | `incident_description` | 753 | "Theft, Other Property, $50–$200" |

`incident_subcategory` is already in `SELECT_FIELDS` (`useCrimeEraData.ts:47`)
and already rendered in `CrimeDetailPanel`. Nothing in the filter, the sidebar
ranking, the ticker, or the URL can address it.

This is deliberately the safe half of the problem. A word-match heuristic over
`incident_description` ("does the text contain 'shoplift'?") would make
DataDiver the author of a classification SFPD never made. Reading a column the
publisher already coded is display, not authorship. `incident_description`
(753 values, charge-level, carries dollar thresholds) stays where it is — in
the detail panel — and is explicitly out of scope.

## 2. Probe evidence (measured 2026-08-31, live)

Windows: **current** = 2025-08-01 → 2026-08-01, **prior** = 2024-08-01 →
2025-08-01. 96 distinct `(category, subcategory)` pairs in the current window.

### 2.1 The raw mover scan, floor 150

| Change | Now | Prior | Pair |
|---|---|---|---|
| +108% | 379 | 182 | Traffic Collision \| Hit & Run |
| +91% | 1,155 | 604 | *Traffic Violation Arrest \| Traffic Violation Arrest* |
| +66% | 312 | 188 | *Other Offenses \| Other* |
| +61% | 8,663 | 5,375 | Drug Offense \| Drug Violation |
| −54% | 372 | 812 | Burglary \| Burglary - Commercial |
| −51% | 526 | 1,083 | *Other Miscellaneous \| Loitering* |
| −44% | 903 | 1,603 | Larceny Theft \| Theft From Vehicle |
| −39% | 2,230 | 3,654 | *Recovered Vehicle \| Recovered Vehicle* |
| −37% | 4,349 | 6,917 | **Larceny Theft \| Larceny - From Vehicle** |
| +34% | 3,363 | 2,512 | *Warrant \| Warrant* |
| −32% | 3,432 | 5,073 | Motor Vehicle Theft \| Motor Vehicle Theft |

Italicised rows measure **police activity or record-keeping**, not crime.
Warrants served, traffic stops made, cases closed, vehicles recovered: an
unfiltered mover scan puts them on the front page and they say nothing about
the city. A purely mechanical ranker is therefore not shippable.

Meanwhile **shoplifting is flat** (3,269 vs 3,245, +1%) and would never appear
in a mover scan — although it is one of the most contested crime figures in
SF politics. Newsworthiness is not a function the data carries.

Hence: mechanical detection, **authored curation**, gated. Same shape as the
59 Oakland beat names, the 30 authored parking-violation labels, and the
consultant crosswalks.

### 2.2 Load-bearing data traps found in the probe

1. **A subcategory's identity is the PAIR, never the string.**
   `Vandalism` exists under `Malicious Mischief` (4,867) *and* under
   `Vandalism` (152). `Drug Violation` exists under `Drug Offense` (8,663)
   *and* `Disorderly Conduct` (591). `Weapons Offense` exists under
   `Weapons Offense` (752) *and* `Weapons Carrying Etc` (664). `Other` appears
   under at least seven parents. Grouping, keying, filtering, and the watch
   table all key on `` `${category}|${subcategory}` ``. A flat list keyed on
   the subcategory string alone would silently merge unlike things or emit
   duplicate-looking rows.

2. **SFPD publishes two live strings for vehicle break-ins.**
   `Larceny Theft | Larceny - From Vehicle` (4,349) and
   `Larceny Theft | Theft From Vehicle` (903) are the same concept, both
   currently populated, both declining. Rendering only the larger one
   understates the real figure by ~17%. Handled by an authored `merge` field
   (§4.2) — never by an inferred string-similarity rule.

3. **Pre-2018 has no subcategory at all.** The historical extract
   (`tmnf-yvry`) normalises `incident_subcategory` to `''`
   (`crimeEra.ts:263`). Every affordance in this spec is withheld on a range
   that touches the historical era, alongside the note the category filter
   already renders.

4. **Empty-string subcategories exist in the modern set too** and are excluded
   from ranking (they carry no information the category doesn't).

### 2.3 A live bug this work fixes

`useCivicIndicators.ts:441` deep-links the violent-crime ticker card with
`params: { categories: 'violent' }`. `CrimeIncidents.tsx:96` parses
`?categories=` as a comma list of **literal category names** — `violent` is
not one, so the WHERE becomes `incident_category IN ('violent')` and the card
lands the reader on an empty view. It is broken in production today. Fixed
here, and pinned by a test (§7).

## 3. What ships

1. A **turn-down drill** in the sidebar Categories list: each category opens
   into its subcategories.
2. Plain-English subcategory names — mechanical prefix strip plus authored
   overrides.
3. A **"What's moving" strip** at the top of that list: three chips, curated
   plus mechanical.
4. **One new ticker card** carrying the top mover site-wide, and the existing
   violent-crime card's link repaired.
5. **`?sub=` URL grammar**, OR'd with the existing `?categories=`.

Explicitly **out of scope**: `incident_description`; Oakland (its dialect has
no subcategory column); 311 `service_details` (the same opportunity, deferred
to its own PR by Jesse's ruling); any subcategory dimension in the Pulse
anomaly wire — Pulse's per-neighborhood engine runs on the Last 48 streams
(911 / Fire-EMS / 311) and crime is deliberately not one of them.

## 4. The curation layer

### 4.1 File

`src/views/CrimeIncidents/subcategoryWatch.ts` — a **pure leaf with zero
imports**, so the ranker, the view, and the ticker engine can all read it
without a cycle.

### 4.2 Shape

```ts
/** What a bucket MEASURES. Jesse's ruling, 2026-08-31: the buckets a
 *  mechanical scan gets wrong are not noise — they are a different
 *  variable, and silencing them threw away the more interesting one. */
export type SubcategoryKind =
  | 'crime'        // offences reported. Ranks the strip. The DEFAULT.
  | 'enforcement'  // DISCRETIONARY police activity: warrants served,
                   // traffic-violation arrests, drug violations, vehicle
                   // recoveries. Its own lens and eyebrow; never mixed into
                   // a crime headline, never silenced.
  | 'admin'        // record-keeping with no civic reading: case closures,
                   // lost property, `Other | Other`. The only kind muted.

export interface WatchEntry {
  /** Display name. Overrides the mechanical prefix strip. */
  label?: string
  /** What this bucket measures. Absent from the table = 'crime'. */
  kind?: SubcategoryKind
  /** True = a curated beat: always eligible, owns a reserved strip slot.
   *  A watched bucket may be any kind — an enforcement beat is watched on
   *  the enforcement lens, not the crime strip. */
  watch?: true
  /** One editorial line. Rendered as the chip's title attribute. */
  note?: string
  /** Additional pair keys folded into this display bucket. Display-only,
   *  authored, disclosed — never inferred from string similarity. The
   *  merged pairs' counts are summed and their rows are hidden from the
   *  sidebar drill (they'd otherwise double-report). */
  merge?: string[]
}

export const SUBCATEGORY_WATCH: Record<string, WatchEntry> = { /* §4.3 */ }
```

Key format: `` `${incident_category}|${incident_subcategory}` `` — exact
published strings, no case folding, no trimming. A key that matches nothing in
the live vocabulary is inert (SFPD may retire a value); a live pair with no
key is unlisted, which is the useful default.

### 4.3 Authored starters

**`kind: 'crime'`, watched (8)** — the strip ranks these:

| Key | Label |
|---|---|
| `Larceny Theft\|Larceny - From Vehicle` | Car break-ins *(merges `Larceny Theft\|Theft From Vehicle`)* |
| `Larceny Theft\|Larceny Theft - Shoplifting` | Shoplifting |
| `Motor Vehicle Theft\|Motor Vehicle Theft` | Car theft |
| `Burglary\|Burglary - Residential` | Home burglaries |
| `Burglary\|Burglary - Commercial` | Business burglaries |
| `Assault\|Aggravated Assault` | Aggravated assault |
| `Robbery\|Robbery - Street` | Street robberies |
| `Malicious Mischief\|Vandalism` | Vandalism |

**`kind: 'enforcement'` (6), all watched** — discretionary police activity:

| Key | Label |
|---|---|
| `Drug Offense\|Drug Violation` | Drug enforcement |
| `Warrant\|Warrant` | Warrants served |
| `Warrant\|Other` | Warrant arrests |
| `Traffic Violation Arrest\|Traffic Violation Arrest` | Traffic-stop arrests |
| `Recovered Vehicle\|Recovered Vehicle` | Vehicles recovered |
| `Other Miscellaneous\|Trespass` | Trespass enforcement |

**`Drug Offense | Drug Violation` was mis-filed as a crime beat in the first
draft of this spec** and won the strip's top slot at "+61%". Drug violations
are almost entirely arrest-generated: the number moves when policing changes,
not when drug use changes. Its 44% duplicate inflation (§12) is the tell —
many charges per arrest. Reading it as a crime surge would have been a
confident, wrong headline on the front of the view.

**`kind: 'admin'` (8), muted** — `Other Miscellaneous|Other`, `Other|Other`,
`Other Offenses|Other`, `Other Offenses|Other Offenses`,
`Non-Criminal|Non-Criminal`, `Non-Criminal|Other`,
`Lost Property|Lost Property`, `Case Closure|Case Closure`.

Muting is a **headline gate only**. Admin pairs stay in the sidebar list, stay
selectable, and stay in every total. Nothing is hidden from the data.

`Miscellaneous Investigation` and `Suspicious Occ` stay `crime`/unwatched
rather than admin: they are genuine calls for service, merely vague.

## 5. The ranker

`src/views/CrimeIncidents/subcategoryMovers.ts` — pure, Vitest-covered, no
React, no network.

```ts
export const MIN_COUNT = 150
export const STRIP_SLOTS = 3
export const WATCH_SLOTS = 2

export interface MoverInput {
  key: string           // `${category}|${subcategory}`
  category: string
  subcategory: string
  current: number
  prior: number
}

export interface Mover {
  key: string
  category: string
  subcategory: string
  label: string         // authored label ?? prefix-stripped ?? raw string
  current: number
  prior: number
  delta: number         // signed percent
  kind: SubcategoryKind
  watched: boolean
  note?: string
  /** Every pair key this chip's filter must match (self + authored merges). */
  keys: string[]
}

export function rankMovers(rows: MoverInput[], slots?: number): Mover[]
```

**Fold** authored merges first: a merged pair's counts are summed into its
target and the merged row is dropped.

**Eligibility** — all four must hold:
- `current >= MIN_COUNT` **and** `prior >= MIN_COUNT` (a percent off a tiny
  prior window is noise, in both directions)
- `kind !== 'admin'`
- the mover's `kind` matches the lens being ranked (`crime` for the strip)
- `subcategory !== ''`
- `prior > 0`

**Score:** `|delta| * log10(current)`. Volume is a damper, not a rank: a 40%
move on 8,786 incidents outranks a 60% move on 200. Both of Jesse's signals
are present in one number, which is why there is no separate "biggest volume"
mode — a big flat bucket has no story, and a big moving one wins anyway.

**Slots:** top `WATCH_SLOTS` by score among watched entries of the lens's kind; then the
remaining slot prefers the top-scoring **unlisted** mover, falling back to the
next `watch` entry when no unlisted one qualifies. Curation cannot crowd out
discovery; discovery cannot leave a hole.

**Tie-break** (deterministic, no unstable sort): higher `current`, then `key`
ascending.

**Fewer than one eligible mover** → the caller renders one muted line, not an
empty strip and not silence. Present / suppressed / absent stay distinguishable.

### 5.1 Labels

`subcategoryLabel(category, subcategory)`, also pure:
1. authored `label`, else
2. strip a leading `` `${category} - ` `` or `` `${category} ` `` prefix
   (`Larceny Theft - Shoplifting` → `Shoplifting`,
   `Burglary - Residential` → `Residential`), else
3. the raw published string.

Display only. The published string stays canonical in state, URL, WHERE
clauses, and the detail panel.

## 6. Surfaces

### 6.1 Sidebar drill

`IncidentCategoryFilter.tsx` gains an optional `subcategories` prop
(`Map<string, {subcategory, count}[]>`, keyed by category). Each category row
gets a chevron; open reveals indented subcategory rows with their own
checkbox, count, and mini bar. Categories with one subcategory equal to the
category name render no chevron.

Selection is a **union of nodes**: a checked category means all of it, a
checked subcategory means that pair. Checking a category unchecks its own
subcategories (they are redundant). SF only — Oakland passes nothing and is
byte-identical.

### 6.2 The strip

`SubcategoryStrip.tsx`, rendered at the top of the Categories tab above the
quick-group buttons.

```
── WHAT'S MOVING                       vs the prior 12 months
[ Car break-ins  −38% ]  [ Business burglaries  −54% ]  [ Hit & run  +108% ]
```

Worked against §2.1's live counts with Drug enforcement correctly excluded
from the crime lens, the two watch slots go to Car break-ins (merged:
`38.4 × log10 5,252` = 143) and Business burglaries (`54.2 × log10 372` =
139), and the open slot to the unlisted Hit & Run (`108 × log10 379` = 278).
Note the open slot outscoring both curated ones — the reserved slots exist
precisely so that cannot displace a followed beat.

The **enforcement lens** is a second eyebrow beneath the crime strip, same
chip idiom, ranked over `kind: 'enforcement'`, labelled
"── ENFORCEMENT ACTIVITY · what police chose to act on". It is never merged
into the crime ranking and never contributes a ticker card in this PR.

Chips are brick-pigment (the Crime view's colour), signed delta in mono
tabular figures, `title` carrying the authored note plus both raw counts.
Click selects that chip's `keys` as the subcategory selection.

One muted line beneath: the comparison label plus
"Ranked by change on buckets with 150+ incidents in both windows.
Administrative categories are excluded." Full methodology in About.

### 6.3 Windows and the lag clamp

The strip compares the view's **active `dateRange`** against the window the
view's existing **Compare** setting resolves (`resolveComparisonStart`), and
labels it with `comparisonLabel`. One time system, one compare system, no new
concepts, and the strip moves when the Era Track brush moves.

**The clamp is load-bearing.** SFPD publishes a few days behind. An unclamped
current window is short while the prior window is full, which fabricates a
decline on every bucket at once. The current window's end clamps to
`MAX(incident_datetime)` — already fetched by `useDataFreshness` in this view —
and the comparison window is shifted by the **clamped** length. This is the
same rule Traffic Safety uses for YoY (CLAUDE.md → Trend Infrastructure); it
is the single most likely way this feature ships a confident lie.

If `comparisonMode` is null (compare off), the strip falls back to the
immediately preceding window of equal clamped length and labels it
"vs the previous {N} days".

### 6.4 Ticker

`useCivicIndicators.ts`:
- **New** `fetchCrimeSubcategoryMover(ctx)` — two grouped queries over the
  engine's existing YoY window, ranked by the **same** `rankMovers`, taking
  slot 1. Emits one `TickerItem` — on today's data, headline
  *"Car break-ins down 38% vs a year ago"*, value `4,340`, deep link
  `{ sub: 'Larceny Theft|Larceny - From Vehicle,Larceny Theft|Theft From Vehicle' }`. A merged chip emits every key it
  folds, comma-joined (§8). Returns `null` when nothing is eligible — never a fabricated card.
- **Fixed** `fetchCrimeIncidents` — `params: { categories: 'violent' }` becomes
  `{ categories: 'Assault,Robbery,Homicide,Rape' }`, the exact list its own
  WHERE clause uses. Both sites read one exported `VIOLENT_CATEGORIES` constant
  so the link and the query cannot drift.

The ranker is shared; the fetches are not, because the two callers use
deliberately different windows (the view's range vs the ticker's YoY). That is
documented at both call sites.

## 7. Data flow

`useCrimeEraData.ts` gains two `useDataset` calls, both
`enabled: isSF && !hasHistorical`:

```
$select: 'incident_category, incident_subcategory, count(*) as incident_count'
$group:  'incident_category, incident_subcategory'
```

one over the active range, one over the resolved comparison range, each
carrying the view's existing extra WHERE (time-of-day, neighborhood). ~96 rows
each — trivial next to the 5K row sample already fetched. `defaultSort` is
auto-skipped (aggregate detected). Returned as
`subcategoryRows` / `subcategoryPriorRows`; `[]` on either side means the
strip suppresses rather than treating absence as zero.

## 8. URL grammar

```
?categories=Assault,Robbery                          (existing, unchanged)
?sub=Larceny%20Theft%7CLarceny%20-%20From%20Vehicle  (new)
```

`?sub=` holds comma-joined, `encodeURIComponent`-encoded `cat|sub` pairs —
the same encoding the existing `categories` param uses, so a category or
subcategory containing a comma survives. Parsed in `CrimeIncidents.tsx`
alongside `categories`; written with `replace: true` for in-view toggles.
`useUrlSync` never touches it (view-local, like `categories`), pinned by test.

**WHERE composition** — the two params are **OR'd**:

```sql
incident_category IN ('Assault','Robbery')
OR (incident_category = 'Larceny Theft' AND incident_subcategory = 'Larceny - From Vehicle')
```

Neither set present = no category predicate (all). Only one present = that
branch alone. Both present = the OR above, which is why a mixed selection can
never return the empty set by surprise.

## 9. Withholding

Any range whose plan includes the historical extract (`hasHistorical`) hides
the drill, the strip, and the chevrons, exactly where the category filter
already renders its 2018 note. The note gains one clause: subcategories were
not published before 2018 either. Oakland: every subcategory surface is absent
(no prop passed, no query enabled).

## 10. Testing

Pure, node-only Vitest — no network, no DOM:

**`subcategoryMovers.test.ts`**
- the pair-identity fixture: `Vandalism` under `Malicious Mischief` and under
  `Vandalism` stays **two** rows with independent scores
- `mute` never wins a slot even at the highest score
- the slot rule: 2 watch + 1 unlisted; falls back to a third watch when no
  unlisted qualifies; returns fewer than 3 rather than padding
- the floor rejects on either side (`current` low, `prior` low)
- `prior === 0` is rejected, not rendered as `+Infinity%`
- authored `merge` sums counts, drops the merged row, and the surviving
  `keys` array carries both pair keys
- tie-break determinism on equal scores
- empty input → `[]`, never a throw

**`subcategoryWatch.test.ts`**
- every key contains exactly one `|`, with non-empty halves
- every `merge` target is itself a well-formed key and is not also a top-level
  key (no merge cycles, no double-counting)
- `kind` is exhaustively `'crime' | 'enforcement' | 'admin'`
- no `admin` entry is also `watch: true` (it could never be shown)
- at least one watched `crime` entry exists (an all-admin table would
  silently empty the strip)

**`crimeDeepLinks.test.ts`** — the bug class from §2.3. Reads
`useCivicIndicators.ts` as source, extracts each crime `TickerItem`'s
`source.params`, and asserts every emitted `categories` value parses to real
category names and every `sub` value parses to well-formed pairs. A card
whose link cannot resolve fails the build.

**`crimeSubcategoryParams.test.ts`** — `useUrlSync` never reads or writes
`sub` (source-read pin, matching the existing `funderParams.test.ts` idiom).

Manual gate on `vite preview`: a 2015 range hides everything with the note; a
2025 range shows three chips; clicking a chip filters the map and puts a
`?sub=` in the address bar that survives a reload; the ticker card lands on a
non-empty view.

## 11. Docs

- `docs/data-insights.md` → Crime: the pair-identity trap, the two vehicle
  break-in strings, the administrative-bucket problem, and the muting rule.
- `About` → a finding: subcategories come from SFPD; friendly names and the
  watch list are DataDiver's editorial layer; muted buckets are excluded from
  headlines but not from counts.
- `CLAUDE.md` → CrimeIncidents bullet: the pair key, the watch table's role,
  the lag clamp, and that `incident_description` stays out of the filter.

---

## 12. Prerequisite — the distinct-incident count fix (separate PR)

Found while writing this spec; Jesse chose "scope A" (fix first, then build
the drill) on 2026-08-31.

### 12.1 The defect

SF crime rows are **charge-level**, and cases carry **supplemental reports**.
Both facts come from DataSF's own `columns.json`, not inference:

> **`incident_code`** — "A single incident report can have one or more
> incident types associated. In those cases you will see multiple rows
> representing a unique combination of the Incident ID and Incident Code."
>
> **`report_type_description`** — "Initial; Initial Supplement; Vehicle
> Initial; Vehicle Supplement; Coplogic Initial; Coplogic Supplement"

Worked example, `incident_number = 260084806` (12 months to 2026-08-01):
**16 rows**, across 6 `incident_id`s — one `Initial` plus five
`Initial Supplement` reports — spanning 7 categories, with
`Robbery | Robbery - Commercial` repeated **4 times inside its own bucket**.

Citywide for that window: **92,622 rows / 72,287 incident_ids / 64,414
incident_numbers.** Every count in the SF crime path is `count(*)`.

### 12.2 The unit

**`count(distinct incident_number)`.** A supplement is the same event
re-reported, and a second charge on one arrest is not a second crime. This
is the identical fix Oakland received in PR #154
(`count(distinct casenumber)`) — SF is the worse case: 30% row-level
inflation against Oakland's 15.5%.

### 12.3 Measured impact

Within-bucket inflation is **+10.3%** overall and badly uneven:

| Bucket | Rows | Cases | Inflated |
|---|---|---|---|
| Weapons Carrying Etc \| Weapons Offense | 664 | 433 | **+53%** |
| Drug Offense \| Drug Violation | 8,663 | 6,019 | **+44%** |
| Assault \| Aggravated Assault | 2,418 | 1,989 | +22% |
| Larceny Theft \| Larceny - From Vehicle | 4,349 | 4,340 | +0.2% |
| Other Miscellaneous \| Loitering | 526 | 524 | +0.4% |

A bucket's inflation is roughly *charges filed per arrest*, so heavily-charged
enforcement buckets inflate hardest — which is exactly why a raw-row ranking
promotes them, and why this fix must precede the strip.

**Percent changes survive the fix; absolute counts do not.** Year-over-year
deltas computed on rows versus on cases differ by ≤4 points across every
bucket above the floor (Hit & Run's +17 is the sole outlier), because the
inflation ratio is stable year over year. So no trend, era bar, or delta
flips — but the citywide headline falls from 92,622 to 64,414 for a
12-month window.

### 12.4 The seam stays honest

The historical extract duplicates too: `tmnf-yvry` 2015 = 146,675 rows /
116,370 `incidntnum` (+26%); `wg3w-h783` Jun 2018–Jun 2019 = 143,227 rows /
104,204 (+37%). Both sides must move together or the 2018 seam gains a
~10-point artificial step. Historical uses `incidntnum`.

### 12.5 Scope

`count(distinct incident_number)` (historical: `incidntnum`) replaces
`count(*)` at every SF crime count site: the 9 in `useCrimeEraData.ts`
(total, cad-link, category, neighborhood, resolution — both eras), the era
strip via `eraSource.countExpr` (the field Oakland already uses for exactly
this), `useCivicIndicators`' crime card, `useComparisonDataFactory`,
`usePoliceHourlyPattern` / `useHourlyPatternFactory`, and
`useNeighborhoodProfiles`. Oakland's path is untouched — already correct.

The cad-link tile needs care: `count(cad_number)` must become
`count(distinct cad_number)` against a distinct-case denominator, or the
"911 LINKED" percentage inherits the same inflation asymmetrically.

### 12.6 Disclosure

A case that involves both a robbery and a burglary is counted once in each
bucket. So **category counts will not sum to the citywide total** — correct
behaviour, and a question a reader will ask. Stated in About and in
`docs/data-insights.md` → Crime, alongside the supplement/charge explanation
and the note that DataDiver's crime figures fell ~30% on this date because
the unit changed, not the city.
