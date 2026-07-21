# CVR COALITION Lens (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the COALITION lens — second-choice geography ("pick a candidate, see where their voters went next") — as PR 2 of the CVR skin, per the committed spec `docs/superpowers/specs/2026-07-21-rcv-cvr-skin-design.md` §3.5 / §4.4 / §4.6 / §4.7.

**Architecture:** One new pure leaf (`src/lib/rcv/coalition.ts`: `computeSecondChoices`, `computeHeadToHead`, `coalitionPaintRows`) feeding the existing precinct paint machinery through a new `coalition` branch in `BuildPrecinctOptions` (same pattern as PR 1's `replay` branch), plus a COALITION arm in the Elections RCV panel (roster picker, citywide next-choice bars, head-to-head card) and a coalition legend variant. `?candidate=` is the lens input. No transport, no `?round=`.

**Tech Stack:** TypeScript, React 18, Vitest (node-only — pure leaves), typed arrays, existing Elections view machinery from PRs #112/#127/#131/#132.

## Global Constraints

(Verbatim from the spec + probe adjudications. Every task's requirements include these.)

- **Cohort definition:** ballots whose EFFECTIVE first choice is the focus (`pattern[0] === focus`). Second choice = `pattern[1]` (patterns are pre-deduplicated ⇒ next different candidate as cast); `pattern[1] === OVERVOTE_TERMINATOR` → ranked-two-at-once bucket; absent → no-next-choice. Roster-relative and ranked-anywhere variants are explicitly deferred (module docstring).
- **Display floor:** `COALITION_FLOOR = 10`. Suppressed = `1 ≤ cohort < 10` (counted, disclosed); zero-cohort = absent (unpainted, silent, NOT counted — probe: district races have ~470 zero-cohort out-of-district precincts vs 1–7 genuinely suppressed; counting zeros would inflate the disclosure ~470×). This is the house present/suppressed/absent transparency principle.
- **Head-to-head semantics:** `prefersBoth` (among-both directional counts) are the copy-line numbers; inclusive `prefers` (unranked counts as below) is the Condorcet-verdict input. `prefersBoth[a,b] + prefersBoth[b,a] === bothRanked[a,b]`. **Probe-verified divergence edge (D11): among ballots ranking both, LAI beats CHEN 6,181–4,920, yet CHEN is the Condorcet winner on inclusive counts (12,001–11,803)** — when the among-both direction disagrees with the inclusive direction for the selected rival, the card MUST render the divergence disclosure line (Task 6).
- **Copy register:** never "overvote" reader-facing (say "Ranked two candidates at once"); never "Condorcet" reader-facing (say "beats every other candidate head-to-head"); AP style; `leaderDisplayName()` for surnames.
- **Colors:** the existing rank-assigned candidate color map — same pigment for the same candidate across chart, map, legend, panel. Dominant-next-choice hue = recipient's pigment; no-next-choice dominant = paper-500 `#a8926a`.
- **Lens plumbing:** append `'coalition'` to `SHIPPED_LENSES` (nothing else in `rcvLens.ts` changes). The coalition branch in `buildPrecinctFeatures` preempts the focus-ramp branch; `?candidate=` is read as the lens input REGARDLESS of `mapMode` (the focus-gate bypass). No candidate picked → ordinary first-choice results paint + prompt copy.
- **Unpainted stay unpainted:** the 13 SOV-withheld precincts and the `"0000"` sentinel never paint in any lens (they fall out of the `_turnout`-label paint loop; do not special-case them).
- **Probe-pinned real-data test anchors (from `scripts/__probe-coalition.ts` run against committed artifacts, 2026-07-21):**
  - Mayor cohorts (≡ certified R1): LURIE 102,720 · BREED 95,117 · PESKIN 89,215 · FARRELL 72,115.
  - PESKIN second choices: BREED 22,266 · LURIE 17,492 · SAFAÍ 14,376 · FARRELL 5,624 · none 21,858 · ranked-two 86.
  - Mayor head-to-head: Condorcet winner LURIE; `prefersBoth[LURIE,BREED]=92,063`, `prefersBoth[BREED,LURIE]=72,547`, `bothRanked=164,610`, `prefers[LURIE,BREED]=182,364`, `prefers[BREED,LURIE]=149,113`.
  - D11: Condorcet winner CHYANNE CHEN; `prefersBoth[CHEN,LAI]=4,920`, `prefersBoth[LAI,CHEN]=6,181`, `bothRanked=11,101`, `prefers[CHEN,LAI]=12,001`, `prefers[LAI,CHEN]=11,803`.
  - Floor-suppressed counts (1≤cohort<10, over ALL artifact precincts): mayor PESKIN=1, HIRSCH-SHELL=421; D11 JOSE MORALES=7.
- Verification commands: `pnpm test` (Vitest, node), `npx tsc -b`, full build via `~/dev/devman/tools/devman-build.mjs pnpm build`. Never `pnpm dev` via Bash.

## File Structure

- Create: `src/lib/rcv/coalition.ts` (pure leaf: second choices, head-to-head, paint-row adapter), `src/lib/rcv/coalition.test.ts` (real-data pins + synthetic fixtures), `src/views/Elections/panels/CoalitionPanel.tsx` (picker + bars + head-to-head card).
- Modify: `src/views/Elections/map/precinctPaint.ts` (+`coalitionFill`), `src/views/Elections/map/precinctJoin.ts` (+`coalition` branch), `src/views/Elections/map/PrecinctLegend.tsx` (+coalition variant + prompt), `src/views/Elections/rcvLens.ts` (append `'coalition'`), `src/views/Elections/map/PrecinctFillLayer.tsx` (+`coalition` prop pass-through), `src/views/Elections/Elections.tsx` (memos, panel arm, chip, legend props), `src/views/Elections/panels/PrecinctDetailPanel.tsx` (composition bar section).
- No new hook: coalition reuses `useReplayModel`'s returned `ballots` (already decoded once per artifact).
- Tests extend: `src/views/Elections/map/precinctPaint.test.ts`, `src/views/Elections/map/precinctJoin.test.ts`, `src/views/Elections/rcvLens.test.ts`.

---

### Task 1: `coalition.ts` — computeSecondChoices + coalitionPaintRows

**Files:**
- Create: `src/lib/rcv/coalition.ts`
- Create: `src/lib/rcv/coalition.test.ts`

**Interfaces:**
- Consumes: `DecodedBallots` from `src/lib/rcv/ballots.ts`; `OVERVOTE_TERMINATOR`, `CVRBallotArtifact` from `src/types/elections.ts`; `cleanCandidateName` from `@/utils/electionData`.
- Produces: `COALITION_FLOOR`, `SecondChoiceResult`, `computeSecondChoices(ballots, focus)`, `CoalitionPaintRow`, `coalitionPaintRows(sc, artifact, floor?)` — consumed by Tasks 3–6.

- [ ] **Step 1: Write the failing tests** (`src/lib/rcv/coalition.test.ts`)

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CVRBallotArtifact, RCVContest } from '../../types/elections'
import { decodeBallots, type DecodedBallots } from './ballots'
import {
  COALITION_FLOOR,
  coalitionPaintRows,
  computeSecondChoices,
} from './coalition'

const DIR = join(__dirname, '../../../public/data/elections/results/20241105')

function loadRace(raceId: string) {
  const artifact = JSON.parse(
    readFileSync(join(DIR, 'cvr', `${raceId}.json`), 'utf8'),
  ) as CVRBallotArtifact
  const rounds = JSON.parse(
    readFileSync(join(DIR, 'rcv', `${raceId}.json`), 'utf8'),
  ) as RCVContest
  return { artifact, rounds, ballots: decodeBallots(artifact) }
}

const RACES = ['mayor', 'member-board-of-supervisors-district-11'] as const

describe('computeSecondChoices — certified pins', () => {
  it.each(RACES)('%s: cohort ≡ certified R1 votes and buckets conserve, every candidate', (raceId) => {
    const { artifact, rounds, ballots } = loadRace(raceId)
    const certR1 = new Map(rounds.rounds[0].candidates.map((c) => [c.name, c.votes]))
    for (let f = 0; f < artifact.candidates.length; f++) {
      const sc = computeSecondChoices(ballots, f)
      expect(sc.total, artifact.candidates[f]).toBe(certR1.get(artifact.candidates[f]))
      let bucketSum = sc.none + sc.overvote
      for (const v of sc.next) bucketSum += v
      expect(bucketSum, artifact.candidates[f]).toBe(sc.total)
      let precinctSum = 0
      const perPrecinctNext = new Int32Array(ballots.candidateCount)
      let pNone = 0
      let pOver = 0
      for (const pp of sc.byPrecinct) {
        precinctSum += pp.total
        pNone += pp.none
        pOver += pp.overvote
        for (let i = 0; i < pp.next.length; i++) perPrecinctNext[i] += pp.next[i]
      }
      expect(precinctSum).toBe(sc.total)
      expect(pNone).toBe(sc.none)
      expect(pOver).toBe(sc.overvote)
      expect(Array.from(perPrecinctNext)).toEqual(Array.from(sc.next))
    }
  })

  it('mayor: PESKIN second-choice distribution exact (probe-pinned)', () => {
    const { artifact, ballots } = loadRace('mayor')
    const idx = (n: string) => artifact.candidates.indexOf(n)
    const sc = computeSecondChoices(ballots, idx('AARON PESKIN'))
    expect(sc.total).toBe(89215)
    expect(sc.none).toBe(21858)
    expect(sc.overvote).toBe(86)
    expect(sc.next[idx('LONDON BREED')]).toBe(22266)
    expect(sc.next[idx('DANIEL LURIE')]).toBe(17492)
    expect(sc.next[idx('AHSHA SAFAÍ')]).toBe(14376)
    expect(sc.next[idx('MARK FARRELL')]).toBe(5624)
  })
})

describe('coalitionPaintRows — floor semantics', () => {
  it('mayor PESKIN: 1 suppressed; every painted row ≥ floor; zero-cohort absent everywhere', () => {
    const { artifact, ballots } = loadRace('mayor')
    const idx = artifact.candidates.indexOf('AARON PESKIN')
    const sc = computeSecondChoices(ballots, idx)
    const { rows, suppressedIds } = coalitionPaintRows(sc, artifact)
    expect(suppressedIds).toHaveLength(1)
    for (const row of Object.values(rows)) expect(row.cohort).toBeGreaterThanOrEqual(COALITION_FLOOR)
    const present = new Set([...Object.keys(rows), ...suppressedIds])
    sc.byPrecinct.forEach((pp, p) => {
      if (pp.total === 0) expect(present.has(artifact.precincts[p])).toBe(false)
    })
  })

  it('mayor HIRSCH-SHELL: 421 suppressed (the floor doing its job on a minor candidate)', () => {
    const { artifact, ballots } = loadRace('mayor')
    const idx = artifact.candidates.indexOf('DYLAN HIRSCH-SHELL')
    const { suppressedIds } = coalitionPaintRows(computeSecondChoices(ballots, idx), artifact)
    expect(suppressedIds).toHaveLength(421)
  })

  it('D11 JOSE MORALES: 7 suppressed', () => {
    const { artifact, ballots } = loadRace('member-board-of-supervisors-district-11')
    const idx = artifact.candidates.indexOf('JOSE MORALES')
    const { suppressedIds } = coalitionPaintRows(computeSecondChoices(ballots, idx), artifact)
    expect(suppressedIds).toHaveLength(7)
  })
})

describe('coalition — synthetic fixtures', () => {
  // 2 candidates A(0), B(1); 3 precincts. Patterns:
  //   [0]      → A only (no next)          — p0 ×12
  //   [0,1]    → A then B                  — p0 ×3, p1 ×9
  //   [0,-1]   → A then ranked-two-at-once — p1 ×2
  //   [1,0]    → B first (out of cohort)   — p0 ×5
  //   []       → blank (out of cohort)     — p2 ×4
  const artifact: CVRBallotArtifact = {
    formatVersion: 1,
    dateCode: '20241105',
    raceId: 'synthetic',
    title: 'Synthetic',
    candidates: ['ALICE AAA', 'BOB BBB'],
    precincts: ['1001', '1002', '1003'],
    sovSuppressed: [],
    patterns: [[0], [0, 1], [0, -1], [1, 0], []],
    groups: [
      0, 0, 12,
      0, 1, 3,
      1, 1, 9,
      1, 2, 2,
      0, 3, 5,
      2, 4, 4,
    ],
  }
  const ballots: DecodedBallots = decodeBallots(artifact)

  it('buckets: none / next / ranked-two split correctly, blanks and other-first excluded', () => {
    const sc = computeSecondChoices(ballots, 0)
    expect(sc.total).toBe(26) // 12 + 3 + 9 + 2
    expect(sc.none).toBe(12)
    expect(sc.next[1]).toBe(12) // 3 + 9
    expect(sc.overvote).toBe(2)
    expect(sc.byPrecinct[0]).toMatchObject({ total: 15, none: 12, overvote: 0 })
    expect(sc.byPrecinct[1]).toMatchObject({ total: 11, none: 0, overvote: 2 })
    expect(sc.byPrecinct[2].total).toBe(0)
  })

  it('paint rows: floor boundary — cohort 15 paints, 11 paints, 0 absent; floor 12 suppresses the 11', () => {
    const sc = computeSecondChoices(ballots, 0)
    const def = coalitionPaintRows(sc, artifact)
    expect(Object.keys(def.rows).sort()).toEqual(['1001', '1002'])
    expect(def.suppressedIds).toEqual([])
    const strict = coalitionPaintRows(sc, artifact, 12)
    expect(Object.keys(strict.rows)).toEqual(['1001'])
    expect(strict.suppressedIds).toEqual(['1002'])
  })

  it('dominance: none-bucket dominates p0 (12 > 3 → paper), BOB dominates p1; candidate wins none-ties', () => {
    const sc = computeSecondChoices(ballots, 0)
    const { rows } = coalitionPaintRows(sc, artifact)
    expect(rows['1001'].dominant).toBeNull() // none 12 vs BOB 3
    expect(rows['1001'].dominantShare).toBeCloseTo(12 / 15)
    expect(rows['1002'].dominant).toBe('Bob Bbb') // cleanCandidateName-processed
    expect(rows['1002'].dominantShare).toBeCloseTo(9 / 11)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/rcv/coalition.test.ts`
Expected: FAIL — `Cannot find module './coalition'` (or equivalent unresolved import).

- [ ] **Step 3: Implement `src/lib/rcv/coalition.ts`**

The `computeSecondChoices` body below is the PROBE-PROVEN reference implementation (ran against all committed artifacts with zero pin mismatches) — transcribe it exactly.

```ts
/**
 * COALITION lens math — second-choice geography over the decoded ballot
 * artifact. Pure leaf (node-Vitest clean); consumed by the Elections view.
 *
 * Cohort = ballots whose EFFECTIVE first choice is the focus candidate
 * (`pattern[0] === focus`). "Second choice" = `pattern[1]` — patterns are
 * pre-deduplicated by the generator, so this is the next DIFFERENT candidate
 * as cast. Roster-relative ("next continuing at round k") and ranked-anywhere
 * cohort variants are explicitly deferred; do not add them speculatively.
 */
import { OVERVOTE_TERMINATOR, type CVRBallotArtifact } from '../../types/elections'
import { cleanCandidateName } from '../../utils/electionData'
import type { DecodedBallots } from './ballots'

/** Display floor: precincts with 1 ≤ cohort < floor are SUPPRESSED (counted,
 *  disclosed in the legend); zero-cohort precincts are ABSENT (silent) —
 *  probe 2026-07-21: district races have ~470 zero-cohort out-of-district
 *  precincts vs 1–7 genuinely suppressed, so counting zeros would inflate
 *  the disclosure ~470×. */
export const COALITION_FLOOR = 10

export interface SecondChoicePrecinct {
  total: number
  next: Int32Array
  none: number
  overvote: number
}

export interface SecondChoiceResult {
  focus: number
  /** Cohort size — equals the certified round-1 votes for the focus
   *  candidate (the cross-lens anchor, test-pinned). */
  total: number
  next: Int32Array
  none: number
  overvote: number
  byPrecinct: SecondChoicePrecinct[]
}

export function computeSecondChoices(b: DecodedBallots, focus: number): SecondChoiceResult {
  const next = new Int32Array(b.candidateCount)
  let none = 0
  let overvote = 0
  let total = 0
  const byPrecinct: SecondChoicePrecinct[] = Array.from({ length: b.precinctCount }, () => ({
    total: 0,
    next: new Int32Array(b.candidateCount),
    none: 0,
    overvote: 0,
  }))
  for (let g = 0; g < b.groupCount.length; g++) {
    const pat = b.groupPattern[g]
    const s = b.patternStart[pat]
    const e = b.patternStart[pat + 1]
    if (e === s || b.patternFlat[s] !== focus) continue
    const c = b.groupCount[g]
    const pp = byPrecinct[b.groupPrecinct[g]]
    total += c
    pp.total += c
    if (e - s < 2) {
      none += c
      pp.none += c
      continue
    }
    const second = b.patternFlat[s + 1]
    if (second === OVERVOTE_TERMINATOR) {
      overvote += c
      pp.overvote += c
    } else {
      next[second] += c
      pp.next[second] += c
    }
  }
  return { focus, total, next, none, overvote, byPrecinct }
}

export interface CoalitionPaintRow {
  /** Clean display name of the dominant next choice, or null when "no
   *  usable next choice" (none + ranked-two) dominates — painted paper-500. */
  dominant: string | null
  /** Dominant bucket ÷ cohort — feeds the race-relative quartile ladder. */
  dominantShare: number
  cohort: number
}

/** Reshape one candidate's per-precinct second choices into paint rows keyed
 *  by artifact precinct id. Dominance compares each candidate bucket against
 *  the combined no-usable-next bucket (none + ranked-two — both stop
 *  counting); a candidate WINS ties against that bucket (prefer showing a
 *  destination), and candidate-vs-candidate ties resolve to the earlier
 *  artifact index (round-1 standing order — deterministic). */
export function coalitionPaintRows(
  sc: SecondChoiceResult,
  artifact: CVRBallotArtifact,
  floor: number = COALITION_FLOOR,
): { rows: Record<string, CoalitionPaintRow>; suppressedIds: string[] } {
  const rows: Record<string, CoalitionPaintRow> = {}
  const suppressedIds: string[] = []
  for (let p = 0; p < sc.byPrecinct.length; p++) {
    const pp = sc.byPrecinct[p]
    if (pp.total === 0) continue
    if (pp.total < floor) {
      suppressedIds.push(artifact.precincts[p])
      continue
    }
    let bestIdx = -1
    let bestVotes = 0
    for (let i = 0; i < pp.next.length; i++) {
      if (pp.next[i] > bestVotes) {
        bestVotes = pp.next[i]
        bestIdx = i
      }
    }
    const noNext = pp.none + pp.overvote
    const dominant = noNext > bestVotes || bestIdx < 0 ? null : bestIdx
    const dominantVotes = dominant === null ? noNext : bestVotes
    rows[artifact.precincts[p]] = {
      dominant: dominant === null ? null : cleanCandidateName(artifact.candidates[dominant]),
      dominantShare: dominantVotes / pp.total,
      cohort: pp.total,
    }
  }
  return { rows, suppressedIds }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/rcv/coalition.test.ts`
Expected: PASS (all suites). Note the real-data pins load two committed ~1–3MB JSON artifacts; runtime should stay well under 2s.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rcv/coalition.ts src/lib/rcv/coalition.test.ts
git commit -m "feat(elections): coalition second-choice math — cohort/buckets + floor-aware paint rows"
```

---

### Task 2: `coalition.ts` — computeHeadToHead

**Files:**
- Modify: `src/lib/rcv/coalition.ts`
- Modify: `src/lib/rcv/coalition.test.ts`

**Interfaces:**
- Produces: `HeadToHeadMatrix`, `computeHeadToHead(ballots, candidates)` — consumed by Task 6's head-to-head card.

- [ ] **Step 1: Add the failing tests** (append to `coalition.test.ts`)

```ts
import { computeHeadToHead } from './coalition'

describe('computeHeadToHead — certified pins', () => {
  it('mayor: LURIE is the head-to-head winner; BREED pair numbers exact (probe-pinned)', () => {
    const { artifact, ballots } = loadRace('mayor')
    const h = computeHeadToHead(ballots, artifact.candidates)
    const n = artifact.candidates.length
    const idx = (nm: string) => artifact.candidates.indexOf(nm)
    expect(h.condorcetWinner).toBe(idx('DANIEL LURIE'))
    const L = idx('DANIEL LURIE')
    const B = idx('LONDON BREED')
    expect(h.prefersBoth[L * n + B]).toBe(92063)
    expect(h.prefersBoth[B * n + L]).toBe(72547)
    expect(h.bothRanked[L * n + B]).toBe(164610)
    expect(h.prefers[L * n + B]).toBe(182364)
    expect(h.prefers[B * n + L]).toBe(149113)
  })

  it('D11: CHEN is the head-to-head winner while LAI leads among-both — the divergence edge (probe-pinned)', () => {
    const { artifact, ballots } = loadRace('member-board-of-supervisors-district-11')
    const h = computeHeadToHead(ballots, artifact.candidates)
    const n = artifact.candidates.length
    const idx = (nm: string) => artifact.candidates.indexOf(nm)
    const C = idx('CHYANNE CHEN')
    const M = idx('MICHAEL LAI')
    expect(h.condorcetWinner).toBe(C)
    expect(h.prefersBoth[C * n + M]).toBe(4920)
    expect(h.prefersBoth[M * n + C]).toBe(6181) // among-both, LAI leads…
    expect(h.prefers[C * n + M]).toBe(12001) // …but inclusive, CHEN wins
    expect(h.prefers[M * n + C]).toBe(11803)
  })

  it.each(RACES)('%s: prefersBoth pairs sum to bothRanked; bothRanked symmetric', (raceId) => {
    const { artifact, ballots } = loadRace(raceId)
    const h = computeHeadToHead(ballots, artifact.candidates)
    const n = artifact.candidates.length
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (a === b) continue
        expect(h.prefersBoth[a * n + b] + h.prefersBoth[b * n + a]).toBe(h.bothRanked[a * n + b])
        expect(h.bothRanked[a * n + b]).toBe(h.bothRanked[b * n + a])
      }
    }
  })

  it('synthetic: overvote terminator truncates the ranking; unranked counts as below', () => {
    // A(0), B(1), C(2). [0,-1,…] → only A ranked (terminator stops the read).
    const artifact: CVRBallotArtifact = {
      formatVersion: 1,
      dateCode: '20241105',
      raceId: 'synthetic-h2h',
      title: 'Synthetic',
      candidates: ['ALICE AAA', 'BOB BBB', 'CARA CCC'],
      precincts: ['1001'],
      sovSuppressed: [],
      patterns: [
        [0, -1], // A then ranked-two → ranking is A alone
        [1, 2], // B > C
        [2], // C alone
      ],
      groups: [0, 0, 5, 0, 1, 3, 0, 2, 2],
    }
    const h = computeHeadToHead(decodeBallots(artifact), artifact.candidates)
    const n = 3
    // A-vs-B: A ranked alone on 5 (prefers A>B inclusive), B ranked on 3 (B>A), never both
    expect(h.bothRanked[0 * n + 1]).toBe(0)
    expect(h.prefers[0 * n + 1]).toBe(5)
    expect(h.prefers[1 * n + 0]).toBe(3)
    // B-vs-C: both ranked on 3 ballots with B above C; C alone on 2
    expect(h.prefersBoth[1 * n + 2]).toBe(3)
    expect(h.prefersBoth[2 * n + 1]).toBe(0)
    expect(h.bothRanked[1 * n + 2]).toBe(3)
    expect(h.prefers[2 * n + 1]).toBe(2)
    // No head-to-head winner: A beats B 5–3, B beats C 5–2… but C-vs-A: A alone 5, C on 3+2=5 → tie, no winner
    expect(h.condorcetWinner).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify the new suite fails**

Run: `npx vitest run src/lib/rcv/coalition.test.ts`
Expected: FAIL — `computeHeadToHead` not exported.

- [ ] **Step 3: Implement** (append to `src/lib/rcv/coalition.ts`) — probe-proven reference implementation, transcribe exactly:

```ts
export interface HeadToHeadMatrix {
  candidates: string[]
  /** n×n among-both directional counts: ballots ranking BOTH a and b with a
   *  above b. `prefersBoth[a,b] + prefersBoth[b,a] === bothRanked[a,b]` —
   *  these are the numbers the copy line renders. */
  prefersBoth: Int32Array
  bothRanked: Int32Array
  /** n×n inclusive counts (b unranked counts as below a) — the
   *  beats-every-rival verdict input. Probe-verified D11 edge: the two
   *  matrices can point OPPOSITE directions for a pair; the UI renders a
   *  divergence disclosure line when they do. */
  prefers: Int32Array
  /** Candidate who inclusively beats every rival, or null (ties possible). */
  condorcetWinner: number | null
}

/** Iterates citywide PATTERNS (not groups): ~65k × n² for mayor ≈ 11M ops,
 *  ~20–40ms once, memoized at the hook layer. */
export function computeHeadToHead(b: DecodedBallots, candidates: string[]): HeadToHeadMatrix {
  const n = b.candidateCount
  const prefersBoth = new Int32Array(n * n)
  const bothRanked = new Int32Array(n * n)
  const prefers = new Int32Array(n * n)
  const rankOf = new Int32Array(n)
  for (let pat = 0; pat < b.patternCount; pat++) {
    const w = b.patternTotal[pat]
    if (w === 0) continue
    rankOf.fill(-1)
    const s = b.patternStart[pat]
    const e = b.patternStart[pat + 1]
    let pos = 0
    for (let i = s; i < e; i++) {
      const v = b.patternFlat[i]
      if (v === OVERVOTE_TERMINATOR) break
      rankOf[v] = pos++
    }
    if (pos === 0) continue
    for (let a = 0; a < n; a++) {
      const ra = rankOf[a]
      if (ra < 0) continue
      for (let c = 0; c < n; c++) {
        if (c === a) continue
        const rc = rankOf[c]
        if (rc < 0) {
          prefers[a * n + c] += w
          continue
        }
        if (ra < rc) {
          prefers[a * n + c] += w
          prefersBoth[a * n + c] += w
        }
        bothRanked[a * n + c] += w
      }
    }
  }
  let condorcetWinner: number | null = null
  for (let a = 0; a < n; a++) {
    let beatsAll = true
    for (let c = 0; c < n; c++) {
      if (c === a) continue
      if (prefers[a * n + c] <= prefers[c * n + a]) {
        beatsAll = false
        break
      }
    }
    if (beatsAll) {
      condorcetWinner = a
      break
    }
  }
  return { candidates, prefersBoth, bothRanked, prefers, condorcetWinner }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/rcv/coalition.test.ts`
Expected: PASS. Then run the WHOLE suite once — `pnpm test` — expected: no regressions (the reconciliation test and all PR 1 suites stay green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rcv/coalition.ts src/lib/rcv/coalition.test.ts
git commit -m "feat(elections): head-to-head matrices — among-both copy numbers + inclusive verdict"
```

---

### Task 3: `coalitionFill` + the `coalition` branch in `buildPrecinctFeatures`

**Files:**
- Modify: `src/views/Elections/map/precinctPaint.ts`
- Modify: `src/views/Elections/map/precinctJoin.ts`
- Test: `src/views/Elections/map/precinctPaint.test.ts`, `src/views/Elections/map/precinctJoin.test.ts` (append)

**Interfaces:**
- Consumes: `CoalitionPaintRow` from Task 1; existing `decisivenessOpacity`/`decisivenessOpacityRelative`, `FALLBACK`, `leaderDisplayName`.
- Produces: `coalitionFill(row, colorMap, quartiles): Fill` in precinctPaint; `BuildPrecinctOptions.coalition?: { rows: Record<string, CoalitionPaintRow>; quartiles: [number, number, number] | null; focusDisplay: string }` — consumed by Tasks 6's `coalitionOption` memo and `PrecinctFillLayer`.

- [ ] **Step 1: Add failing tests.** Append to `precinctPaint.test.ts` (follow the file's existing import style):

```ts
describe('coalitionFill', () => {
  const colorMap = new Map([['London Breed', '#b85a33']])
  it('dominant candidate paints in the recipient pigment with quartile opacity', () => {
    const fill = coalitionFill(
      { dominant: 'London Breed', dominantShare: 0.6, cohort: 40 },
      colorMap,
      [0.3, 0.45, 0.62],
    )
    expect(fill.color).toBe('#b85a33')
    expect(fill.opacity).toBe(0.55) // between q2 0.45 and q3 0.62
  })
  it('no-next-choice dominant paints paper-500', () => {
    const fill = coalitionFill(
      { dominant: null, dominantShare: 0.8, cohort: 40 },
      colorMap,
      [0.3, 0.45, 0.62],
    )
    expect(fill.color).toBe('#a8926a')
    expect(fill.opacity).toBe(0.7)
  })
  it('null quartiles fall back to the absolute ladder; unknown candidate falls back to paper', () => {
    const fill = coalitionFill({ dominant: 'Nobody Known', dominantShare: 0.4, cohort: 40 }, colorMap, null)
    expect(fill.color).toBe('#a8926a')
    expect(fill.opacity).toBe(0.4) // absolute: 0.34 ≤ 0.4 < 0.5
  })
})
```

Append to `precinctJoin.test.ts` — build the bundle/geometry fixtures the same way the file's existing replay-branch tests do (reuse its fixture helpers or minimal literals; `as`-cast alignment with the file's style is fine). Assertions to express:

```ts
describe('buildPrecinctFeatures — coalition branch', () => {
  // Fixture: two turnout labels '1001','1002' with geometry; coalition rows
  // only for '1001' (dominant 'London Breed', dominantShare 0.6, cohort 40).
  it('paints only precincts with a coalition row; tooltip names the dominant next choice', () => {
    const fc = buildPrecinctFeatures({
      ...baseOpts, // the fixture's existing base options (mode 'results', race set)
      coalition: {
        rows: { '1001': { dominant: 'London Breed', dominantShare: 0.6, cohort: 40 } },
        quartiles: null,
        focusDisplay: 'Peskin',
      },
    })
    const labels = fc.features.map((f) => f.properties?.label)
    expect(labels).toEqual(['1001']) // '1002' has no row → unpainted
    const p = fc.features[0].properties!
    expect(p.tipLeaderName).toBe('Breed') // leaderDisplayName
    expect(p.tipLeaderPhrase).toBe('next choice of 60% of Peskin voters here')
    // «votes» must be the fixture turnout row's ballots-cast value (whatever
    // the fixture sets it to), NOT the coalition cohort 40 — assert against
    // the fixture's own ballots constant.
    expect(p.votes).toBe(FIXTURE_BALLOTS_1001)
  })
  it('no-next-choice dominant: paper fill and the had-no-next-choice phrase', () => {
    const fc = buildPrecinctFeatures({
      ...baseOpts,
      coalition: {
        rows: { '1001': { dominant: null, dominantShare: 0.55, cohort: 40 } },
        quartiles: null,
        focusDisplay: 'Peskin',
      },
    })
    const p = fc.features[0].properties!
    expect(p.fillColor).toBe('#a8926a')
    expect(p.tipLeaderName).toBe('No next choice')
    expect(p.tipLeaderPhrase).toBe('55% of Peskin voters had no next choice here')
  })
  it('coalition preempts focusCandidate and the results precompute', () => {
    const fc = buildPrecinctFeatures({
      ...baseOpts,
      focusCandidate: 'London Breed', // would paint focusFill without the lens
      coalition: {
        rows: { '1001': { dominant: 'London Breed', dominantShare: 0.6, cohort: 40 } },
        quartiles: null,
        focusDisplay: 'Peskin',
      },
    })
    expect(fc.features[0].properties!.tipLeaderPhrase).toContain('next choice of')
  })
})
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/views/Elections/map/` — expected: FAIL (coalitionFill not exported; coalition option not in the interface).

- [ ] **Step 3: Implement.** In `precinctPaint.ts`, after `replayFill`:

```ts
/** COALITION: dominant-next-choice hue + the same 4-step decisiveness ladder
 *  keyed to the dominant bucket's share of the cohort. No-usable-next-choice
 *  dominant → paper-500 (the FALLBACK hex — deliberate: "went nowhere" is the
 *  absence-of-destination color). */
export function coalitionFill(
  row: { dominant: string | null; dominantShare: number },
  colorMap: Map<string, string>,
  quartiles: [number, number, number] | null,
): Fill {
  return {
    color: row.dominant ? (colorMap.get(row.dominant) ?? FALLBACK) : FALLBACK,
    opacity: quartiles
      ? decisivenessOpacityRelative(row.dominantShare, quartiles)
      : decisivenessOpacity(row.dominantShare),
  }
}
```

In `precinctJoin.ts`:
1. Import `coalitionFill` and `type CoalitionPaintRow` (`import type { CoalitionPaintRow } from '@/lib/rcv/coalition'`).
2. Add to `BuildPrecinctOptions` after the `replay` field:

```ts
  /** COALITION lens — dominant second choice of the focus candidate's
   *  first-choice voters. Same preemption as replay: lens-driven fill,
   *  ignores `mode`/`focusCandidate`. `rows` is floor-filtered (Task 1) —
   *  absent label ⇒ unpainted (zero-cohort or suppressed). */
  coalition?: {
    rows: Record<string, CoalitionPaintRow>
    /** Race-relative quartiles of dominantShare over PAINTED precincts,
     *  computed once per focus candidate by the caller. */
    quartiles: [number, number, number] | null
    /** Surname for tooltips: "next choice of 34% of Peskin voters here". */
    focusDisplay: string
  }
```

3. Extend the precompute skip condition (line ~107): `if (!opts.replay && !opts.coalition && mode === 'results' && bundle.race && !raceIsProp) {`.
4. Add the branch in the main loop directly AFTER the `if (opts.replay) { ... }` block (the two are mutually exclusive — one lens at a time):

```ts
    } else if (opts.coalition) {
      const cRow = opts.coalition.rows[label]
      if (!cRow) continue // zero-cohort or floor-suppressed — unpainted, disclosed in the legend
      fill = coalitionFill(cRow, colorMap, opts.coalition.quartiles)
      const pct = Math.round(cRow.dominantShare * 100)
      if (cRow.dominant) {
        tipLeaderName = leaderDisplayName(cRow.dominant)
        tipLeaderPhrase = `next choice of ${pct}% of ${opts.coalition.focusDisplay} voters here`
      } else {
        tipLeaderName = 'No next choice'
        tipLeaderPhrase = `${pct}% of ${opts.coalition.focusDisplay} voters had no next choice here`
      }
      // votes stays row.ballots (same rule as replay: the tooltip template
      // renders «votes» as "votes cast").
```

- [ ] **Step 4: Run to verify pass.** `npx vitest run src/views/Elections/map/` — expected: PASS incl. all pre-existing replay/results tests.

- [ ] **Step 5: Commit.**

```bash
git add src/views/Elections/map/precinctPaint.ts src/views/Elections/map/precinctJoin.ts src/views/Elections/map/precinctPaint.test.ts src/views/Elections/map/precinctJoin.test.ts
git commit -m "feat(elections): coalition paint — dominant-next-choice fill + join branch"
```

---

### Task 4: PrecinctLegend coalition variant + prompt line

**Files:**
- Modify: `src/views/Elections/map/PrecinctLegend.tsx`

**Interfaces:**
- Produces: on `PrecinctLegendProps` two new optional props consumed by Task 6:

```ts
export interface PrecinctLegendCoalitionState {
  /** Surname of the focus candidate ("Peskin"). */
  focusDisplay: string
  cohort: number
  /** Top-5 citywide next choices, desc: RAW candidate name + votes + pct of cohort. */
  recipients: { name: string; votes: number; pct: number }[]
  nonePct: number
  /** Ranked-two-at-once ballots citywide (render the row only when > 0). */
  overvoteCount: number
  /** Painted-eligible precincts hidden by the n<10 floor (render only when > 0). */
  suppressedCount: number
  withheldCount: number
}
// props: coalitionState?: PrecinctLegendCoalitionState
//        coalitionPrompt?: boolean
```

- [ ] **Step 1: Implement the variant.** Mirror the `replayState` early-return (lines ~55–98) with a sibling block ABOVE the normal branches, rendered when `coalitionState` is truthy. Structure (same classNames/register as the replay variant — swatch rows, `text-micro`, `text-nano` footers):

```tsx
if (coalitionState) {
  const cs = coalitionState
  return (
    <div className={/* same wrapper as the replay variant */}>
      {/* rule-leading eyebrow, same idiom as ROUND N OF M */}
      <p className={/* eyebrow classes */}>── COALITION</p>
      <p className={/* title classes (same as replay subtitle) */}>
        Where {cs.focusDisplay} voters went next
      </p>
      <p className={/* nano muted */}>{cs.cohort.toLocaleString()} ballots ranked {cs.focusDisplay} first</p>
      {cs.recipients.map((r) => (
        <div key={r.name} className={/* same row classes as replay top-5 */}>
          <span style={{ backgroundColor: colorMap?.get(r.name) ?? '#a8926a' }} /* swatch */ />
          <span>{leaderDisplayName(cleanCandidateName(r.name))}</span>
          <span>{Math.round(r.pct)}%</span>
        </div>
      ))}
      <div /* paper row, always */>
        <span style={{ backgroundColor: '#a8926a' }} />
        <span>No next choice</span>
        <span>{Math.round(cs.nonePct)}%</span>
      </div>
      {cs.overvoteCount > 0 && (
        <p className={/* nano muted */}>{cs.overvoteCount.toLocaleString()} ballots ranked two candidates at once</p>
      )}
      {cs.suppressedCount > 0 && (
        <p className={/* nano footer, same as withheld */}>
          {cs.suppressedCount} precinct{cs.suppressedCount === 1 ? '' : 's'} under 10 ballots not shown
        </p>
      )}
      {cs.withheldCount > 0 && (
        <p className={/* nano footer */}>
          {cs.withheldCount} small precincts withheld by S.F. — ballots still count citywide
        </p>
      )}
    </div>
  )
}
```

Notes: the swatch color map — the legend already receives the candidate color map for its results rows; reuse the same prop (check its name in the file; if the results branch derives colors differently, thread the existing map through). `leaderDisplayName` and `cleanCandidateName` are already available in this file's import set (verify; add if absent).

- [ ] **Step 2: The prompt line.** When `coalitionPrompt` is true (coalition lens active, no candidate picked yet), the legend renders its NORMAL results content (the candidate rows stay clickable — they're the lens input) with one added line directly under the row list, before any hint text:

```tsx
{coalitionPrompt && (
  <p className={/* micro, ochre-tinted emphasis — e.g. text-micro text-ochre-600 dark:text-ochre-400 */}>
    Pick a candidate to see where their voters went next.
  </p>
)}
```

The normal branch's existing "Click a candidate to map their support" hint must NOT render alongside it (`coalitionPrompt` suppresses it — one instruction at a time).

- [ ] **Step 3: Verify.** `npx tsc -b` — expected: clean. (Legend is JSX-only; behavior verified in Task 8's browser gate.)

- [ ] **Step 4: Commit.**

```bash
git add src/views/Elections/map/PrecinctLegend.tsx
git commit -m "feat(elections): coalition legend variant — recipients, floor + withheld disclosures, prompt"
```

---

### Task 5: `CoalitionPanel` — picker, citywide bars, head-to-head card

**Files:**
- Create: `src/views/Elections/panels/CoalitionPanel.tsx`

**Interfaces:**
- Consumes: `SecondChoiceResult`, `HeadToHeadMatrix` from Tasks 1–2; `RCVContest`, `CVRBallotArtifact` types; `leaderDisplayName`, `cleanCandidateName` from `@/utils/electionData`.
- Produces (consumed by Task 6's panel arm):

```ts
interface CoalitionPanelProps {
  rcvData: RCVContest
  artifact: CVRBallotArtifact
  candidateColors: Map<string, string>
  /** Raw ?candidate= value (null = prompt state). */
  focusedCandidate: string | null
  onFocusCandidate: (name: string | null) => void
  secondChoices: SecondChoiceResult | null
  headToHead: HeadToHeadMatrix | null
  /** Surname for copy ("Peskin"), null when no focus. */
  focusDisplay: string | null
}
```

- [ ] **Step 1: Implement.** One component file, three zones. Use the existing panel register (`text-micro`/`text-nano`, Space Mono labels, the RCVComposition bar idiom from `src/components/charts/RCVComposition.tsx:118–147`).

**Zone 1 — roster picker** (always rendered). One row per candidate in artifact order (R1 standing), pigment dot + surname + certified R1 votes. Selected row = the candidate's OWN pigment tint + 1px ring (the Last 48 selection idiom — NO side bars, NO indigo):

```tsx
const r1votes = useMemo(
  () => new Map(rcvData.rounds[0].candidates.map((c) => [c.name, c.votes])),
  [rcvData],
)
// row:
<button
  key={name}
  onClick={() => onFocusCandidate(isSelected ? null : name)}
  className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-left transition-colors"
  style={isSelected ? { backgroundColor: `${hex}1a`, boxShadow: `inset 0 0 0 1px ${hex}4d` } : undefined}
>
  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: hex }} />
  <span className="text-micro flex-1 truncate">{leaderDisplayName(cleanCandidateName(name))}</span>
  <span className="text-nano font-mono text-slate-400 tabular-nums">{(r1votes.get(name) ?? 0).toLocaleString()}</span>
</button>
```

where `hex = candidateColors.get(name) ?? '#a8926a'` and `isSelected = focusedCandidate !== null && cleanCandidateName(focusedCandidate) === cleanCandidateName(name)`. Cap the roster's height (`max-h-40 overflow-y-auto`) — mayor has 13 rows. When `focusedCandidate === null`, render the prompt line above the roster: `Pick a candidate to see where their voters went next.` (micro, muted).

**Zone 2 — citywide next-choice bars** (rendered when `secondChoices && focusDisplay`). Title: `Where {focusDisplay} voters went next` (micro mono eyebrow style). Compute display buckets:

```tsx
const bars = useMemo(() => {
  if (!secondChoices) return null
  const total = secondChoices.total
  if (total === 0) return null
  const named = Array.from(secondChoices.next, (votes, i) => ({ name: artifact.candidates[i], votes }))
    .filter((b) => b.votes > 0)
    .sort((a, b) => b.votes - a.votes)
  const major = named.filter((b) => b.votes / total >= 0.02)
  const otherVotes = named.filter((b) => b.votes / total < 0.02).reduce((s, b) => s + b.votes, 0)
  return { total, major, otherVotes }
}, [secondChoices, artifact])
```

Render one horizontal bar row per `major` entry (surname label left; bar width `${(votes / total) * 100}%` of the track; fill = `candidateColors.get(name)` at opacity 0.92; count + pct right, tabular-nums), then when `otherVotes > 0` a row `Other candidates` in slate-400, then ALWAYS a `No next choice` row in paper `#a8926a` (votes = `secondChoices.none`), then when `secondChoices.overvote > 0` a nano footnote: `{overvote.toLocaleString()} ballots ranked two candidates at once`.

**Zone 3 — head-to-head card** (rendered when `headToHead && focusDisplay && focusIdx >= 0`, where `focusIdx` is derived the same way Task 6 derives it: `artifact.candidates.findIndex((c) => cleanCandidateName(c) === cleanCandidateName(focusedCandidate!))`). A rival `<select>` (all other candidates, surnames; default = the highest-R1-votes rival) + copy lines:

```tsx
const n = artifact.candidates.length
const f = focusIdx, r = rivalIdx
const fb = headToHead.prefersBoth[f * n + r]
const rb = headToHead.prefersBoth[r * n + f]
const fi = headToHead.prefers[f * n + r]
const ri = headToHead.prefers[r * n + f]
const fName = leaderDisplayName(cleanCandidateName(artifact.candidates[f]))
const rName = leaderDisplayName(cleanCandidateName(artifact.candidates[r]))
const [amongWinner, amongLoser, aw, al] = fb >= rb ? [fName, rName, fb, rb] : [rName, fName, rb, fb]
const [inclWinner, inclLoser, iw, il] = fi >= ri ? [fName, rName, fi, ri] : [rName, fName, ri, fi]
```

Line 1 (always): `Among ballots ranking both, {amongWinner} beats {amongLoser} {aw.toLocaleString()} to {al.toLocaleString()}.`
Line 2 (**the divergence disclosure — render ONLY when `amongWinner !== inclWinner`**, the probe-verified D11 Chen/Lai edge): `Counting every ballot that ranked either, {inclWinner} leads {iw.toLocaleString()} to {il.toLocaleString()}.` (nano, slightly emphasized — this line prevents the card from contradicting the verdict).
Verdict line (gated): when `headToHead.condorcetWinner === f`: `{fName} beats every other candidate head-to-head.` When the focus loses every inclusive pairing (compute: for every c ≠ f, `prefers[f*n+c] < prefers[c*n+f]`): `{fName} loses to every other candidate head-to-head.` Otherwise no verdict line. Never the word "Condorcet".

- [ ] **Step 2: Verify.** `npx tsc -b` — expected: clean.

- [ ] **Step 3: Commit.**

```bash
git add src/views/Elections/panels/CoalitionPanel.tsx
git commit -m "feat(elections): CoalitionPanel — roster picker, next-choice bars, head-to-head card"
```

---

### Task 6: Elections wiring — ship the lens

**Files:**
- Modify: `src/views/Elections/rcvLens.ts` (one line), `src/views/Elections/rcvLens.test.ts`, `src/views/Elections/Elections.tsx`, `src/views/Elections/map/PrecinctFillLayer.tsx`

**Interfaces:**
- Consumes: everything Tasks 1–5 produced. Exact seam locations (verified 2026-07-21 against `750bf6a`): lens strip 737–758, `setLens` 145–153, `lensAvailable` 205–215, `focusedCandidate` read 72 / setter 110–117, `activeFocusCandidate` 447–448, panel switch 925–957, collapsed chip 876–878, panel maxWidth 863–865, `useCVRBallots` 341–343, `useReplayModel` 347, `replayQuartiles` memo 360–372, `replayOption` 379–385, `replayLegendState` 393–414, `PrecinctFillLayer` JSX 809–822, legend JSX ~985–993.

- [ ] **Step 1: Flip the registry.** In `rcvLens.ts`: `export const SHIPPED_LENSES: readonly RcvLens[] = ['replay', 'coalition']`. Update `rcvLens.test.ts`'s pinning expectations deliberately (the test exists to make this flip a conscious act): `parseLens('coalition')` now returns `'coalition'`; `'whatif'` still parses to null; SHIPPED_LENSES deep-equals `['replay', 'coalition']`.

- [ ] **Step 2: Run the lens tests.** `npx vitest run src/views/Elections/rcvLens.test.ts` — expected: PASS after the deliberate pin update.

- [ ] **Step 3: Wire Elections.tsx.** All additions; keep existing replay code untouched:

1. Imports: `computeSecondChoices, computeHeadToHead, coalitionPaintRows` from `@/lib/rcv/coalition`; `CoalitionPanel` from `./panels/CoalitionPanel`.
2. Widen the artifact fetch gate (line ~342): `activeLens === 'replay' || activeLens === 'coalition'`.
3. After the replay memos (~line 414), the coalition memos:

```tsx
const coalitionFocus = useMemo(() => {
  if (activeLens !== 'coalition' || !cvrArtifact || !focusedCandidate) return null
  const clean = cleanCandidateName(focusedCandidate)
  const idx = cvrArtifact.candidates.findIndex((c) => cleanCandidateName(c) === clean)
  if (idx < 0) return null
  return { idx, display: leaderDisplayName(clean) }
}, [activeLens, cvrArtifact, focusedCandidate])

const secondChoices = useMemo(
  () => (coalitionFocus && replayModel ? computeSecondChoices(replayModel.ballots, coalitionFocus.idx) : null),
  [coalitionFocus, replayModel],
)

const coalitionPaint = useMemo(
  () => (secondChoices && cvrArtifact ? coalitionPaintRows(secondChoices, cvrArtifact) : null),
  [secondChoices, cvrArtifact],
)

// Race-relative quartiles over PAINTED rows + the floor-suppressed count the
// legend discloses. Mirror the replayQuartiles memo (≈360–372): filter both
// through the SAME turnout-label set it uses, so withheld/"0000" ids in the
// artifact can't skew the cutpoints or inflate the disclosure.
const coalitionQuartiles = useMemo(() => {
  if (!coalitionPaint) return null
  const shares: number[] = []
  for (const [label, row] of Object.entries(coalitionPaint.rows)) {
    if (/* label present in the same turnout set replayQuartiles uses */) shares.push(row.dominantShare)
  }
  return leaderShareQuartiles(shares)
}, [coalitionPaint /* + the turnout dep replayQuartiles uses */])

const coalitionSuppressedShown = useMemo(() => {
  if (!coalitionPaint) return 0
  return coalitionPaint.suppressedIds.filter((id) => /* id in the same turnout set */).length
}, [coalitionPaint /* + turnout dep */])

const headToHead = useMemo(
  () =>
    activeLens === 'coalition' && replayModel && cvrArtifact
      ? computeHeadToHead(replayModel.ballots, cvrArtifact.candidates)
      : null,
  [activeLens, replayModel, cvrArtifact],
)

const coalitionOption = useMemo(
  () =>
    activeLens === 'coalition' && coalitionPaint && coalitionFocus
      ? { rows: coalitionPaint.rows, quartiles: coalitionQuartiles, focusDisplay: coalitionFocus.display }
      : undefined,
  [activeLens, coalitionPaint, coalitionQuartiles, coalitionFocus],
)

const coalitionLegendState = useMemo(() => {
  if (activeLens !== 'coalition' || !coalitionFocus || !secondChoices || !cvrArtifact) return undefined
  const total = secondChoices.total
  const recipients = Array.from(secondChoices.next, (votes, i) => ({ name: cvrArtifact.candidates[i], votes }))
    .filter((r) => r.votes > 0)
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 5)
    .map((r) => ({ ...r, pct: total > 0 ? (r.votes / total) * 100 : 0 }))
  return {
    focusDisplay: coalitionFocus.display,
    cohort: total,
    recipients,
    nonePct: total > 0 ? (secondChoices.none / total) * 100 : 0,
    overvoteCount: secondChoices.overvote,
    suppressedCount: coalitionSuppressedShown,
    withheldCount: cvrArtifact.sovSuppressed.length,
  }
}, [activeLens, coalitionFocus, secondChoices, cvrArtifact, coalitionSuppressedShown])
```

(The two `/* turnout set */` holes: read the replayQuartiles memo body at 360–372 and reuse its exact label-source expression — the plan can't quote it because it's the one seam the inventory didn't capture verbatim. It is three lines; match it exactly, same deps.)

4. `PrecinctFillLayer`: add `coalition={coalitionOption}` beside `replay={replayOption}` (~819); in `PrecinctFillLayer.tsx` add the `coalition` prop (type = `BuildPrecinctOptions['coalition']`), pass through to `buildPrecinctFeatures`, add to the memo deps.
5. Legend (~985–993): `coalitionState={coalitionLegendState}` and `coalitionPrompt={activeLens === 'coalition' && !coalitionFocus}`.
6. Panel arm (switch at 925):

```tsx
case 'coalition':
  return cvrArtifact ? (
    <CoalitionPanel
      rcvData={rcvData}
      artifact={cvrArtifact}
      candidateColors={candidateColors}
      focusedCandidate={focusedCandidate}
      onFocusCandidate={setFocusedCandidate}
      secondChoices={secondChoices}
      headToHead={headToHead}
      focusDisplay={coalitionFocus?.display ?? null}
    />
  ) : (
    <p className="text-micro text-slate-400 px-2 py-3">Loading ballots…</p>
  )
```

7. Panel maxWidth (863–865): widen the wide branch to include coalition — `(activeLens === null && rcvViewMode === 'flow') || activeLens === 'coalition'` → the 648px arm (the bars + head-to-head need the room).
8. Collapsed chip (876–878), sibling line:

```tsx
{rcvCollapsed && activeLens === 'coalition' && (
  <> &middot; COALITION{coalitionFocus ? <> &middot; {coalitionFocus.display}</> : null}</>
)}
```

- [ ] **Step 4: Full verification.** `npx vitest run` — all suites green. `npx tsc -b` — clean.

- [ ] **Step 5: Commit.**

```bash
git add src/views/Elections/rcvLens.ts src/views/Elections/rcvLens.test.ts src/views/Elections/Elections.tsx src/views/Elections/map/PrecinctFillLayer.tsx
git commit -m "feat(elections): ship the COALITION lens — registry flip + view wiring"
```

---

### Task 7: Precinct-click composition bar

**Files:**
- Modify: `src/views/Elections/panels/PrecinctDetailPanel.tsx`, `src/views/Elections/Elections.tsx`

**Interfaces:**
- Consumes: `secondChoices`, `coalitionFocus`, `cvrArtifact` memos from Task 6; the panel's existing props (rendered at Elections 970–980, per-candidate rows at PrecinctDetailPanel 139–185).
- Produces: `PrecinctDetailPanelProps.coalition?: { focusDisplay: string; cohort: number; segments: { name: string; votes: number; color: string }[]; none: number; overvote: number }`.

- [ ] **Step 1: Compute the detail in Elections.tsx** (beside the other coalition memos; `selectedPrecinct` is the `?precinct=` label):

```tsx
const coalitionDetail = useMemo(() => {
  if (!secondChoices || !cvrArtifact || !coalitionFocus || !selectedPrecinct) return undefined
  const p = cvrArtifact.precincts.indexOf(selectedPrecinct)
  if (p < 0) return undefined
  const pp = secondChoices.byPrecinct[p]
  if (pp.total === 0) return undefined
  const segments = Array.from(pp.next, (votes, i) => ({ name: cvrArtifact.candidates[i], votes }))
    .filter((s) => s.votes > 0)
    .sort((a, b) => b.votes - a.votes)
    .map((s) => ({
      name: leaderDisplayName(cleanCandidateName(s.name)),
      votes: s.votes,
      color: candidateColors.get(s.name) ?? '#a8926a',
    }))
  return { focusDisplay: coalitionFocus.display, cohort: pp.total, segments, none: pp.none, overvote: pp.overvote }
}, [secondChoices, cvrArtifact, coalitionFocus, selectedPrecinct, candidateColors])
```

Pass `coalition={coalitionDetail}` to `<PrecinctDetailPanel>` (~970–980).

- [ ] **Step 2: Render the section in PrecinctDetailPanel.** New optional prop; when present, a section styled like the panel's existing blocks, placed above the per-candidate vote rows (139–185). CUNY lesson: per-precinct detail = stacked composition, never a per-precinct sankey.

```tsx
{coalition && (
  <div className="mt-3">
    <p className={/* the panel's existing eyebrow classes */}>
      ── WHERE {coalition.focusDisplay.toUpperCase()} VOTERS WENT NEXT
    </p>
    <p className="text-nano text-slate-400 mb-1.5">
      {coalition.cohort.toLocaleString()} ballots ranked {coalition.focusDisplay} first here
    </p>
    {/* single stacked composition bar — RCVComposition segment idiom */}
    <div className="h-[18px] rounded overflow-hidden flex w-full">
      {coalition.segments.map((s) => (
        <div
          key={s.name}
          className="h-full flex-shrink-0"
          title={`${s.name} — ${s.votes.toLocaleString()}`}
          style={{ width: `${(s.votes / coalition.cohort) * 100}%`, background: s.color, opacity: 0.92 }}
        />
      ))}
      {(coalition.none + coalition.overvote) > 0 && (
        <div
          className="h-full flex-shrink-0"
          title={`No next choice — ${(coalition.none + coalition.overvote).toLocaleString()}`}
          style={{ width: `${((coalition.none + coalition.overvote) / coalition.cohort) * 100}%`, background: '#a8926a', opacity: 0.55 }}
        />
      )}
    </div>
    {/* top-3 rows beneath, micro register */}
    {coalition.segments.slice(0, 3).map((s) => (
      <div key={s.name} className="flex items-center gap-1.5 mt-1">
        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
        <span className="text-micro flex-1 truncate">{s.name}</span>
        <span className="text-nano font-mono text-slate-400 tabular-nums">
          {Math.round((s.votes / coalition.cohort) * 100)}%
        </span>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3: Verify.** `npx tsc -b` clean; `npx vitest run` green.

- [ ] **Step 4: Commit.**

```bash
git add src/views/Elections/panels/PrecinctDetailPanel.tsx src/views/Elections/Elections.tsx
git commit -m "feat(elections): precinct coalition composition bar in the detail panel"
```

---

### Task 8: Full verification + headless browser gate

**Files:**
- No production files. QA harness in the session scratchpad (puppeteer-core against the tarmac `datadiver-preview` server, port 4173 — the PR 1 harness pattern).

- [ ] **Step 1: Full local gates.**

Run, in order:
1. `npx vitest run` → all green.
2. `npx tsc -b` → clean.
3. `~/dev/devman/tools/devman-build.mjs pnpm build` → exit 0 (records ship-health).

- [ ] **Step 2: Restart the preview server on the fresh build** (tarmac `datadiver-preview`), then run headless probes (puppeteer-core, `defaultViewport: {width: 1728, height: 1000}`, `--use-angle=swiftshader`):

1. `/elections?election=20241105&race=mayor` → lens strip shows `Replay` AND `Coalition` buttons.
2. Click `Coalition` → URL gains `?lens=coalition`; legend shows the prompt line; map still paints (ordinary results).
3. Click a roster row (Peskin) in the panel → URL gains `&candidate=`; legend flips to `Where Peskin voters went next`; recipients render with pcts; suppressed footer ABSENT for majors is fine (count 1 → present with "1 precinct").
4. Cold-load deep link `/elections?election=20241105&race=mayor&lens=coalition&candidate=AARON%20PESKIN` → paints coalition (probe a feature's `tipLeaderPhrase` contains `next choice of`), panel shows bars + head-to-head.
5. Cold-load `?lens=coalition&candidate=…` PLUS `map_mode=turnout` → coalition still paints (the mapMode-gate bypass).
6. D11 race + focus CHEN, rival LAI → head-to-head card renders BOTH the among-both line (Lai leads) and the divergence line (Chen leads inclusive) — the probe-pinned edge.
7. Lens switch coalition → replay → `?candidate=` still in URL but replay paints; back to coalition → coalition paints again (param survives, spec behavior).
8. `?lens=whatif` cold load → parses to null, no lens, normal view.
9. Time Machine open while coalition active → lens suspends (param kept), TM works; close → coalition returns.
10. Collapsed chip shows `· COALITION · Peskin`.
11. Zero page errors on all probes (`page.on('pageerror')`).

Compute every numeric expectation from the committed artifacts BEFORE writing assertions (the PR 1 lesson: probe expectations are code too).

- [ ] **Step 3: Commit any fixes**, re-run the failing probe, then hand off to the final whole-branch review (SDD process).

## Self-review checklist (run before execution)

- Spec §4.4 coverage: floor+disclosure (T1/T4/T6), picker/bars/head-to-head (T5), focus-gate bypass (T3 precedence + T6 memos read raw `focusedCandidate`), legend variant (T4), precinct composition (T7), `SHIPPED_LENSES` append (T6), prompt state (T4/T5), copy register (T3/T4/T5 verbatim strings).
- Types consistent: `CoalitionPaintRow` (T1) = precinctJoin's import (T3) = `coalitionOption` (T6); `PrecinctLegendCoalitionState` (T4) = `coalitionLegendState` (T6); `CoalitionPanelProps` (T5) = the arm's props (T6).
- The two deliberate non-verbatim holes (turnout-set expression in T6's quartile/suppressed memos) are location-pinned (Elections.tsx 360–372) with exact matching instructions — not placeholders.
