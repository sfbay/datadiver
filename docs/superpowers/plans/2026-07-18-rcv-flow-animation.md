# RCV Flow Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the two features approved in `docs/superpowers/specs/2026-07-18-rcv-flow-animation-design.md` — (A) keyboard step-through for the RCV rounds chart, scoped and permanently-pausing autoplay like the existing mouse controls, and (B) a per-round flow-ribbon animation showing where an eliminated candidate's votes went, derived from round-over-round deltas (SF publishes no source→destination transfer data). Finish the earth-tone/Space-Mono palette migration on the two RCV chart files while touching them.

**Architecture:** A new pure module `src/components/charts/rcvFlow.ts` holds the transfer-derivation math and the bezier ribbon-path helper, shared by `RCVRoundChart.tsx` (per-round animated bars, primary surface for both features) and `RCVSankey.tsx` (all-rounds static diagram, only touched for the `linkPath` extraction + palette cleanup). `Elections.tsx` is untouched except nothing — the keyboard handling lives inside `RCVRoundChart` itself (see Task 2's resolved ambiguity) since it already owns all the round/autoplay state; no new props cross that boundary.

**Tech Stack:** Vite + React 18 + TypeScript, hand-rolled SVG (no D3 in either RCV component), Tailwind v4 `@theme` earth-tone tokens (`src/index.css`, `src/styles/tokens.css`), Vitest (`environment: 'node'`, `src/**/*.test.ts` only — no DOM/jsdom, no `@testing-library/react` in this repo).

## Global Constraints

- Branch `feat/rcv-flow-animation` off `main`.
- Earth-tone palette only (no slate hex, no new hues; candidate pigments come from the existing `buildCandidateColorMap`).
- Mono face is "Space Mono" never "JetBrains Mono".
- Calm easing only (no bounce/elastic).
- Reduced-motion branch is mandatory and falls back to the existing static "+N from X" callout.
- Backward steps SNAP (no reverse flow animation).
- Manual stepping calls `setIsPlaying(false)` and autoplay never auto-resumes.
- Batch-elimination guard (`isEliminated` count > 1 → merged bundle + label, never per-source claims).
- Typecheck gate is `npx tsc -b` (stricter than `--noEmit`).
- Full verification build is `~/dev/devman/tools/devman-build.mjs pnpm build`.
- Never run `pnpm dev`.

---

## Test infrastructure verdict (read before Task 1)

`package.json`'s `test` script is `vitest run`; `vitest.config.ts` pins `environment: 'node'` with an explicit comment `// pure functions only — no DOM needed`, and `include: ['src/**/*.test.ts', 'scripts/__tests__/**/*.test.ts']` — `.test.tsx` is not even collected. `@testing-library/react` is not a dependency (`package.json` devDependencies checked in full). There is no `.test.tsx` file anywhere in `src` (`find` confirmed zero). **Component-rendering / interaction tests are not possible without introducing new infrastructure (jsdom + testing-library + a config/include change), which is out of scope for this feature.** This plan follows the design brief's own fallback: pure-logic extraction (`rcvFlow.ts`'s transfer derivation + ribbon path math) gets real Vitest coverage; keyboard stepping, ribbon rendering, reduced-motion rendering, and the batch-bundle label are **manual QA** (checklist in Task 6), not automated tests. This mirrors `src/views/Elections/rcvFiles.test.ts` and `src/utils/naicsSector.test.ts`, both pure-logic, both `node`-environment.

## Resolved ambiguities (read before Task 5)

1. **Tailwind `slate-*` class names need NO migration.** `src/index.css:7-10` states explicitly: "Earth-tone refactor — names preserved so existing Tailwind classes (`text-signal-red`, `bg-paper`, `bg-slate-950`, etc.) continue to compile; only the rendered color shifts." `src/index.css:18-29` shows the entire `--color-slate-50..950` scale remapped to cream/espresso hex, and `src/styles/tokens.css:242-256` documents a further `.dark` override for the 500/600/700 mid-shades specifically so `dark:text-slate-500` etc. read as warm paper tones, not near-invisible espresso. **This means every `slate-*` CLASS occurrence the research brief flagged (`RCVRoundChart.tsx:193,200,400,405`; `Elections.tsx:608,631,635,641,651`) already renders earth-tone and is left untouched by this plan** — changing them would be a pure rename with zero visual effect and needless diff risk. **Only raw hex literals used in SVG `fill`/`stroke` attributes or inline `style` objects bypass this remap** (they're not Tailwind classes, so the `@theme` substitution never applies) — those are the actual cleanup targets, listed exhaustively in Task 5. Consequence: **`Elections.tsx` gets zero palette changes** (every slate reference there is class-based); only `RCVRoundChart.tsx` and `RCVSankey.tsx` are touched in Task 5.
2. **Keyboard scoping mechanism: `tabIndex`+`onKeyDown` on `RCVRoundChart`'s own root `<div>`, not a `window`-level listener gated on `activeRace?.isRCV`.** Reasoning: Mapbox GL JS binds arrow keys to pan the map by default on this same page (`Elections.tsx` mounts a `MapView`/`mapboxgl.Map`); a `window`-level Left/Right listener gated only on "an RCV race is selected" would silently race or double-fire against Mapbox's native keyboard panning whenever the map (not the RCV panel) has focus. Scoping the listener to `RCVRoundChart`'s own subtree via `tabIndex={0}` + `onKeyDown` means arrow keys only step rounds when focus is inside the RCV panel (reached by clicking any of its buttons, or tabbing to it) — this can never collide with the map's keyboard handling, and structurally satisfies "no-op when a text input is focused" (there are no text inputs in `RCVRoundChart`'s subtree; a defensive `tagName` check is added anyway per spec). "The RCV panel is visible" is automatically true whenever this component is mounted at all — `Elections.tsx` only renders `<RCVRoundChart>` when `activeRace?.isRCV && rcvData && rcvViewMode === 'rounds'` (`Elections.tsx:625,659`), so no external gating prop is needed.
3. **A real, pre-existing off-by-one bug in the transfer-source pairing was found and fixed during extraction (Task 1) — documented here because it changes the shared helper's behavior from what's shipping today.** `RCVRoundChart.tsx:104` computes `eliminatedThisRound = round.candidates.find(c => c.isEliminated)` — i.e. it reads the **current** round's own eliminated flag — then attributes the `round` vs `prevRound` vote deltas to that candidate. Verified against the real fixture `public/data/elections/results/20241105/rcv/member-board-of-supervisors-district-3.json`: viewing round 2, `round.candidates` flags **WENDY HA CHAU** eliminated (1,661 votes) — but the actual round 1→round 2 vote deltas (Sauter +254, Lai +120, Jamil +100, Susk +154, Chau +96, exhausted +153 = 877, vs. overvotes +2 = 879 total) sum **exactly** to round 1's flagged eliminee **EDUARD NAVARRO**'s 879 votes, not Wendy's. Wendy is still fully active in round 2 (1,661 votes, merely flagged for *next* removal — she zeroes out only in round 3, confirmed by the same conservation check on round 2→round 3: Sauter+277, Lai+586, Jamil+307, Susk+126 (Susk himself gains despite being *this* round's flagged eliminee — he isn't removed until round 4), exhausted+357, overvotes+8 = 1,661, exactly Wendy's round-2 total). **The correct pairing is `prevRound`'s flagged eliminee(s) explain the `round` vs `prevRound` deltas** — `round`'s own flag describes who's eliminated *starting next round*, not who was *just* redistributed into the round being viewed. The old code additionally skipped any candidate flagged eliminated in the *current* round from the recipient loop (`if (curr.isEliminated) continue`), which undercounts a legitimate gain (that candidate hasn't zeroed out yet). Both are fixed in `computeRoundTransfers` (Task 1). This is not optional cosmetic cleanup: the ribbon feature draws a ribbon from the "eliminated" bar's position, and the *current* code's mislabeled source would draw ribbons from a candidate's bar that is visibly still large and active in the very round being viewed — visually incoherent, and it would falsify the spec's own claim ("delta attribution is exact"). Fixing it is required for the feature to be honest, not scope creep on top of it.

---

### Task 1: Extract + fix shared transfer/ribbon math into `rcvFlow.ts`

**Files:**
- `src/components/charts/rcvFlow.ts` (new)
- `src/components/charts/rcvFlow.test.ts` (new)
- `src/components/charts/RCVSankey.tsx` (refactor `linkPath` to consume the shared helper; no behavior change)

**Interfaces:**
```ts
export const EXHAUSTED_SINK: string // '__exhausted__'

export interface VoteTransfer {
  to: string   // candidate name, or EXHAUSTED_SINK
  amount: number
}

export interface RoundTransferResult {
  eliminatedNames: string[]  // every candidate eliminated ENTERING this round (prevRound's flag)
  isBatch: boolean           // eliminatedNames.length > 1
  transfers: VoteTransfer[]  // sorted descending by amount
}

export function computeRoundTransfers(round: RCVRound, prevRound: RCVRound | null): RoundTransferResult

export interface RibbonPoint { x: number; y: number }
export function ribbonPath(source: RibbonPoint, target: RibbonPoint): string
```

- [ ] **1.1 — Write the failing test first.** Create `src/components/charts/rcvFlow.test.ts`:

```ts
// src/components/charts/rcvFlow.test.ts
//
// Pure-logic coverage for the RCV transfer derivation + ribbon path math
// shared by RCVRoundChart and RCVSankey. Fixture is real data from
// public/data/elections/results/20241105/rcv/member-board-of-supervisors-district-3.json
// (rounds 1 and 2) — see the plan's "Resolved ambiguities" §3 for the
// conservation-of-votes proof that pins the expected numbers below.

import { describe, it, expect } from 'vitest'
import { computeRoundTransfers, ribbonPath, EXHAUSTED_SINK } from './rcvFlow'
import type { RCVRound } from '@/types/elections'

const ROUND_1: RCVRound = {
  round: 1,
  candidates: [
    { name: 'DANNY SAUTER', votes: 11272, percentage: 0.392, transfer: 254, isEliminated: false, isLeader: true },
    { name: 'SHARON LAI', votes: 8489, percentage: 0.2952, transfer: 120, isEliminated: false, isLeader: false },
    { name: 'MOE JAMIL', votes: 3753, percentage: 0.1305, transfer: 100, isEliminated: false, isLeader: false },
    { name: 'MATTHEW SUSK', votes: 2800, percentage: 0.0974, transfer: 154, isEliminated: false, isLeader: false },
    { name: 'WENDY HA CHAU', votes: 1565, percentage: 0.0544, transfer: 96, isEliminated: false, isLeader: false },
    { name: 'EDUARD NAVARRO', votes: 879, percentage: 0.0306, transfer: -879, isEliminated: true, isLeader: false },
  ],
  continuingTotal: 28758,
  exhausted: 0,
  overvotes: 76,
  blanks: 4838,
}

const ROUND_2: RCVRound = {
  round: 2,
  candidates: [
    { name: 'DANNY SAUTER', votes: 11526, percentage: 0.403, transfer: 277, isEliminated: false, isLeader: true },
    { name: 'SHARON LAI', votes: 8609, percentage: 0.301, transfer: 586, isEliminated: false, isLeader: false },
    { name: 'MOE JAMIL', votes: 3853, percentage: 0.1347, transfer: 307, isEliminated: false, isLeader: false },
    { name: 'MATTHEW SUSK', votes: 2954, percentage: 0.1033, transfer: 126, isEliminated: false, isLeader: false },
    { name: 'WENDY HA CHAU', votes: 1661, percentage: 0.0581, transfer: -1661, isEliminated: true, isLeader: false },
    { name: 'EDUARD NAVARRO', votes: 0, percentage: 0, transfer: 0, isEliminated: false, isLeader: false },
  ],
  continuingTotal: 28603,
  exhausted: 153,
  overvotes: 78,
  blanks: 4838,
}

describe('computeRoundTransfers', () => {
  it('round 1 (no prior round): no transfers, no eliminations reported', () => {
    expect(computeRoundTransfers(ROUND_1, null)).toEqual({
      eliminatedNames: [],
      isBatch: false,
      transfers: [],
    })
  })

  it('attributes round 1→2 deltas to EDUARD NAVARRO (round 1\'s flagged eliminee), not WENDY HA CHAU (round 2\'s)', () => {
    const result = computeRoundTransfers(ROUND_2, ROUND_1)
    expect(result.eliminatedNames).toEqual(['EDUARD NAVARRO'])
    expect(result.isBatch).toBe(false)
    // Every candidate's exact round 1→2 gain, INCLUDING Wendy (round 2's
    // own flagged-for-next-elimination candidate — she is not skipped,
    // she hasn't zeroed out yet) and the exhausted-ballot sink.
    expect(result.transfers).toEqual([
      { to: 'DANNY SAUTER', amount: 254 },
      { to: 'MATTHEW SUSK', amount: 154 },
      { to: EXHAUSTED_SINK, amount: 153 },
      { to: 'SHARON LAI', amount: 120 },
      { to: 'MOE JAMIL', amount: 100 },
      { to: 'WENDY HA CHAU', amount: 96 },
    ])
    // Exact accounting: attributed transfers (877) + untracked overvotes
    // growth (+2, not rendered as a sink) == Eduard's round-1 total (879).
    const total = result.transfers.reduce((s, t) => s + t.amount, 0)
    expect(total).toBe(877)
    expect(total + (ROUND_2.overvotes - ROUND_1.overvotes)).toBe(879)
  })

  it('a round whose predecessor eliminated nobody (decisive final round) yields no transfers', () => {
    const noPriorElimination: RCVRound = {
      ...ROUND_1,
      candidates: ROUND_1.candidates.map((c) => ({ ...c, isEliminated: false })),
    }
    const result = computeRoundTransfers(ROUND_2, noPriorElimination)
    expect(result.eliminatedNames).toEqual([])
    expect(result.isBatch).toBe(false)
    expect(result.transfers).toEqual([])
  })

  it('batch-elimination guard: multiple isEliminated candidates in prevRound set isBatch, merge into one eliminatedNames list', () => {
    const batchPrevRound: RCVRound = {
      ...ROUND_1,
      candidates: ROUND_1.candidates.map((c) =>
        c.name === 'MATTHEW SUSK' ? { ...c, isEliminated: true } : c,
      ),
    }
    const result = computeRoundTransfers(ROUND_2, batchPrevRound)
    expect(result.isBatch).toBe(true)
    expect([...result.eliminatedNames].sort()).toEqual(['EDUARD NAVARRO', 'MATTHEW SUSK'].sort())
    // Recipient math is unaffected by which/how-many were eliminated — the
    // guard changes ATTRIBUTION (isBatch, eliminatedNames), never suppresses
    // the (still-honest) per-recipient deltas.
    expect(result.transfers.find((t) => t.to === 'DANNY SAUTER')).toEqual({ to: 'DANNY SAUTER', amount: 254 })
  })

  it('exhausted delta is omitted from transfers when it does not increase', () => {
    const flatExhausted: RCVRound = { ...ROUND_2, exhausted: ROUND_1.exhausted }
    const result = computeRoundTransfers(flatExhausted, ROUND_1)
    expect(result.transfers.find((t) => t.to === EXHAUSTED_SINK)).toBeUndefined()
  })
})

describe('ribbonPath', () => {
  it('matches RCVSankey\'s original linkPath formula: M(x0,y0) C(mx,y0) (mx,y1) (x1,y1), mx=(x0+x1)/2', () => {
    expect(ribbonPath({ x: 10, y: 20 }, { x: 90, y: 60 })).toBe('M10,20 C50,20 50,60 90,60')
  })

  it('is directionally symmetric (swapping source/target mirrors the control points)', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 100, y: 40 }
    expect(ribbonPath(a, b)).toBe('M0,0 C50,0 50,40 100,40')
    expect(ribbonPath(b, a)).toBe('M100,40 C50,40 50,0 0,0')
  })
})
```

- [ ] **1.2 — Run it and confirm it fails** because `./rcvFlow` doesn't exist yet:
  ```
  npx vitest run src/components/charts/rcvFlow.test.ts
  ```
  Expect a module-not-found failure.

- [ ] **1.3 — Implement `src/components/charts/rcvFlow.ts`:**

```ts
// src/components/charts/rcvFlow.ts
//
// Shared vote-transfer derivation + ribbon-path math for the RCV rounds
// chart (RCVRoundChart) and the all-rounds Sankey (RCVSankey). SF publishes
// no source→destination transfer data — every transfer here is DERIVED from
// round-over-round deltas, which is the ceiling of what SF's published
// round-summary report supports (docs/superpowers/specs/
// 2026-07-18-rcv-flow-animation-design.md). Ballot-level (CVR) transfer
// paths are permanently out of scope.
//
// Pairing note (found + fixed during extraction — see the implementation
// plan's "Resolved ambiguities" §3 for the conservation-of-votes proof):
// the candidate(s) whose votes explain `round`'s deltas from `prevRound`
// are the ones PREVROUND flagged `isEliminated` — a round's own flag
// describes who's eliminated STARTING NEXT round, not who was just
// redistributed into the round being viewed.
import type { RCVRound } from '@/types/elections'

/** Sink id for the "votes left the count entirely" bucket, matching
 *  RCVSankey's existing `__exhausted__` node convention. */
export const EXHAUSTED_SINK = '__exhausted__'

export interface VoteTransfer {
  /** Candidate name, or EXHAUSTED_SINK. */
  to: string
  amount: number
}

export interface RoundTransferResult {
  /** Candidate(s) whose votes explain this round's deltas (prevRound's
   *  isEliminated flag). Empty if prevRound eliminated nobody, or there's
   *  no prevRound. */
  eliminatedNames: string[]
  /** True when more than one candidate was eliminated entering this round —
   *  a data shape SF's rules allow (a legitimate batch-elimination
   *  optimization) but that never occurs in the shipped Nov 2024 data.
   *  Callers must render a MERGED bundle + label when true, never claim
   *  per-source precision. */
  isBatch: boolean
  /** Per-recipient transfers derived from round-over-round deltas, sorted
   *  descending by amount. Includes an EXHAUSTED_SINK entry when the
   *  round's exhausted-ballot count increased. A candidate flagged
   *  eliminated in THIS round (i.e. next round's source) is NOT skipped —
   *  they haven't zeroed out yet and can still show a legitimate gain. */
  transfers: VoteTransfer[]
}

/**
 * Derive this round's vote transfers from round-over-round deltas.
 *
 * Single-elimination rounds (100% of Nov 2024 SF RCV data) attribute
 * exactly: each candidate's gain, plus the exhausted-ballot increase, plus
 * untracked overvotes drift, accounts for the eliminated candidate's prior
 * votes. Batch-elimination rounds (never seen in shipped data, but
 * structurally possible — RCVCandidateRound.isEliminated is per-candidate,
 * not a round-level flag) still compute the same per-recipient deltas, but
 * `isBatch: true` tells callers not to claim any single eliminated
 * candidate as the source of a given transfer.
 */
export function computeRoundTransfers(
  round: RCVRound,
  prevRound: RCVRound | null,
): RoundTransferResult {
  if (!prevRound) {
    return { eliminatedNames: [], isBatch: false, transfers: [] }
  }

  const eliminatedEnteringThisRound = prevRound.candidates.filter((c) => c.isEliminated)
  if (eliminatedEnteringThisRound.length === 0) {
    return { eliminatedNames: [], isBatch: false, transfers: [] }
  }
  const isBatch = eliminatedEnteringThisRound.length > 1

  const transfers: VoteTransfer[] = []
  for (const curr of round.candidates) {
    const prev = prevRound.candidates.find((p) => p.name === curr.name)
    if (prev && curr.votes > prev.votes) {
      transfers.push({ to: curr.name, amount: curr.votes - prev.votes })
    }
  }

  const exhaustedDelta = round.exhausted - prevRound.exhausted
  if (exhaustedDelta > 0) {
    transfers.push({ to: EXHAUSTED_SINK, amount: exhaustedDelta })
  }

  transfers.sort((a, b) => b.amount - a.amount)

  return {
    eliminatedNames: eliminatedEnteringThisRound.map((c) => c.name),
    isBatch,
    transfers,
  }
}

export interface RibbonPoint {
  x: number
  y: number
}

/**
 * Cubic-bezier SVG path between two points, horizontally symmetric around
 * their midpoint x. Lifted verbatim from RCVSankey's original `linkPath`
 * (M(x0,y0) C(mx,y0) (mx,y1) (x1,y1), mx=(x0+x1)/2) so the all-rounds
 * Sankey and the per-round flow ribbons share one path implementation.
 */
export function ribbonPath(source: RibbonPoint, target: RibbonPoint): string {
  const mx = (source.x + target.x) / 2
  return `M${source.x},${source.y} C${mx},${source.y} ${mx},${target.y} ${target.x},${target.y}`
}
```

- [ ] **1.4 — Run the test again, confirm it passes:**
  ```
  npx vitest run src/components/charts/rcvFlow.test.ts
  ```

- [ ] **1.5 — Refactor `RCVSankey.tsx` to consume `ribbonPath`** (behavior-preserving — this only changes where the bezier formula lives, not the Sankey's own transfer-proportion math, which stays as-is since it operates on a different multi-round-window problem than the per-round ribbon).

  Old (`RCVSankey.tsx:9-11` imports, `:211-219` the function):
  ```tsx
  import { useMemo, useState } from 'react'
  import type { RCVContest, RCVRound } from '@/types/elections'
  ```
  ```tsx
  // Build SVG path for Sankey links (cubic bezier)
  const linkPath = (link: SankeyLink): string => {
    const x0 = link.source.x + 12
    const y0 = link.source.y + link.source.height / 2
    const x1 = link.target.x
    const y1 = link.target.y + link.target.height / 2
    const mx = (x0 + x1) / 2
    return `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`
  }
  ```

  New:
  ```tsx
  import { useMemo, useState } from 'react'
  import type { RCVContest, RCVRound } from '@/types/elections'
  import { ribbonPath } from './rcvFlow'
  ```
  ```tsx
  // Build SVG path for Sankey links (cubic bezier) — shared with
  // RCVRoundChart's per-round flow ribbons via rcvFlow.ts.
  const linkPath = (link: SankeyLink): string =>
    ribbonPath(
      { x: link.source.x + 12, y: link.source.y + link.source.height / 2 },
      { x: link.target.x, y: link.target.y + link.target.height / 2 },
    )
  ```

- [ ] **1.6 — Verify nothing else in the Sankey changed:** `git diff src/components/charts/RCVSankey.tsx` should show only the import line and the `linkPath` body (no unrelated hunks yet — palette cleanup is Task 5).

- [ ] **1.7 — Commit:**
  ```
  git checkout -b feat/rcv-flow-animation
  git add src/components/charts/rcvFlow.ts src/components/charts/rcvFlow.test.ts src/components/charts/RCVSankey.tsx
  git commit -m "$(cat <<'EOF'
  feat(elections): extract RCV transfer/ribbon math, fix off-by-one elimination-source bug

  RCVRoundChart's voteTransfers attributed each round's deltas to the WRONG
  eliminated candidate (round N's own isEliminated flag describes who's
  eliminated entering round N+1, not who was just redistributed into round
  N) — verified against real district-3 data, deltas sum exactly to the
  PRIOR round's flagged eliminee. Extracted into a shared, tested
  computeRoundTransfers + ribbonPath (rcvFlow.ts) ahead of the flow-ribbon
  animation work, since ribbons sourced from the wrong bar would be
  visually incoherent as well as dishonest.

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GLquB1sVWyVsdgUKwSQqQ3
  EOF
  )"
  ```

---

### Task 2: Keyboard step-through in `RCVRoundChart`

**Files:** `src/components/charts/RCVRoundChart.tsx`

**Interfaces:** No prop/type changes — purely internal. Reuses existing `activeRound`, `setActiveRound`, `setIsPlaying`, `totalRounds` closures.

- [ ] **2.1 — Add the keydown handler to the component's root `<div>`.**

  Old (`RCVRoundChart.tsx:135-136`):
  ```tsx
  return (
    <div style={{ width }}>
  ```

  New:
  ```tsx
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
    e.preventDefault()
    setIsPlaying(false)
    if (e.key === 'ArrowLeft') setActiveRound(Math.max(0, activeRound - 1))
    else setActiveRound(Math.min(totalRounds - 1, activeRound + 1))
  }, [activeRound, totalRounds, setActiveRound])

  return (
    <div
      style={{ width }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded-xl"
    >
  ```

  (`useCallback` is already imported at `RCVRoundChart.tsx:9` — no new import needed.)

- [ ] **2.2 — Typecheck:** `npx tsc -b`. Confirm no new errors (React's `KeyboardEvent<HTMLDivElement>` type is available globally via `@types/react`, no import needed).

- [ ] **2.3 — Manual QA** (no automated interaction tests possible — see "Test infrastructure verdict"): open an RCV race (e.g. `/elections?election=20241105&race=member-board-of-supervisors-district-3`), click a transport button to focus the panel, press Right/Left arrows, confirm the round advances/retreats and any running autoplay stops. Press an arrow while a browser text input elsewhere on the page (e.g. a search box, if present) is focused, confirm no round change happens.

- [ ] **2.4 — Commit:**
  ```
  git add src/components/charts/RCVRoundChart.tsx
  git commit -m "$(cat <<'EOF'
  feat(elections): keyboard arrow step-through for RCV rounds

  Left/Right steps prev/next round, scoped to the RCV panel's own subtree
  via tabIndex+onKeyDown (not a window listener) so it can never collide
  with Mapbox's native arrow-key map panning on the same page. Reuses the
  same setIsPlaying(false)-then-setActiveRound path as the existing mouse
  transport controls — manual stepping pauses autoplay permanently, no
  idle-resume, matching the Last 48 AUTO precedent.

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GLquB1sVWyVsdgUKwSQqQ3
  EOF
  )"
  ```

---

### Task 3: Batch-aware, correctly-paired transfer state in `RCVRoundChart`

This task wires `computeRoundTransfers` in and fixes every downstream consumer of the old buggy `voteTransfers`/`justEliminated` (callout text, transfer glow/badge, eliminated-bucket bar visibility) to the corrected pairing — a prerequisite for Task 4's ribbons to source from the right bar.

**Files:** `src/components/charts/RCVRoundChart.tsx`

**Interfaces:**
```ts
const [justEliminated, setJustEliminated] = useState<{ names: string[]; isBatch: boolean } | null>(null)
const transferResult: RoundTransferResult  // from computeRoundTransfers(round, prevRound)
const candidateTransfers: VoteTransfer[]   // transferResult.transfers minus the EXHAUSTED_SINK entry
```

- [ ] **3.1 — Import the shared helper.**

  Old (`RCVRoundChart.tsx:9-11`):
  ```tsx
  import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
  import type { RCVContest } from '@/types/elections'
  import { toSentenceCase } from '@/utils/format'
  ```

  New:
  ```tsx
  import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
  import type { RCVContest } from '@/types/elections'
  import { toSentenceCase } from '@/utils/format'
  import { computeRoundTransfers, EXHAUSTED_SINK } from './rcvFlow'
  ```

- [ ] **3.2 — Replace the `justEliminated` state shape and its derivation effect.**

  Old (`RCVRoundChart.tsx:32,44-55`):
  ```tsx
  const [justEliminated, setJustEliminated] = useState<string | null>(null)
  ```
  ```tsx
  // Detect which candidate was just eliminated this round
  useEffect(() => {
    if (activeRound === 0) { setJustEliminated(null); return }
    const round = rcvData.rounds[activeRound]
    const eliminated = round.candidates.find((c) => c.isEliminated)
    if (eliminated) {
      setJustEliminated(eliminated.name)
      const timer = setTimeout(() => setJustEliminated(null), 1500)
      return () => clearTimeout(timer)
    } else {
      setJustEliminated(null)
    }
  }, [activeRound, rcvData.rounds])
  ```

  New:
  ```tsx
  const [justEliminated, setJustEliminated] = useState<{ names: string[]; isBatch: boolean } | null>(null)
  ```
  ```tsx
  // Detect whose votes were just redistributed INTO the currently-viewed
  // round. The eliminated flag lives on the PREVIOUS round's entry — a
  // round's own flag describes who's eliminated starting NEXT round, not
  // who was just redistributed to produce this round's totals. See
  // rcvFlow.ts and the implementation plan's "Resolved ambiguities" §3.
  useEffect(() => {
    if (activeRound === 0) { setJustEliminated(null); return }
    const prev = rcvData.rounds[activeRound - 1]
    const eliminated = prev.candidates.filter((c) => c.isEliminated)
    if (eliminated.length > 0) {
      setJustEliminated({ names: eliminated.map((c) => c.name), isBatch: eliminated.length > 1 })
      const timer = setTimeout(() => setJustEliminated(null), 1500)
      return () => clearTimeout(timer)
    } else {
      setJustEliminated(null)
    }
  }, [activeRound, rcvData.rounds])
  ```

- [ ] **3.3 — Replace the `voteTransfers` computation with `computeRoundTransfers`.**

  Old (`RCVRoundChart.tsx:100-119`):
  ```tsx
  // Compute vote transfers: who gained votes this round from the eliminated candidate?
  const voteTransfers = useMemo(() => {
    if (!prevRound || activeRound === 0) return []
    const transfers: { from: string; to: string; amount: number }[] = []
    const eliminatedThisRound = round.candidates.find((c) => c.isEliminated)
    if (!eliminatedThisRound) return transfers

    for (const curr of round.candidates) {
      if (curr.isEliminated) continue
      const prev = prevRound.candidates.find((p) => p.name === curr.name)
      if (prev && curr.votes > prev.votes) {
        transfers.push({
          from: eliminatedThisRound.name,
          to: curr.name,
          amount: curr.votes - prev.votes,
        })
      }
    }
    return transfers.sort((a, b) => b.amount - a.amount)
  }, [round, prevRound, activeRound])
  ```

  New:
  ```tsx
  // Vote transfers for the currently-viewed round, derived from
  // round-over-round deltas (see rcvFlow.ts — SF publishes no
  // source→destination data). Includes an EXHAUSTED_SINK entry for the
  // flow-ribbon layer; candidateTransfers strips it for the text callout
  // and per-bar glow/badge, which only ever named candidates.
  const transferResult = useMemo(
    () => computeRoundTransfers(round, prevRound),
    [round, prevRound],
  )
  const candidateTransfers = useMemo(
    () => transferResult.transfers.filter((t) => t.to !== EXHAUSTED_SINK),
    [transferResult],
  )
  ```

- [ ] **3.4 — Update the eliminated-candidates filter so the just-eliminated bar still renders (at zero width) long enough to anchor a ribbon.**

  Old (`RCVRoundChart.tsx:122`):
  ```tsx
  const eliminatedCandidates = candidates.filter((c) => eliminatedByRound.has(c.name) && c.votes > 0)
  ```

  New:
  ```tsx
  // A candidate eliminated ENTERING this round has already zeroed out
  // (c.votes === 0) by the time this round is displayed — but the ribbon
  // needs a row to anchor its source point to for the ~1.5s justEliminated
  // window. Keep their (zero-width) row visible for exactly that window;
  // every other historically-eliminated candidate still requires votes > 0
  // to avoid permanently rendering empty rows.
  const eliminatedCandidates = candidates.filter(
    (c) => eliminatedByRound.has(c.name) && (c.votes > 0 || (justEliminated?.names.includes(c.name) ?? false)),
  )
  ```

- [ ] **3.5 — Update the elimination callout JSX for the batch-aware shape.**

  Old (`RCVRoundChart.tsx:205-227`):
  ```tsx
      {/* Elimination callout */}
      {justEliminated && (
        <div className="mb-2 px-2 py-1.5 rounded-lg bg-brick-500/10 border border-brick-500/20 animate-pulse">
          <p className="text-[10px] font-mono text-brick-400">
            <span className="font-bold">{toSentenceCase(justEliminated)}</span> eliminated
            {voteTransfers.length > 0 && (
              <span className="text-brick-400/70">
                {' — votes transfer to '}
                {voteTransfers.slice(0, 3).map((t, i) => (
                  <span key={t.to}>
                    {i > 0 && ', '}
                    <span style={{ color: candidateColors.get(t.to) || '#94a3b8' }}>
                      {toSentenceCase(t.to.split(' ').pop() || t.to)}
                    </span>
                    <span className="text-brick-400/50"> (+{t.amount.toLocaleString()})</span>
                  </span>
                ))}
                {voteTransfers.length > 3 && <span className="text-brick-400/50"> + {voteTransfers.length - 3} more</span>}
              </span>
            )}
          </p>
        </div>
      )}
  ```

  New:
  ```tsx
      {/* Elimination callout */}
      {justEliminated && (
        <div className="mb-2 px-2 py-1.5 rounded-lg bg-brick-500/10 border border-brick-500/20 animate-pulse">
          <p className="text-[10px] font-mono text-brick-400">
            <span className="font-bold">
              {justEliminated.isBatch
                ? `${justEliminated.names.length} candidates eliminated together`
                : `${toSentenceCase(justEliminated.names[0])} eliminated`}
            </span>
            {candidateTransfers.length > 0 && (
              <span className="text-brick-400/70">
                {' — votes transfer to '}
                {candidateTransfers.slice(0, 3).map((t, i) => (
                  <span key={t.to}>
                    {i > 0 && ', '}
                    <span style={{ color: candidateColors.get(t.to) || 'var(--color-slate-400)' }}>
                      {toSentenceCase(t.to.split(' ').pop() || t.to)}
                    </span>
                    <span className="text-brick-400/50"> (+{t.amount.toLocaleString()})</span>
                  </span>
                ))}
                {candidateTransfers.length > 3 && <span className="text-brick-400/50"> + {candidateTransfers.length - 3} more</span>}
              </span>
            )}
          </p>
        </div>
      )}
  ```

  (The `'#94a3b8'` fallback swap here is folded in from Task 5's mapping since this whole block is already being rewritten — avoids a second immediately-following edit to the same lines. Task 5 covers every *other* occurrence in the file.)

- [ ] **3.6 — Update the per-bar transfer lookup and just-eliminated check.**

  Old (`RCVRoundChart.tsx:270-271`):
  ```tsx
          // Check if this candidate gained votes from a transfer
          const transfer = voteTransfers.find((t) => t.to === c.name)
          const hasTransferGlow = transfer && justEliminated
  ```

  New:
  ```tsx
          // Check if this candidate gained votes from a transfer
          const transfer = candidateTransfers.find((t) => t.to === c.name)
          const hasTransferGlow = transfer && justEliminated
  ```

  Old (`RCVRoundChart.tsx:366`):
  ```tsx
          const isJust = c.name === justEliminated
  ```

  New:
  ```tsx
          const isJust = justEliminated?.names.includes(c.name) ?? false
  ```

- [ ] **3.7 — Typecheck:** `npx tsc -b`. This should surface any remaining stale `voteTransfers`/string-`justEliminated` references — fix any the above steps missed (there should be none; steps 3.2–3.6 cover every read site found via `grep -n "voteTransfers\|justEliminated" src/components/charts/RCVRoundChart.tsx` against the pre-change file).

- [ ] **3.8 — Manual QA:** step to round 2 of the district-3 race, confirm the callout now reads "Eduard Navarro eliminated — votes transfer to Sauter (+254), Susk (+154), Lai (+120)…" (not "Wendy Ha Chau eliminated" as it did pre-fix). Step through every round of every RCV race (mayor has 14 rounds — the deepest one) and confirm no callout ever names a candidate who is still visibly active with a large bar in the round being viewed.

- [ ] **3.9 — Commit:**
  ```
  git add src/components/charts/RCVRoundChart.tsx
  git commit -m "$(cat <<'EOF'
  fix(elections): RCV callout/glow now attribute transfers to the correct eliminated candidate

  Wires the corrected computeRoundTransfers (Task 1) into RCVRoundChart,
  replacing the old find()-based single-name justEliminated with a
  batch-aware {names, isBatch} shape. Fixes the callout, per-bar glow/badge,
  and eliminated-row visibility to source from the round that actually
  explains the deltas being shown, not the round showing them.

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GLquB1sVWyVsdgUKwSQqQ3
  EOF
  )"
  ```

---

### Task 4: Flow-ribbon animation layer

**Files:** `src/components/charts/RCVRoundChart.tsx`

**Interfaces:**
```ts
const RIBBON_DASH_LENGTH = 1200 // px — see step 4.2 for why this constant, not getTotalLength()
type StepDirection = 'forward' | 'backward' | 'none'
interface BarPos { x: number; y: number; width: number; midY: number }
const barPositions: Map<string, BarPos>  // candidate name (or EXHAUSTED_SINK) → current row position
```

- [ ] **4.1 — Import `usePrefersReducedMotion` and the ribbon path helper.**

  Old (`RCVRoundChart.tsx:9-11`, post-Task-3):
  ```tsx
  import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
  import type { RCVContest } from '@/types/elections'
  import { toSentenceCase } from '@/utils/format'
  import { computeRoundTransfers, EXHAUSTED_SINK } from './rcvFlow'
  ```

  New:
  ```tsx
  import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
  import type { RCVContest } from '@/types/elections'
  import { toSentenceCase } from '@/utils/format'
  import { computeRoundTransfers, ribbonPath, EXHAUSTED_SINK } from './rcvFlow'
  import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
  ```

- [ ] **4.2 — Track step direction (forward animates, backward snaps) and ribbon draw-in state.** Add near the other `useState`/`useRef` declarations (after the `activeRound`/`setActiveRound` block, `RCVRoundChart.tsx:37-41`):

  ```tsx
  const prefersReducedMotion = usePrefersReducedMotion()

  // Backward steps SNAP — no reverse flow animation (votes don't
  // "un-transfer" in RCV; a mirrored animation would teach something
  // false). Track direction so the ribbon layer only renders forward.
  const prevActiveRoundRef = useRef(activeRound)
  const [stepDirection, setStepDirection] = useState<'forward' | 'backward' | 'none'>('none')
  useEffect(() => {
    const prev = prevActiveRoundRef.current
    setStepDirection(activeRound > prev ? 'forward' : activeRound < prev ? 'backward' : 'none')
    prevActiveRoundRef.current = activeRound
  }, [activeRound])

  // Ribbons start fully retracted (dashoffset = full length) then draw in
  // over one rAF so the CSS transition actually fires (setting offset=0 in
  // the same paint as offset=full would collapse to a no-op transition).
  const [ribbonsDrawn, setRibbonsDrawn] = useState(false)
  const showRibbons = !prefersReducedMotion && stepDirection === 'forward' && justEliminated !== null
  useEffect(() => {
    if (!showRibbons) { setRibbonsDrawn(false); return }
    setRibbonsDrawn(false)
    const raf = requestAnimationFrame(() => setRibbonsDrawn(true))
    return () => cancelAnimationFrame(raf)
  }, [showRibbons, activeRound])

  // Longer than any realistic ribbon path in this chart's fixed coordinate
  // space (width defaults to 380-400px; chartWidth is width-180, height
  // bounded by candidate count) — used as strokeDasharray for the
  // draw-in effect without a getTotalLength() DOM measurement pass per
  // path. If a future redesign widens the chart substantially, re-check
  // this bound (a path longer than it would render visibly truncated).
  const RIBBON_DASH_LENGTH = 1200
  ```

- [ ] **4.3 — Compute a name→position lookup for the ribbon layer**, right after `eliminatedCandidates` is derived (`RCVRoundChart.tsx:122`, post-Task-3):

  ```tsx
  // Row positions for the ribbon layer, keyed by candidate name (or
  // EXHAUSTED_SINK). Computed independently of the bar-rendering JSX below
  // (which keeps its own inline y/barW math unchanged) so the ribbon block
  // can look up any candidate's current on-screen row without re-deriving
  // sort/index math or coupling to render order.
  const barPositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number; width: number; midY: number }>()
    activeCandidates.forEach((c, i) => {
      const y = i * (barHeight + gap) + 16
      const w = (c.votes / maxVotes) * chartWidth
      positions.set(c.name, { x: labelWidth, y, width: w, midY: y + barHeight / 2 })
    })
    eliminatedCandidates.forEach((c, i) => {
      const y = activeCount * (barHeight + gap) + dividerSpace + i * (barHeight + gap) + 8
      const w = (c.votes / maxVotes) * chartWidth
      positions.set(c.name, { x: labelWidth, y, width: w, midY: y + barHeight / 2 })
    })
    // Exhausted sink — fixed corner position, doesn't participate in the
    // bar layout at all (there's no "Exhausted" bar, just a small marker).
    positions.set(EXHAUSTED_SINK, { x: width - 14, y: svgHeight - 10, width: 0, midY: svgHeight - 10 })
    return positions
  }, [activeCandidates, eliminatedCandidates, maxVotes, chartWidth, labelWidth, barHeight, gap, activeCount, dividerSpace, width, svgHeight])
  ```

  Note: `barHeight`, `gap`, `labelWidth`, `chartWidth`, `activeCount`, `dividerSpace`, `svgHeight` are all already in scope above this point (`RCVRoundChart.tsx:124-133`) — no new derivations needed, this is a straight readout into a lookup map.

- [ ] **4.4 — Render the ribbon layer inside the `<svg>`**, after the eliminated-candidates `.map()` block and before the closing `</svg>` (`RCVRoundChart.tsx:394`, post-Task-3 line numbers shift slightly but the anchor is "right before `</svg>`"):

  ```tsx
        {/* Flow ribbons — vote redistribution motion. Forward-only (backward
            steps snap to the target round's static state); reduced motion
            skips this entirely, falling back to the existing text callout
            above, which is unconditional. */}
        {showRibbons && transferResult.transfers.length > 0 && (() => {
          const sourcePoints = transferResult.eliminatedNames
            .map((name) => barPositions.get(name))
            .filter((p): p is NonNullable<typeof p> => p != null)
          if (sourcePoints.length === 0) return null
          // Merged-bundle source: a single anchor averaging every
          // eliminated-this-round candidate's row. Degenerates to exactly
          // that one candidate's edge in the (today, universal)
          // single-elimination case — no isBatch branch needed here, only
          // in the label (below).
          const bundleSource = {
            x: sourcePoints[0].x + sourcePoints[0].width,
            y: sourcePoints.reduce((s, p) => s + p.midY, 0) / sourcePoints.length,
          }
          const maxAmount = Math.max(...transferResult.transfers.map((t) => t.amount), 1)
          const sourceColor = candidateColors.get(transferResult.eliminatedNames[0]) || 'var(--color-slate-500)'
          return (
            <g opacity={0.55}>
              {transferResult.transfers.map((t) => {
                const target = barPositions.get(t.to)
                if (!target) return null
                const isExhausted = t.to === EXHAUSTED_SINK
                return (
                  <path
                    key={t.to}
                    d={ribbonPath(bundleSource, { x: target.x, y: target.midY })}
                    fill="none"
                    stroke={isExhausted ? 'var(--color-paper-500)' : sourceColor}
                    strokeWidth={Math.max((t.amount / maxAmount) * 10, 1)}
                    strokeOpacity={isExhausted ? 0.4 : 0.5}
                    strokeDasharray={RIBBON_DASH_LENGTH}
                    strokeDashoffset={ribbonsDrawn ? 0 : RIBBON_DASH_LENGTH}
                    style={{ transition: 'stroke-dashoffset var(--dur-lingering) var(--ease-settle)' }}
                  />
                )
              })}
              {transferResult.transfers.some((t) => t.to === EXHAUSTED_SINK) && (
                <g opacity={ribbonsDrawn ? 1 : 0} style={{ transition: 'opacity 0.3s' }}>
                  <circle cx={width - 14} cy={svgHeight - 10} r={3} fill="var(--color-paper-500)" />
                  <text
                    x={width - 20}
                    y={svgHeight - 16}
                    textAnchor="end"
                    fontSize={7}
                    fill="var(--color-paper-500)"
                    fontFamily="var(--font-mono)"
                  >
                    Exhausted
                  </text>
                </g>
              )}
              {justEliminated?.isBatch && (
                <text
                  x={bundleSource.x + 6}
                  y={bundleSource.y - 6}
                  fontSize={7}
                  fill="var(--color-brick-400)"
                  fontFamily="var(--font-mono)"
                >
                  {justEliminated.names.length} candidates eliminated together
                </text>
              )}
            </g>
          )
        })()}
  ```

- [ ] **4.5 — Sequence the recipient bar's width-grow to trail the ribbon draw-in.** The ribbon draws in over `var(--dur-lingering)` = 800ms (`tokens.css:190`); delaying the bar's own width transition by 500ms means it completes at 1000ms, reading as "ribbon arrives, then the bar grows" rather than both happening at once. Verified against the existing 1500ms autoplay interval — 1000ms total sequence leaves 500ms of margin before the next tick, so **the interval does not need to change** (see step 4.7).

  Old (`RCVRoundChart.tsx:299-308`, active-candidate bar `<rect>`):
  ```tsx
              <rect
                x={labelWidth}
                y={y}
                width={barW}
                height={barHeight}
                rx={3}
                fill={color}
                opacity={isWinner ? 0.95 : 0.75}
                style={{ transition: 'width 0.5s ease-out, opacity 0.3s' }}
              />
  ```

  New:
  ```tsx
              <rect
                x={labelWidth}
                y={y}
                width={barW}
                height={barHeight}
                rx={3}
                fill={color}
                opacity={isWinner ? 0.95 : 0.75}
                style={{
                  transition: hasTransferGlow && showRibbons
                    ? 'width 0.5s ease-out 0.5s, opacity 0.3s'
                    : 'width 0.5s ease-out, opacity 0.3s',
                }}
              />
  ```

- [ ] **4.6 — Typecheck:** `npx tsc -b`.

- [ ] **4.7 — Verify the timing margin by inspection** (no automated test — this is a CSS-timing property, not pure logic): confirm `var(--dur-lingering)` resolves to `800ms` and `var(--ease-settle)` to `cubic-bezier(0.22, 0.8, 0.3, 1)` in `src/styles/tokens.css:183-190` (already read; no change needed there). Ribbon draw (800ms) and delayed bar-grow (500ms delay + 500ms duration = 1000ms) both complete before the existing 1500ms autoplay tick (`RCVRoundChart.tsx:73`, unchanged) — confirmed by inspection, not runtime measurement. Note in the PR description that if either duration is later lengthened, this margin must be re-checked (a comment to this effect is already in step 4.2's `RIBBON_DASH_LENGTH` block — add one more short comment at the `setInterval(…, 1500)` call site).

  Old (`RCVRoundChart.tsx:73`):
  ```tsx
    }, 1500)
  ```

  New:
  ```tsx
    // 1500ms leaves ~500ms margin over the flow-ribbon sequence (800ms
    // draw-in + a 500ms-delayed, 500ms bar-grow = 1000ms total) — re-check
    // this margin if either duration changes.
    }, 1500)
  ```

- [ ] **4.8 — Manual QA:**
  - Step forward through district-3's 5 rounds with autoplay OFF: confirm ribbons draw from the eliminated candidate's (now zero-width) row to each recipient bar, colored in the eliminated candidate's pigment at reduced opacity, with a distinct paper-colored ribbon to the "Exhausted" marker on rounds where `exhausted` grew (rounds 2-5 in this race).
  - Step backward (Left arrow or prev button) from round 3 to round 2: confirm NO ribbon animation plays — the bars snap directly to round 2's static state.
  - Enable "Reduce motion" in OS accessibility settings, reload, step forward: confirm zero ribbon `<path>` elements render (inspect via browser dev tools) and the existing text callout is the only "where did the votes go" signal.
  - Run full autoplay on the Mayor race (14 rounds, the deepest): confirm no ribbon animation is ever visibly cut off by the 1500ms tick advancing mid-draw.
  - Confirm the batch-elimination label branch is UNREACHABLE with real data (no manual QA possible for it — that's exactly what Task 1's `rcvFlow.test.ts` batch test pins instead).

- [ ] **4.9 — Commit:**
  ```
  git add src/components/charts/RCVRoundChart.tsx
  git commit -m "$(cat <<'EOF'
  feat(elections): per-round flow-ribbon animation for RCV vote redistribution

  Bezier ribbons (shared rcvFlow.ribbonPath) draw from the eliminated
  candidate's drained bar to each recipient, stroke-width proportional to
  the transfer amount, in the eliminated candidate's pigment at reduced
  opacity — plus a paper-500 ribbon to an Exhausted sink when the
  exhausted-ballot count grew. Forward-only (backward steps snap, no
  reverse flow — votes don't "un-transfer" in RCV); usePrefersReducedMotion
  skips ribbons entirely, falling back to the existing static callout.
  Batch-elimination guard renders a merged bundle + label rather than
  claiming per-source precision the data can't support (untriggered by
  today's data, pinned by Task 1's test). Recipient bar width-grow is
  delayed 500ms so the sequence reads as "ribbon arrives, then bar grows";
  verified this stays within the existing 1500ms autoplay tick.

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GLquB1sVWyVsdgUKwSQqQ3
  EOF
  )"
  ```

---

### Task 5: Palette/font cleanup — `RCVRoundChart.tsx` + `RCVSankey.tsx`

Per "Resolved ambiguities" §1: **Tailwind `slate-*` class occurrences are NOT touched** (already earth-tone under `@theme`). Only raw hex literals in `fill`/`stroke`/inline-`style` attributes and the `"JetBrains Mono, monospace"` font-family string are replaced — these bypass the `@theme` remap entirely. `Elections.tsx` has zero occurrences of either (its flagged lines are all Tailwind classes) and is not touched by this task.

**Files:** `src/components/charts/RCVRoundChart.tsx`, `src/components/charts/RCVSankey.tsx`

**Mapping used throughout** (each raw hex matched Tailwind's own default palette value exactly, confirmed by exact-value comparison; replaced with the `--color-slate-*`/`--color-paper-*` CSS custom property of the SAME shade number, already registered in `src/index.css`'s `@theme` block and — for 500/600/700 — overridden per-theme in `src/styles/tokens.css`'s `.dark` block, so these substitutions gain automatic light/dark reactivity the raw hexes never had):

| Old raw hex | Tailwind default it matched | New value |
|---|---|---|
| `#e2e8f0` | slate-200 | `var(--color-slate-200)` |
| `#94a3b8` | slate-400 | `var(--color-slate-400)` |
| `#64748b` | slate-500 | `var(--color-slate-500)` |
| `#475569` | slate-600 | `var(--color-slate-600)` |
| `#334155` | slate-700 | `var(--color-slate-700)` |
| `"JetBrains Mono, monospace"` | — | `var(--font-mono)` |

The two Sankey "exhausted" neutral colors (`#475569`, used for the exhausted node fill and the exhausted link color) are mapped to `var(--color-paper-500)` instead of `var(--color-slate-600)`, unifying with the new ribbon layer's exhausted-sink color from Task 4 (both now read "excluded/neutral" the same way — paper-500 is the CLAUDE.md-reserved "excluded" pigment used identically in the compliance dashboard's Legal-notices row).

- [ ] **5.1 — `RCVRoundChart.tsx`.** Three of these twelve sites were already folded into Task 3.5's rewrite (the callout's `'#94a3b8'` fallback) — the remaining nine:

  Old (`RCVRoundChart.tsx:254`, threshold "50%" label):
  ```tsx
              fontFamily="JetBrains Mono, monospace"
  ```
  New: `fontFamily="var(--font-mono)"` — **apply this same one-line swap at all four JetBrains occurrences**: `:254` (50% label), `:317` (transfer amount badge), `:329` (vote count text), `:354` ("ELIMINATED (N)" label).

  Old (`RCVRoundChart.tsx:266`):
  ```tsx
          const color = candidateColors.get(c.name) || '#64748b'
  ```
  New:
  ```tsx
          const color = candidateColors.get(c.name) || 'var(--color-slate-500)'
  ```

  Old (`RCVRoundChart.tsx:279`):
  ```tsx
                fill={isWinner ? '#e2e8f0' : '#94a3b8'}
  ```
  New:
  ```tsx
                fill={isWinner ? 'var(--color-slate-200)' : 'var(--color-slate-400)'}
  ```

  Old (`RCVRoundChart.tsx:327`):
  ```tsx
                fill="#94a3b8"
  ```
  New:
  ```tsx
                fill="var(--color-slate-400)"
  ```

  Old (`RCVRoundChart.tsx:346`):
  ```tsx
              stroke="#334155"
  ```
  New:
  ```tsx
              stroke="var(--color-slate-700)"
  ```

  Old (`RCVRoundChart.tsx:352`):
  ```tsx
              fill="#475569"
  ```
  New:
  ```tsx
              fill="var(--color-slate-600)"
  ```

  Old (`RCVRoundChart.tsx:365`):
  ```tsx
          const color = candidateColors.get(c.name) || '#64748b'
  ```
  New:
  ```tsx
          const color = candidateColors.get(c.name) || 'var(--color-slate-500)'
  ```

  Old (`RCVRoundChart.tsx:375`):
  ```tsx
                fill={isJust ? '#b85545' : '#64748b'}
  ```
  New:
  ```tsx
                fill={isJust ? '#b85545' : 'var(--color-slate-500)'}
  ```
  (`#b85545` is already brick-500, an earth-tone value — left as-is, only the fallback changes.)

  Do NOT touch: `RCVRoundChart.tsx:193,200,400,405` (Tailwind `slate-*` classes — already earth-tone, see "Resolved ambiguities" §1) or `fontFamily="Inter, system-ui, sans-serif"` at `:282,377` (not flagged by the design brief's audit — out of scope, avoid scope creep on an unrequested font swap).

- [ ] **5.2 — `RCVSankey.tsx`.**

  Old (`RCVSankey.tsx:92`):
  ```tsx
          color: candidateColors.get(c.name) || '#64748b',
  ```
  New:
  ```tsx
          color: candidateColors.get(c.name) || 'var(--color-slate-500)',
  ```

  Old (`RCVSankey.tsx:116`, exhausted node color):
  ```tsx
          color: '#475569',
  ```
  New:
  ```tsx
          color: 'var(--color-paper-500)',
  ```

  Old (`RCVSankey.tsx:194`, exhausted link color):
  ```tsx
              color: '#475569',
  ```
  New:
  ```tsx
              color: 'var(--color-paper-500)',
  ```

  Old (`RCVSankey.tsx:270`):
  ```tsx
                  fill={dimmed ? '#334155' : '#94a3b8'}
  ```
  New:
  ```tsx
                  fill={dimmed ? 'var(--color-slate-700)' : 'var(--color-slate-400)'}
  ```

  Old (`RCVSankey.tsx:291`):
  ```tsx
              fill="#64748b"
  ```
  New:
  ```tsx
              fill="var(--color-slate-500)"
  ```

  Old (`RCVSankey.tsx:293`):
  ```tsx
              fontFamily="JetBrains Mono, monospace"
  ```
  New:
  ```tsx
              fontFamily="var(--font-mono)"
  ```

  Old (`RCVSankey.tsx:304`):
  ```tsx
            {candidateColors.get(hoveredCandidate) || '#94a3b8'}
  ```
  New:
  ```tsx
            {candidateColors.get(hoveredCandidate) || 'var(--color-slate-400)'}
  ```

  Do NOT touch: `RCVSankey.tsx:208` (`text-slate-500` Tailwind class — already earth-tone).

- [ ] **5.3 — Grep-verify no raw slate hex or JetBrains Mono remains in either file:**
  ```
  grep -nE '#94a3b8|#64748b|#334155|#475569|#e2e8f0|JetBrains' src/components/charts/RCVRoundChart.tsx src/components/charts/RCVSankey.tsx
  ```
  Expect zero matches.

- [ ] **5.4 — Typecheck + visual spot-check:** `npx tsc -b`; manually load the district-3 RCV panel and the Flow (Sankey) tab in both light and dark mode (toggle via the site's theme control), confirm muted text and dividers still read clearly in both — this is the first time these values are theme-reactive rather than static, so it's worth a deliberate look rather than assuming.

- [ ] **5.5 — Commit:**
  ```
  git add src/components/charts/RCVRoundChart.tsx src/components/charts/RCVSankey.tsx
  git commit -m "$(cat <<'EOF'
  style(elections): finish earth-tone/Space Mono migration on RCV chart files

  Raw slate hex literals in fill/stroke/style attributes and hardcoded
  "JetBrains Mono" bypassed the @theme earth-tone remap that Tailwind slate-*
  CLASSES already get for free (index.css:7-10) — replaced with the matching
  var(--color-slate-N) / var(--font-mono) tokens, which also makes these
  values light/dark reactive for the first time. Tailwind slate-* class
  occurrences (RCVRoundChart, RCVSankey, Elections.tsx RCV panel chrome) are
  left untouched — they already render earth-tone under the hood, changing
  them would be a zero-effect rename. Exhausted-sink neutral colors unified
  to paper-500 across RCVSankey and the new ribbon layer.

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GLquB1sVWyVsdgUKwSQqQ3
  EOF
  )"
  ```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **6.1 — Typecheck the whole project:**
  ```
  npx tsc -b
  ```
  Zero errors. (Stricter than `--noEmit` — catches unused-parameter and Mapbox-assertion issues the incremental `--noEmit` pass misses, per CLAUDE.md.)

- [ ] **6.2 — Full test run:**
  ```
  pnpm test
  ```
  All suites pass, including the new `src/components/charts/rcvFlow.test.ts` and the pre-existing `src/views/Elections/rcvFiles.test.ts` (unaffected by this work, but a good regression check since both touch `public/data/elections/results/`).

- [ ] **6.3 — Full verification build (ground truth, not the incremental `tsc --noEmit` pass):**
  ```
  ~/dev/devman/tools/devman-build.mjs pnpm build
  ```
  Confirm it exits 0 and the DevMan ship-health panel reflects a passing build for this repo.

- [ ] **6.4 — Manual QA checklist** (component-rendering tests aren't possible in this repo's Vitest setup — see "Test infrastructure verdict" — so this checklist is the actual acceptance gate for Features A and B):
  - [ ] Load `/elections?election=20241105&race=member-board-of-supervisors-district-3` (or navigate there via the UI): RCV panel renders, "Rounds" tab active by default.
  - [ ] Step through all 5 rounds forward via the Next button: each elimination's callout names the candidate whose votes actually explain that round's gains (round 2 → "Eduard Navarro eliminated", not Wendy Ha Chau); ribbons draw from the drained eliminated-candidate row to every recipient, correctly colored, with a distinct Exhausted ribbon on rounds 2-5.
  - [ ] Step through the same 5 rounds via Left/Right arrow keys after clicking a transport button to focus the panel: identical behavior to mouse stepping, and any running autoplay stops immediately on the first keypress.
  - [ ] Click Play, let it run to completion on the Mayor race (14 rounds, `?race=mayor`): autoplay never appears to cut a ribbon animation off mid-draw; autoplay stops automatically at the final round and does not auto-resume.
  - [ ] While autoplay is running, press an arrow key or click Prev: autoplay stops and stays stopped (no idle-timer resume) until Play is clicked again.
  - [ ] Step backward (Prev button or Left arrow) from any round with a live ribbon animation in progress: bars snap instantly to the target round's static state, no reverse ribbon plays.
  - [ ] Enable OS-level "Reduce motion", reload the page, step forward through a round with a transfer: zero ribbon `<path>` elements in the DOM (check via browser inspector); the static "+N from X" callout is the only redistribution signal, unchanged from pre-feature behavior.
  - [ ] Switch the site's light/dark toggle while the RCV panel (both Rounds and Flow tabs) is open: muted text, dividers, and the exhausted markers stay legible in both themes (this is new — Task 5 made these values theme-reactive for the first time).
  - [ ] Switch to the "Flow" tab (`RCVSankey`): confirm it renders identically to before this PR (only its `linkPath` implementation and raw-hex fallbacks changed, not its layout/behavior).
  - [ ] Confirm no console errors/warnings appear in any of the above (especially around the `requestAnimationFrame` ribbon-draw-in effect and the `barPositions` `Map` lookups).

- [ ] **6.5 — Push and open a PR** (only if the user asks — per repo convention, do not push/PR without explicit instruction):
  ```
  git push -u origin feat/rcv-flow-animation
  gh pr create --title "RCV step-through arrows + vote-redistribution flow ribbons" --body "$(cat <<'EOF'
  ## Summary
  - Left/Right arrow keys step RCV rounds forward/back, scoped to the panel
    (not a window listener — avoids colliding with Mapbox's native arrow-key
    map panning) and pausing autoplay permanently, same as the existing
    mouse controls.
  - Per-round flow-ribbon animation shows where an eliminated candidate's
    votes went, derived from round-over-round deltas (SF publishes no
    source→destination data) — forward-only, reduced-motion-gated, with a
    defensive (currently unreachable) batch-elimination guard.
  - Fixed a real pre-existing bug found during extraction: the existing
    callout/glow attributed each round's vote gains to the WRONG eliminated
    candidate (off by one round) — verified against real district-3 data.
  - Finished the earth-tone/Space Mono palette migration on both RCV chart
    files (raw hex literals and JetBrains Mono only — Tailwind slate-*
    classes already resolve to earth tones under @theme and were left as-is).

  ## Test plan
  - [ ] `npx tsc -b` clean
  - [ ] `pnpm test` clean, including new `rcvFlow.test.ts`
  - [ ] `~/dev/devman/tools/devman-build.mjs pnpm build` exits 0
  - [ ] Manual QA checklist in the plan's Task 6.4, all items checked

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  https://claude.ai/code/session_01GLquB1sVWyVsdgUKwSQqQ3
  EOF
  )"
  ```
