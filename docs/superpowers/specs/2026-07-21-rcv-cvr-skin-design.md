# RCV CVR Skin — Design Spec

**Date:** 2026-07-21 · **Status:** approved (Jesse, in-session 7/20–7/21)
**Pipeline:** brainstorm (interactive 7/20, banked in memory `rcv-cvr-exploration`) → recon
fan-out → two-plane design → adversarial critique (3 reviewers, all SOUND-WITH-FIXES) → this
spec. Delivery: three staged PRs, live QA between each.

## 1. What we're building

**One stage, one clock, three lenses.** For RCV races with Cast Vote Record data, the
Elections view grows a lens strip — `Replay · Coalition · What-if` — that turns the certified
precinct map into an interactive ranked-choice instrument:

- **REPLAY** — the fabric unfolding: at round K every ballot sits with its highest-ranked
  continuing candidate, so every precinct has a round-state leader. Step or autoplay the
  rounds and watch the city re-sort as candidates fall.
- **COALITION** — second-choice geography: pick a candidate and precincts paint by where that
  candidate's first-choice voters go next; plus a head-to-head card no round report can
  answer.
- **WHAT-IF** — strike candidates from the roster and re-tabulate the same ballots client-side
  in milliseconds; precincts whose final winner differs from reality get a terracotta
  emphasis outline. Nothing like it exists on the public internet.

The **master clock** is the RCV chart's transport (PR #131) promoted to a view-level hook; the
map subscribes to the same round state the chart plays.

**Self-proving architecture:** every lens computes from one committed ballot artifact per
race, through the same pure tabulator the build gate proves against the certified round report
— which DataDiver already commits as `public/data/elections/results/20241105/rcv/<raceId>.json`.
If our from-scratch tabulation of 410,105 raw mayor ballots reproduces all 14 certified rounds
exactly, every lens runs on demonstrably correct machinery.

### Product decisions (locked)

1. **Ship-ballots**: one compact artifact per race; all lenses compute client-side. The raw
   296MB CVR zip stays gitignored local (the sov.xlsx pattern); a build script emits committed
   JSON.
2. **Scope**: all 10 Nov 2024 races with certified round reports. Treasurer stays pinned
   known-missing (CVR carries its ballots; SF published no certified rounds to gate against).
3. **Staged PRs**: PR 1 pipeline + REPLAY · PR 2 COALITION · PR 3 WHAT-IF. Each lands usable.
4. **Certified-only** vintage (~4-week latency; preliminary snapshots are a possible future
   election-week feature).
5. **Coalition cohort** = ballots ranking the candidate FIRST ("X's voters"); ranked-anywhere
   variant deferred.
6. **The 13 SOV-withheld precincts stay unpainted in every lens** (SF's ballot-secrecy
   discipline); their ballots still count in every citywide figure, disclosed in the legend.

## 2. Verified ground truth

All facts below were verified live (recon 7/20; critique probes 7/21) — sources cited in the
recon/critique transcripts; the load-bearing ones re-verified against committed repo data.

### The CVR source

- Certified export: `https://www.sfelections.org/results/20241105/data/20241203/CVR_Export_20241202143051.zip`
  — 296,395,166 bytes; ~5.02GB uncompressed; **27,554 `CvrExport_N.json`** batch files + 15
  manifest/config files; Dominion Democracy Suite 5.10.50.85. SF publishes a SHA-512 checksum
  CSV alongside (`20241202_sha512.csv` in the same directory).
- Record shape (verified against the real zip — the SF format PDF omits the `Cards` layer):
  `Session { TabulatorId, BatchId, RecordId, CountingGroupId, Original { PrecinctPortionId,
  BallotTypeId, IsCurrent, Cards: [{ Contests: [{ Id, Overvotes, Undervotes, Marks: [{
  CandidateId, Rank, IsAmbiguous, IsVote, OutstackConditionIds, WriteinIndex? }] }] }] },
  Modified? {...} }`. `Modified` exists only for adjudicated ballots; **the element with
  `IsCurrent: true` is the tabulated state** — use `Modified` when present.
- Mark filter: `IsVote === true && IsAmbiguous === false`. `MarkDensity` is absent
  (`IncludeMarkDensity: false` in the export config).
- Ballot → precinct: `PrecinctPortionId` → `PrecinctPortionManifest.Description` `"PCT 1101"`
  (`ExternalId` `"1101-1"`); 514 portions ↔ 514 precincts 1:1 for this election. The manifest
  `Id` is an internal machine id; the human precinct number joins our emitted `prec_2022`
  geometry `id`.
- 11 contests have `NumOfRanks > 1`: mayor (Id 18) = 10 ranks; supervisors D1=5 D3=6 D5=5
  D7=4 D9=7 D11=7; City Attorney / DA / Sheriff / Treasurer = 3.
- `CountingGroupId`: 1 = Election Day, 2 = Vote by Mail (not used in v1; not shipped in the
  artifact).

### Official tabulation rules (SF Charter §13.102, operative text verified)

- **Overvote** (≥2 different candidates at one rank): "the ballot shall be declared exhausted
  when such multiple rankings are reached" — counts normally at earlier ranks, exhausts AT the
  overvote. A property of the ballot as cast — roster-independent.
- **Skipped rank(s)**: "transferred to that voter's next ranked choice" — any number of skips
  jump to the next indicated ranking. SF has NO two-consecutive-skips exhaustion rule.
