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

  it('oakland index: 2 LIVE view rows + 59 beat places landing on the crime view + 2 live-claimed datasets', () => {
    const oak = buildSearchIndex('oakland')
    const byCat = (c: string) => oak.filter((r) => r.category === c)
    // Dormant entries (parking-citations, campaign-finance) get no view row —
    // their route is still the catch-all redirect Home.
    expect(byCat('view').map((r) => r.id)).toEqual(['view-crime-incidents', 'view-311-cases'])
    // No beat-profile view ships; beat rows land on the crime view with the
    // beat pre-selected (?neighborhood=07X), reader-labeled 'Beat 07X'.
    expect(byCat('place')).toHaveLength(59)
    expect(byCat('place')[0]).toMatchObject({
      label: 'Beat 01X', sublabel: 'Oakland police beat',
      path: '/oakland/crime-incidents', params: { neighborhood: '01X' },
    })
    // Dataset rows only from LIVE entries' omniDatasetKeys.
    expect(byCat('dataset').map((r) => r.id)).toEqual(['dataset-policeIncidents', 'dataset-cases311'])
    expect(oak).toHaveLength(63)
    for (const r of oak) expect(r.path.startsWith('/oakland'), r.id).toBe(true)
  })
})
