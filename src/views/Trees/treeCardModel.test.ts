// src/views/Trees/treeCardModel.test.ts
import { describe, expect, it } from 'vitest'
import type { SpeciesAggregate, TreesSnapshot } from '@/lib/trees/types'
import {
  buildCardModel, cardState, inventoryWhere, noticesWhere, readBelongsTo, rowsForSite, snapshotSite, speciesRank,
  type SettledRead,
} from './treeCardModel'

const base = { siteId: 92401, asOf: '2026-09-30' }
describe('cardState — never a blank, never an endless spinner', () => {
  it('loading while the live read is out', () => {
    expect(cardState({ ...base, inSnapshot: true, snapshotKind: 'tree', loading: true, error: null, row: null })).toEqual({ kind: 'loading' })
  })
  it('in the snapshot but gone live: it left the inventory', () => {
    expect(cardState({ ...base, inSnapshot: true, snapshotKind: 'tree', loading: false, error: null, row: null }))
      .toEqual({ kind: 'left', asOf: '2026-09-30', rowKind: 'tree' })
  })
  it('a stump that left the inventory carries its own kind, so nothing is said about a tree', () => {
    expect(cardState({ ...base, inSnapshot: true, snapshotKind: 'stump', loading: false, error: null, row: null }))
      .toEqual({ kind: 'left', asOf: '2026-09-30', rowKind: 'stump' })
  })
  it('in neither: an unknown number', () => {
    expect(cardState({ ...base, inSnapshot: false, snapshotKind: null, loading: false, error: null, row: null })).toEqual({ kind: 'unknown' })
  })
  it('a failed read is an error with a retry, not "left the inventory"', () => {
    expect(cardState({ ...base, inSnapshot: true, snapshotKind: 'tree', loading: false, error: 'timeout', row: null }))
      .toEqual({ kind: 'error', message: 'timeout' })
  })
  it('an error outranks a row: a half-read card is never shown as whole', () => {
    const row = { treeid: '92401', species: 'Ginkgo biloba :: Maidenhair Tree' }
    expect(cardState({ ...base, inSnapshot: true, snapshotKind: 'tree', loading: false, error: 'timeout', row }).kind).toBe('error')
  })
  it('no live row and the snapshot still loading: wait, never guess "unknown"', () => {
    expect(cardState({ ...base, inSnapshot: false, snapshotKind: null, loading: false, error: null, row: null, snapshot: 'loading' }))
      .toEqual({ kind: 'loading' })
  })
  it('no live row and the snapshot failed: an error with a retry, never "unknown"', () => {
    expect(cardState({ ...base, inSnapshot: false, snapshotKind: null, loading: false, error: null, row: null, snapshot: { failed: 'snapshot 503' } }))
      .toEqual({ kind: 'error', message: 'snapshot 503' })
  })
  it('a live row renders without waiting for the snapshot', () => {
    const row = { treeid: '92401', species: 'Ginkgo biloba :: Maidenhair Tree' }
    expect(cardState({ ...base, inSnapshot: false, snapshotKind: null, loading: false, error: null, row, snapshot: 'loading' }).kind).toBe('site')
  })
  it('live but newer than the snapshot still renders', () => {
    const row = { treeid: '300001', species: 'Ginkgo biloba :: Maidenhair Tree' }
    expect(cardState({ ...base, inSnapshot: false, snapshotKind: null, loading: false, error: null, row }).kind).toBe('site')
  })
})

