import type { CityConfig } from '../types'

export const oaklandCity: CityConfig = {
  id: 'oakland',
  name: 'Oakland', short: 'Oak.', abbrev: 'OAK',
  portal: { name: 'OakData', host: 'data.oaklandca.gov' },
  areas: {
    noun: 'police beat', nounPlural: 'police beats',
    geojsonPath: '/data/geo/oakland-beats.geojson',  // vendored in stage 2
    names: [], excluded: new Set(), count: 59,
  },
  camera: {
    // Provisional frame — visually tuned in stage 3 via ?debug=map.
    defaultView: { center: { lat: 37.8004, lng: -122.2712 }, zoom: 11.6, pitch: 48, bearing: 0 },
    slots: {},
  },
  census: null,      // beats have no tract crosswalk — ACS affordances hide
  datasets: {},      // filled in stage 2
  manifest: [],  // authored in stage 3 — Oakland's views, Oakland's copy
  redirects: [],
}
