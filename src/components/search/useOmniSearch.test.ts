import { describe, it, expect } from 'vitest'
import { buildSearchIndex, buildCityRows, buildRegionRows, buildFullIndex, buildFunderRows, buildTopicRows, type SearchResult } from './useOmniSearch'
import { DATASETS } from '@/api/datasets'
import { sfCity } from '@/cities/sf'

// Type-level pin (spec §3.2 / §4 "Entry points"): 'funder' must be a valid
// SearchCategory so a ⌘K funder row's SearchResult literal compiles. This
// assertion has no runtime behavior — its only job is to fail `tsc -b` if
// 'funder' is ever removed from the SearchCategory union.
const _funderRowShape: SearchResult = {
  id: 'funder:michael|moritz',
  category: 'funder',
  label: 'Michael Moritz',
  sublabel: 'San francisco · $6.1M · 30 gifts',
  icon: '◎',
  path: '/campaign-finance',
  params: { funder: 'michael|moritz' },
}
void _funderRowShape

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

// Topic rows (SF only) + the SF rank order — added with the Home search box.
// The Oakland pins above are untouched: Oakland emits no topic rows.
describe('buildTopicRows + SF full-index order (Home search)', () => {
  const sf = buildFullIndex('sf', 'home')
  const matches = (q: string) =>
    sf.filter((r) => r.label.toLowerCase().includes(q) || r.sublabel.toLowerCase().includes(q))
  const visible = (q: string) => matches(q).slice(0, 8)

  it('sf full-index rank order is views → places → datasets → topic → city, topic block contiguous', () => {
    const cats = sf.map((r) => r.category)
    expect(cats.lastIndexOf('view')).toBeLessThan(cats.indexOf('place'))
    expect(cats.lastIndexOf('place')).toBeLessThan(cats.indexOf('dataset'))
    expect(cats.lastIndexOf('dataset')).toBeLessThan(cats.indexOf('topic'))
    expect(cats.lastIndexOf('topic')).toBeLessThan(cats.indexOf('city'))
    const first = cats.indexOf('topic')
    const last = cats.lastIndexOf('topic')
    expect(cats.slice(first, last + 1).every((c) => c === 'topic')).toBe(true)
  })

  it('sf: 21 topic rows — 15 subcategory (?sub=) + 6 quick-group (?categories=); no generic words in sublabels', () => {
    const topics = buildTopicRows('sf')
    expect(topics).toHaveLength(21)
    expect(topics.every((r) => r.category === 'topic' && r.icon === '🏷')).toBe(true)
    expect(topics.filter((r) => r.params?.sub)).toHaveLength(15)
    expect(topics.filter((r) => r.params?.categories)).toHaveLength(6)
    // 'crime' and 'report' are the words a one-word query spends the cap on.
    for (const r of topics) {
      const sub = r.sublabel.toLowerCase()
      expect(sub.includes('crime'), r.id).toBe(false)
      expect(sub.includes('report'), r.id).toBe(false)
    }
    // Ids are unique (React keys).
    expect(new Set(topics.map((r) => r.id)).size).toBe(21)
    // The subcategory rows lead, then crime groups, then 311 groups.
    expect(topics.slice(0, 15).every((r) => r.id.startsWith('topic-sub-'))).toBe(true)
    expect(topics.slice(15, 18).map((r) => r.id)).toEqual([
      'topic-crime-violent', 'topic-crime-property', 'topic-crime-quality-of-life',
    ])
    expect(topics.slice(18).map((r) => r.id)).toEqual([
      'topic-311-quality-of-life', 'topic-311-infrastructure', 'topic-311-enforcement',
    ])
  })

  it('subcategory rows carry the PAIR key via formatSubParam, merge folded in; enforcement is labelled', () => {
    const topics = buildTopicRows('sf')
    expect(topics.find((r) => r.id === 'topic-sub-Larceny Theft|Larceny - From Vehicle')).toMatchObject({
      label: 'Car break-ins',
      sublabel: 'SFPD subcategory',
      path: '/crime-incidents',
      params: { sub: 'Larceny%20Theft%7CLarceny%20-%20From%20Vehicle,Larceny%20Theft%7CTheft%20From%20Vehicle' },
    })
    expect(topics.find((r) => r.id === 'topic-sub-Drug Offense|Drug Violation')).toMatchObject({
      label: 'Drug enforcement',
      sublabel: 'Officer-initiated · SFPD subcategory',
      params: { sub: 'Drug%20Offense%7CDrug%20Violation' },
    })
    // No admin pair gets a row.
    expect(topics.some((r) => r.id.includes('Other Offenses'))).toBe(false)
  })

  it('quick-group rows encode ?categories= the way CrimeIncidents / Cases311 parse it', () => {
    const topics = buildTopicRows('sf')
    const violent = topics.find((r) => r.id === 'topic-crime-violent')!
    expect(violent.path).toBe('/crime-incidents')
    expect(violent.params!.categories.split(',').map(decodeURIComponent)).toEqual([
      'Assault', 'Robbery', 'Homicide', 'Weapons Carrying Etc', 'Weapons Offence', 'Rape', 'Sex Offense',
    ])
    const enforcement = topics.find((r) => r.id === 'topic-311-enforcement')!
    expect(enforcement).toMatchObject({ label: 'Encampments & abandoned vehicles', sublabel: '311 requests · Enforcement', path: '/311-cases' })
    expect(enforcement.params!.categories.split(',').map(decodeURIComponent)).toEqual([
      'Parking Enforcement', 'Abandoned Vehicle', 'Encampments', 'Encampment', 'Blocked Street or SideWalk',
    ])
  })

  it('oakland emits no topic rows', () => {
    expect(buildTopicRows('oakland')).toEqual([])
    expect(buildFullIndex('oakland', 'crime-incidents').some((r) => r.category === 'topic')).toBe(false)
  })

  // Cap pin: the two rows 'crime' lands on today must not move. Topic rows
  // ('Violent crime', 'Property crime') rank below both.
  it("'crime' still shows view-crime-incidents FIRST and dataset-policeIncidents SECOND", () => {
    const shown = visible('crime')
    expect(shown[0].id).toBe('view-crime-incidents')
    expect(shown[1].id).toBe('dataset-policeIncidents')
  })

  it("'tenderloin' → place-Tenderloin first", () => {
    expect(visible('tenderloin')[0].id).toBe('place-Tenderloin')
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

// buildFunderRows is the pure mapper from useFunderTypeahead's raw typeahead
// rows (spec §3 `typeahead` builder projection) to ⌘K SearchResults (spec
// §3.2, §4 "Entry points"). Pure + node-safe — no hook involved.
describe('buildFunderRows (⌘K funder rows, pure row builder)', () => {
  it('maps a person row', () => {
    const rows = buildFunderRows([
      {
        transaction_first_name: 'Michael',
        transaction_last_name: 'Moritz',
        city: 'San Francisco',
        gifts: '30',
        total: '6146992',
      },
    ])
    expect(rows).toEqual([
      {
        id: 'funder:MICHAEL|MORITZ',
        category: 'funder',
        label: 'Michael Moritz',
        sublabel: 'San Francisco · $6.1M · 30 gifts',
        icon: '◎',
        path: '/campaign-finance',
        params: { funder: 'michael|moritz' },
      },
    ])
  })

  it('maps an org row (non-IND entity_code, no first name)', () => {
    const rows = buildFunderRows([
      {
        transaction_last_name: 'Neighbors For A Better San Francisco',
        entity_code: 'COM',
        city: 'San Francisco',
        gifts: '412',
        total: '1200000',
      },
    ])
    expect(rows).toEqual([
      {
        id: 'funder:|NEIGHBORS FOR A BETTER SAN FRANCISCO',
        category: 'funder',
        label: 'Neighbors For A Better San Francisco',
        sublabel: 'San Francisco · $1.2M · 412 gifts',
        icon: '◎',
        path: '/campaign-finance',
        params: { funder: '|neighbors for a better san francisco' },
      },
    ])
  })

  // The typeahead's GROUP BY is case-sensitive: 'DANIEL LURIE' and 'Daniel
  // Lurie' arrive as two groups. The funder card the row lands on merges them
  // by folded key, so the row must show the card's number, not the first
  // group's — sum, and still emit ONE row (ids are React keys).
  it('sums gifts and totals across rows sharing a funderKey; one row per key', () => {
    const rows = buildFunderRows([
      { transaction_first_name: 'DANIEL', transaction_last_name: 'LURIE', city: 'SAN FRANCISCO', gifts: '31', total: '8660000' },
      { transaction_first_name: 'Daniel', transaction_last_name: 'Lurie', city: 'San Francisco', gifts: '34', total: '2040000' },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('funder:DANIEL|LURIE')
    expect(rows[0].sublabel).toBe('San Francisco · $10.7M · 65 gifts')
    expect(rows[0].params).toEqual({ funder: 'daniel|lurie' })
  })

  it('keeps first-appearance order across interleaved keys', () => {
    const rows = buildFunderRows([
      { transaction_first_name: 'A', transaction_last_name: 'ONE', gifts: '1', total: '10' },
      { transaction_first_name: 'B', transaction_last_name: 'TWO', gifts: '2', total: '20' },
      { transaction_first_name: 'a', transaction_last_name: 'one', gifts: '3', total: '30' },
    ])
    expect(rows.map((r) => r.id)).toEqual(['funder:A|ONE', 'funder:B|TWO'])
    expect(rows[0].sublabel).toBe('$40 · 4 gifts')
  })

  it('singularizes "1 gift" and omits city when absent', () => {
    const rows = buildFunderRows([
      { transaction_first_name: 'Jane', transaction_last_name: 'Doe', gifts: '1', total: '500' },
    ])
    expect(rows[0].sublabel).toBe('$500 · 1 gift')
  })
})