describe('buildCardModel', () => {
  const row = {
    treeid: '4155', species: 'Lophostemon confertus :: Brisbane Box', description: '3723 Cesar Chavez St | Tree 1',
    planteddate: '2026-05-07', mapdbh: '3', legalstatus: 'DPW Maintained', planter: 'DPW', waterresponsibility: 'DPW',
    siteinfo: 'Sidewalk: Curb side : Cutout', plotsize: '3x3', analysis_neighborhood: 'Mission',
  }
  const notices = [{ treeid: '4155', posteddate: '2018-02-27T00:00:00.000', postedtype: 'Posted 30 Day' }]
  const m = buildCardModel(row, notices, { fallsNearby: 2, rank: 2, ranked: 544 }, 2026)
  it('names the tree and its place', () => {
    expect(m.title).toBe('Brisbane Box')
    expect(m.latin).toBe('Lophostemon confertus')
    expect(m.address).toBe('3723 Cesar Chavez St')
    expect(m.kind).toBe('tree')
    expect(m.species).toBe('Lophostemon confertus :: Brisbane Box')
    expect(m.neighborhood).toBe('Mission')
  })
  it('a notice older than the planting date is an earlier tree\'s', () => {
    expect(m.notices).toEqual(['A removal notice (30-day) was posted for an earlier tree at this site on Feb. 27, 2018.'])
  })
  it('a notice after the planting date is this site\'s, never a removal', () => {
    const later = buildCardModel(row, [{ treeid: 'TRE-4155', posteddate: '2026-06-26T00:00:00.000', postedtype: 'Posted 15 Day' }],
      { fallsNearby: 0, rank: 2, ranked: 544 }, 2026)
    expect(later.notices).toEqual(['A removal notice (15-day) was posted at this site on June 26.'])
  })
  it('a notice with no posted date is still listed, undated', () => {
    const undated = buildCardModel(row, [{ treeid: '4155', posteddate: '', postedtype: 'Posted 30 Day' }],
      { fallsNearby: 0, rank: 2, ranked: 544 }, 2026)
    expect(undated.notices).toEqual(['A removal notice with no posted date is on record for this site.'])
  })
  it('trunk, planting, rank and nearby reports', () => {
    expect(m.trunk).toBe('3 inches (10 inches or narrower)')
    expect(m.planted).toBe('Planted May 7')
    expect(m.plantedDate).toBe('May 7')
    expect(m.rankLine).toBe('No. 2 of 544 recorded species')
    expect(m.falls).toBe('2 fall reports within 30 meters since 2021.')
  })
  it('the city record is the row itself on the portal', () => {
    expect(m.portalUrl).toBe('https://data.sf.gov/resource/tkzw-k3nq.json?treeid=4155')
  })
  it('missing fields say so plainly', () => {
    const bare = buildCardModel({ treeid: '9', species: 'Tree(s) ::' }, [], { fallsNearby: 0, rank: null, ranked: 544 }, 2026)
    expect(bare.title).toBe('Species not recorded')
    expect(bare.latin).toBeNull()
    expect(bare.species).toBeNull()
    expect(bare.planted).toBe('Planting date not recorded')
    expect(bare.plantedDate).toBeNull()
    expect(bare.trunk).toBe('Not measured')
    expect(bare.rankLine).toBeNull()
    expect(bare.notices).toEqual([])
    expect(bare.address).toBe('Address not recorded')
    expect(bare.legalStatus).toBeNull()
  })
  it('a site not in the snapshot carries no nearby-reports line', () => {
    expect(buildCardModel(row, [], { fallsNearby: null, rank: 2, ranked: 544 }, 2026).falls).toBeNull()
  })
  it('a stump is titled as one', () => {
    const stump = buildCardModel({ treeid: '7', species: 'Stump :: Stump' }, [], { fallsNearby: 0, rank: null, ranked: 544 }, 2026)
    expect(stump.title).toBe('Stump')
    expect(stump.kind).toBe('stump')
    expect(stump.latin).toBeNull()
  })
  it('empty sites and shrubs are titled as what they are', () => {
    expect(buildCardModel({ treeid: '8', species: ':: Planting Site' }, [], { fallsNearby: 0, rank: null, ranked: 544 }, 2026).title)
      .toBe('Empty planting site')
    expect(buildCardModel({ treeid: '8', species: 'Shrub :: Shrub' }, [], { fallsNearby: 0, rank: null, ranked: 544 }, 2026).title)
      .toBe('Shrub')
  })
  it('one-inch and fractional trunks read naturally', () => {
    expect(buildCardModel({ treeid: '1', species: 'A :: B', mapdbh: '1' }, [], { fallsNearby: 0, rank: null, ranked: 1 }, 2026).trunk)
      .toBe('1 inch (10 inches or narrower)')
    expect(buildCardModel({ treeid: '1', species: 'A :: B', mapdbh: '24.5' }, [], { fallsNearby: 0, rank: null, ranked: 1 }, 2026).trunk)
      .toBe('24.5 inches (21 inches or wider)')
  })
  it('a planting year other than this one carries the year', () => {
    expect(buildCardModel({ treeid: '1', species: 'A :: B', planteddate: '1998-03-04T00:00:00.000' }, [],
      { fallsNearby: 0, rank: null, ranked: 1 }, 2026).planted).toBe('Planted March 4, 1998')
  })
})

