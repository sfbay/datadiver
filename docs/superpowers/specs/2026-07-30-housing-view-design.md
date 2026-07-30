# Housing view — Evictions + Buyouts dual-stream map

**Date:** 2026-07-30 · **Route:** `/housing` · **Status:** approved (plan-mode design review)

## Goal

A new Housing tab: Eviction Notices and Buyout Agreements as **two equal streams on one
map** (the 911/311-in-Last-48 idiom — per-stream pigments, toggle chips, both in stat
cards and sidebar), riding the standard view chassis (date range, YoY compare, z-scores,
freshness, export, deep links), with one new primitive: a **29-year era strip** that
doubles as storyteller and date-range control.

Audience story: eviction pressure and cash-for-keys payouts are two faces of the same
displacement economy. A block with clustered eviction dots AND a big buyout ring is a
story at a glance; the era strip puts today's numbers against the dot-com and 2008 waves.

## Data contracts (probed live 2026-07-30)

### Eviction Notices — `5cei-gny5`
- 48,752 rows, `file_date` 1997-01-02 → 2026-07-28 (~2-day publish lag), updated daily.
- Geo: `client_location` (point) ~99.8% populated every year; `neighborhood` = the 41
  Analysis Neighborhoods (verified 41 distinct); `supervisor_district`.
- ~19 boolean cause columns — **real JSON booleans** (`non_payment = true`, no quotes).
  A notice can carry multiple causes.
- Volume: ~800–1,500/yr recent (2025: 1,495, highest since 2019); citywide multi-year
  ranges exceed the 5K row cap → dot sample caps, stat cards stay server-true,
  compare-suppression machinery applies.

