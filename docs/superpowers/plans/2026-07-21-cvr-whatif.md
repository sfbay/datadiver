# RCV CVR Skin PR 3 — WHAT-IF Lens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strike candidates from an RCV race and re-run the same ballots client-side — the
counterfactual count feeds the existing round chart and replay map choreography, with a
terracotta divergence outline, a hypothetical banner, and full URL grammar (`?strike=`).

**Architecture:** `tabulateWhatIf` is a thin orchestrator over the certified-proven
`tabulate()` kernel (which already accepts `struck` + `tieOrder` — built in PR 1 for this):
a catch-retry loop resolves counterfactual ties via the deterministic disclosed ladder and
records them as `tiesBroken`. The map reuses the REPLAY join branch fed counterfactual
rows — no third join branch; just a `changedLabels` property stamp plus one terracotta line
layer. The panel gains a strike roster + the counterfactual chart on its own transport.

**Tech Stack:** TypeScript, React 18, Mapbox GL v3, Vitest (node), existing PR 1/2 CVR
machinery (`ballots.ts`, `tabulate.ts`, `replay.ts`, `useRcvTransport`, `rcvLens.ts`).

**Spec:** `docs/superpowers/specs/2026-07-21-rcv-cvr-skin-design.md` §3.5 (whatIf.ts),
§4.1 (URL grammar), §4.5 (WHAT-IF), §4.6 (panel), §4.7 item 9 (copy).

## Global Constraints

- Copy VERBATIM from spec §4.7 item 9: banner reads `Hypothetical count — {names} removed.`
  then `Same ballots, rerun without them. The certified result is unchanged.` · button
  `Reset to reality` · outline legend `Outlined precincts end with a different winner than
  the real count.` · tie line `A tie was broken using the real election's elimination order.`
- Divergence emphasis = terracotta OUTLINE `#b85a33`, `line-width: 1.5`, rendered ONLY on
  the counterfactual FINAL round. NEVER hatch (house hatch = "non-comparable/excluded").
- Counterfactual surfaces reuse the CERTIFIED race's `candidateColors` everywhere (chart,
  map, legend, cards, roster). Never re-derive colors from counterfactual standings.
- `changedPrecincts` from the pure layer is UNFILTERED (all 514); the VIEW intersects it
  with painted turnout labels before drawing/counting outlines (probe: 6 of mayor−Lurie's
  356 changed precincts are SOV-withheld and must stay unmarked).
- `src/lib/rcv/tabulate.ts` and `src/lib/rcv/ballots.ts` MUST NOT change — the standing
  reconciliation test proves the exact kernel the browser runs.
- URL grammar: `?strike=NAME` repeatable (`searchParams.getAll('strike')`), values = RAW
  artifact candidate spellings; deleted when leaving whatif (any lens change away from it,
  `exitLensToMode`) and on race/election switch. `?round=` deleted on EVERY lens change,
  written only on settled positions (never autoplay ticks), whatif opens on its FINAL round.
- Min 2 candidates remaining; disabled strike toggles carry
  `title="Leave at least two candidates in the race"`.
- Name contracts: `candidateColors` keys are RAW names — look up BEFORE cleaning.
  Reader-facing surnames = `leaderDisplayName(cleanCandidateName(name))`; banner full names
  = `toSentenceCase(name)`. Never "overvote"/"Condorcet" reader-facing.
- Selection idiom: struck rows = line-through + 0.4 opacity + brick-400 "removed" tag;
  active states = house ochre; indigo stays RCV chrome only. No border-l side bars.
- Verify per task: named Vitest files + `npx tsc -b`. Full
  `~/dev/devman/tools/devman-build.mjs pnpm build` at branch end.

## Probe-pinned facts (controller probe, 2026-07-21, real committed ballots)

Reference implementation + all numbers verified by `scripts/__probe-whatif.ts` (temporary;
deleted in Task 5). Every test pin below is a probe output, not an estimate:

- Identity: `struck: []` reproduces `baseline.contest` exactly for all 10 races.
- **mayor − DANIEL LURIE** → winner `LONDON BREED`, 13 rounds, final round BREED 175,018 /
  FARRELL 140,739, `changedPrecincts.length` 356 (6 of them SOV-withheld),
  `rounds[0].exhausted` 14,736 (Lurie-only ballots exhaust at R1), `tiesBroken` [], ~15ms.
- **mayor − MICHAEL LIN** (R1 = 1 vote) → winner unchanged `DANIEL LURIE`, 13 rounds,
  changed 0.
- **member-board-of-supervisors-district-11 − CHYANNE CHEN** → winner `MICHAEL LAI`,
  5 rounds, changed 25.
- **The only reachable real tie** (105 mayor pair-strikes probed): struck
  `["AHSHA SAFAÍ","DYLAN HIRSCH-SHELL"]` → round 6 tie `["NELSON MEI","SHAHRAM SHARIATI"]`;
  ladder eliminates SHARIATI (rung 1: certified elimination order has Shariati before Mei;
  rung 3 agrees — certified R1 1,613 < 1,791). Winner still LURIE, 12 rounds, changed 0.
  All 55 single strikes across all 10 races: zero ties.
- **Strike-to-two** (mayor, leave LURIE + BREED): 1 round, LURIE 182,364 / BREED 149,113 —
  exactly the inclusive head-to-head counts `computeHeadToHead` pins (cross-confirmation).
- Conservation `continuingTotal + exhausted + overvotes + blanks === totalBallots` holds ∀r
  under strikes; determinism verified by double-run deep-equal.
- Mayor artifact candidate order: `["DANIEL LURIE","LONDON BREED","AARON PESKIN",
  "MARK FARRELL","AHSHA SAFAÍ","ELLEN LEE ZHOU","DYLAN HIRSCH-SHELL","KEITH FREEDMAN",
  "NELSON MEI","SHAHRAM SHARIATI","HENRY FLYNN","PAUL YBARRA ROBERTSON","JON SODERSTROM",
  "MARC ROTH","MICHAEL LIN"]`. D11: `["CHYANNE CHEN","MICHAEL LAI","ERNEST \"EJ\" JONES",
  "OSCAR FLORES","ADLAH CHISTI","JOSE MORALES","ROGER K. MARENCO"]`.

## Adjudications

1. **`meta` gains `precincts: string[]`** (spec §3.5 signature amendment): the spec's own
   `changedPrecincts: string[]` requires labels, and `DecodedBallots` is label-free by
   design. Amended in the spec in the same commit as this plan.
2. **Tie detection via catch-retry, not kernel change**: `tabulate` throws `RCVTieError`
   when `tieOrder` doesn't cover a tie; the loop records `{round, tied}`, appends the
   ladder's pick, and reruns. Each caught tie appends exactly one name (terminates ≤ n);
   reruns are deterministic so earlier resolved ties replay identically, and appended names
   accumulate in chronological tie order — matching `tabulate`'s earliest-in-order-wins
   rule. Ties fully covered by earlier appends cannot under-record: an appended name is
   eliminated at its own tie round, so it can never appear in a later tie.