- **Duplicate ranking of one candidate**: first ranking counts, later ones disregarded
  (Dept. of Elections operational rule; Charter silent).
- **Exhausted**: all choices eliminated or no more choices indicated.
- **Elimination**: fewest first choices, one per round. The Charter also allows a sum-of-tail
  batch elimination (bottom group combined < next-highest) — legal but UNUSED in the certified
  Nov 2024 reports; we implement single sequential elimination only.
- **Qualified write-ins** are named candidates (mayor: LIN, ROTH — eliminated first).
  Unresolved write-in marks (`Type: 'Writein'`) can never receive votes.
- **Ties**: "resolved in accordance with State law" (by lot, CA Elec. Code §15651);
  elimination-tie procedure is not codified. **No minimum-vote tie occurs anywhere in the
  certified Nov 2024 data** (verified across all 10 races).

### Certified round-report semantics (probed from committed `rcv/mayor.json`)

- Grand total `continuingTotal + exhausted + overvotes + blanks` = **410,105, constant across
  all 14 rounds**.
- `blanks` (18,540) is **constant** every round — ballots with no valid RCV marks at all.
- `overvotes` is **cumulative and grows** (1,381 → 2,229): overvote-exhaustion accrues to the
  overvotes bucket, NOT to `exhausted`.
- `exhausted` is cumulative from 0 — elimination-exhaustion only.
- `transfer[r] = votes[r+1] − votes[r]` (the round-r Transfer column describes the delta
  LEAVING round r; final round all zeros; an eliminated candidate's last live round carries
  `−votes`).
- `percentage = Math.round(votes / continuingTotal * 10000) / 10000`.
- Candidate row order = descending round-1 votes. All 10 races run until exactly 2 candidates
  remain.
- `isEliminated` on a round describes who is removed STARTING NEXT round (the rcvFlow.ts
  contract).

### The SOV ≠ round-1 gap (critical; discovered by the critique pass)

The precinct SOV (`precincts/<raceId>.json`) tallies **as-cast rank-1 marks**; the certified
RCV round 1 tallies **effective first choices** after skip/duplicate/unresolved-write-in
collapse. Verified for mayor: Σ 501 published SOV rows = 388,163 (incl. a 4-vote generic
`Write-in` row); full dsov = 389,087; certified R1 continuing = 390,184. ~1,100 ballots
citywide are promoted to a different first choice by resolution; 983 ballots live in the 13
SOV-withheld precincts. **Consequence: any precinct-grain gate must compare as-cast marks
with as-cast marks (Gate B), and replay round 1 is *visually continuous* with results mode,
not bit-identical.**

### Independent cross-check

ranked.vote (open-source CVR pipeline, reports for SF mayor + D1–D11) **condenses rounds**
(~4 vs certified 14) — usable for winners, first-choice totals, final-round splits, and the
Condorcet check (mayor: LURIE) ONLY. The certified round pages are the sole round-sequence
ground truth.

## 3. Data plane

### 3.1 Ballot artifact

Path: `public/data/elections/results/<dateCode>/cvr/<raceId>.json` + sidecar
`cvr/_manifest.json` (the `_turnout.json` sidecar convention; `index.json` is untouched — the
legacy network-refetching generator owns it).

```ts
// src/types/elections.ts additions
export const OVERVOTE_TERMINATOR = -1

export interface CVRBallotArtifact {
  formatVersion: 1                 // literal; breaking decode change bumps it and regenerates ALL artifacts in the same PR
  dateCode: string
  raceId: string                   // committed round-file raceId ("mayor", "member-board-of-supervisors-district-1")
  title: string                    // round-file title verbatim
  /** Certified round-report names VERBATIM, in the committed round file's
   *  round-1 row order (descending R1 votes). Pattern values index here.
   *  Already clean — cleanCandidateName is a no-op; buildCandidateColorMap
   *  keys match. */
  candidates: string[]
  /** Emitted-geometry id strings ("1101"), sorted ascending. Includes the
   *  SOV-withheld precincts — their ballots are in the public CVR. */
  precincts: string[]
  /** Subset of precincts with no _turnout/SOV row (13 for 20241105).
   *  Derived from data, never hardcoded. */
  sovSuppressed: string[]
  /** Canonical effective rankings: candidate indices; a trailing
   *  OVERVOTE_TERMINATOR means exhaust-by-overvote at that point; [] = blank
   *  contest. Sorted by citywide count desc, then lexicographic (common
   *  patterns get short indices; deterministic for --check). */
  patterns: number[][]
  /** Flat (precinctIdx, patternIdx, count) triples, sorted by
   *  (precinctIdx, patternIdx). Client wraps in typed arrays. */
  groups: number[]
}

export interface CVRManifest {
  dateCode: string
  formatVersion: 1
  races: Record<string, { ballots: number; patterns: number; groups: number; bytes: number }>
  /** isRCV races with CVR ballots but no certified round report to gate
   *  against — mirrors KNOWN_MISSING_RCV. ["treasurer"] today. */
  reconciliationBlocked: string[]
}
```

