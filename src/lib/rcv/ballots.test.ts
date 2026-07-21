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
  it('throws on an out-of-range precinct index in a group', () => {
    // 2 precincts (idx 0,1) — 5 is out of range.
    expect(() => decodeBallots({ ...artifact, groups: [5, 0, 10] })).toThrow(/precinct index/)
  })
  it('throws on an out-of-range pattern index in a group', () => {
    // 4 patterns (idx 0-3) — 9 is out of range.
    expect(() => decodeBallots({ ...artifact, groups: [0, 9, 10] })).toThrow(/pattern index/)
  })
})