3. **Whatif quartiles are FIXED from the counterfactual's round 1** over painted precincts
   (same principle as replay §4.3: cutpoints fixed per tabulation — certified R1 cutpoints
   on a shrunken roster would mis-band the counterfactual's own spread).
4. **Zero strikes = certified resting state**: whatif lens with no strikes shows the
   certified rounds on the whatif transport (opens on the FINAL round — "how it ends"),
   paints certified replay choreography, NO banner, NO outline. `tabulateWhatIf` runs only
   when `struck.length > 0`.
5. **Strike sanitizing** (hand-typed URLs): unknown names dropped silently; duplicates
   dropped; capped at `candidates.length - 2` in URL order (min-2 preserved even against a
   hostile query string).
6. **The registry flip (`SHIPPED_LENSES` + 'whatif') lands in the LAST task** so the lens
   button never appears mid-branch wired to a half-built arm.
7. **`?round=` seeding split by lens**: the mount seed for the shared (replay) transport now
   applies only when `?lens=replay`; a separate mount seed feeds the whatif transport when
   `?lens=whatif`. (PR 2's `rcvLens !== null` gate was equivalent when only replay consumed
   rounds.)

---

### Task 1: `whatIf.ts` — counterfactual tabulation + tie ladder + tests

**Files:**
- Modify: `src/lib/rcv/replay.ts` (extract `roundPrecinctStates`, loosen
  `computeReplayRounds` param)
- Create: `src/lib/rcv/whatIf.ts`
- Create: `src/lib/rcv/whatIf.test.ts`

**Interfaces:**
- Consumes: `tabulate`, `RCVTieError`, `TabulationOutput`, `RoundAssignment` from
  `./tabulate`; `DecodedBallots` from `./ballots`; `PrecinctRoundState` from `./replay`.
- Produces (later tasks rely on these EXACT names/types):
  `tabulateWhatIf(ballots: DecodedBallots, meta: WhatIfMeta, struck: readonly number[],
  baseline: TabulationOutput): WhatIfResult` ·
  `WhatIfMeta { raceId; title; candidates: string[]; precincts: string[] }` ·
  `WhatIfResult { contest: RCVContest; assignments: RoundAssignment[]; finalByPrecinct:
  PrecinctRoundState[]; changedPrecincts: string[]; winnerChanged: boolean; tiesBroken:
  { round: number; tied: string[] }[] }` ·
  `ladderPick(tiedIdx, meta, baseline): number` ·
  `roundPrecinctStates(ballots, ra): PrecinctRoundState[]` (from replay.ts) ·
  `computeReplayRounds(ballots, tab: Pick<TabulationOutput, 'assignments'>)`.

- [ ] **Step 1: Refactor replay.ts — extract the single-round helper**

Replace the body of `computeReplayRounds` in `src/lib/rcv/replay.ts` (lines 15–49) with:

```ts
/** Per-precinct tallies/leader for ONE round's assignment snapshot. */
export function roundPrecinctStates(
  ballots: DecodedBallots,
  ra: RoundAssignment,
): PrecinctRoundState[] {
  const states: PrecinctRoundState[] = Array.from({ length: ballots.precinctCount }, () => ({
    tallies: new Int32Array(ballots.candidateCount),
    exhausted: 0, overvoted: 0, blank: 0, leader: -1, leaderShare: 0,
  }))
  for (let g = 0; g < ballots.groupCount.length; g++) {
    const st = states[ballots.groupPrecinct[g]]
    const a = ra.groups[g]
    const c = ballots.groupCount[g]
    if (a >= 0) st.tallies[a] += c
    else if (a === ASSIGN_EXHAUSTED) st.exhausted += c
    else if (a === ASSIGN_OVERVOTED) st.overvoted += c
    else if (a === ASSIGN_BLANK) st.blank += c
  }
  for (const st of states) {
    let max = 0, lead = -1, continuing = 0
    for (let i = 0; i < st.tallies.length; i++) {
      const v = st.tallies[i]
      continuing += v
      if (v > max) { max = v; lead = i }
    }
    st.leader = lead
    st.leaderShare = continuing > 0 && lead >= 0 ? st.tallies[lead] / continuing : 0
  }
  return states
}

/** [roundIdx][precinctIdx]. One pass over groups per round (~5–10ms for
 *  mayor's 14×152k), computed once per race and memoized at the hook layer.
 *  Accepts anything carrying assignments — WhatIfResult qualifies. */
export function computeReplayRounds(
  ballots: DecodedBallots,
  tab: Pick<TabulationOutput, 'assignments'>,
): PrecinctRoundState[][] {
  return tab.assignments.map((ra) => roundPrecinctStates(ballots, ra))
}
```

Update the import line at the top of replay.ts to also bring in `RoundAssignment`:

```ts
import { ASSIGN_BLANK, ASSIGN_EXHAUSTED, ASSIGN_OVERVOTED, type RoundAssignment, type TabulationOutput } from './tabulate'
```

- [ ] **Step 2: Run the existing suites to prove the refactor is behavior-neutral**

Run: `npx vitest run src/lib/rcv/reconciliation.test.ts src/lib/rcv/replay.test.ts 2>/dev/null || npx vitest run src/lib/rcv`
Expected: PASS (all pre-existing tests green; if `replay.test.ts` doesn't exist, the rcv
directory run covers it).

- [ ] **Step 3: Write the failing test file**

Create `src/lib/rcv/whatIf.test.ts`:

```ts
/**
 * WHAT-IF counterfactual tabulation — every real-data pin below is a
 * controller-probe output verified against the committed ballots on
 * 2026-07-21 (probe: scripts/__probe-whatif.ts, since deleted; findings
 * recorded in docs/superpowers/plans/2026-07-21-cvr-whatif.md).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CVRBallotArtifact } from '@/types/elections'
import { decodeBallots } from './ballots'
import { tabulate, type TabulationOutput } from './tabulate'
import { ladderPick, tabulateWhatIf, type WhatIfMeta } from './whatIf'

const base = join(process.cwd(), 'public/data/elections/results/20241105')

function loadRace(raceId: string) {
  const artifact = JSON.parse(readFileSync(join(base, `cvr/${raceId}.json`), 'utf8')) as CVRBallotArtifact
  const ballots = decodeBallots(artifact)
  const meta: WhatIfMeta = {
    raceId, title: artifact.title, candidates: artifact.candidates, precincts: artifact.precincts,
  }
  const baseline = tabulate(ballots, meta)
  return { artifact, ballots, meta, baseline }
}

const mayor = loadRace('mayor')
const d11 = loadRace('member-board-of-supervisors-district-11')
const idx = (meta: WhatIfMeta, name: string) => {
  const i = meta.candidates.indexOf(name)
  if (i < 0) throw new Error(`${name} not found`)
  return i
}
const conserved = (contest: { rounds: { continuingTotal: number; exhausted: number; overvotes: number; blanks: number }[] }, total: number) =>
  contest.rounds.every((r) => r.continuingTotal + r.exhausted + r.overvotes + r.blanks === total)

describe('tabulateWhatIf — identity (struck: [])', () => {
  for (const race of [mayor, d11]) {
    it(`${race.meta.raceId}: reproduces the baseline contest exactly`, () => {
      const w = tabulateWhatIf(race.ballots, race.meta, [], race.baseline)
      expect(w.contest).toEqual(race.baseline.contest)
      expect(w.winnerChanged).toBe(false)
      expect(w.changedPrecincts).toEqual([])
      expect(w.tiesBroken).toEqual([])
    })
  }
})

describe('tabulateWhatIf — mayor without Lurie (probe-pinned)', () => {
  const w = tabulateWhatIf(mayor.ballots, mayor.meta, [idx(mayor.meta, 'DANIEL LURIE')], mayor.baseline)

  it('London Breed wins the counterfactual in 13 rounds', () => {
    expect(w.contest.winner).toBe('LONDON BREED')
    expect(w.winnerChanged).toBe(true)
    expect(w.contest.totalRounds).toBe(13)
  })

  it('final round: Breed 175,018 vs Farrell 140,739', () => {
    const last = w.contest.rounds[12].candidates.filter((c) => c.votes > 0)
    expect(last.map((c) => `${c.name}:${c.votes}`).sort()).toEqual(
      ['LONDON BREED:175018', 'MARK FARRELL:140739'].sort(),
    )
  })

  it('356 precincts end with a different final leader; 6 of them SOV-withheld', () => {
    expect(w.changedPrecincts).toHaveLength(356)
    const withheld = new Set(mayor.artifact.sovSuppressed)
    expect(w.changedPrecincts.filter((p) => withheld.has(p))).toHaveLength(6)
  })

  it('Lurie-only ballots exhaust at round 1 (14,736), not blanks; conservation holds ∀r', () => {
    expect(w.contest.rounds[0].exhausted).toBe(14736)
    expect(w.contest.rounds[0].blanks).toBe(mayor.baseline.contest.rounds[0].blanks)
    expect(conserved(w.contest, mayor.ballots.totalBallots)).toBe(true)
  })

  it('no ties on this strike; deterministic across runs', () => {
    expect(w.tiesBroken).toEqual([])
    const again = tabulateWhatIf(mayor.ballots, mayor.meta, [idx(mayor.meta, 'DANIEL LURIE')], mayor.baseline)
    expect(again.contest).toEqual(w.contest)
    expect(again.changedPrecincts).toEqual(w.changedPrecincts)
  })

  it('finalByPrecinct leaders agree with changedPrecincts derivation', () => {
    expect(w.finalByPrecinct).toHaveLength(mayor.meta.precincts.length)
    const changed = new Set(w.changedPrecincts)
    // Spot-check: a changed precinct's counterfactual leader differs from Lurie's index.
    const luriIdx = idx(mayor.meta, 'DANIEL LURIE')
    for (let p = 0; p < w.finalByPrecinct.length; p++) {
      expect(w.finalByPrecinct[p].leader).not.toBe(luriIdx)
      void changed // membership derivation covered by the count pin above
    }
  })
})

describe('tabulateWhatIf — more real strikes (probe-pinned)', () => {
  it('mayor − Michael Lin (R1 = 1 vote): winner unchanged, zero changed precincts', () => {
    const w = tabulateWhatIf(mayor.ballots, mayor.meta, [idx(mayor.meta, 'MICHAEL LIN')], mayor.baseline)
    expect(w.contest.winner).toBe('DANIEL LURIE')
    expect(w.winnerChanged).toBe(false)
    expect(w.contest.totalRounds).toBe(13)
    expect(w.changedPrecincts).toEqual([])
  })

  it('D11 − Chyanne Chen: Michael Lai wins in 5 rounds, 25 precincts change', () => {
    const w = tabulateWhatIf(d11.ballots, d11.meta, [idx(d11.meta, 'CHYANNE CHEN')], d11.baseline)
    expect(w.contest.winner).toBe('MICHAEL LAI')
    expect(w.winnerChanged).toBe(true)
    expect(w.contest.totalRounds).toBe(5)
    expect(w.changedPrecincts).toHaveLength(25)
    expect(conserved(w.contest, d11.ballots.totalBallots)).toBe(true)
  })

  it('the one reachable real tie: − Safaí − Hirsch-Shell → round-6 Mei/Shariati tie, ladder eliminates Shariati', () => {
    const w = tabulateWhatIf(
      mayor.ballots, mayor.meta,
      [idx(mayor.meta, 'AHSHA SAFAÍ'), idx(mayor.meta, 'DYLAN HIRSCH-SHELL')],
      mayor.baseline,
    )
    expect(w.tiesBroken).toEqual([{ round: 6, tied: ['NELSON MEI', 'SHAHRAM SHARIATI'] }])
    const round6 = w.contest.rounds[5]
    expect(round6.candidates.find((c) => c.isEliminated)?.name).toBe('SHAHRAM SHARIATI')
    expect(w.contest.winner).toBe('DANIEL LURIE')
    expect(w.contest.totalRounds).toBe(12)
    expect(w.changedPrecincts).toEqual([])
  })

  it('strike-to-two reproduces the inclusive head-to-head counts (Lurie 182,364 / Breed 149,113)', () => {
    const keep = new Set([idx(mayor.meta, 'DANIEL LURIE'), idx(mayor.meta, 'LONDON BREED')])
    const struck = mayor.meta.candidates.map((_, i) => i).filter((i) => !keep.has(i))
    const w = tabulateWhatIf(mayor.ballots, mayor.meta, struck, mayor.baseline)
    expect(w.contest.totalRounds).toBe(1)
    expect(w.contest.winner).toBe('DANIEL LURIE')
    const r1 = w.contest.rounds[0].candidates.filter((c) => c.votes > 0)
    expect(r1.map((c) => `${c.name}:${c.votes}`).sort()).toEqual(
      ['DANIEL LURIE:182364', 'LONDON BREED:149113'].sort(),
    )
    expect(conserved(w.contest, mayor.ballots.totalBallots)).toBe(true)
  })
})

describe('ladderPick — every rung, directly', () => {
  // Synthetic baseline: elimination order [C, D]; R1 votes A:10, B:8, C:1, D:2.
  const meta = { candidates: ['A', 'B', 'C', 'D'] }
  const baseline = {
    eliminationOrder: ['C', 'D'],
    contest: {
      rounds: [{
        candidates: [
          { name: 'A', votes: 10 }, { name: 'B', votes: 8 },
          { name: 'C', votes: 1 }, { name: 'D', votes: 2 },
        ],
      }],
    },
  } as unknown as TabulationOutput

  it('rung 1: eliminated earlier in the real election goes first', () => {
    expect(ladderPick([3, 2], meta, baseline)).toBe(2) // C before D in real order
  })
  it('rung 1: a real-election finalist survives a non-finalist', () => {
    expect(ladderPick([0, 3], meta, baseline)).toBe(3) // D eliminated in real life; A never
  })
  it('rung 3: both finalists → fewer certified R1 votes goes first', () => {
    expect(ladderPick([0, 1], meta, baseline)).toBe(1) // B's 8 < A's 10
  })
  it('rung 4: full tie → artifact order', () => {
    const flat = {
      eliminationOrder: [],
      contest: { rounds: [{ candidates: [
        { name: 'A', votes: 5 }, { name: 'B', votes: 5 },
        { name: 'C', votes: 5 }, { name: 'D', votes: 5 },
      ] }] },
    } as unknown as TabulationOutput
    expect(ladderPick([2, 1], meta, flat)).toBe(1)
  })
})

describe('tabulateWhatIf — synthetic all-struck exhaustion', () => {
  // 3 candidates; patterns: [A], [], [B,C]. Strike A → the [A] ballots
  // exhaust at R1 (they HAD valid marks — never blanks).
  const artifact: CVRBallotArtifact = {
    formatVersion: 1, dateCode: 'synth', raceId: 'synth', title: 'SYNTH',
    candidates: ['A', 'B', 'C'], precincts: ['S1'], sovSuppressed: [],
    patterns: [[0], [], [1, 2]],
    groups: [0, 0, 7, 0, 1, 3, 0, 2, 5],
  }
  const ballots = decodeBallots(artifact)
  const meta: WhatIfMeta = { raceId: 'synth', title: 'SYNTH', candidates: artifact.candidates, precincts: artifact.precincts }
  const baseline = tabulate(ballots, meta)

  it('all-struck patterns exhaust at round 1; blanks stay blanks; conservation holds', () => {
    const w = tabulateWhatIf(ballots, meta, [0], baseline)
    expect(w.contest.rounds[0].exhausted).toBe(7)
    expect(w.contest.rounds[0].blanks).toBe(3)
    expect(w.contest.totalRounds).toBe(1) // 2 remain → immediate final
    expect(w.contest.winner).toBe('B')
    expect(conserved(w.contest, 15)).toBe(true)
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/lib/rcv/whatIf.test.ts`
Expected: FAIL — `Cannot find module './whatIf'` (or equivalent).

- [ ] **Step 5: Write `src/lib/rcv/whatIf.ts`**

```ts
// WHAT-IF lens math — strike candidates and re-run the same ballots.
//
// A thin orchestrator over the certified-proven tabulate() kernel: the
// kernel is NEVER modified here (the standing reconciliation test keeps
// proving the exact code this file calls). Counterfactual ties — which the
// certified election never had — are resolved by the deterministic
// disclosed ladder via a catch-retry loop: run, catch RCVTieError, record
// it, append the ladder's pick to tieOrder, rerun. Each caught tie appends
// exactly one name (the loop terminates in ≤ candidateCount iterations);
// reruns are deterministic, so earlier resolved ties replay identically —
// their picks precede later ones in tieOrder, matching tabulate's
// earliest-in-order-wins rule. A tie fully covered by earlier appends
// cannot under-record: an appended name is eliminated at its own tie
// round, so it can never appear in a later tie.
import type { RCVContest } from '../../types/elections'
import type { DecodedBallots } from './ballots'
import { RCVTieError, tabulate, type RoundAssignment, type TabulationOutput } from './tabulate'
import { roundPrecinctStates, type PrecinctRoundState } from './replay'

export interface WhatIfMeta {
  raceId: string
  title: string
  candidates: string[]
  /** Artifact precinct labels, parallel to DecodedBallots precinct indices —
   *  changedPrecincts speaks labels, and DecodedBallots is label-free by
   *  design (spec §3.5 signature amendment, plan adjudication 1). */
  precincts: string[]
}

export interface WhatIfResult {
  contest: RCVContest
  assignments: RoundAssignment[]
  finalByPrecinct: PrecinctRoundState[]
  /** Labels whose FINAL-round leader differs from the certified final round.
   *  UNFILTERED (all 514 incl. sovSuppressed) — the view intersects with its
   *  painted set before drawing outlines (6 of mayor−Lurie's 356 changed
   *  precincts are SOV-withheld and must stay unmarked on the map). */
  changedPrecincts: string[]
  winnerChanged: boolean
  /** Non-empty → the banner's tie-disclosure line renders. */
  tiesBroken: { round: number; tied: string[] }[]
}

/** Deterministic disclosed tie ladder (spec §3.5): the candidate eliminated
 *  earlier in the REAL election goes first — baseline finalists never appear
 *  in eliminationOrder, so they rank Infinity, which also encodes "a
 *  real-election finalist survives a non-finalist"; then fewer certified
 *  round-1 votes; then artifact order. Exported for direct unit testing
 *  (the real Nov 2024 data reaches only rung 1 — probe-verified). */
export function ladderPick(
  tiedIdx: readonly number[],
  meta: Pick<WhatIfMeta, 'candidates'>,
  baseline: TabulationOutput,
): number {
  const elimRank = new Map(baseline.eliminationOrder.map((name, i) => [name, i]))
  const r1Votes = new Map(baseline.contest.rounds[0].candidates.map((c) => [c.name, c.votes]))
  return [...tiedIdx].sort((a, b) => {
    const ea = elimRank.get(meta.candidates[a]) ?? Infinity
    const eb = elimRank.get(meta.candidates[b]) ?? Infinity
    if (ea !== eb) return ea - eb
    const va = r1Votes.get(meta.candidates[a]) ?? 0
    const vb = r1Votes.get(meta.candidates[b]) ?? 0
    if (va !== vb) return va - vb
    return a - b
  })[0]
}

export function tabulateWhatIf(
  ballots: DecodedBallots,
  meta: WhatIfMeta,
  struck: readonly number[],
  baseline: TabulationOutput,
): WhatIfResult {
  const tiesBroken: { round: number; tied: string[] }[] = []
  const tieOrder: string[] = []
  let out: TabulationOutput
  for (;;) {
    try {
      out = tabulate(
        ballots,
        { raceId: meta.raceId, title: meta.title, candidates: meta.candidates },
        { struck, tieOrder },
      )
      break
    } catch (err) {
      if (!(err instanceof RCVTieError)) throw err
      tiesBroken.push({ round: err.round, tied: err.tied })
      const tiedIdx = err.tied.map((name) => meta.candidates.indexOf(name))
      tieOrder.push(meta.candidates[ladderPick(tiedIdx, meta, baseline)])
    }
  }

  const baseFinal = roundPrecinctStates(ballots, baseline.assignments[baseline.assignments.length - 1])
  const finalByPrecinct = roundPrecinctStates(ballots, out.assignments[out.assignments.length - 1])
  const changedPrecincts: string[] = []
  for (let p = 0; p < ballots.precinctCount; p++) {
    if (baseFinal[p].leader !== finalByPrecinct[p].leader) changedPrecincts.push(meta.precincts[p])
  }
  return {
    contest: out.contest,
    assignments: out.assignments,
    finalByPrecinct,
    changedPrecincts,
    winnerChanged: out.contest.winner !== baseline.contest.winner,
    tiesBroken,
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/rcv/whatIf.test.ts src/lib/rcv/reconciliation.test.ts`
Expected: PASS (both files; reconciliation proves the kernel untouched).

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc -b`
Expected: clean.

```bash
git add src/lib/rcv/whatIf.ts src/lib/rcv/whatIf.test.ts src/lib/rcv/replay.ts
git commit -m "feat(elections): tabulateWhatIf — counterfactual RCV with disclosed tie ladder"
```

---

### Task 2: Join stamp + terracotta outline layer

**Files:**
- Modify: `src/views/Elections/map/precinctJoin.ts` (replay option + property stamp)
- Modify: `src/views/Elections/map/PrecinctFillLayer.tsx` (third layer)
- Modify: `src/views/Elections/map/precinctJoin.test.ts` (stamping tests)

**Interfaces:**
- Consumes: existing `BuildPrecinctOptions.replay` shape.
- Produces: `BuildPrecinctOptions['replay']` gains optional
  `changedLabels?: ReadonlySet<string>`; every emitted feature carries a boolean
  `whatifChanged` property; layer id `election-precinct-whatif-outline` (line, filter on
  `whatifChanged`, `#b85a33` @ 1.5px).

- [ ] **Step 1: Write the failing tests**

In `src/views/Elections/map/precinctJoin.test.ts`, inside the existing
`describe('buildPrecinctFeatures — replay lens …')` block, first extend the
`buildWithReplay` helper with an optional 4th parameter:

```ts
  const buildWithReplay = (
    rows: Record<string, ReplayPaintRow>,
    lift = false,
    quartiles: [number, number, number] | null = fixedQuartiles,
    changedLabels?: ReadonlySet<string>,
  ) =>
    buildPrecinctFeatures({
      ...base,
      colorMap,
      bundle: { dateCode: '20241105', era: 'prec_2022', turnout: turnout2024, race: president2024 },
      geometry: geo2022,
      mode: 'results',
      focusCandidate: 'DONALD J. TRUMP / JD VANCE',
      replay: { rows, quartiles, round: 3, totalRounds: 5, lift, changedLabels },
    })
```

Then append these tests to the same describe block:

```ts
  it('stamps whatifChanged=true only for labels in replay.changedLabels', () => {
    const fc = buildWithReplay(fullReplayRows, false, fixedQuartiles, new Set(['1101']))
    expect(fc.features.find((f) => f.properties?.label === '1101')?.properties?.whatifChanged).toBe(true)
    expect(fc.features.find((f) => f.properties?.label === '1102')?.properties?.whatifChanged).toBe(false)
  })

  it('stamps whatifChanged=false everywhere when changedLabels is absent (incl. base modes)', () => {
    const replayFc = buildWithReplay(fullReplayRows)
    expect(replayFc.features.every((f) => f.properties?.whatifChanged === false)).toBe(true)
    const baseFc = buildPrecinctFeatures({
      ...base,
      colorMap,
      bundle: { dateCode: '20241105', era: 'prec_2022', turnout: turnout2024, race: president2024 },
      geometry: geo2022,
      mode: 'results',
      focusCandidate: null,
    })
    expect(baseFc.features.length).toBeGreaterThan(0)
    expect(baseFc.features.every((f) => f.properties?.whatifChanged === false)).toBe(true)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/views/Elections/map/precinctJoin.test.ts`
Expected: FAIL — `whatifChanged` is `undefined`, and/or TS error on `changedLabels`.

- [ ] **Step 3: Implement the join stamp**

In `src/views/Elections/map/precinctJoin.ts`, add to the `replay` option type (after the
`lift: boolean` line):

```ts
    lift: boolean
    /** WHAT-IF divergence outline — labels whose counterfactual FINAL-round
     *  leader differs from the certified one. The caller passes this ONLY
     *  when the transport sits on the counterfactual final round (spec §4.5:
     *  the outline renders there alone) and only pre-filtered to painted
     *  labels. Stamped as `whatifChanged` for the line layer's filter;
     *  undefined → every feature stamps false. */
    changedLabels?: ReadonlySet<string>
```

And in the feature-properties object (the `properties: {` block near the bottom of
`buildPrecinctFeatures`), add one line after `selected`:

```ts
          selected,
          whatifChanged: opts.replay?.changedLabels?.has(label) === true,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/views/Elections/map/precinctJoin.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the outline layer**

In `src/views/Elections/map/PrecinctFillLayer.tsx`, append a third entry to the `layers`
memo array (after the `election-precinct-outline` entry):

```ts
    // WHAT-IF divergence emphasis — terracotta ring on precincts whose
    // counterfactual final leader differs from the certified count. An
    // emphasis OUTLINE, deliberately not the house hatch (hatch means
    // "non-comparable/excluded"; these are the most significant precincts
    // on the map). Filter-driven: draws nothing unless the join stamped
    // whatifChanged=true (only on the counterfactual final round).
    {
      id: 'election-precinct-whatif-outline',
      type: 'line',
      source: 'election-precincts',
      filter: ['==', ['get', 'whatifChanged'], true],
      paint: {
        'line-color': '#b85a33',
        'line-width': 1.5,
        'line-opacity': 0.9 * fade,
      },
    } as mapboxgl.AnyLayer,
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc -b`
Expected: clean.

```bash
git add src/views/Elections/map/precinctJoin.ts src/views/Elections/map/precinctJoin.test.ts src/views/Elections/map/PrecinctFillLayer.tsx
git commit -m "feat(elections): whatifChanged stamp + terracotta divergence outline layer"
```

---

### Task 3: Elections.tsx logic — strikes, model, transport, paint

**Files:**
- Modify: `src/views/Elections/Elections.tsx`

**Interfaces:**
- Consumes: `tabulateWhatIf`, `WhatIfResult` (Task 1); `changedLabels` (Task 2);
  existing `replayModel` (`{ ballots, tab, states }`), `useRcvTransport`,
  `computeReplayRounds`, `replayPaintRows`, `leaderShareQuartiles`, `leaderOf`.
- Produces (Tasks 4–5 rely on these EXACT names): `strikeParams: string[]` ·
  `struckIdx: number[]` (sanitized artifact indices) · `whatIfModel: WhatIfResult | null` ·
  `whatIfChartData: RCVContest | null` · `whatIfTransport: RcvTransport` ·
  `whatIfChangedShown: Set<string>` · `whatIfOnFinalRound: boolean` ·
  `setStrikes(names: string[]): void`.

- [ ] **Step 1: Imports and strike params**

Add to the imports in `src/views/Elections/Elections.tsx`:

```ts
import { computeReplayRounds } from '@/lib/rcv/replay'
import { tabulateWhatIf } from '@/lib/rcv/whatIf'
```

(`replayPaintRows` is already imported from `@/lib/rcv/replay` — merge into one line:
`import { computeReplayRounds, replayPaintRows } from '@/lib/rcv/replay'`.)

Below `const focusedCandidate = searchParams.get('candidate') || null`, add:

```ts
  // ?strike= is repeatable (getAll) — certified names can carry commas, so a
  // joined single param would be ambiguous. Values are RAW artifact
  // candidate spellings. Memo keyed on searchParams identity.
  const strikeParams = useMemo(() => searchParams.getAll('strike'), [searchParams])
```

- [ ] **Step 2: The strikes writer + URL hygiene**

After the `setLens` callback, add:

```ts
  // Rewrites the FULL strike set in one write (toggle callers compute the
  // next set from the current one). Deleting then re-appending keeps the
  // repeatable-param form canonical.
  const setStrikes = useCallback((names: string[]) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('strike')
      for (const n of names) next.append('strike', n)
      return next
    }, { replace: true })
  }, [setSearchParams])
