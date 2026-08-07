# Oakland Front Door (Stage 4b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Oakland publicly reachable — a real `/oakland` landing page with an honesty-hardened ticker, a city switcher in the shell, a doorway card on SF's Home, and a city-sectioned About.

**Architecture:** The Oakland manifest gains a `home` entry (auto-generating the route/nav/⌘K row) plus `homeCard` fields; `VIEW_COMPONENTS.home` becomes a `HomeRouter` dispatching SF's existing Home vs a lazy `CityLanding` built entirely from CityConfig + manifest; a new `useOaklandIndicators` hook rides a pure, node-tested framing leaf whose count windows end at measured completeness edges (never at `max(dateField)`); `crossCityPath` in the registry powers both the brand-row `CitySwitcher` and new ⌘K city rows; `CityChangeReset` is rebuilt on a pinned dual-city selection-field list; About splits sources per portal and gains four Oakland findings.

**Tech Stack:** Vite + React 18 + TS, Vitest (node env, `src/**/*.test.ts` only — no `.tsx` tests), React Router v6+ ranking, Zustand selectors, Socrata SODA.

**Spec:** `docs/superpowers/specs/2026-08-06-oakland-front-door-design.md` §B (incl. the two 4a carries recorded in §B5). Branch `feat/oakland-front-door` (from main post-#148).

## Global Constraints

- **New chrome gates on LIVENESS (`isViewLive`/`liveManifest`), never `city.id`** — except inside routed view components (the dialect pattern; `HomeRouter` runs inside a route with `key={city.id}` remount).
- **Every count window ends at the stream's completeness edge, never at `max(dateField)`** — the measured constants are pinned in Task 1 and must be used verbatim (crime edge 8d / suppress 14d; 311 edge 1d / suppress 3d; citations edge 3d).
- **Every direct `fetchDataset` call in the new hook passes explicit `cityId: 'oakland'`**; datetimes parse via `parseSfLocal` (never `Date.parse`); WHERE cutoffs are built from date-only strings, never `toISOString()`.
- **No new store fields.** `setSelectedCitation` already exists; the switcher writes nothing to the store (navigation only — the URL is the city authority).
- **The status chip never says "Live"** and never navigates (Oakland has no `/live`). The landing renders no investigation cards, no PulseTeaser, no Neighborhood Profiles, no AlertsRibbon, no Dana comic row.
- **The landing's footer carries the hover-free beat-name disclosure link** (§B5 carry — load-bearing the day this ships).
- **`getDefaultCycle` defaults to SF_ELECTIONS** — Oakland callers MUST pass `cityElections('oakland')`.
- **SF surfaces change only at approved sites:** SfHome's `homeCards` memo (liveManifest hygiene), the doorway card appended to both grids, About's prose/table restructure, `CityChangeReset`, the AppShell subtitle block. Everything else byte-identical.
- Copy rules: AP-style dates in ticker copy ("week ending July 27"); reader-facing text never says σ/z-score/baseline.
- Verify with `npx vitest run <paths>` + `npx tsc -b`; ground truth `~/dev/devman/tools/devman-build.mjs pnpm build` at final review. Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01TgLFsJYZVogZjPH6sy68cw`

---

### Task 1: Pure leaves — ticker framing, dual-city selection list, `crossCityPath`

**Files:**
- Create: `src/views/Home/oaklandIndicators.ts`
- Create: `src/stores/citySelections.ts`
- Modify: `src/cities/registry.ts` (append `crossCityPath`)
- Modify: `src/utils/comparisonMode.ts` (add `export` to the existing private `apMonthDay` — one word, nothing else)
- Test: `src/views/Home/oaklandIndicators.test.ts`, `src/stores/citySelections.test.ts`, `src/cities/registry.test.ts` (append the crossCityPath describe)

**Interfaces:**
- Produces: `OAK_TICKER_EDGES` (const table), `completeWindow(maxLocal, edgeDays, spanDays)`, `isStaleLocal(maxLocal, maxAgeDays, nowMs)`, `apDate(isoDate, nowYear?)`, `crimeCopy/threeOneOneCopy/citationsCopy/cfCopy` (copy builders) — consumed by Task 2's hook. `CITY_SELECTION_FIELDS`/`CitySelectionField` — consumed by Task 5. `crossCityPath(target, currentViewId)` — consumed by Tasks 5 + 6.

- [ ] **Step 1: Write the failing leaf tests**

Create `src/views/Home/oaklandIndicators.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  OAK_TICKER_EDGES,
  completeWindow,
  isStaleLocal,
  apDate,
  crimeCopy,
  threeOneOneCopy,
  citationsCopy,
  cfCopy,
} from './oaklandIndicators'

describe('OAK_TICKER_EDGES (measured 2026-08-07 — see spec §B2 + plan Task 1)', () => {
  it('pins the measured completeness edges', () => {
    expect(OAK_TICKER_EDGES).toEqual({
      crimeEdgeDays: 8,
      crimeSuppressMaxAgeDays: 14,
      threeOneOneEdgeDays: 1,
      threeOneOneSuppressMaxAgeDays: 3,
      citationsEdgeDays: 1,
    })
  })
})

describe('completeWindow', () => {
  it('ends the window edgeDays before max, spanning spanDays date-only days', () => {
    // crime probe fact: max 2026-08-04 → edge 8 → week ending 2026-07-27
    expect(completeWindow('2026-08-04T01:00:00.000', 8, 7)).toEqual({
      start: '2026-07-21',
      end: '2026-07-27',
    })
  })
  it('crosses month boundaries on date math, not string math', () => {
    expect(completeWindow('2026-03-03T12:00:00.000', 3, 7)).toEqual({
      start: '2026-02-22',
      end: '2026-02-28',
    })
  })
})

describe('isStaleLocal', () => {
  const NOW = Date.UTC(2026, 7, 7, 19, 0, 0) // 2026-08-07 noon PT
  it('fresh inside the window, stale outside', () => {
    expect(isStaleLocal('2026-08-04T01:00:00.000', 14, NOW)).toBe(false)
    expect(isStaleLocal('2026-07-01T01:00:00.000', 14, NOW)).toBe(true)
  })
})

describe('apDate', () => {
  it('AP month style via the comparisonMode authority', () => {
    expect(apDate('2026-07-27', 2026)).toBe('July 27')
    expect(apDate('2026-05-15', 2026)).toBe('May 15')
    expect(apDate('2026-08-04', 2026)).toBe('Aug. 4')
    expect(apDate('2026-09-01', 2026)).toBe('Sept. 1')
  })
  it('adds the year only when it differs from now', () => {
    expect(apDate('2025-12-31', 2026)).toBe('Dec. 31, 2025')
  })
})

// The DATE RIDES THE HEADLINE (plan-verify C1: the hero + standard tickers
// never render `detail`, so a detail-borne date would be invisible exactly
// where the landing shows the item). `value` is the bare big-figure
// (C2: TickerCard renders value under the headline — a duplicated headline
// there was the rejected form).
describe('copy builders (self-dating headlines, bare values)', () => {
  it('crime: dated complete week', () => {
    expect(crimeCopy(382, '2026-07-27', 2026)).toEqual({
      headline: '382 crime incidents · week ending July 27',
      value: '382',
    })
  })
  it('311: dated complete week', () => {
    expect(threeOneOneCopy(2149, '2026-08-05', 2026)).toEqual({
      headline: '2,149 311 requests · week ending Aug. 5',
      value: '2,149',
    })
  })
  it('citations: 30 days through the edge date', () => {
    expect(citationsCopy(41876, '2026-05-17', 2026)).toEqual({
      headline: '41,876 parking citations · 30 days through May 17',
      value: '41,876',
    })
  })
  it('campaign finance: names the concluded cycle, no "filed through" claim', () => {
    // $3,993,223.68 is the LIVE Apr-2025 sum under the OAK totals builder's
    // exact WHERE (incl. tran_amt1 > 0 — the earlier $3.93M probe lacked
    // that filter and crosses the toFixed(1) boundary; plan-verify I1).
    expect(cfCopy(3993223.68, 'Apr 2025')).toEqual({
      headline: '$4.0M raised · Apr 2025 cycle',
      value: '$4.0M',
    })
    // pure rounding vectors, not live pins:
    expect(cfCopy(8592930.96, 'Nov 2024').value).toBe('$8.6M')
    expect(cfCopy(950_000, 'Apr 2025').value).toBe('$950K')
  })
})
```

Create `src/stores/citySelections.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CITY_SELECTION_FIELDS } from './citySelections'

