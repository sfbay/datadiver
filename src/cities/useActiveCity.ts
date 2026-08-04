import { useLocation } from 'react-router-dom'
import { parseRoute, type RouteIdentity } from './routing'
import { getCity } from './registry'
import type { CityConfig } from './types'
import type { ViewManifestEntry } from './manifest'

export function useRouteView(): RouteIdentity {
  return parseRoute(useLocation().pathname)
}
export function useActiveCity(): CityConfig {
  return getCity(useRouteView().cityId)
}
/** The active city's manifest entry for the current route's view — undefined
 *  for redirect slugs, junk URLs, and views the city doesn't register. */
export function useViewEntry(): ViewManifestEntry | undefined {
  const { cityId, viewId } = useRouteView()
  return getCity(cityId).manifest.find((e) => e.viewId === viewId)
}