```

Hygiene — `?strike=` is whatif-scoped state (spec §4.1):
- In `setSelectedRace`: after `next.delete('round')`, add `next.delete('strike')`.
- In `setLens`: after `next.delete('round')`, add
  `if (lens !== 'whatif') next.delete('strike')`.
- In `exitLensToMode`: after `next.delete('round')`, add `next.delete('strike')`.
- In the election `<select>`'s `onChange` updater: after `next.delete('round')`, add
  `next.delete('strike')`.

- [ ] **Step 3: Split the `?round=` mount seed by lens (adjudication 7)**

Replace the `initialRoundRef` initializer's gate (currently
`rcvLens !== null && Number.isFinite(parsed) && parsed >= 1`) with:

```ts
      round: rcvLens === 'replay' && Number.isFinite(parsed) && parsed >= 1 ? parsed - 1 : undefined,
```

And add a second mount-once seed next to it for the whatif transport:

```ts
  // Separate mount seed for the WHATIF transport — same ref-initializer
  // pattern. Consumed on the first counterfactual contest; later strike
  // changes open on the (new) final round.
  const whatIfSeedRef = useRef<{ round: number | undefined } | null>(null)
  if (whatIfSeedRef.current === null) {
    const parsed = Number.parseInt(searchParams.get('round') ?? '', 10)
    whatIfSeedRef.current = {
      round: rcvLens === 'whatif' && Number.isFinite(parsed) && parsed >= 1 ? parsed - 1 : undefined,
    }
  }