**Mark resolution happens ONCE, in the generator.** Canonical effective rankings are
roster-independent (proof: overvotes exhaust at their rank under every roster per the Charter;
duplicates keep first occurrence regardless of roster; skips collapse unconditionally), so
WHAT-IF re-tabulation over canonical patterns is exact. Rankings are NOT truncated to what the
real count reached — WHAT-IF needs the deep ranks. Resolution algorithm per session: take the
`IsCurrent: true` element; locate the contest across `Cards[].Contests[]` (throw if a
ContestId appears on >1 card of one session); filter marks `IsVote && !IsAmbiguous`; walk
ranks 1..NumOfRanks: no marks → skip; ≥2 marks with different CandidateIds → append
terminator, stop; two marks same candidate = one mark, not an overvote; unresolved write-in →
skip rank (gate-arbitrated, see §3.4 discoveries); candidate already in sequence → skip; else
append. `OutstackConditionIds` are never used for resolution — only logged as histograms for
gate forensics.

**Precinct keying:** emitted geometry ids. For 20241105, `_turnout` labels ≡ ids (verified:
501 single-id rows, zero consolidated). The replay adapter feeds rows through the existing
`_turnout`-label paint loop (`precinctJoin.ts` — which is also what keeps the 13 withheld
precincts unpainted for free). A future consolidated-label election needs an ids→label rollup
in the adapter — noted, not built.

**Size budget:** mayor ≈ 3.5–4.5MB compact JSON ≈ 0.6–0.9MB brotli on the wire (Vercel serves
brotli for static assets) — wire-peer of the 1.0MB neighborhoods geojson; all 10 races ≈
5.5–7MB committed. Binary/base64 packing rejected: breaks `--check` byte-compare ergonomics,
human inspectability, and `useStaticJSON`.

### 3.2 Tabulator — `src/lib/rcv/`

Pure leaf modules (node-only Vitest; zero DOM/store imports — the `typeScale.ts` precedent),
shared verbatim by the generator (run via `npx tsx`, the `build-election-archive.ts`
precedent) and the browser: **the code the gate proves is the code readers run.**

```ts
// src/lib/rcv/ballots.ts
export interface DecodedBallots {
  candidateCount: number
  precinctCount: number
  patternCount: number
  patternFlat: Int16Array   // concatenated pattern entries (incl. -1 terminators)
  patternStart: Int32Array  // patternCount+1 offsets into patternFlat
  groupPrecinct: Int32Array
  groupPattern: Int32Array
  groupCount: Int32Array
  patternTotal: Int32Array  // citywide count per pattern — head-to-head input
  totalBallots: number      // Σ groupCount; mayor = 410,105
}
export function decodeBallots(artifact: CVRBallotArtifact): DecodedBallots
// throws `Unsupported CVR artifact formatVersion ${n}` on unknown versions

// src/lib/rcv/tabulate.ts
export const ASSIGN_EXHAUSTED = -1
export const ASSIGN_OVERVOTED = -2
export const ASSIGN_BLANK = -3

export class RCVTieError extends Error { round: number; tied: string[] }

export interface TabulateOptions {
  /** Eliminate-first order for exact minimum-vote ties. Absent + tie →
   *  throw RCVTieError. Populated only from TIE_ORDER_PINS (certified) at
   *  build time, or from what-if's deterministic ladder. */
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
  contest: RCVContest             // EXACTLY the committed rcv/<raceId>.json shape
  assignments: RoundAssignment[]  // parallel to contest.rounds — the lens feed
  eliminationOrder: string[]
}

export function tabulate(
  ballots: DecodedBallots,
  meta: { raceId: string; title: string; candidates: string[] },
  options?: TabulateOptions,
): TabulationOutput
```

**Bucket semantics** (docstring + test-pinned so `contest` can EQUAL the certified report):
`continuingTotal[r]` = Σ candidate votes · `blanks` = empty-pattern groups, constant ·
`overvotes[r]` = CUMULATIVE ballots whose cursor has hit the terminator by round r (R1
includes `[-1]`-leading patterns) · `exhausted[r]` = CUMULATIVE elimination-exhaustion; ≡ 0 at
R1 **for `struck: []` only** (all-struck patterns legitimately exhaust at R1 under WHAT-IF —
they had valid marks, so they are never blanks) · `percentage` = certified rounding above ·
`transfer[r] = votes[r+1] − votes[r]`, final round 0 · `isEliminated` on the LAST round the
candidate holds votes · `isLeader` = max votes · conservation `continuingTotal[r] +
exhausted[r] + overvotes[r] + blanks === totalBallots` ∀r.

**Policies:** single sequential elimination (fewest votes among not-yet-eliminated, including
zero-vote candidates); stop when 2 candidates remain; minimum-vote tie → **throw
`RCVTieError`** — the build fails loudly; the only fix is an explicit entry in a frozen
`TIE_ORDER_PINS: Record<'dateCode/raceId', string[]>` transcribed from the certified report,
never a guess. Ships EMPTY (no tie exists in Nov 2024), with a Vitest pin that it STAYS empty
for 20241105. Qualified write-ins are ordinary candidates. Emitted candidate order =
`meta.candidates` order; the gate compares by name with a separate order assertion.

**Runtime:** initial assignment ~230k groups × ≤3 pattern steps; per round only the
eliminated candidate's groups advance. Mayor full tabulation < 20ms; supervisors < 2ms.

### 3.3 Generator + fetch

