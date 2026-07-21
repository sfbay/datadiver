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
