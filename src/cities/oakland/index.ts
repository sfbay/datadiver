import type { CityConfig } from '../types'
import { buildDatasets } from '../buildDatasets'
import { OAKLAND_BEATS } from './beats'
import { OAKLAND_BEAT_NAMES } from './beatNames'
import { OAKLAND_BEAT_VIEWS } from './beatViews'
import { OAKLAND_DATASETS_RAW } from './datasets'
import { OAKLAND_MANIFEST } from './manifest'
import { OAKLAND_REGION_NAMES } from './regionNames'
import { OAKLAND_REGION_MEMBERS } from './regionMembers'

export const oaklandCity: CityConfig = {
  id: 'oakland',
  name: 'Oakland', short: 'Oak.', abbrev: 'OAK',
  portal: { name: 'Oakland Open Data', host: 'data.oaklandca.gov' },
  areas: {
    noun: 'police beat', nounPlural: 'police beats',
    geojsonPath: '/data/geo/oakland-beats.geojson',
    // excluded is the CENSUS exclusion set — the units the Demographics
    // explorer drops as non-residential (SF's four park/military polygons).
    // Empty here, and correct: all 10 planning regions Oakland's ACS data
    // lives on are residential. It is NOT a beat list; the beats would be the
    // wrong geography to name (censusMatchesAreas is false — see the census
    // block below). ⌘K exclusion is the separate searchExcluded field below.
    names: OAKLAND_BEATS, excluded: new Set(), count: 59,
    // Editorial labels (beatNames.ts). Unknown codes are the real
    // no-polygon buckets 77X/99X (~3.4% of crime rows) — they must read as
    // the administrative bucket they are, never as a place.
    displayName: (id) => OAKLAND_BEAT_NAMES[id] ?? 'Unmapped beat',
    // LKM1: 3 crime cases all-time (2005). PDT2: the Piedmont enclave —
    // OPD isn't its police force. A ⌘K row for either navigates a reader
    // to near-certain emptiness under a famous name.
    searchExcluded: new Set(['LKM1', 'PDT2']),
    placeDestination: { viewId: 'crime-incidents', param: 'neighborhood' },
  },
  camera: {
    // Whole-city frame hand-tuned by Jesse 2026-08-07 via ?debug=map
    // (replaces the provisional stage-3 frame) — centers the full city
    // landmass rather than downtown.
    defaultView: { center: { lat: 37.7849, lng: -122.2133 }, zoom: 12.02, pitch: 48, bearing: 0 },
    slots: {},
    areaViews: OAKLAND_BEAT_VIEWS,
  },
  // Alameda County. `regions` marks Oakland a TWO-GEOGRAPHY city: events on
  // the 59 beats above, ACS on 10 planning regions dissolved from the city's
  // 131 official neighborhoods. Its presence is what makes
  // censusMatchesAreas() false, standing every area-keyed census affordance
  // down on the beat views — only region-based surfaces read this block.
  census: {
    stateFips: '06',
    countyFips: '001',
    regions: {
      geojsonPath: '/data/geo/oakland-regions.geojson',
      names: OAKLAND_REGION_NAMES,
      members: OAKLAND_REGION_MEMBERS,
    },
  },
  datasets: buildDatasets('data.oaklandca.gov', OAKLAND_DATASETS_RAW),
  manifest: OAKLAND_MANIFEST,  // stage 5a: all six entries live
  redirects: [],
}
