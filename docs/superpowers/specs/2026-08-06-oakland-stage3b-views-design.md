# Oakland Stage 3b — Parking Citations + Campaign Finance views (design)

**Date:** 2026-08-06 · **Branch:** `feat/oakland-stage3b-views` · **Program:** stage 3b of
`2026-08-03-oakland-geography-program-design.md` (between stage 3, PR #146, and stage 4)

One PR flips Oakland's last two dormant manifest entries live: **Parking Citations**
(`58em-y96b`) and **Campaign Finance** (4 of the 16 FPPC sets). Both ride the stage-3
machinery — liveness, route-derived `cityId`, per-city dialects — and the SF side must be
byte-identical (zero-visible-change gate, same as every prior stage).

## Jesse's scope calls (2026-08-06)

1. **Slicing:** two cycles — this PR carries BOTH views; stage 4 (city switcher + Home
   doorway) is its own later cycle. Oakland stays URL-only until stage 4.
2. **Citations area spine:** police beats via a vendored regionID→beat-code crosswalk
   (not the Neighborhoods region, not "no ranking").
3. **Citations hour data:** normalize server-side (overriding the withhold
   recommendation) — hardened with a counted, disclosed residual bucket so an unseen
   fourth time format surfaces instead of miscounting.
4. **FPPC scope:** core 4 + late detail — Sch A, Sch E, 496, 497. Registry keeps all 16;
   the view reads 4.
5. **Violations:** group/filter by the clean `violation` CODE with an authored label map
   (311-dialect idiom), never the truncation-corrupted descriptions.
6. **Architecture:** approach A — one component per view; per-city dialect modules; the
   campaign-finance dialect is a ledger routing table over concepts.

## Fresh probe facts (2026-08-06, adversarially spot-verified — supersede all earlier notes)

### Parking citations `58em-y96b` (2,740,389 rows, 2018-01-01 → 2026-05-18, ~11-week lag)

| Fact | Measured |
|---|---|
| Columns | `the_geom` (point) · `ticket_num` · `fine_amount` (number) · `ticket_iss` (calendar_date, date-only) · `ticket_i_1` (TEXT time) · `violation` (code) · `violatio_1` (description) · `location` · computed regions: Zip `:@computed_region_w23w_jfhw`, **Police Beats `:@computed_region_fus4_casw`**, Neighborhoods `:@computed_region_b5ya_f7qx` |
| Geo coverage | `the_geom` **100.0%** all-time AND 2024+ — no geo gap (better than SF, whose coords die after Oct 2025). No `geoField` gap alert needed. |
| Beats region | 94.8% all-time / 95.6% 2024+ coverage; values are **internal region IDs (integers ~1–59)**, NOT beat codes. 142,417 rows unmatched (the null bucket). The curated-region dataset `fus4-casw` serves the crosswalk directly: `_feature_id` → `name` where name IS the beat code (`34X`, `22Y`, `13Z`, `PDT2`…). |
| Violation vocabulary | `violatio_1` is corrupted by a **hard 10-char truncation era** (~2.0M rows at exactly length 10: `NON DISPLA` vs the untruncated `NON DISP PKG RECEIPT` for the same violation). `violation` CODE is clean municipal-code cites. Top codes: `10.28.240` (1,380,615) · `10.36.030B` (277,897) · `10.36.050` (271,842) · `10.40.020A1` (221,176) · `10.44.120A` (65,014) · `22500.F` (60,497, CVC) · `5204` (53,481) · `10.28.250` · `10.28.190` · `10.40.060`. |
| Time formats | `ticket_i_1` mixes THREE formats: zero-padded `HH:MM` (~1.69M), unpadded `H:MM` (976,792), 12-hour `H:MM:SS AM/PM` (71,323). Lexicographic min/max returns `0:00`/`9:59:00 AM` — a raw string range filter is INVALID. |
| Fine amount | numeric, min 0 / max 576 / avg $73.02; zero nulls; 51,977 zero-dollar rows (~1.9%). |
| Plate state | **No column exists** — SF's Out-of-State card has nothing to read. |
| Years | clean 2018→now, no junk endpoints (2020 COVID dip 195,458; 2025 = 412,104). Era clamp `[2018, null]` already authored (stage 2) and stands. |

### FPPC campaign finance (view reads 4 of 16 registered sets)

| Set | ID | Date field | Rows | Span | Key fields |
|---|---|---|---|---|---|
| Sch A contributions | `3xq4-ermg` | `tran_date` | 75,583 | 2010-10 → 2026-05-15 | `filer_id`, `filer_naml`, `tran_naml/namf`, `tran_amt1`, `tran_city/state/zip4/emp/occ`, `tran_self`, `entity_cd` |
| Sch E payments | `bvfu-nq99` | `expn_date` | 29,038 | 2010-10 → 2026-05-15 | `filer_id`, `filer_naml`, `payee_naml`, `amount`, `expn_code` (standard FPPC codes), `expn_dscr`. **1,553 rows (5.3%) have NULL `expn_date` totaling $3.39M — invisible to every date-filtered query.** |
| 496 late IE | `jkj3-8yq3` | **`exp_date`** (no `n` — sibling-divergent, verified: `expn_date` 400s) | 1,693 | 2012-10 → 2026-05-13 | `amount`, `sup_opp_cd` (S 1,447 / O 246), `cand_naml`, `bal_name/bal_num`, `filer_naml`. Current through the 2025 Lee-vs-Taylor mayoral incl. opposition spending. |
| 497 late contribs | `qact-u8hq` | `ctrib_date` | 2,105 | 2013-09 → 2026-06-02 | `amount`, `enty_naml`, `cand_naml`, `filer_naml`; **no `sup_opp_cd`** (contributions, not IE). |

Excluded from the view (with reasons, all probe-measured): 460 summaries (`amount_a`
annual sums run 10–20× transaction-level totals — cumulative/period semantics
unresolved; summing it fabricates money), 465 (frozen Oct 2014), 461 (554 rows,
substantive but redundant with 496 for the story this view tells), Sch B1/C/D/F/G/H/I
(minor; F has NO transaction-date column at all; H has 13 rows; B2 confirmed 0 rows).
Annual Sch A totals confirm real election-cycle lumping (even years + 2025).

## §1 Citations dialect — `src/views/ParkingCitations/citationsDialect.ts`

Zero-import pure leaf (the `dialect311.ts` idiom — keeps any future factory import
cycle-safe). Contents:

**Beat crosswalk.** `OAK_CITATION_BEAT_REGIONS: Record<string, string>` — regionId →
beat code, ~59 entries, committed verbatim with the regeneration command in a comment
(`curl 'https://data.oaklandca.gov/resource/fus4-casw.json?$select=_feature_id,name&$limit=100'`).
Plus the derived inverse `beatToRegionId(beat)`. Integrity test pins: entry count
matches the fetched region set, mapping is one-to-one, every value ∈ `OAKLAND_BEATS`
(the test file imports the beats const; the dialect stays zero-import). Field constant
`OAK_BEAT_REGION_FIELD = ':@computed_region_fus4_casw'`.

**Violations.** `OAK_VIOLATION_LABELS: Record<string, string>` — authored plain-English
labels for the top ~30 codes by count (`'10.28.240'` → its authored label), and
`OAK_VIOLATION_GROUPS: Record<string, string[]>` — quick groups over CODES (mirroring
SF's `VIOLATION_GROUPS` concept: meters / zones / sweeping-style buckets as the data
supports). **Generation rule for the plan (no guessing municipal code meanings):** for
each top code, `GROUP BY violatio_1 WHERE violation='<code>'` and take the most frequent
description ≥ 11 chars (i.e., untruncated) as the label seed, hand-polished to reader
English; codes whose only observed descriptions are truncated keep the truncated text
verbatim rather than an invented expansion. Tail codes outside the map render their raw
description. The label map + groups are authored IN THE PLAN from a plan-time probe —
the spec pins the rule, the plan pins the values.

**Hour module** (inside the dialect): the single source of truth for Oakland citation
time-of-day.
- `OAK_HOUR_EXPR` — a SoQL scalar usable in `$select` AND `$where`:
  `case(ticket_i_1 like '%AM', 'A' || substring(ticket_i_1, 1, 2), ticket_i_1 like '%PM', 'P' || substring(ticket_i_1, 1, 2), true, substring(ticket_i_1, 1, 2))`
  — AM/PM tested FIRST (a `10:00:00 AM` row also matches the bare two-char pattern).
  Emits a closed bucket vocabulary (~58 values): bare `'00'`–`'23'`, unpadded `'0:'`–`'9:'`,
  and `A`/`P`-prefixed `'A12'`,`'A1:'`…`'A11'`, `'P12'`…`'P11'` (both padded and unpadded
  12-hour variants).
- `bucketToHour(bucket: string): number | null` — strips the prefix and `:`, parses,
  applies 12-hour arithmetic (`A12`→0, `P12`→12, P+12 otherwise), range-validates.
  Anything unrecognized → `null` (the residual).
- `bucketsForHours(hours: number[]): string[]` — the inverse, derived by filtering the
  closed vocabulary through `bucketToHour` (one logic source, no dual mapping).
- `buildOakTodClause(startHour, endHour): string` — `(${OAK_HOUR_EXPR}) IN ('…')` via
  `bucketsForHours`; replaces SF's `date_extract_hh(citation_issued_datetime)` fragment.

**WHERE builders.** `buildSfCitationWheres(...)` — today's `statsWhere` / `mapWhere` /
`dateOnlyClause` composition moved VERBATIM (byte-pinned by test); `buildOakCitationWheres(...)`
— date range on `ticket_iss` + `violation IN (codes)` + `OAK_BEAT_REGION_FIELD = '<regionId>'`
+ TOD via `buildOakTodClause`; `mapWhere = statsWhere + ' AND the_geom IS NOT NULL'`
(harmless at 100% coverage, kept for structural parity). `OAK_CITATION_SELECT` =
`the_geom,ticket_num,fine_amount,ticket_iss,ticket_i_1,violation,violatio_1,location,`
+ the region field.

**Row adapter.** `adaptOakCitation(row)` → the view's citation shape: `ticket_num` as id,
`fine_amount`, date from `ticket_iss` + raw `ticket_i_1` for display (tooltip shows the
published time string verbatim — no fake parsing in display), label via
`OAK_VIOLATION_LABELS[violation] ?? violatio_1`, beat via crosswalk (unmatched → the
`'Unknown'` sentinel, same guard idiom as stage 3's panels).

### Hourly factory extension — `src/hooks/useHourlyPatternFactory.ts`

`HourlyPatternConfig` gains:
- `hourExpr?: string` — replaces `date_extract_hh(dateField)` in `hourlySelect` (which
  gains a third optional param; SF output byte-pinned unchanged).
- `mapHourValue?: (raw: string) => number | null` — default `parseInt` behavior; Oakland
  citations passes `bucketToHour`.
- `limit?: number` — default 200 (unchanged); Oakland citations passes 800 (~58 buckets
  × 7 days ≈ 406 rows would silently truncate at 200 — the stage-3 `$limit` lesson).

`computeHourlyResult` changes `grid[dow][hour] = count` to `+=` (multiple buckets fold
into one hour; for SF the GROUP BY already makes pairs unique so `+=` is behavior-
identical — a test pins both facts) and returns `unparsedCount` (sum of rows whose
mapped hour is null). The concrete Oakland hook `useOaklandCitationHourlyPattern` is declared in the
VIEW layer (`ParkingCitations` folder), calling `createHourlyPatternHook` with
`{ datasetKey: 'parkingCitations', dateField: 'ticket_iss', cityId: 'oakland',
hourExpr: OAK_HOUR_EXPR, mapHourValue: bucketToHour, limit: 800 }` — the factory file
itself never imports the dialect (keeps it leaf-clean, mirrors how the Oakland crime
hook threads its `countExpr`). The heatgrid renders a one-line residual disclosure when
`unparsedCount > 0` ("N citations carry unparseable times — excluded here").

### View wiring — `ParkingCitations.tsx`

City branch via `useRouteView()` (the component remounts per city — stage-3 guarantee).
Per-city: SELECT fields, WHERE builders, violation clause (codes vs descriptions),
area filter (region id vs `analysis_neighborhood`), trend config (`dateField:
'ticket_iss'`, `neighborhoodField: OAK_BEAT_REGION_FIELD`, `cityId: 'oakland'` — fine
metrics keep `fine_amount`, same name both cities), freshness
(`useDataFreshness('parkingCitations', 'ticket_iss', dateRange, { cityId })` — NO
`geoField` option for Oakland, coverage is 100%), comparison (new
`useOaklandCitationComparisonData` from the factory with `cityId`; no dedupe —
`ticket_num` is row-unique), hourly (above). Sidebar ranking groups the region field
(`$limit: 200` — 59 beats + null bucket; never 50), translates ids through the
crosswalk, renders beat labels via `city.areas.formatLabel` ("Beat 07X"), and the
inline z-score ranking ports untouched. `ViolationTypeFilter` gains `groups?:
Record<string, string[]>` (default: today's `VIOLATION_GROUPS`) and `formatLabel?:
(key: string) => string` (default identity) — Oakland passes its groups + label map;
the entry key field keeps its name (`violationDesc`) and semantically becomes "the
filter key" (codes for Oakland).

**Withheld (not faked):** Out-of-State card is FILTERED OUT of the card defs (nothing
approximates it — no '—' placeholder), census context + underlay (census null gates,
free), CivicTicker (two-part gate `{enabled: isSF}` + render, same as crime).
**Disclosures:** unmatched-beat share live-computed from the null bucket of the ranking
query (~5.2% — crime's unmapped-beat idiom, on the ranking header + anomaly legend if
shown), hourly residual (above), and the ~1.9% zero-dollar fines noted in
data-insights only (not UI — voided/dismissed citations are ordinary, not a trap).
Header subtitle city-branched (SF keeps "SFMTA · Citation Patterns & Fines").

## §2 Campaign finance — the ledger map

### `src/views/CampaignFinance/fppcDialect.ts`

Zero-import pure leaf. A per-city routing table over four concepts:

```ts
interface FppcRoute {
  datasetKey: string
  dateField: string
  amountField: string        // SF 'calculated_amount' · Sch A 'tran_amt1' · Sch E/496/497 'amount'
  filerIdField: string       // SF 'filer_nid' · OAK 'filer_id'
  filerNameField: string     // SF 'filer_name' · OAK 'filer_naml'
  donorNameField?: string    // SF 'transaction_last_name' · Sch A 'tran_naml' · 497 'enty_naml'
  selfField?: string         // SF 'transaction_self' · Sch A 'tran_self' (semantics = plan-probe item)
  entityCodeField?: string   // SF 'entity_code' · Sch A 'entity_cd'
  spendCodeField?: string    // SF 'transaction_code' · Sch E 'expn_code'
  extraWhere?: string        // SF: "form_type='A'" / "form_type='E'" / the 3-form IE OR — verbatim
}
interface CityLedger {
  contributions: FppcRoute
  payments: FppcRoute
  lateIE: FppcRoute              // SF: campaignFinance + the 3-form OR · OAK: fppc496 + sup_opp_cd/cand_naml/bal_name
  lateIEScope: 'entity' | 'view' // SF 'entity' (detail-panel IE match) · OAK 'view' (LateFilingsSection; entity IE withheld) — ONE authored fact gates both surfaces
  lateContribs: FppcRoute | null // SF: null · OAK: fppc497
}
ledgerFor(cityId): CityLedger
```

SF's ledger routes every concept to `campaignFinance` with today's `form_type` clauses
moved verbatim. The dialect also exports pure query-param builders — one per query the
hooks fire — so a Vitest pins the SF builders' output byte-identical to today's inline
literals (the whole SF query surface: 9 in `useCampaignFinance`, 3 YoY, 5 + 2 IE in
`useCampaignDetail`).

### Hook parameterization

`useCampaignFinance(dateRange, cityId)` and `useCampaignDetail(entity, dateRange, cityId)`
take `cityId` and route every `fetchDataset` call through the ledger **with explicit
`cityId`** (plain async context — no route to read; the standing direct-call rule).
Oakland concept mapping:

- **Totals/avg/count/small-donor (<$100)/self-funding** → Sch A on `tran_amt1` (+
  `tran_amt1 > 0` mirroring SF's positive-amount clause). Self-funding uses `tran_self`
  ONLY if the plan-probe confirms usable semantics; otherwise the card is withheld
  (probe writes the verdict into the plan).
- **Unique donors** → `GROUP BY tran_naml`, `$limit: 50000` (75K-row set — safe).
- **Top recipients** → `filer_id, filer_naml, SUM(tran_amt1)`. Oakland has **no
  `filer_type` column**: `SelectedEntity.filerType` is `''` for Oakland, the type chip
  hides, and the measure-vs-candidate IE match logic never runs (see withheld below).
- **Timeline** → `date_trunc_ym(tran_date)`.
- **Funding sources** → `entity_cd` (standard FPPC entity codes; plan-probe checks the
  value inventory against `FundingSourcesChart`'s label map and the dialect carries any
  missing labels).
- **Entity detail** → source breakdown, top donors, timeline (Sch A by `filer_id`);
  spending categories (Sch E by `filer_id`, `$select: 'expn_code as transaction_code, SUM(amount) as total'`
  — the alias makes `categorizeSpending` reusable untouched; NULL codes fall into its
  existing "Uncoded / Pass-through" bucket).
- **Donor geography** → skipped for Oakland (SF's is already an unrendered placeholder;
  Oakland returns empty and the placeholder block hides).

### The Oakland-only late-filings section (view-level)

SF's IE surface lives in the entity detail (matched by `filer_type` + name); Oakland
can't join that way but has something better — dedicated late-window datasets. New
component `LateFilingsSection` (renders only when `ledger.lateIEScope === 'view'`; the
same fact suppresses the entity-detail IE queries for Oakland and keeps them for SF):

- **496 late IE:** within the active cycle window, `GROUP BY cand_naml, bal_name, sup_opp_cd, SUM(amount)`;
  client assembles per-target support/oppose splits; renders the top ~5 targets as
  paired S/O bars (visual idiom of `ForAgainstSplit` — reuse it per-target if its props
  fit, else a compact sibling using the same bar treatment). This is where
  Lee-vs-Taylor opposition money becomes visible.
- **497 late contributions:** cycle-window `SUM(amount)` + count as a summary line.
- Section eyebrow discloses the frame: late-window disclosures (filed within 90/24-hour
  windows before an election), not the full ledger.

**Withheld for Oakland:** entity-detail IE panels (`ieSupport`/`ieOppose` stay empty —
no reliable filer→candidate join; the view-level section carries the story instead),
donor geography, `filer_type` chip. **Disclosure:** the Sch E NULL-date landmine — one
live count/sum query (`expn_date IS NULL`), rendered as a note under the entity
spending breakdown and in the section footer: "N payments totaling $X carry no date and
are excluded from all date-filtered figures."

### Election cycles

`electionCycles.ts` gains `OAKLAND_ELECTIONS` (same `ElectionCycle` shape; newest
first): Nov 2026 (`2026-11-03`, start `2026-01-01`) · **Apr 2025 special mayoral**
(`2025-04-15`, start `2025-01-01`) · Nov 2024 (`2024-11-05`) · Nov 2022 (`2022-11-08`)
· Nov 2020 (`2020-11-03`) · Nov 2018 (`2018-11-06`) · Nov 2016 (`2016-11-08`) · Nov
2014 (`2014-11-04`) · Nov 2012 (`2012-11-06`) — each even-year cycle starting Jan 1 of
its year (the probe's annual lumping confirms these are the real cycles; `getDefaultCycle`
naturally skips the future Nov 2026 row until it happens). `findPriorCycle`,
`getDefaultCycle`, `findCycleForRange` gain a trailing `cycles: ElectionCycle[] =
SF_ELECTIONS` param (zero churn for SF callers; `findPriorCycle` indexes the PASSED
array, not the module const). The Apr 2025 special has no prior same-month cycle → YoY
null, which the UI already renders as absent. The view picks the table by city and
threads it everywhere it calls these utils; header subtitle city-branched ("City of
Oakland FPPC filings · {cycleName}"); footer attribution: "Source: City of Oakland FPPC
filings via data.oaklandca.gov (view reads Sch A, Sch E, 496, 497 of 16 published
sets). Local filings only — state CAL-ACCESS filings not included."

`useDataFreshness('fppcSchA', 'tran_date', effectiveRange, { cityId })` for Oakland.
The FPPC filing-lump caveat (data arrives in semi-annual lumps) rides data-insights,
not a UI change.

## §3 Liveness flip + chrome

Delete `dormant: true` from both Oakland manifest entries — the stage-3 machinery does
the rest (routes via `liveManifest`, nav, ⌘K, `useUrlSync`, era activation). No
`App.tsx` edits: `VIEW_COMPONENTS` already maps both viewIds to the shared components.
The slugs' redirect-clobber protection WAS the `entry.dormant` skipSync clause —
flipping it replaces protection with real routes; nothing to unregister (implementer
verifies no stale `city.redirects` row exists for either slug). Citations keeps its
authored eraSource (`ticket_iss`, clamp `[2018, null]`); campaign-finance stays
era-free (test-pinned parity with SF — the cycle picker is its time system).

## §4 Tests

- `citationsDialect.test.ts` — crosswalk integrity (count, bijective, values ∈
  `OAKLAND_BEATS`); hour module: `OAK_HOUR_EXPR` string pin, `bucketToHour` table
  (`'A12'`→0, `'P12'`→12, `'P09'`→21, `'A9:'`→9, `'0:'`→0, `'00'`→0, `'23'`→23, junk→
  null, `'24'`→null), `bucketsForHours` round-trip (∀h∈0–23: every returned bucket maps
  back to h; union over all hours = the full parseable vocabulary); SF WHERE builders
  byte-pinned to today's literals; Oakland WHERE forms; label-map keys look like codes.
- `useHourlyPatternFactory` tests — `+=` folding (two buckets, one hour), SF
  `hourlySelect` byte-pin unchanged, `unparsedCount` accounting.
- `fppcDialect.test.ts` — every SF query-param builder byte-pinned to the current
  inline literals; Oakland routes reference real registry keys (imports the Oakland
  registry in the TEST only); `OAKLAND_ELECTIONS` sanity (descending dates, start <
  end, `findPriorCycle(Nov 2024, OAKLAND_ELECTIONS)` → Nov 2022, Apr 2025 → null).
- Re-pins the stage-1b/3 tripwires force: ⌘K oakland index row count (4 view rows + 59
  places + 6 dataset rows), any live-view-count pins.
- Existing suites that iterate per-city (era integrity, registry, manifest) pass
  unchanged — they are the acceptance harness.

## §5 Verification gate (two-sided, stage-3 shape)

**SF zero-visible-change:** full `pnpm build` (devman-wrapped) + full `npx vitest run`;
the byte-pin tests ARE the SF query-surface proof; spot walk on `vite preview` (SF
citations + SF campaign finance render identically, cycle picker unchanged).
**Oakland live walk:** `/oakland/parking-citations` — map dots render, freshness alert
fires (~11-week lag), beat ranking + drill, violation filter with authored labels,
heatgrid + Peak Hour + TOD filter agree with each other, residual disclosure if
present; `/oakland/campaign-finance` — cycle picker (Apr 2025 default until Nov 2026),
top recipients recognizable (Lee/Taylor/measure committees), late-filings section
shows S AND O money, Sch E NULL-date note renders with live numbers. Whole-lifetime
network assertion on both routes: zero SF-resolved requests (the DEV tripwire makes
violations loud). Controller spot-checks ≥3 rendered numbers against live SoQL (one
citations beat count, one Sch A cycle total, one 496 oppose total).

## Plan-probe items (facts the PLAN must pin before task dispatch)

1. `tran_self` value semantics on Sch A (usable boolean? else withhold self-funding).
2. `entity_cd` value inventory vs `FundingSourcesChart`'s label map.
3. The authored `OAK_VIOLATION_LABELS` + `OAK_VIOLATION_GROUPS` tables (generation rule
   in §1).
4. One live confirmation that `||` concat + `case()` + `substring()` compose in BOTH
   `$select` and `$where` on data.oaklandca.gov (the TOD `IN` clause depends on it).
5. The exact crosswalk table from `fus4-casw` (and its true row count — "~59").
6. 496 `cand_naml`/`bal_name` coverage shares (how many rows name neither — the
   late-IE section's "unattributed" bucket).

## Out of scope

Stage 4 (city switcher + Home doorway — next cycle); 460/461/465/minor schedules in the
view; donor geography; Oakland entity-level IE matching; hour normalization for any
other dataset; Neighborhoods-region anything; Oakland Pulse/ticker/anomaly baselines;
beat camera presets (polygon fitBounds suffices — stage-3 ruling stands).
