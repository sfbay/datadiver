# Date-anchored Compare + Surfaced Counts — Design

**Date:** July 17, 2026
**Origin:** Reporter feedback via Jesse — wanted to (1) see emergency response times on July 4,
(2) compare them to previous 4ths and to normal days, (3) see empirical counts surface
prominently ("xx calls overall"). Investigation found all three partially built but invisible,
plus one honesty bug.

## Problems

1. **The "1yr" compare option shifts 360 days, not a calendar year.** On a single-day view of
   Jul 4 2026, "1yr ago" silently compares against Jul 9 2025 — wrong calendar day, wrong
   holiday. Invisible on 30/90-day ranges, flat wrong for day-vs-day questions.
2. **No pinned-date comparison.** The Compare popover offers only relative offsets; a reporter
   cannot compare two specific dates of their choosing.
3. **No "vs a normal day" framing.** The z-score machinery exists but surfaces as `+8.3σ`
   sidebar jargon — banned vocabulary everywhere else on the site.
4. **The Incidents count card exists but is collapsed by default** (`defaultExpanded: false`),
   rendering as a tiny "Inc 814" pill. The three expanded stat cards are all durations; the
   reporter looked straight at 814 calls and couldn't find the number.

## Decisions (Jesse, this session)

- Counts get **first-class card treatment**; the map surface stays clean (no on-map count labels).
- Comparison is **two-way now** (current view vs one comparison window); N-way multi-year
  ladder is explicitly deferred.
- **Shared rebuild**: the new compare model replaces the old one for every consuming view at
  once — no coexisting idioms.
- Compare UI **defaults to concrete dates shown as links that spawn a picker** (Jesse's
  framing) rather than abstract period labels.

## 1 · Comparison state model

Replace `comparisonPeriod: number | null` in `appStore` with a discriminated union:

```ts
export type ComparisonMode =
  | { kind: 'preset'; preset: 'prev' | '30d' | '90d' | '180d' | '1yr' }
  | { kind: 'date'; start: string }   // pinned ISO YYYY-MM-DD = comparison window start
  | null
```

A pure resolver (new file `src/utils/comparisonMode.ts`, Vitest-tested) turns either kind into
a concrete window:

```ts
resolveComparisonStart(mode: ComparisonMode, dateRange: DateRange): string | null
```

- **Presets follow the range** — they re-resolve whenever the main date range moves:
  - `prev` = back by the current range's own length (contiguous previous period)
  - `30d` / `90d` / `180d` = fixed day offsets (unchanged semantics)
  - `1yr` = **same calendar day, previous year** (365/366-aware; Feb 29 → Feb 28)
- **Pinned dates stay put** — `{ kind: 'date' }` is a fact, not a relationship.
- The comparison window's **length always equals the current range's length**
  (end = resolved start + range length).

The same module exports the label/serialization helpers so display and URL can't drift:
`comparisonLabel(mode, dateRange)` (AP-style: "vs Jul 4, 2025"; multi-day
"vs Jul 4–10, 2025"), `serializeComparison(mode)` / `parseComparison(param)`.

### URL contract

`?compare=prev|30d|90d|180d|1yr` or `?compare=YYYY-MM-DD`. **Legacy numeric params migrate**
on parse: `30→30d`, `90→90d`, `180→180d`, `360→1yr`; any other number maps to the nearest
preset. Old shared links keep working and become more honest, not broken.

## 2 · Comparison data factory

`createComparisonDataHook` (in `src/hooks/useComparisonDataFactory.ts`) changes its hook
signature from `comparisonDays: number | null` to `compStart: string | null` (the resolved
comparison window start). Internally it builds the comparison WHERE from `compStart` plus the
current range length — replacing the `daysBeforeDate` shift. Everything else is untouched,
in particular the **5K-cap delta suppression** (`suppressed` flag): a capped sample still
suppresses deltas rather than guessing.

Call sites (6): EmergencyResponse, CrimeIncidents, Cases311, Dispatch911, ParkingCitations,
TrafficSafety — each changes from passing `comparisonPeriod` to passing
`resolveComparisonStart(comparison, dateRange)` (one line each; memoized in the view or
resolved inside a small shared helper hook).

## 3 · ComparisonPopover → date links

`src/components/filters/ComparisonPopover.tsx` redesign:

- **Active pill text is the concrete date**: "vs Jul 4, 2025" — the date itself is the
  load-bearing interface, and it reads as a link (click re-opens the menu/picker).
- **Dropdown rows are presets with their resolved dates**, e.g.:
  - "Same day last year · Jul 4, 2025"
  - "Previous period · Jul 3, 2026"
  - "30 days earlier · Jun 4, 2026" (likewise 90d/180d)
  - "Pick a date…" → an inline date input; choosing one sets `{ kind: 'date', start }`.
- Selection idiom follows the Last 48 standard (ochre tint + ring for the active row).
- Card subtitles across all consuming views change from "+12% vs 1yr" to
  "+12% vs Jul 4, 2025" via `comparisonLabel` — no per-view label formatting.
- The legacy `ComparisonToggle` (if still referenced anywhere) is removed or migrated in the
  same pass; one compare control site-wide.

## 4 · Counts + typical day (Emergency Response flagship)

- The **Incidents card** becomes `defaultExpanded: true` and moves to **second position**
  (Avg Response · Incidents · Median · Slowest 10%) — "xx calls overall" is visible at first
  paint on the view the reporter was using.
- New small hook `useTypicalDay` (ER-scoped for now; factory-ready shape): one server-side
  GROUP BY query for daily counts over the trailing 90 days (ending at the dataset's real
  data edge, honoring the freshness idiom), returning a mean daily count. **Fires only when
  the selected range is ≤ 7 days** — a typical-day line against a long range is circular, so
  it is absent rather than misleading (present/suppressed/absent transparency principle).
- The Incidents card subtitle composes context in priority order:
  1. neighborhood selection (existing behavior wins unchanged),
  2. compare delta + typical-day when both fit: "+2.9% vs Jul 4, 2025 · typical ≈ 640",
  3. typical-day alone: "typical day ≈ 640 calls".
- Wording goes through a tiny pure phrase helper with a unit test enforcing the dejargoned
  vocabulary (no σ, no "z-score", no "baseline" — same banned-terms list as pulsePhrase).

## Out of scope (deferred, recorded)

- N-way / multi-year "previous 4ths" ladder (chart tile riding the same resolver — natural
  follow-up once two-way lands).
- On-map per-neighborhood count labels (Jesse chose cards-only).
- Porting the typical-day line to the other five views (pattern is reusable by design).
- The sidebar's `+8.3σ` jargon cleanup — pre-existing, tracked in the honesty backlog, not
  touched here.

## Testing

- `comparisonMode.ts` resolver: calendar-year across leap years (Feb 29 2024 → Feb 28 2023),
  month-end arithmetic, prev-period window lengths, pinned-date passthrough.
- URL parse/serialize round-trips + legacy numeric migration cases.
- Typical-day phrase helper: banned-terms assertion + formatting cases.
- Existing comparison/view suites stay green; full ground-truth build via
  `~/dev/devman/tools/devman-build.mjs pnpm build`.

## Verification

Manual flagship pass on Emergency Response: Jul 4–Jul 4 range → Incidents card expanded with
count; compare "Same day last year" shows "vs Jul 4, 2025" and honest deltas; pinned date via
picker survives a range change; `?compare=360` legacy link resolves to 1yr.

Ships as **one PR**.