### Buyout Agreements — `wmam-7g8d`
- **The dataset is disclosure filings, not agreements**: 8,431 rows since March 2015
  (buyout ordinance). All rows have `pre_buyout_disclosure_declaration_date`; only
  **3,786 (45%) have `buyout_agreement_date`** — the rest are opened negotiations that
  never produced a filed agreement. **The stream filters on
  `buyout_agreement_date IS NOT NULL`** (the date-range WHERE does this naturally);
  declarations surface only as context copy ("3,786 agreements from 8,431 opened
  negotiations").
- Amounts: `buyout_amount` present on **96% of dated agreements** (3,651/3,786);
  missing amounts skew to 2026 (77 of 180 — entry lag, disclose as such).
  `unknown_amount` flag is true-or-absent (56 true). 15 zero-dollar rows.
  Median 2025: $40,000; lifetime max $469,562; **SoQL `median()` confirmed supported**.
- Geo: `point` + `geocoding_confidence` (≥94, mostly 100); `analysis_neighborhood` =
  39 distinct, an exact-name subset of the 41 Analysis Neighborhoods → sidebar join is
  safe.

## Architecture

`src/views/Housing/Housing.tsx` cloned from the CrimeIncidents template (the repo's
copy-paste chassis). Single local stream spine — the one table Last 48 never had:

```ts
const HOUSING_STREAMS = [
  { id: 'evictions', label: 'Eviction Notices', pigment: '#b85a33', // terracotta-500
    datasetKey: 'evictionNotices', dateField: 'file_date',
    geoField: 'client_location', neighborhoodField: 'neighborhood' },
  { id: 'buyouts', label: 'Buyouts', pigment: '#d4a435',            // ochre-500
    datasetKey: 'buyoutAgreements', dateField: 'buyout_agreement_date',
    geoField: 'point', neighborhoodField: 'analysis_neighborhood' },
] as const
type StreamId = (typeof HOUSING_STREAMS)[number]['id']
```

- Per stream: `useDataset` row query (map dots, `$limit: 5000`) + server-side aggregates
  (count, neighborhood GROUP BY; evictions add the cause-breakdown query).
- Stream toggle chips in the header (TrafficSafety overlay-chip visual; Last 48 toggle
  mechanics): `enabled: StreamId[]`, `onToggle(id)`, URL `?streams=evictions` (param
  absent = both on). Layer-off = pass `null` geojson to `useMapLayer`.
- Two `useMapLayer` calls (different symbology), NOT one merged source — buyout rings
  need amount-driven radii; eviction dots need heatmap-mode swap.

## Map encoding

- **Evictions:** solid terracotta circles, zoom-interpolated radius (CrimeIncidents
  sizing); heatmap mode via the standard map-mode toggle (dots ↔ heat) applies to this
  stream only.
- **Buyouts:** hollow ochre rings (house hollow-ring idiom: stroke-weighted, faint
  fill). Radius ∝ `sqrt(buyout_amount)` clamped to ~[4, 22] px across the $0–$470K
  domain. Amount-missing rows: fixed minimum radius, reduced stroke opacity; tooltip
  "amount undisclosed"; map legend counts them ("N of M amounts undisclosed").
- **Draw order:** ACS underlay < eviction dots/heat < buyout rings < labels.
  Underlay via `useDemographicUnderlay({ beforeLayerId: <eviction layer id> })`;
  `UNDERLAY_PRESETS['housing'] = ['medianRent', 'rentBurden', 'renterPct',
  'medianHomeValue']` (exact `CensusVariable` keys verified at impl).
- Tooltips via `useMapTooltip` per layer (suppressed on touch per house rule).

## Era strip (new primitive)

`src/views/Housing/EraStrip.tsx` + pure helpers `eraStrip.ts` (Vitest-tested).

- Slim band between header and map (not a map overlay; doesn't fight CardTray).
  ~80px desktop; mobile drops annotation labels (`desk:` variant).
- Data: one GROUP-BY-year query per stream (`date_extract_y`, ~30 rows, cacheable,
  **unfiltered by cause** — the strip is stable storytelling context, not a filtered
  readout). Terracotta annual eviction bars 1997–2026; slimmer ochre agreement bars
  from 2015 only — **absence before 2015 is annotated ("buyout ordinance, March
  2015"), never rendered as zero**.
- D3 brush over the year scale → on brush-end, snap to year boundaries and write the
  **global** `dateRange` (appStore); clamp end to today. Single-year click selects that
  year. The strip also *renders* the current global range as a highlight window, so
  DateRangePicker edits reflect back — two faces, one time system.
- Editorial annotations (hardcoded, AP style): dot-com wave (peak 1998–2001), 2008
  crisis, Ellis wave (2013–15), COVID cliff (2020).
- All text rem via inline style (Large Type Phase 3); no `text-*` tokens in SVG.

## Cause filter (evictions)

`src/views/Housing/EvictionCauseFilter.tsx`, cloned from the `IncidentCategoryFilter`
idiom (module-local groups, **empty Set = all**, solo click, group click intersects
with causes present in range).

- **No-fault** (9): `owner_move_in`, `ellis_act_withdrawal`, `demolition`,
  `capital_improvement`, `substantial_rehab`, `condo_conversion`, `development`,
  `lead_remediation`, `good_samaritan_ends`
- **At-fault** (9): `non_payment`, `breach`, `nuisance`, `illegal_use`,
  `late_payments`, `failure_to_sign_renewal`, `access_denial`,
  `unapproved_subtenant`, `roommate_same_unit`
- **Other** (1): `other_cause`

WHERE = `(colA = true OR colB = true …)`; URL `?causes=` CSV. Breakdown counts come
from ONE wide query — `SELECT sum(case(non_payment = true, 1, 0)) as non_payment, …`
— over the date-only clause (sidebar breakdown stays unfiltered while the filter
narrows dots + cards; CrimeIncidents `dateOnlyClause` idiom). Cause chips in the
detail panel; multi-cause notices count once per cause in the breakdown (disclose:
"causes exceed notices — a notice can cite several").

## Stat cards, sidebar, details

**CardTray** (`viewId: 'housing'`):
1. Eviction notices — count, YoY delta, spark; subtitle: "Notices filed with the Rent
   Board — not completed evictions." (terracotta)
2. No-fault share — % of notices citing any no-fault cause; YoY. (terracotta)
3. Buyout agreements — count; subtitle: "From N opened negotiations" (declarations in
   range, second cheap count query). (ochre)
4. Median buyout — server `median(buyout_amount)`; subtitle "of disclosed amounts";
   suppressed when 0 agreements. (ochre)
Compare wiring passes each stream's `hitLimit` (5K-cap suppression; "Compare needs a
narrower date range" card).

**Sidebar** (`MapSidebar`): neighborhood ranking, both streams color-coded per row
(eviction count bar + buyout count/total-$ figure — comparison framing, NOT
drilldown; selecting a neighborhood keeps citywide as the canvas per house rule);
cause filter; cause breakdown bars. Neighborhood select → `?nh=`, camera preset via
`useMapCameraPresets`.

**Detail panels** (`DetailPanelShell`, click-driven, top-right): eviction — file
date (AP style), address, cause chips, district, constraints date if present;
buyout — agreement date, amount or "undisclosed", tenant count, declaration date.
Deep link `?detail=evictions:<eviction_id>` / `buyouts:<case_number>`.

## Honesty ledger (copy commitments)

1. Notices ≠ evictions (card subtitle + About page row).
2. Buyout rows = disclosure filings; the stream shows **agreements** (45% of
   negotiations); declarations appear as context copy only.
3. Buyouts exist only since March 2015 and only when disclosed — undercount by
   construction; era strip annotates rather than zero-fills.
4. Missing amounts: distinct rendering, legend disclosure, excluded from $ aggregates
   ("of disclosed amounts"); 2026 skew is entry lag.
5. 5K-cap compare suppression on wide ranges (existing machinery).
6. Cause breakdown sums exceed notice count (multi-cause) — disclosed inline.

## Registration checklist

- `src/api/datasets.ts`: `evictionNotices`, `buyoutAgreements`; widen `category` union
  with `'housing'`.
- `src/App.tsx`: lazy route `/housing`. `AppShell.tsx` `NAV_ITEMS`: between Traffic
  Safety and Elections, terracotta accent, label "Housing", description "Evictions &
  buyouts".
- `src/types/datasets.ts`: `ViewId` union + `EvictionNoticeRow` / `BuyoutRow`.
- `src/views/Home/Home.tsx`: viz-picker card (stats: 29 years · $169.6M · 41
  neighborhoods). `useOmniSearch.ts` entry. `useViewIndicators.ts`: eviction ticker
  generator (30-day count + YoY), freshness-gated.
- `src/utils/censusVariables.ts`: `UNDERLAY_PRESETS['housing']`.
- About page sources table: two rows + limitations entries (sync per house rule).

## Out of scope (banked follow-ups)

Pulse integration (monthly-cadence streams can't back the live-anomaly wire); Tier-2
supply datasets (Housing Production `xdht-4php`, Affordable Pipeline `aaxw-2cb8`,
Rent Board Petitions `6swy-cmkq`); geo-newsletter housing stream; declarations as a
third toggleable stream; supervisor-district lens.

## Acceptance

- `pnpm build` (devman wrapper) + `pnpm test` green; new pure units tested: era-strip
  year/brush math, cause WHERE builder, buyout radius scale.
- Live on `vite preview`: streams render + toggle (`?streams=` round-trips); era strip
  brush moves the global range and cards/compare follow, picker edits reflect back;
  cause filter narrows dots/cards while breakdown holds; underlay sits below dots;
  undisclosed rings visibly distinct; detail deep links survive reload; mobile: sidebar
  = bottom sheet, era strip compact, no horizontal scroll.
- Numbers reconcile: card counts equal live Socrata aggregates for the same WHERE
  (spot-check via curl).