```

- [ ] **Step 4: Extend the CVR fetch gate**

Change the `useCVRBallots` enabled argument from
`activeLens === 'replay' || activeLens === 'coalition'` to `activeLens !== null`.

- [ ] **Step 5: The what-if model block**

After the `coalitionLegendState` memo, add:

```ts
  // ── WHAT-IF lens data (strike candidates → counterfactual count) ──────
  // Sanitized strike indices: unknown names dropped, duplicates dropped,
  // capped at candidates.length − 2 in URL order — min-2-remaining holds
  // even against a hand-typed query string. Matched via cleanCandidateName
  // (the coalitionFocus precedent).
  const struckIdx = useMemo(() => {
    if (activeLens !== 'whatif' || !cvrArtifact) return []
    const out: number[] = []
    for (const raw of strikeParams) {
      const clean = cleanCandidateName(raw)
      const i = cvrArtifact.candidates.findIndex((c) => cleanCandidateName(c) === clean)
      if (i >= 0 && !out.includes(i)) out.push(i)
      if (out.length >= cvrArtifact.candidates.length - 2) break
    }
    return out
  }, [activeLens, cvrArtifact, strikeParams])

  // The counterfactual count. Zero strikes → null (the resting state shows
  // the certified rounds — adjudication 4); tabulateWhatIf is pure and
  // ~15–30ms for mayor, so a plain memo suffices.
  const whatIfModel = useMemo(() => {
    if (activeLens !== 'whatif' || !replayModel || !cvrArtifact || struckIdx.length === 0) return null
    try {
      return tabulateWhatIf(
        replayModel.ballots,
        { raceId: cvrArtifact.raceId, title: cvrArtifact.title, candidates: cvrArtifact.candidates, precincts: cvrArtifact.precincts },
        struckIdx,
        replayModel.tab,
      )
    } catch (err) {
      console.error('[whatif] tabulation failed', err)
      return null
    }
  }, [activeLens, replayModel, cvrArtifact, struckIdx])

  // The contest the whatif chart/transport run on: counterfactual when
  // strikes exist, certified otherwise (resting state), null off-lens
  // (an inert totalRounds-0 transport).
  const whatIfChartData = activeLens === 'whatif' ? (whatIfModel?.contest ?? rcvData ?? null) : null

  const whatIfTransport = useRcvTransport(whatIfChartData, {
    // Opens on the FINAL round — whatif's question is "how does it end"
    // (replay's is "how it unfolds"). The mount seed wins once, for
    // ?lens=whatif&round=K deep links.
    initialRound: whatIfSeedRef.current.round ?? (whatIfChartData ? whatIfChartData.totalRounds - 1 : undefined),
  })

  useEffect(() => {
    if (whatIfChartData) whatIfSeedRef.current = { round: undefined }
  }, [whatIfChartData])
