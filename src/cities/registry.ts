import type { CityId } from './routing'
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
