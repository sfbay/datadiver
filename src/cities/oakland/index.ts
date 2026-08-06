import type { CityConfig } from '../types'
import { buildDatasets } from '../buildDatasets'
import { OAKLAND_BEATS } from './beats'
import { OAKLAND_DATASETS_RAW } from './datasets'
import { OAKLAND_MANIFEST } from './manifest'

export const oaklandCity: CityConfig = {
  id: 'oakland',
  name: 'Oakland', short: 'Oak.', abbrev: 'OAK',
  portal: { name: 'OakData', host: 'data.oaklandca.gov' },
  areas: {
    noun: 'police beat', nounPlural: 'police beats',
    geojsonPath: '/data/geo/oakland-beats.geojson',
    // excluded stays empty: the config field has no consumers yet
    // (exclusion logic still imports the SF constants directly), and
    // census: null gates off the surfaces that would care; whether
    // LKM1/PDT2 join it is a stage-3 editorial call.
    names: OAKLAND_BEATS, excluded: new Set(), count: 59,
    formatLabel: (name) => `Beat ${name}`,
    placeDestination: { viewId: 'crime-incidents', param: 'neighborhood' },
  },
  camera: {
    // Provisional frame — visually tuned in stage 3 via ?debug=map.
    defaultView: { center: { lat: 37.8004, lng: -122.2712 }, zoom: 11.6, pitch: 48, bearing: 0 },
    slots: {},
  },
  census: null,      // beats have no tract crosswalk — ACS affordances hide
  datasets: buildDatasets('data.oaklandca.gov', OAKLAND_DATASETS_RAW),
  manifest: OAKLAND_MANIFEST,  // stage 3: crime-incidents + 311-cases live, 2 still dormant
  redirects: [],
}
