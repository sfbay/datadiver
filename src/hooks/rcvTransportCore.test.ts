// src/hooks/rcvTransportCore.test.ts
//
// Pure-logic coverage for the RCV transport clock's math — clamping a round
// index, deciding whether a round received transfers, picking an autoplay
// dwell, and finding who was just eliminated into a round. This core was
// lifted out of RCVRoundChart (see rcvFlow.test.ts for the sibling transfer-
// derivation fixture pattern this file follows) so useRcvTransport and the
// chart can share one tested source of truth.

import { describe, it, expect } from 'vitest'
import type { RCVRound } from '@/types/elections'
import {
  BASE_DWELL_MS,
  TRANSFER_DWELL_MS,
  TRANSFER_WINDOW_MS,
  clampRound,
  roundReceivedTransfers,
  dwellFor,
  eliminatedIntoRound,
} from './rcvTransportCore'

/** Minimal RCVRound fixture — only `name`/`isEliminated` vary per test, the
 *  rest of RCVCandidateRound's required fields are filled with placeholder
 *  values no test here reads. */
function mkRound(candidates: { name: string; isEliminated: boolean }[]): RCVRound {
  return {
    round: 1,
    candidates: candidates.map((c) => ({
      name: c.name,
      votes: 100,
      percentage: 0.5,
      transfer: 0,
      isEliminated: c.isEliminated,
      isLeader: false,
    })),
    continuingTotal: 100,
    exhausted: 0,
    overvotes: 0,
    blanks: 0,
  }
}

// Round 0 eliminates B; round 1 (viewed) reflects that transfer; round 2
// eliminates nobody entering it.
const ROUNDS: RCVRound[] = [
  mkRound([{ name: 'A', isEliminated: false }, { name: 'B', isEliminated: true }]),
  mkRound([{ name: 'A', isEliminated: false }, { name: 'C', isEliminated: false }]),
  mkRound([{ name: 'A', isEliminated: false }]),
]

const NO_TRANSFER_ROUNDS: RCVRound[] = [
  mkRound([{ name: 'A', isEliminated: false }]),
  mkRound([{ name: 'A', isEliminated: false }]),
]

describe('constants', () => {
  it('pin the containment-invariant values exactly', () => {
    expect(BASE_DWELL_MS).toBe(1500)
    expect(TRANSFER_DWELL_MS).toBe(3400)
    expect(TRANSFER_WINDOW_MS).toBe(3000)
  })
})

describe('clampRound', () => {
  it('clamps a negative round up to 0', () => {
    expect(clampRound(-5, 3)).toBe(0)
  })

  it('clamps a too-large round down to totalRounds - 1', () => {
    expect(clampRound(10, 3)).toBe(2)
  })

  it('passes an in-range round through unchanged', () => {
    expect(clampRound(1, 3)).toBe(1)
  })

  it('returns 0 when totalRounds is 0, regardless of input', () => {
    expect(clampRound(5, 0)).toBe(0)
    expect(clampRound(-5, 0)).toBe(0)
    expect(clampRound(0, 0)).toBe(0)
  })
})

describe('roundReceivedTransfers', () => {
  it('is false for round 0 (no previous round exists)', () => {
    expect(roundReceivedTransfers(ROUNDS, 0)).toBe(false)
  })

  it('is true when the previous round has an isEliminated candidate', () => {
    expect(roundReceivedTransfers(ROUNDS, 1)).toBe(true)
  })

  it('is false when the previous round eliminated nobody', () => {
    expect(roundReceivedTransfers(NO_TRANSFER_ROUNDS, 1)).toBe(false)
  })
})

describe('dwellFor', () => {
  it('returns TRANSFER_DWELL_MS for a transfer round without reduced motion', () => {
    expect(dwellFor(ROUNDS, 1, false)).toBe(TRANSFER_DWELL_MS)
  })

  it('returns BASE_DWELL_MS for a transfer round under reduced motion', () => {
    expect(dwellFor(ROUNDS, 1, true)).toBe(BASE_DWELL_MS)
  })

  it('returns BASE_DWELL_MS for a non-transfer round regardless of reduced motion', () => {
    expect(dwellFor(NO_TRANSFER_ROUNDS, 1, false)).toBe(BASE_DWELL_MS)
    expect(dwellFor(NO_TRANSFER_ROUNDS, 1, true)).toBe(BASE_DWELL_MS)
  })

  it('returns BASE_DWELL_MS for round 0', () => {
    expect(dwellFor(ROUNDS, 0, false)).toBe(BASE_DWELL_MS)
  })
})

describe('eliminatedIntoRound', () => {
  it('is [] for round 0', () => {
    expect(eliminatedIntoRound(ROUNDS, 0)).toEqual([])
  })

  it("returns the previous round's eliminated names", () => {
    expect(eliminatedIntoRound(ROUNDS, 1)).toEqual(['B'])
  })

  it('is [] when the previous round eliminated nobody', () => {
    expect(eliminatedIntoRound(NO_TRANSFER_ROUNDS, 1)).toEqual([])
  })
})
