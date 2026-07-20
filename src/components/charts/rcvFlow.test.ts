// src/components/charts/rcvFlow.test.ts
//
// Pure-logic coverage for the RCV transfer derivation + ribbon path math
// shared by RCVRoundChart and RCVSankey. Fixture is real data from
// public/data/elections/results/20241105/rcv/member-board-of-supervisors-district-3.json
// (rounds 1 and 2) — see the plan's "Resolved ambiguities" §3 for the
// conservation-of-votes proof that pins the expected numbers below.

import { describe, it, expect } from 'vitest'
import { computeRoundTransfers, computeVictoryComposition, ribbonPath, EXHAUSTED_SINK } from './rcvFlow'
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

// Synthetic round 3 continuing the real fixture: WENDY HA CHAU (round 2's
// flagged eliminee, 1,661 votes) redistributes — 800 to Sauter, 500 to Lai,
// 200 to Jamil, 153 exhausted, 8 to overvotes drift. Numbers chosen to
// conserve exactly (800+500+200+153+8 = 1,661).
const ROUND_3: RCVRound = {
  round: 3,
  candidates: [
    { name: 'DANNY SAUTER', votes: 12326, percentage: 0.436, transfer: 800, isEliminated: false, isLeader: true },
    { name: 'SHARON LAI', votes: 9109, percentage: 0.322, transfer: 500, isEliminated: false, isLeader: false },
    { name: 'MOE JAMIL', votes: 4053, percentage: 0.1434, transfer: 200, isEliminated: false, isLeader: false },
    { name: 'MATTHEW SUSK', votes: 2954, percentage: 0.1045, transfer: 0, isEliminated: false, isLeader: false },
    { name: 'WENDY HA CHAU', votes: 0, percentage: 0, transfer: 0, isEliminated: false, isLeader: false },
    { name: 'EDUARD NAVARRO', votes: 0, percentage: 0, transfer: 0, isEliminated: false, isLeader: false },
  ],
  continuingTotal: 28442,
  exhausted: 306,
  overvotes: 86,
  blanks: 4838,
}

describe('computeVictoryComposition', () => {
  const composition = computeVictoryComposition([ROUND_1, ROUND_2, ROUND_3])

  it('lists final-round vote holders descending, excluding zeroed-out candidates', () => {
    expect(composition.finalists.map((f) => f.name)).toEqual([
      'DANNY SAUTER', 'SHARON LAI', 'MOE JAMIL', 'MATTHEW SUSK',
    ])
  })

  it('conserves every finalist: firstChoice + Σ gains === finalVotes', () => {
    for (const f of composition.finalists) {
      const gained = f.gains.reduce((s, g) => s + g.amount, 0)
      expect(f.firstChoice + gained).toBe(f.finalVotes)
    }
  })

  it('attributes gains to the arrival round\'s donor, in round order', () => {
    const sauter = composition.finalists[0]
    expect(sauter.gains).toEqual([
      { round: 2, donorNames: ['EDUARD NAVARRO'], isBatch: false, amount: 254 },
      { round: 3, donorNames: ['WENDY HA CHAU'], isBatch: false, amount: 800 },
    ])
    // Susk gained only from Navarro — no round-3 entry fabricated.
    const susk = composition.finalists[3]
    expect(susk.gains).toEqual([
      { round: 2, donorNames: ['EDUARD NAVARRO'], isBatch: false, amount: 154 },
    ])
  })

  it('conserves exhausted ballots: initial + Σ gains === final', () => {
    const { initial, final, gains } = composition.exhausted
    expect(initial + gains.reduce((s, g) => s + g.amount, 0)).toBe(final)
    expect(final).toBe(306)
  })

  it('records elimination events in round order for the legend', () => {
    expect(composition.events).toEqual([
      { round: 2, donorNames: ['EDUARD NAVARRO'], isBatch: false },
      { round: 3, donorNames: ['WENDY HA CHAU'], isBatch: false },
    ])
  })

  it('degenerates cleanly on empty input', () => {
    expect(computeVictoryComposition([])).toEqual({
      finalists: [],
      exhausted: { initial: 0, final: 0, gains: [] },
      events: [],
    })
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
