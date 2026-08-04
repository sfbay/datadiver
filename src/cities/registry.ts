import type { CityId } from './routing'
import type { CityConfig, DatasetConfig } from './types'
import { sfCity } from './sf'
import { oaklandCity } from './oakland'

export const CITIES: Record<CityId, CityConfig> = { sf: sfCity, oakland: oaklandCity }
export function getCity(id: CityId): CityConfig { return CITIES[id] }

export function getDatasetConfig(cityId: CityId, key: string): DatasetConfig {
  const config = CITIES[cityId].datasets[key]
  if (!config) throw new Error(`Unknown dataset: ${key}`)  // same message as client.ts today
  return config
}
