# CVR Pipeline + REPLAY Lens (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the CVR ballot pipeline (generator + reconciliation gates + committed artifacts) and the REPLAY lens — a round-stepping precinct map driven by the RCV chart's transport promoted to a view-level clock.

**Architecture:** A build script parses SF's certified 296MB Dominion CVR zip locally into compact committed per-race ballot artifacts; a pure tabulator (shared by generator and browser) reproduces the certified round reports exactly (Gate A) and feeds per-round precinct states to the existing precinct paint pipeline. Spec: `docs/superpowers/specs/2026-07-21-rcv-cvr-skin-design.md`.

**Tech Stack:** Vite + React 18 + TS, Mapbox GL v3, node-only Vitest, `tsx` for TS scripts, node `zlib` (no new dependencies).

## Global Constraints

- **All facts below are PROBE-VERIFIED against the real CVR + committed certified data (2026-07-21). They are exact values, not estimates.**
- Tabulator bucket semantics (mayor targets): grand total 410,105 constant ∀r; `blanks` = contest entries with zero valid marks, CONSTANT (18,540); `overvotes` CUMULATIVE, R1 = patterns leading with the terminator (1,381 → 2,229); `exhausted` cumulative from 0 (for `struck: []`); `transfer[r] = votes[r+1] − votes[r]`, final round 0; `percentage = Math.round(votes / continuingTotal * 10000) / 10000`.
- Round emission shape (probed from committed `rcv/mayor.json`): EVERY round carries ALL candidates in the SAME order (round-1 descending votes); eliminated candidates persist with `votes: 0, percentage: 0, transfer: 0, isEliminated: false, isLeader: false`; exactly one `isEliminated: true` per non-final round, ZERO in the final round; exactly one `isLeader: true` per round; `isEliminated` sits on the candidate's LAST round holding votes.
- Mark filter: `IsVote === true && IsAmbiguous === false`. Session element: `Modified` when present with `IsCurrent: true`, else `Original`. Real data nests `Cards[]` between the element and `Contests[]`. Candidate `Type` enum strings are exactly `"Regular" | "WriteIn" | "QualifiedWriteIn"`.
- Canonical resolution (PROVEN — reproduces certified R1 exactly in all 10 races): walk ranks 1..NumOfRanks; no valid marks at rank → skip; ≥2 distinct CandidateIds at rank → append `-1` terminator, stop; two marks same candidate = one mark; `WriteIn`-type candidate → skip rank; already-seen candidate → skip; else append.
- Precinct id: `/^PCT (\d{4})/` on `PrecinctPortionManifest.Description` (descriptions may carry a trailing `" MB"`), cross-checked against `ExternalId.split('-')[0]` — throw on mismatch. 514 portions.
- Frozen exception sets (probe-derived; the house allow-list idiom — bidirectional pins):
  - `RECONCILIATION_BLOCKED = ['20241105/treasurer']` (CVR ballots exist; no certified rounds).
  - `SOV_CONTEST_WITHHELD = { '20241105/member-board-of-supervisors-district-3': ['9306'], '20241105/member-board-of-supervisors-district-7': ['9735'], '20241105/member-board-of-supervisors-district-11': ['1149'] }` — SOV rows SF zeroed for ballot secrecy (row exists, ~all zeros, turnout shows ~758 ballots; CVR carries full tallies).
  - The SOV `Write-in` row may exceed our as-cast write-in count (SOV counts write-in marks the tabulator rejected): assert per-precinct `ours ≤ sov` for the write-in row and pin the citywide delta per race (mayor: 4; every other race: 0).
- The 13 SOV-withheld precincts: `["1103","1116","7203","7204","7206","7338","7636","9147","9513","9901","9902","9903","9904"]` (derived from data in code — the literal list appears ONLY in tests as a pin). Their ballots count in tabulation; they stay UNPAINTED (they have no `_turnout` row, so the existing paint loop skips them for free).
- Transport constants travel together: `BASE_DWELL_MS = 1500`, `TRANSFER_DWELL_MS = 3400`, `TRANSFER_WINDOW_MS = 3000`; containment invariant: adopt anim (0.55s delay + 2.2s run) ⊂ window ⊂ dwell.
- URL grammar: `?lens=replay` (unknown values → null); `?round=K` 1-based, deleted on every lens change, ignored when no lens active, written only on settled positions (never during autoplay); `?candidate=` suppressed while a lens is active (`activeFocusCandidate` gains `&& activeLens === null`); lens params deleted on race/election switch.
- Copy (verbatim; AP style, no jargon): tooltip `«Name» — NN% of ballots still counting here`; legend eyebrow `ROUND K OF N`; drain row `No longer counting — ballots with no remaining choices`; withheld line `13 small precincts withheld by S.F. — ballots still count citywide`.
- Compact `JSON.stringify` (no indent) for all emitted artifacts; every emitted array has a pinned deterministic sort (byte-stable `--check`).
- Verify with `npx tsc -b` before any push; final build via `~/dev/devman/tools/devman-build.mjs pnpm build`. Never start dev servers via Bash.
- Commit messages end with the two house trailers (Co-Authored-By + Claude-Session).

## File map

| File | Role |
|---|---|
| `src/types/elections.ts` (modify) | `OVERVOTE_TERMINATOR`, `CVRBallotArtifact`, `CVRManifest` |
| `src/lib/rcv/ballots.ts` (new) | `decodeBallots` — artifact → typed arrays |
| `src/lib/rcv/tabulate.ts` (new) | the tabulator (generator + browser share it) |
| `src/lib/rcv/replay.ts` (new) | per-round precinct states + paint-row adapter |
| `src/lib/rcv/reconciliation.test.ts` (new) | standing Gate A on committed files |
| `src/utils/colorMix.ts` (new) | `mixHex` lifted from FlowMapLayer |
| `scripts/fetch-cvr-sources.mjs` (new) | download + SHA-512 verify |
| `scripts/build-cvr-ballots.ts` (new) | zip walk → resolution → gates → artifacts |
| `scripts/__tests__/buildCvrBallots.test.ts` (new) | synthetic-fixture resolution tests |
| `src/hooks/rcvTransportCore.ts` (new) | pure dwell/step/clamp logic + constants |
| `src/hooks/useRcvTransport.ts` (new) | the view-level clock |
| `src/components/charts/RCVRoundChart.tsx` (modify) | fully controlled via `transport` prop |
| `src/views/Elections/rcvLens.ts` (new) | lens union + `SHIPPED_LENSES` + parser |
| `src/hooks/useElectionResults.ts` (modify) | `useCVRManifest`, `useCVRBallots` |
| `src/views/Elections/useReplayModel.ts` (new) | decode→tabulate→states memo |
| `src/views/Elections/map/precinctPaint.ts` (modify) | `replayFill` |
| `src/views/Elections/map/precinctJoin.ts` (modify) | `FLIP_LIFT`, `replay` branch |
| `src/views/Elections/map/PrecinctFillLayer.tsx` (modify) | thread `replay` option |
| `src/views/Elections/map/PrecinctLegend.tsx` (modify) | replay variant |
| `src/views/Elections/Elections.tsx` (modify) | lens strip, URL, transport, panel |
| `public/data/elections/results/20241105/cvr/*.json` (generated) | 10 artifacts + `_manifest.json` |

---

### Task 1: Artifact types + `decodeBallots`

**Files:**
- Modify: `src/types/elections.ts` (append after the `RCVCandidateRound` block, ~line 84)
- Create: `src/lib/rcv/ballots.ts`
- Test: `src/lib/rcv/ballots.test.ts`

**Interfaces:**
- Produces: `OVERVOTE_TERMINATOR = -1`, `CVRBallotArtifact`, `CVRManifest` (types), `DecodedBallots`, `decodeBallots(artifact): DecodedBallots` — consumed by every later task.

