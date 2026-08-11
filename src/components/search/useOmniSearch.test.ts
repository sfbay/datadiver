import { describe, it, expect } from 'vitest'
import { buildSearchIndex, buildCityRows, buildRegionRows, buildFullIndex } from './useOmniSearch'
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

  // The composed order IS the ranking: the hook's filter has no scoring and a
  // hard 8-row cap, so a section's position decides what a reader ever sees.
  // Pinned against buildFullIndex — the function the hook actually calls — so
  // a test rebuilding the concatenation itself can't keep passing while the
  // real order drifts.
  it('oakland full-index rank order is views → places → datasets → city → regions, region block contiguous', () => {
    const cats = buildFullIndex('oakland', 'crime-incidents').map((r) => r.category)
    expect(cats.lastIndexOf('view')).toBeLessThan(cats.indexOf('place'))
    expect(cats.lastIndexOf('place')).toBeLessThan(cats.indexOf('dataset'))
    expect(cats.lastIndexOf('dataset')).toBeLessThan(cats.indexOf('city'))
    expect(cats.lastIndexOf('city')).toBeLessThan(cats.indexOf('region'))
    // Contiguous: the block runs unbroken from its first index to the end.
    const first = cats.indexOf('region')
    expect(cats.slice(first).every((c) => c === 'region')).toBe(true)
    expect(cats.lastIndexOf('region')).toBe(cats.length - 1)
  })

  it('oakland index: 6 LIVE view rows + 57 beat places (named · coded) + 7 live-claimed datasets', () => {
    const oak = buildSearchIndex('oakland')
    const byCat = (c: string) => oak.filter((r) => r.category === c)
    // All six entries are live — each gets a view row.
    expect(byCat('view').map((r) => r.id)).toEqual([
      'view-home', 'view-crime-incidents', 'view-311-cases', 'view-parking-citations', 'view-campaign-finance',
      'view-demographics',
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
    // A beat row sets NO `code` — its label already carries the composed
    // 'name · code' form, and a second code span would double it.
    expect(places[0].code).toBeUndefined()
    // Dataset rows from every entry's omniDatasetKeys: crime 1 + 311 1 +
    // citations 1 + campaign-finance 4 (the read set) = 7.
    expect(byCat('dataset').map((r) => r.id)).toEqual([
      'dataset-policeIncidents', 'dataset-cases311', 'dataset-parkingCitations',
      'dataset-fppcSchA', 'dataset-fppcSchE', 'dataset-fppc496', 'dataset-fppc497',
    ])
    // Region rows are a SEPARATE builder — they rank below the city-switch
    // rows, which are concatenated after this index (see buildFullIndex).
    expect(byCat('region')).toHaveLength(0)
    // 6 views + 57 places + 7 datasets = 70.
    expect(oak).toHaveLength(70)
    for (const r of oak) expect(r.path.startsWith('/oakland'), r.id).toBe(true)
  })

  it('buildRegionRows: 10 regions + 131 neighborhood memberships, all landing on the explorer', () => {
    // 131 memberships over 129 unique names — the two Coliseum-edge
    // industrial areas each span CE and E and get a row per region (see the
    // spanning-names pin below).
    const regions = buildRegionRows('oakland')
    expect(regions).toHaveLength(141)
    expect(regions.every((r) => r.category === 'region')).toBe(true)
    expect(regions.filter((r) => r.icon === '🗺️')).toHaveLength(10)
    expect(regions.filter((r) => r.icon === '📍')).toHaveLength(131)
    for (const r of regions) {
      expect(r.path, r.id).toBe('/oakland/demographics')
      expect(r.params?.nh, r.id).toBeTruthy()
      expect(r.code, r.id).toBe(r.params!.nh)
    }
    expect(regions.find((r) => r.id === 'region-N')).toMatchObject({
      label: 'North Oakland', code: 'N', sublabel: 'Oakland demographic region',
    })
    // The 10 region rows lead, then the memberships.
    expect(regions.slice(0, 10).every((r) => r.icon === '🗺️')).toBe(true)
  })

  // The hook's filter is `label.includes(q) || sublabel.includes(q)`
  // (lowercased), then `.slice(0, 8)`. These pins replicate that predicate
  // against the REAL composed index (buildFullIndex — what the hook calls) so
  // the query behaviors the labels were DESIGNED for can't regress. `visible`
  // adds the cap, which is where ranking becomes a reader-visible fact.
  describe('oakland query behavior (filter-predicate pins)', () => {
    const oak = buildFullIndex('oakland', 'crime-incidents')
    const matches = (q: string) =>
      oak.filter(
        (r) =>
          r.label.toLowerCase().includes(q) || r.sublabel.toLowerCase().includes(q)
      )
    const visible = (q: string) => matches(q).slice(0, 8)

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

    // Oakland's demographic paint is REGIONAL, but a reader thinks in
    // neighborhoods. These pins are the promise that typing a familiar name
    // lands on the region that actually contains it (spec §A4).
    it('oakland: "rockridge" finds the neighborhood and lands on its region', () => {
      const hits = matches('rockridge').filter((r) => r.category === 'region')
      const rockridge = hits.find((r) => r.label === 'Rockridge')
      expect(rockridge).toBeDefined()
      expect(rockridge!.path).toBe('/oakland/demographics')
      expect(rockridge!.params).toEqual({ nh: 'N' })
      expect(rockridge!.code).toBe('N')
    })

    it('oakland: the two boundary-spanning names emit one row per region, not one arbitrary row', () => {
      const spanning = buildRegionRows('oakland').filter(
        (r) => r.label === 'Coliseum Industrial Complex',
      )
      expect(spanning.map((r) => r.params!.nh).sort()).toEqual(['CE', 'E'])
      expect(new Set(spanning.map((r) => r.id)).size).toBe(2) // ids must not collide
    })

    it('oakland: a region name finds its member neighborhoods', () => {
      const hits = matches('deep east').filter((r) => r.category === 'region')
      expect(hits.length).toBeGreaterThan(1)
      expect(hits.every((r) => r.params!.nh === 'E')).toBe(true)
    })

    // The two cap facts, on the two queries that actually demonstrate them.
    // Both are measured, not hypothetical: rank the regions any higher and
    // each of these regressions is what a reader gets.
    it("'oak' keeps every view row visible — 74 region matches must not eat the cap", () => {
      // 'oak' matches 4 views + 6 places + 5 datasets + 74 regions. Regions
      // first would fill all 8 slots with regions and hide the views entirely.
      const shown = visible('oak')
      expect(shown).toHaveLength(8)
      expect(shown.filter((r) => r.category === 'view').map((r) => r.id)).toEqual([
        'view-home', 'view-311-cases', 'view-parking-citations', 'view-demographics',
      ])
      expect(matches('oak').filter((r) => r.category === 'region').length).toBeGreaterThan(70)
    })

    it("'san' still surfaces the city-switch row (17 region matches rank below it)", () => {
      // Measured regression: with region rows inside buildSearchIndex, 'san'
      // put city-sf at position 20 on an Oakland route — off the cap entirely.
      const shown = visible('san')
      const cityRow = shown.find((r) => r.category === 'city')
      expect(cityRow?.id).toBe('city-sf')
      expect(shown.indexOf(cityRow!)).toBeLessThan(8)
      expect(matches('san').filter((r) => r.category === 'region').length).toBeGreaterThan(8)
    })

    it('sf emits no region rows — its neighborhoods are already its census spine', () => {
      expect(buildRegionRows('sf')).toEqual([])
      expect(buildFullIndex('sf', 'home').some((r) => r.category === 'region')).toBe(false)
    })
  })
})

