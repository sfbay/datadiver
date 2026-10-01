// The disappeared log's pure diff (gate G5 + ruling R3), on small synthetic
// snapshots. The committed disappeared.json is the honest first-run file
// (no runs yet); this is where the second-run logic is proven.
import { describe, expect, it } from 'vitest'
import { diffSnapshots, nextDisappearedLog, type SnapshotIdentity } from '../build-trees'

const prior: SnapshotIdentity = {
  asOf: '2026-09-01',
  species: ['Platanus x hispanica :: Sycamore, London Plane', 'Lophostemon confertus :: Brisbane Box', 'Stump'],
  id: [10, 11, 12, 13, 14, 15],
  sp: [0, 1, 0, -1, 2, 1],
  yr: [2001, 0, 1998, 0, 0, 2010],
}
// 11 left the inventory; 12 changed species; 15 changed planting year;
// 13 went from NULL species to a string; 16 is new (never reported); the
// species table is re-ordered (indexes differ, strings don't — not a change).
const now: SnapshotIdentity = {
  asOf: '2026-10-01',
  species: ['Lophostemon confertus :: Brisbane Box', 'Platanus x hispanica :: Sycamore, London Plane', 'Stump'],
  id: [16, 15, 14, 13, 12, 10],
  sp: [0, 0, 2, 1, 0, 1],
  yr: [2026, 2024, 0, 0, 1998, 2001],
}

describe('diffSnapshots', () => {
  it('records gone sites and species OR planting-year changes, by id', () => {
    expect(diffSnapshots(prior, now)).toEqual({
      from: '2026-09-01',
      to: '2026-10-01',
      gone: [11],
      changed: [
        { id: 12, was: 'Platanus x hispanica :: Sycamore, London Plane', now: 'Lophostemon confertus :: Brisbane Box', plantedWas: 1998, plantedNow: 1998 },
        { id: 13, was: '', now: 'Platanus x hispanica :: Sycamore, London Plane', plantedWas: 0, plantedNow: 0 },
        { id: 15, was: 'Lophostemon confertus :: Brisbane Box', now: 'Lophostemon confertus :: Brisbane Box', plantedWas: 2010, plantedNow: 2024 },
      ],
    })
  })
  it('an identical snapshot diffs to nothing', () => {
    expect(diffSnapshots(prior, { ...prior, asOf: '2026-10-01' })).toEqual({ from: '2026-09-01', to: '2026-10-01', gone: [], changed: [] })
  })
})

describe('nextDisappearedLog — gate G5', () => {
  it('first run: tracking begins today, no runs', () => {
    expect(nextDisappearedLog(null, now, null)).toMatchObject({ ok: true, log: { trackingSince: '2026-10-01', runs: [] } })
  })
  it('same asOf: the file is left untouched', () => {
    expect(nextDisappearedLog({ ...prior, asOf: '2026-10-01' }, now, { trackingSince: '2026-09-01', runs: [] }))
      .toMatchObject({ ok: true, log: null })
  })
  it('a prior snapshot dated AFTER this run fails the gate', () => {
    expect(nextDisappearedLog({ ...prior, asOf: '2026-11-01' }, now, null)).toMatchObject({ ok: false, log: null })
  })
  it('a later run appends to the existing log without mutating it', () => {
    const existing = { trackingSince: '2026-08-01', runs: [{ from: '2026-08-01', to: '2026-09-01', gone: [9], changed: [] }] }
    const out = nextDisappearedLog(prior, now, existing)
    expect(out.ok).toBe(true)
    expect(out.log!.trackingSince).toBe('2026-08-01')
    expect(out.log!.runs).toHaveLength(2)
    expect(out.log!.runs[1]).toEqual(diffSnapshots(prior, now))
    expect(existing.runs).toHaveLength(1)
  })
  it('a prior snapshot with no log starts tracking at the prior asOf', () => {
    expect(nextDisappearedLog(prior, now, null).log!.trackingSince).toBe('2026-09-01')
  })
})