- [ ] **Step 1: Write the failing test** — `src/lib/rcv/ballots.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { OVERVOTE_TERMINATOR, type CVRBallotArtifact } from '@/types/elections'
import { decodeBallots } from './ballots'

const artifact: CVRBallotArtifact = {
  formatVersion: 1,
  dateCode: '20241105',
  raceId: 'test-race',
  title: 'TEST RACE',
  candidates: ['ALPHA', 'BETA', 'GAMMA'],
  precincts: ['1101', '1102'],
  sovSuppressed: [],
  // pattern 0: A>B, pattern 1: overvote at rank 1, pattern 2: blank, pattern 3: C
  patterns: [[0, 1], [OVERVOTE_TERMINATOR], [], [2]],
  // (precinctIdx, patternIdx, count)
  groups: [0, 0, 10, 0, 1, 2, 1, 0, 5, 1, 2, 3, 1, 3, 4],
}

describe('decodeBallots', () => {
  it('decodes patterns into flat typed arrays with offsets', () => {
    const d = decodeBallots(artifact)
    expect(d.candidateCount).toBe(3)
    expect(d.precinctCount).toBe(2)
    expect(d.patternCount).toBe(4)
    expect(Array.from(d.patternStart)).toEqual([0, 2, 3, 3, 4])
    expect(Array.from(d.patternFlat)).toEqual([0, 1, OVERVOTE_TERMINATOR, 2])
  })
  it('decodes groups and aggregates pattern totals + total ballots', () => {
    const d = decodeBallots(artifact)
    expect(Array.from(d.groupPrecinct)).toEqual([0, 0, 1, 1, 1])
    expect(Array.from(d.groupPattern)).toEqual([0, 1, 0, 2, 3])
    expect(Array.from(d.groupCount)).toEqual([10, 2, 5, 3, 4])
    expect(Array.from(d.patternTotal)).toEqual([15, 2, 3, 4])
    expect(d.totalBallots).toBe(24)
  })
  it('throws on unknown formatVersion and malformed groups', () => {
    expect(() => decodeBallots({ ...artifact, formatVersion: 2 as never })).toThrow(/formatVersion/)
    expect(() => decodeBallots({ ...artifact, groups: [0, 0] })).toThrow(/divisible/)
    expect(() => decodeBallots({ ...artifact, patterns: [[9]] })).toThrow(/candidate index/)
  })
})
```

- [ ] **Step 2: Run:** `pnpm test src/lib/rcv/ballots.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement.** In `src/types/elections.ts` append (doc comments per the spec §3.1 — copy them):

```ts
export const OVERVOTE_TERMINATOR = -1

export interface CVRBallotArtifact {
  formatVersion: 1
  dateCode: string
  raceId: string
  title: string
  candidates: string[]
  precincts: string[]
  sovSuppressed: string[]
  patterns: number[][]
  groups: number[]
}

export interface CVRManifest {
  dateCode: string
  formatVersion: 1
  races: Record<string, { ballots: number; patterns: number; groups: number; bytes: number }>
  reconciliationBlocked: string[]
}
```

Create `src/lib/rcv/ballots.ts` (pure leaf — imports ONLY from `@/types/elections`):

```ts
import { OVERVOTE_TERMINATOR, type CVRBallotArtifact } from '@/types/elections'

export interface DecodedBallots {
  candidateCount: number
  precinctCount: number
  patternCount: number
  patternFlat: Int16Array
  patternStart: Int32Array
  groupPrecinct: Int32Array
  groupPattern: Int32Array
  groupCount: Int32Array
  patternTotal: Int32Array
  totalBallots: number
}

export function decodeBallots(artifact: CVRBallotArtifact): DecodedBallots {
  if (artifact.formatVersion !== 1) {
    throw new Error(`Unsupported CVR artifact formatVersion ${artifact.formatVersion}`)
  }
  const patternCount = artifact.patterns.length
  let flatLen = 0
  for (const p of artifact.patterns) flatLen += p.length
  const patternFlat = new Int16Array(flatLen)
  const patternStart = new Int32Array(patternCount + 1)
  let off = 0
  for (let i = 0; i < patternCount; i++) {
    patternStart[i] = off
    for (const v of artifact.patterns[i]) {
      if (v !== OVERVOTE_TERMINATOR && (v < 0 || v >= artifact.candidates.length)) {
        throw new Error(`CVR artifact pattern ${i}: candidate index ${v} out of range`)
      }
      patternFlat[off++] = v
    }
  }
  patternStart[patternCount] = off
  if (artifact.groups.length % 3 !== 0) throw new Error('CVR artifact groups length not divisible by 3')
  const nGroups = artifact.groups.length / 3
  const groupPrecinct = new Int32Array(nGroups)
  const groupPattern = new Int32Array(nGroups)
  const groupCount = new Int32Array(nGroups)
  const patternTotal = new Int32Array(patternCount)
  let totalBallots = 0
  for (let g = 0; g < nGroups; g++) {
    const pr = artifact.groups[g * 3]
    const pat = artifact.groups[g * 3 + 1]
    const c = artifact.groups[g * 3 + 2]
    if (pr < 0 || pr >= artifact.precincts.length) throw new Error(`group ${g}: precinct index ${pr} out of range`)
    if (pat < 0 || pat >= patternCount) throw new Error(`group ${g}: pattern index ${pat} out of range`)
    groupPrecinct[g] = pr
    groupPattern[g] = pat
    groupCount[g] = c
    patternTotal[pat] += c
    totalBallots += c
  }
  return { candidateCount: artifact.candidates.length, precinctCount: artifact.precincts.length, patternCount, patternFlat, patternStart, groupPrecinct, groupPattern, groupCount, patternTotal, totalBallots }
}
```

- [ ] **Step 4: Run:** `pnpm test src/lib/rcv/ballots.test.ts` → PASS. Also `npx tsc -b` clean.
- [ ] **Step 5: Commit:** `feat(cvr): ballot artifact types + typed-array decoder`

---

### Task 2: The tabulator

**Files:**
- Create: `src/lib/rcv/tabulate.ts`
- Test: `src/lib/rcv/tabulate.test.ts`

**Interfaces:**
- Consumes: `DecodedBallots` (Task 1), `RCVContest`/`RCVRound`/`RCVCandidateRound` (`src/types/elections.ts:60-84`).
- Produces: `ASSIGN_EXHAUSTED = -1`, `ASSIGN_OVERVOTED = -2`, `ASSIGN_BLANK = -3`, `RCVTieError`, `TabulateOptions { tieOrder?, struck? }`, `RoundAssignment { round, groups: Int16Array }`, `TabulationOutput { contest, assignments, eliminationOrder }`, `tabulate(ballots, meta, options?)`.

- [ ] **Step 1: Write the failing test** — `src/lib/rcv/tabulate.test.ts`. Build a synthetic 4-candidate contest whose numbers are chosen to conserve exactly, plus the edge fixtures:

```ts
import { describe, expect, it } from 'vitest'
import { OVERVOTE_TERMINATOR, type CVRBallotArtifact } from '@/types/elections'
import { decodeBallots } from './ballots'
import { ASSIGN_BLANK, ASSIGN_EXHAUSTED, ASSIGN_OVERVOTED, RCVTieError, tabulate } from './tabulate'

// A=idx0, B=1, C=2, D=3. One precinct is enough for tabulation tests.
function makeArtifact(patterns: number[][], counts: number[]): CVRBallotArtifact {
  return {
    formatVersion: 1, dateCode: '20241105', raceId: 'synth', title: 'SYNTH',
    candidates: ['A', 'B', 'C', 'D'], precincts: ['1101'], sovSuppressed: [],
    patterns, groups: patterns.flatMap((_, i) => [0, i, counts[i]]),
  }
}
const META = { raceId: 'synth', title: 'SYNTH', candidates: ['A', 'B', 'C', 'D'] }

// R1: A=40 B=30 C=20 D=10, blanks=5, overvote-at-1=3. Total 108.
// D eliminated R1 (D's 10 ballots: 6 → B, 4 exhaust).
// R2: A=40 B=36 C=20. C eliminated (C's 20: 12 → A, 5 → B, 3 overvote at next rank).
// R3: A=52 B=41. Stop (2 remain).
const ART = makeArtifact(
  [
    [0],                        // A only                    40
    [1],                        // B only                    30
    [2, 0],                     // C > A                     12
    [2, 1],                     // C > B                      5
    [2, OVERVOTE_TERMINATOR],   // C > overvote               3
    [3, 1],                     // D > B                      6
    [3],                        // D only                     4
    [],                         // blank                      5
    [OVERVOTE_TERMINATOR],      // overvote at rank 1         3
  ],
  [40, 30, 12, 5, 3, 6, 4, 5, 3],
)