describe('buildCityRows (⌘K city switching)', () => {
  it('one row per OTHER city, same-view path when live there', () => {
    expect(buildCityRows('sf', 'crime-incidents')).toEqual([
      expect.objectContaining({
        id: 'city-oakland',
        category: 'city',
        label: 'Switch to Oakland',
        path: '/oakland/crime-incidents',
      }),
    ])
  })
  it('falls back to the target home when the view is not live there', () => {
    expect(buildCityRows('sf', 'housing')[0].path).toBe('/oakland')
    expect(buildCityRows('oakland', 'campaign-finance')[0]).toMatchObject({
      id: 'city-sf',
      label: 'Switch to San Francisco',
      path: '/campaign-finance',
    })
  })
  it("matches the filter on 'oakland' and on 'switch'", () => {
    const rows = buildCityRows('sf', 'home')
    const q1 = 'oakland', q2 = 'switch'
    for (const q of [q1, q2]) {
      expect(rows.some((r) => r.label.toLowerCase().includes(q) || r.sublabel.toLowerCase().includes(q))).toBe(true)
    }
    // From Oakland, typing 'sf' must also match the city-sf row — neither
    // 'Switch to San Francisco' nor 'San Francisco civic data' alone
    // contains 'sf'; the sublabel's trailing abbrev is what closes the gap.
    const oakRows = buildCityRows('oakland', 'home')
    const q3 = 'sf'
    expect(oakRows.some((r) => r.id === 'city-sf' && (r.label.toLowerCase().includes(q3) || r.sublabel.toLowerCase().includes(q3)))).toBe(true)
  })
})
