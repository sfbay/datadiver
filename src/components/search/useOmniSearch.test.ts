import { describe, it, expect } from 'vitest'
import { buildSearchIndex } from './useOmniSearch'
import { DATASETS } from '@/api/datasets'
import { sfCity } from '@/cities/sf'

// The place + dataset pins reproduce, element for element, what the retired
// module-eval SEARCH_INDEX + DATASET_ROUTES table emitted. View entries are a
// deliberate post-manifest ADDITION (visible-fixes PR): every manifest view
// gets a row, ranked first, so 'Elections' finds Elections.
describe('OmniSearch index (SF parity)', () => {
  const index = buildSearchIndex('sf')

  it('emits one view entry per manifest view, in manifest (nav) order, at correct paths', () => {
    const views = index.filter((r) => r.category === 'view')
    expect(views.map((v) => v.id)).toEqual(sfCity.manifest.map((e) => `view-${e.viewId}`))
    const elections = views.find((v) => v.id === 'view-elections')
    expect(elections?.label).toBe('Elections')
    expect(elections?.path).toBe('/elections')
    const home = views.find((v) => v.id === 'view-home')
    expect(home?.path).toBe('/')
  })

  it('neighborhood results carry the nh param the Neighborhood view reads', () => {
    const places = index.filter((r) => r.category === 'place')
    expect(places.length).toBe(41)
    for (const p of places) {
      expect(p.path).toBe('/neighborhood')
      expect(p.params?.nh, `${p.label} must use ?nh= (Neighborhood.tsx reads 'nh', not 'n')`).toBeTruthy()
      expect(p.sublabel).toBe('San Francisco neighborhood')
    }
  })

  it('emits exactly the 15 dataset entries the retired DATASET_ROUTES produced, same paths', () => {
    const expected: Record<string, string> = {
      'dataset-fireEMSDispatch': '/emergency-response',
      'dataset-policeIncidents': '/crime-incidents',
      'dataset-dispatch911Realtime': '/dispatch-911',
      'dataset-dispatch911Historical': '/dispatch-911',
      'dataset-cases311': '/311-cases',
      'dataset-parkingRevenue': '/parking-revenue',
      'dataset-parkingCitations': '/parking-citations',
      'dataset-trafficCrashes': '/traffic-safety',
      'dataset-businessLocations': '/business-activity',
      'dataset-campaignFinance': '/campaign-finance',
      'dataset-vendorPayments': '/city-budget',
      'dataset-budget': '/city-budget',
      'dataset-spendingRevenue': '/city-budget',
      'dataset-evictionNotices': '/housing',
      'dataset-buyoutAgreements': '/housing',
    }
    const datasets = index.filter((r) => r.category === 'dataset')
    expect(Object.fromEntries(datasets.map((d) => [d.id, d.path]))).toEqual(expected)
    expect(datasets).toHaveLength(15)
  })

  it('dataset results keep registry iteration order (result-ranking parity)', () => {
    const ids = index.filter((r) => r.category === 'dataset').map((r) => r.id)
    const expectedOrder = Object.keys(DATASETS)
      .filter((k) => ids.includes(`dataset-${k}`))
      .map((k) => `dataset-${k}`)
    expect(ids).toEqual(expectedOrder)
  })

  it('section order is views → places → datasets', () => {
    const cats = index.map((r) => r.category)
    expect(cats.lastIndexOf('view')).toBeLessThan(cats.indexOf('place'))
    expect(cats.lastIndexOf('place')).toBeLessThan(cats.indexOf('dataset'))
  })

  it('oakland index: 4 LIVE view rows + 57 beat places (named · coded) + 7 live-claimed datasets', () => {
    const oak = buildSearchIndex('oakland')
    const byCat = (c: string) => oak.filter((r) => r.category === c)
    // All four entries are live — each gets a view row.
    expect(byCat('view').map((r) => r.id)).toEqual([
      'view-home', 'view-crime-incidents', 'view-311-cases', 'view-parking-citations', 'view-campaign-finance',
    ])
    // 59 beats minus searchExcluded (LKM1, PDT2) = 57 place rows. Labels are
    // the composed editorial form; the sublabel keeps the literal word
    // 'beat' + the code so the legacy query shape 'beat 12y' still matches
    // (the filter is a label||sublabel substring test — no terms array).
    const places = byCat('place')
    expect(places).toHaveLength(57)
    expect(places[0]).toMatchObject({
      label: 'Jack London & Waterfront · 01X', sublabel: 'Police beat 01X',
      path: '/oakland/crime-incidents', params: { neighborhood: '01X' },
    })
    expect(places.some((p) => p.id === 'place-LKM1' || p.id === 'place-PDT2')).toBe(false)
    // Dataset rows from every entry's omniDatasetKeys: crime 1 + 311 1 +
    // citations 1 + campaign-finance 4 (the read set) = 7.
    expect(byCat('dataset').map((r) => r.id)).toEqual([
      'dataset-policeIncidents', 'dataset-cases311', 'dataset-parkingCitations',
      'dataset-fppcSchA', 'dataset-fppcSchE', 'dataset-fppc496', 'dataset-fppc497',
    ])
    expect(oak).toHaveLength(69)
    for (const r of oak) expect(r.path.startsWith('/oakland'), r.id).toBe(true)
  })

  // The hook's filter is `label.includes(q) || sublabel.includes(q)`
  // (lowercased). These pins replicate that predicate against the index so
  // the query behaviors the labels were DESIGNED for can't regress.
  describe('oakland query behavior (filter-predicate pins)', () => {
    const oak = buildSearchIndex('oakland')
    const matches = (q: string) =>
      oak.filter(
        (r) =>
          r.label.toLowerCase().includes(q) || r.sublabel.toLowerCase().includes(q)
      )

    it("'beat 12y' still matches (via the sublabel)", () => {
      expect(matches('beat 12y').map((r) => r.id)).toContain('place-12Y')
    })

    it("bare '12y' matches (spec §A8's third query pin)", () => {
      expect(matches('12y').map((r) => r.id)).toContain('place-12Y')
    })

    it("'rockridge' finds both Rockridge beats", () => {
      const ids = matches('rockridge').map((r) => r.id)
      expect(ids).toContain('place-12Y')
      expect(ids).toContain('place-13X')
    })

    it("'fruitvale' resolves to 23X — the beat that actually owns Fruitvale", () => {
      const ids = matches('fruitvale').filter((r) => r.category === 'place').map((r) => r.id)
      expect(ids).toEqual(['place-23X'])
    })

    it("'lake merritt' offers no place row (LKM1 is searchExcluded)", () => {
      expect(matches('lake merritt').filter((r) => r.category === 'place')).toHaveLength(0)
    })
  })
})
