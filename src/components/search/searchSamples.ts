// ZERO-IMPORT LEAF. The sample pills under the Home search box.
//
// Every entry is a PROMISE the box makes to a reader: "type this and you land
// there". searchSamples.test.ts runs each `query` through the real composed
// index (buildFullIndex) with the hook's exact filter predicate and asserts
// the FIRST row is `expect`. That test is the whole defense against the PR #9
// failure — a placeholder advertising six queries the index could not answer,
// which is why the old ribbon was hidden. A pill that stops resolving fails
// the build; it never silently lies on the page.
//
// `label` is the pill text; `query` is what tapping it types into the box.
// Tapping FILLS and RUNS the search — it never navigates on its own (Jesse's
// ruling): the reader sees the rows and chooses. No donor pill on purpose:
// donor rows are live typeahead results and cannot be pinned offline; the
// placeholder text mentions donors instead.
export interface SearchSample {
  label: string
  query: string
  expect: { path: string; params?: Record<string, string> }
}

export const SEARCH_SAMPLES: readonly SearchSample[] = [
  { label: 'Tenderloin', query: 'Tenderloin', expect: { path: '/neighborhood', params: { nh: 'Tenderloin' } } },
  {
    label: 'Car break-ins',
    query: 'Car break-ins',
    expect: {
      path: '/crime-incidents',
      // Both of SFPD's live vehicle-break-in strings (the authored merge).
      params: { sub: 'Larceny%20Theft%7CLarceny%20-%20From%20Vehicle,Larceny%20Theft%7CTheft%20From%20Vehicle' },
    },
  },
  {
    label: 'Shoplifting',
    query: 'Shoplifting',
    expect: { path: '/crime-incidents', params: { sub: 'Larceny%20Theft%7CLarceny%20Theft%20-%20Shoplifting' } },
  },
  {
    label: 'Home burglaries',
    query: 'Home burglaries',
    expect: { path: '/crime-incidents', params: { sub: 'Burglary%7CBurglary%20-%20Residential' } },
  },
  { label: 'Evictions', query: 'Evictions', expect: { path: '/housing' } },
  { label: 'Parking', query: 'Parking', expect: { path: '/parking-revenue' } },
  { label: 'Response times', query: 'Response times', expect: { path: '/emergency-response' } },
  { label: 'Crashes', query: 'Crashes', expect: { path: '/traffic-safety' } },
  { label: 'Graffiti', query: 'Graffiti', expect: { path: '/311-cases' } },
  {
    label: 'Encampments',
    query: 'Encampments',
    expect: {
      path: '/311-cases',
      params: { categories: 'Parking%20Enforcement,Abandoned%20Vehicle,Encampments,Encampment,Blocked%20Street%20or%20SideWalk' },
    },
  },
  { label: 'Budget', query: 'Budget', expect: { path: '/city-budget' } },
  { label: 'Elections', query: 'Elections', expect: { path: '/elections' } },
  { label: 'Oakland', query: 'Oakland', expect: { path: '/oakland' } },
]
