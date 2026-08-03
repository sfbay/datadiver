# Era Track — the header time control

**Date:** 2026-08-03
**Status:** design approved (Jesse, 2026-08-03), pending implementation plan
**Mockup:** interactive, built against real SFPD counts — see "Mockup" below

## Problem

DataDiver's `DateRangePicker` (global chrome, mounted once in `AppShell`) carries a
timeline track hardcoded to **730 days** (`TRACK_SPAN_DAYS = 730`). It shows no data —
the position bar floats over an empty rail — and it cannot express a range older than two
years. Its presets stop at `2Y`.

Measured history depth across the dataset views (probed 2026-08-03):

| View | Span | Years | Reachable today |
|---|---|---|---|
| Housing (evictions) | 1997-01-02 → 2026-07-31 | 30 | yes — has its own EraStrip |
| Emergency Response | 2000-04-12 → 2026-08-02 | 27 | **no** |
| Crime Incidents | 2003-01-01 → 2026-08-01 | 24 | **no** (backfilled in PR #136) |
| Traffic Safety | 2005-01-01 → 2026-06-30 | 22 | **no** |
| 311 Cases | 2008-07-01 → 2026-08-01 | 19 | **no** |
| Parking Revenue | 2017-01-01 → 2026-08-02 | 10 | **no** |
| Parking Citations | published 1951 → 2044 | junk both ends | **no** |
| 911 Realtime | rolling ~6 weeks | — | correctly none |

**Six of nine dataset views hold a decade or more of history; five are unreachable
through the UI.** Housing is not a special case that earned a strip — it is the only one
that got one. PR #136 (SFPD 2003–2017 backfill) made the gap acute: 2,071,736 additional
incidents shipped, reachable only by hand-editing the URL.

## Decisions

Settled during brainstorming on 2026-08-03. Each was a real fork; recording them so they
are not re-litigated.

| Question | Decision | Why |
|---|---|---|
| How do the three temporal controls relate? | **One range axis + hour-of-day as a composing filter.** Not three peers. | `DateRangePicker` and an era strip both write `dateRange`; `TimeOfDayFilter` writes `timeOfDayFilter` and *intersects* a range rather than replacing it. Peer tabs would make "2010–2019, overnight only" unreachable. |
| Where does the strip live? | **It replaces the mini-track inside `DateRangePicker`.** | One temporal control site. Every view gains deep history without a bespoke component. Presets and date inputs stay for precision. |
| What do the presets mean? | **Duration, not position.** They resize the window in place, anchored to the range END. | Presets are relative-to-today; the strip is absolute. Once the strip reaches 2003 they fight: brush to 2010, click `30d`, and today's code teleports you to July 2026. Splitting position (strip) from duration (presets) resolves it and makes "June 2010, 30 days" expressible. |
| Is there a zoom / swap between scales? | **No.** | Coarse brush + exact duration button gives precision without a second scale. Removes a mode, a granularity switch, and the explanation of both. |
| Does the hour filter move into global chrome? | **No — stays per-view; global chrome shows a read-only chip when active.** | Hour data is per-view (`hourlyPattern.hourTotals`, mounted in 6 views). Moving it up needs a shell-level hourly provider, and 3 views have no hourly pattern. The chip prevents invisible state. |
| What do the bars encode? | **Record count, every view.** | Consistency over per-view cleverness. Also means the registry needs only a dataset key and a date field. |
| Header height | **38px bars desktop, 26px mobile** (today's track is 10px). | Approved from the mockup in context. |

## Interaction model

Two knobs. The strip sets **where**; the duration pills set **how long**.

```
brush across the strip        → snaps to whole years        → Jan 1 – Dec 31 2010
click [30d]                   → resizes in place, end-anchored → Dec 1 – 31 2010
press ← / →                   → steps by the window's own length → Nov 1 – 30 2010
click [NOW]                   → same duration, ending today
```

Precise rules:

1. **Brush snapping.** A drag selects whole years: `start = Jan 1 of min(year)`,
   `end = Dec 31 of max(year)`, clamped to the domain. A click (near-zero-width drag)
   selects the single year under the cursor. This matches the Housing EraStrip idiom
   (`snapBrushToRange` in `eraStripMath.ts`).
2. **Duration is end-anchored.** `[Nd]` sets `start = end − N days`, leaving `end` fixed.
   When the current range already ends today, this reproduces today's behavior exactly —
   `30d` still means "the last 30 days". That equivalence is the compatibility guarantee.
3. **Stepping.** `←`/`→` shift the whole window by its own length, clamped to the domain.
   With a 30-day window this walks history month by month; with `1Y` it walks year by year.
   Keyboard only reaches this when the strip has focus (`tabindex="0"`, `role="slider"`).
4. **Clamping.** Any operation that would push the window past either end of the domain
   slides it back inside, preserving length. It never silently shortens the window.
5. **NOW.** Preserves the current duration and moves `end` to today.

**Known tension, accepted:** brush-to-2010 then `30d` lands in *December* 2010, because
durations anchor to the end. Reaching June 2010 means dragging the window or typing dates.
Judged acceptable — era-scale journalism asks for "2010" or "the 2008 crash", rarely a
specific month, and the date inputs remain. Revisit after first real use; the alternative
(anchor short durations to the range start) is a one-line change in `dateWindow.ts`.

## Architecture

Four new units, each independently testable. No new store state.

```
src/utils/dateWindow.ts          pure — position/duration arithmetic
src/utils/eraStrip.ts            pure — Housing's eraStripMath.ts, LIFTED to shared
src/api/eraSources.ts            registry — per-view dataset, date field, domain clamp, seams
src/hooks/useEraSeries.ts        one GROUP BY per view (~24 rows), long cache
src/components/filters/EraTrack.tsx   the strip: bars + brush + seam markers
```

`DateRangePicker` keeps its identity and its slot in `AppShell`; only its internal track is
swapped for `<EraTrack>` (with fallback, below).

### `src/utils/dateWindow.ts` (pure)

Owns every date computation so the component stays presentational.

```ts
export interface Win { start: string; end: string }   // 'YYYY-MM-DD'
export interface Domain { start: string; end: string }

export function windowDays(w: Win): number
export function resizeToDays(w: Win, days: number, d: Domain): Win   // end-anchored
export function stepWindow(w: Win, dir: 1 | -1, d: Domain): Win      // by own length
export function moveToNow(w: Win, today: string, d: Domain): Win
export function clampWindow(w: Win, d: Domain): Win                  // slides, never shortens
export function snapToYears(a: string, b: string, d: Domain): Win
```

All arithmetic on `'YYYY-MM-DD'` strings, which sort chronologically and parse as UTC
midnight per spec — no host-timezone dependence, matching the discipline in
`crimeEra.ts` and `anomalyBaselineWindow.ts`.

### `src/utils/eraStrip.ts` (pure, lifted)

`src/views/Housing/eraStripMath.ts` moves here verbatim (`parseYearCounts`,
`snapBrushToRange`, `rangeToYearSpan`, `YearCount`). Housing imports from the new location.
This is the "lift on a second consumer" follow-up banked during the Housing wave.

Housing-specific pieces (`ERA_ANNOTATIONS`, `BuyoutYearCount`, `parseBuyoutYearCounts`)
**stay in `views/Housing/`** — they are that view's editorial content, not shared math.

### `src/api/eraSources.ts` (registry)

```ts
export interface EraSource {
  datasetKey: DatasetKey
  dateField: string
  /** Inclusive year bounds. Guards published-range junk. null = open. */
  clamp: [number, number | null]
  /** Optional structural discontinuities, rendered as a dashed rule + label. */
  seams?: Array<{ year: number; label: string }>
}
export const ERA_SOURCES: Partial<Record<ViewId, EraSource>>
```

Initial contents:

Keys are `ViewId` values, which are **kebab-case** (`src/types/datasets.ts:677`) — not the
camelCase dataset keys. Getting these confused yields a registry that silently never matches.

| `ViewId` key | dataset | dateField | clamp | seams |
|---|---|---|---|---|
| `'crime-incidents'` | `policeIncidents` | `incident_datetime` | `[2003, null]` | 2018 — "SFPD changed its category system" |
| `'emergency-response'` | `fireEMSDispatch` | `received_dttm` | `[2000, null]` | — |
| `'311-cases'` | `cases311` | `requested_datetime` | `[2008, null]` | — |
| `'traffic-safety'` | `trafficCrashes` | `collision_datetime` | `[2005, null]` | — |
| `'parking-citations'` | `parkingCitations` | `citation_issued_datetime` | `[2012, 2026]` | — |
| `'parking-revenue'` | `parkingRevenue` | `session_start_dt` | `[2017, null]` | — |
| `'housing'` | `evictionNotices` | `file_date` | `[1997, null]` | — |

**The Parking Citations clamp is load-bearing, not cosmetic.** That dataset publishes
`min = 1951-01-21` and `max = 2044-12-21`; both ends are data-entry junk. Without the clamp
the axis renders 94 years, almost all of it empty, and the real 14 years compress to
noise.

Every other route gets the existing 730-day track unchanged. Two distinct reasons, and the
lookup must handle both:

- **In the `ViewId` union but unregistered** — `'home'`, `'dispatch-911'`,
  `'business-activity'`, `'campaign-finance'`, `'demographics'`. No entry, no strip.
- **Not in the `ViewId` union at all** — `/live`, `/pulse`, `/elections`, `/city-budget`,
  `/neighborhoods`, `/alerts`, `/about`. The union (`src/types/datasets.ts:677`) predates
  these routes and does not cover them. The path→`ViewId` resolver must therefore return
  `undefined` for an unrecognized path rather than throwing or guessing, and
  `useEraSeries` reports `available: false`.

**The Last 48 case is a requirement, not an oversight:** `useUrlSync` strips `start`/`end`
on `/live`, so that view must not grow a history control. It falls out of the second bullet
for free, but a future widening of `ViewId` must not accidentally register it.

Crime is registered against `policeIncidents` (2018+) only. Its strip therefore shows
2018–2026 until PR #136 merges, at which point the era series should read both extracts
through `crimeEra.ts`. **This is a documented dependency, not a defect** — the plan must
sequence it.

### `src/hooks/useEraSeries.ts`

```ts
useEraSeries(viewId: ViewId): {
  years: YearCount[]; domain: Domain; seams: Seam[];
  isLoading: boolean; available: boolean   // false → caller renders the legacy track
}
```

One query per view:

```
$select = date_extract_y(<dateField>) as yr, count(*) as n
$group  = yr
$where  = <dateField> >= '<clampStart>-01-01'   (and < clampEnd+1 when clamped)
$limit  = 60
```

~24 rows. Cached 24h — annual counts move at most once a day, and only in the current
year's bar. Fires once per view, independent of `dateRange`, so brushing costs nothing.

### `src/components/filters/EraTrack.tsx`

Presentational plus pointer handling. Props: `years`, `domain`, `seams`, `value: Win`,
`onChange(w: Win)`, `compact?: boolean`. No store access, no fetching — so it is
storybook-able and testable in isolation.

## Data flow

```
AppShell
  └─ DateRangePicker                    (reads dateRange from appStore)
       ├─ useEraSeries(activeViewId)    → years, domain, seams, available
       ├─ available ? <EraTrack/> : <LegacyTrack/>
       └─ duration pills → dateWindow.resizeToDays → setDateRange
```

`activeViewId` derives from the router path. `DateRangePicker` continues to write
`dateRange` and nothing else, so `useUrlSync`, compare mode, `useTrendBaseline`,
`useDataFreshness` and every view query are untouched.

## Honesty requirements

Non-negotiable, in the house tradition of disclosing rather than hiding:

1. **Partial current year is marked**, not drawn as a collapse. 2026 is ~7 months of data;
   rendered solid it reads as a historic crash. Hatched fill (the established idiom —
   `feedback_hatch_zone_idiom`), and excluded from any peak/floor emphasis.
2. **Seams are labeled.** The 2018 crime seam is a definitional discontinuity: same city,
   same phenomenon, different counting system. A continuous unmarked bar run would imply
   like-for-like. Dashed rule + label.
3. **Domain clamps are honest, not silent.** Where a clamp hides published rows
   (Parking Citations), the axis label says the range is clamped.
4. **Loading shows skeleton bars**, never a collapsed or empty strip — an empty strip is
   indistinguishable from "this city had no crime".

## Testing

- **Unit (Vitest, node):** `dateWindow.ts` — resize end-anchoring, step-by-length,
  clamp-slides-never-shortens, year snapping, the today-anchored equivalence with current
  preset behavior. `eraStrip.ts` — existing Housing tests move with the module and must
  still pass unchanged.
- **Registry pinning test:** every `ERA_SOURCES` entry names a real `DatasetKey` and a
  `dateField` that exists in `DATASETS`. This is the `duplicated-allowlist-drift` lesson —
  a shared constant plus a pinning test, not a hand-checked table.
- **Live DOM probes** (the repo's render-gate rule — a diff review is not acceptance for a
  render-path change): a modern range, a historical range, a registry-less view falling
  back to the legacy track, and `/live` confirming no strip appears.

## Out of scope

- Moving the hour filter into global chrome (decided against).
- A second zoom level or granularity switch (dissolved by position/duration).
- Replacing Housing's `EraStrip` component. It is a hero editorial element — dual-stream
  stacked bars, annotation dots, selection glow, `h-20 desk:h-28`. The header track is
  chrome. **Two components, one math module.**
- Per-view bar metrics. Record count everywhere.
- Backfilling additional datasets to extend their domains.

## Mockup

An interactive mockup was built against the real 24-year SFPD series and approved:
before/after header comparison, live brush + duration + arrow stepping, the 2018 seam,
the hour chip, the Last 48 fallback, the Parking Citations clamp, and the mobile variant.
It uses DataDiver's real tokens (espresso/cream grounds, terracotta bars, teal selection,
corner glow) so proportions were judged in context.

## Open items

- The December-vs-June anchoring tension (see Interaction model). Ship end-anchored;
  revisit after real use.
- Whether seam markers generalize beyond crime. Only one seam is known today; the registry
  supports more without further design.
