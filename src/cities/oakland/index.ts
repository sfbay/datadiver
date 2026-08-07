import type { CityConfig } from '../types'
import { buildDatasets } from '../buildDatasets'
import { OAKLAND_BEATS } from './beats'
import { OAKLAND_BEAT_NAMES } from './beatNames'
import { OAKLAND_DATASETS_RAW } from './datasets'
import { OAKLAND_MANIFEST } from './manifest'

export const oaklandCity: CityConfig = {
  id: 'oakland',
  name: 'Oakland', short: 'Oak.', abbrev: 'OAK',
  portal: { name: 'OakData', host: 'data.oaklandca.gov' },
  areas: {
    noun: 'police beat', nounPlural: 'police beats',
    geojsonPath: '/data/geo/oakland-beats.geojson',
    // excluded stays empty: the config field has census semantics and no
    // Oakland consumer (census: null gates those surfaces off). ⌘K exclusion
    // is the separate searchExcluded field below.
    names: OAKLAND_BEATS, excluded: new Set(), count: 59,
    formatLabel: (name) => `Beat ${name}`,
    // Editorial labels (beatNames.ts). Unknown codes are the real
    // no-polygon buckets 77X/99X (~3.9% of crime rows) — they must read as
    // the administrative bucket they are, never as a place.
    displayName: (id) => OAKLAND_BEAT_NAMES[id] ?? 'Unmapped beat',
    // LKM1: 3 crime cases all-time (2005). PDT2: the Piedmont enclave —
    // OPD isn't its police force. A ⌘K row for either navigates a reader
    // to near-certain emptiness under a famous name.
    searchExcluded: new Set(['LKM1', 'PDT2']),
    placeDestination: { viewId: 'crime-incidents', param: 'neighborhood' },
  },
  camera: {
    // Provisional frame — visually tuned in stage 3 via ?debug=map.
    defaultView: { center: { lat: 37.8004, lng: -122.2712 }, zoom: 11.6, pitch: 48, bearing: 0 },
    slots: {},
  },
  census: null,      // beats have no tract crosswalk — ACS affordances hide
  datasets: buildDatasets('data.oaklandca.gov', OAKLAND_DATASETS_RAW),
  manifest: OAKLAND_MANIFEST,  // stage 3b: all four entries live
  redirects: [],
}
