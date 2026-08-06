# Stage 2 — Oakland Data Spine Design

**Date:** 2026-08-05
**Status:** Approved design (brainstorm complete 2026-08-05; Jesse's three scope calls
recorded below).
**Program:** Stage 2 of the Oakland expansion
(`2026-08-03-oakland-geography-program-design.md`). Stages 1a (geography spine,
PR #141) + 1b (view manifest, PR #143) + the visible-fixes PR #144 are merged.
**Gate:** ZERO user-visible change. Everything this stage ships is data, scripts,
comments, tests, and one stand-down guard (§4). `/oakland/*` keeps redirecting Home
— no Oakland ROUTE renders; AppShell chrome paints one pre-redirect frame, and that
frame must stay unchanged in kind from today (legacy date track, empty-nav
tolerance, ZERO network requests — see the era stand-down guard in §4).

## Scope decisions (Jesse, 2026-08-05)

1. **Oakland manifest entries ARE authored in stage 2** — four minimal entries
   (crime-incidents, 311-cases, parking-citations, campaign-finance) so era facts land
   on their post-1b home (`eraSource` on manifest entries) and the integrity tests
   exercise Oakland for real. This supersedes the Oakland shell's `manifest: []
   // authored in stage 3` comment. Routes stay dormant; nothing renders.
2. **All 16 FPPC campaign-finance datasets register** (not a core subset).
3. **Voice pack = authored copy only.** Oakland's voice ships where per-city copy
   already lives: registry `name`/`description` fields and manifest labels. The
   glossary-override / TOKEN_MAP / stream-label mechanisms wait for their first
   consumer (stage 3+). Recorded as an amendment to the program spec's stage-2 row.

## Fresh research (probed 2026-08-04/05 — supersedes the Aug 2–3 audit where they differ)

### Audit corrections

- **Crime has junk EARLY dates.** `ppgh-7dqv` publishes a ~1,400-row trickle
  1950→2003; real data starts **Aug 2004** (2004 total 25,466; Aug 2004 = 5,348 vs
  Jul = 557). The audit's "back to 2005" missed both the junk tail and the 2004 onset.
- **Citations' "junk 1951→2044" trap does NOT reproduce.** `58em-y96b` spans a clean
  2018-01-01 → 2026-05-18 today (either cleaned upstream, or the audit
  cross-contaminated SF parking's identical trap). Row count is **2,740,389**, not ~4M.
  The real citation concern is a **~2.5-month publish lag**.
- **The beats layer is 57 standard `NN[X/Y/Z]` ids + two specials: `LKM1`, `PDT2`**
  (Lake Merritt / Port patrol areas). "59 beats" counts them. The suffix alphabet
  includes Z (`13Z`, `31Z`) — an `[XY]`-only pattern drops two real beats.

### Core datasets

| Logical key | ID | Rows | Span | Facts that shape entries |
|---|---|---|---|---|
| `policeIncidents` | `ppgh-7dqv` | 1,278,404 | Aug 2004 → now, ~3-day lag | dateField `datetime`; geoField `location` (point), 95.4% all-time / 96.0% 2024+; beat field `policebeat` zero-padded ('01X') — joins beats `name`; `cp_beat` matches only 67.76% of rows (~32% silent loss), never join through it; junk pre-2004 trickle → era clamp floor 2004 + clampNote |
| `cases311` | `quth-gb8e` | 1,177,789 | 2013-08-01 → now, same-day | dateField `datetimeinit`; `datetimeclosed` → resolution analytics; beat field `beat` ('26Y'); **`reqaddress` lat/lng is JUNK** (observed 30.0°, −141.2°) — real coords are `srx` (lng) / `sry` (lat), numeric columns serialized as strings over the JSON API, 98.0% all-time / 98.5% last-year |
| `parkingCitations` | `58em-y96b` | 2,740,389 | 2018-01-01 → 2026-05-18 | dateField `ticket_iss` (date-only) + `ticket_i_1` HH:MM text time; geoField `the_geom`; ~2.5-month lag; carries a neighborhood computed region (only Oakland event set that does) |
| beats (vendored, not a registry entry) | `78s7-673i` | 59 polygons | — | join = `name`; attrs pol_dist/pol_beat/agency; raw GeoJSON export ~534KB MultiPolygon |

### FPPC roster (all 16 register; keys below are the registry keys)

All *updated* daily; data arrives in semi-annual **filing lumps** (newest transactions
May–June 2026 when probed). Row totals sum to 238,167 — exactly the audit's figure,
cross-confirming the roster. Every date field below verified against live
`columns.json` on 2026-08-05.

| Key | ID | Rows | Event dateField |
|---|---|---|---|
| `fppc460Summary` | `rsxe-vvuw` | 103,188 | `rpt_date` (summary totals — filing date is the natural date; no transaction grain) |
| `fppcSchA` | `3xq4-ermg` | 75,583 | `tran_date` (monetary contributions; amount `tran_amt1`) |
| `fppcSchB1` | `qaa7-q29f` | 1,369 | `loan_date1` (loans received) |
| `fppcSchB2` | `4fu2-d832` | **0** | `loan_date1` (loan guarantors — EMPTY as published; registered for roster completeness, comment discloses) |
| `fppcSchC` | `ba44-jqtm` | 917 | `tran_date` (non-monetary contributions) |
| `fppcSchD` | `x5eg-xkea` | 2,797 | `expn_date` (expenditure summary) |
| `fppcSchE` | `bvfu-nq99` | 29,038 | `expn_date` (payments made) |
| `fppcSchF` | `9gcg-vghr` | 7,217 | `rpt_date` (accrued expenses — no event-grain date) |
| `fppcSchG` | `xuui-k2nt` | 4,349 | `expn_date` (payments by agent) |
| `fppcSchH` | `qunm-zyau` | 13 | `loan_date1` (loans made to others) |
| `fppcSchI` | `jft9-u9bd` | 493 | `tran_date` (misc increases to cash) |
| `fppc461` | `ub5g-m92u` | 554 | `expn_date` (major donor / IE committee) |
| `fppc465` | `6ejr-39gh` | 129 | `expn_date` (supplemental IE) |
| `fppc496` | `jkj3-8yq3` | 1,693 | **`exp_date`** — NOT `expn_date`; the one-character odd-one-out would 400 at query time |
| `fppc496Contribs` | `eted-3m9d` | 8,722 | `tran_date` (496 part 2 — contributions received) |
| `fppc497` | `qact-u8hq` | 2,105 | `ctrib_date` (late contributions) |

Key naming: FPPC concepts have no SF equivalent (SF's single `campaignFinance` ledger
is a different shape), so these are Oakland-unique keys. The program constraint bans
city-PREFIXED keys (`oak:crime`), not city-unique concepts.

## Design

### §1 Vendored beats GeoJSON + build script

`scripts/build-oakland-beats.py` — direct sibling of
`build-neighborhood-boundaries.py` (single-script shape: fetch upstream inline,
normalize, write the committed asset; imitate its docstring register — WHY THIS
EXISTS / WHAT THIS DOES / USAGE / "the output is committed; the app reads it
same-origin and never touches the network for boundaries").

- Fetch `https://data.oaklandca.gov/resource/78s7-673i.geojson?$limit=100` (59 rows).
- **No dissolve** — the layer is already 59 clean MultiPolygons (SF needed dissolve
  because its source was 195 tract fragments).
- Properties reduced to exactly `{'nhood': <name>}` — the canonical join key per
  `src/cities/types.ts` areas doc comment; `name` is the zero-padded beat id.
- Precision 6 (same "~10cm" rationale), compact `separators=(',',':')`.
- Output: `public/data/geo/oakland-beats.geojson` (the path already pinned in the
  Oakland shell's `areas.geojsonPath`). Expected size well under SF's 979KB.
- Fail loudly if feature count ≠ 59 or any `name` fails
  `^([0-9]{2}[XYZ]|LKM1|PDT2)$` (gates in the generator, like the elections scripts).
- Not wired into package.json — house convention is docstring-run by hand.

### §2 Beat names const

`src/cities/oakland/beats.ts` — `export const OAKLAND_BEATS = [...] as const`
(59 sorted ids, `01X` … `35Y`, `LKM1`, `PDT2`). Oakland's analogue of
`SF_NEIGHBORHOODS`, but city-local from day one (SF's still lives in
`src/utils/geo.ts`; not migrated — zero-behavior churn).

Wired into `oakland/index.ts`: `names: OAKLAND_BEATS`, `excluded` stays the empty set
— the config field currently has no consumers at all (exclusion logic still imports
the SF constants directly; wiring it through config is parked), and Oakland's
`census: null` gates off the demographic surfaces that would care regardless. Whether
LKM1/PDT2 join it is a stage-3 editorial call. `count: 59` already correct.

### §3 Dataset registry — `src/cities/oakland/datasets.ts`

`OAKLAND_DATASETS_RAW: Record<string, RawDatasetConfig>` — 19 entries (3 event sets +
16 FPPC), mirroring `sf/datasets.ts` conventions:

- Honesty caveats as comment blocks ABOVE entries (the SFPD dual-extract precedent):
  crime's junk-trickle + beat-join trap; 311's reqaddress-junk trap; citations' lag;
  fppc496's `exp_date` odd-one-out; fppcSchB2's emptiness.
- `cacheTTL` always commented with its reason. Event sets follow SF siblings (crime
  10 min like SF `policeIncidents`; 311 10 min like SF `cases311`; citations 30 min
  like SF `parkingCitations` — lag-shaped). FPPC sets: 60 min (daily update cadence,
  filing-lump data).
- `name`/`description` are reader-facing **Oakland voice**: "OPD incident reports…",
  "Oakland 311 service requests…", agency names spelled Oakland's way. This IS the
  stage-2 voice deliverable (scope call 3).
- `defaultSort`: `datetime DESC` / `datetimeinit DESC` / `ticket_iss DESC`; FPPC event
  sets sort by their event date DESC; `fppc460Summary`/`fppcSchF` by `rpt_date DESC`.
- `hasGeo`: true only for `policeIncidents` (geoField `location`) and
  `parkingCitations` (geoField `the_geom`). `cases311` is `hasGeo: false` at the
  registry level — its coords are split numeric columns (`srx`/`sry`, serialized as
  strings over the JSON API), not a Socrata point; the stage-3 view decides how to
  consume them (matches how SF's geo-less sets are modeled).
- `category`: 'public-safety' (crime), 'other' (311 — matches SF's `cases311`),
  'transportation' (citations), 'other' (FPPC ×16).

`oakland/index.ts` assembles `datasets: buildDatasets('data.oaklandca.gov',
OAKLAND_DATASETS_RAW)` — the same host-literal pattern as SF (the portal.host
duplication is a noted, deliberate repetition; refactoring it is out of scope).

### §4 Oakland manifest — four entries

`src/cities/oakland/manifest.ts` (city-local like `sf/manifest.ts`), wired as
`manifest: OAKLAND_MANIFEST`. Minimal entries — nav labels/pigments copied from SF's
per-view values (same dataset family = same pigment across cities), **no homeCard**
(the Home grid is SF's until stage 4), **no underlayPreset** (`census: null` hides all
ACS affordances), no `dateless`:

```ts
{ viewId: 'crime-incidents', navLabel: 'Crime Incidents', navShortLabel: 'CI',
  navDescription: 'OPD incident reports on police beats',
  accentColor: '#963e30', // brick-600 — same pigment as SF crime
  eraSource: {
    datasetKey: 'policeIncidents', dateField: 'datetime',
    clamp: [2004, null],
    clampNote: 'range clamped — published dates run back to 1950',
  },
  omniDatasetKeys: ['policeIncidents'] },
{ viewId: '311-cases', navLabel: '311 Cases', navShortLabel: '311',
  navDescription: 'Oakland 311 service requests',
  accentColor: '#5c7a3d', // moss-600 — same as SF 311
  eraSource: { datasetKey: 'cases311', dateField: 'datetimeinit', clamp: [2013, null] },
  omniDatasetKeys: ['cases311'] },
{ viewId: 'parking-citations', navLabel: 'Parking Citations', navShortLabel: 'PC',
  navDescription: 'Oakland parking citations',
  accentColor: '#d47149', // terracotta-500 — same as SF parking citations
  eraSource: { datasetKey: 'parkingCitations', dateField: 'ticket_iss', clamp: [2018, null] },
  omniDatasetKeys: ['parkingCitations'] },
{ viewId: 'campaign-finance', navLabel: 'Campaign Finance', navShortLabel: 'CF',
  navDescription: 'FPPC filings — contributions & spending',
  accentColor: '#8b6282', // plum-500 — same as SF campaign finance
  // no eraSource — parity with SF's entry (no era track on this view today)
  omniDatasetKeys: ['fppcSchA', 'fppcSchE', 'fppc460Summary'] },
```

`omniDatasetKeys` for campaign-finance names the core three only — 16 ⌘K rows would be
noise. Exact navDescription wording is the implementer's editorial pass within these
registers; the beat-honesty rule binds ("police beat", never "neighborhood").

**Era stand-down guard (ships WITH the manifest — the leak its absence causes):**
`DateRangePicker` mounts in AppShell OUTSIDE Routes, so it renders one pre-redirect
frame on `/oakland/*`. `useEraSeries` gates its fetch on `source != null` with no
city guard and calls `useDataset` WITHOUT `cityId` — so the moment Oakland era
sources exist, that frame would fire the Oakland-shaped query at SF's endpoint
(same logical key `policeIncidents` → wg3w-h783, no `datetime` column → guaranteed
Socrata 400 to data.sfgov.org), and flip the picker into a transient era-strip loading
state. (Separately, AppShell's nav derives from the active city's manifest, so the
same frame would paint 4 Oakland nav rows — handled by AppShell's own stand-down
clause, not by this guard.) Fix: an
`active = source != null && cityId === 'sf'` flag replaces `source != null` at all
four gate sites in `useEraSeries` (both `enabled:` options, `anyLoading`,
`available`), with a STAGE 3 CONTRACT comment — the exact mirror of `useUrlSync`'s
`cityId !== 'sf'` skipSync clause; remove it when `useDataset` threads `cityId`.
With the guard and AppShell's nav stand-down, the pre-redirect frame renders the
legacy 730-day track, an empty nav, and fires zero requests — byte-identical to
today.

**⌘K place-row destination (stage-3 flag):** place rows link to
`viewPath(cityId, 'neighborhood')` → `/oakland/neighborhood`, a view no Oakland
stage ships. The stage-2 test pins that path as-is; stage 3 must either suppress
place rows for cities whose manifest lacks a `neighborhood` entry or retarget them
to the city landing — recorded here so the pin isn't read as an endorsement.

Era-clamp rationale (the machine-readable era facts, deliverable 3):
- crime `[2004, null]` + clampNote — the clamp HIDES the ~1,400 junk rows (the
  clampNote contract: "set when the clamp hides published rows").
- 311 `[2013, null]` — clean start, no note.
- citations `[2018, null]` — clean span, no note; upper stays null (the ~2.5-month lag
  is freshness-machinery territory, not a clamp).

### §5 Test re-pins + new integrity coverage

The 1b suites were built as deliberate tripwires; stage 2 re-pins them to the new truth:

1. `src/cities/registry.test.ts` — the "oakland shell" test: datasets length 0 → 19;
   add NEW generic per-entry assertions for Oakland (4×4 id shape, name/description
   non-empty — coverage SF's loop doesn't have) plus the same endpoint-derivation
   loop SF already gets.
2. `src/components/search/useOmniSearch.test.ts` — "oakland index is empty" → pins the
   new composition: 4 view rows + 59 place rows + dataset rows from the entries'
   omniDatasetKeys, all with `/oakland/...` paths. (Place rows derive from
   `areas.names` independent of the manifest — populating OAKLAND_BEATS alone would
   have tripped it.)
3. `src/api/eraSources.test.ts` — `eraSourceFor('oakland','crime-incidents')`
   toBeUndefined → toBeDefined with the clamp above; the SF seven-era-views exact pin
   is untouched (it filters `city.id === 'sf'`).
4. Free coverage (no edits — these iterate `Object.values(CITIES)` already and become
   Oakland's acceptance harness): era datasetKey-membership + clamp-plausibility
   checks; manifest omniDatasetKeys-membership.
5. **NEW** `src/cities/oakland/beats.test.ts` — reads the committed
   `public/data/geo/oakland-beats.geojson` from disk (node Vitest can): 59 features;
   `nhood` value set === `OAKLAND_BEATS` exactly; every id matches
   `^([0-9]{2}[XYZ]|LKM1|PDT2)$`. Kills names↔asset drift by construction (the
   duplicated-allowlist lesson — the const and the asset can never disagree silently).

### §6 Hygiene folds (all invisible)

- **STAGE 3 CONTRACT comments into code** (the useUrlSync skipSync contract is
  already in code; the cityId-threading and slots.live contracts live only in
  CLAUDE.md):
  - `src/hooks/useDataset.ts` + `src/api/client.ts`: thread `cityId` before any
    Oakland view fetches — the `'sf'` default silently queries SF; note that
    `fetchAllPages`/`fetchAggregation` call `fetchDataset` without a `cityId` option
    (`fetchAllPages` passes only `{ skipCache: true }`) and are SF-hardcoded until
    threaded.
  - `src/views/Last48/modes/Last48Map.tsx` (the `slots.live` read): `Record<string,
    CameraView>` types the value as present while a city with empty slots yields
    `undefined` at runtime; MapView degrades to `camera.defaultView`.
- **Fix the broken `build:elections` package.json entry** — it invokes
  `scripts/build-precinct-geojson.ts`, which does not exist (the on-disk script is
  `build-precinct-geometry.py`, and it needs gitignored sources). Fix: drop the dead
  second command, leaving `tsx scripts/build-election-archive.ts`.
- **Program-spec amendment** appended to
  `2026-08-03-oakland-geography-program-design.md`: stage-2 row's "Oakland voice pack"
  resolved as authored copy in registry + manifest entries (scope call 3); mechanism
  tables defer to first consumer. Also note the manifest-entries-in-stage-2 supersession
  (scope call 1).

## Data traps (for `docs/data-insights.md` at stage 3, recorded here first)

1. Beat join: always `policebeat`/`beat` → beats `nhood` (from `name`, zero-padded).
   `cp_beat` matches as text for double-digit beats and silently drops ~32% of rows.
   AND: even the correct join leaves **~4.8% of crime rows unmapped** — `77X`
   (34,898 rows, the dataset's 4th-most-common beat value) and `99X` (8,311) are
   well-formed out-of-beat/unknown codes with NO polygon, plus 10,237 NULLs and a
   malformed tail ('1X' unpadded, '30 X', 'UNKNOWN', 'BERKELEY', zip codes). Beat
   rollups must count and disclose the unmapped share, never assume
   `policebeat ∈ the 59 ids`.
2. 311 coordinates: `reqaddress` is a Socrata location column whose lat/lng is
   frequently junk; `srx`/`sry` are the authoritative lng/lat (as strings), 98%
   populated.
3. Crime pre-2004 rows are real-looking but a statistical trickle — any query
   spanning them shows a false near-empty decade. Era clamp + clampNote handle it.
4. FPPC: `fppc496` alone uses `exp_date`; everything else `expn_date`/`tran_date`/
   `loan_date1`/`ctrib_date`. `fppcSchB2` is published empty.
5. "Updated daily" ≠ current: FPPC data moves in semi-annual filing lumps; freshness
   probes must expect months-old max dates as NORMAL for these sets.
6. Oakland's crime 90-day view `ym6k-rx7a` is NOT a subset of `ppgh-7dqv` (81
   exclusive rows) — deliberately NOT registered; nothing should union them.

## Verification (the zero-visible-change gate)

- Full `pnpm build` via the devman wrapper (tsc -b strict) + `pnpm test` — all re-pins
  green, new beats integrity test green.
- Live `vite preview` walk: SF spot-checks unchanged (nav, ⌘K rows on SF routes, Era
  Track renders on crime/311/citations SF views, `/live` clean-URL); `/oakland/*`
  still redirects Home; `/oakland/crime-incidents?start=2020-01-01` gains no params
  and lands Home.
- **Network assertion** on the `/oakland/crime-incidents` load (devtools network
  tab): ZERO requests to `data.sfgov.org` carrying Oakland field names
  (`datetime`/`datetimeinit`/`ticket_iss`) and ZERO requests to
  `data.oaklandca.gov` — the era stand-down guard's acceptance check.
- Beats asset sanity: generator gates pass (59 features, id regex); committed file
  loads as valid GeoJSON in the integrity test.

## Out of scope

Oakland pixels of any kind; `useDataset` cityId threading (stage 3 contract); the
`ym6k-rx7a` 90-day crime view; ArcGIS traffic safety (stage 5); voice-pack mechanism
tables; beat→plain-name crosswalk (banked editorial); any change to SF datasets,
manifest, or copy; Vercel/env/backend changes.
