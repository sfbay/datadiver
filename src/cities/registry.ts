import { viewPath, type CityId } from './routing'
import type { CityConfig, DatasetConfig } from './types'
import { sfCity } from './sf'
import { oaklandCity } from './oakland'
import { liveManifest } from './manifest'

export const CITIES: Record<CityId, CityConfig> = { sf: sfCity, oakland: oaklandCity }
export function getCity(id: CityId): CityConfig { return CITIES[id] }

export function getDatasetConfig(cityId: CityId, key: string): DatasetConfig {
  const config = CITIES[cityId].datasets[key]
  if (!config) throw new Error(`Unknown dataset: ${key}`)  // same message as client.ts today
  return config
}

/** Route-level liveness for a (city, view) identity. Used by useEraSeries
 *  and any non-React caller that can't read a manifest entry directly. */
export function isViewLive(cityId: CityId, viewId: string): boolean {
  return liveManifest(getCity(cityId).manifest).some((e) => e.viewId === viewId)
}

/** Can this city's census data be joined to its `areas` polygons?
 *
 *  TRUE only when the city's census spine IS its areas spine (SF: the 41
 *  Analysis Neighborhoods are both). A city that carries `census.regions`
 *  is a TWO-GEOGRAPHY city — Oakland's events live on 59 police beats while
 *  its ACS data lives on 10 planning regions — so every area-keyed census
 *  affordance (the underlay, its legend, the per-area census panel, the
 *  citywide-average comparison) would join region values onto beat polygons
 *  and render numbers for a geography the map is not painting.
 *
 *  This is the ONE predicate behind all of those surfaces. Never re-derive it
 *  inline as `city.census !== null` (that was the old gate, and it is the
 *  wrong question) or as `cityId === 'sf'` (that was the drifted copy in
 *  ParkingCitations). Region-based surfaces read `census.regions` directly. */
export function censusMatchesAreas(city: CityConfig): boolean {
  return city.census !== null && city.census.regions === undefined
}

/** The boundary asset for a city's COARSE CENSUS tier: its region polygons
 *  when it is a two-geography city, else its areas (SF's 41 Analysis
 *  Neighborhoods ARE both spines, so the two resolve to the same file and
 *  therefore the same cached FeatureCollection).
 *
 *  Lives here, beside censusMatchesAreas, rather than in useActiveCity:
 *  it is a pure CityConfig → string read with no React in it, and pure
 *  consumers (and the node-only test suite) must not have to pull
 *  react-router in to ask a config question. */
export function censusCoarseGeojsonPath(city: CityConfig): string {
  return city.census?.regions?.geojsonPath ?? city.areas.geojsonPath
}

/** Where a city switch lands: the same view when the target city has it
 *  live, else the target's home. The program-spec switch semantics —
 *  consumed by the shell CitySwitcher and the ⌘K city rows. */
export function crossCityPath(target: CityId, currentViewId: string): string {
  return isViewLive(target, currentViewId)
    ? viewPath(target, currentViewId)
    : viewPath(target, 'home')
}