```

- [ ] **Step 6: Counterfactual paint + outline set**

Continue the block:

```ts
  // Counterfactual per-round precinct states — certified states when no
  // strikes (whatIfModel null), so the resting state still paints.
  const whatIfStates = useMemo(() => {
    if (activeLens !== 'whatif' || !replayModel) return null
    return whatIfModel ? computeReplayRounds(replayModel.ballots, whatIfModel) : replayModel.states
  }, [activeLens, replayModel, whatIfModel])

  const whatIfRows = useMemo(
    () => whatIfStates && cvrArtifact
      ? replayPaintRows(whatIfStates, whatIfTransport.activeRound, cvrArtifact)
      : null,
    [whatIfStates, cvrArtifact, whatIfTransport.activeRound],
  )

  // FIXED from the COUNTERFACTUAL's round 1 over painted precincts
  // (adjudication 3): cutpoints are fixed per tabulation — certified-R1
  // cutpoints on a shrunken roster would mis-band the counterfactual.
  const whatIfQuartiles = useMemo((): [number, number, number] | null => {
    if (!whatIfStates || !cvrArtifact || !turnoutFile) return null
    const round1Rows = replayPaintRows(whatIfStates, 0, cvrArtifact)
    const shares: number[] = []
    for (const [label, row] of Object.entries(turnoutFile.precincts)) {
      if (row.unmapped) continue
      const r = round1Rows[label]
      if (!r || r.total === 0) continue
      const leader = leaderOf(r.votes)
      if (leader) shares.push(leader.share)
    }
    return leaderShareQuartiles(shares)
  }, [whatIfStates, cvrArtifact, turnoutFile])

  // Divergence outline set — changedPrecincts filtered through the SAME
  // painted turnout-label set every quartile memo uses (6 of mayor−Lurie's
  // 356 are SOV-withheld and must stay unmarked).
  const whatIfChangedShown = useMemo(() => {
    const shown = new Set<string>()
    if (!whatIfModel || !turnoutFile) return shown
    for (const label of whatIfModel.changedPrecincts) {
      const row = turnoutFile.precincts[label]
      if (row && !row.unmapped) shown.add(label)
    }
    return shown
  }, [whatIfModel, turnoutFile])

  const whatIfOnFinalRound =
    whatIfChartData !== null && whatIfTransport.activeRound === whatIfChartData.totalRounds - 1

  const whatIfOption = useMemo(
    () =>
      activeLens === 'whatif' && whatIfRows && whatIfChartData
        ? {
            rows: whatIfRows,
            quartiles: whatIfQuartiles,
            round: whatIfTransport.activeRound + 1,
            totalRounds: whatIfChartData.totalRounds,
            lift: whatIfTransport.inTransferWindow,
            // Outline only on the counterfactual FINAL round (spec §4.5).
            changedLabels: whatIfOnFinalRound && whatIfChangedShown.size > 0 ? whatIfChangedShown : undefined,
          }
        : undefined,
    [activeLens, whatIfRows, whatIfChartData, whatIfQuartiles, whatIfTransport.activeRound, whatIfTransport.inTransferWindow, whatIfOnFinalRound, whatIfChangedShown],
  )