describe('tabulate', () => {
  const out = tabulate(decodeBallots(ART), META)
  const r = out.contest.rounds

  it('runs to two finalists with the right round count and winner', () => {
    expect(out.contest.totalRounds).toBe(3)
    expect(out.contest.winner).toBe('A')
    expect(out.eliminationOrder).toEqual(['D', 'C'])
  })
  it('reproduces the bucket semantics', () => {
    expect(r[0]).toMatchObject({ continuingTotal: 100, exhausted: 0, overvotes: 3, blanks: 5 })
    expect(r[1]).toMatchObject({ continuingTotal: 96, exhausted: 4, overvotes: 3, blanks: 5 })
    expect(r[2]).toMatchObject({ continuingTotal: 93, exhausted: 4, overvotes: 6, blanks: 5 })
    // conservation ∀r
    for (const round of r) {
      expect(round.continuingTotal + round.exhausted + round.overvotes + round.blanks).toBe(108)
    }
  })
  it('emits every candidate in meta order in every round, with certified flag shape', () => {
    for (const round of r) expect(round.candidates.map((c) => c.name)).toEqual(['A', 'B', 'C', 'D'])
    // D flagged on its LAST live round (R1), zeroed after with clean flags
    expect(r[0].candidates[3]).toMatchObject({ votes: 10, isEliminated: true })
    expect(r[1].candidates[3]).toMatchObject({ votes: 0, percentage: 0, transfer: 0, isEliminated: false, isLeader: false })
    expect(r.map((x) => x.candidates.filter((c) => c.isEliminated).length)).toEqual([1, 1, 0])
    expect(r.map((x) => x.candidates.filter((c) => c.isLeader).length)).toEqual([1, 1, 1])
  })
  it('computes transfer as the next-round delta and percentage with certified rounding', () => {
    expect(r[0].candidates.map((c) => c.transfer)).toEqual([0, 6, 0, -10])
    expect(r[1].candidates.map((c) => c.transfer)).toEqual([12, 5, -20, 0])
    expect(r[2].candidates.map((c) => c.transfer)).toEqual([0, 0, 0, 0])
    expect(r[0].candidates[0].percentage).toBe(0.4)
    expect(r[2].candidates[0].percentage).toBe(Math.round((52 / 93) * 10000) / 10000)
  })
  it('exposes per-round assignments for the lens layer', () => {
    expect(out.assignments).toHaveLength(3)
    const a1 = out.assignments[0].groups
    expect(a1[0]).toBe(0)               // [A] group sits with A
    expect(a1[7]).toBe(ASSIGN_BLANK)
    expect(a1[8]).toBe(ASSIGN_OVERVOTED)
    const a2 = out.assignments[1].groups
    expect(a2[5]).toBe(1)               // D>B advanced to B
    expect(a2[6]).toBe(ASSIGN_EXHAUSTED)
    const a3 = out.assignments[2].groups
    expect(a3[4]).toBe(ASSIGN_OVERVOTED) // C>overvote hit the terminator
  })
  it('throws RCVTieError on an unpinned minimum tie; tieOrder resolves it', () => {
    const tieArt = makeArtifact([[0], [1], [2], [3]], [10, 10, 5, 5])
    expect(() => tabulate(decodeBallots(tieArt), META)).toThrow(RCVTieError)
    const resolved = tabulate(decodeBallots(tieArt), META, { tieOrder: ['D'] })
    expect(resolved.eliminationOrder[0]).toBe('D')
  })
  it('struck candidates are removed before round 1; all-struck patterns exhaust at R1', () => {
    const s = tabulate(decodeBallots(ART), META, { struck: [0, 1] })   // strike A and B → C vs D
    expect(s.contest.totalRounds).toBe(1)
    expect(s.contest.winner).toBe('C')
    const r1 = s.contest.rounds[0]
    // [A]-only ×40 and [B]-only ×30 exhaust at R1 (valid marks — never blanks)
    expect(r1.exhausted).toBe(70)
    expect(r1.blanks).toBe(5)
    expect(r1.candidates.map((c) => c.name)).toEqual(['C', 'D'])   // struck rows absent
    expect(r1.continuingTotal + r1.exhausted + r1.overvotes + r1.blanks).toBe(108)
  })
  it('empty-input degeneracy', () => {
    const empty = makeArtifact([[]], [0])
    const e = tabulate(decodeBallots(empty), META)
    expect(e.contest.rounds).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/lib/rcv/tabulate.ts` (pure leaf; imports only `./ballots` + `@/types/elections`):

```ts
import type { RCVCandidateRound, RCVContest, RCVRound } from '@/types/elections'
import { OVERVOTE_TERMINATOR } from '@/types/elections'
import type { DecodedBallots } from './ballots'

export const ASSIGN_EXHAUSTED = -1
export const ASSIGN_OVERVOTED = -2
export const ASSIGN_BLANK = -3

export class RCVTieError extends Error {
  round: number
  tied: string[]
  constructor(round: number, tied: string[]) {
    super(`Elimination tie in round ${round}: ${tied.join(', ')} — pin the certified order in TIE_ORDER_PINS`)
    this.name = 'RCVTieError'
    this.round = round
    this.tied = tied
  }
}

export interface TabulateOptions {
  /** Eliminate-first order for exact minimum-vote ties. Absent + tie → throw. */
  tieOrder?: readonly string[]
  /** Candidate indices removed before round 1 (WHAT-IF). Default []. */
  struck?: readonly number[]
}

export interface RoundAssignment {
  round: number
  /** groupIdx → candidateIdx, or ASSIGN_* sentinel. Snapshot per round. */
  groups: Int16Array
}

export interface TabulationOutput {
  contest: RCVContest
  assignments: RoundAssignment[]
  eliminationOrder: string[]
}

export function tabulate(
  ballots: DecodedBallots,
  meta: { raceId: string; title: string; candidates: string[] },
  options: TabulateOptions = {},
): TabulationOutput {
  const n = ballots.candidateCount
  const struck = new Set(options.struck ?? [])
  const alive: boolean[] = Array.from({ length: n }, (_, i) => !struck.has(i))
  const nGroups = ballots.groupCount.length
  const cursor = new Int32Array(nGroups)
  const assign = new Int16Array(nGroups)

  // Advance a group's cursor to its highest-ranked continuing candidate.
  // Overvote terminators exhaust permanently regardless of roster (Charter:
  // a property of the ballot as cast). Blank = empty pattern; a pattern
  // whose every candidate is dead exhausts (it HAD valid marks — not blank).
  const advance = (g: number): number => {
    const pat = ballots.groupPattern[g]
    const start = ballots.patternStart[pat]
    const end = ballots.patternStart[pat + 1]
    if (end === start) return ASSIGN_BLANK
    let i = start + cursor[g]
    while (i < end) {
      const v = ballots.patternFlat[i]
      if (v === OVERVOTE_TERMINATOR) { cursor[g] = i - start; return ASSIGN_OVERVOTED }
      if (alive[v]) { cursor[g] = i - start; return v }
      i++
    }
    cursor[g] = end - start
    return ASSIGN_EXHAUSTED
  }
  for (let g = 0; g < nGroups; g++) assign[g] = advance(g)

  const rounds: RCVRound[] = []
  const assignments: RoundAssignment[] = []
  const eliminationOrder: string[] = []
  const rosterIdx = Array.from({ length: n }, (_, i) => i).filter((i) => !struck.has(i))

  for (;;) {
    const roundNum = rounds.length + 1
    const votes = new Array<number>(n).fill(0)
    let exhausted = 0
    let overvoted = 0
    let blank = 0
    for (let g = 0; g < nGroups; g++) {
      const a = assign[g]
      const c = ballots.groupCount[g]
      if (a >= 0) votes[a] += c
      else if (a === ASSIGN_EXHAUSTED) exhausted += c
      else if (a === ASSIGN_OVERVOTED) overvoted += c
      else blank += c
    }
    const continuingTotal = votes.reduce((s, v) => s + v, 0)
    const aliveIdx = rosterIdx.filter((i) => alive[i])
    let maxVotes = 0
    for (const i of aliveIdx) if (votes[i] > maxVotes) maxVotes = votes[i]

    const rows: RCVCandidateRound[] = rosterIdx.map((i) => ({
      name: meta.candidates[i],
      votes: votes[i],
      percentage: continuingTotal > 0 ? Math.round((votes[i] / continuingTotal) * 10000) / 10000 : 0,
      transfer: 0,
      isEliminated: false,
      isLeader: maxVotes > 0 && votes[i] === maxVotes,
    }))
    rounds.push({ round: roundNum, candidates: rows, continuingTotal, exhausted, overvotes: overvoted, blanks: blank })
    assignments.push({ round: roundNum, groups: Int16Array.from(assign) })

    // Two terminal states: two finalists remain, or NO ballot still counts —
    // with zero continuing votes no elimination is derivable (an all-zero
    // "tie" is degeneracy, not a tie; RCVTieError is reserved for real
    // minimum-vote ties with ballots behind them).
    if (aliveIdx.length <= 2 || continuingTotal === 0) break

    let min = Infinity
    for (const i of aliveIdx) if (votes[i] < min) min = votes[i]
    const tied = aliveIdx.filter((i) => votes[i] === min)
    let elim: number
    if (tied.length === 1) {
      elim = tied[0]
    } else {
      const tiedNames = tied.map((i) => meta.candidates[i])
      const order = options.tieOrder ?? []
      const pick = tied
        .filter((i) => order.includes(meta.candidates[i]))
        .sort((a, b) => order.indexOf(meta.candidates[a]) - order.indexOf(meta.candidates[b]))[0]
      if (pick === undefined) throw new RCVTieError(roundNum, tiedNames)
      elim = pick
    }
    const row = rows[rosterIdx.indexOf(elim)]
    row.isEliminated = true
    eliminationOrder.push(meta.candidates[elim])
    alive[elim] = false
    for (let g = 0; g < nGroups; g++) {
      if (assign[g] === elim) assign[g] = advance(g)
    }
  }

  // transfer[r] = votes[r+1] − votes[r]; final round stays 0.
  for (let r = 0; r < rounds.length - 1; r++) {
    const cur = rounds[r].candidates
    const next = rounds[r + 1].candidates
    for (let i = 0; i < cur.length; i++) cur[i].transfer = next[i].votes - cur[i].votes
  }

  const last = rounds[rounds.length - 1]
  const winnerRow = [...last.candidates].sort((a, b) => b.votes - a.votes)[0]
  const contest: RCVContest = {
    raceId: meta.raceId,
    title: meta.title,
    totalRounds: rounds.length,
    rounds,
    winner: winnerRow?.name ?? '',
  }
  return { contest, assignments, eliminationOrder }
}
```

- [ ] **Step 4: Run** `pnpm test src/lib/rcv/tabulate.test.ts` → PASS; `npx tsc -b` clean.
- [ ] **Step 5: Commit:** `feat(cvr): pure RCV tabulator with certified emission shape`

---

### Task 3: Replay round states + paint-row adapter

**Files:**
- Create: `src/lib/rcv/replay.ts`
- Test: `src/lib/rcv/replay.test.ts`

**Interfaces:**
- Consumes: `DecodedBallots`, `TabulationOutput`, `ASSIGN_*` (Tasks 1–2).
- Produces: `PrecinctRoundState { tallies: Int32Array; exhausted: number; overvoted: number; blank: number; leader: number; leaderShare: number }`, `computeReplayRounds(ballots, tab): PrecinctRoundState[][]` (`[roundIdx][precinctIdx]`), `ReplayPaintRow { votes: Record<string, number>; total: number; drainShare: number; flipped: boolean }`, `replayPaintRows(states, roundIdx, artifact): Record<string, ReplayPaintRow>` (keyed by precinct id string).

- [ ] **Step 1: Failing test** — reuse Task 2's `ART` fixture split across TWO precincts (move half the groups to precinct `'1102'`), then pin:
  - the tensor column-sum invariant: for every round r and candidate c, `Σ_precincts states[r][p].tallies[c] === out.contest.rounds[r].candidates[byName c].votes`;
  - per-precinct grand total (`Σtallies + exhausted + overvoted + blank`) constant across rounds;
  - `drainShare` ≡ 0 at round 1 and `= (exh[r] − exh[0] + ov[r] − ov[0]) / continuing[0]` afterward (compute one expected value by hand from the fixture);
  - `flipped` true exactly for precincts whose `leader` changed vs the previous round, always false at round 1;
  - `replayPaintRows` votes keyed by candidate NAME with zero-vote candidates omitted, `total` = continuing sum.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/lib/rcv/replay.ts`:

```ts
import type { CVRBallotArtifact } from '@/types/elections'
import type { DecodedBallots } from './ballots'
import { ASSIGN_BLANK, ASSIGN_EXHAUSTED, ASSIGN_OVERVOTED, type TabulationOutput } from './tabulate'

export interface PrecinctRoundState {
  tallies: Int32Array
  exhausted: number
  overvoted: number
  blank: number
  /** candidateIdx of the round-state leader, or -1 when nothing continues. */
  leader: number
  leaderShare: number
}

/** [roundIdx][precinctIdx]. One pass over groups per round (~5–10ms for
 *  mayor's 14×152k), computed once per race and memoized at the hook layer. */
export function computeReplayRounds(
  ballots: DecodedBallots,
  tab: TabulationOutput,
): PrecinctRoundState[][] {
  const out: PrecinctRoundState[][] = []
  for (const ra of tab.assignments) {
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
    out.push(states)
  }
  return out
}

export interface ReplayPaintRow {
  votes: Record<string, number>
  /** CONTINUING ballots in this precinct this round — leader share reads
   *  "of ballots still counting", the certified percentage denominator. */
  total: number
  /** Ballots that stopped counting SINCE round 1 ÷ round-1 continuing —
   *  ≡ 0 at round 1 by construction; blanks excluded (they never started). */
  drainShare: number
  /** Leader changed vs the previous round (false at round 1). */
  flipped: boolean
}

export function replayPaintRows(
  states: PrecinctRoundState[][],
  roundIdx: number,
  artifact: CVRBallotArtifact,
): Record<string, ReplayPaintRow> {
  const base = states[0]
  const cur = states[roundIdx]
  const prev = roundIdx > 0 ? states[roundIdx - 1] : null
  const rows: Record<string, ReplayPaintRow> = {}
  for (let p = 0; p < artifact.precincts.length; p++) {
    const st = cur[p]
    const b = base[p]
    const votes: Record<string, number> = {}
    let total = 0
    for (let i = 0; i < st.tallies.length; i++) {
      const v = st.tallies[i]
      total += v
      if (v > 0) votes[artifact.candidates[i]] = v
    }
    let baseContinuing = 0
    for (let i = 0; i < b.tallies.length; i++) baseContinuing += b.tallies[i]
    const drained = st.exhausted - b.exhausted + st.overvoted - b.overvoted
    rows[artifact.precincts[p]] = {
      votes,
      total,
      drainShare: baseContinuing > 0 ? Math.min(1, drained / baseContinuing) : 0,
      flipped: prev ? prev[p].leader !== st.leader : false,
    }
  }
  return rows
}
```

- [ ] **Step 4: Run** → PASS; `npx tsc -b` clean.
- [ ] **Step 5: Commit:** `feat(cvr): replay round-state projection + paint-row adapter`

---

### Task 4: `mixHex` lift to `src/utils/colorMix.ts`

**Files:** Create `src/utils/colorMix.ts`; Modify `src/views/Last48/modes/FlowMapLayer.tsx`; Test `src/utils/colorMix.test.ts`.

- [ ] **Step 1:** Read `FlowMapLayer.tsx`, locate the `mixHex(a, b, t)` helper. Write `src/utils/colorMix.test.ts` pinning: `mixHex('#000000', '#ffffff', 0.5)` → the exact value the current implementation returns (compute it from the moved code, do not guess), `t = 0` → first color, `t = 1` → second.
- [ ] **Step 2:** Run → FAIL (module not found).
- [ ] **Step 3:** Move the function VERBATIM (with its doc comment) to `src/utils/colorMix.ts` as an export; in `FlowMapLayer.tsx` delete the local copy and `import { mixHex } from '@/utils/colorMix'`.
- [ ] **Step 4:** `pnpm test src/utils/colorMix.test.ts` → PASS; `npx tsc -b` clean (proves FlowMapLayer still compiles).
- [ ] **Step 5: Commit:** `refactor: lift mixHex to src/utils/colorMix (shared with replay fill)`

---

### Task 5: Fetch script

**Files:** Create `scripts/fetch-cvr-sources.mjs`.

**Interfaces:** Produces gitignored `data/elections-src/cvr/<dateCode>/CVR_Export_20241202143051.zip` + `20241202_sha512.csv`. (Both already exist locally from the Task-0 probe — the script's first run must SKIP the download and still verify.)

- [ ] **Step 1:** Implement. Frozen roster + skip-if-exists + streaming download + SHA-512 verify:

```js
// scripts/fetch-cvr-sources.mjs — download SF certified CVR exports.
// Sources are gitignored (data/elections-src/); only generator output is
// committed. Verifies the zip against SF's published SHA-512 CSV — THROWS
// on mismatch (a corrupted 296MB download must never reach the generator).
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const CVR_SOURCES = Object.freeze({
  '20241105': {
    zip: 'https://www.sfelections.org/results/20241105/data/20241203/CVR_Export_20241202143051.zip',
    zipFile: 'CVR_Export_20241202143051.zip',
    sha512Csv: 'https://www.sfelections.org/results/20241105/data/20241203/20241202_sha512.csv',
    csvFile: '20241202_sha512.csv',
  },
})

async function download(url, dest) {
  if (existsSync(dest)) { console.log(`  exists, skipping: ${dest}`); return }
  console.log(`  downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

function verify(dir, { zipFile, csvFile }) {
  const csv = readFileSync(`${dir}/${csvFile}`, 'utf8')
  // CSV rows: index,filename,path,SHA512-hex-uppercase,size,
  const row = csv.split(/\r?\n/).find((l) => l.split(',')[1] === zipFile)
  if (!row) throw new Error(`no CSV row for ${zipFile}`)
  const expected = row.split(',')[3].toLowerCase()
  const actual = createHash('sha512').update(readFileSync(`${dir}/${zipFile}`)).digest('hex')
  if (actual !== expected) throw new Error(`SHA-512 mismatch for ${zipFile}: got ${actual}`)
  console.log(`  SHA-512 verified: ${zipFile}`)
}

async function main() {
  for (const [dateCode, src] of Object.entries(CVR_SOURCES)) {
    const dir = `data/elections-src/cvr/${dateCode}`
    mkdirSync(dir, { recursive: true })
    await download(src.sha512Csv, `${dir}/${src.csvFile}`)
    await download(src.zip, `${dir}/${src.zipFile}`)
    verify(dir, src)
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
```

- [ ] **Step 2: Run:** `node scripts/fetch-cvr-sources.mjs` → both files skip (already present) and `SHA-512 verified` prints. Expected exact output includes two `exists, skipping` lines.
- [ ] **Step 3: Commit:** `feat(cvr): fetch script for certified CVR sources with SHA-512 gate`

---

### Task 6: Generator — parsing core + mark resolution (test-first)

**Files:** Create `scripts/build-cvr-ballots.ts`; Test `scripts/__tests__/buildCvrBallots.test.ts` (add `scripts/__tests__` to the Vitest include if not already matched — `vitest.config.ts` already includes `scripts/__tests__/**/*.test.ts`).

**Interfaces:**
- Produces (exported from the script for tests): `resolveContest(entry, numOfRanks, candTypeById): { pattern: number[] | null; blank: boolean }` where pattern values are CANDIDATE MANIFEST IDS at this stage (mapped to artifact indices later) and `null` never occurs for a present entry; `asCastRank1(entry, candTypeById): { kind: 'cand'; id: number } | { kind: 'writein' } | { kind: 'over' } | { kind: 'under' }`; `currentElement(session): element` (IsCurrent rule); `zipEntries(buf)` + `readZipEntry(buf, entry)`.
- Consumes: nothing from src/ yet (Task 7 wires the tabulator).

- [ ] **Step 1: Failing test** — `scripts/__tests__/buildCvrBallots.test.ts` with synthetic session/entry fixtures (no zip needed). Pin every PROVEN resolution rule:

```ts
import { describe, expect, it } from 'vitest'
import { asCastRank1, currentElement, resolveContest } from '../build-cvr-ballots'

const T = new Map([[1, 'Regular'], [2, 'Regular'], [3, 'WriteIn'], [4, 'QualifiedWriteIn']])
const mark = (cand: number, rank: number, over: Partial<{ IsVote: boolean; IsAmbiguous: boolean }> = {}) =>
  ({ CandidateId: cand, Rank: rank, IsVote: true, IsAmbiguous: false, ...over })
const entry = (marks: unknown[]) => ({ Id: 18, Marks: marks })

describe('resolveContest (Charter §13.102, probe-proven)', () => {
  it('skips skipped ranks and collapses to next indicated', () =>
    expect(resolveContest(entry([mark(1, 1), mark(2, 3)]), 10, T).pattern).toEqual([1, 2]))
  it('overvote (2 distinct candidates at a rank) appends terminator and stops', () =>
    expect(resolveContest(entry([mark(1, 1), mark(2, 2), mark(4, 2), mark(1, 3)]), 10, T).pattern).toEqual([1, -1]))
  it('two marks same candidate at one rank = one mark, not an overvote', () =>
    expect(resolveContest(entry([mark(1, 1), mark(1, 1), mark(2, 2)]), 10, T).pattern).toEqual([1, 2]))
  it('duplicate candidate at later rank is disregarded', () =>
    expect(resolveContest(entry([mark(1, 1), mark(1, 2), mark(2, 3)]), 10, T).pattern).toEqual([1, 2]))
  it('unresolved WriteIn-type marks skip their rank', () =>
    expect(resolveContest(entry([mark(3, 1), mark(2, 2)]), 10, T).pattern).toEqual([2]))
  it('qualified write-ins are ordinary candidates', () =>
    expect(resolveContest(entry([mark(4, 1)]), 10, T).pattern).toEqual([4]))
  it('IsVote false / IsAmbiguous true marks are invisible', () => {
    const r = resolveContest(entry([mark(1, 1, { IsVote: false }), mark(2, 2, { IsAmbiguous: true })]), 10, T)
    expect(r.pattern).toEqual([])
    expect(r.blank).toBe(true)
  })
  it('blank = zero valid marks; a resolvable mark means not blank', () => {
    expect(resolveContest(entry([]), 10, T).blank).toBe(true)
    expect(resolveContest(entry([mark(1, 1)]), 10, T).blank).toBe(false)
  })
})

describe('asCastRank1 (SOV comparison semantics)', () => {
  it('single distinct candidate at rank 1 counts', () =>
    expect(asCastRank1(entry([mark(1, 1), mark(2, 2)]), T)).toEqual({ kind: 'cand', id: 1 }))
  it('two distinct at rank 1 = over; none = under; WriteIn-type = writein', () => {
    expect(asCastRank1(entry([mark(1, 1), mark(2, 1)]), T).kind).toBe('over')
    expect(asCastRank1(entry([mark(1, 2)]), T).kind).toBe('under')
    expect(asCastRank1(entry([mark(3, 1)]), T).kind).toBe('writein')
  })
})

describe('currentElement', () => {
  const orig = { IsCurrent: true, Cards: [] }
  it('Original when no Modified', () => expect(currentElement({ Original: orig })).toBe(orig))
  it('Modified wins when IsCurrent', () => {
    const mod = { IsCurrent: true, Cards: [] }
    expect(currentElement({ Original: { ...orig, IsCurrent: false }, Modified: mod })).toBe(mod)
  })
})
```

- [ ] **Step 2: Run** `pnpm test scripts/__tests__/buildCvrBallots.test.ts` → FAIL.
- [ ] **Step 3: Implement the parsing core** in `scripts/build-cvr-ballots.ts` — exported pure helpers plus the zip walker. Zip walker is the Task-0-proven code (generalized from `unzipXlsx`, `build-election-results.mjs:29-46` precedent):

```ts
// EOCD scan (last 65,557 bytes), classic zip only — throw 'zip64 unsupported'
// when entry count reads 0xffff or the central-directory offset 0xffffffff.
export function zipEntries(buf: Buffer): Map<string, { method: number; csize: number; lho: number }>
export function readZipEntry(buf: Buffer, e: { method: number; csize: number; lho: number }): Buffer
// central-directory record: sig 0x02014b50; method @+10 (0=store, 8=deflate,
// else throw); csize @+20; nameLen @+28; extraLen @+30; commentLen @+32;
// local-header offset @+42; name @+46. Local header: sig 0x04034b50;
// nameLen @+26; extraLen @+28; data starts at +30+nameLen+extraLen.
// method 8 → zlib.inflateRawSync; method 0 → raw slice.
```

`resolveContest` / `asCastRank1` / `currentElement` implement exactly the Global-Constraints rules (the probe proved them — transcribe, don't re-derive). `currentElement(session)`: `session.Modified && session.Modified.IsCurrent === true ? session.Modified : session.Original`; throw if a session has a Modified where NEITHER element has `IsCurrent: true`.

- [ ] **Step 4: Run** → PASS; `npx tsc -b` clean (the script is TS — ensure it compiles under the repo tsconfig; if `tsc -b` doesn't cover `scripts/`, verify with `npx tsx --eval "import('./scripts/build-cvr-ballots.ts')"` loading without error).
- [ ] **Step 5: Commit:** `feat(cvr): generator parsing core — zip walk + proven mark resolution`

---

### Task 7: Generator — gates, emission, CLI; generate + commit the artifacts

**Files:** Modify `scripts/build-cvr-ballots.ts` (main flow); generated output `public/data/elections/results/20241105/cvr/{<raceId>.json ×10, _manifest.json}`; Create `src/lib/rcv/reconciliation.test.ts`.

**Interfaces:**
- Consumes: `tabulate`/`decodeBallots` (imported from `../src/lib/rcv/…` — the script runs via `npx tsx`, precedent `build-election-archive.ts`), committed `rcv/*.json`, `precincts/*.json`, `precincts/_turnout.json`, `neighborhoods.json`, `geo/prec-2022.geojson`.
- Produces: the committed artifacts; frozen exports `RECONCILIATION_BLOCKED`, `SOV_CONTEST_WITHHELD`, `SOV_WRITEIN_DELTA`, `TIE_ORDER_PINS` (empty object).

**Main flow (implement in this order):**
1. Load manifests from the zip; map ContestId → raceId by normalized-title match against `summary.json` races (the `raceIdFor` pattern, `build-election-results.mjs:110-115`; throw on non-match). RCV contests = `NumOfRanks > 1` (11 incl. treasurer).
2. One pass over all `CvrExport_*.json` entries: per RCV contest accumulate (a) canonical patterns per precinct via `resolveContest` (candidate-id space), (b) as-cast rank-1 tallies per precinct via `asCastRank1`, (c) OutstackConditionId histograms (log-only).
3. Per race (skipping `RECONCILIATION_BLOCKED`): build the artifact — `candidates` = committed round file's R1 order VERBATIM (Gate C validates a candidateKey bijection: CVR Regular + QualifiedWriteIn, non-Disabled, ↔ round-file R1 names; map manifest ids → artifact indices through it); `precincts` = all manifest-derived ids sorted ascending; `sovSuppressed` = ids with no `_turnout` row; `patterns` sorted by (count desc, joined-key asc); `groups` sorted by (precinctIdx, patternIdx).
4. **Gate A:** `tabulate(decodeBallots(artifact), meta)` — `JSON.stringify` deep-equal against the parsed committed `rcv/<raceId>.json`. Every round, field, bucket.
5. **Gate B:** per-precinct as-cast NAMED-candidate equality vs `precincts/<raceId>.json` rows (candidateKey join), EXCEPT rows in `SOV_CONTEST_WITHHELD`; write-in row: `ours ≤ sov` per precinct AND citywide `Σ(sov − ours) === SOV_WRITEIN_DELTA[race] ?? 0`; residual: our as-cast summed over (13 withheld ∪ contest-withheld rows) per candidate === citywide `neighborhoods.json` sums − published SOV sums.
6. **Gate C:** roster bijection (above); precinct-id set equality vs `geo/prec-2022.geojson` feature ids (514 = 514).
7. **Gate D:** `totalBallots === continuingTotal[0] + overvotes[0] + blanks` + conservation ∀r.
8. Emit compact JSON + `_manifest.json` (`races` stats incl. `bytes` of each emitted file, `reconciliationBlocked: ['treasurer']`).
9. CLI: default = rm + rewrite `cvr/` + PASS table (`console.table`); `--check` = in-memory rebuild + byte-compare every committed file; `--self-test` = perturb one group count by +1 and assert Gate A THROWS (`check(caught, 'self-test did not catch perturbation')`); `--date`, `--race` restrictions. `check(condition, msg)` throws `Reconciliation failed: ${msg}`; `main().catch` sets `process.exitCode = 1`.

- [ ] **Step 1:** Implement the main flow.
- [ ] **Step 2: Run for real:** `npx tsx scripts/build-cvr-ballots.ts` → PASS table for all 10 races. Expected: mayor artifact ≈ 2.5–3.5MB (64,589 patterns / 152,521 groups / 410,105 ballots); city-attorney/DA/sheriff tiny (≤10 patterns). If any gate throws, debug with the logged outstack histograms — the resolution rules are probe-proven, so a failure means a transcription bug, not a rules bug.
- [ ] **Step 3:** `npx tsx scripts/build-cvr-ballots.ts --check` → clean. `--self-test` → "self-test" caught message, exit 0.
- [ ] **Step 4: Standing reconciliation test** — `src/lib/rcv/reconciliation.test.ts`: for every race in the committed `_manifest.json`, load `public/data/elections/results/20241105/cvr/<raceId>.json` + `rcv/<raceId>.json` from disk (`readFileSync` with a path built from `process.cwd()`), run `tabulate(decodeBallots(artifact), meta)` and `expect(out.contest).toEqual(committed)`. Plus the treasurer bidirectional pin: `cvr/treasurer.json` must NOT exist AND `_manifest.reconciliationBlocked` must equal `['treasurer']`; if `rcv/treasurer.json` ever appears, fail with "treasurer has certified rounds now — unblock it in build-cvr-ballots". Plus: `TIE_ORDER_PINS` (imported from the script) has no `20241105/*` entries. Run: `pnpm test src/lib/rcv/reconciliation.test.ts` → PASS in < 5s.
- [ ] **Step 5:** `pnpm test` (full suite) + `npx tsc -b` → green.
- [ ] **Step 6: Commit** (artifacts + script + test): `feat(cvr): generate reconciliation-gated ballot artifacts for all 10 Nov 2024 RCV races`

---

### Task 8: Transport core + `useRcvTransport`

**Files:** Create `src/hooks/rcvTransportCore.ts`, `src/hooks/useRcvTransport.ts`; Test `src/hooks/rcvTransportCore.test.ts`.

**Interfaces:**
- Produces (core): `BASE_DWELL_MS = 1500`, `TRANSFER_DWELL_MS = 3400`, `TRANSFER_WINDOW_MS = 3000`, `clampRound(r, totalRounds)`, `roundReceivedTransfers(rounds: RCVRound[], round: number): boolean` (prev round has any `isEliminated` — round is 0-based), `dwellFor(rounds, round, reducedMotion): number`, `eliminatedIntoRound(rounds, round): string[]`.
- Produces (hook): `RcvTransport` exactly as spec §4.2 — `{ activeRound, totalRounds, isPlaying, stepDirection, justEliminatedNames, isBatch, inTransferWindow, reducedMotion, play(), pause(), stepForward(), stepBackward(), seek(round) }`; `useRcvTransport(rcvData: RCVContest | null, opts?: { initialRound?: number }): RcvTransport`.

- [ ] **Step 1: Failing test (core only — the hook is browser-gated):** pin `clampRound` bounds; `roundReceivedTransfers` false for round 0, true iff `rounds[round-1]` has an `isEliminated`; `dwellFor` = TRANSFER when transfers && !reducedMotion else BASE; `eliminatedIntoRound` returns prev round's eliminated names ([] for round 0); constants exactly 1500/3400/3000.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement core** (pure; imports only `RCVRound` type). The containment-invariant comment from `RCVRoundChart.tsx:24-33` MOVES here verbatim (it travels with the constants).
- [ ] **Step 4: Implement the hook** — state `{ activeRound, isPlaying, lastStep }`; reset effect on `rcvData` identity → `{ activeRound: clampRound(opts?.initialRound ?? 0, total), isPlaying: false }`; autoplay = the per-round setTimeout chain (transcribe `RCVRoundChart.tsx:112-124`, substituting core helpers); synchronous `stepDirection` via the adjust-during-render pattern (transcribe `:72-78` with its comment); `justEliminatedNames` = `eliminatedIntoRound(...)` held in state, cleared by a `TRANSFER_WINDOW_MS` timeout (transcribe `:95-106`); `inTransferWindow` = `justEliminatedNames.length > 0 && stepDirection === 'forward' && !reducedMotion`; `play()` restarts from 0 at the final round (`:257-264` behavior); `stepForward/stepBackward/seek` pause then clamp; `usePrefersReducedMotion` for `reducedMotion`. All callbacks `useCallback`-stable.
- [ ] **Step 5:** `pnpm test src/hooks/rcvTransportCore.test.ts` → PASS; `npx tsc -b` clean.
- [ ] **Step 6: Commit:** `feat(rcv): view-level transport hook with pure node-testable core`

---

### Task 9: RCVRoundChart controlled refactor (behavior-identical)

**Files:** Modify `src/components/charts/RCVRoundChart.tsx`, `src/views/Elections/Elections.tsx` (chart call site + old round state only).

**Interfaces:**
- Consumes: `RcvTransport` (Task 8). New chart props: `{ rcvData, candidateColors, width?, transport: RcvTransport }` — `currentRound`/`onRoundChange` DELETED (Elections.tsx is the sole consumer, verified).

**Edit map (RCVRoundChart.tsx, against the current file):**
- Delete lines 30-33 (constants — now imported from `rcvTransportCore`), 45-58 (internalRound/isPlaying/justEliminated state + setActiveRound), 72-78 (stepDirection block), 95-106 (justEliminated effect), 112-124 (autoplay effect).
- Substitute throughout: `activeRound` → `transport.activeRound`; `isPlaying` → `transport.isPlaying`; `stepDirection` → `transport.stepDirection`; `prefersReducedMotion` → `transport.reducedMotion` (drop the direct `usePrefersReducedMotion` import); `justEliminated` → derived `const justEliminated = transport.justEliminatedNames.length > 0 ? { names: transport.justEliminatedNames, isBatch: transport.isBatch } : null` (keeps every downstream reference compiling unchanged, including reduced-motion glow behavior); `showRibbons` (line 190) → `ribbonSequenceActive && transport.inTransferWindow`.
- Transport buttons (lines 246-302): prev → `transport.stepBackward()`; play/pause → `transport.isPlaying ? transport.pause() : transport.play()`; next → `transport.stepForward()`; bubbles → `transport.seek(i)`; keyboard handler (223-231) → `transport.stepBackward()/stepForward()`.
- In `Elections.tsx`: delete `rcvActiveRound` state (line 69) and its reset effect (165-167); create `const rcvTransport = useRcvTransport(rcvData ?? null)` near the other hooks; chart call site (695-707): pass `transport={rcvTransport}`, remove `currentRound`/`onRoundChange`. Keep the `key={...}` remount (line 697).

- [ ] **Step 1:** Apply the edit map. **Step 2:** `npx tsc -b` clean; `pnpm test` green.
- [ ] **Step 3: Parity check (browser gate — required, no automated seam exists):** run `pnpm build && pnpm preview` via the tarmac-approved path (ask the controller if a preview server is needed — do NOT `pnpm dev` via Bash); the CONTROLLER performs the live DOM probes at `/elections?election=20241105&race=mayor`: opens on R1; autoplay dwells ~1.5s base / ~3.4s on transfer rounds; ribbons only on forward steps; keyboard arrows step; race switch resets to R1; play at final round restarts from 0. This step's completion is reported as "awaiting controller browser QA" — do not self-certify.
- [ ] **Step 4: Commit:** `refactor(rcv): RCVRoundChart fully controlled by the shared transport`

---

### Task 10: Lens leaf + data hooks

**Files:** Create `src/views/Elections/rcvLens.ts`, `src/views/Elections/useReplayModel.ts`; Modify `src/hooks/useElectionResults.ts`; Test `src/views/Elections/rcvLens.test.ts`.

**Interfaces:**
- Produces: `RcvLens = 'replay' | 'coalition' | 'whatif'`, `ALL_LENSES`, `SHIPPED_LENSES: readonly RcvLens[] = ['replay']`, `parseLens(raw: string | null): RcvLens | null` (null for unknown AND for known-but-unshipped values); `useCVRManifest(dateCode: string | null)`, `useCVRBallots(dateCode: string | null, raceId: string | null, enabled: boolean)` (both `useStaticJSON`-based, null-URL gated); `useReplayModel(artifact: CVRBallotArtifact | null, rcvData: RCVContest | null): { ballots, tab, states } | null`.

- [ ] **Step 1: Failing test** (`rcvLens.test.ts`): `parseLens('replay')` → `'replay'`; `parseLens('coalition')` → null (known but unshipped — deep links degrade); `parseLens('garbage')`/`parseLens(null)` → null; `ALL_LENSES` has all three; `SHIPPED_LENSES` ⊆ `ALL_LENSES`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `rcvLens.ts` (leaf). Then the hooks:

```ts
// append to src/hooks/useElectionResults.ts
export function useCVRManifest(dateCode: string | null) {
  return useStaticJSON<CVRManifest>(
    dateCode ? `/data/elections/results/${dateCode}/cvr/_manifest.json` : null,
  )
}
/** The multi-MB ballot artifact — enabled ONLY on lens entry (gate the
 *  FETCH, not just the DOM). Callers must identity-guard (dateCode+raceId)
 *  against the stale-previous-data window, same as usePrecinctRace. */
export function useCVRBallots(dateCode: string | null, raceId: string | null, enabled: boolean) {
  return useStaticJSON<CVRBallotArtifact>(
    enabled && dateCode && raceId ? `/data/elections/results/${dateCode}/cvr/${raceId}.json` : null,
  )
}
```

`useReplayModel` (`src/views/Elections/useReplayModel.ts`):

```ts
import { useMemo } from 'react'
import type { CVRBallotArtifact, RCVContest } from '@/types/elections'
import { decodeBallots } from '@/lib/rcv/ballots'
import { computeReplayRounds } from '@/lib/rcv/replay'
import { tabulate } from '@/lib/rcv/tabulate'

/** decode → tabulate → project, once per race artifact (~30ms for mayor).
 *  The reconciliation test proves tab.contest === the committed rcvData,
 *  so the chart keeps rendering rcvData while the map consumes states. */
export function useReplayModel(artifact: CVRBallotArtifact | null, rcvData: RCVContest | null) {
  return useMemo(() => {
    if (!artifact || !rcvData || artifact.raceId !== rcvData.raceId) return null
    try {
      const ballots = decodeBallots(artifact)
      const tab = tabulate(ballots, { raceId: artifact.raceId, title: artifact.title, candidates: artifact.candidates })
      return { ballots, tab, states: computeReplayRounds(ballots, tab) }
    } catch (err) {
      console.error('[replay] model build failed', err)
      return null
    }
  }, [artifact, rcvData])
}
```

- [ ] **Step 4:** tests PASS; `npx tsc -b` clean. **Step 5: Commit:** `feat(rcv): lens registry + CVR data hooks + replay model memo`

---

### Task 11: `replayFill` + `FLIP_LIFT` + the `replay` paint branch

**Files:** Modify `src/views/Elections/map/precinctPaint.ts`, `src/views/Elections/map/precinctJoin.ts`; extend `precinctPaint.test.ts` / `precinctJoin.test.ts`.

**Interfaces:**
- Produces: `replayFill(leader: PrecinctLeader, colorMap, quartiles, drainShare): Fill` (precinctPaint); `FLIP_LIFT = 0.12` (exported from precinctJoin beside the existing `SELECT_LIFT`/`MAX_OPACITY`); `BuildPrecinctOptions.replay?: { rows: Record<string, ReplayPaintRow>; round: number; totalRounds: number; lift: boolean }`.

- [ ] **Step 1: Failing tests.**
  - precinctPaint: `replayFill(leader, map, q, 0)` deep-equals `resultsFill(leader, map, q)` (the R1 paint-identity pin); `replayFill(..., 0.3)` returns the same opacity with `color === mixHex(base, '#d4c8a8', 0.3)`; drain is capped at 0.5 (`drainShare 0.9` → mix t 0.5).
  - precinctJoin: with `opts.replay` set — (a) the replay branch preempts `focusCandidate` (pass both; expect replay paint); (b) a turnout label missing from `replay.rows` is skipped (unpainted); (c) `flipped && lift` adds `FLIP_LIFT` capped at `MAX_OPACITY`; (d) quartiles are computed from replay rows over turnout-joined labels only (feed a suppressed-id row that must not shift them — it has no turnout label so it can't); (e) tooltip phrase is `«Name» — NN% of ballots still counting here` and `votes` = the row's continuing total.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.**
  - `precinctPaint.ts`: `import { mixHex } from '@/utils/colorMix'`; add after `resultsFill`:

```ts
/** REPLAY: leader steps + drain — pigment fades toward the paper anchor as
 *  the precinct's ballots stop counting (tonal-age-ramp vocabulary). Capped
 *  at 0.5 so hue never fully vanishes. drainShare 0 ≡ resultsFill exactly
 *  (the round-1 paint-identity pin). */
export function replayFill(
  leader: PrecinctLeader,
  colorMap: Map<string, string>,
  quartiles: [number, number, number] | null,
  drainShare: number,
): Fill {
  const base = resultsFill(leader, colorMap, quartiles)
  if (drainShare <= 0) return base
  return { color: mixHex(base.color, '#d4c8a8', Math.min(drainShare, 0.5)), opacity: base.opacity }
}
```

  - `precinctJoin.ts`: import `replayFill` + `ReplayPaintRow` type; `export const FLIP_LIFT = 0.12` beside `SELECT_LIFT` (line 46); extend `BuildPrecinctOptions` with the `replay?` member (doc: "when set, the fill is lens-driven; preempts focusCandidate — a deep link carrying both paints replay"); in the precompute block, when `opts.replay` is set compute quartiles from replay rows over turnout labels (mirror lines 91-99 with `opts.replay.rows[label]`); in the mode dispatch insert the replay branch FIRST (before the `mode === 'turnout' || !bundle.race` arm):

```ts
if (opts.replay) {
  const row = opts.replay.rows[label]
  if (!row || row.total === 0) continue
  const leader = leaderOf(row.votes)
  if (!leader) continue
  fill = replayFill(leader, colorMap, replayQuartiles, row.drainShare)
  if (row.flipped && opts.replay.lift) {
    fill = { ...fill, opacity: Math.min(MAX_OPACITY, fill.opacity + FLIP_LIFT) }
  }
  tipLeaderName = leaderDisplayName(leader.name)
  tipLeaderPhrase = `${Math.round(leader.share * 100)}% of ballots still counting here`
  votes = row.total
} else if (mode === 'turnout' || !bundle.race) {
```

  (Note: the tooltip layer renders `tipLeaderName` + `tipLeaderPhrase` — verify the phrase composes as `«Name» — NN%…` at the tooltip template and adjust the phrase string to exclude the name if the template prepends it.)
- [ ] **Step 4:** tests PASS; `npx tsc -b` clean. **Step 5: Commit:** `feat(rcv): replay paint branch — leader steps + drain + flip lift`

---

### Task 12: Elections wiring — lens strip, URL grammar, map threading

**Files:** Modify `src/views/Elections/Elections.tsx`, `src/views/Elections/map/PrecinctFillLayer.tsx`.

**Interfaces:**
- Consumes: everything from Tasks 8–11.
- Produces: working REPLAY lens end-to-end.

**Edit map (Elections.tsx):**
1. Imports: `parseLens`, `SHIPPED_LENSES` from `./rcvLens`; `useCVRManifest`, `useCVRBallots` from `@/hooks/useElectionResults`; `useReplayModel` from `./useReplayModel`; `replayPaintRows` from `@/lib/rcv/replay`.
2. Lens state (near the other URL params, ~line 60):

```ts
const rcvLens = parseLens(searchParams.get('lens'))
const { data: cvrManifest } = useCVRManifest(activeElection)
const lensAvailable = Boolean(
  activeRace?.isRCV && cvrManifest?.races[activeRace.id] && !timeMachineActive,
)
const activeLens = lensAvailable ? rcvLens : null
const setLens = useCallback((lens: RcvLens | null) => {
  setSearchParams((next) => {
    if (lens) next.set('lens', lens)
    else next.delete('lens')
    next.delete('round') // deleted on EVERY lens change (spec §4.1)
    return next
  }, { replace: true })
}, [setSearchParams])
```

3. Transport seeding + `?round=`: `useRcvTransport(rcvData ?? null, { initialRound: initialRound })` where `initialRound` = (lens active at mount && `?round=` present) ? parsed−1 : undefined — read ONCE via a `useRef` initializer, never re-applied. Settled-position writes: an effect on `[rcvTransport.activeRound, rcvTransport.isPlaying, activeLens]` — when `activeLens === 'replay' && !rcvTransport.isPlaying`, write `round = String(activeRound + 1)` `{ replace: true }`; when `activeLens === null` and the param exists, delete it. Never write while `isPlaying`.
4. Focus precedence: `activeFocusCandidate` (line ~259) gains `&& activeLens === null`.
5. Param hygiene: `setSelectedRace` (~83-91) and the election picker (~504-515) each additionally `next.delete('lens'); next.delete('round')`.
6. Base-mode supersedence: mode-strip buttons (527-542) — while `activeLens !== null` render all three unhighlighted; `onClick` calls `setLens(null)` before/with `setMapMode(...)`.
7. Lens strip (immediately after the mode strip, same segmented container register): rendered only when `lensAvailable`; nano `RCV` badge chip (reuse the `:645-647` register) + one button per `SHIPPED_LENSES` labeled `Replay`; active = the ochre idiom `bg-ochre-500/15 text-ink dark:text-paper-100`; inactive matches the mode-strip inactive classes; `onClick={() => setLens(activeLens === 'replay' ? null : 'replay')}`. Add `flex-wrap` to the header's button cluster container.
8. Replay data + paint threading:

```ts
const { data: cvrArtifactRaw } = useCVRBallots(
  displayDateCode, activeRace?.id ?? null, activeLens === 'replay',
)
const cvrArtifact =
  cvrArtifactRaw?.dateCode === displayDateCode && cvrArtifactRaw?.raceId === activeRace?.id
    ? cvrArtifactRaw : null   // stale-during-refetch identity guard
const replayModel = useReplayModel(cvrArtifact, rcvData ?? null)
const replayRows = useMemo(
  () => replayModel && cvrArtifact
    ? replayPaintRows(replayModel.states, rcvTransport.activeRound, cvrArtifact)
    : null,
  [replayModel, cvrArtifact, rcvTransport.activeRound],
)
const replayOption = activeLens === 'replay' && replayRows && rcvData
  ? { rows: replayRows, round: rcvTransport.activeRound + 1, totalRounds: rcvData.rounds.length, lift: rcvTransport.inTransferWindow }
  : undefined
```

   Thread `replayOption` through `PrecinctFillLayer` (new optional prop) into `buildPrecinctFeatures(opts)`. While `activeLens === 'replay'` but `replayRows` is still null (artifact loading), the map keeps painting the base mode — progressive, never blank.
9. RCV panel: wrap the existing panel body in `switch (activeLens)` — `null` arm = current content unchanged (Rounds/Flow toggle + charts); `'replay'` arm = the chart on the shared transport with the Rounds/Flow toggle HIDDEN (Flow is round-blind); collapsed chip text gains `· R{round}/{total}` when the lens is active.

- [ ] **Step 1:** Apply. **Step 2:** `npx tsc -b` + `pnpm test` green.
- [ ] **Step 3:** Report "awaiting controller browser QA" for: lens button appears only on RCV races of 20241105; entering Replay fetches the artifact (Network tab) and repaints per round-step; chart↔map stay in sync during autoplay; flipped precincts lift inside the transfer window; backward steps snap; `?lens=replay&round=9` cold-load opens paused mid-count; `?lens=replay&candidate=DANIEL%20LURIE` paints replay (not the focus ramp); TM entry suspends the lens and exit restores it; base-mode click exits the lens.
- [ ] **Step 4: Commit:** `feat(rcv): REPLAY lens — lens strip, URL grammar, transport-driven precinct map`

---

### Task 13: Legend replay variant + disclosures

**Files:** Modify `src/views/Elections/map/PrecinctLegend.tsx`, `src/views/Elections/Elections.tsx` (legend call site).

**Interfaces:** New optional prop `replayState?: { round: number; totalRounds: number; continuing: { name: string; votes: number; pct: number }[]; drainPct: number; withheldCount: number }` — when set, the legend renders the replay variant; all other props/modes unchanged.

- [ ] **Step 1:** Implement the variant: eyebrow `ROUND {round} OF {totalRounds}` (rule-leading micro-label idiom) over the race title; top-5 `continuing` rows (pigment dot + surname via `leaderDisplayName` + `pct`), NON-interactive (no focus handlers in replay); when `drainPct > 2` a paper-500 swatch row `No longer counting — ballots with no remaining choices`; a `text-nano` footer line `13 small precincts withheld by S.F. — ballots still count citywide` with the count from `replayState.withheldCount` (never hardcoded — Elections computes it as `cvrArtifact.sovSuppressed.length`). Elections builds `replayState` from `rcvData.rounds[activeRound]` (top-5 continuing by votes, pct = certified `percentage`) + citywide drain from the round buckets (`(exhausted + overvotes − rounds[0].overvotes) / rounds[0].continuingTotal`).
- [ ] **Step 2:** `npx tsc -b` clean; visual check rides Task 14's QA.
- [ ] **Step 3: Commit:** `feat(rcv): replay legend — round eyebrow, continuing top-5, drain + withheld disclosures`

---

### Task 14: Full verification

- [ ] **Step 1:** `pnpm test` — entire suite green (incl. reconciliation, transport core, paint pins).
- [ ] **Step 2:** `npx tsx scripts/build-cvr-ballots.ts --check` → clean (committed artifacts match a rebuild).
- [ ] **Step 3:** `~/dev/devman/tools/devman-build.mjs pnpm build` → green (this is the deploy-blocking gate; `tsc -b` incremental false-passes are known — the full build is ground truth).
- [ ] **Step 4:** Controller browser QA (the render-feature gate) on `vite preview`: the Task 9 + Task 12 probe lists, plus reduced-motion (`prefers-reduced-motion` emulation: no ribbons, no lift, base dwell) and non-CVR elections (no lens strip on 20220607).
- [ ] **Step 5:** Push branch; open PR titled `RCV CVR skin PR 1 — ballot pipeline + reconciliation gates + REPLAY lens`.

## Self-review notes

- Spec coverage: §3.1→T1/T7, §3.2→T2, §3.3→T5/T6/T7, §3.5-replay→T3, §3.6→T10, §4.1→T10/T12, §4.2→T8/T9, §4.3→T11/T12/T13, §6→T14. COALITION/WHAT-IF sections are PR 2/3 by design.
- The `?round=`-ignored-without-lens rule lands via Task 12's read gate (initialRound only when lens active) — the chart's open-on-R1 rule is otherwise untouched.
- Type drift check: `ReplayPaintRow`/`replayPaintRows` names consistent across T3/T11/T12; `RcvTransport` consistent across T8/T9/T12; `CVRManifest.races` is a Record everywhere (never `.some()`).
