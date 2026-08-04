import type { CityId } from './routing'
import type { CameraView } from '@/utils/mapDefaults'

export interface DatasetConfig {
  id: string
  name: string
  description: string
  endpoint: string
  category: 'public-safety' | 'transportation' | 'other' | 'housing'
  hasGeo: boolean
  geoField?: string
  defaultSort?: string
  cacheTTL?: number // ms, default 5 min
  dateField?: string
}

export type RawDatasetConfig = Omit<DatasetConfig, 'endpoint'>

export interface CityConfig {
  id: CityId
  name: string            // 'San Francisco'
  short: string           // 'S.F.'
  abbrev: string          // 'SF'
  portal: { name: string; host: string }
  areas: {
    noun: string          // 'neighborhood' | 'police beat'
    nounPlural: string
    /** Same-origin vendored GeoJSON. Its join property is the CANONICAL
     *  `nhood` for every city — vendoring scripts normalize to it, so the
     *  ~70 `properties.nhood` reads across the app never need a parameter. */
    geojsonPath: string
    names: readonly string[]
    excluded: ReadonlySet<string>
    count: number
  }
  camera: {
    defaultView: CameraView            // map mount fallback + filters-clear reset
    slots: Record<string, CameraView>  // named per-view overrides (sf: last48, …)
  }
  /** null = city has no ACS pipeline; consumers HIDE census affordances. */
  census: { stateFips: string; countyFips: string } | null
  datasets: Record<string, DatasetConfig>  // endpoints derived by the registry
}
