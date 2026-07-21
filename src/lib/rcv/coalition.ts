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