**`scripts/fetch-cvr-sources.mjs`** — frozen `CVR_SOURCES = Object.freeze({ '20241105':
{ zip: <certified URL above>, sha512Csv: <CSV URL> } })`; downloads to gitignored
`data/elections-src/cvr/20241105/` (existing `.gitignore` pattern covers the subdir —
verified); skip-if-exists; computes SHA-512 of the local zip and verifies against SF's
published CSV — **throws on mismatch or missing row**.

**`scripts/build-cvr-ballots.ts`** (via `npx tsx`; imports `src/lib/rcv/tabulate.ts`
directly):

- Reads the 296MB zip **in place** — generalized central-directory walk (the `unzipXlsx`
  precedent: same header checks, loud throws; explicit zip64/entry-count guards) +
  `zlib.inflateRawSync` one `CvrExport_N.json` at a time (~180KB each). Peak memory ≈ zip
  buffer + one inflated file + accumulators. No 5GB pre-extraction.
- CLI mirrors `build-election-results.mjs`: `--check` (rebuild in memory, byte-compare
  `JSON.stringify` against every committed `cvr/*.json` + `_manifest.json` — sound because
  every array has a pinned deterministic sort), `--self-test` (perturb one group count by +1,
  assert the gate CATCHES it), `--date <dateCode>`, `--race <raceId>`. Compact JSON, no
  indent. `check(condition, msg)` throw primitive; `main().catch` → `process.exitCode = 1`.

**Gate ladder** (per race; every rung throws):

- **Gate A — self-proving:** `tabulate(decodeBallots(artifact), meta)` deep-equals the
  committed `rcv/<raceId>.json` (parse the committed file — it was written with indent 2 —
  then compare normalized). Every round, every candidate field, every bucket. By-name
  matching + order assertion.
- **Gate B — precinct grain (as-cast):** per-precinct **as-cast rank-1 mark tallies** —
  computed during parsing, BEFORE canonicalization (canonical patterns destroy skip
  information) — must equal the committed `precincts/<raceId>.json` SOV rows for the 501
  published precincts (the generic `Write-in` row = unqualified rank-1 write-in marks; names
  joined via `candidateKey()` normalization), and the 13 withheld precincts' as-cast tallies
  must equal the certified suppressed residual (dsov − sov). NEVER compare SOV to effective
  first choices (verified impossible: 2,021-vote semantic gap). Exact SOV counting semantics
  are a Task-0 probe + gate-arbitrated discovery with this stated first-try.
- **Gate C — roster/join:** candidateKey bijection between CVR candidates (Regular +
  QualifiedWriteIn, non-Disabled, for the ContestId) and the round file's R1 candidates; emit
  round-file spellings verbatim ("AHSHA SAFAÍ" keeps its accent); CVR precinct-id set equality
  vs prec-2022 geometry (514 = 514), with a build-time fallback if the CVR turns out to redact
  withheld precincts.
- **Gate D — accounting:** `totalBallots === continuingTotal[0] + overvotes[0] + blanks` and
  the conservation identity ∀r (mayor 410,105).

**Treasurer:** frozen exported `RECONCILIATION_BLOCKED = Object.freeze(['20241105/treasurer'])`
— generator skips it; `_manifest.reconciliationBlocked` discloses it; bidirectional Vitest pin
(the `KNOWN_MISSING_RCV` idiom): artifact must NOT exist, and if a certified treasurer round
file ever appears the test fails with unblock instructions.

**Standing reconciliation test** — `src/lib/rcv/reconciliation.test.ts` re-runs Gate A from
the committed files on every `pnpm test`, forever: decode all committed artifacts → tabulate →
deep-equal committed `rcv/*.json` (<2s). Catches any future tabulator refactor. The strongest
honesty guarantee in the design.

### 3.4 Gate-arbitrated build discoveries (stated first-tries; Task 0 probes them)

| # | Question | First try | Fallback |
|---|---|---|---|
| R4 | Blank contests: present as entries with empty Marks, or omitted? (mayor blanks must hit exactly 18,540) | entries-present | derive the ballot universe from `BallotTypeContestManifest` |
| R5 | Unresolved write-in mark at a rank | skip the rank | exhaust at the rank — whichever reconciles is pinned with a comment |
| R6 | `percentage` rounding on x.xx5 boundaries | half-up (verified on sampled rows) | truncate / bankers — pin whichever reproduces all 10 races |
| — | CVR coverage of the 13 withheld precincts | ballots present with real PrecinctPortionIds | if redacted/aggregated: Gate C fallback + drop the residual clause of Gate B |
| — | SOV as-cast counting semantics (Gate B) | one distinct candidate at rank 1 & IsVote → count; unqualified write-in marks → the `Write-in` row | arbitrated by Gate B with outstack histograms for forensics |

### 3.5 Lens math — `src/lib/rcv/{replay,coalition,whatIf}.ts`

Pure leaves consuming `DecodedBallots` + `TabulationOutput`.

**`replay.ts` (PR 1):**

```ts
export interface PrecinctRoundState {
  tallies: Int32Array              // candidateIdx → ballots here this round
  exhausted: number; overvoted: number; blank: number
  leader: number                   // candidateIdx, or -1 when nothing continues
  leaderShare: number              // tallies[leader] / precinct continuing
}
/** [roundIdx][precinctIdx]; ~5–10ms once for mayor, memoized. */
export function computeReplayRounds(
  ballots: DecodedBallots, tab: TabulationOutput,
): PrecinctRoundState[][]
/** Reshape one round into PrecinctRaceFile-row shape for the existing paint loop. */
export function replayVotesRecord(
  state: PrecinctRoundState[], artifact: CVRBallotArtifact,
): Record<string, { votes: Record<string, number>; total: number }>
```