```

- [ ] **Step 7: Route the paint + the settled `?round=` writes**

In the JSX, change PrecinctFillLayer's replay prop to route by lens:

```tsx
              replay={activeLens === 'whatif' ? whatIfOption : replayOption}
```

Replace the settled-round effect (the one beginning
`useEffect(() => { if (activeLens === 'replay') {`) so BOTH round-bearing lenses write.
Derive the active round transport above the effect:

```ts
  // Which transport owns ?round= — replay and whatif are the round-bearing
  // lenses (coalition has no clock).
  const roundTransport = activeLens === 'replay' ? rcvTransport : activeLens === 'whatif' ? whatIfTransport : null
  useEffect(() => {
    if (roundTransport) {
      if (roundTransport.isPlaying || roundTransport.totalRounds === 0) return
      const value = String(roundTransport.activeRound + 1)
      if (searchParamsRef.current.get('round') === value) return
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('round', value)
        return next
      }, { replace: true })
      return
    }
    if (!searchParamsRef.current.has('round')) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('round')
      return next
    }, { replace: true })
    // Scalar deps only — the transport OBJECT is a fresh identity every
    // render and would make this run per-render; activeLens covers the
    // null↔transport switch (the original PR 1 effect's dep discipline).
  }, [activeLens, roundTransport?.activeRound, roundTransport?.isPlaying, roundTransport?.totalRounds, setSearchParams])
```

- [ ] **Step 8: Verify and commit**

Run: `npx tsc -b`
Expected: clean. (All new values are consumed: `whatIfOption` by the fill layer,
`setStrikes`/`struckIdx`/`whatIfModel`/`whatIfChangedShown`/`whatIfOnFinalRound` — if tsc
flags any as unused because a later task consumes it, move that declaration to the task
that first uses it rather than underscore-prefixing.)

NOTE: `setStrikes` has no JSX consumer until Tasks 4–5 — if `noUnusedLocals` rejects it,
defer its addition (Step 2's callback only) to Task 4 and note that in your report.

Run: `npx vitest run src/views/Elections src/lib/rcv`
Expected: PASS.

```bash
git add src/views/Elections/Elections.tsx
git commit -m "feat(elections): what-if wiring — strikes param, counterfactual model, transport, paint routing"
```

---

### Task 4: Banner, stat-card overrides, legend outline row

**Files:**
- Modify: `src/views/Elections/Elections.tsx` (banner JSX, cards memo, legend state)
- Modify: `src/views/Elections/map/PrecinctLegend.tsx` (outline row + hypothetical eyebrow)

**Interfaces:**
- Consumes: `whatIfModel`, `whatIfChartData`, `whatIfTransport`, `whatIfChangedShown`,
  `whatIfOnFinalRound`, `struckIdx`, `setStrikes` (Task 3); `PrecinctLegendReplayState`.
- Produces: `PrecinctLegendReplayState` gains `outlineCount?: number` and
  `hypothetical?: boolean`.

- [ ] **Step 1: Extend PrecinctLegendReplayState + rendering**

In `src/views/Elections/map/PrecinctLegend.tsx`, add to `PrecinctLegendReplayState`:

```ts
  withheldCount: number
  /** WHAT-IF: painted precincts whose counterfactual final leader differs
   *  from the certified count — 0 (or absent) hides the outline row. */
  outlineCount?: number
  /** WHAT-IF variant — prefixes the eyebrow so the round readout can't be
   *  mistaken for the certified replay. */
  hypothetical?: boolean
