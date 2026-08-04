import type { CityConfig } from '../types'
import { buildDatasets } from '../buildDatasets'
import { SF_DATASETS_RAW } from './datasets'
import { SF_NEIGHBORHOODS, NON_RESIDENTIAL_NEIGHBORHOODS, LAST48_CAMERA } from '@/utils/geo'
import { SF_DEFAULT_VIEW } from '@/utils/mapDefaults'
import { SF_MANIFEST } from './manifest'

export const sfCity: CityConfig = {
  id: 'sf',
  name: 'San Francisco', short: 'S.F.', abbrev: 'SF',
  portal: { name: 'DataSF', host: 'data.sfgov.org' },
  areas: {
    noun: 'neighborhood', nounPlural: 'neighborhoods',
    geojsonPath: '/data/geo/sf-analysis-neighborhoods.geojson',
    names: SF_NEIGHBORHOODS, excluded: NON_RESIDENTIAL_NEIGHBORHOODS, count: 41,
  },
  camera: {
    defaultView: SF_DEFAULT_VIEW,
    slots: {
      live: { center: LAST48_CAMERA.center, zoom: LAST48_CAMERA.zoom, pitch: LAST48_CAMERA.pitch, bearing: LAST48_CAMERA.bearing },
    },
  },
  census: { stateFips: '06', countyFips: '075' },
  datasets: buildDatasets('data.sfgov.org', SF_DATASETS_RAW),
  manifest: SF_MANIFEST,
  redirects: [{ from: 'live-feeds', to: 'live' }],
}