Pins: **tensor column-sum invariant — Σ over ALL 514 precincts (including sovSuppressed)
=== certified `rounds[r].candidates[byName].votes` for every round × candidate** (the tensor
always sums to the chart; the visible map is 501 of 514, disclosed in the legend); per-precinct
grand total constant across rounds.

**`coalition.ts` (PR 2):** cohort = ballots whose effective FIRST choice is the focus
(`pattern[0] === focus`); second choice = `pattern[1]` (pre-deduplicated ⇒ the next different
candidate as cast); `pattern[1] === OVERVOTE_TERMINATOR` → ranked-two-at-once bucket; absent →
no-next-choice. Roster-relative ("next continuing at round k") and ranked-anywhere variants
explicitly deferred (module docstring).

```ts
export interface SecondChoiceResult {
  focus: number
  total: number                    // === certified R1 votes for focus (pinned)
  next: Int32Array; none: number; overvote: number
  byPrecinct: { total: number; next: Int32Array; none: number; overvote: number }[]
}
export function computeSecondChoices(ballots: DecodedBallots, focus: number): SecondChoiceResult

export interface HeadToHeadMatrix {
  candidates: string[]
  /** n×n among-both directional counts: ballots ranking BOTH a and b with a
   *  above b. prefersBoth[a,b] + prefersBoth[b,a] === bothRanked[a,b] —
   *  these are the numbers the copy line renders. */
  prefersBoth: Int32Array
  bothRanked: Int32Array
  /** n×n inclusive counts (b unranked counts as below a) — the Condorcet
   *  verdict input. */
  prefers: Int32Array
  condorcetWinner: number | null
}
export function computeHeadToHead(ballots: DecodedBallots): HeadToHeadMatrix
```

Iterates citywide patterns (`patternTotal`), not groups: ~20–40ms once, memoized. Pins:
cohort total ≡ certified R1 (the cross-lens anchor); Σ buckets ≡ cohort; byPrecinct sums to
citywide; `prefersBoth` sums to `bothRanked`; mayor `condorcetWinner === LURIE`.

**`whatIf.ts` (PR 3):**

```ts
export interface WhatIfResult {
  contest: RCVContest
  assignments: RoundAssignment[]
  finalByPrecinct: PrecinctRoundState[]
  changedPrecincts: string[]       // certified final leader ≠ counterfactual final leader
  winnerChanged: boolean
  tiesBroken: { round: number; tied: string[] }[]   // non-empty → banner disclosure line
}
export function tabulateWhatIf(
  ballots: DecodedBallots,
  meta: { raceId: string; title: string; candidates: string[] },
  struck: readonly number[],
  baseline: TabulationOutput,
): WhatIfResult
```

Strike semantics: struck candidates skip exactly like pre-round-1 eliminations; overvote
terminators still exhaust regardless of roster; all-struck patterns exhaust at R1 (not
blanks). Counterfactual ties (no certified pin exists) use the deterministic disclosed ladder:
candidate eliminated earlier in the REAL election goes first → a real-election finalist
survives a non-finalist → fewer R1 votes → artifact order. Pins: `struck: []` reproduces
`baseline.contest` exactly (a free second Gate A); conservation ∀r with the reduced roster;
strike-to-two collapses `totalRounds`; determinism.

### 3.6 Browser data plumbing (PR 1)

`useCVRManifest(dateCode)` / `useCVRBallots(dateCode, raceId, enabled)` on the `useStaticJSON`
null-URL lazy pattern — the artifact fetch fires ONLY on lens entry (frontpage-perf rule:
gate the fetch, not just the DOM) — with the dateCode/raceId identity guard (the documented
stale-data-during-refetch gotcha, `Elections.tsx:218` precedent). **Canonical manifest access
is the Record form: `manifest.races[raceId]`.** `useReplayModel(artifact, rcvData)` owns the
`decodeBallots → tabulate → computeReplayRounds` memoization, keyed by artifact identity. The
unbounded `useStaticJSON` module cache growing by ≤ ~6MB across all 10 artifacts is accepted
for v1.

### 3.7 Privacy stance