```

Change the replay-variant eyebrow line to:

```tsx
        <p className="text-nano font-mono tracking-widest text-paper-600 dark:text-paper-500 mb-1">
          ── {replayState.hypothetical ? 'HYPOTHETICAL — ' : ''}ROUND {replayState.round} OF {replayState.totalRounds}
        </p>
```

And after the drain row (`{replayState.drainPct > 2 && (…)}` block), add:

```tsx
        {(replayState.outlineCount ?? 0) > 0 && (
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ border: '1.5px solid #b85a33' }}
            />
            <span className="text-micro text-slate-400">
              Outlined precincts end with a different winner than the real count.
            </span>
          </div>
        )}
```

- [ ] **Step 2: Legend state for whatif in Elections.tsx**

Rework the `replayLegendState` memo so it serves both round-bearing lenses. Replace the
memo with:

```ts
  // Legend disclosure state for BOTH round-bearing lenses. Replay reads the
  // committed certified rounds; whatif reads the counterfactual contest
  // (same certified colors — the pin) and adds the outline count + the
  // hypothetical eyebrow flag.
  const replayLegendState = useMemo(() => {
    const contest = activeLens === 'replay' ? (rcvData ?? null) : activeLens === 'whatif' ? whatIfChartData : null
    const transport = activeLens === 'replay' ? rcvTransport : whatIfTransport
    if (!contest) return undefined
    const round = contest.rounds[transport.activeRound]
    const round1 = contest.rounds[0]
    if (!round || !round1) return undefined
    const continuingAll = round.candidates.filter((c) => c.votes > 0)
    const continuing = [...continuingAll]
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 5)
      .map((c) => ({ name: c.name, votes: c.votes, pct: c.percentage }))
    const drainPct = round1.continuingTotal > 0
      ? ((round.exhausted + round.overvotes - round1.overvotes) / round1.continuingTotal) * 100
      : 0
    return {
      round: transport.activeRound + 1,
      totalRounds: contest.rounds.length,
      continuing,
      continuingCount: continuingAll.length,
      drainPct,
      withheldCount: cvrArtifact?.sovSuppressed.length ?? 0,
      outlineCount: activeLens === 'whatif' && whatIfOnFinalRound ? whatIfChangedShown.size : 0,
      hypothetical: activeLens === 'whatif' && whatIfModel !== null,
    }
  }, [activeLens, rcvData, whatIfChartData, rcvTransport, whatIfTransport, cvrArtifact, whatIfOnFinalRound, whatIfChangedShown, whatIfModel])
```

And change the legend's prop gate from
`replayState={activeLens === 'replay' ? replayLegendState : undefined}` to:

```tsx
                replayState={activeLens === 'replay' || activeLens === 'whatif' ? replayLegendState : undefined}
```

NOTE (drain semantics): for the counterfactual, `drainPct` reads the counterfactual
contest's own buckets — internally consistent with the counterfactual map paint.

- [ ] **Step 3: The hypothetical banner**

In Elections.tsx, right after the Time Machine banner block (`{timeMachineActive && (…)}`),
add. Note the struck-name display derivation goes just above the `return` (or with the
other memos):

```ts
  // Banner copy: struck candidates as reader-facing full names —
  // "Daniel Lurie", "Daniel Lurie and London Breed", "A, B and C".
  const struckDisplay = useMemo(() => {
    if (!cvrArtifact || struckIdx.length === 0) return ''
    const names = struckIdx.map((i) => toSentenceCase(cvrArtifact.candidates[i]))
    if (names.length === 1) return names[0]
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  }, [cvrArtifact, struckIdx])
```

```tsx
      {/* What-if banner — terracotta (ochre stays Time Machine's signature;
          brick would read as an error). Persistent while strikes exist. */}
      {activeLens === 'whatif' && whatIfModel && struckDisplay && (
        <div className="flex-shrink-0 px-6 py-1.5 bg-terracotta-500/10 border-b border-terracotta-500/20 flex items-center gap-2 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-terracotta-500" />
          <p className="text-micro font-mono text-terracotta-600 dark:text-terracotta-400">
            HYPOTHETICAL COUNT — {struckDisplay} removed
          </p>
          <span className="text-micro text-slate-500 dark:text-slate-400">
            Same ballots, rerun without them. The certified result is unchanged.
          </span>
          {whatIfModel.tiesBroken.length > 0 && (
            <span className="text-micro text-slate-500 dark:text-slate-400 italic">
              A tie was broken using the real election&rsquo;s elimination order.
            </span>
          )}
          <button
            onClick={() => setStrikes([])}
            className="ml-auto px-2.5 py-0.5 rounded-full text-micro font-mono bg-terracotta-500/15 text-terracotta-600 dark:text-terracotta-400 hover:bg-terracotta-500/25 transition-colors"
          >
            Reset to reality
          </button>
        </div>
      )}