describe('CITY_SELECTION_FIELDS (cross-city reset contract)', () => {
  it('every selection field consumed by a view live in BOTH cities is listed', () => {
    // crime-incidents, 311-cases, parking-citations are live in sf AND oakland;
    // their selection fields must reset on a cross-city navigation. This pin
    // failed to exist in stage 3b and the switcher made the leak one click
    // deep (spec §B3). When a new view gains a second city, its field joins
    // this list — and CityChangeReset's Record<CitySelectionField, …> forces
    // the setter wiring at compile time.
    expect([...CITY_SELECTION_FIELDS].sort()).toEqual([
      'selected311Case',
      'selectedCitation',
      'selectedCrimeIncident',
      'selectedNeighborhood',
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/views/Home/oaklandIndicators.test.ts src/stores/citySelections.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/views/Home/oaklandIndicators.ts`**

```ts
import { parseSfLocal } from '@/utils/sfTime'
import { apMonthDay } from '@/utils/comparisonMode'

/**
 * Pure framing logic for the Oakland landing ticker (spec §B2).
 *
 * GOVERNING RULE: every count window ends at the stream's COMPLETENESS EDGE,
 * never at max(dateField). Oakland's feeds have fill-in tails — a naive
 * "past 7 days" crime count returned 76 against a ~385 steady state while
 * max(datetime) was only 2 days old (the banked ticker-freshness class).
 * Edges below were measured 2026-08-07 from live fill-in curves (full
 * method + tables: the 4b plan, Task 1):
 *  - crime (ppgh-7dqv): offsets 0–7 before max run ~2%→56% of the steady
 *    daily median (~55–63/day depending on window); offset 8 is the first
 *    day clearing 85% of it → edge 8.
 *  - 311 (quth-gb8e): day max−1 sits at the TOP of the weekday band —
 *    next-day-complete → edge 1.
 *  - citations (58em-y96b): offset 0 (a Monday at ~10% of the Monday norm)
 *    is incomplete; offsets 1–2 were VERIFIED complete weekend days against
 *    their own day-matched floors → edge 1. Note the edge is day-of-week
 *    dependent and layered ON TOP of the ~11-week base publishing lag —
 *    the dated copy carries the truth either way.
 * Campaign finance uses no edge: the item shows a CONCLUDED cycle's total
 * (complete by construction) and names the cycle — "filed through
 * max(tran_date)" was rejected as fabricated completeness (the current
 * semiannual is unfiled; that max rests on outlier rows).
 */
export const OAK_TICKER_EDGES = {
  crimeEdgeDays: 8,
  crimeSuppressMaxAgeDays: 14,
  threeOneOneEdgeDays: 1,
  threeOneOneSuppressMaxAgeDays: 3,
  citationsEdgeDays: 1,
} as const

/** Date-only window [end − spanDays + 1, end] where end = max − edgeDays.
 *  All math on UTC day numbers of the FLOATING local date — never string
 *  slicing across month boundaries, never toISOString on a local now. */
export function completeWindow(
  maxLocal: string,
  edgeDays: number,
  spanDays: number
): { start: string; end: string } {
  const day = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  const DAY = 86_400_000
  const end = day(maxLocal) - edgeDays * DAY
  return { start: fmt(end - (spanDays - 1) * DAY), end: fmt(end) }
}

/** True when the stream's max(dateField) is older than maxAgeDays. */
export function isStaleLocal(maxLocal: string, maxAgeDays: number, nowMs: number): boolean {
  return nowMs - parseSfLocal(maxLocal) > maxAgeDays * 86_400_000
}

/** AP-style date; year appended only when it differs from nowYear.
 *  Month styling delegates to comparisonMode's apMonthDay — the repo's ONE
 *  AP-month authority (a second private table is the duplicated-allowlist
 *  class). Task step: export apMonthDay from src/utils/comparisonMode.ts
 *  (it is currently module-private; add `export` to the existing function,
 *  nothing else changes). */
export function apDate(isoDate: string, nowYear: number): string {
  const y = Number(isoDate.slice(0, 4))
  const base = apMonthDay(isoDate.slice(0, 10))
  return y === nowYear ? base : `${base}, ${y}`
}

const n = (v: number) => v.toLocaleString('en-US')

/** Compact money: $4.0M / $950K / $412 — headline register. */
function money(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`
  return `$${Math.round(v)}`
}

// Headlines SELF-DATE (the hero/standard tickers never render `detail`);
// values are bare big-figures (TickerCard renders value under the headline).
export function crimeCopy(count: number, weekEnd: string, nowYear: number) {
  return { headline: `${n(count)} crime incidents · week ending ${apDate(weekEnd, nowYear)}`, value: n(count) }
}
export function threeOneOneCopy(count: number, weekEnd: string, nowYear: number) {
  return { headline: `${n(count)} 311 requests · week ending ${apDate(weekEnd, nowYear)}`, value: n(count) }
}
export function citationsCopy(count: number, throughDate: string, nowYear: number) {
  return { headline: `${n(count)} parking citations · 30 days through ${apDate(throughDate, nowYear)}`, value: n(count) }
}
export function cfCopy(total: number, cycleLabel: string) {
  return { headline: `${money(total)} raised · ${cycleLabel} cycle`, value: money(total) }
}
```

- [ ] **Step 4: Write `src/stores/citySelections.ts`**

```ts
/**
 * Store selection fields whose vocabulary is city-specific AND whose views
 * are live in MORE THAN ONE city — each is nulled on a cross-city
 * navigation (CityChangeReset in App.tsx builds an exhaustive
 * Record<CitySelectionField, setter> from this list, so adding a field
 * here without wiring its setter is a compile error). A pure leaf because
 * appStore itself is unimportable under the node-only Vitest.
 * The other selected* fields (meter/crash/business/housing/incident)
 * belong to SF-only views — they join this list when those views gain a
 * second city, not before.
 */
export const CITY_SELECTION_FIELDS = [
  'selectedNeighborhood',
  'selectedCrimeIncident',
  'selected311Case',
  'selectedCitation',
] as const

export type CitySelectionField = (typeof CITY_SELECTION_FIELDS)[number]
```

- [ ] **Step 5: Append `crossCityPath` to `src/cities/registry.ts`**

After `isViewLive`, add (plus `viewPath` to the routing import at line 1: `import { viewPath, type CityId } from './routing'` — note the current import is type-only):

```ts
/** Where a city switch lands: the same view when the target city has it
 *  live, else the target's home. The program-spec switch semantics —
 *  consumed by the shell CitySwitcher and the ⌘K city rows. */
export function crossCityPath(target: CityId, currentViewId: string): string {
  return isViewLive(target, currentViewId)
    ? viewPath(target, currentViewId)
    : viewPath(target, 'home')
}
```

- [ ] **Step 6: Append two describes to `src/cities/registry.test.ts`**

```ts
describe('crossCityPath (switch semantics)', () => {
  it('same view when live in the target city', () => {
    expect(crossCityPath('oakland', 'crime-incidents')).toBe('/oakland/crime-incidents')
    expect(crossCityPath('sf', 'parking-citations')).toBe('/parking-citations')
  })
  it('falls back to the target home when the view is not live there', () => {
    expect(crossCityPath('oakland', 'housing')).toBe('/oakland')
    expect(crossCityPath('oakland', 'elections')).toBe('/oakland')
    expect(crossCityPath('sf', 'home')).toBe('/')
  })
})
```

(the test file's registry import — currently `{ CITIES, getDatasetConfig }` —
gains `crossCityPath`. The catch-all liveness pin lands in TASK 3 with the
manifest entry it pins — a skipIf form here was rejected as vacuous: skipping
when the invariant breaks is the opposite of pinning it.)

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/views/Home/oaklandIndicators.test.ts src/stores/citySelections.test.ts src/cities/registry.test.ts && npx tsc -b`
Expected: all suites green; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add src/views/Home/oaklandIndicators.ts src/views/Home/oaklandIndicators.test.ts src/stores/citySelections.ts src/stores/citySelections.test.ts src/cities/registry.ts src/cities/registry.test.ts src/utils/comparisonMode.ts docs/superpowers/plans/2026-08-07-oakland-front-door.md
git commit -m "feat(oakland): 4b pure leaves — ticker completeness edges, city-selection reset contract, crossCityPath"
```

---

### Task 2: `useOaklandIndicators` — the landing ticker hook

**Files:**
- Create: `src/hooks/useOaklandIndicators.ts`

**Interfaces:**
- Consumes: Task 1's leaf; `fetchDataset` (`@/api/client`); `OAKLAND_CRIME_COUNT` from `@/views/CrimeIncidents/crimeDialect`; `fppcBuildersFor` from `@/views/CampaignFinance/fppcDialect`; `cityElections`, `getDefaultCycle` from `@/utils/electionCycles`; `TickerItem` from `@/types/ticker`; `viewPath` from `@/cities/routing`.
- Produces: `useOaklandIndicators(opts: { enabled: boolean }): { items: TickerItem[]; isLoading: boolean; lastUpdated: Date | null; error: boolean }` — consumed by Task 3's CityLanding. No `.ts` unit test (fetch orchestration; the leaf carries the logic) — `tsc -b` + the final gate cover it.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useOaklandIndicators.ts`:

```ts
import { useEffect, useRef, useState } from 'react'
import { fetchDataset } from '@/api/client'
import { viewPath } from '@/cities/routing'
import { OAKLAND_CRIME_COUNT } from '@/views/CrimeIncidents/crimeDialect'
import { fppcBuildersFor } from '@/views/CampaignFinance/fppcDialect'
import { cityElections, getDefaultCycle } from '@/utils/electionCycles'
import type { TickerItem } from '@/types/ticker'
import {
  OAK_TICKER_EDGES,
  completeWindow,
  isStaleLocal,
  crimeCopy,
  threeOneOneCopy,
  citationsCopy,
  cfCopy,
} from '@/views/Home/oaklandIndicators'

/**
 * The Oakland landing's four ticker items (spec §B2). Every direct
 * fetchDataset call passes cityId: 'oakland' explicitly — these run from
 * plain async functions where the route-derived default is unreadable.
 * Windows end at measured completeness edges (leaf docblock has the
 * curves); crime + 311 SUPPRESS when their max is stale, citations + CF
 * DISCLOSE (dated copy / named cycle) because their lag is structural.
 */

// timeoutMs is load-bearing: a query without it cannot be aborted at all
// and holds one of the browser's ~6 per-host connection slots for its life.
const OAK = { cityId: 'oakland' as const, timeoutMs: 15_000, retries: 1 }

async function probeMax(datasetKey: string, dateField: string): Promise<string | null> {
  const rows = await fetchDataset<Record<string, string>>(datasetKey, {
    $select: `max(${dateField}) as max_d`,
    $limit: 1,
  }, OAK)
  return rows[0]?.max_d ?? null
}

function dayWhere(field: string, start: string, end: string): string {
  // end is inclusive date-only: use an exclusive < end+1 boundary via T-suffix
  return `${field} >= '${start}T00:00:00' AND ${field} <= '${end}T23:59:59'`
}

async function fetchCrime(nowMs: number, nowYear: number): Promise<TickerItem | null> {
  const max = await probeMax('policeIncidents', 'datetime')
  if (!max || isStaleLocal(max, OAK_TICKER_EDGES.crimeSuppressMaxAgeDays, nowMs)) return null
  const w = completeWindow(max, OAK_TICKER_EDGES.crimeEdgeDays, 7)
  const rows = await fetchDataset<{ total: string }>('policeIncidents', {
    $select: `${OAKLAND_CRIME_COUNT} as total`,
    $where: dayWhere('datetime', w.start, w.end),
  }, OAK)
  const total = Number(rows[0]?.total ?? 0)
  if (!total) return null
  const copy = crimeCopy(total, w.end, nowYear)
  return {
    id: 'oak-crime',
    headline: copy.headline,
    category: 'trend',
    severity: 'neutral',
    source: {
      view: viewPath('oakland', 'crime-incidents'),
      label: 'Crime Incidents · OPD',
      datasetId: 'ppgh-7dqv',
    },
    value: copy.value,
    freshness: 'daily',
    computedAt: new Date(),
    priority: 70,
  }
}

async function fetch311(nowMs: number, nowYear: number): Promise<TickerItem | null> {
  const max = await probeMax('cases311', 'datetimeinit')
  if (!max || isStaleLocal(max, OAK_TICKER_EDGES.threeOneOneSuppressMaxAgeDays, nowMs)) return null
  const w = completeWindow(max, OAK_TICKER_EDGES.threeOneOneEdgeDays, 7)
  const rows = await fetchDataset<{ total: string }>('cases311', {
    $select: 'count(*) as total',
    $where: dayWhere('datetimeinit', w.start, w.end),
  }, OAK)
  const total = Number(rows[0]?.total ?? 0)
  if (!total) return null
  const copy = threeOneOneCopy(total, w.end, nowYear)
  return {
    id: 'oak-311',
    headline: copy.headline,
    category: 'trend',
    severity: 'neutral',
    source: {
      view: viewPath('oakland', '311-cases'),
      label: '311 Cases · OAK 311',
      datasetId: 'quth-gb8e',
    },
    value: copy.value,
    freshness: 'daily',
    computedAt: new Date(),
    priority: 60,
  }
}

async function fetchCitations(nowYear: number): Promise<TickerItem | null> {
  const max = await probeMax('parkingCitations', 'ticket_iss')
  if (!max) return null
  // DISCLOSE mode: the ~11-week base lag would permanently fail any gate;
  // the item is true, it just carries its date.
  const w = completeWindow(max, OAK_TICKER_EDGES.citationsEdgeDays, 30)
  const rows = await fetchDataset<{ total: string }>('parkingCitations', {
    $select: 'count(*) as total',
    $where: dayWhere('ticket_iss', w.start, w.end),
  }, OAK)
  const total = Number(rows[0]?.total ?? 0)
  if (!total) return null
  const copy = citationsCopy(total, w.end, nowYear)
  return {
    id: 'oak-citations',
    headline: copy.headline,
    category: 'trend',
    severity: 'neutral',
    source: {
      view: viewPath('oakland', 'parking-citations'),
      label: 'Parking Citations',
      datasetId: '58em-y96b',
    },
    value: copy.value,
    freshness: 'weekly',
    computedAt: new Date(),
    priority: 50,
  }
}

async function fetchCampaignFinance(): Promise<TickerItem | null> {
  // The CONCLUDED cycle — complete by construction, and the same cycle the
  // view opens on. getDefaultCycle defaults to SF_ELECTIONS: passing
  // Oakland's cycles explicitly is load-bearing.
  const cycle = getDefaultCycle(cityElections('oakland'))
  const spec = fppcBuildersFor('oakland').totals(cycle.start, cycle.end)
  const rows = await fetchDataset<{ total: string }>(spec.datasetKey, spec.params, OAK)
  const total = Number(rows[0]?.total ?? 0)
  if (!total) return null // absence guard — never render $0 as a fact
  const copy = cfCopy(total, cycle.label)
  return {
    id: 'oak-cf',
    headline: copy.headline,
    category: 'milestone',
    severity: 'neutral',
    source: {
      view: viewPath('oakland', 'campaign-finance'),
      label: `Campaign Finance · ${cycle.label}`,
      datasetId: '3xq4-ermg',
    },
    value: copy.value,
    freshness: 'monthly',
    computedAt: new Date(),
    priority: 40,
  }
}

export function useOaklandIndicators({ enabled }: { enabled: boolean }) {
  const [items, setItems] = useState<TickerItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (!enabled || ran.current) return
    ran.current = true
    let cancelled = false
    setIsLoading(true)
    const nowMs = Date.now()
    const nowYear = new Date().getFullYear()
    Promise.allSettled([
      fetchCrime(nowMs, nowYear),
      fetch311(nowMs, nowYear),
      fetchCitations(nowYear),
      fetchCampaignFinance(),
    ]).then((settled) => {
      if (cancelled) return
      const ok = settled
        .filter((s): s is PromiseFulfilledResult<TickerItem | null> => s.status === 'fulfilled')
        .map((s) => s.value)
        .filter((v): v is TickerItem => v !== null)
        .sort((a, b) => b.priority - a.priority)
      setItems(ok)
      setLastUpdated(new Date())
      setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [enabled])

  // items:[] with isLoading:false is HONEST ABSENCE (every stream
  // suppressed/failed) — the landing renders its empty-state note, never
  // the ticker (whose skeleton would spin forever on an empty array).
  return { items, isLoading, lastUpdated }
}
```

- [ ] **Step 2: Typecheck + confirm the fetchDataset options signature**

Run: `npx tsc -b`
If `fetchDataset`'s third argument isn't `{ cityId }`-shaped, read `src/api/client.ts`'s signature and adapt the THREE call forms in this file to the real one (options object vs positional) — the requirement is explicit `cityId: 'oakland'` on every call, not a specific arg position. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useOaklandIndicators.ts
git commit -m "feat(oakland): landing ticker hook — completeness-edge windows, suppress/disclose split"
```

---

### Task 3: The landing — manifest entry, `HomeRouter`, `CityLanding`, route retarget, re-pins

**Files:**
- Modify: `src/cities/oakland/manifest.ts` (home entry + 4 `homeCard`s), `src/cities/oakland/index.ts` (portal.name)
- Create: `src/views/Home/HomeRouter.tsx`, `src/views/Home/CityLanding.tsx`
- Modify: `src/components/ui/CivicTicker.tsx` (optional `heroHeader` prop — default byte-preserves today's render)
- Modify: `src/App.tsx` (import swap, `VIEW_COMPONENTS.home`, catch-all retarget + comment fix)
- Test: `src/components/search/useOmniSearch.test.ts` (re-pins), `src/cities/registry.test.ts` (gains the catch-all liveness pin)

**Interfaces:**
- Consumes: `useOaklandIndicators` (Task 2); `CivicTicker`/`useResponsiveTickerSize`; `VizCard`; `formatApTime`; `liveManifest`; `viewPath`.
- Produces: the `/oakland` route renders `CityLanding`; `HomeRouter` is the `home` component for BOTH cities (Task 4 renames nothing — `Home.tsx`'s default export stays and becomes the SF branch).

- [ ] **Step 1: Manifest — home entry first + homeCards**

In `src/cities/oakland/manifest.ts`, insert as the FIRST array entry:

```ts
  {
    viewId: 'home',
    navLabel: 'Overview',
    navShortLabel: 'OV',
    navDescription: 'Oakland overview & view picker',
    accentColor: '#b85a33', // terracotta-600 — primary brand
    // A landing page consumes nothing date-scoped — without this flag the
    // header picker would be inert while ?start=&end= dirties every shared
    // link (declared delta from SF Home, which consumes dateRange).
    dateless: true,
  },
```

and add `homeCard` to each of the four existing entries (after `accentColor`):

```ts
    homeCard: { title: 'Crime Incidents', subtitle: 'OPD reports across 59 named beats', order: 1 },
```
```ts
    homeCard: { title: '311 Service Requests', subtitle: 'Next-day civic maintenance signals', order: 2 },
```
```ts
    homeCard: { title: 'Parking Citations', subtitle: 'Enforcement patterns, beat by beat', order: 3 },
```
```ts
    homeCard: { title: 'Campaign Finance', subtitle: 'FPPC money in Oakland elections', order: 4 },
```

Also update the file's header comment: replace the sentence `homeCard and underlayPreset are deliberately absent (the Home grid is\n * SF's until stage 4; census: null hides every ACS affordance).` with `homeCard fields drive the /oakland landing grid (stage 4b);\n * underlayPreset stays absent (census: null hides every ACS affordance).`

And in `src/cities/oakland/index.ts`, correct the portal name (spec §B1 config
correction — 'OakData' is an invented brand appearing nowhere on the portal,
whose real title is "City of Oakland Open Data Portal"; it never shipped only
because nothing consumed it):

```ts
  portal: { name: 'Oakland Open Data', host: 'data.oaklandca.gov' },
```

(add `src/cities/oakland/index.ts` to this task's commit)

- [ ] **Step 2: `HomeRouter`**

Create `src/views/Home/HomeRouter.tsx`:

```tsx
import { lazy, Suspense } from 'react'
import { useActiveCity } from '@/cities/useActiveCity'
import SfHome from './Home'

// Lazy: Home is the app's one EAGER view import — a static CityLanding
// import would drag the Oakland indicator/fppc/cycles graph into the entry
// bundle ([[frontpage-load-perf]]).
const CityLanding = lazy(() => import('./CityLanding'))

/** The 'home' view for every city. SF keeps its editorial front page; other
 *  cities get the config-driven landing. In-view city branching is the
 *  dialect pattern — route rows carry key={city.id}, so no instance
 *  survives a cross-city navigation. Both branches keep their hooks
 *  unconditional (the early-return-inside-Home form was rejected: it
 *  either breaks rules-of-hooks or fires SF's preload battery from
 *  /oakland). */
export default function HomeRouter() {
  const city = useActiveCity()
  if (city.id === 'sf') return <SfHome />
  return (
    <Suspense fallback={null}>
      <CityLanding />
    </Suspense>
  )
}
```

- [ ] **Step 3a: `CivicTicker` hero header prop**

In `src/components/ui/CivicTicker.tsx` (plan-verify I2 — the hero header
hardcodes "Live Civic Data" + an `animate-ping` dot, which would sit directly
above a battery whose slowest stream is ~11 weeks stale): add to
`CivicTickerProps`:

```ts
  /** Hero-size header override. Default reproduces today's render exactly
   *  ("Live Civic Data" + pinging dot) — SF byte-identical. A city whose
   *  streams aren't live passes a static label and live: false. */
  heroHeader?: { label: string; live?: boolean }
```

Thread it into `HeroTicker` and, at the header render (~lines 146-155),
use `heroHeader?.label ?? 'Live Civic Data'` for the text and render the
`animate-ping` span only when `heroHeader?.live ?? true` (a static dot span
remains either way). No other ticker size changes.

- [ ] **Step 3b: `CityLanding`**

Create `src/views/Home/CityLanding.tsx`:

```tsx
import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState, type CSSProperties } from 'react'
import { useActiveCity } from '@/cities/useActiveCity'
import { viewPath } from '@/cities/routing'
import { liveManifest } from '@/cities/manifest'
import { useAppStore } from '@/stores/appStore'
import CivicTicker, { useResponsiveTickerSize } from '@/components/ui/CivicTicker'
import { useOaklandIndicators } from '@/hooks/useOaklandIndicators'
import { formatApTime } from '@/utils/format'
import VizCard from '@/components/ui/VizCard'

/**
 * The non-SF city landing (spec §B1) — a lean mini-Home rendered entirely
 * from CityConfig + manifest. Deliberately absent: investigation cards,
 * PulseTeaser, Neighborhood Profiles, AlertsRibbon (SF-scoped backend),
 * the Dana comic row. The status chip never says "Live" and never
 * navigates — this city has no /live, and its freshest stream lags days.
 */
export default function CityLanding() {
  const navigate = useNavigate()
  const city = useActiveCity()
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const [mounted, setMounted] = useState(false)
  const [showTicker, setShowTicker] = useState(false)
  const tickerSize = useResponsiveTickerSize('hero')
  // Deferred like SF's ticker: the hero paints before the 8-query battery.
  const indicators = useOaklandIndicators({ enabled: showTicker })

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
    const t = setTimeout(() => setShowTicker(true), 300)
    return () => clearTimeout(t)
  }, [])

  const heroBg = isDarkMode ? '/dana-dark-hero-bg.png' : '/dana-light-hero-bg.png'

  const cards = liveManifest(city.manifest)
    .filter((e) => e.homeCard)
    .sort((a, b) => a.homeCard!.order - b.homeCard!.order)

  return (
    <div className="min-h-full overflow-y-auto">
      <div className="max-w-[1800px] mx-auto px-[clamp(16px,3vw,64px)] py-8">
        {/* Hero — same brand register as SF's, city-authored deck */}
        <header
          className="glow-host mb-14 relative z-10 overflow-hidden rounded-3xl flex flex-col justify-center"
          style={{ '--glow': '#b85a33', minHeight: 'clamp(0px, 22vw, 440px)' } as CSSProperties}
        >
          <div className="glow-corner" />
          <div
            className="absolute inset-0 bg-cover bg-center opacity-30 dark:opacity-40"
            style={{ backgroundImage: `url(${heroBg})` }}
          />
          <div className="relative px-[clamp(20px,4vw,64px)] py-12">
            <p className="text-label font-mono uppercase tracking-[0.25em] text-terracotta-500 mb-4">
              {city.name} Open Data
            </p>
            <h1
              className="font-display italic text-ink dark:text-white leading-[0.95] tracking-tight mb-5"
              style={{ fontSize: 'clamp(2.25rem, 4vw + 1rem, 5rem)' }}
            >
              <em>Dive</em> beneath
              <br />
              the surface.
            </h1>
            <p className="text-[1.0625rem] leading-relaxed text-slate-600 dark:text-slate-300 max-w-xl mb-6">
              Crime, 311, parking and campaign money across {city.areas.count}{' '}
              {city.areas.nounPlural} — straight from {city.portal.name}, named
              the way Oaklanders know their neighborhoods.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="mailto:jesse@jlabsf.org?subject=%5BDataDiver%5D%20Inquiry"
                className="text-label font-mono text-slate-400/80 dark:text-slate-400/60 whitespace-nowrap text-left
                  hover:text-slate-600 dark:hover:text-slate-300 underline decoration-slate-400/30 underline-offset-2
                  decoration-dotted transition-colors"
              >
                Development and Design By
                <br />
                Assoc. Prof. Jesse Garnier,
                <br />
                SF State Journalism
              </a>
              {/* Status chip — non-navigating, no "Live" claim, no pulse dot.
                  The timestamp is when DataDiver last pulled — each feed
                  publishes on its own (often long) lag; see About. */}
              <span
                className="inline-flex items-center gap-2 desk:ml-5 px-3.5 py-1.5 rounded-full
                  text-micro font-mono uppercase tracking-wider whitespace-nowrap
                  bg-paper-200/70 dark:bg-espresso-800 text-slate-600 dark:text-slate-300"
                title={`When DataDiver last refreshed from ${city.portal.host} — each dataset publishes on its own schedule; parking citations run ~11 weeks behind.`}
              >
                {indicators.lastUpdated
                  ? `Updated ${formatApTime(indicators.lastUpdated.getTime())} · ${city.portal.host}`
                  : city.portal.host}
              </span>
            </div>
          </div>
        </header>

        {/* Ticker — four completeness-edged items, or their HONEST ABSENCE.
            CivicTicker renders a skeleton whenever items is empty (even with
            isLoading false), so a fully-suppressed day gets the note, never a
            forever-skeleton (plan-verify C4). */}
        <div className={`mb-14 transition-opacity duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          {showTicker && !indicators.isLoading && indicators.items.length === 0 ? (
            <p className="text-micro font-mono text-slate-500 dark:text-slate-400 py-4">
              No stream is current enough to quote right now — every figure on
              this page waits for its feed&rsquo;s completeness edge, and parking
              citations alone run ~11 weeks behind. The four views below are live.
            </p>
          ) : (
            <CivicTicker
              items={indicators.items}
              size={tickerSize}
              isLoading={indicators.isLoading || !showTicker}
              lastUpdated={indicators.lastUpdated ?? undefined}
              heroHeader={{ label: 'Civic Data · Oakland', live: false }}
            />
          )}
        </div>

        {/* View cards + the SF doorway */}
        <section className="mb-16">
          <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/80 dark:text-slate-600 mb-4">
            {'──'} Visualizations
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5">
            {cards.map((e, i) => (
              <VizCard
                key={e.viewId}
                title={e.homeCard!.title}
                subtitle={e.homeCard!.subtitle}
                badge={e.navShortLabel}
                accentColor={e.accentColor}
                onClick={() => navigate(viewPath(city.id, e.viewId))}
                delay={i * 60}
                mounted={mounted}
              />
            ))}
            <VizCard
              title="San Francisco"
              subtitle="The full DataDiver — nine datasets, elections, housing & The Last 48"
              badge="SF"
              accentColor="#b85a33"
              onClick={() => navigate('/')}
              delay={cards.length * 60}
              mounted={mounted}
            />
          </div>
        </section>

        {/* Footer — portal credit + the HOVER-FREE beat-name disclosure
            (spec §B5 carry: load-bearing the day this page ships) */}
        <footer className="mt-16 pt-6 border-t border-slate-200/50 dark:border-white/[0.04]">
          <p className="text-micro text-slate-400/60 dark:text-slate-600 font-mono">
            Data sourced from{' '}
            <a
              href={`https://${city.portal.host}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
            >
              {city.portal.host}
            </a>{' '}
            via the Socrata SODA API · beat names are DataDiver&rsquo;s synthesis of
            official City boundaries and community policing names —{' '}
            <Link
              to="/about"
              className="underline underline-offset-2 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
            >
              method in About
            </Link>
          </p>
        </footer>
      </div>
    </div>
  )
}
```

Before writing, open `src/components/ui/VizCard.tsx` and confirm the prop names (`title/subtitle/badge/accentColor/onClick/delay/mounted`) — if `delay`/`mounted` differ (e.g. no `mounted` prop), mirror the EXACT usage from SfHome's desktop Explorations grid (`Home.tsx` ~L515-544) for both the mapped cards and the doorway card.

- [ ] **Step 4: App.tsx wiring**

In `src/App.tsx`:
(a) line 20: `import Home from '@/views/Home/Home'` → `import HomeRouter from '@/views/Home/HomeRouter'`
(b) line 52: `home: Home,` → `home: HomeRouter,`
(c) lines 188-191, replace the stale comment + catch-all:

```tsx
          {/* Unknown /oakland/* slugs land on Oakland's own front door (the
              exact /oakland route above outranks this splat by v6 ranking;
              registry.test.ts pins the home entry live so the splat can
              never self-target a blank). */}
          <Route path="/oakland/*" element={<Navigate to="/oakland" replace />} />
```

- [ ] **Step 5: ⌘K + registry re-pins**

In `src/components/search/useOmniSearch.test.ts`, the oakland test: view rows now `['view-home', 'view-crime-incidents', 'view-311-cases', 'view-parking-citations', 'view-campaign-finance']` (manifest order — home is entry 0); total `69`; everything else unchanged. NOTE the index is module-cached per city — the test file already builds it once; just update the two assertions:

```ts
    expect(byCat('view').map((r) => r.id)).toEqual([
      'view-home', 'view-crime-incidents', 'view-311-cases', 'view-parking-citations', 'view-campaign-finance',
    ])
```
and `expect(oak).toHaveLength(69)`. Also `registry.test.ts:57`-area oakland view-id pin (it asserts the manifest's viewId list): prepend `'home'`. And append the catch-all liveness pin to `registry.test.ts` (unconditional — it lands WITH the manifest entry it pins; add `isViewLive` to the test's registry import):

```ts
describe('the /oakland/* catch-all target stays alive', () => {
  it("isViewLive('oakland','home') — if home ever went dormant the App.tsx splat would self-target a blank", () => {
    expect(isViewLive('oakland', 'home')).toBe(true)
  })
})
```

- [ ] **Step 6: Run + verify**

Run: `npx vitest run src && npx tsc -b`
Expected: all green, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/cities/oakland/manifest.ts src/cities/oakland/index.ts src/views/Home/HomeRouter.tsx src/views/Home/CityLanding.tsx src/components/ui/CivicTicker.tsx src/App.tsx src/components/search/useOmniSearch.test.ts src/cities/registry.test.ts
git commit -m "feat(oakland): the /oakland landing — HomeRouter, CityLanding, manifest home entry, catch-all retarget"
```

---

### Task 4: SfHome — liveManifest hygiene + the Oakland doorway card

**Files:**
- Modify: `src/views/Home/Home.tsx` (homeCards memo ~L28-42; both grids ~L222-245 mobile rail + ~L515-544 desktop)

**Interfaces:**
- Consumes: `liveManifest` from `@/cities/manifest` (new import).

- [ ] **Step 1: liveManifest hygiene**

In the `homeCards` memo (line 30), change `city.manifest` → `liveManifest(city.manifest)` and add the import. (Today a dormant entry with a `homeCard` would render a dead tile; no behavior change for SF where nothing is dormant.)

- [ ] **Step 2: Doorway card in BOTH grids**

The two grids use DIFFERENT idioms (plan-verify I6/M1 — mirror each exactly):

**Desktop Explorations grid** (~L515-544; mapped cards use `delay={600 + idx * 60}`): append after the map, inside the grid container:

```tsx
              <VizCard
                title="Oakland"
                subtitle="Crime, 311, citations & campaign money on 59 named beats"
                badge="OAK"
                accentColor="#b85a33"
                onClick={() => navigate('/oakland')}
                delay={600 + homeCards.length * 60}
                mounted={mounted}
              />
```

**Mobile Explorations rail** (~L222-245; every card sits in a snap wrapper `<div className="w-[13.4375rem] shrink-0 snap-start">` and uses `delay={0}`): append after the map, WRAPPED:

```tsx
              <div className="w-[13.4375rem] shrink-0 snap-start">
                <VizCard
                  title="Oakland"
                  subtitle="Crime, 311, citations & campaign money on 59 named beats"
                  badge="OAK"
                  accentColor="#b85a33"
                  onClick={() => navigate('/oakland')}
                  delay={0}
                  mounted={mounted}
                />
              </div>
```

(In both cases, if the adjacent mapped cards' actual props differ from the above idioms, mirror the adjacent cards — never invent.)

- [ ] **Step 3: Verify + commit**

Run: `npx tsc -b && npx vitest run src/components/search src/cities`
Expected: clean/green (no test pins SfHome's grids).

```bash
git add src/views/Home/Home.tsx
git commit -m "feat(home): Oakland doorway card in both grids + liveManifest homeCards hygiene"
```

---

### Task 5: City switcher + `CityChangeReset` rebuild

**Files:**
- Create: `src/components/layout/CitySwitcher.tsx`
- Modify: `src/components/layout/AppShell.tsx` (brand-row subtitle block, L174-183)
- Modify: `src/App.tsx` (`CityChangeReset`, L99-116)

**Interfaces:**
- Consumes: `crossCityPath`, `CITIES` from `@/cities/registry`; `CITY_SELECTION_FIELDS`/`CitySelectionField` from `@/stores/citySelections`; `useRouteView`.

- [ ] **Step 1: `CitySwitcher`**

Create `src/components/layout/CitySwitcher.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { CITIES, crossCityPath } from '@/cities/registry'
import type { CityId } from '@/cities/routing'

// The registry's own insertion order (sf first) — never a second hand-kept
// list (spec §B3: "the registry's cities"; duplicated-allowlist class).
const CITY_ORDER = Object.keys(CITIES) as CityId[]

/**
 * The brand-row city control (program-spec decision 3): the subtitle line
 * becomes a chevron button opening a compact city menu. Selection
 * NAVIGATES only — the URL is the sole city authority; CityChangeReset
 * (URL-keyed) clears cross-city selections regardless of how navigation
 * was triggered. onNavigate is AppShell's go() so the mobile drawer closes.
 */
export default function CitySwitcher({
  currentCityId,
  currentViewId,
  onNavigate,
}: {
  currentCityId: CityId
  currentViewId: string
  onNavigate: (path: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1 text-micro text-slate-400 dark:text-slate-500 font-mono uppercase
          tracking-widest mt-0.5 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      >
        {CITIES[currentCityId].abbrev} Open Data
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1 2.5 L4 5.5 L7 2.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1.5 z-50 min-w-[10.5rem] rounded-lg overflow-hidden
            bg-white dark:bg-espresso-800 shadow-lg shadow-slate-500/10 dark:shadow-black/40
            ring-1 ring-slate-200/60 dark:ring-white/10 py-1"
        >
          {CITY_ORDER.map((id) => {
            const isCurrent = id === currentCityId
            return (
              <button
                key={id}
                role="menuitemradio"
                aria-checked={isCurrent}
                disabled={isCurrent}
                onClick={() => {
                  setOpen(false)
                  onNavigate(crossCityPath(id, currentViewId))
                }}
                className={`w-full text-left px-3 py-1.5 text-[0.8125rem] flex items-center gap-2 transition-colors ${
                  isCurrent
                    ? 'text-ink dark:text-white cursor-default'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-paper-100 dark:hover:bg-white/[0.04]'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-terracotta-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                {CITIES[id].name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: AppShell wiring**

In `src/components/layout/AppShell.tsx`, replace the subtitle `<span>` (lines 179-181):

```tsx
              <span className="text-micro text-slate-400 dark:text-slate-500 font-mono uppercase tracking-widest mt-0.5">
                {city.abbrev} Open Data
              </span>
```

with:

```tsx
              <CitySwitcher currentCityId={city.id} currentViewId={viewId} onNavigate={go} />
```

Add the import, and derive `viewId`: AppShell already calls `useActiveCity()`; add `const { viewId } = useRouteView()` (import `useRouteView` from `@/cities/useActiveCity`) next to it. The Dana badge keeps its collapse/expand job untouched; the collapsed rail gets no control (the `isSidebarOpen &&` block already scopes this).

- [ ] **Step 3: Rebuild `CityChangeReset`**

In `src/App.tsx`, replace the whole component (lines 99-116):

```tsx
/** Clears cross-city selection state when the URL's city changes. The store
 *  holds no city — the URL is the only authority (see spec §2). The field
 *  list is the pinned CITY_SELECTION_FIELDS contract; the exhaustive Record
 *  makes "added to the list but not wired" a compile error. */
function CityChangeReset() {
  const { cityId } = useRouteView()
  const setSelectedNeighborhood = useAppStore((s) => s.setSelectedNeighborhood)
  const setSelectedCrimeIncident = useAppStore((s) => s.setSelectedCrimeIncident)
  const setSelected311Case = useAppStore((s) => s.setSelected311Case)
  const setSelectedCitation = useAppStore((s) => s.setSelectedCitation)
  const prev = useRef(cityId)
  useEffect(() => {
    if (prev.current !== cityId) {
      const setters: Record<CitySelectionField, (v: null) => void> = {
        selectedNeighborhood: setSelectedNeighborhood,
        selectedCrimeIncident: setSelectedCrimeIncident,
        selected311Case: setSelected311Case,
        selectedCitation: setSelectedCitation,
      }
      for (const field of CITY_SELECTION_FIELDS) setters[field](null)
    }
    prev.current = cityId
  }, [cityId, setSelectedNeighborhood, setSelectedCrimeIncident, setSelected311Case, setSelectedCitation])
  return null
}
```

Add `import { CITY_SELECTION_FIELDS, type CitySelectionField } from '@/stores/citySelections'`.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc -b && npx vitest run src/stores src/cities`
Expected: clean/green.

```bash
git add src/components/layout/CitySwitcher.tsx src/components/layout/AppShell.tsx src/App.tsx
git commit -m "feat(shell): city switcher at the brand row + pinned cross-city selection reset"
```

---

### Task 6: ⌘K city rows

**Files:**
- Modify: `src/components/search/useOmniSearch.ts` (`'city'` category, `buildCityRows`, results-memo append)
- Test: `src/components/search/useOmniSearch.test.ts` (new describe)

- [ ] **Step 1: Write the failing tests**

Append to `useOmniSearch.test.ts`:

```ts
describe('buildCityRows (⌘K city switching)', () => {
  it('one row per OTHER city, same-view path when live there', () => {
    expect(buildCityRows('sf', 'crime-incidents')).toEqual([
      expect.objectContaining({
        id: 'city-oakland',
        category: 'city',
        label: 'Switch to Oakland',
        path: '/oakland/crime-incidents',
      }),
    ])
  })
  it('falls back to the target home when the view is not live there', () => {
    expect(buildCityRows('sf', 'housing')[0].path).toBe('/oakland')
    expect(buildCityRows('oakland', 'campaign-finance')[0]).toMatchObject({
      id: 'city-sf',
      label: 'Switch to San Francisco',
      path: '/campaign-finance',
    })
  })
  it("matches the filter on 'oakland' and on 'switch'", () => {
    const rows = buildCityRows('sf', 'home')
    const q1 = 'oakland', q2 = 'switch'
    for (const q of [q1, q2]) {
      expect(rows.some((r) => r.label.toLowerCase().includes(q) || r.sublabel.toLowerCase().includes(q))).toBe(true)
    }
  })
})
```

(add `buildCityRows` to the import from `./useOmniSearch`)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/search/useOmniSearch.test.ts`
Expected: FAIL — `buildCityRows` not exported.

- [ ] **Step 3: Implement**

In `src/components/search/useOmniSearch.ts`:
(a) union: `export type SearchCategory = 'view' | 'place' | 'dataset' | 'vendor' | 'time' | 'city'`
(b) imports: add `CITIES, crossCityPath` to the `@/cities/registry` import.
(c) new pure export (below `buildSearchIndex` — deliberately OUTSIDE the per-city index cache; the row's target depends on the CURRENT view, which a cached index can't carry):

```ts
/** One "Switch to {city}" row per OTHER city — same-view path when live
 *  there, else that city's home (crossCityPath). Built per-render, never
 *  cached: the target moves with the current view. */
export function buildCityRows(currentCityId: CityId, currentViewId: string): SearchResult[] {
  return (Object.keys(CITIES) as CityId[])
    .filter((id) => id !== currentCityId)
    .map((id) => ({
      id: `city-${id}`,
      category: 'city' as const,
      label: `Switch to ${CITIES[id].name}`,
      sublabel: `${CITIES[id].name} civic data`,
      icon: '🌉',
      path: crossCityPath(id, currentViewId),
    }))
}
```

(d) the hook: `useRouteView()` already returns `viewId` — destructure it (`const { cityId, viewId } = useRouteView()`), and in the results memo change the source array to:

```ts
    return [...buildSearchIndex(cityId), ...buildCityRows(cityId, viewId)]
```

with `[query, cityId, viewId]` as the deps. (`OmniSearch.tsx` needs zero changes — `handleSelect` navigates `result.path`, and the category chip renders the raw string `'city'`.)

- [ ] **Step 4: Run + commit**

Run: `npx vitest run src/components/search/useOmniSearch.test.ts && npx tsc -b`
Expected: green/clean (existing pins untouched — city rows live outside `buildSearchIndex`, so index-length pins hold).

```bash
git add src/components/search/useOmniSearch.ts src/components/search/useOmniSearch.test.ts
git commit -m "feat(search): ⌘K city rows — Switch to Oakland / San Francisco via crossCityPath"
```

---

### Task 7: About — per-portal sources, prose, Oakland findings

**Files:**
- Modify: `src/views/About/About.tsx`

- [ ] **Step 1: Sources restructure**

(a) Rename `SOURCES` → `SF_SOURCES` (and its single render usage). Update
`SourceRow.url`'s doc comment — the FPPC roll-up row is about to use it, so
"Election results are the only one" goes stale:

```ts
  /** Absolute link override (non-portal sources; the Oakland FPPC roll-up). */
  url?: string
```

Add below the SF array:

```ts
const OAKLAND_SOURCES: SourceRow[] = [
  { name: 'Crime Reports (OPD)', id: 'ppgh-7dqv', dateField: 'datetime', note: 'Charge-level rows — every count dedupes by case number; ~3.9% carry no-location beat codes (77X/99X); clamped to 2004+ (earlier rows are a junk trickle)' },
  { name: '311 Service Requests', id: 'quth-gb8e', dateField: 'datetimeinit', note: 'Coordinates from the srx/sry fields — the dataset’s own address point is junk; publishes next-day' },
  { name: 'Parking Citations', id: '58em-y96b', dateField: 'ticket_iss', note: 'Publishes ~11 weeks behind; violation descriptions carry a 10-character truncation era, so codes are grouped instead' },
  { name: 'Police Beats (boundaries)', id: '78s7-673i', note: 'Vendored as the 59-beat spine; the layer names only 2 of its 59 polygons' },
  { name: 'Neighborhoods (boundaries)', id: 'sb4q-6bkc', note: 'The official 131-polygon layer behind DataDiver’s beat labels — see findings' },
  { name: 'Campaign Finance — Sch A contributions', id: '3xq4-ermg', dateField: 'tran_date', note: 'FPPC filings arrive in semiannual lumps — recent months are structurally incomplete until the next deadline' },
  { name: 'Campaign Finance — Sch E expenditures', id: 'bvfu-nq99', dateField: 'expn_date', note: '1,553 rows carry no date ($3.39M) — disclosed in the view' },
  { name: 'Campaign Finance — 496 late IEs', id: 'jkj3-8yq3', dateField: 'exp_date', note: 'Its date field differs from every sibling schedule (exp_date, not expn_date)' },
  { name: 'Campaign Finance — 497 late contributions', id: 'qact-u8hq', dateField: 'ctrib_date' },
  { name: 'FPPC filings — 12 further schedules', id: 'various', note: 'Registered, not yet read. Sch B2 is published empty; the 460 summary is deliberately never summed (its cumulative-ish figures fabricate money)', url: 'https://data.oaklandca.gov/browse?q=FPPC' },
]
```

(b) Extract the table JSX (lines 218-244) into a local component ABOVE the page component:

```tsx
function SourcesTable({ rows, host }: { rows: SourceRow[]; host: string }) {
  return (
    <div className="glass-card rounded-xl overflow-x-auto">
      <table className="w-full text-left min-w-[42.5rem]">
        {/* thead exactly as today (lines 220-227, unchanged classes) */}
        <thead>
          <tr className="border-b-2 border-slate-300/50 dark:border-white/[0.08]">
            <th className="px-4 py-2.5 text-[0.625rem] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-medium">Dataset</th>
            <th className="px-4 py-2.5 text-[0.625rem] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-medium">Source ID</th>
            <th className="px-4 py-2.5 text-[0.625rem] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-medium">Date field</th>
            <th className="px-4 py-2.5 text-[0.625rem] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-medium">Known limitations</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id + s.name} className="border-t border-slate-200/40 dark:border-white/[0.03]">
              <td className="px-4 py-2.5 text-[0.8125rem] text-slate-700 dark:text-slate-200">{s.name}</td>
              <td className="px-4 py-2.5 text-[0.75rem] font-mono text-slate-500 dark:text-slate-400">
                <a href={s.url ?? `https://${host}/d/${s.id}`} target="_blank" rel="noopener noreferrer"
                   className="hover:text-ink dark:hover:text-white underline decoration-slate-400/30 underline-offset-2 transition-colors">
                  {s.id}
                </a>
              </td>
              <td className="px-4 py-2.5 text-[0.75rem] font-mono text-slate-500 dark:text-slate-400">{s.dateField ?? '—'}</td>
              <td className="px-4 py-2.5 text-[0.75rem] text-slate-500 dark:text-slate-400">{s.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

(c) The Data Sources section body becomes two labeled tables:

```tsx
            <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/80 dark:text-slate-600 mb-3 mt-2">
              {'──'} San Francisco · data.sfgov.org
            </p>
            <SourcesTable rows={SF_SOURCES} host="data.sfgov.org" />
            <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/80 dark:text-slate-600 mb-3 mt-8">
              {'──'} Oakland · data.oaklandca.gov
            </p>
            <SourcesTable rows={OAKLAND_SOURCES} host="data.oaklandca.gov" />
```

- [ ] **Step 2: Prose corrections (the three DataSF-only framings)**

(a) Intro paragraph (lines 199-210): replace with:

```tsx
            <p className="mb-5">
              Nearly all data comes from two municipal open-data portals —{' '}
              <a href="https://data.sfgov.org" target="_blank" rel="noopener noreferrer"
                 className="underline decoration-slate-400/50 underline-offset-2 hover:text-ink dark:hover:text-white transition-colors">
                DataSF
              </a>{' '}
              (data.sfgov.org) and the{' '}
              <a href="https://data.oaklandca.gov" target="_blank" rel="noopener noreferrer"
                 className="underline decoration-slate-400/50 underline-offset-2 hover:text-ink dark:hover:text-white transition-colors">
                City of Oakland&rsquo;s open data portal
              </a>{' '}
              (data.oaklandca.gov) — queried live via the Socrata SODA API. Dataset
              identifiers are listed so any figure on this site can be independently
              re-queried. Update frequency varies by dataset and is constrained by each
              publishing agency; no dataset here is truly real-time.
            </p>
```

(b) The elections Finding sentence (line ~421): `Every other dataset on this page lives on DataSF, where anyone can re-query it.` → `Every other dataset on this page lives on a municipal open-data portal, where anyone can re-query it.`

(c) Colophon footer (line ~618): `built with Claude · data from DataSF` → `built with Claude · data from DataSF &amp; Oakland Open Data`

- [ ] **Step 3: Four Oakland findings**

Insert immediately AFTER the closing `</Finding>` of the 4a "Oakland police beats get their names from an overlay, not from OPD" finding:

```tsx
            <Finding title="Oakland crime counts dedupe charge-level rows">
              <p>
                OPD&rsquo;s crime dataset publishes one row per <em>charge</em>, not per
                incident &mdash; more than one row in five belongs to a case with
                multiple rows. Every count DataDiver shows deduplicates by case
                number, on the server where possible and on both sides of any
                comparison (deduplicating only one side would fabricate a decline).
                Published dates run back to 1950, but everything before 2004 is a
                junk trickle, so queries are floored there. About 3.4% of rows carry
                the no-location codes 77X/99X &mdash; they appear as &ldquo;Unmapped
                beat,&rdquo; never silently dropped.
              </p>
            </Finding>

            <Finding title="Oakland 311 coordinates come from the odd fields">
              <p>
                The dataset&rsquo;s own address point is a constant junk location in
                the ocean &mdash; real coordinates live in two state-plane fields
                (srx/sry) that DataDiver converts and bounds-checks. The feed
                publishes next-day, and &ldquo;open&rdquo; is a grammar of four
                status words, not one &mdash; both are handled per Oakland&rsquo;s
                vocabulary rather than San Francisco&rsquo;s.
              </p>
            </Finding>

            <Finding title="Oakland parking citations run about eleven weeks behind">
              <p>
                The citations dataset is complete and fully geocoded &mdash; but its
                newest record is typically ~11 weeks old, so recent windows are
                honestly empty rather than quietly wrong; figures carry
                &ldquo;through&rdquo; dates. Violation descriptions suffered a
                10-character truncation era covering ~2M rows, so DataDiver groups
                the clean violation codes and labels them itself. Beat identity
                arrives as opaque region numbers &mdash; a committed 59-row
                crosswalk translates them.
              </p>
            </Finding>

            <Finding title="Oakland campaign-finance cycles tile the calendar">
              <p>
                Oakland fundraising starts the day after the previous election
                &mdash; a January-1 cycle convention would silently clip real money
                (tens of thousands of dollars in the April 2025 special alone). So
                DataDiver&rsquo;s Oakland cycles tile: each begins where the last
                ended. FPPC filings arrive in semiannual lumps, which means the
                current half-year is structurally unfiled until its deadline passes
                &mdash; totals are shown for concluded cycles, never implied current.
                One schedule&rsquo;s date field differs from every sibling&rsquo;s,
                and 1,553 expenditure rows ($3.39M) carry no date at all &mdash;
                disclosed where they&rsquo;d matter.
              </p>
            </Finding>
```

- [ ] **Step 4: Verify + commit**

Run: `npx tsc -b && npx vitest run src`
Expected: clean/green.

```bash
git add src/views/About/About.tsx
git commit -m "feat(about): per-portal sources tables, two-portal framing, four Oakland findings"
```

---

## Final verification (whole-branch)

1. `~/dev/devman/tools/devman-build.mjs pnpm build` + `npx vitest run src`.
2. Browser gate (vite preview, FOREGROUNDED tab — the hidden-tab ceiling from 4a applies): `/oakland` renders hero/chip ("Updated … · data.oaklandca.gov", no "Live"), ticker items with dated copy (or honest absence), 4 view cards + SF doorway, footer disclosure link → `/about`; switcher both directions incl. fallback (`/housing` → Oakland lands `/oakland`) and the citation-selection reset (open an SF citation, switch, panel closed); ⌘K "switch" rows both cities; `/oakland/junk-slug` → `/oakland`; About sections + findings; SF Home unchanged except the doorway card; date picker absent-of-effect on `/oakland` links (dateless — no `?start=` on shared URLs).
3. Network isolation: zero SF-resolved fetches from `/oakland` (DEV tripwire clean — `usePreloadCache` must never mount there).
4. Ticker sanity vs pinned probe values: CF item reads "$4.0M raised · Apr 2025 cycle" (the live sum under the OAK totals builder's exact WHERE incl. `tran_amt1 > 0` is **$3,993,223.68** / 5,883 rows — NOT the $3.93M no-filter probe figure); crime item's week-ending count within the same order of magnitude as 382; every hero card shows its date IN the headline (the hero renders no `detail`); the hero header reads "Civic Data · Oakland" with a static dot (no ping, no "Live").
5. Declared limitation (ledgered, not built): a citations 30-day window that spans an enforcement-holiday day-hole (e.g. 2026-03-31, absent from GROUP BY entirely) reads low with no per-window disclosure — the dated copy and About's lag finding carry it; today's window is clean.
