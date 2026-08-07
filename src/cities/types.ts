import type { CityId } from './routing'
import type { CameraView } from '@/utils/mapDefaults'
import type { ViewId, ViewManifestEntry } from './manifest'

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
  /** Socrata export extension when not the default .json (highInjuryNetwork serves GeoJSON) */
  ext?: 'geojson'
}

export type RawDatasetConfig = Omit<DatasetConfig, 'endpoint'>

export interface CityAreas {
  noun: string          // 'neighborhood' | 'police beat'
  nounPlural: string
  /** Same-origin vendored GeoJSON. Its join property is the CANONICAL
   *  `nhood` for every city — vendoring scripts normalize to it, so the
   *  ~70 `properties.nhood` reads across the app never need a parameter. */
  geojsonPath: string
  names: readonly string[]
  excluded: ReadonlySet<string>
  count: number
  /** Human display name for an area id. Omit = the id IS the name (SF).
   *  Oakland maps beat codes to the editorial labels in beatNames.ts;
   *  unknown codes (77X/99X — real no-polygon buckets) return
   *  'Unmapped beat'. Compose with the id via composeAreaLabel(). */
  displayName?: (id: string) => string
  /** Area ids ⌘K must NOT offer as destinations (Oakland: LKM1 — 3 crime
   *  cases ever, all 2005; PDT2 — the Piedmont enclave OPD doesn't police).
   *  Deliberately separate from `excluded`, which has census semantics and
   *  a non-empty SF value — overloading it would drop SF ⌘K places. */
  searchExcluded?: ReadonlySet<string>
  /** Where a ⌘K place row lands: viewPath(cityId, viewId) + ?param=<name>.
   *  SF: the Neighborhood profile view. Oakland ships no beat-profile
   *  surface, so beat rows land on the crime view with the beat selected
   *  (Jesse's scope call, stage-3 spec §5). */
  placeDestination: { viewId: ViewId; param: string }
}

export interface CityConfig {
  id: CityId
  name: string            // 'San Francisco'
  short: string           // 'S.F.'
  abbrev: string          // 'SF'
  portal: { name: string; host: string }
  areas: CityAreas
  camera: {
    defaultView: CameraView            // map mount fallback + filters-clear reset
    slots: Record<string, CameraView>  // named per-view overrides (sf: live, …)
  }
  /** null = city has no ACS pipeline; consumers HIDE census affordances. */
  census: { stateFips: string; countyFips: string } | null
  datasets: Record<string, DatasetConfig>  // endpoints derived by the registry
  /** Ordered view registration — array order IS nav order. Everything that
   *  used to be a per-view table (nav rows, Home cards, era sources, underlay
   *  presets, ⌘K routing, dateless flags) reads from here. */
  manifest: readonly ViewManifestEntry[]
  /** Legacy path slugs mounted as redirect <Route> rows. Every entry doubles
   *  as a skip-sync registration in useUrlSync — a redirect row WITHOUT one
   *  is the recurring clobber bug ([[react-router-redirect-clobber]]). */
  redirects: readonly { from: string; to: ViewId }[]
}