```

(If Task 3 deferred `setStrikes` per its Step 8 note, add the callback here exactly as
specified there.)

- [ ] **Step 4: Stat-card overrides**

In the `cardDefs` memo, immediately after the `rcv-rounds` push block
(`if (!timeMachineActive && displayRace.isRCV && rcvData) { cards.push({ id: 'rcv-rounds' …`),
add:

```ts
    // WHAT-IF overrides — Winner speaks the counterfactual (certified
    // pigment: candidateColors is rank-assigned from certified standings and
    // deliberately NOT re-derived); Rounds discloses the certified count.
    // Turnout/Registered stay certified (spec §4.5).
    if (activeLens === 'whatif' && whatIfModel && rcvData) {
      const cfWinnerRow = whatIfModel.contest.rounds[whatIfModel.contest.totalRounds - 1]
        .candidates.find((c) => c.name === whatIfModel.contest.winner)
      cards[0] = {
        ...cards[0],
        label: 'Hypothetical winner',
        value: leaderDisplayName(whatIfModel.contest.winner),
        color: candidateColors.get(whatIfModel.contest.winner) || ACCENT,
        subtitle: cfWinnerRow
          ? `${(cfWinnerRow.percentage * 100).toFixed(1)}% · certified: ${leaderDisplayName(rcvData.winner)}`
          : `certified: ${leaderDisplayName(rcvData.winner)}`,
      }
      const roundsCard = cards.find((c) => c.id === 'rcv-rounds')
      if (roundsCard) {
        roundsCard.value = String(whatIfModel.contest.totalRounds)
        roundsCard.subtitle = `certified: ${rcvData.totalRounds}`
      }
    }
```

Add `activeLens` and `whatIfModel` to the `cardDefs` dependency array.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc -b` — clean. `npx vitest run src/views/Elections` — PASS.

```bash
git add src/views/Elections/Elections.tsx src/views/Elections/map/PrecinctLegend.tsx
git commit -m "feat(elections): what-if banner, hypothetical winner cards, legend outline disclosure"
```

---

### Task 5: WhatIfPanel + panel arm + registry flip

**Files:**
- Create: `src/views/Elections/panels/WhatIfPanel.tsx`
- Modify: `src/views/Elections/Elections.tsx` (panel arm, collapsed chip, imports)
- Modify: `src/views/Elections/rcvLens.ts` (SHIPPED_LENSES + comments)
- Modify: `src/views/Elections/rcvLens.test.ts` (deliberate pin updates)
- Delete: `scripts/__probe-whatif.ts` (controller probe, superseded by whatIf.test.ts)

**Interfaces:**
- Consumes: `struckIdx`, `setStrikes`, `whatIfChartData`, `whatIfTransport`,
  `whatIfModel` (Tasks 3–4); `RCVRoundChart` (`{ rcvData, candidateColors, width,
  transport }`); `RcvTransport`.
- Produces: `WhatIfPanel` component (props below); `SHIPPED_LENSES =
  ['replay', 'coalition', 'whatif']`.

- [ ] **Step 1: Update the rcvLens pins (deliberate flip)**

In `src/views/Elections/rcvLens.ts`: set
`export const SHIPPED_LENSES: readonly RcvLens[] = ['replay', 'coalition', 'whatif']`,
update the header comment (all three lenses shipped; drop "WHAT-IF … isn't buildable
yet"), and simplify the `parseLens` docstring's unshipped-lens example to a general note
(the mechanism stays for future lenses).

In `src/views/Elections/rcvLens.test.ts`: replace the
`degrades a known-but-unshipped lens to null` test with:

```ts
  it('accepts the whatif lens now that it has shipped', () => {
    expect(parseLens('whatif')).toBe('whatif')
  })
```

and update the exact pin:

```ts
  it('SHIPPED_LENSES is exactly replay + coalition + whatif', () => {
    expect(SHIPPED_LENSES).toEqual(['replay', 'coalition', 'whatif'])
  })
```

Run: `npx vitest run src/views/Elections/rcvLens.test.ts` — PASS.

- [ ] **Step 2: Create WhatIfPanel**

Create `src/views/Elections/panels/WhatIfPanel.tsx`:

```tsx
/**
 * WhatIfPanel — the RCV panel's WHAT-IF lens arm.
 *
 * A strike roster (one pill per candidate — pigment dot + surname +
 * strike/restore toggle) above the counterfactual rounds chart on its own
 * transport. Striking the winner is the marquee gesture. Pure
 * presentational: tabulation happens upstream (tabulateWhatIf memo);
 * this component only toggles ?strike= via onSetStrikes.
 *
 * Color contract (pinned): candidateColors is the CERTIFIED race's
 * rank-assigned map — counterfactual surfaces never re-derive colors
 * (a re-derive would hand the departed winner's pigment to the new
 * winner mid-comparison). Keys are RAW names — look up before cleaning.
 */
import type { RCVContest, CVRBallotArtifact } from '@/types/elections'
import type { RcvTransport } from '@/hooks/useRcvTransport'
import { cleanCandidateName, leaderDisplayName } from '@/utils/electionData'
import RCVRoundChart from '@/components/charts/RCVRoundChart'

interface WhatIfPanelProps {
  artifact: CVRBallotArtifact
  candidateColors: Map<string, string>
  /** Sanitized artifact indices currently struck (Elections' struckIdx). */
  struckIdx: number[]
  /** Rewrites the full ?strike= set (raw artifact names). */
  onSetStrikes: (names: string[]) => void
  /** Counterfactual contest (certified when nothing is struck). */
  chartData: RCVContest | null
  transport: RcvTransport
}

export default function WhatIfPanel({
  artifact, candidateColors, struckIdx, onSetStrikes, chartData, transport,
}: WhatIfPanelProps) {
  const struckSet = new Set(struckIdx)
  const remaining = artifact.candidates.length - struckSet.size

  const toggle = (i: number) => {
    const next = struckSet.has(i)
      ? struckIdx.filter((s) => s !== i)
      : [...struckIdx, i]
    onSetStrikes(next.map((s) => artifact.candidates[s]))
  }

  return (
    <div>
      <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 mb-1.5">
        Remove a candidate — same ballots, rerun
      </p>
      <div className="flex flex-wrap gap-1 mb-3 max-w-[400px]">
        {artifact.candidates.map((name, i) => {
          const struck = struckSet.has(i)
          const atFloor = !struck && remaining <= 2
          return (
            <button
              key={name}
              onClick={() => { if (!atFloor) toggle(i) }}
              disabled={atFloor}
              title={atFloor ? 'Leave at least two candidates in the race' : undefined}
              aria-pressed={struck}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-micro font-mono transition-all ${
                struck
                  ? 'bg-slate-200/40 dark:bg-white/[0.04]'
                  : 'bg-slate-100/80 dark:bg-white/[0.06] hover:bg-slate-200/80 dark:hover:bg-white/[0.1]'
              } ${atFloor ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: candidateColors.get(name) || '#a8926a', opacity: struck ? 0.4 : 1 }}
              />
              <span className={struck ? 'line-through opacity-40 text-ink dark:text-paper-200' : 'text-ink dark:text-paper-200'}>
                {leaderDisplayName(cleanCandidateName(name))}
              </span>
              {struck && (
                <span className="text-nano font-mono text-brick-400">removed</span>
              )}
            </button>
          )
        })}
      </div>
      {chartData ? (
        <RCVRoundChart
          key={`${artifact.raceId}-${struckIdx.join('.')}`}
          rcvData={chartData}
          candidateColors={candidateColors}
          width={400}
          transport={transport}
        />
      ) : (
        <p className="text-micro text-slate-400 px-2 py-3">Loading ballots&hellip;</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire the panel arm + collapsed chip**

In Elections.tsx: import `WhatIfPanel` with the other panel imports. In the RCV panel's
`switch (activeLens)`, add before `default:`:

```tsx
                    case 'whatif':
                      return cvrArtifact ? (
                        <WhatIfPanel
                          artifact={cvrArtifact}
                          candidateColors={candidateColors}
                          struckIdx={struckIdx}
                          onSetStrikes={setStrikes}
                          chartData={whatIfChartData}
                          transport={whatIfTransport}
                        />
                      ) : (
                        <p className="text-micro text-slate-400 px-2 py-3">Loading ballots&hellip;</p>
                      )
```

Collapsed chip — after the coalition chip fragment, add:

```tsx
                    {rcvCollapsed && activeLens === 'whatif' && (
                      <> &middot; WHAT-IF &middot; {struckIdx.length} removed</>
                    )}
```

Panel maxWidth: the whatif arm renders a 400px chart + a wrapping pill roster — extend the
expanded-width ternary so whatif uses the 448px arm (no change needed if the existing
fallback already yields `min(448px, 100vw - 2.5rem)` for non-coalition lenses — verify and
note in your report).

- [ ] **Step 4: Delete the controller probe**

```bash
git rm scripts/__probe-whatif.ts
```

- [ ] **Step 5: Full verify + commit**

Run: `npx tsc -b` — clean.
Run: `npx vitest run` — full suite PASS.

```bash
git add src/views/Elections/panels/WhatIfPanel.tsx src/views/Elections/Elections.tsx src/views/Elections/rcvLens.ts src/views/Elections/rcvLens.test.ts
git commit -m "feat(elections): WHAT-IF lens ships — strike roster, counterfactual chart, registry flip"
```

---

## Final verification (controller)

- [ ] `npx tsc -b` + `npx vitest run` (expect 521 pre-existing + ~20 new, all green)
- [ ] `~/dev/devman/tools/devman-build.mjs pnpm build`
- [ ] Final whole-branch review (most capable model; hand it spec §4.1/§4.5/§4.6/§4.7-9,
      this plan, the ledger's accepted-minors list; ask for a per-section fidelity sweep +
      contract-holds-on-EVERY-surface checks: floor/withheld discipline, certified-color
      pin on chart AND map AND legend AND cards AND roster, `?strike=` hygiene on every
      exit path)
- [ ] Headless QA (vite preview via tarmac): cold `?lens=whatif` resting state (no banner,
      chart parked on final round) · `?strike=DANIEL%20LURIE` → banner verbatim copy,
      Hypothetical winner = Breed, Rounds "certified: 14", chart opens R13, legend outline
      row present · Reset to reality clears · min-2 disabled toggles · lens exit / race
      switch delete `?strike=` · `?lens=whatif&round=3&strike=…` parks on round 3 ·
      certified-color DOM probe (Breed's chart bar color unchanged vs certified view)
- [ ] Live QA with Jesse → merge on his word
