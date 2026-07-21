import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CVRBallotArtifact, RCVContest } from '../../types/elections'
import { decodeBallots, type DecodedBallots } from './ballots'
import {
  COALITION_FLOOR,
  coalitionPaintRows,
  computeHeadToHead,
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
    // cleanCandidateName strips ONLY "\n(PARTY)" suffixes — names stay verbatim;
    // this is the colorMap-key contract (candidateColors keys are RAW certified names);
    // never title-case here
    expect(rows['1002'].dominant).toBe('BOB BBB')
    expect(rows['1002'].dominantShare).toBeCloseTo(9 / 11)
  })
})

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