describe('snapshotSite', () => {
  const snap: Pick<TreesSnapshot, 'id' | 'kind' | 'fl' | 'x' | 'y'> = {
    id: [10, 20, 30], kind: [0, 1, 2], fl: [3, 0, 1], x: [58094, -1, 58100], y: [78896, -1, 78900],
  }
  it('finds a site and reads its kind, nearby reports and point', () => {
    const s = snapshotSite(snap, 10)!
    expect(s.kind).toBe('tree')
    expect(s.fallsNearby).toBe(3)
    expect(s.center![0]).toBeCloseTo(-122.41906, 5)
    expect(s.center![1]).toBeCloseTo(37.78896, 5)
  })
  it('a site with no published point has no center and NO nearby count (nothing was measured around it)', () => {
    expect(snapshotSite(snap, 20)).toEqual({ kind: 'stump', fallsNearby: null, center: null })
  })
  it('a mapped site with no reports nearby keeps its zero', () => {
    expect(snapshotSite({ ...snap, fl: [0, 0, 1] }, 10)!.fallsNearby).toBe(0)
  })
  it('absent from the snapshot, or no snapshot yet: null', () => {
    expect(snapshotSite(snap, 99)).toBeNull()
    expect(snapshotSite(null, 10)).toBeNull()
  })
})

describe('speciesRank — the published string verbatim, recorded tree species only', () => {
  const species = [
    { name: 'Platanus x hispanica :: Sycamore: London Plane', rank: 1 },
    { name: 'Lophostemon confertus :: Brisbane Box', rank: 2 },
  ] as SpeciesAggregate[]
  it('ranks an exact match', () => {
    expect(speciesRank(species, 'Lophostemon confertus :: Brisbane Box', 'tree')).toBe(2)
  })
  it('never folds case or spacing', () => {
    expect(speciesRank(species, 'lophostemon confertus :: Brisbane Box', 'tree')).toBeNull()
  })
  it('no rank for a non-tree or a missing string', () => {
    expect(speciesRank(species, 'Lophostemon confertus :: Brisbane Box', 'stump')).toBeNull()
    expect(speciesRank(species, null, 'tree')).toBeNull()
  })
})

describe('nearby fall reports on the card follow the snapshot point', () => {
  const snap: Pick<TreesSnapshot, 'id' | 'kind' | 'fl' | 'x' | 'y'> = {
    id: [10, 20], kind: [0, 0], fl: [0, 0], x: [58094, -1], y: [78896, -1],
  }
  const row = (id: number) => ({ treeid: String(id), species: 'Ginkgo biloba :: Maidenhair Tree' })
  const model = (id: number) =>
    buildCardModel(row(id), [], { fallsNearby: snapshotSite(snap, id)!.fallsNearby, rank: null, ranked: 639 }, 2026)
  it('a site with no map point: no falls line at all, never "No fall reports"', () => {
    expect(model(20).falls).toBeNull()
  })
  it('a mapped site with zero: the "No fall reports" line', () => {
    expect(model(10).falls).toBe('No fall reports within 30 meters since 2021.')
  })
})

describe('the live reads\' $where — pinned', () => {
  it('inventory: treeid is a NUMBER, so the id is unquoted', () => {
    expect(inventoryWhere(123)).toBe('treeid = 123')
    expect(inventoryWhere(4155)).not.toMatch(/['"]/)
  })
  it('notices: treeid is TEXT in two spellings, both quoted', () => {
    expect(noticesWhere(123)).toBe("treeid in('123','TRE-123')")
  })
})

describe('readBelongsTo — a held read is this site\'s only when issued for it', () => {
  const settled = (forId: number, attempt = 0, rows = [] as SettledRead['rows']): SettledRead =>
    ({ forId, attempt, rows, notices: [], error: null })
  it('nothing settled yet: not this site\'s (loading)', () => {
    expect(readBelongsTo(10, 0, null)).toBe(false)
  })
  it('the previous site\'s EMPTY result is never this site\'s (no flash of "left" or "unknown")', () => {
    expect(readBelongsTo(10, 0, settled(20))).toBe(false)
  })
  it('the previous site\'s row is never this site\'s', () => {
    expect(readBelongsTo(10, 0, settled(20, 0, [{ treeid: '20' }]))).toBe(false)
  })
  it('a read from before a Retry is not the retried read', () => {
    expect(readBelongsTo(10, 1, settled(10, 0))).toBe(false)
  })
  it('issued for this site and attempt: it belongs, empty or not', () => {
    expect(readBelongsTo(10, 0, settled(10))).toBe(true)
    expect(readBelongsTo(10, 2, settled(10, 2, [{ treeid: '10' }]))).toBe(true)
  })
  it('rowsForSite keeps only rows and notices that name the site', () => {
    const s: SettledRead = {
      forId: 10, attempt: 0, error: null,
      rows: [{ treeid: '11' }, { treeid: '10' }],
      notices: [{ treeid: 'TRE-10' }, { treeid: '10' }, { treeid: 'TRE-100' }],
    }
    const out = rowsForSite(10, s)
    expect(out.row).toEqual({ treeid: '10' })
    expect(out.notices.map((n) => n.treeid)).toEqual(['TRE-10', '10'])
  })
})