SF itself publishes the ballot-level CVR — full rankings joined to precinct ids — as a public
download; the artifact is a lossy aggregation (pattern groups; no session/tabulator/batch ids,
no counting groups, no image masks) and discloses strictly less than its source. Residual
discipline is UI-level: **no single-ballot storytelling** — lenses present aggregates only,
and the 13 SOV-withheld precincts stay unpainted everywhere (decision #6).

## 4. Experience plane

### 4.1 Lens model + URL grammar

A separate `rcvLens` dimension; `PrecinctMapMode = 'results' | 'turnout' | 'margin'` is
untouched.

```ts
// src/views/Elections/rcvLens.ts (leaf, node-testable)
export type RcvLens = 'replay' | 'coalition' | 'whatif'
export const ALL_LENSES: readonly RcvLens[] = ['replay', 'coalition', 'whatif']
/** Grows per PR: PR1 ['replay'], PR2 +'coalition', PR3 +'whatif'. Unshipped
 *  ?lens= values parse to null — deep links degrade gracefully. */
export const SHIPPED_LENSES: readonly RcvLens[] = ['replay']
export function parseLens(raw: string | null): RcvLens | null
```

`lensAvailable = activeRace?.isRCV && cvrManifest?.races[activeRace.id] &&
!timeMachineActive`. **Time Machine suspends** the lens (params kept — the
`activeFocusCandidate` precedent); **race/election switches delete** `lens`/`round`/`strike`
(the `setSelectedRace` hygiene pattern). While a lens is active, the base `mapMode` is
dormant-but-remembered: `?map_mode=` stays, its buttons render unhighlighted, and clicking one
deletes the lens params and reactivates the base mode.

| Param | Meaning | Lifecycle |
|---|---|---|
| `?lens=` | active lens | deleted on race/election switch + base-mode click; suspended in TM |
| `?round=K` | 1-based round (replay/whatif) | **deleted on every lens CHANGE** (whatif must open on its final round); IGNORED when no lens is active (a bare `?round=` can't defeat the chart's opens-on-R1 rule); written only on settled positions (pause/seek/step — never autoplay ticks); clamped on read |
| `?candidate=` | existing focus param, reused as COALITION input | existing lifecycle |
| `?strike=NAME` | whatif strikes, repeatable (`getAll`) | deleted leaving whatif / on race switch. Repeatable form because certified names can carry commas ("ROBERT GEORGE LUCERO, JR" exists in the corpus) |

**Focus-vs-lens precedence:** `activeFocusCandidate` gains `&& activeLens === null` —
replay/whatif suppress the focus ramp (the lens owns the fill). COALITION reads
`focusedCandidate` directly, bypassing the `mapMode === 'results'` gate. In
`buildPrecinctFeatures` the lens branch preempts the focus branch — a deep link carrying both
`?lens=replay` and `?candidate=` paints replay.

Deep-link contract: `/elections?election=20241105&race=mayor&lens=replay&round=9` cold-loads
the mayor's map mid-count at round 9, paused.

### 4.2 Master clock — `useRcvTransport`

`src/hooks/useRcvTransport.ts` lifts the chart's transport wholesale: round state, the
autoplay setTimeout chain, `BASE_DWELL_MS = 1500` / `TRANSFER_DWELL_MS = 3400` /
`TRANSFER_WINDOW_MS = 3000` (the containment invariant — adopt anim 0.55s delay + 2.2s run ⊂
window ⊂ dwell — travels with them), synchronous `stepDirection` (adjust-during-render),
`justEliminatedNames` (prev round's `isEliminated`, cleared after the window).

```ts
export interface RcvTransport {
  activeRound: number; totalRounds: number
  isPlaying: boolean
  stepDirection: 'forward' | 'backward' | 'none'
  justEliminatedNames: string[]; isBatch: boolean
  /** True for TRANSFER_WINDOW_MS after a FORWARD step into a transfer round;
   *  always false under reduced motion and on backward steps. Chart ribbons
   *  and the map's flip lift both key off this. */
  inTransferWindow: boolean
  reducedMotion: boolean
  play(): void   // restarts from 0 at final round
  pause(): void
  stepForward(): void; stepBackward(): void   // pause + clamp
  seek(round: number): void
}
export function useRcvTransport(
  rcvData: RCVContest | null,
  opts?: { initialRound?: number },   // ?round= at mount; whatif passes totalRounds-1
): RcvTransport
```

- Pure logic (dwell selection, step/clamp/seek, transfer-window arithmetic; reduced-motion as
  a parameter) extracted to **`src/hooks/rcvTransportCore.ts`** — node-testable; the hook
  wraps matchMedia + timers.
- Reset on `rcvData` identity change (replaces the `Elections.tsx:165` reset); the chart's
  key-remount stays as belt-and-suspenders.
- `RCVRoundChart` becomes fully controlled: `{ rcvData, candidateColors, width?, transport }`
  — `currentRound`/`onRoundChange`/internal round deleted (sole consumer verified). Behavior
  parity with PR #131 (dwell timing, open-on-R1, race-switch reset, keyboard stepping) is
  accepted via live-preview DOM probes (the render-feature browser gate).
- **Lens entry seeds from the transport's current settled round** — the one clock simply
  gains the map as a second subscriber; no reset, no snap. Race-switch remount still opens R1.
- Map repaints are event-paced: one `buildPrecinctFeatures` + `setData` per round change
  (Time Machine already drives the identical path at 2s/beat while scrubbing).

### 4.3 REPLAY choreography

- `BuildPrecinctOptions` gains `replay?: { round: /* adapter output */; quartiles:
  [number,number,number] | null; flipped: Set<string>; lift: boolean }`; `total` = continuing
  ballots, so leader share reads "of ballots still counting" (the certified denominator).
- **Drain**: `drainShare[r] = (exhausted[r] + overvoted[r] − overvoted[R1]) / continuing[R1]`
  per precinct — ballots that stopped counting SINCE round 1. R1 drain ≡ 0 by construction;
  blanks excluded (they never started); overvote-exhaustion joins the drain as it accrues.
  `replayFill(leader, colorMap, quartiles, drainShare)` = `resultsFill` +
  `mixHex(hex, '#d4c8a8', min(drainShare, 0.5))` — the tonal-age-ramp vocabulary (pigment
  fades toward paper, capped so hue never vanishes). `mixHex` lifts from `FlowMapLayer.tsx` to
  **`src/utils/colorMix.ts`** (duplicated-code rule), re-imported at both sites.
- **Quartiles FIXED across rounds, computed once from round-1 leader shares over PAINTED
  precincts only** (the 501 turnout-joined; excluding sovSuppressed keeps cutpoints comparable
  to results mode). Per-round recomputation rejected: other precincts moving the yardstick
  reads as phantom motion; under fixed quartiles, late-round firming is true consolidation
  signal.
- **R1 continuity is visual, not bit-identical**: replay R1 paints effective first choices;
  results mode paints SOV as-cast marks (~1,100 votes apart citywide; leader hues
  near-identical). The pinnable invariant lives at the paint layer: `replayFill(R1 state) ≡
  resultsFill(same inputs)` given drain 0. No entry fade.
- **Flip choreography (calm register, no strobing):** the round differ marks precincts whose
  leader changed; forward steps paint the new leader instantly with `FLIP_LIFT = 0.12`
  opacity lift (exported beside `SELECT_LIFT`/`MAX_OPACITY`, same 0.8 cap); one settle repaint
  drops the lift when `inTransferWindow` falls. Backward steps + reduced motion: single snap
  repaint, never lifted — mirroring the chart's semantics.
- **Legend replay variant** (`PrecinctLegend` prop): eyebrow `ROUND 9 OF 14` over the race
  title; top-5 continuing candidates with round-K shares; a paper drain swatch when citywide
  drain > 2%; a one-line count disclosure for the 13 withheld precincts ("13 small precincts
  withheld by S.F. — ballots still count citywide"). Candidate rows non-interactive in PR 1
  (round-scoped support ramp deferred).
- **CoverageChip unchanged** — its `_turnout`-derived story already matches (withheld
  precincts fall out of the paint loop for free).
- Era-crossfade machinery untouched (rounds are same-era; the `fade` multiplier still applies).

### 4.4 COALITION

- Input via `?candidate=` (legend row click / panel picker). Per precinct: dominant next
  choice among the focus candidate's first-choice voters → hue (rank-based palette keeps the
  realistic rivals distinct; minor-candidate hues appear only where they genuinely dominate —
  itself the story); dominant share → the 4-step race-relative quartile opacity ladder;
  no-next-choice → paper-500.
- **Display floor:** precincts with cohort < 10 first-choice ballots stay unpainted, and the
  legend footnote carries the ACTUAL count ("41 precincts under 10 ballots not shown") —
  disclosure matches display. The floor number is confirmed against the smallest-precinct
  cohort distribution before being test-pinned.
- **Head-to-head card in the RCV panel** (stage furniture, not DetailPanelShell): full-roster
  picker (pigment dot rows; selected row in the candidate's own pigment tint + 1px ring — no
  side bars); citywide next-choice horizontal bars in recipients' pigments + paper
  no-next-choice bar; a rival `<select>` head-to-head line; a verdict line when the focus
  beats (or loses to) every rival.
- **Precinct click** → that precinct's next-choice stacked composition bar (the CUNY lesson:
  per-precinct detail = stacked composition; flows stay citywide; never per-precinct sankeys).
- No candidate picked: map paints ordinary first-choice results; panel + legend prompt.

### 4.5 WHAT-IF

- **Strike roster in the RCV panel** (not the legend — the legend stays a decoder): one pill
  row per candidate (pigment dot + name + strike/restore toggle); struck rows line-through +
  0.4 opacity + a brick-400 "removed" tag. Toggles write/remove `?strike=`. Min 2 remaining
  (`title="Leave at least two candidates in the race"`). Striking the winner is the marquee
  gesture.
- Re-tabulation feeds the SAME `RCVRoundChart` on its own `useRcvTransport(counterfactual,
  { initialRound: totalRounds - 1 })` — **opens on the counterfactual FINAL round** ("how does
  it end"; replay's question is "how it unfolds") — key-remounted per strike set.
- Map = replay choreography on counterfactual rounds. **Divergence = a terracotta emphasis
  OUTLINE** (line layer over `changedPrecincts`, ~1.5px, the banner's pigment), rendered only
  on the counterfactual final round. NOT the hatch — house hatch means "non-comparable/
  excluded" (forward-binding memory), and flipped precincts are the most significant on the
  map. No hatch extraction; `DemographicUnderlay` untouched.
- **Counterfactual surfaces reuse the certified race's `candidateColors`** (spec + test pin) —
  color identity must stay stable across a comparison; re-deriving from counterfactual
  standings would hand the departed winner's pigment to the new winner. A documented exception
  to the color-=-standing default.
- Persistent **terracotta banner** (the TM banner slot pattern; ochre stays TM's signature;
  brick would read as an error): copy in §4.7; `Reset to reality` button clears strikes; a
  tie-broken line renders when `tiesBroken` is non-empty ("A tie was broken using the real
  election's elimination order.").
- Stat cards: Winner → "Hypothetical winner" (counterfactual name/pigment); RCV Rounds card
  subtitled "certified: 14". Turnout/Registered stay certified.

### 4.6 Panel + stage choreography

- **Lens strip** = a second segmented group in the Elections header beside the existing mode
  strip (same container register), prefixed by the nano `RCV` badge chip; buttons
  `Replay · Coalition · What-if` gated by `SHIPPED_LENSES`; rendered only when
  `lensAvailable`. Active lens button = the ochre selection idiom. `flex-wrap` on the header
  cluster.
- **The RCV panel becomes the lens console** (same `absolute bottom-6 left-5 z-10 glass-card`,
  same collapse chip): no lens → unchanged (Rounds/Flow toggle); REPLAY → chart on the shared
  transport, Rounds/Flow toggle hidden (Flow is round-blind and would decouple panel from
  map); COALITION → picker/bars/head-to-head, no transport; WHAT-IF → strike roster +
  counterfactual chart. Panel body = `switch (activeLens)`. Collapsed chip gains lens context:
  `REPLAY · R9/14` / `COALITION · Peskin` / `WHAT-IF · 1 removed`.
- **Mobile:** match the view's existing desktop-leaning stance — no sheets/drawer work; just
  the `flex-wrap` + a `max-w-[calc(100vw-2.5rem)]` guard on the panel.
- **Reduced motion:** delegated entirely to the transport (`inTransferWindow` never true) —
  chart ribbons, adopt segments, map flip lift, settle repaints all key off it; autoplay still
  steps.

### 4.7 Copy register (house voice; AP style; dejargonized)

1. Replay legend eyebrow/subtitle: `ROUND 9 OF 14` / `Votes counting for 5 candidates`
2. Replay tooltip: `Lurie — 44% of ballots still counting here`
3. Drain row: `No longer counting — ballots with no remaining choices`
4. Withheld disclosure: `13 small precincts withheld by S.F. — ballots still count citywide`
5. Coalition prompt: `Pick a candidate to see where their voters went next.` → legend title
   `Where Peskin voters went next`
6. Ranked-two bucket: `Ranked two candidates at once` (never "overvote" reader-facing)
7. Head-to-head: `Among ballots ranking both, Lurie beats Breed 152,411 to 122,880.`
8. Verdict: `Lurie beats every other candidate head-to-head.` (never "Condorcet"
   reader-facing)
9. What-if banner: `Hypothetical count — Daniel Lurie removed. Same ballots, rerun without
   them. The certified result is unchanged.` · button `Reset to reality` · outline legend
   `Outlined precincts end with a different winner than the real count.` · tie line `A tie was
   broken using the real election's elimination order.`

## 5. Staged PRs

- **PR 1 — pipeline + REPLAY** (this branch, `feat/cvr-replay`): Task 0 = fetch zip + probe
  one CvrExport batch (R4/R5 evidence, unique-pattern count, Gate-B as-cast feasibility;
  findings recorded before generator tasks finalize). Then: fetch script; generator + gates +
  committed artifacts + `_manifest`; types; `src/lib/rcv/{ballots,tabulate,replay}.ts` +
  tests + `reconciliation.test.ts`; `scripts/__tests__/buildCvrBallots.test.ts`;
  `colorMix.ts`; `rcvTransportCore.ts` + `useRcvTransport` + chart controlled-refactor;
  `useCVRManifest`/`useCVRBallots`/`useReplayModel`; `rcvLens.ts`; header lens group;
  `?lens=`/`?round=` + hygiene + focus precedence; `replay` branch + `replayFill` +
  `FLIP_LIFT`; legend replay variant + disclosures; tooltip copy.
- **PR 2 — COALITION**: `coalition.ts` + tests; panel picker/bars/head-to-head; legend
  variant + floor disclosure; coalition focus-gate bypass; append `'coalition'`.
- **PR 3 — WHAT-IF**: `?strike=` + hygiene; differ + outline layer; banner + `tiesBroken`;
  counterfactual chart/transport + certified-color pin; card overrides; append `'whatif'`.

## 6. Verification

- **Vitest (node):** tabulator bucket semantics + conservation ∀r; the standing
  reconciliation test (all 10 races, forever); replay tensor column-sum invariant (ALL 514 ≡
  certified); R1 paint-layer identity (`replayFill` ≡ `resultsFill` at drain 0); coalition
  cohort ≡ certified R1, bucket sums, `prefersBoth`→`bothRanked`, Condorcet = LURIE; what-if
  identity/determinism/`tiesBroken`; `TIE_ORDER_PINS` stays empty for 20241105; treasurer
  bidirectional pin; synthetic mark-resolution fixtures (overvote/duplicate/skip/write-in);
  `rcvTransportCore` dwell/step/clamp.
- **Generator:** `--self-test` perturbation caught; `--check` clean; Gates A–D green for all
  10 races; outstack histograms logged.
- **Build:** `npx tsc -b` + full `pnpm build` via the devman wrapper.
- **Live QA per PR** (render-feature browser gate): lens strip; chart↔map sync; deep-link
  cold loads on `vite preview` (incl. `?lens=replay&round=9` and `?lens=`+`?candidate=`
  precedence); reduced motion; TM suspension; collapsed chip; transport parity probes
  (dwell timing, open-on-R1, race-switch reset, keyboard).
- **Independent cross-check:** ranked.vote winners / first-choice totals / final splits /
  Condorcet.

## 7. Prior art (why this is white space)

ranked.vote: static CVR reports, no maps/interaction. CUNY's NYC 2025 tool (closest):
ED-level round slider but a single-candidate blues ramp ("can't see the city re-sort"), no
narration, per-ED sankey spaghetti — its lessons are baked in above (multi-hue leader fabric;
transport with pacing; per-precinct detail = stacked composition). RCVis: citywide summary
charts. Counterfactual analysis exists only as papers. No geographic CVR visualization exists
for SF at all.
