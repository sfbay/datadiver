import { useLocation } from 'react-router-dom'
import { parseRoute, routeChrome, type RouteIdentity, type RouteChrome } from './routing'
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
/** 'none' on chrome-less routes (the immersive Last 48). */
export function useRouteChrome(): RouteChrome {
  return routeChrome(useLocation().pathname)
}
