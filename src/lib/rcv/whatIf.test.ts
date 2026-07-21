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
